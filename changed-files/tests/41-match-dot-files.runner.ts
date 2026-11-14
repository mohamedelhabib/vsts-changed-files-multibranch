import { GIT_LOG_SINGLE, runScenario } from "./_helpers";

runScenario({
    inputs: {
        rules: "[Ci]\n.github/**\n[Code]\nsrc/**",
        matchDotFiles: "true",
    },
    exec: {
        [GIT_LOG_SINGLE]: {
            code: 0,
            stdout: ".github/workflows/ci.yml",
        },
    },
});
