// Screen-recording helpers for the promo video.
//
// Frames come from the Chrome DevTools screencast (sharp JPEGs at native
// resolution, timestamped), not from a live video encoder, so recordings stay
// crisp. A drawn cursor with click ripples is overlaid, because headless
// browsers have no visible pointer.
const fs = require("node:fs");
const path = require("node:path");

const CURSOR_SCRIPT = `
(() => {
  if (window.__promoCursor) return;
  window.__promoCursor = true;
  const install = () => {
    if (document.getElementById("__pc")) return;
    const style = document.createElement("style");
    style.textContent = \`
      #__pc { position: fixed; left: 0; top: 0; width: 28px; height: 28px; z-index: 2147483647; pointer-events: none;
              transform: translate(-100px, -100px); will-change: transform; filter: drop-shadow(0 2px 3px rgba(0,0,0,.35)); }
      .__pr { position: fixed; z-index: 2147483646; pointer-events: none; width: 16px; height: 16px; margin: -8px 0 0 -8px;
              border-radius: 50%; background: rgba(30, 99, 233, .35); border: 2px solid rgba(30, 99, 233, .9);
              animation: __pr .55s ease-out forwards; }
      @keyframes __pr { to { transform: scale(3.6); opacity: 0; } }\`;
    document.documentElement.appendChild(style);
    const c = document.createElement("div");
    c.id = "__pc";
    c.innerHTML = window.__promoTouch
      ? '<div style="width:40px;height:40px;margin:-6px 0 0 -13px;border-radius:50%;background:rgba(255,255,255,.45);border:2px solid rgba(20,20,30,.35);box-shadow:0 2px 10px rgba(0,0,0,.25)"></div>'
      : '<svg viewBox="0 0 28 28" width="28" height="28"><path d="M5 3 L5 22 L10 17.5 L13.5 25 L17 23.5 L13.6 16.2 L20 16.2 Z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(c);
  };
  window.__promoMove = (x, y) => { install(); document.getElementById("__pc").style.transform = "translate(" + (x - 5) + "px," + (y - 3) + "px)"; };
  window.__promoRipple = (x, y) => { install(); const r = document.createElement("div"); r.className = "__pr"; r.style.left = x + "px"; r.style.top = y + "px"; document.documentElement.appendChild(r); setTimeout(() => r.remove(), 700); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install); else install();
})();`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

class Recorder {
  constructor(page, { maxWidth, maxHeight }) {
    this.page = page;
    this.maxWidth = maxWidth;
    this.maxHeight = maxHeight;
    this.pos = { x: maxWidth * 0.6, y: maxHeight * 0.6 };
  }

  static async prepare(context, { touch = false } = {}) {
    if (touch) await context.addInitScript("window.__promoTouch = true;");
    await context.addInitScript(CURSOR_SCRIPT);
  }

  mark(name) {
    this.marks[name] = Date.now() / 1000 - this.t0;
  }

  async start(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    this.dir = dir;
    this.frames = [];
    this.marks = {};
    this.cdp = await this.page.context().newCDPSession(this.page);
    this.cdp.on("Page.screencastFrame", async ({ data, sessionId }) => {
      const file = `f${String(this.frames.length).padStart(5, "0")}.jpg`;
      fs.writeFileSync(path.join(dir, file), Buffer.from(data, "base64"));
      this.frames.push({ file, t: Date.now() / 1000 });
      this.cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
    });
    await this.page.evaluate(CURSOR_SCRIPT);
    await this.cursor(this.pos.x, this.pos.y);
    await this.cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: this.maxWidth, maxHeight: this.maxHeight, everyNthFrame: 1 });
    // Keep frames flowing even when nothing changes (screencast only sends on paint).
    this.ticker = setInterval(() => this.page.evaluate(() => {
      const c = document.getElementById("__pc");
      if (c) c.style.opacity = c.style.opacity === "0.999" ? "1" : "0.999";
    }).catch(() => {}), 1000 / 30);
    await sleep(200);
    this.t0 = Date.now() / 1000;
  }

  async stop() {
    const t1 = Date.now() / 1000;
    clearInterval(this.ticker);
    await this.cdp.send("Page.stopScreencast").catch(() => {});
    await sleep(150);
    fs.writeFileSync(path.join(this.dir, "frames.json"), JSON.stringify({ start: this.t0, end: t1, marks: this.marks, frames: this.frames }));
    return { duration: t1 - this.t0, frames: this.frames.length };
  }

  async cursor(x, y) {
    await this.page.evaluate(([x, y]) => window.__promoMove && window.__promoMove(x, y), [x, y]).catch(() => {});
  }

  /** Smooth, eased pointer movement. */
  async move(x, y, ms = 650) {
    const from = { ...this.pos };
    const steps = Math.max(8, Math.round(ms / 16));
    for (let i = 1; i <= steps; i++) {
      const k = ease(i / steps);
      const px = from.x + (x - from.x) * k;
      const py = from.y + (y - from.y) * k;
      await this.page.mouse.move(px, py);
      await this.cursor(px, py);
      await sleep(ms / steps);
    }
    this.pos = { x, y };
  }

  async center(locator, { scroll = true } = {}) {
    if (scroll) await locator.scrollIntoViewIfNeeded().catch(() => {});
    const box = await locator.boundingBox();
    if (!box) throw new Error("Element not visible for recording");
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  async click(locator, { ms = 650, pause = 120, scroll = true } = {}) {
    const { x, y } = await this.center(locator, { scroll });
    await this.move(x, y, ms);
    await sleep(pause);
    await this.page.evaluate(([x, y]) => window.__promoRipple && window.__promoRipple(x, y), [x, y]).catch(() => {});
    await this.page.mouse.down();
    await sleep(70);
    await this.page.mouse.up();
  }

  async hover(locator, ms = 650) {
    const { x, y } = await this.center(locator);
    await this.move(x, y, ms);
  }

  async type(text, delay = 55) {
    for (const ch of text) {
      await this.page.keyboard.type(ch);
      await sleep(delay + Math.random() * delay * 0.6);
    }
  }

  /** Smooth wheel scrolling of whatever is under the pointer. */
  async scroll(dy, ms = 900) {
    const steps = Math.max(10, Math.round(ms / 16));
    let done = 0;
    for (let i = 1; i <= steps; i++) {
      const target = dy * ease(i / steps);
      await this.page.mouse.wheel(0, target - done);
      done = target;
      await sleep(ms / steps);
    }
  }
}

module.exports = { Recorder, sleep };
