import { runScenario } from "./_helpers";

runScenario({
    "inputs": {
        "rules": "[Code]\nsrc/**\n[Docs]\ndocs/**"
    },
    "exec": {
        "log -m -1 --name-only --pretty=format: latest_commit_id": {
            "code": 128,
            "stderr": "fatal: bad object latest_commit_id"
        }
    }
});
