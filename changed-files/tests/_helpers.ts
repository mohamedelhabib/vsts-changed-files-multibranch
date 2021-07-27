import * as nock from "nock";
import { Build } from "azure-devops-node-api/interfaces/BuildInterfaces";

export interface TestContext {
    TEAM_PROJECT_ID?: string;
    SOURCE_VERSION?: string;
    ACCESS_TOKEN?: string;
    DEFINITION_ID?: string;
}

export function setCommonsVariable({ TEAM_PROJECT_ID = "project", SOURCE_VERSION = "source_commit_id", ACCESS_TOKEN = "access_token", DEFINITION_ID = "500" }: TestContext = {}): TestContext {


    setVariable("System.TeamProjectId", TEAM_PROJECT_ID);
    setVariable("System.TeamFoundationCollectionUri", "https://dev.azure.com/orga");
    setVariable("System.AccessToken", ACCESS_TOKEN);
    setVariable("System.DefinitionId", DEFINITION_ID);
    setVariable("Build.BuildId", DEFINITION_ID);
    setVariable("Build.SourceVersion", SOURCE_VERSION);
    setVariable("Build.SourceBranch", "master");
    return {
        TEAM_PROJECT_ID,
        SOURCE_VERSION,
        ACCESS_TOKEN,
        DEFINITION_ID
    };
}

export function setVariable(name: string, value: string): void {
    const key = getVariableKey(name);
    process.env[key] = value;
}

export function getVariableKey(name: string): string {
    return name.replace(/\./g, '_').toUpperCase();
}

export function mockTfsApi({ query }: { query?: Record<string, string>, build?: Partial<Build> | null } = {}): nock.Scope {

    return nock("https://dev.azure.com")
    
    // Build route template
    .options("/orga/_apis/build")
    .reply(200, JSON.stringify({
        value: [
            {
                id: "0cd358e1-9217-4d94-8269-1c1ee6f93dcf",
                releasedVersion: "5.1",
                maxVersion: "5.1",
                area: "build",
                resourceName: "builds",
                routeTemplate: "/{project}/_apis/{area}/{resource}"
            },
            {
                id: "54572c7b-bbd3-45d4-80dc-28be08941620",
                releasedVersion: "6.1-preview.2",
                maxVersion: "6.1-preview.2",
                area: "build",
                resourceName: "builds",
                routeTemplate: "/{project}/_apis/{area}/{resource}/{buildId}/changes"
            }
        ]
        }))

        // Get build changes
        .get("/orga/project/_apis/build/builds/500/changes")
        .query(query || true)
        .reply(200, JSON.stringify({
            "count": 1,
            "value": [
                {
                    "id": "latest_commit_id",
                    "message": "test commit",
                    "type": "TfsGit",
                    "author": {
                        "displayName": "User name",
                    },
                    "timestamp": "2021-07-13T17:45:46Z"
                }
            ]
        }))

        .get("/orga/project/_apis/build/builds/100/changes")
        .query(query || true)
        .reply(200, JSON.stringify({
            "count": 0,
            "value": []
        }))

        // Location route template
        .options("/orga/_apis/Location")
        .reply(200, JSON.stringify({
            value: [
                {
                    id: "e81700f7-3be2-46de-8624-2eb35882fcaa",
                    releasedVersion: "5.1",
                    maxVersion: "5.1",
                    area: "Location",
                    routeTemplate: "/_apis/{area}"
                }
            ]
        }))
        // Same resource area
        .get("/orga/_apis/Location")
        .reply(200, JSON.stringify({
            value: []
        }));
}

export function restoreTfsApi(): void {
    nock.cleanAll();
    nock.restore();
}
