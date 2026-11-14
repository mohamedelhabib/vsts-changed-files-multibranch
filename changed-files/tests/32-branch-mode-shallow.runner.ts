import { runScenario } from "./_helpers";

runScenario({
    "inputs": {
        "rules": "[Code]\nsrc/**\n[Docs]\ndocs/**",
        "refBranch": "origin/master"
    },
    "sourceBranch": "refs/heads/feature/x",
    "exec": {
        "diff --relative --no-renames --name-only --end-of-options origin/master... --": {
            "code": 128,
            "stderr": "fatal: origin/master...HEAD: no merge base"
        }
    }
});
