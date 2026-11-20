#!/usr/bin/env bash
set -euo pipefail

base_version=$(cat VERSION)
if [[ ! "$base_version" =~ ^(0|[1-9][0-9]{0,7})\.(0|[1-9][0-9]{0,7})\.(0|[1-9][0-9]{0,7})$ ]]; then
  echo "VERSION must contain a stable version (major.minor.patch)." >&2
  exit 1
fi
IFS=. read -r major minor patch <<< "$base_version"

# Begin at the later of the VERSION change or the introduction of automatic versioning.
base_commit=$(git log -1 --first-parent --format=%H -- VERSION)
automatic_commit=$(git log -1 --first-parent --diff-filter=A --format=%H -- scripts/resolve-release-version.sh)
if [[ -z "$base_commit" || -z "$automatic_commit" ]]; then
  echo "Complete first-parent Git history is required to resolve the release version." >&2
  exit 1
fi
if git merge-base --is-ancestor "$base_commit" "$automatic_commit"; then
  base_commit=$automatic_commit
fi

distance=$(git rev-list --first-parent --count "$base_commit..HEAD")
patch=$((patch + distance))
if (( patch > 99999999 )); then
  echo "Automatic patch version is out of range." >&2
  exit 1
fi
printf '%s.%s.%s\n' "$major" "$minor" "$patch"
