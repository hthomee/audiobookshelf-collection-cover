#!/usr/bin/env bash
# Opens a GitHub issue unless an open one with the same title already exists
# (the workflow runs daily and would otherwise create a new issue every day).
# Needs the gh CLI and GH_TOKEN; GH_REPO defaults to $GITHUB_REPOSITORY.
#
# Usage: .github/scripts/open-issue.sh "<title>" <body-file>
set -euo pipefail
TITLE="${1:?title}"
BODY_FILE="${2:?body file}"
export GH_REPO="${GH_REPO:-${GITHUB_REPOSITORY:?GH_REPO or GITHUB_REPOSITORY required}}"

existing="$(gh issue list --state open --limit 100 --json number,title --jq "[.[] | select(.title == \"${TITLE//\"/\\\"}\")] | length")"
if [ "$existing" != "0" ]; then
  echo "issue \"${TITLE}\" is already open, not creating another one"
  exit 0
fi
# mention the owner so GitHub sends a notification (issues opened by the workflow have no other recipient)
{ cat "$BODY_FILE"; printf '\n\n@%s\n' "${GITHUB_REPOSITORY_OWNER:-${GH_REPO%%/*}}"; } > "${BODY_FILE}.mention"
gh issue create --title "$TITLE" --body-file "${BODY_FILE}.mention"
