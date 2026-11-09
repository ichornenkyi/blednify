<img src="apps/mobile/assets/brand/blednify-mark.svg" width="64" height="64" alt="">

# Blednify

A fast, ad-free, Spotify-like music player for phones (Android 16 first, iOS too), backed by your own
self-hosted music server. No ads, no tracking, no accounts.

- **Stream or download** from a Blednify server that indexes a folder of your audio files
  (mp3, flac, m4a, aac, ogg, opus, wav).
- **Import your own files** from the phone. They stay on the device unless you upload them in Admin mode.
- **Lyrics** like Spotify: synced lines that follow the song (tap a line to jump there), from `.lrc` files next
  to your songs, embedded tags, or [LRCLIB](https://lrclib.net).
- **Admin mode** (Settings): upload music from the phone to your server, delete server tracks, rescan.
- Gapless playback, background audio with lock-screen and notification controls, queue with drag reorder,
  likes, playlists, recently played, instant search over local and server music, offline downloads
  (Wi-Fi only by default).

## Repository

```
apps/server/            Bun + Hono + SQLite (FTS5) music server, Dockerfile, docker-compose.yml
apps/mobile/            Expo SDK 58 app (expo-router, expo-audio, expo-sqlite, MMKV, FlashList, Reanimated)
docs/API.md             server <-> app contract (v1), the single source of truth for both sides
docs/MOBILE_ARCH.md     mobile module contract: core/ui ownership, the @/core API, routes, performance rules
.github/workflows/      CI: checks, release APK, server Docker image
```

## Run the server

```sh
cd apps/server
bun install
MUSIC_DIR=~/Music ADMIN_TOKEN=change-me bun start      # http://0.0.0.0:8787
```

Or with Docker: `docker compose up -d` in `apps/server` (mounts `./music`). Environment variables, indexing,
search, streaming and upload behaviour are documented in [`apps/server/README.md`](apps/server/README.md).

Quick check: `curl http://localhost:8787/api/health`.

## Run the app

```sh
cd apps/mobile
bun install
bunx expo run:android        # development build on a device or emulator (Expo Go is not supported)
```

In the app open **Settings → Server**, enter the server address (for example `192.168.1.10:8787`; `http://` is
added if missing) and tap **Test**. To bake in a default, set `EXPO_PUBLIC_API_URL` at build time.
More in [`apps/mobile/README.md`](apps/mobile/README.md).

## iPhone: the web app

No App Store or developer account needed: the server also hosts the app as a web app. Build it into the
folder the server serves (`WEB_DIR`, mounted as `./web` by the compose file):

```sh
tools/web/deploy.sh apps/server/web      # or the web/ folder next to your own compose file
```

On the iPhone open the server's https address in **Safari**, enter the access token in **Settings**, then
**Share → Add to Home Screen**. It opens full screen with its own icon, keeps playing with the screen locked,
and shows lock-screen / Control Center controls. It streams only: importing files from the phone, offline
downloads, uploads and Android Auto stay in the Android app. iOS needs https for this (the Cloudflare tunnel
provides it) and iOS 17 or later.

## CI and downloads

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push and pull request:

| Job | What it does |
|---|---|
| Server · typecheck + test | `bun run typecheck`, `bun test` in `apps/server` |
| Mobile · typecheck + lint + doctor | `tsc --noEmit`, `expo lint`, `expo-doctor` in `apps/mobile` |
| Android · release APK | `expo prebuild` + `gradlew assembleRelease` (arm64-v8a), version code = run number |
| Server · Docker image | pushes `ghcr.io/<owner>/blednify-server:latest` and `:<sha>` (main and `v*` tags) |

Where the APK appears:

- **Every run:** the workflow run's **Artifacts** section, `blednify-apk`
  (`blednify-<run>-<sha>.apk`).
- **Pushes to `main`:** the rolling pre-release **`latest`** on the Releases page, replaced on each push.
  Install `blednify-latest.apk` from there.
- **Tags `v*`:** a regular GitHub Release with the APK attached.

Optional repository settings:

- Variable `BLEDNIFY_API_URL`: default server URL baked into CI builds.
- Secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`:
  sign the release APK with your key. Without them the APK is signed with the template's public debug key, which
  is fine for sideloading but not for store distribution.
