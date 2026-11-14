import { GIT_DIFF_ORIGIN_MASTER, runScenario } from "./_helpers";

runScenario({
    inputs: {
        rules: "[Code]\nsrc/**\n[Docs]\ndocs/**",
        refBranch: "refs/heads/master",
    },
    sourceBranch: "refs/heads/feature/x",
    env: {
        SYSTEM_ACCESSTOKEN: undefined,
        SYSTEM_TEAMPROJECTID: undefined,
        BUILD_BUILDID: undefined,
    },
    mockApi: false,
    exec: {
        [GIT_DIFF_ORIGIN_MASTER]: {
            code: 0,
            stdout: "src/a.ts\nREADME.md",
        },
    },
});
