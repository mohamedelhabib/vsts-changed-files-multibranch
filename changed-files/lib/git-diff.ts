import * as fs from "fs";
import * as path from "path";
import * as tl from "azure-pipelines-task-lib/task";
import type { IExecSyncResult } from "azure-pipelines-task-lib/toolrunner";

import { toRemoteRef } from "./branch";
import { logVerbose, sanitizeVso } from "./util";

const SAFE_REF_REGEX = /^(?!-)(?!\/)(?!.*\/\/)(?!.*\.\.)(?!.*\.lock(?=$|\/))(?!.*[./]$)[A-Za-z0-9._/-]+$/;
const SAFE_COMMIT_REGEX = /^[A-Za-z0-9_]{1,64}$/;
const SENSITIVE_ENV_PREFIXES = ["ENDPOINT_AUTH_", "SECRET_"];
const SENSITIVE_ENV_KEYS = new Set(["SYSTEM_ACCESSTOKEN", "AZURE_DEVOPS_EXT_PAT", "AZDO_PAT"]);

export interface GitOptions {
    cwd?: string;
    verbose?: boolean;
}

/**
 * Raised when a git command exits with a non-zero code or fails validation (shallow clone, unknown ref, invalid arg).
 */
export class GitCommandError extends Error {
    constructor(public readonly args: string[], public readonly code: number, stderr: string) {
        const cleanStderr = sanitizeVso(stderr.trim());
        super(`git ${args.join(" ")} failed with exit code ${code}${cleanStderr ? `: ${cleanStderr}` : ""}`);
        this.name = "GitCommandError";
    }
}

/**
 * Lists files changed on HEAD since it diverged from `refBranch` (`git diff --relative --no-renames --name-only <remoteRef>...`).
 */
export function listChangedFilesBetweenBranches(refBranch: string, options: GitOptions = {}): string[] {
    const trimmed = refBranch.trim();
    if (!SAFE_REF_REGEX.test(trimmed)) {
        throw new GitCommandError(["diff"], 128, `Invalid reference branch "${trimmed}"`);
    }
    const remoteRef = toRemoteRef(trimmed);
    if (!SAFE_REF_REGEX.test(remoteRef)) {
        throw new GitCommandError(["diff"], 128, `Invalid resolved reference "${remoteRef}"`);
    }
    return listChangedFiles(["diff", "--relative", "--no-renames", "--name-only", "--end-of-options", `${remoteRef}...`, "--"], options);
}

/**
 * Lists unique files changed across all the given commits in a single batched `git log --no-walk` invocation.
 */
export function getCommitsChangedFiles(commitIds: string[], options: GitOptions = {}): string[] {
    if (commitIds.length === 0) {
        return [];
    }
    const validated = commitIds.map(validateCommitId);
    assertNotShallowGrafted(validated, options.cwd);

    if (validated.length === 1) {
        return listChangedFiles(
            ["log", "--first-parent", "-m", "-1", "--relative", "--no-renames", "--name-only", "--pretty=format:", "--end-of-options", validated[0], "--"],
            options
        );
    }

    const files = listChangedFiles(
        ["log", "--no-walk", "--first-parent", "-m", "--relative", "--no-renames", "--name-only", "--pretty=format:", "--end-of-options", ...validated, "--"],
        options
    );
    return Array.from(new Set(files));
}

/**
 * Lists files changed by one commit. `--first-parent -m` diffs merge commits strictly against their first parent (`M^1`),
 * avoiding false-positive leakage from `M^2` history on the target branch.
 */
export function getCommitChangedFiles(commitId: string, options: GitOptions = {}): string[] {
    return getCommitsChangedFiles([commitId], options);
}

/**
 * Runs a git command returning one path per line.
 * - `core.quotePath=false` keeps non-ASCII paths verbatim so they can be matched by glob rules.
 * - `externalOutput` neutralizes any `##vso[` markers printed from repository filenames/refs on stdout/stderr.
 *
 * @throws GitCommandError when git fails to start or exits with a non-zero code.
 */
export function listChangedFiles(args: string[], { cwd, verbose }: GitOptions = {}): string[] {
    const fullArgs = ["-c", "core.quotePath=false", ...args];
    if (verbose) {
        logVerbose(`> Executing git ${fullArgs.join(" ")}`, { verbose: true });
    }

    let res: IExecSyncResult;
    try {
        res = tl.execSync("git", fullArgs, {
            cwd,
            env: buildSafeGitEnv(),
            externalOutput: { source: "repository" },
        });
    }
    catch (err) {
        throw new GitCommandError(fullArgs, 127, err instanceof Error ? err.message : String(err));
    }

    if (res.code !== 0 || res.error) {
        throw new GitCommandError(fullArgs, res.code, res.stderr || res.error?.message || "");
    }

    return (res.stdout ?? "")
        .split("\n")
        .map(l => l.replace(/\r$/, ""))
        .filter(l => l !== "");
}

function validateCommitId(commitId: string): string {
    const trimmed = commitId.trim();
    if (!SAFE_COMMIT_REGEX.test(trimmed)) {
        throw new GitCommandError(["log"], 128, `Invalid commit identifier "${trimmed}"`);
    }
    return trimmed;
}

function buildSafeGitEnv(): Record<string, string | undefined> {
    const safeEnv: Record<string, string | undefined> = { GIT_TERMINAL_PROMPT: "0" };
    for (const [key, value] of Object.entries(process.env)) {
        const upper = key.toUpperCase();
        if (SENSITIVE_ENV_KEYS.has(upper) || SENSITIVE_ENV_PREFIXES.some(prefix => upper.startsWith(prefix))) {
            continue;
        }
        safeEnv[key] = value;
    }
    return safeEnv;
}

/**
 * Detects shallow-grafted commits via `.git/shallow` without spawning extra subprocesses.
 * In a shallow clone (`fetchDepth: 1`), `git log -1 <graftedCommit>` treats the commit as an initial root commit
 * and exits `0`, silently dropping deleted files and dumping all surviving files in the tree.
 */
function assertNotShallowGrafted(commitIds: string[], cwd?: string): void {
    const gitDirs = findGitDirs(cwd || process.cwd());
    if (!gitDirs) {
        return;
    }
    const shallowFile = path.join(gitDirs.commonDir, "shallow");
    if (!fs.existsSync(shallowFile)) {
        return;
    }

    const graftedShas = fs.readFileSync(shallowFile, "utf-8")
        .split(/\r?\n/)
        .map(line => line.trim().toLowerCase())
        .filter(Boolean);
    if (graftedShas.length === 0) {
        return;
    }

    const headSha = resolveHeadSha(gitDirs.gitDir, gitDirs.commonDir);
    for (const rawId of commitIds) {
        const resolved = rawId === "HEAD" && headSha ? headSha : rawId.toLowerCase();
        if (graftedShas.some(sha => sha === resolved || (resolved.length >= 7 && sha.startsWith(resolved)))) {
            throw new GitCommandError(
                ["log", rawId],
                128,
                `Commit ${rawId} is grafted in a shallow clone (parent history missing)`
            );
        }
    }
}

function findGitDirs(startDir: string): { gitDir: string; commonDir: string } | undefined {
    let dir = path.resolve(startDir);
    for (;;) {
        const dotGit = path.join(dir, ".git");
        try {
            const stat = fs.statSync(dotGit);
            if (stat.isDirectory()) {
                return { gitDir: dotGit, commonDir: dotGit };
            }
            if (stat.isFile()) {
                const content = fs.readFileSync(dotGit, "utf-8").trim();
                const match = content.match(/^gitdir:\s*(.+)$/i);
                if (match) {
                    const gitDir = path.resolve(dir, match[1].trim());
                    const commonDirFile = path.join(gitDir, "commondir");
                    const commonDir = fs.existsSync(commonDirFile)
                        ? path.resolve(gitDir, fs.readFileSync(commonDirFile, "utf-8").trim())
                        : gitDir;
                    return { gitDir, commonDir };
                }
            }
        }
        catch {
            // Continue walking upward when `.git` does not exist at this level.
        }
        const parent = path.dirname(dir);
        if (parent === dir) {
            return undefined;
        }
        dir = parent;
    }
}

function resolveHeadSha(gitDir: string, commonDir: string): string | undefined {
    try {
        const headContent = fs.readFileSync(path.join(gitDir, "HEAD"), "utf-8").trim();
        if (!headContent.startsWith("ref:")) {
            return headContent.toLowerCase();
        }
        const refName = headContent.slice("ref:".length).trim();
        const looseRef = path.join(commonDir, refName);
        if (fs.existsSync(looseRef)) {
            return fs.readFileSync(looseRef, "utf-8").trim().toLowerCase();
        }
        const packedRefs = path.join(commonDir, "packed-refs");
        if (fs.existsSync(packedRefs)) {
            const lines = fs.readFileSync(packedRefs, "utf-8").split(/\r?\n/);
            for (const line of lines) {
                if (!line || line.startsWith("#") || line.startsWith("^")) {
                    continue;
                }
                const [sha, ref] = line.trim().split(/\s+/);
                if (ref === refName && sha) {
                    return sha.toLowerCase();
                }
            }
        }
    }
    catch {
        return undefined;
    }
    return undefined;
}
