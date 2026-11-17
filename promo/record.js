// Records the screen clips and stills used by the promo video.
//   node promo/record.js <seed.json> <out dir> [clip names...]
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { Recorder, sleep } = require("./lib/recorder");

const [seedFile, OUT, ...only] = process.argv.slice(2);
const seed = JSON.parse(fs.readFileSync(seedFile, "utf8").trim().split("\n").pop());
const HOST = "http://apps.example.com";
const API = "http://127.0.0.1:8090";
const clipsDir = path.join(OUT, "clips");
const stillsDir = path.join(OUT, "stills");
fs.mkdirSync(stillsDir, { recursive: true });

const api = async (method, url, body) => {
  const res = await fetch(API + url, { method, headers: { "content-type": "application/json", authorization: `Bearer ${seed.token}` }, body: body ? JSON.stringify(body) : undefined });
  return res.json();
};
const want = (name) => !only.length || only.includes(name);

(async () => {
  const browser = await chromium.launch({ args: [`--host-resolver-rules=MAP apps.example.com 127.0.0.1:8090`] });

  // ---------------------------------------------------------------- desktop clips
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await Recorder.prepare(desk);
  await desk.addInitScript(([t]) => { try { localStorage.setItem("apkc.token", t); } catch {} }, [seed.token]);
  const page = await desk.newPage();
  const rec = new Recorder(page, { maxWidth: 1440, maxHeight: 900 });
  const go = async (hash, wait = ".main") => {
    await page.goto(`${HOST}/#${hash}`);
    await page.waitForSelector(wait);
    await sleep(900);
  };
  const clip = async (name, fn) => {
    if (!want(name)) return;
    await rec.start(path.join(clipsDir, name));
    await fn();
    const r = await rec.stop();
    console.log(`clip ${name}: ${r.duration.toFixed(1)}s, ${r.frames} frames`);
  };

  if (want("dashboard")) {
    await go("/apps", ".app-card");
    await page.screenshot({ path: path.join(stillsDir, "dashboard.png") });
  }
  await clip("dashboard", async () => {
    await sleep(500);
    await rec.hover(page.locator(".app-card").nth(0), 900);
    await sleep(500);
    await rec.hover(page.locator(".app-card").nth(2), 800);
    await sleep(700);
  });

  if (want("templates")) await go("/templates", ".tpl-card");
  await clip("templates", async () => {
    await sleep(500);
    await rec.click(page.locator(".chip", { hasText: "Food & Drink" }));
    await sleep(1300);
    await rec.click(page.locator(".chip", { hasText: "Health & Beauty" }));
    await sleep(1300);
    await rec.click(page.locator(".chip", { hasText: "All" }), { ms: 500 });
    await sleep(500);
    await rec.click(page.locator(".search"));
    await rec.type("real estate", 70);
    await sleep(900);
    await rec.hover(page.locator(".tpl-card").first(), 700);
    await sleep(900);
    await page.fill(".search", "");
    await page.dispatchEvent(".search", "input");
    await rec.move(1200, 500, 600);
    await rec.scroll(520, 1300);
    await sleep(600);
  });

  if (want("design")) {
    await go(`/apps/${seed.apps.glow}/design`, ".preset");
    await sleep(1500);
  }
  await clip("design", async () => {
    await sleep(500);
    for (const [name, wait] of [["Ocean", 1250], ["Midnight", 1450], ["Sunset", 1250], ["Royal", 1250], ["Berry", 1500]]) {
      await rec.click(page.locator(".preset", { hasText: name }), { ms: 520 });
      await sleep(wait);
    }
    const font = page.locator(".editor-panel select").first();
    await rec.click(font, { ms: 600 });
    await font.selectOption("serif");
    await sleep(1500);
  });

  if (want("pages")) {
    await go(`/apps/${seed.apps.glow}/pages`, ".page-row");
    await sleep(1500);
  }
  await clip("pages", async () => {
    await sleep(400);
    await rec.click(page.locator(".page-row", { hasText: "Home" }));
    await sleep(900);
    await rec.click(page.locator(".page-editor input[placeholder='Defaults to your business name']"));
    await rec.type("Glow Studio Downtown", 75);
    await sleep(1000);
    await rec.click(page.locator(".page-row", { hasText: "Services" }));
    await sleep(1300);
    await rec.click(page.locator(".list-item summary").first());
    await sleep(600);
    const nameInput = page.locator(".list-item").first().locator("input").first();
    await rec.click(nameInput, { ms: 500 });
    await nameInput.selectText();
    await rec.type("Signature Cut & Style", 70);
    await sleep(500);
    const price = page.locator(".list-item").first().locator("input").nth(1);
    await rec.click(price, { ms: 450 });
    await price.selectText();
    await rec.type("55", 120);
    await sleep(1800);
  });

  if (want("build")) {
    await go(`/apps/${seed.apps.brew}/build`, ".build-option");
    await sleep(600);
  }
  await clip("build", async () => {
    await sleep(600);
    await rec.click(page.locator(".build-option", { hasText: "APK" }), { ms: 800 });
    rec.mark("started");
    await rec.move(860, 560, 900);
    await page.waitForSelector(".download-panel", { timeout: 300000 });
    rec.mark("finished");
    await sleep(500);
    await rec.hover(page.locator(".download-panel .btn-primary"), 800);
    await sleep(1800);
  });

  if (want("leads")) await go(`/apps/${seed.apps.bella}/leads`, ".lead");
  await clip("leads", async () => {
    await sleep(500);
    await rec.hover(page.locator(".lead").nth(0), 800);
    await sleep(900);
    await rec.hover(page.locator(".lead").nth(1), 700);
    await sleep(1300);
    await rec.hover(page.locator("text=Export CSV"), 700);
    await sleep(900);
  });

  if (want("code")) {
    await go(`/apps/${seed.apps.tip}/files`, ".code-area");
    await sleep(2200);
  }
  await clip("code", async () => {
    await sleep(500);
    await rec.click(page.locator(".file-row", { hasText: "style.css" }));
    await page.waitForFunction(() => document.querySelector(".code-area") && document.querySelector(".code-area").value.includes("--accent"));
    await sleep(700);
    const area = page.locator(".code-area");
    const pos = await area.evaluate((ta) => {
      const i = ta.value.indexOf("#22d3a6");
      const lineH = 19.4;
      const line = ta.value.slice(0, i).split("\n").length - 1;
      const col = i - ta.value.lastIndexOf("\n", i - 1) - 1;
      const r = ta.getBoundingClientRect();
      return { i, x: r.left + 14 + col * 7.5, y: r.top + 12 + line * lineH + 9 };
    });
    await rec.move(pos.x + 26, pos.y, 750);
    await page.mouse.click(pos.x + 26, pos.y);
    await area.evaluate((ta, i) => { ta.focus(); ta.setSelectionRange(i, i + 7); }, pos.i);
    await sleep(500);
    await rec.type("#f59e0b", 110);
    await sleep(500);
    await page.keyboard.press("Control+s");
    await sleep(2400);
    const frame = page.frameLocator(".preview-frame");
    await rec.click(frame.locator("button[data-p='20']"), { ms: 900, scroll: false });
    await sleep(700);
    await rec.click(frame.locator("#plus"), { ms: 500, scroll: false });
    await sleep(1500);
  });

  if (want("ai")) await go("/ai", ".ai-modes");
  await clip("ai", async () => {
    await sleep(600);
    await rec.click(page.locator("button", { hasText: "Create key" }), { ms: 800 });
    await page.waitForSelector(".modal input");
    await sleep(300);
    await rec.type("Claude Code", 80);
    await sleep(300);
    await rec.click(page.locator(".modal .btn-primary"), { ms: 600 });
    await page.waitForSelector(".download-panel");
    await sleep(1000);
    await rec.move(900, 600, 600);
    await rec.scroll(560, 1600);
    await sleep(800);
    await rec.hover(page.locator(".codeblock .btn").nth(1), 700);
    await sleep(1200);
  });
  await desk.close();

  // ---------------------------------------------------------------- phone clips & stills
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await Recorder.prepare(phone, { touch: true });
  const pp = await phone.newPage();
  const prec = new Recorder(pp, { maxWidth: 780, maxHeight: 1688 });
  const loadApp = async (appId, hash = "/") => {
    const { app } = await api("GET", `/api/apps/${appId}`);
    const config = { ...app.config, appId: app.id, appName: app.name, leadsEndpoint: `${HOST}/api/public/leads/${app.id}` };
    await pp.unroute("**/runtime/config.js").catch(() => {});
    await pp.route("**/runtime/config.js", (r) => r.fulfill({ contentType: "application/javascript", body: `window.APP_CONFIG=${JSON.stringify(config)};` }));
    await pp.goto(`${HOST}/runtime/index.html?v=${appId}${Date.now()}#${hash}`);
    await pp.waitForSelector(".appbar");
    await sleep(700);
  };
  const pclip = async (name, fn) => {
    if (!want(name)) return;
    await prec.start(path.join(clipsDir, name));
    await fn();
    const r = await prec.stop();
    console.log(`clip ${name}: ${r.duration.toFixed(1)}s, ${r.frames} frames`);
  };

  if (want("stills")) {
    for (const [key, hash] of [["bella", "/"], ["glow", "/"], ["gym", "/"], ["clinic", "/"], ["skyline", "/"], ["brew", "/p/menu"], ["bella", "/p/menu"], ["gym", "/p/plans"]]) {
      await loadApp(seed.apps[key], hash);
      await pp.evaluate(() => document.getElementById("__pc") && (document.getElementById("__pc").style.display = "none"));
      await pp.screenshot({ path: path.join(stillsDir, `phone-${key}${hash === "/" ? "" : "-" + hash.split("/").pop()}.png`) });
    }
    const { url } = await api("GET", `/api/apps/${seed.apps.tip}/preview-url`);
    await pp.goto(`${HOST}${url}`);
    await sleep(900);
    await pp.evaluate(() => document.getElementById("__pc") && (document.getElementById("__pc").style.display = "none"));
    await pp.screenshot({ path: path.join(stillsDir, "phone-tip.png") });
    console.log("stills done");
  }

  if (want("phone-order")) await loadApp(seed.apps.bella, "/");
  await pclip("phone-order", async () => {
    await sleep(900);
    await prec.click(pp.locator(".btn-hero"), { ms: 700 });
    await sleep(1100);
    await prec.click(pp.locator("[data-add='0']").first(), { ms: 600 });
    await sleep(600);
    await prec.click(pp.locator("[data-add='2']").first(), { ms: 600 });
    await sleep(500);
    await prec.click(pp.locator("[data-add='2']").first(), { ms: 350 });
    await sleep(700);
    await prec.click(pp.locator(".cart-btn"), { ms: 700 });
    await sleep(1200);
    await prec.click(pp.locator("form[data-form=order] input[name=name]"), { ms: 600 });
    await prec.type("Priya", 90);
    await sleep(900);
  });

  if (want("phone-tip")) {
    const { url } = await api("GET", `/api/apps/${seed.apps.tip}/preview-url`);
    await pp.goto(`${HOST}${url}`);
    await sleep(900);
  }
  await pclip("phone-tip", async () => {
    await sleep(700);
    await prec.click(pp.locator("button[data-p='20']"), { ms: 700 });
    await sleep(700);
    await prec.click(pp.locator("#plus"), { ms: 600 });
    await sleep(500);
    await prec.click(pp.locator("#plus"), { ms: 300 });
    await sleep(700);
    await prec.click(pp.locator("button[data-p='18']"), { ms: 600 });
    await sleep(1200);
  });

  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
