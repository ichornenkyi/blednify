# Android toolchain (isolated)

Everything Android runs in the `blednify-android` Docker image; the host only gets SDK files in `~/Android/Sdk`
and caches in `~/.cache/blednify-android`. No sudo, no system packages.

```bash
docker build -t blednify-android tools/android            # once
tools/android/run.sh bash -c 'yes | sdkmanager --sdk_root=/sdk --licenses; sdkmanager --sdk_root=/sdk "platform-tools" "emulator" "platforms;android-36" "system-images;android-36;google_apis;x86_64"'
tools/android/emulator.sh                                  # headless Android 16 emulator (KVM), host adb sees emulator-5554
# build an APK that also runs on the x86_64 emulator:
BUILD_MEM=6g tools/android/run.sh bash -c 'cd apps/mobile && bunx expo prebuild -p android --no-install --clean && cd android && ./gradlew assembleRelease -PreactNativeArchitectures=x86_64,arm64-v8a'
~/Android/Sdk/platform-tools/adb install -r apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```

The emulator needs `-gpu swangle_indirect` in this setup (swiftshader/guest renderers segfault in the container).
The CI APK is arm64-only and will not start on the x86_64 emulator (`couldn't find DSO libreactnative.so`) — that is expected.
