import { runScenario } from "./_helpers";

runScenario({
    "inputs": {
        "rules": "[Code]\nsrc/**\n[Docs]\ndocs/**",
        "refBranch": "origin/master"
    },
    "sourceBranch": "refs/heads/feature/x",
    "exec": {
        "diff --name-only origin/master...": {
            "code": 0,
            "stdout": "src/a.ts\nREADME.md"
        }
    }
});
