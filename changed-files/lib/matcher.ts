import * as minimatch from "minimatch";

export interface MatchOptions {
    /** Match files and directories starting with `.` (default: false for v2 backward compatibility). */
    dot?: boolean;
}

/**
 * Normalizes path separators (`\` -> `/`) and strips redundant leading `./` prefixes
 * so rules behave identically across Windows and Linux build agents.
 */
function normalizeGlobPath(value: string): string {
    return value.replace(/\\/g, "/").replace(/^(?:\.\/)+/, "");
}

/**
 * Returns true when at least one file matches an include rule and none of the exclusion rules (`!pattern`).
 * Exclusions only apply to the files matched by the include rules; without include rules nothing matches.
 */
export function matchFiles(files: string[], rules: string[], options: MatchOptions = {}): boolean {
    const minimatchOptions: minimatch.IOptions = {
        dot: Boolean(options.dot),
        nonegate: true,
        nocomment: true,
    };

    const activeRules = rules.filter(r => !r.startsWith("#"));
    const includes = activeRules
        .filter(r => !r.startsWith("!"))
        .map(normalizeGlobPath)
        .filter(Boolean);
    const excludes = activeRules
        .filter(r => r.startsWith("!"))
        .map(r => normalizeGlobPath(r.slice(1).replace(/^!+/, "")))
        .filter(Boolean);

    if (includes.length === 0 || files.length === 0) {
        return false;
    }

    return files.some(rawFile => {
        const file = normalizeGlobPath(rawFile);
        return includes.some(pattern => minimatch(file, pattern, minimatchOptions)) &&
            !excludes.some(pattern => minimatch(file, pattern, minimatchOptions));
    });
}
