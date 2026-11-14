import * as nock from "nock";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as tmrm from "azure-pipelines-task-lib/mock-run";
import { Build } from "azure-devops-node-api/interfaces/BuildInterfaces";

export const GIT_LOG_SINGLE = "log --first-parent -m -1 --relative --no-renames --name-only --pretty=format: --end-of-options latest_commit_id --";
export const GIT_DIFF_ORIGIN_MASTER = "diff --relative --no-renames --name-only --end-of-options origin/master... --";

export interface ScenarioExec {
    code: number;
    stdout?: string;
    stderr?: string;
}

export interface ScenarioConfig {
    inputs: Record<string, string>;
    sourceBranch?: string;
    env?: Record<string, string | undefined>;
    verbose?: boolean;
    mockApi?: boolean;
    exec: Record<string, ScenarioExec>;
}

/**
 * Declares and runs a task scenario: common pipeline variables, inputs, mocked git answers and mocked API.
 */
export function runScenario({ inputs, sourceBranch, env, verbose = true, mockApi = true, exec }: ScenarioConfig): void {
    setCommonsVariable();
    if (sourceBranch) {
        setVariable("Build.SourceBranch", sourceBranch);
    }
    if (env) {
        for (const [key, val] of Object.entries(env)) {
            if (val === undefined) {
                delete process.env[key];
            }
            else {
                process.env[key] = val;
            }
        }
    }

    const tmr = new tmrm.TaskMockRunner(path.join(__dirname, "..", "index.js"));
    tmr.setInput("variable", "HasChanged");
    tmr.setInput("isOutput", "true");
    tmr.setInput("verbose", String(verbose));
    Object.entries(inputs).forEach(([name, value]) => tmr.setInput(name, value));

    tmr.setAnswers({
        which: { "git": "/bin/git" },
        exist: { "/bin/git": true },
        checkPath: { "/bin/git": true },
        exec: Object.fromEntries(Object.entries(exec).map(([args, res]) =>
            [`/bin/git -c core.quotePath=false ${args}`, { code: res.code, stdout: res.stdout || "", stderr: res.stderr || "" }])),
    });

    if (mockApi) {
        mockTfsApi();
    }
    else {
        nock.disableNetConnect();
    }
    tmr.run();
}

export interface TestContext {
    TEAM_PROJECT_ID?: string;
    SOURCE_VERSION?: string;
    ACCESS_TOKEN?: string;
    DEFINITION_ID?: string;
}

export function setCommonsVariable({ TEAM_PROJECT_ID = "project", SOURCE_VERSION = "source_commit_id", ACCESS_TOKEN = "access_token", DEFINITION_ID = "500" }: TestContext = {}): TestContext {

    // task-lib stores its input vault key in <Agent.TempDirectory>/.taskkey (default: cwd).
    // A private directory per scenario process avoids races when Jest runs suites in parallel,
    // and cleaning it on process exit prevents /tmp accumulation across test runs.
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cf-agent-"));
    process.on("exit", () => {
        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
        catch {
            // Best-effort cleanup on exit.
        }
    });
    setVariable("Agent.TempDirectory", tmpDir);

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
    return name.replace(/\./g, "_").toUpperCase();
}

export function mockTfsApi({ query }: { query?: Record<string, string>, build?: Partial<Build> | null } = {}): nock.Scope {
    const truncatedChanges = Array.from({ length: 200 }, (_, idx) => ({
        id: `commit_id_${idx}`,
        message: `commit ${idx}`,
        type: "TfsGit",
        author: { displayName: "User name" },
        timestamp: "2021-07-13T17:45:46Z",
    }));

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

        .get("/orga/project/_apis/build/builds/502/changes")
        .query(query || true)
        .reply(200, JSON.stringify({
            "count": 2,
            "value": [
                {
                    "id": "latest_commit_id",
                    "message": "test commit",
                    "type": "TfsGit",
                    "author": {
                        "displayName": "User name",
                    },
                    "timestamp": "2021-07-13T17:45:46Z"
                },
                {
                    "id": "latest_commit_id_1",
                    "message": "test commit -1",
                    "type": "TfsGit",
                    "author": {
                        "displayName": "User name",
                    },
                    "timestamp": "2021-07-13T17:40:46Z"
                }
            ]
        }))

        .get("/orga/project/_apis/build/builds/503/changes")
        .query(query || true)
        .reply(200, JSON.stringify({
            "count": 200,
            "value": truncatedChanges,
        }))

        .get("/orga/project/_apis/build/builds/504/changes")
        .query(query || true)
        .reply(500, JSON.stringify({ message: "Internal Server Error" }))

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
