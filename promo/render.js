// Renders the director timeline to video.
//   node promo/render.js out                    full render -> out/video.mp4 (no audio)
//   node promo/render.js out --stills 3,15,62   preview frames -> out/preview-<t>.png
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const OUT = path.resolve(process.argv[2] || "out");
const stillsArg = process.argv.indexOf("--stills");
const FPS = 30;

(async () => {
  const browser = await chromium.launch({ args: ["--allow-file-access-from-files", "--disable-web-security"] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.error("pageerror:", e.message));
  await page.goto("file://" + path.join(__dirname, "director", "index.html"));
  await page.waitForFunction(() => typeof window.renderAt === "function");
  await page.evaluate(() => document.fonts.ready);
  const duration = await page.evaluate(() => window.DURATION);

  if (stillsArg > 0) {
    for (const t of process.argv[stillsArg + 1].split(",").map(Number)) {
      await page.evaluate((t) => window.renderAt(t), t);
      await page.screenshot({ path: path.join(OUT, `preview-${t}.png`) });
      console.log("preview", t);
    }
    await browser.close();
    return;
  }

  const ff = spawn("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error",
    "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
    "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-tune", "animation",
    path.join(OUT, "video.mp4")], { stdio: ["pipe", "inherit", "inherit"] });
  const total = Math.round(duration * FPS);
  const t0 = Date.now();
  for (let f = 0; f < total; f++) {
    await page.evaluate((t) => window.renderAt(t), f / FPS);
    const jpg = await page.screenshot({ type: "jpeg", quality: 94 });
    if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once("drain", r));
    if (f % 150 === 0) {
      const el = (Date.now() - t0) / 1000;
      console.log(`frame ${f}/${total} (${(f / FPS).toFixed(1)}s) ${el.toFixed(0)}s elapsed, ~${((total - f) * el / Math.max(1, f)).toFixed(0)}s left`);
    }
  }
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
  await browser.close();
  console.log(`video rendered in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
})().catch((e) => { console.error(e); process.exit(1); });
