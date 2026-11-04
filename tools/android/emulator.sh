#!/usr/bin/env bash
# Headless Android 16 emulator inside the toolchain container (KVM passthrough, host network so host adb sees it).
# Usage: tools/android/emulator.sh [avd-name]    Stop: docker rm -f blednify-emulator
set -euo pipefail
SDK=${ANDROID_SDK_DIR:-$HOME/Android/Sdk}
AVD=${1:-Blednify_Pixel_A16}
docker rm -f blednify-emulator >/dev/null 2>&1 || true
rm -rf "$HOME/.android/avd/$AVD.avd/"*.lock
exec docker run -d --name blednify-emulator --network host --device /dev/kvm \
  --user "$(id -u):$(id -g)" --group-add "$(stat -c %g /dev/kvm)" \
  -e HOME=/tmp -e ANDROID_HOME=/sdk -e ANDROID_SDK_ROOT=/sdk -e ANDROID_USER_HOME="$HOME/.android" -e ANDROID_AVD_HOME="$HOME/.android/avd" \
  -v "$SDK":/sdk -v "$HOME/.android":"$HOME/.android" \
  blednify-android /sdk/emulator/emulator -avd "$AVD" -no-window -no-audio -no-boot-anim \
    -gpu ${EMU_GPU:-swangle_indirect} -no-metrics -no-snapshot -memory 2048 -cores 4 -port 5554
