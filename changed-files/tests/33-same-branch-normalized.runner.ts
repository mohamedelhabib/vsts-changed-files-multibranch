import { runScenario } from "./_helpers";

runScenario({
    "inputs": {
        "rules": "[Code]\nsrc/**\n[Docs]\ndocs/**",
        "refBranch": "master"
    },
    "sourceBranch": "refs/heads/master",
    "exec": {
        "log --first-parent -m -1 --relative --no-renames --name-only --pretty=format: --end-of-options latest_commit_id --": {
            "code": 0,
            "stdout": "docs/a.md"
        }
    }
});
