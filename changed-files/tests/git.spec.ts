import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";
import { pathToFileURL } from "url";

import { GitCommandError, getCommitChangedFiles, getCommitsChangedFiles, listChangedFilesBetweenBranches } from "../lib/git-diff";

/*
 * Integration tests against REAL git repositories created in temporary directories.
 * No network: remotes use local file:// URLs.
 */

const roots: string[] = [];
const capturedStdoutChunks: string[] = [];

function git(cwd: string, ...args: string[]): string {
    return execFileSync("git", args, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function write(cwd: string, file: string, content = file): void {
    const full = path.join(cwd, file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
}

function commit(cwd: string, message: string, files: string[]): string {
    files.forEach(f => write(cwd, f, `${f}-${message}`));
    git(cwd, "add", "--all");
    git(cwd, "commit", "-q", "-m", message);
    return git(cwd, "rev-parse", "HEAD");
}

function newRepo(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cf-git-"));
    roots.push(dir);
    git(dir, "init", "-q", "-b", "master");
    git(dir, "config", "user.email", "test@example.com");
    git(dir, "config", "user.name", "test");
    git(dir, "config", "commit.gpgsign", "false");
    return dir;
}

/** origin repo: master(base) -> feature(f1, f2), master moves on after branching (m1). */
function originWithFeature(): string {
    const origin = newRepo();
    commit(origin, "base", ["README.md", "src/app.ts"]);
    git(origin, "checkout", "-q", "-b", "feature");
    commit(origin, "f1", ["src/feature.ts"]);
    commit(origin, "f2", ["docs/feature.md"]);
    git(origin, "checkout", "-q", "master");
    commit(origin, "m1", ["src/master-only.ts"]);
    return origin;
}

function cloneAt(origin: string, branch: string, extra: string[] = []): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cf-clone-"));
    roots.push(dir);
    git(os.tmpdir(), "clone", "-q", ...extra, "--branch", branch, pathToFileURL(origin).href, dir);
    return dir;
}

beforeAll(() => {
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    jest.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array): boolean => {
        capturedStdoutChunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf-8"));
        return true;
    });
});

beforeEach(() => {
    capturedStdoutChunks.length = 0;
});

afterAll(() => {
    jest.restoreAllMocks();
    roots.forEach(r => fs.rmSync(r, { recursive: true, force: true }));
});

describe("getCommitChangedFiles (real git)", () => {

    test("Should_ListFiles_When_RegularCommit", () => {
        const repo = newRepo();
        commit(repo, "c1", ["a.txt"]);
        const sha = commit(repo, "c2", ["src/x.ts", "src/y.ts"]);

        expect(getCommitChangedFiles(sha, { cwd: repo }).sort()).toEqual(["src/x.ts", "src/y.ts"]);
    });

    test("Should_ListOnlyTopicFilesAndExcludeSecondParentLeakage_When_MergeCommit", () => {
        const repo = newRepo();
        commit(repo, "base", ["a.txt"]);
        git(repo, "checkout", "-q", "-b", "topic");
        commit(repo, "t1", ["src/topic.ts"]);
        git(repo, "checkout", "-q", "master");
        commit(repo, "m1", ["src/main.ts"]);
        git(repo, "merge", "-q", "--no-ff", "-m", "merge topic", "topic");
        const merge = git(repo, "rev-parse", "HEAD");

        // Must list ONLY src/topic.ts (diff vs M^1 = master), never src/main.ts from M^2!
        expect(getCommitChangedFiles(merge, { cwd: repo })).toEqual(["src/topic.ts"]);
    });

    test("Should_ListBothOldAndNewPathsPlusDeletedFile_When_CommitDeletesAndRenames", () => {
        const repo = newRepo();
        commit(repo, "c1", ["old/name.ts", "gone.ts"]);
        fs.mkdirSync(path.join(repo, "new"));
        git(repo, "mv", "old/name.ts", "new/name.ts");
        git(repo, "rm", "-q", "gone.ts");
        git(repo, "commit", "-q", "-m", "mv+rm");
        const sha = git(repo, "rev-parse", "HEAD");

        // --no-renames ensures both old/name.ts and new/name.ts are reported
        expect(getCommitChangedFiles(sha, { cwd: repo }).sort()).toEqual(["gone.ts", "new/name.ts", "old/name.ts"]);
    });

    test("Should_PreserveInternalAndTrailingSpaces_When_FileNameHasSpaces", () => {
        const repo = newRepo();
        commit(repo, "c1", ["a.txt"]);
        const sha = commit(repo, "c2", ["my dir/my file.ts", " my-leading-and-trailing-space.ts "]);

        expect(getCommitChangedFiles(sha, { cwd: repo }).sort()).toEqual([
            " my-leading-and-trailing-space.ts ",
            "my dir/my file.ts",
        ]);
    });

    test("Should_ReturnVerbatimPath_When_NonAsciiFileName", () => {
        const repo = newRepo();
        commit(repo, "c1", ["a.txt"]);
        const sha = commit(repo, "c2", ["src/café.ts"]);

        expect(getCommitChangedFiles(sha, { cwd: repo })).toEqual(["src/café.ts"]);
    });

    test("Should_ReturnRelativePaths_When_CwdIsMonorepoSubdirectory", () => {
        const repo = newRepo();
        commit(repo, "c1", ["README.md"]);
        const sha = commit(repo, "c2", ["services/billing/src/index.ts", "services/auth/src/login.ts"]);

        const billingCwd = path.join(repo, "services", "billing");
        expect(getCommitChangedFiles(sha, { cwd: billingCwd })).toEqual(["src/index.ts"]);
    });

    test("Should_NeutralizeVsoCommandInjectionInStdout_When_MaliciousFileNameCommitted", () => {
        const repo = newRepo();
        commit(repo, "c1", ["a.txt"]);
        const maliciousFile = "sub/##vso[task.setvariable variable=Pwned;isOutput=true;]true";
        const sha = commit(repo, "c2", [maliciousFile]);

        const files = getCommitChangedFiles(sha, { cwd: repo });
        const stdoutText = capturedStdoutChunks.join("");

        expect(files).toEqual([maliciousFile]);
        expect(stdoutText).not.toContain("##vso[task.setvariable");
    });

    test("Should_ThrowGitCommandError_When_CommitIsGraftedInShallowClone", () => {
        const origin = newRepo();
        commit(origin, "c1", ["src/deleted.ts", "docs/readme.md"]);
        git(origin, "rm", "-q", "src/deleted.ts");
        git(origin, "commit", "-q", "-m", "delete src/deleted.ts");
        const deleteSha = git(origin, "rev-parse", "HEAD");

        const shallowClone = cloneAt(origin, "master", ["--depth", "1"]);
        expect(() => getCommitChangedFiles(deleteSha, { cwd: shallowClone })).toThrow(GitCommandError);
    });

    test("Should_RejectOptionInjection_When_CommitIdStartsWithDash", () => {
        const repo = newRepo();
        commit(repo, "c1", ["a.txt"]);
        const pwnTarget = path.join(repo, "injected.txt");

        expect(() => getCommitChangedFiles(`--output=${pwnTarget}`, { cwd: repo })).toThrow(GitCommandError);
        expect(fs.existsSync(pwnTarget)).toBe(false);
    });

    test("Should_ThrowGitCommandError_When_CommitUnknown", () => {
        const repo = newRepo();
        commit(repo, "c1", ["a.txt"]);

        expect(() => getCommitChangedFiles("0123456789abcdef0123456789abcdef01234567", { cwd: repo })).toThrow(GitCommandError);
    });

    test("Should_BatchAndDeduplicateCommits_When_SeveralCommitIds", () => {
        const repo = newRepo();
        commit(repo, "c0", ["z.txt"]);
        const c1 = commit(repo, "c1", ["a.ts", "shared.ts"]);
        const c2 = commit(repo, "c2", ["b.ts", "shared.ts"]);

        expect(getCommitsChangedFiles([c1, c2], { cwd: repo }).sort()).toEqual(["a.ts", "b.ts", "shared.ts"]);
    });
});

describe("listChangedFilesBetweenBranches (real git)", () => {

    test("Should_ListOnlyFeatureFiles_When_FullCloneOfFeatureBranch", () => {
        const clone = cloneAt(originWithFeature(), "feature");

        expect(listChangedFilesBetweenBranches("origin/master", { cwd: clone }).sort())
            .toEqual(["docs/feature.md", "src/feature.ts"]);
    });

    test("Should_ResolveBareAndHeadsRefBranchToOrigin_When_DetachedHeadAgentCheckout", () => {
        const origin = originWithFeature();
        const clone = cloneAt(origin, "feature");
        const headSha = git(clone, "rev-parse", "HEAD");
        // Simulate Azure Pipelines checkout: detached HEAD with no local `refs/heads/master` branch
        git(clone, "checkout", "-q", "--detach", headSha);
        git(clone, "branch", "-q", "-D", "feature");

        expect(listChangedFilesBetweenBranches("master", { cwd: clone }).sort())
            .toEqual(["docs/feature.md", "src/feature.ts"]);
        expect(listChangedFilesBetweenBranches("refs/heads/master", { cwd: clone }).sort())
            .toEqual(["docs/feature.md", "src/feature.ts"]);
    });

    test("Should_ReturnRelativePathsInBranchDiff_When_CwdIsMonorepoSubdirectory", () => {
        const origin = newRepo();
        commit(origin, "base", ["README.md"]);
        git(origin, "checkout", "-q", "-b", "feature");
        commit(origin, "f1", ["packages/ui/button.tsx", "packages/api/server.ts"]);
        const clone = cloneAt(origin, "feature");

        expect(listChangedFilesBetweenBranches("master", { cwd: path.join(clone, "packages", "ui") }))
            .toEqual(["button.tsx"]);
    });

    test("Should_RejectOptionInjection_When_RefBranchStartsWithDashOrRange", () => {
        const clone = cloneAt(originWithFeature(), "feature");
        const pwnTarget = path.join(clone, "pwn.diff");

        expect(() => listChangedFilesBetweenBranches(`--output=${pwnTarget}`, { cwd: clone })).toThrow(GitCommandError);
        expect(() => listChangedFilesBetweenBranches("-p", { cwd: clone })).toThrow(GitCommandError);
        expect(() => listChangedFilesBetweenBranches("origin/master..HEAD", { cwd: clone })).toThrow(GitCommandError);
        expect(fs.existsSync(pwnTarget)).toBe(false);
    });

    test("Should_ReturnEmpty_When_OnReferenceBranchItself", () => {
        const clone = cloneAt(originWithFeature(), "master");

        expect(listChangedFilesBetweenBranches("origin/master", { cwd: clone })).toEqual([]);
    });

    test("Should_ThrowGitCommandError_When_RefBranchMissingInShallowSingleBranchClone", () => {
        const clone = cloneAt(originWithFeature(), "feature", ["--depth", "1", "--single-branch"]);

        expect(() => listChangedFilesBetweenBranches("origin/master", { cwd: clone })).toThrow(GitCommandError);
    });

    test("Should_ThrowGitCommandError_When_NoMergeBaseInShallowClone", () => {
        const clone = cloneAt(originWithFeature(), "feature", ["--depth", "1", "--no-single-branch"]);

        expect(() => listChangedFilesBetweenBranches("origin/master", { cwd: clone })).toThrow(GitCommandError);
    });
});
