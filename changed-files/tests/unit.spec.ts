import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as zlib from "zlib";

import { parseRules, parseForceByCategory } from "../lib/parser";
import { matchFiles } from "../lib/matcher";
import { isSameBranch, normalizeBranch, toRemoteRef } from "../lib/branch";
import { fromEntries, isSafeKey, sanitizeVso } from "../lib/util";

const ROOT_DIR = path.resolve(__dirname, "..", "..");

/**
 * Builds a minimal valid ZIP archive in memory (deflated entries) for testing `scripts/verify-vsix.js`.
 */
function buildZipBuffer(files: Record<string, string>): Buffer {
    const localParts: Buffer[] = [];
    const centralParts: Buffer[] = [];
    let offset = 0;
    const entries = Object.entries(files);

    for (const [name, content] of entries) {
        const nameBuf = Buffer.from(name, "utf-8");
        const rawBuf = Buffer.from(content, "utf-8");
        const compressed = zlib.deflateRawSync(rawBuf);

        const localHeader = Buffer.alloc(30);
        localHeader.writeUInt32LE(0x04034b50, 0);
        localHeader.writeUInt16LE(20, 4);
        localHeader.writeUInt16LE(0, 6);
        localHeader.writeUInt16LE(8, 8);
        localHeader.writeUInt32LE(0, 14);
        localHeader.writeUInt32LE(compressed.length, 18);
        localHeader.writeUInt32LE(rawBuf.length, 22);
        localHeader.writeUInt16LE(nameBuf.length, 26);
        localHeader.writeUInt16LE(0, 28);

        localParts.push(localHeader, nameBuf, compressed);

        const centralHeader = Buffer.alloc(46);
        centralHeader.writeUInt32LE(0x02014b50, 0);
        centralHeader.writeUInt16LE(20, 4);
        centralHeader.writeUInt16LE(20, 6);
        centralHeader.writeUInt16LE(0, 8);
        centralHeader.writeUInt16LE(8, 10);
        centralHeader.writeUInt32LE(0, 16);
        centralHeader.writeUInt32LE(compressed.length, 20);
        centralHeader.writeUInt32LE(rawBuf.length, 24);
        centralHeader.writeUInt16LE(nameBuf.length, 28);
        centralHeader.writeUInt16LE(0, 30);
        centralHeader.writeUInt16LE(0, 32);
        centralHeader.writeUInt32LE(offset, 42);

        centralParts.push(centralHeader, nameBuf);
        offset += localHeader.length + nameBuf.length + compressed.length;
    }

    const centralDir = Buffer.concat(centralParts);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(entries.length, 8);
    eocd.writeUInt16LE(entries.length, 10);
    eocd.writeUInt32LE(centralDir.length, 12);
    eocd.writeUInt32LE(offset, 16);

    return Buffer.concat([...localParts, centralDir, eocd]);
}

describe("parseRules", () => {

    test("Should_PutRulesInDefaultCategory_When_NoCategoryHeader", () => {
        expect(parseRules("src/**\ndocs/**", "HasChanged")).toEqual({ HasChanged: ["src/**", "docs/**"] });
    });

    test("Should_GroupRulesByCategory_When_HeadersPresent", () => {
        const rules = "root/**\n[Code]\nsrc/**\n!src/x.ts\n[Docs]\ndocs/**";
        expect(parseRules(rules, "HasChanged")).toEqual({
            HasChanged: ["root/**"],
            Code: ["src/**", "!src/x.ts"],
            Docs: ["docs/**"],
        });
    });

    test("Should_KeepEmptyCategory_When_HeaderHasNoRules", () => {
        expect(parseRules("[Code]\n[Docs]\ndocs/**", "HasChanged")).toEqual({ HasChanged: [], Code: [], Docs: ["docs/**"] });
    });

    test("Should_IgnoreBlankLinesAndWhitespace_When_CrLfInput", () => {
        expect(parseRules("  src/**  \r\n\r\n\t[Docs]\r\n docs/** \r\n", "V")).toEqual({ V: ["src/**"], Docs: ["docs/**"] });
    });

    test("Should_MergeCategoryRules_When_HeaderDuplicated", () => {
        expect(parseRules("[A]\na/**\n[A]\nb/**", "V")).toEqual({ V: [], A: ["a/**", "b/**"] });
    });

    test("Should_TrimCategoryHeaderWhitespace_When_SpacesInsideBrackets", () => {
        expect(parseRules("[ Code ]\nsrc/**", "V")).toEqual({ V: [], Code: ["src/**"] });
    });

    test("Should_IgnorePrototypeKeys_When_MaliciousCategoryHeadersProvided", () => {
        const parsed = parseRules("[__proto__]\npolluted/**\n[constructor]\nctor/**\n[Safe]\nsrc/**", "HasChanged");
        expect(parsed).toEqual({ HasChanged: [], Safe: ["src/**"] });
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });
});

describe("parseForceByCategory", () => {

    test("Should_ParseBooleans_When_ValidPairs", () => {
        expect(parseForceByCategory("A: true\nB:false\nC : TRUE")).toEqual({ A: true, B: false, C: true });
    });

    test("Should_AcceptBracketedCategoryName_When_MatchingRulesSyntax", () => {
        expect(parseForceByCategory("[Code]: true\n[Docs]: false")).toEqual({ Code: true, Docs: false });
    });

    test("Should_ReturnEmpty_When_EmptyInput", () => {
        expect(parseForceByCategory("")).toEqual({});
        expect(parseForceByCategory("\n  \n")).toEqual({});
    });

    test("Should_ReportAndIgnore_When_ValueIsNotBoolean", () => {
        const invalid: string[] = [];
        expect(parseForceByCategory("A: yes\nB: true", l => invalid.push(l))).toEqual({ B: true });
        expect(invalid).toEqual(["A: yes"]);
    });

    test("Should_ReportAndSkip_When_LineHasNoColon", () => {
        const invalid: string[] = [];
        expect(parseForceByCategory("A\nB: true\n: true", l => invalid.push(l))).toEqual({ B: true });
        expect(invalid).toEqual(["A", ": true"]);
    });

    test("Should_NotEmitConsoleLogNoise_When_ParsingForceByCategory", () => {
        const spy = jest.spyOn(console, "log").mockImplementation(() => undefined);
        try {
            expect(parseForceByCategory("A: true")).toEqual({ A: true });
            expect(spy).not.toHaveBeenCalled();
        }
        finally {
            spy.mockRestore();
        }
    });

    test("Should_RejectPrototypePollutionKeys_When_ParsingForceByCategory", () => {
        const invalid: string[] = [];
        const res = parseForceByCategory("__proto__: true\nconstructor: true\nCode: true", l => invalid.push(l));
        expect(res).toEqual({ Code: true });
        expect(invalid).toEqual(["__proto__: true", "constructor: true"]);
    });
});

describe("matchFiles", () => {

    test("Should_ReturnFalse_When_NoFiles", () => {
        expect(matchFiles([], ["**"])).toBe(false);
    });

    test("Should_ReturnTrue_When_IncludeMatches", () => {
        expect(matchFiles(["src/a.ts"], ["src/**"])).toBe(true);
    });

    test("Should_ReturnFalse_When_IncludeDoesNotMatch", () => {
        expect(matchFiles(["docs/a.md"], ["src/**"])).toBe(false);
    });

    test("Should_ReturnTrue_When_AnyOfSeveralIncludesMatches", () => {
        expect(matchFiles(["docs/a.md"], ["src/**", "docs/**"])).toBe(true);
    });

    test("Should_ReturnFalse_When_OnlyChangedFileIsExcluded", () => {
        expect(matchFiles(["src/a.ts"], ["src/**", "!src/a.ts"])).toBe(false);
    });

    test("Should_ReturnTrue_When_OneIncludedFileIsNotExcluded", () => {
        expect(matchFiles(["src/a.ts", "src/b.ts"], ["src/**", "!src/a.ts"])).toBe(true);
    });

    test("Should_ReturnFalse_When_OnlyExclusionRules", () => {
        expect(matchFiles(["src/a.ts"], ["!src/b.ts"])).toBe(false);
    });

    test("Should_ReturnFalse_When_ExcludedFilePlusUnrelatedFile", () => {
        expect(matchFiles(["src/a.ts", "README.md"], ["src/**", "!src/a.ts"])).toBe(false);
    });

    test("Should_ReturnTrue_When_ExcludedFilePlusOtherIncludedFile", () => {
        expect(matchFiles(["src/a.ts", "README.md", "src/b.ts"], ["src/**", "!src/a.ts"])).toBe(true);
    });

    test("Should_ApplyAllExclusions_When_SeveralExclusions", () => {
        expect(matchFiles(["src/a.ts", "src/b.md"], ["src/**", "!src/a.ts", "!**/*.md"])).toBe(false);
        expect(matchFiles(["src/a.ts", "src/c.ts"], ["src/**", "!src/a.ts", "!**/*.md"])).toBe(true);
    });

    test("Should_NotDependOnRuleOrder_When_ExclusionBeforeInclusion", () => {
        expect(matchFiles(["src/a.ts", "README.md"], ["!src/a.ts", "src/**"])).toBe(false);
    });

    test("Should_IgnoreCommentLines_When_RulesContainHashComments", () => {
        expect(matchFiles(["#readme.md"], ["# comment line", "src/**"])).toBe(false);
        expect(matchFiles(["src/index.ts"], ["# comment line", "src/**"])).toBe(true);
    });

    test("Should_NormalizeWindowsBackslashesAndDotSlash_When_EvaluatingRules", () => {
        expect(matchFiles(["src/sub/file.ts"], ["src\\**\\*.ts"])).toBe(true);
        expect(matchFiles(["src/sub/file.ts"], ["./src/**/*.ts"])).toBe(true);
        expect(matchFiles(["./src\\sub\\file.ts"], ["src/**", "!./src\\sub\\file.ts"])).toBe(false);
    });

    test("Should_IgnoreDotfilesByDefaultAndMatchWhenDotOptionEnabled_When_EvaluatingGlobs", () => {
        expect(matchFiles([".github/workflows/ci.yml"], ["**"])).toBe(false);
        expect(matchFiles([".github/workflows/ci.yml"], ["**"], { dot: true })).toBe(true);
        expect(matchFiles(["src/.eslintrc.json"], ["src/**"], { dot: true })).toBe(true);
    });
});

describe("branch & ref normalization", () => {

    test.each([
        ["refs/heads/master", "master"],
        ["refs/heads/feature/x", "feature/x"],
        ["refs/heads/origin/foo", "origin/foo"],
        ["origin/master", "master"],
        ["refs/remotes/origin/master", "master"],
        ["refs/remotes/upstream/release/1.0", "release/1.0"],
        [" master ", "master"],
        ["refs/pull/12/merge", "refs/pull/12/merge"],
    ])("Should_Normalize_%s_To_%s", (input, expected) => {
        expect(normalizeBranch(input)).toBe(expected);
    });

    test.each([
        ["master", "origin/master"],
        ["release/1.0", "origin/release/1.0"],
        ["refs/heads/master", "origin/master"],
        ["refs/heads/feature/x", "origin/feature/x"],
        ["origin/master", "origin/master"],
        ["refs/remotes/origin/master", "origin/master"],
        ["refs/remotes/upstream/main", "upstream/main"],
    ])("Should_ConvertToRemoteRef_%s_To_%s", (input, expected) => {
        expect(toRemoteRef(input)).toBe(expected);
    });

    test("Should_BeSameBranch_When_DifferentSpellings", () => {
        expect(isSameBranch("master", "refs/heads/master")).toBe(true);
        expect(isSameBranch("origin/master", "refs/heads/master")).toBe(true);
        expect(isSameBranch("refs/remotes/upstream/master", "refs/heads/master")).toBe(true);
    });

    test("Should_NotCollide_When_LocalBranchStartsWithOriginPrefix", () => {
        expect(isSameBranch("refs/heads/origin/foo", "refs/heads/foo")).toBe(false);
    });

    test("Should_NotBeSameBranch_When_DifferentBranchOrPullRequest", () => {
        expect(isSameBranch("origin/master", "refs/heads/feature/master")).toBe(false);
        expect(isSameBranch("origin/master", "refs/pull/12/merge")).toBe(false);
        expect(isSameBranch("origin/main", "refs/heads/master")).toBe(false);
    });
});

describe("util & manifest contracts", () => {

    test("Should_NeutralizeVsoMarkersCaseInsensitively_When_SanitizingStrings", () => {
        expect(sanitizeVso("hello ##vso[task.setvariable variable=X;]true")).toBe("hello ##_vso[task.setvariable variable=X;]true");
        expect(sanitizeVso("##VSO[task.prependpath]/tmp")).toBe("##_vso[task.prependpath]/tmp");
    });

    test("Should_FilterReservedKeys_When_BuildingFromEntries", () => {
        expect(isSafeKey("__proto__")).toBe(false);
        expect(isSafeKey("constructor")).toBe(false);
        expect(isSafeKey("CodeChanged")).toBe(true);
        expect(fromEntries([["__proto__", true], ["CodeChanged", false]])).toEqual({ CodeChanged: false });
    });

    test("Should_HaveConsistentManifestMetadata_When_InspectingTaskAndPackageJson", () => {
        const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf-8")) as { version: string };
        const ext = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "vss-extension.json"), "utf-8")) as { version: string };
        const task = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "changed-files", "task.json"), "utf-8")) as {
            version: { Major: number; Minor: number; Patch: number };
            minimumAgentVersion?: string;
            inputs: Array<{ name: string; required?: boolean }>;
        };

        expect(ext.version).toBe(pkg.version);
        expect(`${task.version.Major}.${task.version.Minor}.${task.version.Patch}`).toBe(pkg.version);
        expect(task.minimumAgentVersion).toBe("3.227.0");

        const byName = new Map(task.inputs.map(i => [i.name, i]));
        expect(byName.get("refBranch")?.required).toBe(false);
        expect(byName.get("forceToTrue")?.required).toBe(false);
        expect(byName.get("matchDotFiles")?.required).toBe(false);
    });

    test("Should_ValidateVsixHygieneAndCatchMissingModules_When_RunningVerifyVsixScript", () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cf-vsix-test-"));
        try {
            const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf-8")) as { version: string };
            const taskRaw = fs.readFileSync(path.join(ROOT_DIR, "changed-files", "task.json"), "utf-8");
            const indexRaw = fs.readFileSync(path.join(ROOT_DIR, "changed-files", "index.js"), "utf-8");

            const baseEntries: Record<string, string> = {
                "extension.vsixmanifest": `<PackageManifest><Metadata><Identity Version="${pkg.version}" /></Metadata></PackageManifest>`,
                "changed-files/task.json": taskRaw,
                "changed-files/index.js": indexRaw,
                "changed-files/lib/branch.js": "// branch",
                "changed-files/lib/builds.js": "// builds",
                "changed-files/lib/git-diff.js": "// git-diff",
                "changed-files/lib/matcher.js": "// matcher",
                "changed-files/lib/parser.js": "// parser",
                "changed-files/lib/util.js": "// util",
                "changed-files/node_modules/azure-pipelines-task-lib/task.js": "// task-lib",
                "changed-files/node_modules/azure-pipelines-task-lib/lib.json": "{}",
                "changed-files/node_modules/azure-devops-node-api/WebApi.js": "// azdev",
                "changed-files/node_modules/minimatch/minimatch.js": "// minimatch",
            };

            const validVsix = path.join(tmpDir, "valid.vsix");
            fs.writeFileSync(validVsix, buildZipBuffer(baseEntries));
            const verifyScript = path.join(ROOT_DIR, "scripts", "verify-vsix.js");

            const okOut = execFileSync(process.execPath, [verifyScript, validVsix], { encoding: "utf-8" });
            expect(okOut).toContain("All checks passed");

            // Now inject a leaked test file and omit lib/branch.js -> verify-vsix MUST fail
            const dirtyEntries: Record<string, string> = {
                ...baseEntries,
                "changed-files/tests/unit.spec.js": "// leaked test",
                "changed-files/index.ts": "// leaked ts",
            };
            delete dirtyEntries["changed-files/lib/branch.js"];

            const dirtyVsix = path.join(tmpDir, "dirty.vsix");
            fs.writeFileSync(dirtyVsix, buildZipBuffer(dirtyEntries));
            expect(() => execFileSync(process.execPath, [verifyScript, dirtyVsix], { encoding: "utf-8", stdio: "pipe" })).toThrow();
        }
        finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    test("Should_ExcludeTestsAndTypeScriptSources_When_StagingExtensionPayload", () => {
        const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), "cf-stage-test-"));
        try {
            const packScript = path.join(ROOT_DIR, "scripts", "pack-vsix.js");
            execFileSync(
                process.execPath,
                ["-e", `require(${JSON.stringify(packScript)}).stageExtension(${JSON.stringify(stageDir)}, { installProdDeps: false })`],
                { encoding: "utf-8" }
            );

            expect(fs.existsSync(path.join(stageDir, "vss-extension.json"))).toBe(true);
            expect(fs.existsSync(path.join(stageDir, "changed-files", "task.json"))).toBe(true);
            expect(fs.existsSync(path.join(stageDir, "changed-files", "index.js"))).toBe(true);
            expect(fs.existsSync(path.join(stageDir, "changed-files", "lib", "branch.js"))).toBe(true);
            expect(fs.existsSync(path.join(stageDir, "changed-files", "tests"))).toBe(false);
            expect(fs.existsSync(path.join(stageDir, "changed-files", "index.ts"))).toBe(false);
            expect(fs.existsSync(path.join(stageDir, "changed-files", "package.json"))).toBe(false);
        }
        finally {
            fs.rmSync(stageDir, { recursive: true, force: true });
        }
    });

    test("Should_UpdateManifestsAndRejectPrerelease_When_RunningVersionScript", () => {
        const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), "cf-ver-test-"));
        try {
            fs.mkdirSync(path.join(tmpRepo, "changed-files"), { recursive: true });
            fs.copyFileSync(path.join(ROOT_DIR, "vss-extension.json"), path.join(tmpRepo, "vss-extension.json"));
            fs.copyFileSync(path.join(ROOT_DIR, "changed-files", "task.json"), path.join(tmpRepo, "changed-files", "task.json"));

            const versionScript = path.join(ROOT_DIR, "scripts", "version.js");

            // Valid Major.Minor.Patch bump
            fs.writeFileSync(path.join(tmpRepo, "package.json"), JSON.stringify({ version: "2.7.1" }));
            execFileSync(
                process.execPath,
                ["-e", `require(${JSON.stringify(versionScript)}).run(${JSON.stringify(tmpRepo)}).catch(e => { console.error(e); process.exit(1); })`],
                { encoding: "utf-8" }
            );
            const updatedTask = JSON.parse(fs.readFileSync(path.join(tmpRepo, "changed-files", "task.json"), "utf-8")) as {
                version: { Major: number; Minor: number; Patch: number };
            };
            expect(updatedTask.version).toEqual({ Major: 2, Minor: 7, Patch: 1 });

            // Invalid pre-release version must fail instead of writing NaN
            fs.writeFileSync(path.join(tmpRepo, "package.json"), JSON.stringify({ version: "2.8.0-rc.1" }));
            expect(() =>
                execFileSync(
                    process.execPath,
                    ["-e", `require(${JSON.stringify(versionScript)}).run(${JSON.stringify(tmpRepo)}).catch(e => { console.error(e); process.exit(1); })`],
                    { encoding: "utf-8", stdio: "pipe" }
                )
            ).toThrow();
        }
        finally {
            fs.rmSync(tmpRepo, { recursive: true, force: true });
        }
    });
});
