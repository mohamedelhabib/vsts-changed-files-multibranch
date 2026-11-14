import * as path from "path";
import { MockTestRunner } from "azure-pipelines-task-lib/mock-test";

/**
 * Runs a compiled task scenario (`*.runner.js` / `*.js`) in a child process using the
 * current Node executable (`process.execPath`), avoiding network downloads or `$HOME` writes.
 */
export async function runTask(file: string): Promise<MockTestRunner> {
    const tr = new MockTestRunner(path.join(__dirname, file));
    tr.nodePath = process.execPath;
    await tr.runAsync();
    return tr;
}
