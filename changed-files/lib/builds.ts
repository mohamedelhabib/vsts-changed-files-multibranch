import * as azdev from "azure-devops-node-api";

import type { IBuildApi } from "azure-devops-node-api/BuildApi";

/**
 * Creates an Azure DevOps Build API client authenticated with the pipeline access token.
 */
export async function createClient(orgUri: string, accessToken: string): Promise<IBuildApi> {
    const auth = azdev.getBearerHandler(accessToken);
    const connection = new azdev.WebApi(orgUri, auth);

    return connection.getBuildApi();
}

/**
 * Returns the commit ids associated with the build (as computed by Azure DevOps).
 */
export async function getBuildChanges(client: IBuildApi, project: string, buildId: number, { verbose }: { verbose?: boolean } = {}): Promise<string[]> {
    if (verbose) {
        console.log(`get the list of changes for the build ${buildId}`)
    }
    return (await client.getBuildChanges(project, buildId))
        .map(c => c.id || "")
        .filter(id => id != "")
}
