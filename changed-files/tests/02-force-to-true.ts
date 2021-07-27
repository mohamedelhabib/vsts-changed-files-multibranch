import * as path from "path";
import * as tmrm from "azure-pipelines-task-lib/mock-run";

import { mockTfsApi, setCommonsVariable } from "./_helpers";

const currentTestContext = setCommonsVariable({ DEFINITION_ID: "100" });

const tmr = new tmrm.TaskMockRunner(path.join(__dirname, "..", "index.js"));

tmr.setInput("rules", "**");
tmr.setInput("variable", "HasChanged");
tmr.setInput("isOutput", "true");
tmr.setInput("forceToTrue", "true");
tmr.setInput("verbose", "true");

tmr.setAnswers({});

mockTfsApi({
    build: {
        buildNumber: "20200101.1",
        sourceVersion: currentTestContext.SOURCE_VERSION
    }
});

tmr.run();

