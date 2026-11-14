# Azure DevOps Task: Changed Files

![CI](https://github.com/mohamedelhabib/vsts-changed-files-multibranch/actions/workflows/ci.yml/badge.svg)

Pipeline task to get changed files and apply conditions according to those changes.
This project is a fork from https://github.com/touchifyapp/vsts-changed-files.

The main differences of this extension are:

- added support for multi-branch pipelines and pull requests
- added accurate support for merge commits (`--first-parent -m`) and file renames (`--no-renames`)
- usage of the [Get Build Changes](https://learn.microsoft.com/en-us/rest/api/azure/devops/build/builds/get-build-changes?view=azure-devops-rest-7.1) REST API on single-branch builds (with truncation fail-safe) and direct Git three-dot branch diffing on feature/PR builds

## Installation

Installation can be done using [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=mohamedelhabib.vsts-changed-files-multibranch).

## Source Code

Source code can be found on [GitHub](https://github.com/mohamedelhabib/vsts-changed-files-multibranch).

## Simple Usage

```yaml
jobs: 
  - job: check
    displayName: Check changed files
    pool:
        vmImage: ubuntu-latest
    steps:
      - checkout: self
        fetchDepth: 0
      - task: ChangedFilesMultibranch@2
        name: CheckChanges
        inputs:
          rules: src/**/*.ts
          variable: HasChanged

  - job: build
    displayName: Build only when code changes
    dependsOn: check
    condition: eq(dependencies.check.outputs['CheckChanges.HasChanged'], 'true')
    steps:
        - # Add your build steps here
```

## Multiple variable Usage

```yaml
jobs: 
  - job: check
    displayName: Check changed files
    pool:
        vmImage: ubuntu-latest
    steps:
      - checkout: self
        fetchDepth: 0
      - task: ChangedFilesMultibranch@2
        name: CheckChanges
        inputs:
          rules: |
            [CodeChanged]
            src/**/*.ts
            src/**/*.html

            [TestsChanged]
            tests/**/*.ts

  - job: build
    displayName: Build only when code changes
    dependsOn: check
    condition: eq(dependencies.check.outputs['CheckChanges.CodeChanged'], 'true')
    steps:
        - # Add your build steps here
        
  - job: tests
    displayName: Tests only when code changes or tests changes
    dependsOn: check
    condition: or(eq(dependencies.check.outputs['CheckChanges.CodeChanged'], 'true'), eq(dependencies.check.outputs['CheckChanges.TestsChanged'], 'true'))
    steps:
        - # Add your build steps here
```

## Exclusion file usage

```yaml
jobs: 
  - job: check
    displayName: Check changed files
    pool:
        vmImage: ubuntu-latest
    steps:
      - checkout: self
        fetchDepth: 0
      - task: ChangedFilesMultibranch@2
        name: CheckChanges
        inputs:
          rules: |
            [CodeChanged]
            src/**/*.ts
            !src/**/excludedFile.ts
            src/**/*.html
```

A category is `true` when at least one changed file matches an include rule **and** no exclusion rule (`!pattern`).
Exclusions can be written anywhere in the category. By default, files starting with a dot (e.g. `.github/...`) are not matched by `**`; set `matchDotFiles: true` to include dotfiles.

## Multiple branches Usage

The reference branch must be fetched: use a full clone (`fetchDepth: 0`) on the checkout step.
`refBranch` accepts `origin/master`, `master`, or `refs/heads/master` (resolved against `origin/<branch>` on detached-HEAD agent checkouts). On pull request builds, `refBranch` automatically falls back to `$(System.PullRequest.TargetBranch)` when omitted, and branch diffing requires no `System.AccessToken` (works on fork PRs).

```yaml
jobs: 
  - job: check
    displayName: Check changed files
    pool:
        vmImage: ubuntu-latest
    steps:
      - checkout: self
        fetchDepth: 0
      - task: ChangedFilesMultibranch@2
        name: CheckChanges
        inputs:
          refBranch: "origin/master"
          rules: |
            [CodeChanged]
            src/**/*.ts
            src/**/*.html

            [TestsChanged]
            tests/**/*.ts

  - job: build
    displayName: Build only when code changes
    dependsOn: check
    condition: eq(dependencies.check.outputs['CheckChanges.CodeChanged'], 'true')
    steps:
        - # Add your build steps here
        
  - job: tests
    displayName: Tests only when code changes or tests changes
    dependsOn: check
    condition: or(eq(dependencies.check.outputs['CheckChanges.CodeChanged'], 'true'), eq(dependencies.check.outputs['CheckChanges.TestsChanged'], 'true'))
    steps:
        - # Add your build steps here
```

## Options

- __rules__: Filter files to check changes for. _Default:_ `**` _(match all non-dot files)_.
- __variable__: The name of the default output variable to set to be available in next steps/jobs/stages. _Default:_ `HasChanged`.
- __isOutput__: Are variables available in next stages? _Default:_ `true`.
- __refBranch__: The branch used as reference in multi-branch pipelines. Falls back to `System.PullRequest.TargetBranch` on PR builds when omitted.
- __forceToTrue__: If set to `true`, all configured variables will be set to `true`. _Default:_ `false`.
- __forceByCategory__: One `Category: true|false` per line to force specific category variables to `true`. Invalid lines are ignored with a warning.
- __matchDotFiles__: Match files and directories starting with `.` (e.g. `.github/**`). _Default:_ `false`.
- __cwd__: Change the current working directory (paths are evaluated relative to `cwd`). _Default:_ `$(System.DefaultWorkingDirectory)`.
- __verbose__: Enable verbose logging. _Default:_ `false`.

## Requirements & behavior

- Runs on the `Node24` handler, with `Node20_1` as fallback (`minimumAgentVersion: 3.227.0`; the deprecated `Node10` handler was removed in 2.6.0).
- **Fail-safe**: when changed files cannot be computed reliably (shallow clone / grafted commit, missing merge base, API failure, or `>= 200` commits in single-branch build changes), the task logs a warning and sets **all variables to `true`**, so downstream jobs run instead of being silently skipped.

## License

[MIT](https://raw.githubusercontent.com/mohamedelhabib/vsts-changed-files-multibranch/master/LICENSE)

## Git tested changes

- [x] git repo with only one branch or a pipeline for only one branch
- [x] git create new branch without changes vs reference branch
- [x] git push with single commit
- [x] git push with several commits
- [x] git repo with multiple branches and a pipeline for multiple branches
- [x] git merge a branch into another branch
- [x] git cherry-pick
- [x] git rebase and push force
- [x] git revert

## Development

```shell
npm ci
npm test              # lint + clean build + all tests (unit, real git, task scenarios, vsix verification)
npm run verify        # npm test + package the vsix + verify its content (needs tfx-cli)
```

Test layers (`changed-files/tests`):

- `unit.spec.ts`: rules parsing, glob matching, branch normalization, manifest & VSIX verification contracts
- `git.spec.ts`: real git repositories created in a temp dir (merges, renames, shallow clones, monorepo `cwd`, VSO sanitization, option-injection defense)
- `index.spec.ts`, `scenarios.spec.ts`: the compiled task run through `azure-pipelines-task-lib` `MockTestRunner` (mocked git + Azure DevOps API)
- `scripts/pack-vsix.js` & `scripts/verify-vsix.js`: stages and verifies the packaged extension in isolation
- `scripts/run-local.sh`: runs the compiled task against a real repository and build
- `e2e/azure-pipelines.yml`: end-to-end checklist pipeline with assertions and downstream output checks
- `scripts/create-e2e-repo.sh`: creates the local e2e test repository (and `many-commits` for >50 / >200 commit checks)
- `scripts/upload-dev-task.sh`: uploads the current build of the task to a test organization (no Marketplace)

The tests run hermetically offline using the active Node runtime (`>=20`).

## Release new version

To release and publish a new version run the following command:

```shell
npm version major|minor|patch
```

This command will:

- bump the version in `package.json`, `changed-files/task.json`, and `vss-extension.json`
- commit and push those changes
- tag the git repository with the new version

The GitHub `.github/workflows/release.yml` workflow triggers automatically on the version tag, builds and verifies the VSIX in an unprivileged job, and publishes it to the Visual Studio Marketplace via OIDC.
