const path = require("path");
const fs = require("fs").promises;

const ROOT = path.join(__dirname, "..");
const SEMVER_REGEX = /^(\d+)\.(\d+)\.(\d+)$/;

if (require.main === module) {
    run().catch(err => {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
    });
}

async function run(rootDir = ROOT) {
    const { version } = await readJSON(path.join(rootDir, "package.json"));
    const match = SEMVER_REGEX.exec(version);
    if (!match) {
        throw new Error(
            `Invalid version "${version}" in package.json: Azure DevOps task versions require strict Major.Minor.Patch integers.`
        );
    }

    const parsed = {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
    };

    await updateExtension(rootDir, version);
    await updateTask(rootDir, parsed);
}

async function updateExtension(rootDir, version) {
    const extPath = path.join(rootDir, "vss-extension.json");
    const ext = await readJSON(extPath);
    ext.version = version;
    await writeJSON(extPath, ext);
}

async function updateTask(rootDir, { major, minor, patch }) {
    const taskPath = path.join(rootDir, "changed-files", "task.json");
    const task = await readJSON(taskPath);
    task.version.Major = major;
    task.version.Minor = minor;
    task.version.Patch = patch;
    await writeJSON(taskPath, task);
}

async function readJSON(filePath) {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content);
}

async function writeJSON(filePath, json) {
    const content = `${JSON.stringify(json, null, 2)}\n`;
    await fs.writeFile(filePath, content, "utf-8");
}

module.exports = { run };
