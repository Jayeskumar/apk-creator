// Source of the demo "AI-written" app used in the video: a dark tip calculator.
module.exports = {
  "index.html": `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Tip Calculator</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <main>
    <header>
      <span class="badge">TIP</span>
      <h1>Tip Calculator</h1>
    </header>
    <section class="total">
      <small>Each person pays</small>
      <strong id="each">$0.00</strong>
      <div class="split"><span>Tip <b id="tip">$0.00</b></span><span>Total <b id="total">$0.00</b></span></div>
    </section>
    <label class="field"><span>Bill amount</span>
      <input id="bill" inputmode="decimal" value="86.40">
    </label>
    <div class="field"><span>Tip</span>
      <div class="chips" id="chips">
        <button data-p="10">10%</button><button data-p="15" class="on">15%</button><button data-p="18">18%</button><button data-p="20">20%</button><button data-p="25">25%</button>
      </div>
    </div>
    <div class="field"><span>People</span>
      <div class="stepper"><button id="minus">−</button><b id="people">2</b><button id="plus">+</button></div>
    </div>
    <button id="share" class="share">Share the split</button>
  </main>
  <script type="module" src="app.js"></script>
</body>
</html>
`,
  "style.css": `:root { --bg: #0b1020; --card: #141b31; --line: #222b45; --ink: #eef2ff; --muted: #8b95b5; --accent: #22d3a6; --accent2: #6d7cff; }
* { box-sizing: border-box; }
html, body { overflow-x: hidden; }
body { margin: 0; min-height: 100vh; background: radial-gradient(120% 60% at 50% -10%, #1d2a5a 0%, var(--bg) 60%); color: var(--ink); font-family: Inter, system-ui, -apple-system, Roboto, sans-serif; }
main { max-width: 440px; margin: 0 auto; padding: 22px 20px 32px; display: grid; gap: 18px; }
header { display: flex; align-items: center; gap: 12px; }
h1 { margin: 0; font-size: 22px; letter-spacing: -.01em; }
.badge { font-size: 11px; font-weight: 800; letter-spacing: .12em; padding: 6px 9px; border-radius: 9px; background: linear-gradient(135deg, var(--accent), var(--accent2)); color: #06101f; }
.total { border-radius: 22px; padding: 22px; background: linear-gradient(140deg, #22d3a6 0%, #3b82f6 55%, #6d7cff 100%); color: #06101f; box-shadow: 0 20px 40px rgba(34, 211, 166, .18); }
.total small { font-weight: 700; opacity: .75; }
.total strong { display: block; font-size: 52px; letter-spacing: -.03em; margin: 2px 0 10px; }
.split { display: flex; justify-content: space-between; font-size: 14px; font-weight: 600; }
.field { display: grid; gap: 8px; }
.field > span { color: var(--muted); font-size: 13px; font-weight: 600; }
input { width: 100%; min-width: 0; font: inherit; font-size: 24px; font-weight: 700; color: var(--ink); background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 14px 16px; outline: none; }
input:focus { border-color: var(--accent); }
.chips { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
.chips button, .stepper button { font: inherit; font-weight: 700; color: var(--ink); background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 12px 0; }
.chips button.on { background: var(--accent); color: #06101f; border-color: var(--accent); }
.stepper { display: grid; grid-template-columns: 56px 1fr 56px; align-items: center; background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 6px; text-align: center; font-size: 22px; }
.stepper button { font-size: 22px; padding: 8px 0; border: 0; background: #1d2645; }
.share { font: inherit; font-weight: 800; font-size: 16px; padding: 16px; border-radius: 16px; border: 0; color: #06101f; background: linear-gradient(135deg, var(--accent), #5eead4); }
`,
  "app.js": `import { money, split } from "./calc.js";

const $ = (id) => document.getElementById(id);
const state = { pct: 15, people: 2 };

function render() {
  const r = split(parseFloat($("bill").value) || 0, state.pct, state.people);
  $("tip").textContent = money(r.tip);
  $("total").textContent = money(r.total);
  $("each").textContent = money(r.each);
  $("people").textContent = state.people;
  document.querySelectorAll("#chips button").forEach((b) => b.classList.toggle("on", Number(b.dataset.p) === state.pct));
}

$("chips").addEventListener("click", (e) => { if (e.target.dataset.p) { state.pct = Number(e.target.dataset.p); render(); } });
$("minus").addEventListener("click", () => { state.people = Math.max(1, state.people - 1); render(); });
$("plus").addEventListener("click", () => { state.people += 1; render(); });
$("bill").addEventListener("input", render);
$("share").addEventListener("click", () => {
  const text = "We each owe " + $("each").textContent + " (tip included)";
  if (window.ApkBridge) window.ApkBridge.share("Tip split", text);
  else if (navigator.share) navigator.share({ text });
});
if (window.ApkBridge) window.ApkBridge.setStatusBarColor("#0b1020");
render();
`,
  "calc.js": `export const money = (n) => "$" + n.toFixed(2);

export function split(bill, pct, people) {
  const tip = (bill * pct) / 100;
  const total = bill + tip;
  return { tip, total, each: total / Math.max(1, people) };
}
`,
};
