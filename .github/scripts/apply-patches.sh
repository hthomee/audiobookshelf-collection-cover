#!/usr/bin/env bash
# Builds a release branch on top of an upstream Audiobookshelf tag:
#   1. checks out the tag (detached),
#   2. cherry-picks every commit of the patch branches (feature/collection-cover,
#      feature/new-collection-button),
#   3. renames the collection cover migration to the tag's version
#      (see .github/scripts/set-migration-version.sh) and commits that.
#
# Usage:   .github/scripts/apply-patches.sh v2.37.1
#
# Environment (all optional):
#   PATCH_BRANCHES   space separated refs of the patch branches, in the order they are applied
#                    default: "origin/feature/collection-cover origin/feature/new-collection-button"
#   BASE_REF         ref the patch branches were forked from, used to find "their" commits
#                    (merge-base BASE_REF <branch>..<branch>); default: upstream/master
#   CONFLICT_REPORT  file that receives a Markdown report when a cherry-pick conflicts
#                    default: ${RUNNER_TEMP:-/tmp}/patch-conflict.md
#
# Exit codes: 0 = ok, 2 = cherry-pick conflict (working tree is reset, report written), 1 = other error.
set -euo pipefail

TAG="${1:?usage: $0 <upstream-tag, e.g. v2.37.1>}"
VERSION="${TAG#v}"
PATCH_BRANCHES="${PATCH_BRANCHES:-origin/feature/collection-cover origin/feature/new-collection-button}"
BASE_REF="${BASE_REF:-upstream/master}"
REPORT="${CONFLICT_REPORT:-${RUNNER_TEMP:-/tmp}/patch-conflict.md}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

git rev-parse --verify --quiet "refs/tags/${TAG}^{commit}" >/dev/null || { echo "tag ${TAG} not found" >&2; exit 1; }

# sanity: the tag must really be that version, otherwise the migration would never run
TAG_PKG_VERSION="$(git show "${TAG}:package.json" | sed -n 's/^  "version": "\(.*\)",$/\1/p' | head -1)"
if [ "$TAG_PKG_VERSION" != "$VERSION" ]; then
  echo "package.json of ${TAG} says ${TAG_PKG_VERSION}, expected ${VERSION}" >&2
  exit 1
fi

git switch --detach "refs/tags/${TAG}" >/dev/null 2>&1 || git checkout -q --detach "refs/tags/${TAG}"

for ref in $PATCH_BRANCHES; do
  base="$(git merge-base "$BASE_REF" "$ref")"
  commits="$(git rev-list --reverse "${base}..${ref}")"
  if [ -z "$commits" ]; then echo "no commits found on ${ref} (base ${base})" >&2; exit 1; fi
  for c in $commits; do
    echo "cherry-pick $(git log -1 --format='%h %s' "$c")"
    if ! git cherry-pick -x "$c" >/dev/null 2>"${REPORT}.err"; then
      {
        echo "Cherry-pick of \`$(git log -1 --format='%h %s' "$c")\` (from \`${ref}\`) onto \`${TAG}\` failed."
        echo
        echo "Conflicting files:"
        git diff --name-only --diff-filter=U | sed 's/^/- `/; s/$/`/'
        echo
        echo '```'
        head -c 3000 "${REPORT}.err"
        echo '```'
      } > "$REPORT"
      git cherry-pick --abort >/dev/null 2>&1 || git reset -q --hard
      cat "$REPORT"
      exit 2
    fi
  done
done

"$HERE/set-migration-version.sh" "$VERSION"
git add -A
if ! git diff --cached --quiet; then
  git -c user.name="${GIT_AUTHOR_NAME:-release-bot}" -c user.email="${GIT_AUTHOR_EMAIL:-release-bot@users.noreply.github.com}" \
    commit -q -m "Run collection cover migration as v${VERSION}"
fi
echo "patched ${TAG} -> $(git rev-parse --short HEAD)"
