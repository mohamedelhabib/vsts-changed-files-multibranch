const CATEGORY_REGEX = /^\[([^\]]+)\]$/;

export function parseRules(str: string, defaultVariable: string): Record<string, string[]> {
    const lines = str.split(/\r?\n/).map(l => l.trim()).filter(l => !!l);

    const res: Record<string, string[]> = { [defaultVariable]: [] };
    let currentCategory = defaultVariable;

    for (const line of lines) {
        const category = getCategory(line);
        if (category) {
            res[category] = [];
            currentCategory = category;
        }
        else {
            res[currentCategory].push(line);
        }
    }

    return res;
}

/**
 * Parses the `forceByCategory` input: one `Category: true|false` pair per line.
 * Lines without a `Category:` prefix are reported through `onInvalid` and ignored.
 */
export function parseForceByCategory(str: string, onInvalid: (line: string) => void = () => undefined): Record<string, boolean> {
    const lines = str.split(/\r?\n/).map(l => l.trim()).filter(l => !!l);
    const res: Record<string, boolean> = {};
    for (const line of lines) {
        const separator = line.indexOf(":");
        const category = separator > 0 ? line.slice(0, separator).trim() : "";
        if (!category) {
            onInvalid(line);
            continue;
        }
        res[category] = line.slice(separator + 1).trim().toLowerCase() === "true";
        console.log(`parseForceByCategory setting ${category} to ${res[category]}`);
    }
    return res;
}

function getCategory(line: string): string | undefined {
    const matches = line.match(CATEGORY_REGEX);
    return matches?.[1];
}
