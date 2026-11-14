import { runScenario } from "./_helpers";

runScenario({
    inputs: {
        rules: "[Code]\nsrc/**",
    },
    env: {
        SYSTEM_ACCESSTOKEN: undefined,
    },
    mockApi: false,
    exec: {},
});
