#!/usr/bin/env bash
# Signs release builds with the Blednify release key instead of the template debug key.
# Run from apps/mobile after `expo prebuild` (prebuild --clean regenerates android/ and drops this).
#
#   KEYSTORE_FILE=/path/blednify-release.jks KEYSTORE_PASSWORD=... KEY_ALIAS=blednify KEY_PASSWORD=... \
#     ../../tools/android/apply-release-signing.sh
#
# KEYSTORE_B64 (base64 of the .jks, as stored in CI secrets) can replace KEYSTORE_FILE.
# With neither set it does nothing, and the APK keeps the debug key (a warning is printed).
set -euo pipefail

app=android/app
[ -f "$app/build.gradle" ] || { echo "run from apps/mobile after expo prebuild" >&2; exit 1; }

if [ -n "${KEYSTORE_B64:-}" ]; then
  printf '%s' "$KEYSTORE_B64" | base64 -d > "$app/release.keystore"
elif [ -n "${KEYSTORE_FILE:-}" ]; then
  cp "$KEYSTORE_FILE" "$app/release.keystore"
else
  echo "warning: no release keystore; the APK is signed with the template debug key" >&2
  exit 0
fi
chmod 600 "$app/release.keystore"
: "${KEYSTORE_PASSWORD:?}" "${KEY_ALIAS:?}" "${KEY_PASSWORD:?}"

# Passwords go to gradle.properties (read as plain strings), never into build.gradle. The generated file may
# lack a trailing newline: without one, the first line would be glued onto the last property.
[ -s android/gradle.properties ] && [ -n "$(tail -c1 android/gradle.properties)" ] && echo >> android/gradle.properties
cat >> android/gradle.properties <<EOF
BLEDNIFY_STORE_FILE=release.keystore
BLEDNIFY_STORE_PASSWORD=$KEYSTORE_PASSWORD
BLEDNIFY_KEY_ALIAS=$KEY_ALIAS
BLEDNIFY_KEY_PASSWORD=$KEY_PASSWORD
EOF

python3 - "$app/build.gradle" <<'PY'
import re, sys, pathlib
p = pathlib.Path(sys.argv[1])
s = p.read_text()
s = s.replace("signingConfigs {", """signingConfigs {
        release {
            storeFile file(BLEDNIFY_STORE_FILE)
            storePassword BLEDNIFY_STORE_PASSWORD
            keyAlias BLEDNIFY_KEY_ALIAS
            keyPassword BLEDNIFY_KEY_PASSWORD
        }""", 1)
s, n = re.subn(r"(buildTypes\s*\{.*?release \{[^}]*?)signingConfig signingConfigs\.debug",
               r"\1signingConfig signingConfigs.release", s, count=1, flags=re.S)
if n != 1:
    sys.exit("could not point the release build type at the release signing config")
p.write_text(s)
PY
echo "release signing configured (alias $KEY_ALIAS)"
