import { GIT_DIFF_ORIGIN_MASTER, GIT_LOG_SINGLE } from "./_helpers";
import { runTask } from "./_run";

const v = (name: string, value: boolean): string => `##vso[task.setvariable variable=${name};isOutput=true;]${value}`;
const LOG = `/bin/git -c core.quotePath=false ${GIT_LOG_SINGLE}`;
const DIFF = `/bin/git -c core.quotePath=false ${GIT_DIFF_ORIGIN_MASTER}`;

describe("fail-safe on git and API errors", () => {

    test("Should_SetAllVariablesTrueWithWarning_When_GitFailsInCommitMode", async () => {
        const tr = await runTask("30-git-failure.runner.js");

        expect(tr.succeeded).toBe(true);
        expect(tr.errorIssues).toHaveLength(0);
        expect(tr.warningIssues).toHaveLength(1);
        expect(tr.warningIssues[0]).toContain("Unable to compute changed files");
        expect(tr.warningIssues[0]).toContain("fetchDepth: 0");
        expect(tr.stdout).toContain(v("Code", true));
        expect(tr.stdout).toContain(v("Docs", true));
    });

    test("Should_SetAllVariablesTrueWithWarning_When_NoMergeBaseInBranchMode", async () => {
        const tr = await runTask("32-branch-mode-shallow.runner.js");

        expect(tr.succeeded).toBe(true);
        expect(tr.ran(DIFF)).toBe(true);
        expect(tr.warningIssues).toHaveLength(1);
        expect(tr.warningIssues[0]).toContain("no merge base");
        expect(tr.stdout).toContain(v("Code", true));
        expect(tr.stdout).toContain(v("Docs", true));
    });

    test("Should_SetAllVariablesTrueWithWarning_When_BuildChangesTruncatedAt200Commits", async () => {
        const tr = await runTask("37-truncated-build-changes.runner.js");

        expect(tr.succeeded).toBe(true);
        expect(tr.invokedToolCount).toBe(0);
        expect(tr.errorIssues).toHaveLength(0);
        expect(tr.warningIssues).toHaveLength(1);
        expect(tr.warningIssues[0]).toContain("200 commits");
        expect(tr.stdout).toContain(v("Code", true));
        expect(tr.stdout).toContain(v("Docs", true));
    });
});

describe("branch mode (refBranch & PR target fallback)", () => {

    test("Should_DiffAgainstRefBranch_When_BuildingFeatureBranch", async () => {
        const tr = await runTask("31-branch-mode.runner.js");

        expect(tr.succeeded).toBe(true);
        expect(tr.ran(DIFF)).toBe(true);
        expect(tr.invokedToolCount).toBe(1);
        expect(tr.warningIssues).toHaveLength(0);
        expect(tr.stdout).toContain(v("Code", true));
        expect(tr.stdout).toContain(v("Docs", false));
    });

    test("Should_UseBuildCommits_When_RefBranchIsCurrentBranchWithOtherSpelling", async () => {
        const tr = await runTask("33-same-branch-normalized.runner.js");

        expect(tr.succeeded).toBe(true);
        expect(tr.ran(LOG)).toBe(true);
        expect(tr.invokedToolCount).toBe(1);
        expect(tr.warningIssues).toHaveLength(0);
        expect(tr.stdout).toContain(v("Code", false));
        expect(tr.stdout).toContain(v("Docs", true));
    });

    test("Should_DiffAgainstRefBranch_When_PullRequestBuild", async () => {
        const tr = await runTask("34-pull-request.runner.js");

        expect(tr.succeeded).toBe(true);
        expect(tr.ran(DIFF)).toBe(true);
        expect(tr.stdout).toContain(v("Code", false));
        expect(tr.stdout).toContain(v("Docs", true));
    });

    test("Should_SucceedWithoutAccessTokenOrApiCall_When_BranchModeWithHeadsRef", async () => {
        const tr = await runTask("38-branch-mode-without-token.runner.js");

        expect(tr.succeeded).toBe(true);
        expect(tr.ran(DIFF)).toBe(true);
        expect(tr.invokedToolCount).toBe(1);
        expect(tr.warningIssues).toHaveLength(0);
        expect(tr.errorIssues).toHaveLength(0);
        expect(tr.stdout).toContain(v("Code", true));
        expect(tr.stdout).toContain(v("Docs", false));
    });

    test("Should_FailWithClearEnvironmentError_When_AccessTokenMissingInCommitMode", async () => {
        const tr = await runTask("39-commit-mode-missing-token.runner.js");

        expect(tr.succeeded).toBe(false);
        expect(tr.invokedToolCount).toBe(0);
        expect(tr.errorIssues).toEqual([
            expect.stringContaining('Environment Error: This task requires "System.AccessToken" variable.'),
        ]);
    });

    test("Should_FallbackToPullRequestTargetBranch_When_RefBranchInputOmittedOnPrBuild", async () => {
        const tr = await runTask("40-pr-target-branch-fallback.runner.js");

        expect(tr.succeeded).toBe(true);
        expect(
            tr.ran("/bin/git -c core.quotePath=false diff --relative --no-renames --name-only --end-of-options origin/release/1.0... --")
        ).toBe(true);
        expect(tr.warningIssues).toHaveLength(0);
        expect(tr.stdout).toContain(v("Code", false));
        expect(tr.stdout).toContain(v("Docs", true));
    });
});

describe("glob, dotfiles, and validation diagnostics", () => {

    test("Should_ReturnFalse_When_OnlyExcludedFileAndUnrelatedFileChanged", async () => {
        const tr = await runTask("35-exclusion-unrelated-file.runner.js");

        expect(tr.succeeded).toBe(true);
        expect(tr.warningIssues).toHaveLength(0);
        expect(tr.stdout).toContain(v("HasChanged", false));
    });

    test("Should_WarnAndContinue_When_ForceByCategoryLineInvalid", async () => {
        const tr = await runTask("36-force-by-category-invalid-line.runner.js");

        expect(tr.succeeded).toBe(true);
        expect(tr.warningIssues).toEqual([expect.stringContaining('ignoring invalid line "Docs"')]);
        expect(tr.stdout).toContain(v("Code", true));
        expect(tr.stdout).toContain(v("Docs", false));
    });

    test("Should_MatchDotFiles_When_MatchDotFilesInputIsTrue", async () => {
        const tr = await runTask("41-match-dot-files.runner.js");

        expect(tr.succeeded).toBe(true);
        expect(tr.warningIssues).toHaveLength(0);
        expect(tr.stdout).toContain(v("Ci", true));
        expect(tr.stdout).toContain(v("Code", false));
    });

    test("Should_EmitDebugLogsAndCategoryWarnings_When_VerboseFalseAndRulesMisconfigured", async () => {
        const tr = await runTask("42-quiet-mode-and-rule-warnings.runner.js");

        expect(tr.succeeded).toBe(true);
        expect(tr.stdout).toContain("##vso[task.debug]CF:::>");
        expect(tr.warningIssues).toEqual(
            expect.arrayContaining([
                expect.stringContaining('category "MissingCategory" is not defined in rules'),
                expect.stringContaining('Category "OnlyExcludes" contains only exclusion rules'),
            ])
        );
        expect(tr.stdout).toContain(v("Code", true));
        expect(tr.stdout).toContain(v("OnlyExcludes", false));
    });
});
