#!/usr/bin/env bash
# Renames the collection-cover migration (file, test, changelog row, version strings)
# so that it runs on the given base version of Audiobookshelf.
#
# ABS only runs a migration when:  old DB version < migration version <= package.json version.
# Upstream PR branches name it after the *next* upstream release (v2.38.0); a fork
# that sits on an older base has to rename it to the base version.
#
# Usage: .github/scripts/set-migration-version.sh 2.37.1
set -euo pipefail
NEW="${1:?usage: $0 <x.y.z>}"
cd "$(git rev-parse --show-toplevel)"

NAME="add-collection-cover-path"
OLD_FILE="$(ls server/migrations/v*-${NAME}.js 2>/dev/null | head -1 || true)"
[ -n "$OLD_FILE" ] || { echo "migration for ${NAME} not found" >&2; exit 1; }
OLD="$(basename "$OLD_FILE" | sed -E "s/^v([0-9]+\.[0-9]+\.[0-9]+)-.*/\1/")"

if [ "$OLD" = "$NEW" ]; then echo "already v${NEW}"; exit 0; fi

git mv "server/migrations/v${OLD}-${NAME}.js" "server/migrations/v${NEW}-${NAME}.js"
git mv "test/server/migrations/v${OLD}-${NAME}.test.js" "test/server/migrations/v${NEW}-${NAME}.test.js"

# keep the changelog table aligned: both versions have the same length (x.y.z), so a plain replace is enough
OLDRE="${OLD//./\\.}"
sed -i.bak -E "s/v${OLDRE}/v${NEW}/g; s/'${OLDRE}'/'${NEW}'/g; s/\[${OLDRE} migration\]/[${NEW} migration]/g; s/${OLDRE}-${NAME}/${NEW}-${NAME}/g" \
  "server/migrations/v${NEW}-${NAME}.js" \
  "test/server/migrations/v${NEW}-${NAME}.test.js" \
  server/migrations/changelog.md
rm -f server/migrations/v${NEW}-${NAME}.js.bak test/server/migrations/v${NEW}-${NAME}.test.js.bak server/migrations/changelog.md.bak
echo "renamed v${OLD} -> v${NEW}"
