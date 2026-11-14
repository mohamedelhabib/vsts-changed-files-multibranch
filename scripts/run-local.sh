#!/usr/bin/env bash
# Runs the compiled task locally against a real repository and (when in commit mode) a real Azure DevOps build.
#
# Usage:
#   AZDO_ORG_URL=https://dev.azure.com/<org>/ AZDO_PROJECT=<project> AZDO_PAT=<pat Build:Read> \
#   BUILD_ID=<build id> SOURCE_BRANCH=refs/heads/<branch> \
#   RULES=$'[Code]\nsrc/**\n[Docs]\ndocs/**' REF_BRANCH=origin/master \
#   scripts/run-local.sh /path/to/clone/of/the/repository
#
# Note: In branch mode (REF_BRANCH differs from SOURCE_BRANCH), AZDO_ORG_URL, AZDO_PROJECT,
# AZDO_PAT, and BUILD_ID are optional because no REST API call is needed.
# The PAT is read from the environment only; never commit it.
set -euo pipefail
umask 077

REPO_DIR="${1:?usage: scripts/run-local.sh <repository directory>}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

: "${SOURCE_BRANCH:?SOURCE_BRANCH is required (e.g. refs/heads/feature/x)}"

if [[ -z "${REF_BRANCH:-}" && "${FORCE_TO_TRUE:-false}" != "true" ]]; then
  : "${AZDO_ORG_URL:?AZDO_ORG_URL is required in commit mode}"
  : "${AZDO_PROJECT:?AZDO_PROJECT is required in commit mode}"
  : "${AZDO_PAT:?AZDO_PAT is required in commit mode}"
  : "${BUILD_ID:?BUILD_ID is required in commit mode}"
fi

(cd "$ROOT" && npm run build --silent)

AGENT_TMP="$(mktemp -d)"
trap 'rm -rf "$AGENT_TMP"' EXIT

cd "$REPO_DIR"
(
  export SYSTEM_TEAMFOUNDATIONCOLLECTIONURI="${AZDO_ORG_URL:-}"
  export SYSTEM_TEAMPROJECTID="${AZDO_PROJECT:-}"
  export SYSTEM_ACCESSTOKEN="${AZDO_PAT:-}"
  export BUILD_BUILDID="${BUILD_ID:-}"
  export BUILD_SOURCEBRANCH="$SOURCE_BRANCH"
  export AGENT_TEMPDIRECTORY="$AGENT_TMP"
  export INPUT_RULES="${RULES:-**}"
  export INPUT_VARIABLE="${VARIABLE:-HasChanged}"
  export INPUT_ISOUTPUT="${IS_OUTPUT:-true}"
  export INPUT_REFBRANCH="${REF_BRANCH:-}"
  export INPUT_FORCETOTRUE="${FORCE_TO_TRUE:-false}"
  export INPUT_FORCEBYCATEGORY="${FORCE_BY_CATEGORY:-}"
  export INPUT_MATCHDOTFILES="${MATCH_DOT_FILES:-false}"
  export INPUT_CWD="${CWD:-}"
  export INPUT_VERBOSE="${VERBOSE:-true}"
  exec node "$ROOT/changed-files/index.js"
)
