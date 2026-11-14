import { runScenario } from "./_helpers";

runScenario({
    "inputs": {
        "rules": "[Code]\nsrc/**\n[Docs]\ndocs/**"
    },
    "exec": {
        "log --first-parent -m -1 --relative --no-renames --name-only --pretty=format: --end-of-options latest_commit_id --": {
            "code": 128,
            "stderr": "fatal: bad object latest_commit_id"
        }
    }
});
