#!/usr/bin/env bash
# Uploads the current task build to a TEST Azure DevOps organization (no Marketplace).
# Works on a temporary copy: the repository is not modified.
#
# Usage:
#   export AZDO_PAT=<PAT with "Agent Pools (Read & manage)" scope>   # never commit it
#   scripts/upload-dev-task.sh [org url]        # default: https://dev.azure.com/mohamedelhabib0881
#
# The patch version is set to the current epoch minutes so every upload is newer than the
# previous one (agents cache tasks by version). Do NOT install the public extension in the
# same organization: it uses the same task id.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ORG_URL="${1:-https://dev.azure.com/mohamedelhabib0881}"
: "${AZDO_PAT:?export AZDO_PAT=<PAT with Agent Pools (Read & manage) scope>}"

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

cd "$ROOT"
npm run build --silent

cp -r changed-files "$STAGE/changed-files"
rm -rf "$STAGE/changed-files/tests" "$STAGE/changed-files/node_modules"
find "$STAGE/changed-files" -name "*.ts" -delete
cp package.json package-lock.json "$STAGE/changed-files/"

PATCH=$(( $(date +%s) / 60 ))
node -e '
  const fs = require("fs"); const f = process.argv[1];
  const t = JSON.parse(fs.readFileSync(f, "utf-8"));
  t.version.Patch = Number(process.argv[2]);
  fs.writeFileSync(f, JSON.stringify(t, null, 2));
  console.log(`Uploading ${t.name} ${t.version.Major}.${t.version.Minor}.${t.version.Patch}`);
' "$STAGE/changed-files/task.json" "$PATCH"

(cd "$STAGE/changed-files" && npm ci --omit=dev --ignore-scripts --silent && rm package.json package-lock.json)

npx -y tfx-cli build tasks upload \
  --task-path "$STAGE/changed-files" \
  --service-url "$ORG_URL" \
  --auth-type pat --token "$AZDO_PAT" \
  --no-prompt
