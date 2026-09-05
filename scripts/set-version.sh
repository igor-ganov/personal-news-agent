#!/usr/bin/env bash
# Sets the release version everywhere at once.
#
#   scripts/set-version.sh 0.2.0
#
# The version lives in six kinds of file — the root manifest, every workspace
# package, the Tauri config, two Cargo manifests and the Rust lockfile — and the
# release tag is read from `apps/mobile/package.json`. Updating them by hand
# means updating five of six and shipping a release that says the wrong thing,
# which is exactly what happened before this script existed.
set -euo pipefail

version="${1:-}"
if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Нужна версия вида 1.2.3, получено: '${version}'" >&2
  exit 1
fi

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

# Android refuses an update whose versionCode did not grow; Tauri derives it
# from this string, so a bump here is what makes the next build installable.
node - "$version" <<'NODE'
const { readFileSync, writeFileSync } = require("node:fs");
const version = process.argv[2];

const manifests = [
  "package.json",
  "apps/mobile/package.json",
  "apps/mobile/src-tauri/tauri.conf.json",
  "packages/agent/package.json",
  "packages/app/package.json",
  "packages/auth/package.json",
  "packages/core/package.json",
  "packages/storage/package.json",
  "packages/ui/package.json",
  "services/api/package.json",
];

for (const path of manifests) {
  const text = readFileSync(path, "utf8");
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const parsed = JSON.parse(text);
  parsed.version = version;
  writeFileSync(path, JSON.stringify(parsed, null, 2).replaceAll("\n", eol) + eol);
}
NODE

for cargo in apps/mobile/src-tauri/Cargo.toml apps/mobile/src-tauri/plugins/passkeys/Cargo.toml; do
  # Only the version of the package itself — dependency pins stay untouched.
  perl -0pi -e "s/^(\[package\][^\[]*?\nversion = \")[^\"]+(\")/\${1}${version}\${2}/ms" "$cargo"
done

# The lockfile names the local crates too; a stale entry breaks a --locked build.
# Its line endings depend on the machine that last wrote it, hence \r?.
for crate in personal-news-agent tauri-plugin-passkeys; do
  perl -0pi -e "s/(name = \"${crate}\"\r?\nversion = \")[^\"]+(\")/\${1}${version}\${2}/" \
    apps/mobile/src-tauri/Cargo.lock
done

echo "Версия ${version} проставлена. Что изменилось:"
git diff --stat -- '*.json' '*.toml' Cargo.lock apps/mobile/src-tauri/Cargo.lock | tail -20
echo
echo "Дальше: закоммитить и запушить — пайплайн соберёт релиз v${version}."
