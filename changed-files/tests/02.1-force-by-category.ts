import * as path from "path";
import * as tmrm from "azure-pipelines-task-lib/mock-run";

import { mockTfsApi, setCommonsVariable } from "./_helpers";

setCommonsVariable();

const tmr = new tmrm.TaskMockRunner(path.join(__dirname, "..", "index.js"));

tmr.setInput("rules", `
[CodeChanged]
src/**/*.ts

[DocumentationChanged]
docs/**/*.md

[TestsChanged]
tests/**/*.ts`);
tmr.setInput("variable", "HasChanged");
tmr.setInput("isOutput", "true");
tmr.setInput("verbose", "true");
tmr.setInput("forceByCategory", `
CodeChanged:true
TestsChanged:true`);

tmr.setAnswers({
    which: {
        "git": "/bin/git"
    },
    exist: {
        "/bin/git": true
    },
    checkPath: {
        "/bin/git": true
    },
    exec: {
        "/bin/git log -m -1 --name-only --pretty=format: latest_commit_id": {
            code: 0,
            stdout: "docs/index.other"
        }
    }
});

mockTfsApi();

tmr.run();
