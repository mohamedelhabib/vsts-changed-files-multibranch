import * as minimatch from "minimatch";

export function matchFiles(files: string[], rules: string[]): boolean {
  let match = false;
  for (const pattern of rules) {
    if (!pattern.startsWith("!")) {
      const matched = minimatch.match(files, pattern);
      if (matched.length > 0 || match) {
        match = true;
      }
    }
  }

  for (const pattern of rules) {
    if (pattern.startsWith("!")) {
      const matched = minimatch.match(files, pattern);
      if (matched.length <= 0 || !match) {
        match = false;
      }
    }
  }

  return match;
}
