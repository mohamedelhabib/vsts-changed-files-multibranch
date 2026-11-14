import * as fs from "fs";
import * as path from "path";
import * as tl from "azure-pipelines-task-lib/task";

import type { IBuildApi } from "azure-devops-node-api/BuildApi";

import { GitCommandError, getCommitsChangedFiles, listChangedFilesBetweenBranches } from "./lib/git-diff";
import { parseRules, parseForceByCategory } from "./lib/parser";
import { matchFiles } from "./lib/matcher";
import { isSameBranch } from "./lib/branch";
import { AZDO_MAX_BUILD_CHANGES, getBuildChangesWithMeta, createClient } from "./lib/builds";
import { getVariable, setVariable, fromEntries, logVerbose, sanitizeVso } from "./lib/util";

export interface ChangedFiles {
    files: string[];
    /** true when changes could not be computed (git/API error or truncation): every variable is set to true */
    assumeAllChanged: boolean;
}

export interface Context {
    inputs: {
        variable: string;
        rules: string;
        isOutput: boolean;
        refBranch: string | undefined;
        forceToTrue: boolean;
        forceByCategory: Record<string, boolean>;
        matchDotFiles: boolean;
        cwd: string | undefined;
        verbose: boolean;
    };
}

if (process.env.CHANGED_FILES_NO_AUTORUN !== "1") {
    void run();
}

/**
 * Main Azure Pipelines task entrypoint.
 */
export async function run(): Promise<void> {
    let activeToken: string | undefined;
    try {
        const context = createContext();

        const changed: ChangedFiles = context.inputs.forceToTrue
            ? { files: [], assumeAllChanged: false }
            : await getChangedFiles(context, token => {
                activeToken = token;
            });

        const changes = getChangesPerVariable(changed, context);
        setVariables(changes, context);
    }
    catch (err) {
        const rawMessage = err instanceof Error ? err.message : String(err);
        tl.setResult(tl.TaskResult.Failed, sanitizeVso(redactSecret(rawMessage, activeToken)));
    }
}

/**
 * Reads and normalizes task inputs from the Azure Pipelines environment.
 */
export function createContext(): Context {
    const variable = tl.getInput("variable", false) || "HasChanged";
    const rules = tl.getInput("rules") || "**";
    const isOutput = tl.getBoolInput("isOutput");
    const cwd = resolveWorkingDirectory();
    const verbose = tl.getBoolInput("verbose");
    const refBranch = tl.getInput("refBranch", false)?.trim() || undefined;
    const forceToTrue = tl.getBoolInput("forceToTrue", false);
    const matchDotFiles = tl.getBoolInput("matchDotFiles", false);

    const forceByCategory = parseForceByCategory(
        tl.getInput("forceByCategory") || "",
        line => tl.warning(sanitizeVso(`forceByCategory: ignoring invalid line "${line}" (expected "Category: true|false")`))
    );

    return {
        inputs: {
            variable,
            rules,
            isOutput,
            refBranch,
            forceToTrue,
            forceByCategory,
            matchDotFiles,
            cwd,
            verbose,
        },
    };
}

/**
 * Computes changed files using either branch three-dot diff mode or Azure DevOps build commit history.
 */
export async function getChangedFiles(
    { inputs: { cwd, verbose, refBranch } }: Context,
    onTokenResolved?: (token: string) => void
): Promise<ChangedFiles> {
    const currentBranch = tl.getVariable("Build.SourceBranch") || "";
    const prTargetBranch = tl.getVariable("System.PullRequest.TargetBranch")?.trim() || undefined;
    const effectiveRefBranch = refBranch || prTargetBranch;

    if (verbose) {
        logVerbose(`refBranch = ${effectiveRefBranch ?? ""}`, { verbose: true });
        logVerbose(`currentBranch = ${currentBranch}`, { verbose: true });
    }

    if (effectiveRefBranch && !isSameBranch(effectiveRefBranch, currentBranch)) {
        try {
            if (verbose) {
                logVerbose(`compare ${currentBranch} with the ref branch ${effectiveRefBranch}...`, { verbose: true });
            }
            const files = listChangedFilesBetweenBranches(effectiveRefBranch, { cwd, verbose });
            if (verbose) {
                logVerbose(`Changed files are : ${files.join(", ")}`, { verbose: true });
            }
            return { files, assumeAllChanged: false };
        }
        catch (err) {
            if (err instanceof GitCommandError) {
                return failSafeOnError(err.message);
            }
            throw err;
        }
    }

    const project = getVariable("System.TeamProjectId");
    const buildId = parseBuildId(getVariable("Build.BuildId"));
    const { client, accessToken } = await initializeClient();
    onTokenResolved?.(accessToken);

    if (verbose) {
        logVerbose(`Build id is ${buildId}`, { verbose: true });
    }

    let commitIds: string[];
    try {
        const result = await getBuildChangesWithMeta(client, project, buildId, { verbose });
        if (result.truncated) {
            return failSafeOnError(
                `Build ${buildId} returned at least ${AZDO_MAX_BUILD_CHANGES} commits and older changes may be truncated`
            );
        }
        if (result.commitIds.length === 0 && tl.getVariable("Build.Repository.Provider") === "Git") {
            return failSafeOnError(
                "Azure DevOps returned 0 build changes for external Git provider; configure refBranch for branch diffing"
            );
        }
        commitIds = result.commitIds;
    }
    catch (err) {
        const msg = redactSecret(err instanceof Error ? err.message : String(err), accessToken);
        return failSafeOnError(`Failed to query Azure DevOps build changes: ${msg}`);
    }

    try {
        if (verbose) {
            logVerbose("extracting changes from the list of commits...", { verbose: true });
        }
        const files = getCommitsChangedFiles(commitIds, { cwd, verbose });
        if (verbose) {
            logVerbose(`Changed files are : ${files.join(", ")}`, { verbose: true });
        }
        return { files, assumeAllChanged: false };
    }
    catch (err) {
        if (err instanceof GitCommandError) {
            return failSafeOnError(err.message);
        }
        throw err;
    }
}

/**
 * Evaluates glob rules per category and returns the resulting boolean map.
 */
export function getChangesPerVariable(
    { files, assumeAllChanged }: ChangedFiles,
    { inputs: { rules, variable, verbose, forceToTrue, forceByCategory, matchDotFiles } }: Context
): Record<string, boolean> {
    const groupedRules = parseRules(rules, variable);
    validateRuleCategories(groupedRules, forceByCategory);

    const categories = Object.keys(groupedRules).filter(cat => groupedRules[cat].length > 0);

    if (assumeAllChanged) {
        return fromEntries(categories.map(cat => [cat, true]));
    }

    if (!files.length) {
        return fromEntries(categories.map(cat => [cat, forceToTrue || isCategoryForced(cat, forceByCategory)]));
    }

    logVerbose("> Filtering files using glob rules", { verbose });

    return fromEntries(
        categories.map(cat => [
            cat,
            forceToTrue || isCategoryForced(cat, forceByCategory) || matchFiles(files, groupedRules[cat], { dot: matchDotFiles }),
        ])
    );
}

async function initializeClient(): Promise<{ client: IBuildApi; accessToken: string }> {
    const orgUri = getVariable("System.TeamFoundationCollectionUri");
    const accessToken = tl.getEndpointAuthorizationParameter("SystemVssConnection", "AccessToken", true)
        || getVariable("System.AccessToken");
    const client = await createClient(orgUri, accessToken);
    return { client, accessToken };
}

function resolveWorkingDirectory(): string | undefined {
    const suppliedCwd = tl.getInput("cwd");
    const defaultWorkDir = tl.getVariable("System.DefaultWorkingDirectory");
    const repoLocalPath = tl.getVariable("Build.Repository.LocalPath");

    if (suppliedCwd && suppliedCwd !== defaultWorkDir) {
        return suppliedCwd;
    }
    if (repoLocalPath && fs.existsSync(path.join(repoLocalPath, ".git"))) {
        return repoLocalPath;
    }
    return suppliedCwd || tl.cwd();
}

function parseBuildId(rawBuildId: string): number {
    const parsed = Number(rawBuildId);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`Environment Error: Invalid "Build.BuildId" value "${rawBuildId}".`);
    }
    return parsed;
}

function failSafeOnError(reason: string): ChangedFiles {
    tl.warning(
        sanitizeVso(
            `Unable to compute changed files, all variables are set to true. ${reason}. ` +
            `If the repository is a shallow clone, set "fetchDepth: 0" on the checkout step.`
        )
    );
    return { files: [], assumeAllChanged: true };
}

function validateRuleCategories(groupedRules: Record<string, string[]>, forceByCategory: Record<string, boolean>): void {
    for (const forcedCategory of Object.keys(forceByCategory)) {
        if (!Object.prototype.hasOwnProperty.call(groupedRules, forcedCategory) || groupedRules[forcedCategory].length === 0) {
            tl.warning(sanitizeVso(`forceByCategory: category "${forcedCategory}" is not defined in rules or has no patterns`));
        }
    }

    for (const [category, catRules] of Object.entries(groupedRules)) {
        const active = catRules.filter(r => !r.startsWith("#"));
        if (active.length > 0 && active.every(r => r.startsWith("!"))) {
            tl.warning(
                sanitizeVso(
                    `Category "${category}" contains only exclusion rules ("!...") and no include rules; it can never match any file`
                )
            );
        }
    }
}

function isCategoryForced(category: string, forceByCategory: Record<string, boolean>): boolean {
    return Object.prototype.hasOwnProperty.call(forceByCategory, category) && forceByCategory[category] === true;
}

function setVariables(changes: Record<string, boolean>, { inputs: { isOutput, verbose } }: Context): void {
    for (const [variable, hasChanged] of Object.entries(changes)) {
        logVerbose(
            `>> ${variable.toUpperCase()}: ${hasChanged ? "Changes" : "No change"} detected since last succeeded build, setting "${variable}" to "${hasChanged}"`,
            { verbose }
        );

        setVariable(variable, String(hasChanged), isOutput);
    }
}

function redactSecret(message: string, secret: string | undefined): string {
    if (!secret) {
        return message;
    }
    return message.split(secret).join("***");
}
