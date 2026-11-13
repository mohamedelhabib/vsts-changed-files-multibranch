import * as tl from "azure-pipelines-task-lib/task";

import type { IBuildApi } from "azure-devops-node-api/BuildApi";

import { GitCommandError, getCommitsChangedFiles, listChangedFilesBetweenBranches } from "./lib/git-diff";
import { parseRules, parseForceByCategory } from "./lib/parser";
import { matchFiles } from "./lib/matcher";
import { isSameBranch } from "./lib/branch";
import { getBuildChanges, createClient } from "./lib/builds";
import { getVariable, setVariable, fromEntries, logVerbose } from "./lib/util";

run();

async function run(): Promise<void> {
    try {
        const context = createContext();
        const client = await initializeClient();

        const changed = await getChangedFiles(client, context);
        const changes = getChangesPerVariable(changed, context);

        setVariables(changes, context);
    }
    catch (err) {
        tl.setResult(tl.TaskResult.Failed, (err as Error).message);
    }
}

function createContext(): Context {
    const project = getVariable("System.TeamProjectId");

    const variable = tl.getInput("variable", true) || "FilesChanged";
    const rules = tl.getInput("rules") || "**";
    const isOutput = tl.getBoolInput("isOutput");
    const cwd = tl.getInput("cwd") || tl.cwd();
    const verbose = tl.getBoolInput("verbose");
    const refBranch = tl.getInput("refBranch", false);
    const forceToTrue = tl.getBoolInput("forceToTrue", false);

    const forceByCategory = parseForceByCategory(
        tl.getInput("forceByCategory") || "",
        line => tl.warning(`forceByCategory: ignoring invalid line "${line}" (expected "Category: true|false")`)
    );

    return {
        project,
        inputs: {
            variable,
            rules,
            isOutput,
            refBranch,
            forceToTrue,
            forceByCategory,
            cwd,
            verbose
        }
    };
}

async function initializeClient(): Promise<IBuildApi> {
    const orgUri = getVariable("System.TeamFoundationCollectionUri");
    const accessToken = getVariable("System.AccessToken");

    return createClient(orgUri, accessToken);
}

async function getChangedFiles(client: IBuildApi, { project, inputs: { cwd, verbose, refBranch } }: Context): Promise<ChangedFiles> {

    const buildId = parseInt(getVariable("Build.BuildId"));
    const commitIds: string[] = await getBuildChanges(client, project, buildId, { verbose });
    const currentBranch: string = tl.getVariable("Build.SourceBranch") || "";

    if (verbose) {
        console.log(`Build id is ${buildId}`)
        console.log(`refBranch = ${refBranch}`)
        console.log(`currentBranch = ${currentBranch}`)
    }

    let files: string[]
    try {
        if (refBranch && !isSameBranch(refBranch, currentBranch)) {
            if (verbose) {
                console.log(`compare ${currentBranch} with the ref branch ${refBranch}...`)
            }
            files = listChangedFilesBetweenBranches(refBranch, { cwd, verbose })
        } else {
            if (verbose) {
                console.log(`extracting changes from the list of commits...`)
            }
            files = getCommitsChangedFiles(commitIds, { cwd, verbose });
        }
    }
    catch (err) {
        if (err instanceof GitCommandError) {
            // Fail-safe: never skip downstream jobs because changes could not be computed.
            tl.warning(`Unable to compute changed files, all variables are set to true. ${err.message}. ` +
                `If the repository is a shallow clone, set "fetchDepth: 0" on the checkout step.`);
            return { files: [], assumeAllChanged: true };
        }
        throw err;
    }

    if (verbose) {
        console.log(`Changed files are : ${files}`)
    }
    return { files, assumeAllChanged: false };
}

function getChangesPerVariable({ files, assumeAllChanged }: ChangedFiles, { inputs: { rules, variable, verbose, forceToTrue, forceByCategory } }: Context): Record<string, boolean> {
    const groupedRules = parseRules(rules, variable);
    const categories = Object.keys(groupedRules).filter(cat => groupedRules[cat].length > 0);

    if (assumeAllChanged) {
        return fromEntries(categories.map(cat => [cat, true]));
    }

    if (!files.length) {
        return fromEntries(categories.map(cat => [cat, forceToTrue || isCategoryForced(cat, forceByCategory)]));
    }

    logVerbose("> Filtering files using glob rules", { verbose });

    return fromEntries(
        categories.map(cat => [cat, forceToTrue || isCategoryForced(cat, forceByCategory) || matchFiles(files, groupedRules[cat])])
    );
}

function isCategoryForced(category: string, forceByCategory: Record<string, boolean>): boolean {
    return forceByCategory[category] === true;
}

function setVariables(changes: Record<string, boolean>, { inputs: { isOutput, verbose } }: Context): void {
    for (const [variable, hasChanged] of Object.entries(changes)) {
        logVerbose(`>> ${variable.toUpperCase()}: ${hasChanged ? "Changes" : "No change"} detected since last succeeded build, setting "${variable}" to "${hasChanged}"`, { verbose });

        setVariable(variable, String(hasChanged), isOutput);
    }
}

interface ChangedFiles {
    files: string[];
    /** true when changes could not be computed (git error): every variable is set to true */
    assumeAllChanged: boolean;
}

interface Context {
    project: string;

    inputs: {
        variable: string;
        rules: string;
        isOutput: boolean;
        refBranch: string | undefined;
        forceToTrue: boolean;
        forceByCategory: Record<string, boolean>;
        cwd: string;
        verbose: boolean;
    };
}
