import { runScenario } from "./_helpers";

runScenario({
    "inputs": {
        "rules": "src/**\n!src/excluded.ts"
    },
    "exec": {
        "log --first-parent -m -1 --relative --no-renames --name-only --pretty=format: --end-of-options latest_commit_id --": {
            "code": 0,
            "stdout": "src/excluded.ts\nREADME.md"
        }
    }
});
