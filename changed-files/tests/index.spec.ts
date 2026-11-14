import { runTask } from "./_run";

describe("vsts-changed-files-multibranch", () => {

    describe("core behaviors", () => {

        test("should work on basic single-commit build", async () => {
            const tr = await runTask("01-base.runner.js");

            expect(tr.succeeded).toBe(true);

            expect(tr.invokedToolCount).toBe(1);
            expect(tr.warningIssues).toHaveLength(0);
            expect(tr.errorIssues).toHaveLength(0);

            expect(tr.stdout).toContain("##vso[task.setvariable variable=HasChanged;isOutput=true;]true");
            expect(tr.stderr).toBeFalsy();
        });

        test("should return true without git or API calls when forceToTrue is enabled", async () => {
            const tr = await runTask("02-force-to-true.js");

            expect(tr.succeeded).toBe(true);

            expect(tr.invokedToolCount).toBe(0);
            expect(tr.warningIssues).toHaveLength(0);
            expect(tr.errorIssues).toHaveLength(0);

            expect(tr.stdout).toContain("##vso[task.setvariable variable=HasChanged;isOutput=true;]true");
            expect(tr.stderr).toBeFalsy();
        });

        test("should short-circuit and return true when forceToTrue is enabled even if globs would not match", async () => {
            const tr = await runTask("02-no-glob-match.runner-force-to-true.js");

            expect(tr.succeeded).toBe(true);

            expect(tr.invokedToolCount).toBe(0);
            expect(tr.warningIssues).toHaveLength(0);
            expect(tr.errorIssues).toHaveLength(0);

            expect(tr.stdout).toContain("##vso[task.setvariable variable=HasChanged;isOutput=true;]true");
            expect(tr.stderr).toBeFalsy();
        });

        test("should return TestsChanged and CodeChanged to true because of force", async () => {
            const tr = await runTask("02.1-force-by-category.js");

            expect(tr.succeeded).toBe(true);

            expect(tr.invokedToolCount).toBe(1);
            expect(tr.warningIssues).toHaveLength(0);
            expect(tr.errorIssues).toHaveLength(0);

            expect(tr.stdout).toContain("##vso[task.setvariable variable=CodeChanged;isOutput=true;]true");
            expect(tr.stdout).toContain("##vso[task.setvariable variable=DocumentationChanged;isOutput=true;]false");
            expect(tr.stdout).toContain("##vso[task.setvariable variable=TestsChanged;isOutput=true;]true");

            expect(tr.stdout).not.toContain("##vso[task.setvariable variable=HasChanged;isOutput=true;]");

            expect(tr.stderr).toBeFalsy();
        });

        test("should return false if previous build used same sourceVersion", async () => {
            const tr = await runTask("03-same-source-version.runner.js");

            expect(tr.succeeded).toBe(true);

            expect(tr.invokedToolCount).toBe(0);
            expect(tr.warningIssues).toHaveLength(0);
            expect(tr.errorIssues).toHaveLength(0);

            expect(tr.stdout).toContain("##vso[task.setvariable variable=HasChanged;isOutput=true;]false");
            expect(tr.stderr).toBeFalsy();
        });

        test("should return TestsChanged and CodeChanged to true because of force despite previous build used same sourceVersion", async () => {
            const tr = await runTask("03-same-source-version.with-force-by-category.js");

            expect(tr.succeeded).toBe(true);

            expect(tr.invokedToolCount).toBe(0);
            expect(tr.warningIssues).toHaveLength(0);
            expect(tr.errorIssues).toHaveLength(0);

            expect(tr.stdout).toContain("##vso[task.setvariable variable=CodeChanged;isOutput=true;]true");
            expect(tr.stdout).toContain("##vso[task.setvariable variable=DocumentationChanged;isOutput=true;]false");
            expect(tr.stdout).toContain("##vso[task.setvariable variable=TestsChanged;isOutput=true;]true");

            expect(tr.stdout).not.toContain("##vso[task.setvariable variable=HasChanged;isOutput=true;]");
            expect(tr.stderr).toBeFalsy();
        });

        test("should return false if no glob match", async () => {
            const tr = await runTask("04-no-glob-match.runner.js");

            expect(tr.succeeded).toBe(true);

            expect(tr.invokedToolCount).toBe(1);
            expect(tr.warningIssues).toHaveLength(0);
            expect(tr.errorIssues).toHaveLength(0);

            expect(tr.stdout).toContain("##vso[task.setvariable variable=HasChanged;isOutput=true;]false");
            expect(tr.stderr).toBeFalsy();
        });

        test("should return true if some glob match", async () => {
            const tr = await runTask("05-glob-match.runner.js");

            expect(tr.succeeded).toBe(true);

            expect(tr.invokedToolCount).toBe(1);
            expect(tr.warningIssues).toHaveLength(0);
            expect(tr.errorIssues).toHaveLength(0);

            expect(tr.stdout).toContain("##vso[task.setvariable variable=HasChanged;isOutput=true;]true");
            expect(tr.stderr).toBeFalsy();
        });

        test("should apply exclusion and return false when only excluded file changed", async () => {
            const tr = await runTask("05.1-glob-match.exclusion.runner.js");

            expect(tr.succeeded).toBe(true);

            expect(tr.invokedToolCount).toBe(1);
            expect(tr.warningIssues).toHaveLength(0);
            expect(tr.errorIssues).toHaveLength(0);

            expect(tr.stdout).toContain("##vso[task.setvariable variable=HasChanged;isOutput=true;]false");
            expect(tr.stderr).toBeFalsy();
        });

        test("should apply exclusion and detect other matching changes", async () => {
            const tr = await runTask("05.2-glob-match.exclusion.runner.js");

            expect(tr.succeeded).toBe(true);

            expect(tr.invokedToolCount).toBe(1);
            expect(tr.warningIssues).toHaveLength(0);
            expect(tr.errorIssues).toHaveLength(0);

            expect(tr.stdout).toContain("##vso[task.setvariable variable=HasChanged;isOutput=true;]true");
            expect(tr.stderr).toBeFalsy();
        });

        test("should batch multiple build commits into one git invocation and return true if any match", async () => {
            const tr = await runTask("06-several-build-changes.js");

            expect(tr.succeeded).toBe(true);

            expect(tr.invokedToolCount).toBe(1);
            expect(tr.warningIssues).toHaveLength(0);
            expect(tr.errorIssues).toHaveLength(0);

            expect(tr.stdout).toContain("##vso[task.setvariable variable=HasChanged;isOutput=true;]true");
            expect(tr.stderr).toBeFalsy();
        });

    });

    describe("inputs", () => {

        test("variable: allow to change output variable name", async () => {
            const tr = await runTask("10-input-variable.runner.js");

            expect(tr.succeeded).toBe(true);

            expect(tr.invokedToolCount).toBe(1);
            expect(tr.warningIssues).toHaveLength(0);
            expect(tr.errorIssues).toHaveLength(0);

            expect(tr.stdout).toContain("##vso[task.setvariable variable=CustomVar;isOutput=true;]true");
            expect(tr.stderr).toBeFalsy();
        });

        test("isOutput: allow to determine if it's an output variable", async () => {
            const tr = await runTask("11-input-is-output.runner.js");

            expect(tr.succeeded).toBe(true);

            expect(tr.invokedToolCount).toBe(1);
            expect(tr.warningIssues).toHaveLength(0);
            expect(tr.errorIssues).toHaveLength(0);

            expect(tr.stdout).toContain("##vso[task.setvariable variable=CustomVar;]true");
            expect(tr.stderr).toBeFalsy();
        });

    });

    describe("multiple variables", () => {

        test("should allow multiple variable definitions", async () => {
            const tr = await runTask("20-multi-with-default.runner.js");

            expect(tr.succeeded).toBe(true);

            expect(tr.invokedToolCount).toBe(1);
            expect(tr.warningIssues).toHaveLength(0);
            expect(tr.errorIssues).toHaveLength(0);

            expect(tr.stdout).toContain("##vso[task.setvariable variable=HasChanged;isOutput=true;]true");
            expect(tr.stdout).toContain("##vso[task.setvariable variable=DocumentationChanged;isOutput=true;]true");
            expect(tr.stdout).toContain("##vso[task.setvariable variable=TestsChanged;isOutput=true;]false");
            expect(tr.stderr).toBeFalsy();
        });

        test("should not set default variable if empty", async () => {
            const tr = await runTask("21-multi-without-default.runner.js");

            expect(tr.succeeded).toBe(true);

            expect(tr.invokedToolCount).toBe(1);
            expect(tr.warningIssues).toHaveLength(0);
            expect(tr.errorIssues).toHaveLength(0);

            expect(tr.stdout).toContain("##vso[task.setvariable variable=CodeChanged;isOutput=true;]true");
            expect(tr.stdout).toContain("##vso[task.setvariable variable=DocumentationChanged;isOutput=true;]true");
            expect(tr.stdout).toContain("##vso[task.setvariable variable=TestsChanged;isOutput=true;]false");

            expect(tr.stdout).not.toContain("##vso[task.setvariable variable=HasChanged;isOutput=true;]");

            expect(tr.stderr).toBeFalsy();
        });

        test("should not set variables with no rules", async () => {
            const tr = await runTask("22-multi-filter-empty.runner.js");

            expect(tr.succeeded).toBe(true);

            expect(tr.invokedToolCount).toBe(1);
            expect(tr.warningIssues).toHaveLength(0);
            expect(tr.errorIssues).toHaveLength(0);

            expect(tr.stdout).toContain("##vso[task.setvariable variable=CodeChanged;isOutput=true;]true");
            expect(tr.stdout).toContain("##vso[task.setvariable variable=TestsChanged;isOutput=true;]false");

            expect(tr.stdout).not.toContain("##vso[task.setvariable variable=HasChanged;");
            expect(tr.stdout).not.toContain("##vso[task.setvariable variable=DocumentationChanged;");

            expect(tr.stderr).toBeFalsy();
        });

    });

});
