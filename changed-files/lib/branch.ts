/**
 * Normalizes a branch reference so the different spellings users and agents
 * use can be compared: `refs/heads/x`, `refs/remotes/<remote>/x`, `origin/x` and `x`
 * all become `x`.
 */
export function normalizeBranch(ref: string): string {
    const trimmed = ref.trim();
    if (trimmed.startsWith("refs/heads/")) {
        return trimmed.slice("refs/heads/".length);
    }
    if (trimmed.startsWith("refs/remotes/")) {
        const withoutRemotes = trimmed.slice("refs/remotes/".length);
        const slashIndex = withoutRemotes.indexOf("/");
        return slashIndex > 0 ? withoutRemotes.slice(slashIndex + 1) : withoutRemotes;
    }
    if (trimmed.startsWith("origin/")) {
        return trimmed.slice("origin/".length);
    }
    return trimmed;
}

/**
 * Converts a user or Azure Pipelines branch reference (`master`, `refs/heads/master`,
 * `origin/master`, `refs/remotes/origin/master`) into a remote-tracking reference
 * (`origin/master`) suitable for `git diff` on detached-HEAD agent checkouts.
 */
export function toRemoteRef(ref: string, defaultRemote = "origin"): string {
    const trimmed = ref.trim();
    if (trimmed.startsWith("refs/remotes/")) {
        return trimmed.slice("refs/remotes/".length);
    }
    if (trimmed.startsWith(`${defaultRemote}/`)) {
        return trimmed;
    }
    if (trimmed.startsWith("refs/heads/")) {
        return `${defaultRemote}/${trimmed.slice("refs/heads/".length)}`;
    }
    return `${defaultRemote}/${trimmed}`;
}

/**
 * Returns true when both references designate the same branch.
 * Pull request refs (`refs/pull/<id>/merge`) and tags (`refs/tags/*`) never equal a branch.
 */
export function isSameBranch(a: string, b: string): boolean {
    return normalizeBranch(a) === normalizeBranch(b);
}
