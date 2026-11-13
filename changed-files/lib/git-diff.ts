import * as tl from "azure-pipelines-task-lib/task";

export interface GitOptions {
    cwd?: string;
    verbose?: boolean;
}

/**
 * Raised when a git command exits with a non-zero code (shallow clone, unknown ref, missing commit...).
 */
export class GitCommandError extends Error {
    constructor(public readonly args: string[], public readonly code: number, stderr: string) {
        super(`git ${args.join(" ")} failed with exit code ${code}${stderr.trim() ? `: ${stderr.trim()}` : ""}`);
        this.name = "GitCommandError";
    }
}

/**
 * Lists files changed on HEAD since it diverged from `refBranch` (`git diff --name-only <refBranch>...`).
 */
export function listChangedFilesBetweenBranches(refBranch: string, options: GitOptions = {}): string[] {
    return listChangedFiles(["diff", "--name-only", `${refBranch}...`], options);
}

/**
 * Lists files changed by all the given commits (flattened, duplicates kept).
 */
export function getCommitsChangedFiles(commitIds: string[], options: GitOptions = {}): string[] {
    return commitIds.flatMap(commitId => getCommitChangedFiles(commitId, options));
}

/**
 * Lists files changed by one commit. `-m` makes merge commits list their changes against each parent.
 */
export function getCommitChangedFiles(commitId: string, options: GitOptions = {}): string[] {
    return listChangedFiles(["log", "-m", "-1", "--name-only", "--pretty=format:", commitId], options);
}

/**
 * Runs a git command returning one path per line.
 * `core.quotePath=false` keeps non-ASCII paths verbatim so they can be matched by glob rules.
 *
 * @throws GitCommandError when git exits with a non-zero code.
 */
export function listChangedFiles(args: string[], { cwd, verbose }: GitOptions = {}): string[] {
    const fullArgs = ["-c", "core.quotePath=false", ...args];
    if (verbose) {
        console.log(`> Executing git ${fullArgs.join(" ")}`);
    }

    const res = tl.execSync("git", fullArgs, { cwd });
    if (res.code !== 0 || res.error) {
        throw new GitCommandError(fullArgs, res.code, res.stderr || res.error?.message || "");
    }

    return res.stdout
        .split("\n")
        .map(l => l.trim())
        .filter(l => l !== "");
}
