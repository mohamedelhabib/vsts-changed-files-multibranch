import { GIT_LOG_SINGLE, runScenario } from "./_helpers";

runScenario({
    inputs: {
        rules: "[Code]\nsrc/**\n[OnlyExcludes]\n!src/ignore.ts",
        forceByCategory: "MissingCategory: true",
    },
    verbose: false,
    exec: {
        [GIT_LOG_SINGLE]: {
            code: 0,
            stdout: "src/app.ts",
        },
    },
});
