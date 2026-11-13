import { runTask } from "./_run";

/*
 * L2 - task scenarios added with the Node24 upgrade (branch mode, fail-safe, bug fixes).
 */

const v = (name: string, value: boolean): string => `##vso[task.setvariable variable=${name};isOutput=true;]${value}`;
const LOG = "/bin/git -c core.quotePath=false log -m -1 --name-only --pretty=format: latest_commit_id";
const DIFF = "/bin/git -c core.quotePath=false diff --name-only origin/master...";

describe("fail-safe on git errors (B1)", () => {

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
});

describe("branch mode (refBranch)", () => {

    test("Should_DiffAgainstRefBranch_When_BuildingFeatureBranch", async () => {
        const tr = await runTask("31-branch-mode.runner.js");

        expect(tr.succeeded).toBe(true);
        expect(tr.ran(DIFF)).toBe(true);
        expect(tr.invokedToolCount).toBe(1);
        expect(tr.warningIssues).toHaveLength(0);
        expect(tr.stdout).toContain(v("Code", true));
        expect(tr.stdout).toContain(v("Docs", false));
    });

    test("Should_UseBuildCommits_When_RefBranchIsCurrentBranchWithOtherSpelling (B5)", async () => {
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
});

describe("bug fixes", () => {

    test("Should_ReturnFalse_When_OnlyExcludedFileAndUnrelatedFileChanged (B2)", async () => {
        const tr = await runTask("35-exclusion-unrelated-file.runner.js");

        expect(tr.succeeded).toBe(true);
        expect(tr.warningIssues).toHaveLength(0);
        expect(tr.stdout).toContain(v("HasChanged", false));
    });

    test("Should_WarnAndContinue_When_ForceByCategoryLineInvalid (B7)", async () => {
        const tr = await runTask("36-force-by-category-invalid-line.runner.js");

        expect(tr.succeeded).toBe(true);
        expect(tr.warningIssues).toEqual([expect.stringContaining('ignoring invalid line "Docs"')]);
        expect(tr.stdout).toContain(v("Code", true));
        expect(tr.stdout).toContain(v("Docs", false));
    });
});
