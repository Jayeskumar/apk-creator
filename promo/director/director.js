/*
 * Timeline for the APK Creator promo (1920x1080, rendered frame by frame).
 * window.renderAt(seconds) lays out every element for that instant and
 * resolves once all images for the frame are decoded.
 */
(() => {
  "use strict";
  const ICONS = window.ICONS;
  const D = window.PROMO;
  const stage = document.getElementById("stage");
  const DURATION = 106;

  // ---------------------------------------------------------------- helpers
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);
  const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const easeBack = (x) => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
  const P = (t, a, b, fn = easeOut) => fn(clamp((t - a) / (b - a)));
  const svg = (name, extra = "") => `<svg viewBox="0 0 24 24" ${extra}><path d="${ICONS[name] || ICONS.star}"/></svg>`;
  const el = (html) => { const d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstElementChild; };
  const set = (node, { x, y, s = 1, r = 0, o = 1 } = {}) => {
    node.style.opacity = o;
    node.style.transform = `translate(${x || 0}px, ${y || 0}px) scale(${s}) rotate(${r}deg)`;
  };
  const pending = [];
  const showImage = (img, src) => {
    if (img.dataset.src === src) return;
    img.dataset.src = src;
    img.src = src;
    pending.push(img.decode().catch(() => {}));
  };

  // ---------------------------------------------------------------- media components
  function frameAt(clip, t) {
    const f = clip.frames;
    let lo = 0, hi = f.length - 1;
    if (t <= f[0][0]) return f[0][1];
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (f[m][0] <= t) lo = m; else hi = m - 1; }
    return f[lo][1];
  }

  function browser(clipName, width, url) {
    const clip = D.clips[clipName];
    const [cw, ch] = clip.size;
    const height = Math.round(width * ch / cw);
    const node = el(`<div class="browser" style="width:${width}px">
      <div class="bar"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i>
        <div class="url">${svg("shield")}<span>${url}</span></div></div>
      <div class="vp" style="width:${width}px;height:${height}px"><img style="width:${cw}px;height:${ch}px"></div></div>`);
    const img = node.querySelector("img");
    return {
      node, width, height: height + 44,
      /** Show clip time ct, zoomed by s around clip pixel (cx, cy). */
      show(ct, s = 1, cx = cw / 2, cy = ch / 2) {
        showImage(img, clip.dir + frameAt(clip, ct));
        const k = (width / cw) * s;
        const tx = clamp(width / 2 - cx * k, width - cw * k, 0);
        const ty = clamp(height / 2 - cy * k, height - ch * k, 0);
        img.style.transform = `translate(${tx}px, ${ty}px) scale(${k})`;
      },
    };
  }

  function phone(width, statusColor) {
    const screenW = width - 24;
    const statusH = Math.round(screenW * 0.085);
    const node = el(`<div class="phone" style="width:${width}px">
      <div class="screen"><div class="status" style="height:${statusH}px"><span>9:41</span><b class="cam"></b><span>▾ ▴ ▮</span></div><img></div></div>`);
    const status = node.querySelector(".status");
    const img = node.querySelector("img");
    const paint = (hex) => {
      status.style.background = hex;
      const n = parseInt(hex.slice(1), 16);
      const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
      status.style.color = lum > 0.62 ? "#111" : "#fff";
    };
    paint(statusColor || "#1e63e9");
    return {
      node, width, height: Math.round(screenW * 1688 / 780) + statusH + 24,
      still(name) { const s = D.stills[name]; paint(s.top); showImage(img, s.src); },
      clip(name, ct) { const c = D.clips[name]; paint(c.top); showImage(img, c.dir + frameAt(c, ct)); },
    };
  }

  function caption({ num, kicker, title, sub, chips = [], width = 500 }) {
    const node = el(`<div class="abs" style="width:${width}px">
      <div class="kicker"><span class="num">${num}</span>${kicker}</div>
      <div class="title" style="margin-top:22px">${title}</div>
      <div class="sub" style="margin-top:22px">${sub}</div>
      <div class="chips" style="margin-top:34px">${chips.map(([ic, txt]) => `<div class="chip">${svg(ic)}${txt}</div>`).join("")}</div></div>`);
    const parts = [node.querySelector(".kicker"), node.querySelector(".title"), node.querySelector(".sub"), ...node.querySelectorAll(".chip")];
    return {
      node,
      update(lt, start = 0.15) {
        parts.forEach((p, i) => {
          const k = P(lt, start + i * (i < 3 ? 0.14 : 0.12) + (i >= 3 ? 0.35 : 0), start + 0.6 + i * (i < 3 ? 0.14 : 0.12) + (i >= 3 ? 0.35 : 0));
          set(p, { x: i >= 3 ? lerp(-30, 0, k) : 0, y: i < 3 ? lerp(34, 0, k) : 0, o: k });
        });
      },
    };
  }

  function watermark() {
    return el(`<div class="watermark"><div class="mark" style="width:34px;height:34px;border-radius:10px">${svg("store")}</div>APK Creator</div>`);
  }

  // ---------------------------------------------------------------- background
  const bg = el(`<div class="bg"></div>`);
  const blobs = [
    ["#1e63e9", 820, 0.0], ["#00bfa5", 700, 2.1], ["#7c3aed", 620, 4.2],
  ].map(([c, size, ph]) => {
    const b = el(`<div class="blob" style="width:${size}px;height:${size}px;background:${c}"></div>`);
    bg.appendChild(b);
    return { b, size, ph };
  });
  bg.appendChild(el(`<div class="grid"></div>`));
  stage.appendChild(bg);
  const updateBackground = (t) => {
    blobs.forEach(({ b, size, ph }, i) => {
      const x = 960 + Math.cos(t * 0.11 + ph) * (520 + i * 80) - size / 2;
      const y = 540 + Math.sin(t * 0.09 + ph * 1.3) * (300 + i * 40) - size / 2;
      b.style.transform = `translate(${x}px, ${y}px)`;
    });
  };

  // ---------------------------------------------------------------- scenes
  const scenes = [];
  const scene = (start, end, build) => {
    const node = el(`<div class="scene"></div>`);
    stage.appendChild(node);
    const update = build(node, end - start);
    scenes.push({ start, end, node, update });
  };

  // 1 · Intro --------------------------------------------------------------
  scene(0, 6, (root) => {
    const mark = el(`<div class="mark abs" style="width:170px;height:170px;left:875px;top:250px">${svg("store")}</div>`);
    const rings = [0, 1].map(() => el(`<div class="ring" style="left:960px;top:335px"></div>`));
    const name = el(`<div class="abs" style="left:0;width:1920px;top:458px;text-align:center;font-size:118px;font-weight:800;letter-spacing:-.04em">APK Creator</div>`);
    const tag = el(`<div class="abs sub" style="left:0;width:1920px;top:610px;text-align:center;font-size:36px;color:rgba(226,232,255,.85)">Android apps for your business — <span class="grad" style="font-weight:700">built in minutes.</span></div>`);
    const pills = el(`<div class="abs" style="left:0;width:1920px;top:700px;display:flex;justify-content:center;gap:16px"></div>`);
    const items = [["sparkle", "No code needed"], ["code", "AI-assisted (MCP)"], ["shield", "On-premise & cloud"]].map(([ic, t]) => {
      const c = el(`<div class="chip">${svg(ic)}${t}</div>`);
      pills.appendChild(c);
      return c;
    });
    rings.forEach((r) => root.appendChild(r));
    [mark, name, tag, pills].forEach((n) => root.appendChild(n));
    return (lt) => {
      const k = P(lt, 0.35, 1.25, easeBack);
      set(mark, { s: lerp(0.3, 1, k), o: P(lt, 0.35, 0.8), r: lerp(-18, 0, k) });
      rings.forEach((r, i) => {
        const p = clamp((lt - 1.0 - i * 0.35) / 1.4);
        const size = lerp(170, 520, easeOut(p));
        r.style.width = r.style.height = size + "px";
        r.style.marginLeft = r.style.marginTop = -size / 2 + "px";
        r.style.opacity = p > 0 && p < 1 ? (1 - p) * 0.8 : 0;
      });
      const nk = P(lt, 1.0, 1.8);
      set(name, { y: lerp(50, 0, nk), o: nk });
      name.style.letterSpacing = lerp(0.06, -0.04, nk) + "em";
      const tk = P(lt, 1.75, 2.45);
      set(tag, { y: lerp(30, 0, tk), o: tk });
      items.forEach((c, i) => { const ck = P(lt, 2.45 + i * 0.16, 3.0 + i * 0.16, easeBack); set(c, { y: lerp(30, 0, ck), s: lerp(0.85, 1, ck), o: clamp(ck) }); });
      root.style.transform = `scale(${lerp(1, 1.035, lt / 6)})`;
    };
  });

  // 2 · Hook: phones fan ----------------------------------------------------
  scene(6, 12, (root) => {
    const l1 = el(`<div class="abs title" style="left:130px;top:300px;font-size:84px">Your business</div>`);
    const l2 = el(`<div class="abs title" style="left:130px;top:392px;font-size:84px">deserves an app.</div>`);
    const l3 = el(`<div class="abs title grad" style="left:130px;top:540px;font-size:64px">Now it takes minutes,</div>`);
    const l4 = el(`<div class="abs title grad" style="left:130px;top:612px;font-size:64px">not months.</div>`);
    const set_ = [["phone-gym", -14, -330, 60], ["phone-glow", -7, -165, 18], ["phone-bella", 0, 0, 0], ["phone-clinic", 7, 165, 18], ["phone-skyline", 14, 330, 60]];
    const phones = set_.map(([still, rot, dx, dy], i) => {
      const ph = phone(i === 2 ? 330 : 300);
      ph.still(still);
      ph.node.style.zIndex = 10 - Math.abs(i - 2);
      root.appendChild(ph.node);
      return { ph, rot, dx, dy, i };
    });
    [l1, l2, l3, l4].forEach((n) => root.appendChild(n));
    return (lt) => {
      [l1, l2].forEach((n, i) => { const k = P(lt, 0.2 + i * 0.18, 0.9 + i * 0.18); set(n, { y: lerp(40, 0, k), o: k }); });
      [l3, l4].forEach((n, i) => { const k = P(lt, 1.9 + i * 0.2, 2.6 + i * 0.2); set(n, { y: lerp(40, 0, k), o: k }); });
      phones.forEach(({ ph, rot, dx, dy, i }) => {
        const order = [2, 1, 3, 0, 4].indexOf(i);
        const k = P(lt, 0.3 + order * 0.13, 1.25 + order * 0.13, easeBack);
        const bob = Math.sin(lt * 1.4 + i) * 6;
        const cx = 1430 + dx * lerp(0.2, 1, k);
        set(ph.node, { x: cx - ph.width / 2, y: 140 + dy + lerp(700, 0, k) + bob, r: rot * k, o: clamp(k * 1.4) });
      });
    };
  });

  // Feature scene with a browser recording ------------------------------------
  function browserScene(start, end, { clip, url, cap, offset, speed, zoom = () => [1], inX = 640, width = 1180 }) {
    scene(start, end, (root) => {
      const c = caption(cap);
      c.node.style.left = "110px";
      c.node.style.top = "250px";
      const b = browser(clip, width, url);
      root.appendChild(c.node);
      root.appendChild(b.node);
      root.appendChild(watermark());
      const top = Math.round((1080 - b.height) / 2);
      return (lt) => {
        c.update(lt);
        const k = P(lt, 0.0, 0.9);
        set(b.node, { x: inX + lerp(140, 0, k), y: top + 8 * Math.sin(lt * 0.6), s: lerp(0.94, 1, k), o: k });
        const [s, cx, cy] = zoom(lt);
        b.show(offset + Math.max(0, lt) * speed, s, cx, cy);
      };
    });
  }
  const zoomTo = (keys) => (lt) => {
    // keys: [time, scale, cx, cy]; eased interpolation between them
    let a = keys[0], b = keys[keys.length - 1];
    for (let i = 0; i < keys.length - 1; i++) if (lt >= keys[i][0] && lt <= keys[i + 1][0]) { a = keys[i]; b = keys[i + 1]; break; }
    if (lt <= keys[0][0]) return keys[0].slice(1);
    if (lt >= keys[keys.length - 1][0]) return keys[keys.length - 1].slice(1);
    const k = easeInOut((lt - a[0]) / (b[0] - a[0]));
    return [lerp(a[1], b[1], k), lerp(a[2], b[2], k), lerp(a[3], b[3], k)];
  };

  // 3 · Templates
  browserScene(12, 24, {
    clip: "templates", url: "apps.example.com/#/templates", offset: 0.2, speed: 1.5,
    cap: { num: "01", kicker: "Templates", title: "Start from 30+ business templates", sub: "Restaurants, salons, clinics, gyms, real estate, retail and more — every page ready to customise.",
      chips: [["store", "16 industries"], ["list", "15 page types"], ["web", "Website-to-app"]] },
    zoom: zoomTo([[0, 1, 720, 450], [6, 1, 720, 450], [7.5, 1.12, 720, 420], [12, 1.12, 720, 420]]),
  });

  // 4 · Design
  browserScene(24, 34, {
    clip: "design", url: "apps.example.com/#/apps/glow-studio/design", offset: 0.3, speed: 1.6,
    cap: { num: "02", kicker: "Design", title: "Make it yours — and see it live", sub: "Colours, fonts, dark mode and app icon. The phone preview updates as you click.",
      chips: [["star", "12 colour presets"], ["image", "Adaptive app icon"], ["phone", "Live phone preview"]] },
    zoom: zoomTo([[0, 1, 720, 450], [1.4, 1, 720, 450], [3.0, 1.18, 820, 430], [10, 1.18, 820, 430]]),
  });

  // 5 · Pages
  browserScene(34, 46, {
    clip: "pages", url: "apps.example.com/#/apps/glow-studio/pages", offset: 0.3, speed: 1.65,
    cap: { num: "03", kicker: "Content", title: "Edit pages in simple forms", sub: "Menus, services, prices, bookings, galleries, FAQs and offers. Type — and watch the app change.",
      chips: [["list", "Catalogs & menus"], ["event", "Bookings"], ["help", "FAQ, team, reviews"]] },
    zoom: zoomTo([[0, 1, 720, 450], [1.0, 1, 720, 450], [2.6, 1.18, 830, 430], [12, 1.18, 830, 450]]),
  });

  // 6 · Orders & leads ------------------------------------------------------
  scene(46, 56, (root) => {
    const c = caption({ num: "04", kicker: "Sell & book", title: "Orders, bookings & leads built in", sub: "Customers order and book in your app. You get it on WhatsApp — or in your inbox.",
      chips: [["cart", "Cart & checkout"], ["whatsapp", "WhatsApp ordering"], ["email", "Leads inbox + CSV"]], width: 520 });
    c.node.style.left = "110px";
    c.node.style.top = "250px";
    const ph = phone(370);
    const b = browser("leads", 760, "apps.example.com/#/apps/bella-cucina/leads");
    const toast = el(`<div class="toast"><div class="ti" style="background:#16a34a">${svg("cart")}</div><div><b>New order · $31.00</b><small>Priya S. · 2× Margherita, Tiramisu</small></div></div>`);
    [c.node, b.node, ph.node, toast].forEach((n) => root.appendChild(n));
    root.appendChild(watermark());
    return (lt) => {
      c.update(lt);
      const k = P(lt, 0.15, 1.1, easeBack);
      set(ph.node, { x: 700, y: 120 + lerp(500, 0, k) + Math.sin(lt * 1.2) * 5, o: clamp(k * 1.5) });
      ph.clip("phone-order", 0.3 + Math.max(0, lt) * 1.45);
      const bk = P(lt, 0.6, 1.5);
      set(b.node, { x: 1110 + lerp(120, 0, bk), y: 250, o: bk });
      b.show(0.4 + Math.max(0, lt) * 0.8, 1.35, 560, 380);
      const tk = P(lt, 6.2, 6.9, easeBack);
      set(toast, { x: 1150, y: lerp(140, 160, tk), s: lerp(0.8, 1, tk), o: clamp(tk) * (1 - P(lt, 9.2, 9.7)) });
    };
  });

  // 7 · Build -----------------------------------------------------------------
  scene(56, 66, (root) => {
    const c = caption({ num: "05", kicker: "Build", title: "One click. A signed APK.", sub: "Compiled and release-signed with your app's own key. APK for phones, AAB for Google Play.",
      chips: [["bolt", "Builds in seconds"], ["shield", "Signed & versioned"], ["check", "Works fully offline"]] });
    c.node.style.left = "110px";
    c.node.style.top = "250px";
    const b = browser("build", 1180, "apps.example.com/#/apps/morning-brew/build");
    const badge = el(`<div class="toast" style="padding-right:26px"><div class="ti" style="background:#16a34a">${svg("check")}</div><div><b>Build succeeded</b><small>morning-brew-1.0.0.apk · signed</small></div></div>`);
    [c.node, b.node, badge].forEach((n) => root.appendChild(n));
    root.appendChild(watermark());
    const clip = D.clips.build;
    const finish = clip.marks.finished || 8.6;
    const DONE = 6.6;                 // local time of "build finished" (music chime at 62.6 s)
    const offset = finish - DONE;
    const top = Math.round((1080 - b.height) / 2);
    const zoom = zoomTo([[0, 1, 720, 450], [1.0, 1, 720, 450], [2.2, 1.22, 640, 520], [DONE + 0.1, 1.22, 640, 520], [DONE + 1.0, 1.5, 625, 585], [10, 1.5, 625, 585]]);
    return (lt) => {
      c.update(lt);
      const k = P(lt, 0, 0.9);
      set(b.node, { x: 640 + lerp(140, 0, k), y: top, s: lerp(0.94, 1, k), o: k });
      const [s, cx, cy] = zoom(lt);
      b.show(offset + Math.max(0, lt), s, cx, cy);
      const bk = P(lt, DONE + 0.05, DONE + 0.6, easeBack);
      set(badge, { x: 1430, y: lerp(40, 58, bk), s: lerp(0.7, 1, bk), o: clamp(bk) });
    };
  });

  // 8 · AI / MCP --------------------------------------------------------------
  scene(66, 82, (root) => {
    const kick = el(`<div class="abs kicker" style="left:110px;top:96px"><span class="num">06</span>AI-assisted</div>`);
    const title = el(`<div class="abs title" style="left:110px;top:140px;font-size:66px">Describe it. <span class="grad">AI builds it.</span></div>`);
    const chips = el(`<div class="abs" style="left:110px;top:238px;display:flex;gap:14px"></div>`);
    const chipEls = [["code", "Built-in MCP server · 18 tools"], ["sparkle", "Works with Claude & any MCP client"], ["wrench", "Reads build errors, fixes, rebuilds"]].map(([ic, t]) => {
      const n = el(`<div class="chip" style="font-size:18px">${svg(ic)}${t}</div>`);
      chips.appendChild(n);
      return n;
    });
    const term = el(`<div class="terminal" style="left:110px;top:322px;width:1060px;height:660px">
      <div class="tbar"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i><span>terminal — AI coding assistant</span></div><pre></pre></div>`);
    const pre = term.querySelector("pre");
    const ph = phone(370);
    const ghost = el(`<div class="abs" style="width:346px;height:740px;border-radius:44px;border:2px dashed rgba(255,255,255,.25);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;color:rgba(255,255,255,.6);font-size:22px;font-weight:600"><div class="spin" style="width:54px;height:54px;border-radius:50%;border:5px solid rgba(255,255,255,.15);border-top-color:#5eead4"></div><span>Building…</span></div>`);
    const spin = ghost.querySelector(".spin");
    const label = el(`<div class="abs" style="font-size:20px;font-weight:600;color:rgba(255,255,255,.75);text-align:center;width:560px;white-space:nowrap">Written by AI · compiled into a signed APK</div>`);
    [kick, title, chips, term, ghost, ph.node, label].forEach((n) => root.appendChild(n));

    const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const typed = (text, a, b, lt) => text.slice(0, Math.round(text.length * clamp((lt - a) / (b - a))));
    const cmd = "claude mcp add --transport http apk-creator \\\n    http://apps.example.com/mcp";
    const ask = "Build a tip calculator with a dark theme and send me the APK";
    const tools = [
      [6.3, "get_guide  ", "code-app"],
      [6.8, "create_app ", "\"Tip Calculator\" · mode: code"],
      [7.3, "write_files", "index.html style.css app.js calc.js"],
      [7.9, "build_app  ", "apk"],
    ];
    const DONE = 9.5;
    return (lt) => {
      set(kick, { o: P(lt, 0.1, 0.6), y: lerp(20, 0, P(lt, 0.1, 0.6)) });
      set(title, { o: P(lt, 0.2, 0.8), y: lerp(30, 0, P(lt, 0.2, 0.8)) });
      chipEls.forEach((n, i) => { const k = P(lt, 0.6 + i * 0.15, 1.1 + i * 0.15, easeBack); set(n, { o: clamp(k), y: lerp(20, 0, k) }); });
      const tk = P(lt, 0.4, 1.1);
      set(term, { o: tk, y: lerp(60, 0, tk) });

      const caret = '<span class="caret"></span>';
      let out = "";
      const c1 = typed(cmd, 1.0, 2.9, lt);
      out += `<span class="t-dim">$</span> <span class="t-acc">${esc(c1)}</span>${lt < 3.2 ? caret : ""}\n`;
      if (lt >= 3.2) out += `  <span class="t-ok">✓ apk-creator connected · 18 tools</span>\n\n`;
      if (lt >= 3.6) {
        const a = typed(ask, 3.9, 5.7, lt);
        out += `<span class="t-acc">❯</span> <span class="t-user">${esc(a)}</span>${lt < 6.1 ? caret : ""}\n\n`;
      }
      tools.forEach(([at, name, arg], i) => {
        if (lt < at) return;
        const isBuild = i === tools.length - 1;
        let status = `<span class="t-ok">✓</span>`;
        let tail = "";
        if (isBuild) {
          if (lt < DONE) {
            const dots = ".".repeat(1 + (Math.floor(lt * 4) % 3));
            status = `<span class="t-warn">●</span>`;
            tail = `  <span class="t-warn">building${dots}</span>`;
          } else tail = `  <span class="t-ok">success · 21 KB · signed</span>`;
        }
        out += `  ${status} <span class="t-tool">${name}</span>  <span class="t-dim">${esc(arg)}</span>${tail}\n`;
      });
      if (lt >= DONE + 0.5) {
        const r = "Your app is ready. Install it from:";
        out += `\n<span class="t-user">${esc(typed(r, DONE + 0.5, DONE + 1.2, lt))}</span>\n`;
        if (lt >= DONE + 1.2) out += `<span class="t-acc">http://apps.example.com/api/builds/…/download</span>\n`;
      }
      pre.innerHTML = out;

      // right column: ghost "building" phone -> real app
      const gk = P(lt, 7.8, 8.3);
      set(ghost, { x: 1385, y: 300, o: gk * (1 - P(lt, DONE, DONE + 0.3)) });
      spin.style.transform = `rotate(${lt * 400}deg)`;
      const pk = P(lt, DONE, DONE + 0.8, easeBack);
      set(ph.node, { x: 1373, y: lerp(360, 288, pk) + Math.sin(lt * 1.3) * 4, s: lerp(0.85, 1, pk), o: clamp(pk * 1.3) });
      ph.clip("phone-tip", lt < DONE ? 0 : 0.2 + (lt - DONE) * 1.45);
      set(label, { x: 1278, y: 1028, o: P(lt, DONE + 0.6, DONE + 1.2) });
    };
  });

  // 9 · Bring your own code
  browserScene(82, 90, {
    clip: "code", url: "apps.example.com/#/apps/tip-calculator/files", offset: 0.7, speed: 1.72,
    cap: { num: "07", kicker: "Developers", title: "Bring your own code", sub: "HTML/JS or a full Android Studio project — edit in the browser, upload a ZIP, get a signed build.",
      chips: [["code", "Web code → APK"], ["android", "Gradle projects → APK/AAB"], ["link", "REST API & API keys"]] },
    zoom: zoomTo([[0, 1, 720, 450], [0.8, 1, 720, 450], [2.2, 1.2, 860, 520], [8, 1.2, 860, 520]]),
  });

  // 10 · Deploy anywhere -------------------------------------------------------
  scene(90, 98, (root) => {
    const head = el(`<div class="abs" style="left:0;width:1920px;top:112px;text-align:center">
      <div class="kicker" style="justify-content:center"><span class="num">08</span>Deploy anywhere</div>
      <div class="title" style="margin-top:20px;font-size:70px">Your servers <span class="grad">or the cloud.</span></div></div>`);
    const mk = (x, color, ic, name, code, items) => el(`<div class="card" style="left:${x}px;top:340px;width:760px;height:600px;box-sizing:border-box">
      <div class="ic" style="background:${color}">${svg(ic)}</div><h3>${name}</h3>
      <div class="code">$ ${code}</div>
      ${items.map((t) => `<div class="check"><b>${svg("check")}</b>${t}</div>`).join("")}</div>`);
    const a = mk(160, "linear-gradient(135deg,#16a34a,#0d9488)", "business", "On-premise", "docker compose up -d",
      ["One container: web, API & build worker", "SQLite and local storage — no cloud needed", "Builds work fully offline (air-gapped)", "Your data never leaves your network"]);
    const b = mk(1000, "linear-gradient(135deg,#2563eb,#7c3aed)", "globe", "Cloud", "kubectl apply -k deploy/kubernetes",
      ["PostgreSQL + S3-compatible storage", "Autoscaling build workers", "Multi-user with quotas & admin", "Same product, same features"]);
    [head, a, b].forEach((n) => root.appendChild(n));
    const checks = [...a.querySelectorAll(".check"), ...b.querySelectorAll(".check")];
    return (lt) => {
      set(head, { o: P(lt, 0.1, 0.7), y: lerp(30, 0, P(lt, 0.1, 0.7)) });
      [a, b].forEach((n, i) => { const k = P(lt, 0.4 + i * 0.25, 1.2 + i * 0.25, easeBack); set(n, { o: clamp(k), y: lerp(80, 0, k), s: lerp(0.94, 1, k) }); });
      checks.forEach((n, i) => {
        const j = i < 4 ? i * 2 : (i - 4) * 2 + 1;
        const k = P(lt, 1.4 + j * 0.22, 1.8 + j * 0.22, easeBack);
        set(n, { o: clamp(k), x: lerp(-24, 0, k) });
      });
    };
  });

  // 11 · Outro ------------------------------------------------------------------
  scene(98, DURATION, (root) => {
    const row = el(`<div class="abs" style="left:0;top:0;width:1920px;height:1080px"></div>`);
    const stillsRow = ["phone-brew-menu", "phone-gym-plans", "phone-bella-menu", "phone-tip", "phone-glow", "phone-clinic", "phone-skyline"];
    const phones = stillsRow.map((s, i) => { const p = phone(250); p.still(s); row.appendChild(p.node); return p; });
    const shade = el(`<div class="abs" style="inset:0;background:linear-gradient(180deg, rgba(8,12,28,.95) 0%, rgba(8,12,28,.86) 52%, rgba(8,12,28,.35) 100%)"></div>`);
    const mark = el(`<div class="mark abs" style="width:120px;height:120px;left:900px;top:170px">${svg("store")}</div>`);
    const name = el(`<div class="abs" style="left:0;width:1920px;top:310px;text-align:center;font-size:96px;font-weight:800;letter-spacing:-.04em">APK Creator</div>`);
    const tag = el(`<div class="abs title" style="left:0;width:1920px;top:440px;text-align:center;font-size:50px;font-weight:700">Build your business app <span class="grad">today.</span></div>`);
    const facts = el(`<div class="abs" style="left:0;width:1920px;top:540px;display:flex;justify-content:center;gap:16px">
      <div class="chip">${svg("image")}30+ templates</div><div class="chip">${svg("bolt")}Signed APK & AAB</div><div class="chip">${svg("sparkle")}AI-ready via MCP</div><div class="chip">${svg("shield")}On-premise & cloud</div></div>`);
    const cta = el(`<div class="abs" style="left:0;width:1920px;top:640px;display:flex;justify-content:center"><div class="code" style="font-size:30px;padding:18px 30px;margin:0;box-shadow:0 0 0 1px rgba(94,234,212,.35), 0 20px 60px rgba(0,191,165,.25)">$ docker compose up -d</div></div>`);
    const fade = el(`<div class="fade"></div>`);
    [row, shade, mark, name, tag, facts, cta, fade].forEach((n) => root.appendChild(n));
    const factEls = [...facts.children];
    return (lt) => {
      phones.forEach((p, i) => {
        const k = P(lt, 0.1 + i * 0.07, 1.1 + i * 0.07);
        set(p.node, { x: 40 + i * 270 - lt * 6, y: lerp(1080, 700, k) + Math.sin(lt + i) * 6, r: (i - 3) * 2, o: 0.55 * k });
      });
      const mk2 = P(lt, 0.2, 1.0, easeBack);
      set(mark, { s: lerp(0.4, 1, mk2), o: clamp(mk2) });
      const nk = P(lt, 0.5, 1.2);
      set(name, { y: lerp(40, 0, nk), o: nk });
      const tk = P(lt, 1.0, 1.7);
      set(tag, { y: lerp(30, 0, tk), o: tk });
      factEls.forEach((n, i) => { const k = P(lt, 1.6 + i * 0.13, 2.1 + i * 0.13, easeBack); set(n, { o: clamp(k), y: lerp(24, 0, k) }); });
      const ck = P(lt, 2.4, 3.0, easeBack);
      set(cta, { o: clamp(ck), s: lerp(0.9, 1, ck) });
      fade.style.opacity = P(lt, 6.4, 8.0, (x) => x);
    };
  });

  // ---------------------------------------------------------------- frame renderer
  const XF = 0.5; // cross-fade length between scenes
  window.DURATION = DURATION;
  window.renderAt = async (T) => {
    updateBackground(T);
    for (const sc of scenes) {
      const first = sc.start === 0;
      const last = sc.end === DURATION;
      const fadeIn = first ? 1 : clamp((T - (sc.start - XF / 2)) / XF);
      const fadeOut = last ? 1 : clamp((sc.end + XF / 2 - T) / XF);
      const vis = Math.min(fadeIn, fadeOut);
      if (vis <= 0) { sc.node.style.display = "none"; continue; }
      sc.node.style.display = "block";
      sc.update(T - sc.start);
      sc.node.style.opacity = vis;
      if (!first || T > sc.end) {
        // slight push-in when leaving, settle when entering
        const out = 1 - fadeOut;
        const inn = 1 - fadeIn;
        if (sc.start !== 0) sc.node.style.transform = `scale(${1 + out * 0.035 - inn * 0.02})`;
      }
    }
    const waits = pending.splice(0);
    await Promise.all(waits);
    await new Promise((r) => requestAnimationFrame(() => r()));
  };
})();
