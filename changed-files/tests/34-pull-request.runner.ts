import { runScenario } from "./_helpers";

runScenario({
    "inputs": {
        "rules": "[Code]\nsrc/**\n[Docs]\ndocs/**",
        "refBranch": "origin/master"
    },
    "sourceBranch": "refs/pull/12/merge",
    "exec": {
        "diff --relative --no-renames --name-only --end-of-options origin/master... --": {
            "code": 0,
            "stdout": "docs/a.md"
        }
    }
});
