import { runScenario } from "./_helpers";

runScenario({
    "inputs": {
        "rules": "[Code]\nsrc/**\n[Docs]\ndocs/**",
        "refBranch": "origin/master"
    },
    "sourceBranch": "refs/pull/12/merge",
    "exec": {
        "diff --name-only origin/master...": {
            "code": 0,
            "stdout": "docs/a.md"
        }
    }
});
