#!/usr/bin/env bash
# Creates the local end-to-end test repository for the ChangedFilesMultibranch task.
#
# Usage:
#   scripts/create-e2e-repo.sh [init] [target dir] [remote url]
#       creates the repo (src/, docs/, azure-pipelines.yml) and adds the remote. Does NOT push.
#   scripts/create-e2e-repo.sh many-commits [target dir] [commit count]
#       adds <commit count> commits (default 65; pass 205 to test >=200 truncation fail-safe) on master;
#       only the OLDEST touches src/. Push them in ONE push: on master the task uses the build changes API.
#
# Defaults: target dir ../cf-lab, remote = cf-lab repo of the mohamedelhabib0881/mohamedelhabib project.
# Create the remote repo EMPTY first: Repos > New repository > name "cf-lab", uncheck "Add a README".
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_REMOTE="https://dev.azure.com/mohamedelhabib0881/mohamedelhabib/_git/cf-lab"

cmd="init"
if [[ "${1:-}" == "init" || "${1:-}" == "many-commits" ]]; then
  cmd="$1"; shift
fi
TARGET="${1:-$ROOT/../cf-lab}"

init() {
  local remote="${1:-$DEFAULT_REMOTE}"
  if [[ -e "$TARGET/.git" ]]; then
    echo "error: $TARGET is already a git repository" >&2; exit 1
  fi
  mkdir -p "$TARGET/src" "$TARGET/docs"
  cd "$TARGET"
  git init -q -b master
  local git_name git_email
  git_name="$(git -C "$ROOT" config user.name || echo "e2e-tester")"
  git_email="$(git -C "$ROOT" config user.email || echo "e2e@example.com")"
  git config user.name "$git_name"
  git config user.email "$git_email"
  git config commit.gpgsign false
  echo "# cf-lab: e2e tests for ChangedFilesMultibranch" > README.md
  echo "export const app = 1;" > src/app.ts
  echo "export const excluded = 1;" > src/excluded.ts
  echo "# Docs" > docs/index.md
  cp "$ROOT/e2e/azure-pipelines.yml" azure-pipelines.yml
  git add README.md src/app.ts src/excluded.ts docs/index.md azure-pipelines.yml
  git commit -q -m "e2e test repository"
  git remote add origin "$remote"
  echo "Created $TARGET (remote: $remote)"
  echo "Next: cd $TARGET && git push -u origin master"
}

many_commits() {
  local total="${1:-65}"
  if [[ ! -d "$TARGET/.git" ]]; then
    echo "error: $TARGET is not an initialized git repository (run 'init' first)" >&2
    exit 1
  fi
  cd "$TARGET"
  git checkout -q master
  echo "// touched by the oldest commit $(date +%s)" >> src/app.ts
  git add src/app.ts
  git commit -q -m "many-commits 0: touch src (oldest)"
  local docs_count=$(( total - 1 ))
  for i in $(seq 1 "$docs_count"); do
    echo "line $i" >> docs/index.md
    git add docs/index.md
    git commit -q -m "many-commits $i: docs only"
  done
  echo "Added $total commits on master (only the oldest touches src/)"
  echo "Next: cd $TARGET && git push origin master   # one push => one build with $total changes"
  echo "Expected: Code=true, Docs=true"
}

case "$cmd" in
  init) init "${2:-}" ;;
  many-commits) many_commits "${2:-65}" ;;
esac
