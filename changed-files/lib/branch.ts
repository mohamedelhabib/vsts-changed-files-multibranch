/**
 * Normalizes a branch reference so the different spellings users and agents
 * use can be compared: `refs/heads/x`, `refs/remotes/origin/x`, `origin/x` and `x`
 * all become `x`.
 */
export function normalizeBranch(ref: string): string {
    return ref
        .trim()
        .replace(/^refs\/heads\//, "")
        .replace(/^refs\/remotes\//, "")
        .replace(/^origin\//, "");
}

/**
 * Returns true when both references designate the same branch.
 * Pull request refs (`refs/pull/<id>/merge`) never equal a branch.
 */
export function isSameBranch(a: string, b: string): boolean {
    return normalizeBranch(a) === normalizeBranch(b);
}
