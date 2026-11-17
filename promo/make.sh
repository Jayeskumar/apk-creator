#!/usr/bin/env bash
# Rebuilds the APK Creator product video from scratch:
#   demo server + seed data -> screen recordings -> soundtrack -> frame render -> MP4
#
# Requirements: Node 22, Python 3 with numpy + scipy + Pillow, ffmpeg (libx264),
# Playwright Chromium, and an Android SDK (ANDROID_HOME) for the real builds.
#
#   ANDROID_HOME=/opt/android-sdk promo/make.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$HERE")"
OUT="$HERE/out"
PORT=8090

rm -rf "$HERE/data" "$OUT"
mkdir -p "$HERE/data" "$OUT"

echo "▶ starting demo server on :$PORT"
( cd "$ROOT/server" && DATA_DIR="$HERE/data" PORT=$PORT PUBLIC_URL=http://apps.example.com \
    node --disable-warning=ExperimentalWarning src/index.js > "$OUT/server.log" 2>&1 ) &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT
for _ in $(seq 1 30); do curl -fs "http://127.0.0.1:$PORT/api/health" >/dev/null && break; sleep 1; done

echo "▶ seeding demo apps (includes real APK builds)"
node "$HERE/seed.js" "http://127.0.0.1:$PORT" > "$OUT/seed.json"

echo "▶ recording screen clips"
node "$HERE/record.js" "$OUT/seed.json" "$OUT"

echo "▶ composing soundtrack"
python3 "$HERE/music.py" "$OUT/music.wav"

echo "▶ rendering frames"
python3 "$HERE/prep.py" "$OUT"
node "$HERE/render.js" "$OUT"

echo "▶ muxing"
ffmpeg -y -hide_banner -loglevel error -i "$OUT/video.mp4" -i "$OUT/music.wav" \
  -map 0:v -map 1:a -c:v copy -af "loudnorm=I=-14:TP=-1.5:LRA=11" -c:a aac -b:a 192k -ar 48000 \
  -shortest -movflags +faststart "$OUT/apk-creator-intro.mp4"
ffmpeg -y -hide_banner -loglevel error -ss 101 -i "$OUT/apk-creator-intro.mp4" -frames:v 1 "$OUT/poster.jpg"
echo "✔ $OUT/apk-creator-intro.mp4"
