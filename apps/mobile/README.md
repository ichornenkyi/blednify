# blednify-mobile

The Blednify phone app (Android 16 primary, iOS). Expo SDK 58, React Native 0.88 (New Architecture, Hermes,
React Compiler), expo-router, TypeScript strict. No web target.

The module contract (ownership, the `@/core` API, routes, performance rules) is
[`docs/MOBILE_ARCH.md`](../../docs/MOBILE_ARCH.md). The server contract is [`docs/API.md`](../../docs/API.md).

```
src/app/    routes (expo-router): (tabs) Home/Search/Library, player, queue, album, artist, playlist, downloads, settings
src/ui/     theme, components, overlays (sheet, toast), navigation helpers
src/core/   data and side effects, exposed only through the `@/core` barrel:
            settings (MMKV), SQLite library, server API (react-query), player (expo-audio), downloads, import
assets/     app icon, adaptive icon, splash, brand marks
```

## Develop

The app uses native modules that are not in Expo Go (MMKV/Nitro, expo-audio background playback), so run it as
a development build:

```sh
bun install
bunx expo run:android          # builds android/ via prebuild (CNG, gitignored) and installs on a device/emulator
bunx expo start                # Metro only, once the build is installed
```

Set a default server with `EXPO_PUBLIC_API_URL=http://192.168.1.10:8787` (otherwise enter it in
Settings → Server). With no server the app works fully offline on imported files.

## Checks

```sh
bunx tsc --noEmit
bunx expo lint
bunx expo-doctor
bunx expo export --platform android --output-dir /tmp/blednify-export   # JS bundle builds
```

## Release APK

```sh
bunx expo prebuild --platform android --no-install --clean
cd android && ./gradlew assembleRelease     # android/app/build/outputs/apk/release/
```

CI does this on every push; see the root [README](../../README.md#ci-and-downloads).
