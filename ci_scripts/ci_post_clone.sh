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

# Installér JS-deps (inkl. de lokale Capacitor SPM-pakker under node_modules).
npm ci

# Byg web-assets til www/ og synk ind i iOS-projektet (løser SPM-pakkestierne).
npm run cap:sync

echo "=== ci_post_clone: done ==="
