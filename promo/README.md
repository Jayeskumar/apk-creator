# Product video

`make.sh` regenerates the 1:46 APK Creator intro video (1920×1080, 30 fps, H.264 + AAC) end to end, with no external services:

1. **Demo data:** starts a throwaway server and seeds realistic apps, leads and real APK builds (`seed.js`).
2. **Screen recordings:** drives the real web app in headless Chromium and captures DevTools screencast frames with a drawn cursor and click ripples (`record.js`, `lib/recorder.js`).
3. **Soundtrack:** an original 120 BPM track plus sound effects, synthesized in Python (`music.py`). Every scene change falls on a bar line, and a chime plays the moment the on-screen build succeeds. No samples or third-party music are used, so there are no licensing issues.
4. **Edit:** `director/` is an HTML timeline (titles, captions, browser and phone mockups, zooms, transitions). `render.js` renders it frame by frame and pipes the frames to ffmpeg.

```bash
ANDROID_HOME=/opt/android-sdk promo/make.sh     # ~15 minutes
# -> promo/out/apk-creator-intro.mp4 and promo/out/poster.jpg
```

To preview single frames while editing the timeline:

```bash
python3 promo/prep.py promo/out
node promo/render.js promo/out --stills 3,30,64,78    # -> promo/out/preview-<t>.png
```

| Time | Scene |
|---|---|
| 0:00 | Logo and tagline |
| 0:06 | "Your business deserves an app" (template phones) |
| 0:12 | 01 Templates (recording) |
| 0:24 | 02 Design with live preview (recording) |
| 0:34 | 03 Editing pages (recording) |
| 0:46 | 04 Orders, bookings and leads (phone and inbox recordings) |
| 0:56 | 05 One-click signed build (recording, chime on success) |
| 1:06 | 06 AI-assisted: an assistant builds an app over MCP (music drop) |
| 1:22 | 07 Bring your own code (recording) |
| 1:30 | 08 On-premise or cloud |
| 1:38 | Outro and call to action |
