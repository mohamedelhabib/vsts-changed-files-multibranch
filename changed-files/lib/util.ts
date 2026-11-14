import * as tl from "azure-pipelines-task-lib/task";
import * as tcm from "azure-pipelines-task-lib/taskcommand";

const RESERVED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Neutralizes Azure Pipelines logging command prefixes (`##vso[`) in untrusted or external strings.
 */
export function sanitizeVso(text: string): string {
    return text.replace(/##vso\[/gi, "##_vso[");
}

/**
 * Returns false for Object.prototype keys to prevent prototype-chain collisions.
 */
export function isSafeKey(key: string): boolean {
    return Boolean(key) && !RESERVED_KEYS.has(key);
}

/**
 * Reads a required pipeline variable or throws an actionable error.
 */
export function getVariable(name: string): string {
    const val = tl.getVariable(name);
    if (!val) {
        throw new Error(`Environment Error: This task requires "${name}" variable.`);
    }

    return val;
}

/**
 * Emits an Azure Pipelines `task.setvariable` command after neutralizing embedded VSO markers.
 */
export function setVariable(variable: string, value: string | number | boolean, isOutput?: boolean): void {
    const safeName = sanitizeVso(variable);
    const safeValue = sanitizeVso(String(value));
    const cmd = new tcm.TaskCommand("task.setvariable", { variable: safeName, isOutput }, safeValue);
    console.log(cmd.toString());
}

/**
 * Logs a message to stdout when `verbose` is enabled, or to `task.debug` otherwise, neutralizing `##vso[`.
 */
export function logVerbose(message: string, { verbose }: { verbose: boolean }): void {
    const safeMessage = sanitizeVso(message);
    if (verbose) {
        console.log(safeMessage);
    }
    else {
        logDebug("CF:::" + safeMessage);
    }
}

/**
 * Emits an Azure Pipelines `task.debug` command with neutralized `##vso[` markers.
 */
export function logDebug(message: string): void {
    const cmd = new tcm.TaskCommand("task.debug", {}, sanitizeVso(message));
    console.log(cmd.toString());
}

/**
 * Builds a plain dictionary from key/value tuples while safely defining properties and skipping prototype keys.
 */
export function fromEntries<T>(entries: Array<[string, T]>): Record<string, T> {
    const res: Record<string, T> = {};
    for (const [key, value] of entries) {
        if (isSafeKey(key)) {
            Object.defineProperty(res, key, {
                value,
                enumerable: true,
                writable: true,
                configurable: true,
            });
        }
    }
    return res;
}
