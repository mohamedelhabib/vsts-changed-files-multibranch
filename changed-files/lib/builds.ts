import * as azdev from "azure-devops-node-api";

import type { IBuildApi } from "azure-devops-node-api/BuildApi";

import { logVerbose } from "./util";

/**
 * Azure DevOps Build service caps per-build calculated change lists at 200 items,
 * and `azure-devops-node-api` discards `x-ms-continuationtoken` response headers.
 */
export const AZDO_MAX_BUILD_CHANGES = 200;

export interface BuildChangesOptions {
    verbose?: boolean;
    top?: number;
}

export interface BuildChangesResult {
    commitIds: string[];
    /** True when the returned change count reached the requested ceiling and older commits may have been omitted. */
    truncated: boolean;
}

/**
 * Creates an Azure DevOps Build API client authenticated with the pipeline access token.
 */
export async function createClient(orgUri: string, accessToken: string): Promise<IBuildApi> {
    const auth = azdev.getBearerHandler(accessToken);
    const connection = new azdev.WebApi(orgUri, auth);

    return connection.getBuildApi();
}

/**
 * Returns the commit ids associated with the build together with truncation metadata.
 */
export async function getBuildChangesWithMeta(
    client: IBuildApi,
    project: string,
    buildId: number,
    { verbose = false, top = AZDO_MAX_BUILD_CHANGES }: BuildChangesOptions = {}
): Promise<BuildChangesResult> {
    if (verbose) {
        logVerbose(`get the list of changes for the build ${buildId}`, { verbose: true });
    }
    const changes = (await client.getBuildChanges(project, buildId, undefined, top)) || [];
    const commitIds = changes
        .map(c => c.id || "")
        .filter(id => id !== "");

    return {
        commitIds,
        truncated: changes.length >= top,
    };
}

/**
 * Returns the commit ids associated with the build (as computed by Azure DevOps), requesting up to `top` (default 200).
 */
export async function getBuildChanges(
    client: IBuildApi,
    project: string,
    buildId: number,
    options: BuildChangesOptions = {}
): Promise<string[]> {
    const { commitIds } = await getBuildChangesWithMeta(client, project, buildId, options);
    return commitIds;
}
