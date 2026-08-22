#!/usr/bin/env bash
# Aligns and signs a release APK.
#
#   scripts/sign-apk.sh [путь-к-unsigned.apk] [путь-к-выходному.apk]
#
# Gradle produces an unsigned APK; Android refuses to install one. This does the
# two remaining steps — zipalign, then apksigner — and verifies the result.
#
# The keystore is looked up outside the repository on purpose: a signing key
# must never be committed. Override with PNA_KEYSTORE / PNA_KEYSTORE_PASS /
# PNA_KEY_ALIAS.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./android-env.sh
. "$here/android-env.sh"

KEYSTORE="${PNA_KEYSTORE:-$HOME/.pna-android/pna-release.jks}"
KEYSTORE_PASS="${PNA_KEYSTORE_PASS:-pna-dev-key}"
KEY_ALIAS="${PNA_KEY_ALIAS:-pna}"

gen="$here/../apps/mobile/src-tauri/gen/android/app/build/outputs/apk"
IN="${1:-$gen/universal/release/app-universal-release-unsigned.apk}"
OUT="${2:-$here/../apps/mobile/src-tauri/gen/android/app/build/outputs/apk/personal-news-agent.apk}"

if [ ! -f "$IN" ]; then
  echo "APK не найден: $IN" >&2
  echo "Соберите его: pnpm android:build" >&2
  exit 1
fi

if [ ! -f "$KEYSTORE" ]; then
  cat >&2 <<MSG
Keystore не найден: $KEYSTORE

Создайте свой — тем же ключом придётся подписывать все будущие обновления,
иначе Android откажется ставить их поверх установленного приложения:

  keytool -genkeypair -v -keystore "$KEYSTORE" -alias "$KEY_ALIAS" \\
    -keyalg RSA -keysize 4096 -validity 10000
MSG
  exit 1
fi

tools="$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -1)"
aligned="$(mktemp -t pna-aligned-XXXXXX.apk)"
trap 'rm -f "$aligned"' EXIT

"$tools/zipalign" -p -f 4 "$IN" "$aligned"
"$tools/apksigner" sign \
  --ks "$KEYSTORE" \
  --ks-key-alias "$KEY_ALIAS" \
  --ks-pass "pass:$KEYSTORE_PASS" \
  --key-pass "pass:$KEYSTORE_PASS" \
  --out "$OUT" \
  "$aligned"

"$tools/apksigner" verify --print-certs "$OUT" | head -4
printf 'Подписанный APK: %s (%.1f МБ)\n' "$OUT" "$(echo "scale=3; $(stat -c%s "$OUT")/1048576" | bc)"
