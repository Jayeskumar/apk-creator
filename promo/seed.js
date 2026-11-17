// Seeds a running APK Creator server with demo data for the promo video.
//   node promo/seed.js http://127.0.0.1:8090
const BASE = process.argv[2] || "http://127.0.0.1:8090";
const tipcalc = require("./lib/tipcalc");

async function j(method, url, body, token) {
  const res = await fetch(BASE + url, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status} ${JSON.stringify(data)}`);
  return data;
}

async function waitBuild(id, token) {
  for (;;) {
    const { build } = await j("GET", `/api/builds/${id}`, undefined, token);
    if (!["queued", "building"].includes(build.status)) return build;
    await new Promise((r) => setTimeout(r, 1500));
  }
}

(async () => {
  const { token } = await j("POST", "/api/auth/register", { name: "Maya", email: "maya@example.com", password: "demo-password-1" });
  const make = async (templateId, name) => (await j("POST", "/api/apps", { templateId, name }, token)).app;

  // Created oldest-first so the dashboard lists the showcase apps on top.
  const skyline = await make("real-estate", "Skyline Realty");
  const clinic = await make("medical-clinic", "CarePoint Clinic");
  const gym = await make("fitness-gym", "Iron Pulse Gym");
  const brew = await make("cafe", "Morning Brew");
  const bella = await make("restaurant", "Bella Cucina");
  const glow = await make("salon-spa", "Glow Studio");

  // The "AI-written" app.
  const tip = (await j("POST", "/api/apps", { name: "Tip Calculator", mode: "code" }, token)).app;
  await j("PUT", `/api/apps/${tip.id}/files`, { replaceAll: true, files: Object.entries(tipcalc).map(([path, content]) => ({ path, content })) }, token);
  const tipCfg = (await j("GET", `/api/apps/${tip.id}`, undefined, token)).app.config;
  tipCfg.theme.primary = "#0B1020";
  tipCfg.icon = { symbol: "bolt", background: "#22D3A6", foreground: "#06101F" };
  await j("PUT", `/api/apps/${tip.id}`, { config: tipCfg }, token);

  // Builds, so the dashboard shows ready apps and the Gradle daemon is warm.
  for (const app of [skyline, clinic, gym, bella, tip]) {
    const { build } = await j("POST", `/api/apps/${app.id}/builds`, { format: "apk" }, token);
    const done = await waitBuild(build.id, token);
    console.log(`built ${app.name}: ${done.status}`);
  }

  // Leads submitted "from the app".
  const lead = (appId, kind, data) => fetch(`${BASE}/api/public/leads/${appId}`, { method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify({ kind, data }) });
  await lead(bella.id, "booking", { name: "Daniel Ortiz", phone: "+1 555 010 2234", service: "Dinner", date: "2026-11-21", time: "19:30", guests: "4", notes: "Window table if possible" });
  await lead(bella.id, "order", { name: "Priya Shah", phone: "+1 555 010 7781", address: "14 Elm Street, Apt 3", items: [{ name: "Margherita Pizza", qty: 2, price: 12 }, { name: "Tiramisu", qty: 1, price: 7 }], total: 31 });
  await lead(bella.id, "contact", { name: "Tom Becker", phone: "+1 555 010 4410", message: "Do you cater for private events of around 30 people?" });
  await lead(glow.id, "booking", { name: "Aisha Khan", phone: "+1 555 010 9921", service: "Balayage", date: "2026-11-19", time: "11:00" });

  console.log(JSON.stringify({ token, apps: { skyline: skyline.id, clinic: clinic.id, gym: gym.id, brew: brew.id, bella: bella.id, glow: glow.id, tip: tip.id } }));
})().catch((e) => { console.error(e); process.exit(1); });
