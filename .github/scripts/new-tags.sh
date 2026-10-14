#!/usr/bin/env bash
# Prints stable upstream release tags (vX.Y.Z) that are >= MIN_VERSION and for which
# no image exists yet, oldest first, at most MAX_TAGS of them.
#
# Environment:
#   UPSTREAM_URL   default https://github.com/advplyr/audiobookshelf.git
#   MIN_VERSION    default 2.37.1  (older releases are never built)
#   MAX_TAGS       default 3       (how many new releases one run may build)
#   IMAGE          e.g. ghcr.io/<owner>/audiobookshelf-collection-cover; tags that already have
#                  IMAGE:<tag> (checked with `docker buildx imagetools inspect`) are skipped.
#                  If unset, nothing is skipped.
#   ONLY_TAG       if set, print only this tag (manual run), regardless of MIN_VERSION
set -euo pipefail

UPSTREAM_URL="${UPSTREAM_URL:-https://github.com/advplyr/audiobookshelf.git}"
MIN_VERSION="${MIN_VERSION:-2.37.1}"
MAX_TAGS="${MAX_TAGS:-3}"

if [ -n "${ONLY_TAG:-}" ]; then
  if ! printf '%s' "$ONLY_TAG" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+$'; then
    echo "ONLY_TAG must look like v1.2.3, got: ${ONLY_TAG}" >&2
    exit 1
  fi
  tags="${ONLY_TAG}"
else
  tags="$(git ls-remote --tags --refs "$UPSTREAM_URL" 'refs/tags/v*' \
    | sed -E 's#.*refs/tags/##' \
    | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' \
    | sort -V)"
fi

out=()
for t in $tags; do
  v="${t#v}"
  if [ -z "${ONLY_TAG:-}" ] && [ "$(printf '%s\n%s\n' "$MIN_VERSION" "$v" | sort -V | head -1)" != "$MIN_VERSION" ]; then
    continue   # v < MIN_VERSION
  fi
  if [ -n "${IMAGE:-}" ] && [ -z "${FORCE:-}" ] && docker buildx imagetools inspect "${IMAGE}:${t}" >/dev/null 2>&1; then
    continue   # already built
  fi
  out+=("$t")
done

# newest MAX_TAGS, printed oldest first
count="${#out[@]}"
start=$(( count > MAX_TAGS ? count - MAX_TAGS : 0 ))
for ((i = start; i < count; i++)); do echo "${out[$i]}"; done
