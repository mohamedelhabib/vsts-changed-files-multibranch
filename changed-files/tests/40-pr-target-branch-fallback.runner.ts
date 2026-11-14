import { runScenario } from "./_helpers";

runScenario({
    inputs: {
        rules: "[Code]\nsrc/**\n[Docs]\ndocs/**",
    },
    sourceBranch: "refs/pull/42/merge",
    env: {
        SYSTEM_PULLREQUEST_TARGETBRANCH: "refs/heads/release/1.0",
        SYSTEM_ACCESSTOKEN: undefined,
    },
    mockApi: false,
    exec: {
        "diff --relative --no-renames --name-only --end-of-options origin/release/1.0... --": {
            code: 0,
            stdout: "docs/guide.md",
        },
    },
});
