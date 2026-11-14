import { runScenario } from "./_helpers";

runScenario({
    inputs: {
        rules: "[Code]\nsrc/**\n[Docs]\ndocs/**",
    },
    env: {
        BUILD_BUILDID: "503",
    },
    exec: {},
});
