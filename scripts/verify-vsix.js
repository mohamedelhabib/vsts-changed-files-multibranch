#!/usr/bin/env node
/*
 * Verifies the content of the packaged .vsix before it is published.
 * Usage: node scripts/verify-vsix.js <file.vsix>
 * Requires the `unzip` CLI (available on GitHub ubuntu runners).
 */
const { execFileSync } = require("child_process");
const path = require("path");

const vsix = process.argv[2];
if (!vsix) {
    console.error("Usage: node scripts/verify-vsix.js <file.vsix>");
    process.exit(2);
}

const ROOT = path.join(__dirname, "..");
const pkg = require(path.join(ROOT, "package.json"));
const TASK = "changed-files";

const entries = execFileSync("unzip", ["-Z1", vsix], { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 })
    .split("\n").map(l => l.trim()).filter(Boolean);
const read = entry => execFileSync("unzip", ["-p", vsix, entry], { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 });
const has = entry => entries.includes(entry);

const failures = [];
const check = (ok, message) => {
    console.log(`${ok ? "OK  " : "FAIL"} ${message}`);
    if (!ok) failures.push(message);
};

// Task entry point and modules
check(has(`${TASK}/task.json`), "task.json is packaged");
check(has(`${TASK}/index.js`), "index.js (compiled entry point) is packaged");
for (const lib of ["builds", "git-diff", "matcher", "parser", "util"]) {
    check(has(`${TASK}/lib/${lib}.js`), `lib/${lib}.js is packaged`);
}

// Execution handlers and version
const task = JSON.parse(read(`${TASK}/task.json`));
const handlers = Object.keys(task.execution || {});
check(handlers.includes("Node24"), "task.json declares the Node24 handler");
check(handlers.includes("Node20_1"), "task.json declares the Node20_1 handler");
check(!handlers.some(h => /^Node(10|16)?$/i.test(h)), `no deprecated handler (found: ${handlers.join(", ")})`);
const taskVersion = `${task.version.Major}.${task.version.Minor}.${task.version.Patch}`;
check(taskVersion === pkg.version, `task.json version ${taskVersion} == package.json ${pkg.version}`);

const manifest = read("extension.vsixmanifest");
check(new RegExp(`Version="${pkg.version.replace(/\./g, "\\.")}"`).test(manifest), `extension version == package.json ${pkg.version}`);

// Every input read by the code must be declared in task.json (the agent only passes declared inputs)
const indexJs = read(`${TASK}/index.js`);
const usedInputs = [...indexJs.matchAll(/get(?:Bool)?Input\)?\(\s*"([^"]+)"/g)].map(m => m[1]);
const declared = task.inputs.map(i => i.name);
for (const input of new Set(usedInputs)) {
    check(declared.includes(input), `input "${input}" read by index.js is declared in task.json`);
}

// Runtime dependencies (task-lib loads lib.json from its own folder at runtime)
const NM = `${TASK}/node_modules`;
check(has(`${NM}/azure-pipelines-task-lib/task.js`), "azure-pipelines-task-lib is packaged");
check(has(`${NM}/azure-pipelines-task-lib/lib.json`), "azure-pipelines-task-lib/lib.json resource is packaged");
check(has(`${NM}/azure-devops-node-api/WebApi.js`), "azure-devops-node-api is packaged");
check(has(`${NM}/minimatch/minimatch.js`), "minimatch is packaged");
for (const dev of ["jest", "typescript", "eslint", "nock"]) {
    check(!entries.some(e => e.startsWith(`${NM}/${dev}/`)), `devDependency "${dev}" is NOT packaged`);
}

if (failures.length) {
    console.error(`\n${failures.length} check(s) failed for ${vsix}`);
    process.exit(1);
}
console.log(`\nAll checks passed for ${vsix} (${entries.length} entries)`);
