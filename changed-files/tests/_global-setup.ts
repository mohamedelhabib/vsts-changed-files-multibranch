import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/**
 * Jest global setup.
 *
 * azure-pipelines-task-lib's MockTestRunner spawns the task with a Node binary
 * cached in ~/azure-pipelines-task-lib/_download/node<major> and downloads it
 * from nodejs.org when missing. When the current Node major is a supported
 * task handler (20 or 24) we register the running binary as that cache entry,
 * so tests run offline and a CI matrix really exercises each handler.
 */
const MOCK_RUNNER_VERSIONS: Record<number, string> = { 20: "v20.13.1", 24: "v24.10.0" };

export default function globalSetup(): void {
    const major = parseInt(process.versions.node.split(".")[0], 10);
    const version = MOCK_RUNNER_VERSIONS[major];
    if (!version) {
        console.warn(`\n[global-setup] Node ${major} is not a task handler version (20/24): MockTestRunner will download Node.`);
        return;
    }

    const home = process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE || os.homedir();
    const destination = path.join(home, "azure-pipelines-task-lib", "_download", `node${major}`);
    const exe = process.platform === "win32"
        ? path.join(destination, "node.exe")
        : path.join(destination, `node-${version}-${process.platform}-x64`, "bin", "node");
    const marker = `${destination}.completed`;

    if (fs.existsSync(exe) && fs.existsSync(marker)) {
        return;
    }

    fs.mkdirSync(path.dirname(exe), { recursive: true });
    if (process.platform === "win32") {
        fs.copyFileSync(process.execPath, exe);
    } else {
        fs.rmSync(exe, { force: true });
        fs.symlinkSync(process.execPath, exe);
    }
    fs.writeFileSync(marker, "");
}
