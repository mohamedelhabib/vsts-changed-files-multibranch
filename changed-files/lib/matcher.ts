import * as minimatch from "minimatch";

/**
 * Returns true when at least one file matches an include rule and none of the exclusion rules (`!pattern`).
 * Exclusions only apply to the files matched by the include rules; without include rules nothing matches.
 */
export function matchFiles(files: string[], rules: string[]): boolean {
  const includes = rules.filter(r => !r.startsWith("!"));
  const excludes = rules.filter(r => r.startsWith("!")).map(r => r.slice(1));

  return files.some(file =>
    includes.some(pattern => minimatch(file, pattern)) &&
    !excludes.some(pattern => minimatch(file, pattern))
  );
}
