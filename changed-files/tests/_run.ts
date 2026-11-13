import * as path from "path";
import { MockTestRunner } from "azure-pipelines-task-lib/mock-test";

/**
 * Runs a task scenario (compiled *.runner.js / *.js file in this folder) with
 * the Node major currently running Jest when it is a task handler (20 or 24),
 * otherwise with the highest handler declared in task.json.
 */
export async function runTask(file: string): Promise<MockTestRunner> {
    const major = parseInt(process.versions.node.split(".")[0], 10);
    const nodeVersion = major === 20 || major === 24 ? major : undefined;

    const tr = new MockTestRunner(path.join(__dirname, file));
    await tr.runAsync(nodeVersion);
    return tr;
}
