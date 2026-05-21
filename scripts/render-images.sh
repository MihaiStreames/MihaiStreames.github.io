#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPTS="$ROOT/scripts"
STATIC="$ROOT/static"
BG="#1e1e2e"

chrome() {
  chromium \
    --headless \
    --disable-gpu \
    --hide-scrollbars \
    --virtual-time-budget=2000 \
    "$@"
}

echo "rendering favicon..."
tmp=$(mktemp --suffix=.png)
trap 'rm -f "$tmp"' EXIT

chrome \
  --window-size=256,256 \
  --screenshot="$tmp" \
  "file://$SCRIPTS/favicon.html" >/dev/null

magick "$tmp" \
  -fuzz 5% -trim +repage \
  -gravity center -background "$BG" \
  -extent 256x256 \
  "$STATIC/favicon.png"

echo "rendering og-image..."
chrome \
  --window-size=1200,630 \
  --screenshot="$STATIC/og-image.png" \
  "file://$SCRIPTS/og-image.html" >/dev/null

echo "generating post hero og fallbacks..."
shopt -s nullglob
for gif in "$STATIC"/images/posts/*.gif; do
  out="${gif%.gif}-og.png"
  # last frame after coalesce - gifs use delta frames, need full paint
  magick "$gif" -coalesce -delete '0--2' "$out"
  echo "  $(basename "$out")"
done

echo "done."
