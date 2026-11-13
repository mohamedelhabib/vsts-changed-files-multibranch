import { runScenario } from "./_helpers";

runScenario({
    "inputs": {
        "rules": "[Code]\nsrc/**\n[Docs]\ndocs/**",
        "forceByCategory": "Code: true\nDocs"
    },
    "exec": {
        "log -m -1 --name-only --pretty=format: latest_commit_id": {
            "code": 0,
            "stdout": "README.md"
        }
    }
});
