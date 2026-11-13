# Azure DevOps Task: Changed Files

![CI](https://github.com/mohamedelhabib/vsts-changed-files-multibranch/actions/workflows/ci.yml/badge.svg)

Pipeline task to get changed files and apply conditions according to those changes.
This project is a fork from https://github.com/touchifyapp/vsts-changed-files.

The main differences of this extension are:

- added support of multi branches pipeline
- added support of merge commit
- usage of the [Get Build Changes](https://docs.microsoft.com/en-us/rest/api/azure/devops/build/builds/get%20build%20changes?view=azure-devops-rest-6.0) rest api to get the list of changes instead of comparing with the previous build.

## Installation

Installation can be done using [Visual Studio MarketPlace](https://marketplace.visualstudio.com/items?itemName=mohamedelhabib.vsts-changed-files-multibranch).

## Source Code

Source code can be found on [Github](https://github.com/mohamedelhabib/vsts-changed-files-multibranch).

## Simple Usage

```yaml
jobs: 
  - job: check
    displayName: Check changed files
    pool:
        vmImage: ubuntu-latest
    steps:
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
Exclusions can be written anywhere in the category. Files starting with a dot (e.g. `.github/...`) are not matched by `**`.

## Multiple branches Usage

The reference branch must be fetched: use a full clone (`fetchDepth: 0`) on the checkout step.
`refBranch` accepts `origin/master`, `master` or `refs/heads/master`.

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

- __rules__: Filter files to check changes for.  _Default:_ `**` _(match all files)_.
- __variable__: The name of the default output variable to set to be available in next steps/jobs/stages. _Default:_ `HasChanged`.
- __isOutput__: Are variables available in next stages?  _Default:_ `true`.
- __refBranch__: The branch that will be used as reference to check changes in case multi branches pipeline.
- __forceToTrue__: If set to true all variables will be set to true. If should be a dynamic value computed based on pipeline parameters for example.
- __forceByCategory__: One `Category: true|false` per line to force some variables to true. Invalid lines are ignored with a warning.
- __cwd__: Change the current working directory. _Default:_ `$(System.DefaultWorkingDirectory)`
- __verbose__: Enable verbose logging. _Default:_ `false`.

## Requirements & behavior

- Runs on the `Node24` handler, with `Node20_1` as fallback for older agents (the deprecated `Node10` handler was removed in 2.6.0).
- **Fail-safe**: when changed files cannot be computed (shallow clone, unknown reference branch or commit), the task logs a warning and sets **all variables to `true`**, so downstream jobs run instead of being silently skipped.

## License

[MIT](https://raw.githubusercontent.com/mohamedelhabib/vsts-changed-files-multibranch/master/LICENSE)

## Git tested changes

- [x] git repo with only one branch or a pipeline for only one branch
- [x] git create new branch without changes vs reference branch
- [x] git push with single commit
- [x] git push with several commits
- [x] git repo with multiple branches and a pipline for multiple branches
- [x] git merge a branch into another branch
- [x] git cherry-pick
- [x] git rebase and push force
- [x] git revert

## Development

```shell
npm ci
npm test              # lint + build + all tests (unit, real git, task scenarios)
npm run verify        # npm test + package the vsix + verify its content (needs tfx-cli)
```

Test layers (`changed-files/tests`):

- `unit.spec.ts`: rules parsing, glob matching, branch normalization
- `git.spec.ts`: real git repositories created in a temp dir (merges, renames, shallow clones, non-ASCII paths)
- `index.spec.ts`, `scenarios.spec.ts`: the compiled task run through `azure-pipelines-task-lib` `MockTestRunner` (mocked git + Azure DevOps API)
- `scripts/verify-vsix.js`: checks the packaged extension (handlers, versions, declared inputs, runtime dependencies)
- `scripts/run-local.sh`: runs the compiled task against a real repository and a real build
- `e2e/azure-pipelines.yml`: end-to-end checklist pipeline for a test organization

The tests run with the current Node version when it is a task handler version (20 or 24), offline.

## Release new version

To release and publish a new version run the following command.

```shell
npm version major|minor|patch
```

This command will:

- bump the version into package.json task.json and vss-extension.json
- commit and push those change
- tag the git repository with the new version

The github `.github/workflows/release.yml` workflow will be automatically, this pipeline will package and publish the version to the marketplace.
