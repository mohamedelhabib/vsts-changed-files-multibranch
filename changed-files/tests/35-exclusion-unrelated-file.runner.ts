import { runScenario } from "./_helpers";

runScenario({
    "inputs": {
        "rules": "src/**\n!src/excluded.ts"
    },
    "exec": {
        "log -m -1 --name-only --pretty=format: latest_commit_id": {
            "code": 0,
            "stdout": "src/excluded.ts\nREADME.md"
        }
    }
});
