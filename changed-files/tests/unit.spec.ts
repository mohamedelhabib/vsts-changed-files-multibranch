import { parseRules, parseForceByCategory } from "../lib/parser";
import { matchFiles } from "../lib/matcher";

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

    test("CHARACTERIZATION B7: Should_Throw_When_LineHasNoColon", () => {
        expect(() => parseForceByCategory("A")).toThrow(TypeError);
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

    test("CHARACTERIZATION B2: Should_ReturnTrue_When_ExcludedFilePlusUnrelatedFile", () => {
        // Expected (correct) result is false: README.md is not included, src/a.ts is excluded.
        expect(matchFiles(["src/a.ts", "README.md"], ["src/**", "!src/a.ts"])).toBe(true);
    });

    test("CHARACTERIZATION: Should_IgnoreDotfiles_When_DefaultMinimatchOptions", () => {
        // minimatch default dot:false -> changes only under .github/ do not match "**".
        expect(matchFiles([".github/workflows/ci.yml"], ["**"])).toBe(false);
    });
});
