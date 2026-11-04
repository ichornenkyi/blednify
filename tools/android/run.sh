#!/usr/bin/env bash
# Usage: tools/android/run.sh <command...>   (runs inside the toolchain container)
# Mounts: repo -> /work, $ANDROID_SDK_DIR (default ~/Android/Sdk) -> /sdk, gradle cache volume.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
SDK=${ANDROID_SDK_DIR:-$HOME/Android/Sdk}
CACHE=${XDG_CACHE_HOME:-$HOME/.cache}/blednify-android
mkdir -p "$SDK" "$HOME/.android" "$CACHE/gradle" "$CACHE/bun"
exec docker run --rm -i $( [ -t 0 ] && echo -t ) \
  --user "$(id -u):$(id -g)" -e HOME=/tmp -e ANDROID_USER_HOME="$HOME/.android" -v "$HOME/.android":"$HOME/.android" \
  --memory "${BUILD_MEM:-5g}" \
  -v "$ROOT":/work -v "$SDK":/sdk \
  -v "$CACHE/gradle":/gradle -v "$CACHE/bun":/tmp/.bun/install/cache \
  -e GRADLE_OPTS="-Dorg.gradle.jvmargs=-Xmx3g -Dorg.gradle.workers.max=4" \
  -w /work blednify-android "$@"
