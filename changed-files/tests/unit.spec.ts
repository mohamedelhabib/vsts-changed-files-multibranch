import { parseRules, parseForceByCategory } from "../lib/parser";
import { matchFiles } from "../lib/matcher";
import { isSameBranch, normalizeBranch } from "../lib/branch";

/*
 * L1 - pure unit tests.
 * Tests tagged "CHARACTERIZATION Bx" lock the CURRENT (buggy) behavior.
 * They are intentionally flipped by the commit that fixes bug Bx.
 */

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

    test("Should_ResetCategory_When_HeaderDuplicated", () => {
        expect(parseRules("[A]\na/**\n[A]\nb/**", "V")).toEqual({ V: [], A: ["b/**"] });
    });
});

describe("parseForceByCategory", () => {
    beforeEach(() => jest.spyOn(console, "log").mockImplementation(() => undefined));
    afterEach(() => jest.restoreAllMocks());

    test("Should_ParseBooleans_When_ValidPairs", () => {
        expect(parseForceByCategory("A: true\nB:false\nC : TRUE")).toEqual({ A: true, B: false, C: true });
    });

    test("Should_ReturnEmpty_When_EmptyInput", () => {
        expect(parseForceByCategory("")).toEqual({});
        expect(parseForceByCategory("\n  \n")).toEqual({});
    });

    test("Should_TreatNonTrueAsFalse_When_UnknownValue", () => {
        expect(parseForceByCategory("A: yes")).toEqual({ A: false });
    });

    test("Should_ReportAndSkip_When_LineHasNoColon (B7)", () => {
        const invalid: string[] = [];
        expect(parseForceByCategory("A\nB: true\n: true", l => invalid.push(l))).toEqual({ B: true });
        expect(invalid).toEqual(["A", ": true"]);
    });

    test("Should_NotThrow_When_NoInvalidCallback", () => {
        expect(parseForceByCategory("A")).toEqual({});
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

    test("Should_ReturnFalse_When_ExcludedFilePlusUnrelatedFile (B2)", () => {
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

    test("CHARACTERIZATION: Should_IgnoreDotfiles_When_DefaultMinimatchOptions", () => {
        // minimatch default dot:false -> changes only under .github/ do not match "**".
        expect(matchFiles([".github/workflows/ci.yml"], ["**"])).toBe(false);
    });
});

describe("branch", () => {

    test.each([
        ["refs/heads/master", "master"],
        ["refs/heads/feature/x", "feature/x"],
        ["origin/master", "master"],
        ["refs/remotes/origin/master", "master"],
        [" master ", "master"],
        ["refs/pull/12/merge", "refs/pull/12/merge"],
    ])("Should_Normalize_%s_To_%s", (input, expected) => {
        expect(normalizeBranch(input)).toBe(expected);
    });

    test("Should_BeSameBranch_When_DifferentSpellings", () => {
        expect(isSameBranch("master", "refs/heads/master")).toBe(true);
        expect(isSameBranch("origin/master", "refs/heads/master")).toBe(true);
        expect(isSameBranch("refs/heads/master", "refs/heads/master")).toBe(true);
    });

    test("Should_NotBeSameBranch_When_DifferentBranchOrPullRequest", () => {
        expect(isSameBranch("origin/master", "refs/heads/feature/master")).toBe(false);
        expect(isSameBranch("origin/master", "refs/pull/12/merge")).toBe(false);
        expect(isSameBranch("origin/main", "refs/heads/master")).toBe(false);
    });
});
