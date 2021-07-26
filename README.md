# Azure DevOps Task: Changed Files

![CI](https://github.com/mohamedelhabib/vsts-changed-files/workflows/CI/badge.svg?event=push)

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
      - task: ChangedFiles@1
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
      - task: ChangedFiles@1
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

## Multiple branches Usage

```yaml
jobs: 
  - job: check
    displayName: Check changed files
    pool:
        vmImage: ubuntu-latest
    steps:
      - task: ChangedFiles@1
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
- __cwd__: Change the current working directory. _Default:_ `$(System.DefaultWorkingDirectory)`
- __verbose__: Enable verbose logging. _Default:_ `false`.

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
