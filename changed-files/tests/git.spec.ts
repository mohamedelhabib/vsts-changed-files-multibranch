import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";

import { getCommitChangedFiles, getCommitsChangedFiles, listChangedFilesBetweenBranches } from "../lib/git-diff";

/*
 * L3 - integration tests against REAL git repositories created in a temp dir.
 * No network: remotes are local file:// clones.
 * Tests tagged "CHARACTERIZATION Bx" lock the CURRENT (buggy) behavior.
 */

const roots: string[] = [];

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
    git(os.tmpdir(), "clone", "-q", ...extra, "--branch", branch, `file://${origin}`, dir);
    return dir;
}

beforeAll(() => {
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    // task-lib echoes "[command]..." on stdout; keep test output readable
    jest.spyOn(process.stdout, "write").mockImplementation(() => true);
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

    test("Should_ListMergedFiles_When_MergeCommit", () => {
        const repo = newRepo();
        commit(repo, "base", ["a.txt"]);
        git(repo, "checkout", "-q", "-b", "topic");
        commit(repo, "t1", ["src/topic.ts"]);
        git(repo, "checkout", "-q", "master");
        commit(repo, "m1", ["src/main.ts"]);
        git(repo, "merge", "-q", "--no-ff", "-m", "merge topic", "topic");
        const merge = git(repo, "rev-parse", "HEAD");

        expect(getCommitChangedFiles(merge, { cwd: repo })).toContain("src/topic.ts");
    });

    test("Should_ListDeletedAndRenamedPaths_When_CommitDeletesAndRenames", () => {
        const repo = newRepo();
        commit(repo, "c1", ["old/name.ts", "gone.ts"]);
        fs.mkdirSync(path.join(repo, "new"));
        git(repo, "mv", "old/name.ts", "new/name.ts");
        git(repo, "rm", "-q", "gone.ts");
        git(repo, "commit", "-q", "-m", "mv+rm");
        const sha = git(repo, "rev-parse", "HEAD");

        const files = getCommitChangedFiles(sha, { cwd: repo });
        expect(files).toContain("gone.ts");
        expect(files).toContain("new/name.ts");
    });

    test("Should_ReturnPathWithSpaces_When_FileNameHasSpaces", () => {
        const repo = newRepo();
        commit(repo, "c1", ["a.txt"]);
        const sha = commit(repo, "c2", ["my dir/my file.ts"]);

        expect(getCommitChangedFiles(sha, { cwd: repo })).toEqual(["my dir/my file.ts"]);
    });

    test("CHARACTERIZATION: Should_ReturnQuotedPath_When_NonAsciiFileName", () => {
        const repo = newRepo();
        commit(repo, "c1", ["a.txt"]);
        const sha = commit(repo, "c2", ["src/café.ts"]);

        // git core.quotePath=true (default) escapes non-ASCII -> globs like src/** will not match
        expect(getCommitChangedFiles(sha, { cwd: repo })).toEqual(['"src/caf\\303\\251.ts"']);
    });

    test("CHARACTERIZATION B1: Should_ReturnEmptySilently_When_CommitUnknown", () => {
        const repo = newRepo();
        commit(repo, "c1", ["a.txt"]);

        expect(getCommitChangedFiles("0123456789abcdef0123456789abcdef01234567", { cwd: repo })).toEqual([]);
    });

    test("Should_FlattenAllCommits_When_SeveralCommitIds", () => {
        const repo = newRepo();
        commit(repo, "c0", ["z.txt"]);
        const c1 = commit(repo, "c1", ["a.ts"]);
        const c2 = commit(repo, "c2", ["b.ts"]);

        expect(getCommitsChangedFiles([c1, c2], { cwd: repo }).sort()).toEqual(["a.ts", "b.ts"]);
    });
});

describe("listChangedFilesBetweenBranches (real git)", () => {

    test("Should_ListOnlyFeatureFiles_When_FullCloneOfFeatureBranch", () => {
        const clone = cloneAt(originWithFeature(), "feature");

        expect(listChangedFilesBetweenBranches("origin/master", { cwd: clone }).sort())
            .toEqual(["docs/feature.md", "src/feature.ts"]);
    });

    test("Should_ReturnEmpty_When_OnReferenceBranchItself", () => {
        const clone = cloneAt(originWithFeature(), "master");

        expect(listChangedFilesBetweenBranches("origin/master", { cwd: clone })).toEqual([]);
    });

    test("CHARACTERIZATION B1: Should_ReturnEmptySilently_When_RefBranchMissingInShallowSingleBranchClone", () => {
        const clone = cloneAt(originWithFeature(), "feature", ["--depth", "1", "--single-branch"]);

        expect(listChangedFilesBetweenBranches("origin/master", { cwd: clone })).toEqual([]);
    });

    test("CHARACTERIZATION B1: Should_ReturnEmptySilently_When_NoMergeBaseInShallowClone", () => {
        const clone = cloneAt(originWithFeature(), "feature", ["--depth", "1", "--no-single-branch"]);

        expect(listChangedFilesBetweenBranches("origin/master", { cwd: clone })).toEqual([]);
    });
});
