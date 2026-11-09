#!/bin/sh
# Builds the web app (apps/mobile, `expo export -p web`) and copies it into the folder the server serves
# as WEB_DIR. Default target: ~/apps/blednify/web (mounted read-only into the container as /web).
#
#   tools/web/deploy.sh [target-dir]
#
# Old hashed bundles are kept on purpose: a phone that still has the previous index.html open can finish
# loading its lazy chunks. index.html is revalidated on every launch, so the next start picks up the new build.
set -eu
root=$(cd "$(dirname "$0")/../.." && pwd)
target=${1:-$HOME/apps/blednify/web}
out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT
cd "$root/apps/mobile"
bunx expo export -p web --output-dir "$out" >/dev/null
mkdir -p "$target"
# Assets first, then the shell, so a request in between never sees an index.html pointing at missing files.
cp -R "$out/." "$target/"
cp "$out/index.html" "$target/index.html"
echo "web app deployed to $target ($(du -sh "$out" | cut -f1))"
