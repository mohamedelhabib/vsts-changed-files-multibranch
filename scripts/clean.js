#!/usr/bin/env node
/*
 * Removes compiled .js artifacts under changed-files/ (excluding node_modules/)
 * so renamed or deleted TypeScript sources never leave stale .js files behind.
 */
const fs = require("fs");
const path = require("path");

const TASK_DIR = path.join(__dirname, "..", "changed-files");

function cleanDir(dir) {
    if (!fs.existsSync(dir)) {
        return;
    }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules") {
            continue;
        }
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            cleanDir(fullPath);
        }
        else if (entry.isFile() && (entry.name.endsWith(".js") || entry.name.endsWith(".js.log"))) {
            fs.rmSync(fullPath, { force: true });
        }
    }
}

if (require.main === module) {
    cleanDir(TASK_DIR);
}

module.exports = { cleanDir };
