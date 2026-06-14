#!/bin/sh
# Xcode Cloud kører dette efter clone, før build. Capacitor 8's SPM-pakker peger på
# node_modules/@capacitor/* (gitignored), så vi skal installere JS-deps + bygge www/ + cap sync,
# ellers fejler pakke-resolution ("package doesn't exist in file system").
set -e

echo "=== ci_post_clone: Node + Capacitor deps ==="

# Xcode Cloud-imaget har Homebrew men ikke Node — installér det.
brew install node

# Repo-roden (hvor package.json + ios/ ligger).
cd "$CI_PRIMARY_REPOSITORY_PATH"

# Xcode Clouds sandbox kan have transiente DNS-glitches mod registry.npmjs.org (ENOTFOUND).
# Konfigurér rundhåndede retries og forsøg npm ci flere gange med pause imellem.
npm config set fetch-retries 6
npm config set fetch-retry-mintimeout 15000
npm config set fetch-retry-maxtimeout 120000

n=0
max=5
until [ "$n" -ge "$max" ]; do
  if npm ci; then
    echo "npm ci OK (forsøg $((n + 1)))"
    break
  fi
  n=$((n + 1))
  echo "npm ci fejlede (forsøg $n/$max) — venter 20s og prøver igen..."
  sleep 20
done
if [ "$n" -ge "$max" ]; then
  echo "npm ci fejlede efter $max forsøg — Xcode Clouds netværk er nede mod npm."
  exit 1
fi

# Byg web-assets til www/ og synk ind i iOS-projektet (løser SPM-pakkestierne).
npm run cap:sync

echo "=== ci_post_clone: done ==="
