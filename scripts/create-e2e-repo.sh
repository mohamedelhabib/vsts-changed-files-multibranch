#!/usr/bin/env bash
# Creates the local end-to-end test repository for the ChangedFilesMultibranch task.
#
# Usage:
#   scripts/create-e2e-repo.sh [init] [target dir] [remote url]
#       creates the repo (src/, docs/, azure-pipelines.yml) and adds the remote. Does NOT push.
#   scripts/create-e2e-repo.sh many-commits [target dir]
#       adds 65 commits on master; only the OLDEST touches src/ (B4 check). Push them in ONE push:
#       on master the task uses the build changes API (not the refBranch diff).
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
  # reuse the (personal) identity configured in the extension repository
  git config user.name "$(git -C "$ROOT" config user.name)"
  git config user.email "$(git -C "$ROOT" config user.email)"
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
  cd "$TARGET"
  git checkout -q master
  echo "// touched by the oldest commit $(date +%s)" >> src/app.ts
  git add src/app.ts
  git commit -q -m "many-commits 0: touch src (oldest)"
  for i in $(seq 1 64); do
    echo "line $i" >> docs/index.md
    git add docs/index.md
    git commit -q -m "many-commits $i: docs only"
  done
  echo "Added 65 commits on master (only the oldest touches src/)"
  echo "Next: cd $TARGET && git push origin master   # one push => one build with 65 changes"
  echo "Expected: Code=true. Code=false => build changes list truncated (B4)"
}

case "$cmd" in
  init) init "${2:-}" ;;
  many-commits) many_commits ;;
esac
