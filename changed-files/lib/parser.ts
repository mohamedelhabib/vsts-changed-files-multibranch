import { isSafeKey } from "./util";

const CATEGORY_REGEX = /^\[([^\]]+)\]$/;

/**
 * Groups newline-delimited glob rules by `[Category]` header.
 * Duplicate `[Category]` headers merge rules into the existing category rather than overwriting prior patterns.
 */
export function parseRules(str: string, defaultVariable: string): Record<string, string[]> {
    const lines = str.split(/\r?\n/).map(l => l.trim()).filter(l => !!l);

    const res: Record<string, string[]> = {};
    if (isSafeKey(defaultVariable)) {
        Object.defineProperty(res, defaultVariable, {
            value: [],
            enumerable: true,
            writable: true,
            configurable: true,
        });
    }
    let currentCategory = defaultVariable;

    for (const line of lines) {
        const category = getCategory(line);
        if (category !== undefined) {
            currentCategory = category;
            if (!isSafeKey(category)) {
                continue;
            }
            if (!Object.prototype.hasOwnProperty.call(res, category)) {
                Object.defineProperty(res, category, {
                    value: [],
                    enumerable: true,
                    writable: true,
                    configurable: true,
                });
            }
        }
        else if (isSafeKey(currentCategory) && Object.prototype.hasOwnProperty.call(res, currentCategory)) {
            res[currentCategory].push(line);
        }
    }

    return res;
}

/**
 * Parses the `forceByCategory` input: one `Category: true|false` pair per line.
 * Lines without a valid `Category: true|false` pair are reported through `onInvalid` and ignored.
 */
export function parseForceByCategory(str: string, onInvalid: (line: string) => void = () => undefined): Record<string, boolean> {
    const lines = str.split(/\r?\n/).map(l => l.trim()).filter(l => !!l);
    const res: Record<string, boolean> = {};
    for (const line of lines) {
        const separator = line.indexOf(":");
        const rawCategory = separator > 0 ? line.slice(0, separator).trim() : "";
        const category = rawCategory.replace(/^\[([^\]]+)\]$/, "$1").trim();
        const rawValue = separator > 0 ? line.slice(separator + 1).trim().toLowerCase() : "";
        if (!category || !isSafeKey(category) || (rawValue !== "true" && rawValue !== "false")) {
            onInvalid(line);
            continue;
        }
        Object.defineProperty(res, category, {
            value: rawValue === "true",
            enumerable: true,
            writable: true,
            configurable: true,
        });
    }
    return res;
}

function getCategory(line: string): string | undefined {
    const matches = line.match(CATEGORY_REGEX);
    const trimmed = matches?.[1]?.trim();
    return trimmed || undefined;
}
