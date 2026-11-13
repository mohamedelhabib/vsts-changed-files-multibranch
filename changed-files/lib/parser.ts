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
 */
export function parseForceByCategory(str: string): Record<string, boolean> {
    const lines = str.split(/\r?\n/).map(l => l.trim()).filter(l => !!l);
    const res: Record<string, boolean> = {};
    for (const line of lines) {
        const pair = line.split(":").map(l => l.trim())
        res[pair[0]] = (pair[1].toLowerCase() === 'true');
        console.log(`parseForceByCategory setting ${pair[0]} to ${res[pair[0]]}`); 
    }
    return res;
}

function getCategory(line: string): string | undefined {
    const matches = line.match(CATEGORY_REGEX);
    return matches?.[1];
}
