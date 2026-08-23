#!/usr/bin/env bash
# Кладёт в репозиторий всё, что нужно пайплайну, одной командой.
#
#   scripts/setup-ci.sh
#
# После этого:
#   • пуш в основную ветку — сборка, подпись и релиз APK;
#   • изменения в services/api — публикация Worker на Cloudflare.
#
# Запускать с машины, где есть `gh auth login`: положить секрет в репозиторий
# может только тот, у кого есть на него права, и это ровно то, чего нет у
# автоматики внутри репозитория.
set -euo pipefail

REPO="${PNA_REPO:-igor-ganov/personal-news-agent}"
KEYSTORE="${PNA_KEYSTORE:-$HOME/.pna-android/pna-release.jks}"

die() { echo "✗ $*" >&2; exit 1; }
ok() { echo "✓ $*"; }

command -v gh >/dev/null || die "нужен gh: https://cli.github.com"
gh auth status >/dev/null 2>&1 || die "сначала gh auth login"

# Секрет читается из окружения или спрашивается, но никогда не передаётся
# аргументом: аргументы видны в списке процессов и остаются в истории оболочки.
ask() {
  local name="$1" prompt="$2" value="${!1:-}"
  if [ -z "$value" ]; then
    read -rsp "$prompt: " value
    echo
  fi
  [ -n "$value" ] || die "$name пустой"
  printf '%s' "$value" | gh secret set "$name" --repo "$REPO"
  # Значение возвращается вызывающему: ниже им ещё проверяется отпечаток.
  printf -v "$name" '%s' "$value"
  ok "$name"
}

echo "Репозиторий: $REPO"
echo

# ---------------------------------------------------------------- Cloudflare --
echo "Cloudflare — публикация Worker из пайплайна."
echo "Токен: Workers Scripts Edit, D1 Edit, Workers Routes Edit."
ask CLOUDFLARE_API_TOKEN "  API-токен"
CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-c5b8f26375cab6f66eab9981fe3b6d3a}"
printf '%s' "$CLOUDFLARE_ACCOUNT_ID" | gh secret set CLOUDFLARE_ACCOUNT_ID --repo "$REPO"
ok "CLOUDFLARE_ACCOUNT_ID ($CLOUDFLARE_ACCOUNT_ID)"
echo

# ------------------------------------------------------------------- Android --
echo "Android — подпись APK внутри пайплайна."
[ -f "$KEYSTORE" ] || die "нет хранилища ключей: $KEYSTORE (задайте PNA_KEYSTORE)"

base64 -w0 "$KEYSTORE" | gh secret set ANDROID_KEYSTORE_BASE64 --repo "$REPO"
ok "ANDROID_KEYSTORE_BASE64 ($(basename "$KEYSTORE"))"

PNA_KEY_ALIAS="${PNA_KEY_ALIAS:-pna}"
printf '%s' "$PNA_KEY_ALIAS" | gh secret set ANDROID_KEY_ALIAS --repo "$REPO"
ok "ANDROID_KEY_ALIAS ($PNA_KEY_ALIAS)"

ANDROID_KEYSTORE_PASSWORD="${PNA_KEYSTORE_PASS:-${ANDROID_KEYSTORE_PASSWORD:-}}"
ask ANDROID_KEYSTORE_PASSWORD "  пароль хранилища"
echo

# Отпечаток подписи должен совпадать с тем, что отдаёт assetlinks.json, иначе
# Credential Manager не свяжет приложение с доменом и вход по ключу отвалится.
# Проверяем здесь, а не после первого неудачного входа на телефоне.
if command -v keytool >/dev/null; then
  local_fp="$(
    keytool -list -v -keystore "$KEYSTORE" -alias "$PNA_KEY_ALIAS" \
      -storepass "$ANDROID_KEYSTORE_PASSWORD" 2>/dev/null \
      | grep -m1 'SHA256:' | awk '{print $2}'
  )"
  published_fp="$(
    curl -fsS https://pna-api.igor-ganov.workers.dev/.well-known/assetlinks.json \
      | grep -oiE '[0-9A-F]{2}(:[0-9A-F]{2}){31}' | head -1
  )" || published_fp=""

  if [ -n "$local_fp" ] && [ "$local_fp" = "$published_fp" ]; then
    ok "отпечаток совпадает с assetlinks.json"
  else
    echo "⚠ отпечаток ключа не совпадает с assetlinks.json"
    echo "    ключ:       ${local_fp:-не прочитан}"
    echo "    assetlinks: ${published_fp:-пусто}"
    echo "    поправьте ANDROID_CERT_FINGERPRINTS в services/api/wrangler.toml,"
    echo "    иначе вход по ключу доступа на Android работать не будет."
  fi
fi

echo
echo "Готово. Секреты в репозитории:"
gh secret list --repo "$REPO"
echo
echo "Запустить сборку прямо сейчас:"
echo "  gh workflow run android.yml --repo $REPO"
