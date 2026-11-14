#!/usr/bin/env node
/*
 * Packages the Azure DevOps extension (.vsix) from an isolated temporary staging directory.
 * Ensures tests/, *.ts sources, and temporary package*.json files are never shipped in the VSIX
 * and the repository working tree is never left dirty if packaging fails.
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUTPUT_VSIX = path.join(ROOT, "vsts-changed-files-multibranch.vsix");

/**
 * Stages the clean extension payload into `stageDir` (without invoking `tfx`).
 */
function stageExtension(stageDir, { installProdDeps = true } = {}) {
    for (const rootFile of ["vss-extension.json", "README.md", "LICENSE"]) {
        fs.copyFileSync(path.join(ROOT, rootFile), path.join(stageDir, rootFile));
    }
    fs.cpSync(path.join(ROOT, "images"), path.join(stageDir, "images"), { recursive: true });

    const srcTaskDir = path.join(ROOT, "changed-files");
    const dstTaskDir = path.join(stageDir, "changed-files");
    const dstLibDir = path.join(dstTaskDir, "lib");
    fs.mkdirSync(dstLibDir, { recursive: true });

    fs.copyFileSync(path.join(srcTaskDir, "task.json"), path.join(dstTaskDir, "task.json"));
    fs.copyFileSync(path.join(srcTaskDir, "index.js"), path.join(dstTaskDir, "index.js"));

    const srcLibDir = path.join(srcTaskDir, "lib");
    for (const entry of fs.readdirSync(srcLibDir, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith(".js")) {
            fs.copyFileSync(path.join(srcLibDir, entry.name), path.join(dstLibDir, entry.name));
        }
    }

    if (installProdDeps) {
        const pkgJson = path.join(dstTaskDir, "package.json");
        const pkgLock = path.join(dstTaskDir, "package-lock.json");
        fs.copyFileSync(path.join(ROOT, "package.json"), pkgJson);
        fs.copyFileSync(path.join(ROOT, "package-lock.json"), pkgLock);

        const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
        execFileSync(npmBin, ["ci", "--omit=dev", "--ignore-scripts"], {
            cwd: dstTaskDir,
            stdio: "inherit",
        });

        fs.rmSync(pkgJson, { force: true });
        fs.rmSync(pkgLock, { force: true });
    }
}

function packVsix(outputPath = OUTPUT_VSIX) {
    const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), "cf-vsix-stage-"));
    try {
        stageExtension(stageDir, { installProdDeps: true });
        const tfxBin = process.platform === "win32" ? "tfx.cmd" : "tfx";
        execFileSync(
            tfxBin,
            ["extension", "create", "--manifest-globs", "vss-extension.json", "--output-path", outputPath],
            { cwd: stageDir, stdio: "inherit" }
        );
    }
    finally {
        fs.rmSync(stageDir, { recursive: true, force: true });
    }
}

if (require.main === module) {
    packVsix();
}

module.exports = { stageExtension, packVsix };
