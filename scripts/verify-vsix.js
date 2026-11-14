#!/usr/bin/env node
/*
 * Verifies the content of the packaged .vsix before it is published.
 * Usage: node scripts/verify-vsix.js <file.vsix>
 * Uses Node's built-in Buffer + zlib to inspect the ZIP archive (no external `unzip` binary required).
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.join(__dirname, "..");
const TASK = "changed-files";
const EXPECTED_LIBS = ["branch", "builds", "git-diff", "matcher", "parser", "util"];

/**
 * Parses a standard ZIP archive (.vsix) via its Central Directory and returns `{ entries, read }`.
 */
function openZipArchive(zipPath) {
    const buf = fs.readFileSync(zipPath);
    const EOCD_SIG = 0x06054b50;
    const CEN_SIG = 0x02014b50;
    const LOC_SIG = 0x04034b50;

    let eocdOffset = -1;
    const minOffset = Math.max(0, buf.length - 65557);
    for (let i = buf.length - 22; i >= minOffset; i--) {
        if (buf.readUInt32LE(i) === EOCD_SIG) {
            eocdOffset = i;
            break;
        }
    }
    if (eocdOffset < 0) {
        throw new Error(`Invalid ZIP archive (EOCD not found): ${zipPath}`);
    }

    const totalEntries = buf.readUInt16LE(eocdOffset + 10);
    const cdOffset = buf.readUInt32LE(eocdOffset + 16);

    const records = new Map();
    let ptr = cdOffset;
    for (let idx = 0; idx < totalEntries; idx++) {
        if (buf.readUInt32LE(ptr) !== CEN_SIG) {
            throw new Error(`Corrupt central directory entry at offset ${ptr}`);
        }
        const compressionMethod = buf.readUInt16LE(ptr + 10);
        const compressedSize = buf.readUInt32LE(ptr + 20);
        const fileNameLen = buf.readUInt16LE(ptr + 28);
        const extraLen = buf.readUInt16LE(ptr + 30);
        const commentLen = buf.readUInt16LE(ptr + 32);
        const localHeaderOffset = buf.readUInt32LE(ptr + 42);
        const rawName = buf.subarray(ptr + 46, ptr + 46 + fileNameLen).toString("utf-8").replace(/\\/g, "/");

        if (!rawName.endsWith("/")) {
            records.set(rawName, { compressionMethod, compressedSize, localHeaderOffset });
        }
        ptr += 46 + fileNameLen + extraLen + commentLen;
    }

    const read = entryName => {
        const rec = records.get(entryName);
        if (!rec) {
            throw new Error(`Entry "${entryName}" not found in ${zipPath}`);
        }
        if (buf.readUInt32LE(rec.localHeaderOffset) !== LOC_SIG) {
            throw new Error(`Invalid local header for "${entryName}"`);
        }
        const nameLen = buf.readUInt16LE(rec.localHeaderOffset + 26);
        const extraLen = buf.readUInt16LE(rec.localHeaderOffset + 28);
        const dataStart = rec.localHeaderOffset + 30 + nameLen + extraLen;
        const rawData = buf.subarray(dataStart, dataStart + rec.compressedSize);

        if (rec.compressionMethod === 0) {
            return rawData.toString("utf-8");
        }
        if (rec.compressionMethod === 8) {
            return zlib.inflateRawSync(rawData).toString("utf-8");
        }
        throw new Error(`Unsupported ZIP compression method ${rec.compressionMethod} for "${entryName}"`);
    };

    return {
        entries: Array.from(records.keys()),
        read,
    };
}

/**
 * Verifies a packaged `.vsix` file and returns `{ ok, failures, entries }`.
 */
function verifyVsix(vsixPath, { pkgVersion, quiet = false } = {}) {
    const pkg = pkgVersion ? { version: pkgVersion } : JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));
    const { entries, read } = openZipArchive(vsixPath);
    const has = entry => entries.includes(entry);

    const failures = [];
    const log = msg => {
        if (!quiet) {
            console.log(msg);
        }
    };
    const check = (ok, message) => {
        log(`${ok ? "OK  " : "FAIL"} ${message}`);
        if (!ok) {
            failures.push(message);
        }
    };

    // Task entry point and modules
    check(has(`${TASK}/task.json`), "task.json is packaged");
    check(has(`${TASK}/index.js`), "index.js (compiled entry point) is packaged");
    for (const lib of EXPECTED_LIBS) {
        check(has(`${TASK}/lib/${lib}.js`), `lib/${lib}.js is packaged`);
    }

    // Packaging hygiene: no tests, TypeScript sources, or temporary npm manifests
    const NM = `${TASK}/node_modules/`;
    check(!entries.some(e => e.startsWith(`${TASK}/tests/`)), "changed-files/tests/ is NOT packaged");
    check(
        !entries.some(e => e.startsWith(`${TASK}/`) && !e.startsWith(NM) && e.endsWith(".ts")),
        "TypeScript source files (*.ts) are NOT packaged"
    );
    check(!has(`${TASK}/package.json`), "changed-files/package.json is NOT packaged");
    check(!has(`${TASK}/package-lock.json`), "changed-files/package-lock.json is NOT packaged");

    if (has(`${TASK}/task.json`)) {
        const task = JSON.parse(read(`${TASK}/task.json`));
        const handlers = Object.keys(task.execution || {});
        check(Boolean(task.minimumAgentVersion), "task.json declares minimumAgentVersion");
        check(handlers.includes("Node24"), "task.json declares the Node24 handler");
        check(handlers.includes("Node20_1"), "task.json declares the Node20_1 handler");
        check(!handlers.some(h => /^Node(10|16)?$/i.test(h)), `no deprecated handler (found: ${handlers.join(", ")})`);
        for (const [handlerName, cfg] of Object.entries(task.execution || {})) {
            check(
                Boolean(cfg && cfg.target && has(`${TASK}/${cfg.target}`)),
                `handler ${handlerName} target "${cfg && cfg.target}" exists in package`
            );
        }
        const taskVersion = `${task.version.Major}.${task.version.Minor}.${task.version.Patch}`;
        check(taskVersion === pkg.version, `task.json version ${taskVersion} == package.json ${pkg.version}`);

        if (has(`${TASK}/index.js`)) {
            const codeSources = [
                read(`${TASK}/index.js`),
                ...EXPECTED_LIBS.filter(lib => has(`${TASK}/lib/${lib}.js`)).map(lib => read(`${TASK}/lib/${lib}.js`)),
            ].join("\n");
            const inputRegex = /get(?:Bool|Path|Delimited)?Input(?:Required)?\)?\(\s*["']([^"']+)["']/g;
            const usedInputs = [...codeSources.matchAll(inputRegex)].map(m => m[1]);
            const declared = (task.inputs || []).map(i => i.name);
            for (const input of new Set(usedInputs)) {
                check(declared.includes(input), `input "${input}" read by task code is declared in task.json`);
            }
        }
    }

    check(has("extension.vsixmanifest"), "extension.vsixmanifest is packaged");
    if (has("extension.vsixmanifest")) {
        const manifest = read("extension.vsixmanifest");
        check(
            new RegExp(`Version="${pkg.version.replace(/\./g, "\\.")}"`).test(manifest),
            `extension version == package.json ${pkg.version}`
        );
    }

    // Runtime dependencies (task-lib loads lib.json from its own folder at runtime)
    check(has(`${TASK}/node_modules/azure-pipelines-task-lib/task.js`), "azure-pipelines-task-lib is packaged");
    check(has(`${TASK}/node_modules/azure-pipelines-task-lib/lib.json`), "azure-pipelines-task-lib/lib.json resource is packaged");
    check(has(`${TASK}/node_modules/azure-devops-node-api/WebApi.js`), "azure-devops-node-api is packaged");
    check(has(`${TASK}/node_modules/minimatch/minimatch.js`), "minimatch is packaged");
    for (const dev of ["jest", "typescript", "eslint", "nock", "typescript-eslint"]) {
        check(!entries.some(e => e.startsWith(`${NM}${dev}/`)), `devDependency "${dev}" is NOT packaged`);
    }

    return { ok: failures.length === 0, failures, entries };
}

if (require.main === module) {
    const vsix = process.argv[2];
    if (!vsix) {
        console.error("Usage: node scripts/verify-vsix.js <file.vsix>");
        process.exit(2);
    }
    const result = verifyVsix(vsix);
    if (!result.ok) {
        console.error(`\n${result.failures.length} check(s) failed for ${vsix}`);
        process.exit(1);
    }
    console.log(`\nAll checks passed for ${vsix} (${result.entries.length} entries)`);
}

module.exports = { openZipArchive, verifyVsix };
