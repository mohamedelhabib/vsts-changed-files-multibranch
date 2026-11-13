#!/usr/bin/env bash
# Runs the compiled task locally against a real repository and a real Azure DevOps build.
#
# Usage:
#   AZDO_ORG_URL=https://dev.azure.com/<org>/ AZDO_PROJECT=<project> AZDO_PAT=<pat Build:Read> \
#   BUILD_ID=<build id> SOURCE_BRANCH=refs/heads/<branch> \
#   RULES=$'[Code]\nsrc/**\n[Docs]\ndocs/**' REF_BRANCH=origin/master \
#   scripts/run-local.sh /path/to/clone/of/the/repository
#
# The PAT is read from the environment only; never commit it.
set -euo pipefail

REPO_DIR="${1:?usage: scripts/run-local.sh <repository directory>}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

: "${AZDO_ORG_URL:?AZDO_ORG_URL is required}"
: "${AZDO_PROJECT:?AZDO_PROJECT is required}"
: "${AZDO_PAT:?AZDO_PAT is required}"
: "${BUILD_ID:?BUILD_ID is required}"
: "${SOURCE_BRANCH:?SOURCE_BRANCH is required (e.g. refs/heads/feature/x)}"

(cd "$ROOT" && npm run build --silent)

AGENT_TMP="$(mktemp -d)"
trap 'rm -rf "$AGENT_TMP"' EXIT

cd "$REPO_DIR"
env \
  SYSTEM_TEAMFOUNDATIONCOLLECTIONURI="$AZDO_ORG_URL" \
  SYSTEM_TEAMPROJECTID="$AZDO_PROJECT" \
  SYSTEM_ACCESSTOKEN="$AZDO_PAT" \
  BUILD_BUILDID="$BUILD_ID" \
  BUILD_SOURCEBRANCH="$SOURCE_BRANCH" \
  AGENT_TEMPDIRECTORY="$AGENT_TMP" \
  INPUT_RULES="${RULES:-**}" \
  INPUT_VARIABLE="${VARIABLE:-HasChanged}" \
  INPUT_ISOUTPUT="${IS_OUTPUT:-true}" \
  INPUT_REFBRANCH="${REF_BRANCH:-}" \
  INPUT_FORCETOTRUE="${FORCE_TO_TRUE:-false}" \
  INPUT_FORCEBYCATEGORY="${FORCE_BY_CATEGORY:-}" \
  INPUT_VERBOSE="${VERBOSE:-true}" \
  node "$ROOT/changed-files/index.js"
