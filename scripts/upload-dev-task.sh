#!/usr/bin/env bash
# Uploads the current task build to a TEST Azure DevOps organization (no Marketplace).
# Works on a temporary copy: the repository is not modified.
#
# Usage:
#   scripts/upload-dev-task.sh [org url]        # default: https://dev.azure.com/mohamedelhabib0881
#
# Authentication (first match wins):
#   AZDO_PAT=<PAT with "Agent Pools (Read & manage)">   -> uploaded with tfx-cli
#   otherwise the current `az login` session is used (Entra token; set AZURE_CONFIG_DIR to pick
#   a non-default session). Personal Microsoft accounts need the X-VSS-ForceMsaPassThrough header,
#   which tfx cannot send, so this path calls the REST API directly with curl.
#
# The patch version is set to the current epoch minutes so every upload is newer than the
# previous one (agents cache tasks by version). Do NOT install the public extension in the
# same organization: it uses the same task id.
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ORG_URL="${1:-https://dev.azure.com/mohamedelhabib0881}"
ORG_URL="${ORG_URL%/}"

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

cd "$ROOT"
npm run build --silent

mkdir -p "$STAGE/changed-files/lib"
cp changed-files/task.json changed-files/index.js "$STAGE/changed-files/"
cp changed-files/lib/*.js "$STAGE/changed-files/lib/"
cp package.json package-lock.json "$STAGE/changed-files/"

PATCH=$(( $(date +%s) / 60 ))
TASK_ID="$(node -e '
  const fs = require("fs"); const f = process.argv[1];
  const t = JSON.parse(fs.readFileSync(f, "utf-8"));
  t.version.Patch = Number(process.argv[2]);
  fs.writeFileSync(f, JSON.stringify(t, null, 2) + "\n");
  console.error(`Uploading ${t.name} ${t.version.Major}.${t.version.Minor}.${t.version.Patch}`);
  console.log(t.id);
' "$STAGE/changed-files/task.json" "$PATCH")"

(cd "$STAGE/changed-files" && npm ci --omit=dev --ignore-scripts --silent && rm package.json package-lock.json)

if [[ -n "${AZDO_PAT:-}" ]]; then
  npx -y tfx-cli build tasks upload \
    --task-path "$STAGE/changed-files" \
    --service-url "$ORG_URL" \
    --auth-type pat --token "$AZDO_PAT" \
    --no-prompt
  exit 0
fi

(cd "$STAGE/changed-files" && zip -qr "$STAGE/task.zip" .)
SIZE=$(wc -c < "$STAGE/task.zip" | tr -d ' ')
TOKEN="$(az account get-access-token --resource 499b84ac-1321-427f-aa17-267ca6975798 --query accessToken -o tsv)"
BASIC="$(printf ':%s' "$TOKEN" | base64 | tr -d '\n')"

HTTP=$(printf 'Authorization: Basic %s\n' "$BASIC" | curl -sS -o "$STAGE/response.json" -w '%{http_code}' -X PUT \
  "$ORG_URL/_apis/distributedtask/tasks/$TASK_ID?overwrite=false&api-version=3.0-preview.1" \
  -H @- \
  -H "X-VSS-ForceMsaPassThrough: true" \
  -H "Content-Type: application/octet-stream" \
  -H "Content-Range: bytes 0-$((SIZE - 1))/$SIZE" \
  --data-binary "@$STAGE/task.zip")

if [[ "$HTTP" != 2* ]]; then
  echo "Upload failed (HTTP $HTTP):" >&2
  head -c 2000 "$STAGE/response.json" >&2; echo >&2
  exit 1
fi
echo "Uploaded task $TASK_ID (HTTP $HTTP, $SIZE bytes)"
