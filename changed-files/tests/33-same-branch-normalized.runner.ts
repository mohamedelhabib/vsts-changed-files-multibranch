import { runScenario } from "./_helpers";

runScenario({
    "inputs": {
        "rules": "[Code]\nsrc/**\n[Docs]\ndocs/**",
        "refBranch": "master"
    },
    "sourceBranch": "refs/heads/master",
    "exec": {
        "log -m -1 --name-only --pretty=format: latest_commit_id": {
            "code": 0,
            "stdout": "docs/a.md"
        }
    }
});
