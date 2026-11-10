// App editor: tabs on the left, form in the middle, live phone preview on the right.
import { get, put, post, del, upload, downloadAuthed, session } from "./api.js";
import { fill, el, icon, toast, modal, confirmDialog, debounce, statusPill, timeAgo, formatBytes, appIcon, copyText } from "./ui.js";
import { renderFields, colorInput, iconButton } from "./forms.js";
import { PAGE_TYPES, BUSINESS_FIELDS, THEME_PRESETS } from "./schema.js";

const TABS = [
  ["design", "Design", "star"],
  ["business", "Business", "business"],
  ["pages", "Pages", "list"],
  ["settings", "Settings", "wrench"],
  ["build", "Build & download", "bolt"],
  ["leads", "Leads", "email"],
];

export async function renderEditor(main, appId, tab) {
  const { app } = await get(`/api/apps/${appId}`);
  const cfg = app.config;
  const state = { app, cfg, tab: TABS.some((t) => t[0] === tab) ? tab : "design", pageId: null, timers: [], disposed: false };

  // ---------------------------------------------------------------- saving
  const saveStatus = el("span", { class: "save-status" }, "All changes saved");
  const doSave = async () => {
    saveStatus.textContent = "Saving…";
    saveStatus.className = "save-status saving";
    try {
      const res = await put(`/api/apps/${app.id}`, { config: cfg });
      app.updatedAt = res.app.updatedAt;
      saveStatus.textContent = "All changes saved";
      saveStatus.className = "save-status";
    } catch (e) {
      saveStatus.textContent = "Not saved";
      saveStatus.className = "save-status error";
      toast(e.message, "error");
    }
  };
  const save = debounce(doSave, 700);

  // ---------------------------------------------------------------- preview
  const iframe = el("iframe", { class: "preview-frame", title: "App preview", sandbox: "allow-scripts allow-forms", src: "/runtime/index.html" });
  const previewConfig = () => ({
    ...cfg,
    appId: app.id,
    appName: app.name,
    leadsEndpoint: `${location.origin}/api/public/leads/${app.id}`,
  });
  const statusBar = el("div", { class: "phone-status" },
    el("span", {}, "9:41"), el("span", { class: "phone-cam" }), el("span", { class: "phone-sys" }, "▾ ▴ ▮"));
  const paintStatusBar = () => {
    const t = cfg.theme || {};
    const light = t.headerStyle === "light";
    const bg = cfg.mode === "website" ? "#111827" : light ? (t.dark ? "#1b1d22" : "#ffffff") : t.primary || "#1E63E9";
    const n = parseInt(bg.slice(1), 16);
    const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    statusBar.style.background = bg;
    statusBar.style.color = lum > 0.62 ? "#111" : "#fff";
  };
  paintStatusBar();
  const pushPreview = debounce(() => {
    paintStatusBar();
    if (iframe.contentWindow) iframe.contentWindow.postMessage({ type: "apkc:config", config: previewConfig(), pageId: state.pageId }, "*");
  }, 120);
  const onMessage = (e) => {
    if (e.source === iframe.contentWindow && e.data && e.data.type === "apkc:ready") pushPreview.flush(true);
  };
  window.addEventListener("message", onMessage);

  const changed = () => {
    save();
    pushPreview();
  };

  // ---------------------------------------------------------------- layout
  const panel = el("section", { class: "editor-panel" });
  const tabNav = el("nav", { class: "editor-tabs" });
  const head = el("div", { class: "editor-head" },
    el("a", { href: "#/apps", class: "icon-btn", title: "Back to apps" }, icon("back")),
    el("div", { class: "editor-title" }, appIcon(app, 36), el("div", {}, el("h1", {}, app.name), el("code", {}, app.packageName))),
    saveStatus,
    el("button", { class: "btn btn-primary", onclick: () => go("build") }, icon("bolt"), el("span", { class: "hide-sm" }, "Build APK")));

  const drawTabs = () => fill(tabNav, ...TABS.map(([k, label, ic]) =>
    el("a", { href: `#/apps/${app.id}/${k}`, class: k === state.tab ? "on" : "", onclick: (e) => { e.preventDefault(); go(k); } },
      icon(ic), el("span", {}, label))));

  const go = (k) => {
    state.tab = k;
    history.replaceState(null, "", `#/apps/${app.id}/${k}`);
    drawTabs();
    drawPanel();
  };

  const drawPanel = () => {
    state.timers.forEach(clearInterval);
    state.timers = [];
    fill(panel, );
    const views = { design: designTab, business: businessTab, pages: pagesTab, settings: settingsTab, build: buildTab, leads: leadsTab };
    views[state.tab]();
    panel.scrollTop = 0;
  };

  main.append(el("div", { class: "editor" },
    head,
    el("div", { class: "editor-body" },
      tabNav,
      panel,
      el("aside", { class: "editor-preview" },
        el("div", { class: "phone" }, el("div", { class: "phone-screen" }, statusBar, iframe)),
        el("p", { class: "muted small center" }, "Live preview · buttons like Call open the real apps on a phone")))));

  // ---------------------------------------------------------------- design
  function designTab() {
    const t = (cfg.theme = cfg.theme || {});
    const ic = (cfg.icon = cfg.icon || { symbol: "star", background: t.primary, foreground: "#FFFFFF" });
    const presetGrid = el("div", { class: "preset-grid" }, THEME_PRESETS.map((p) =>
      el("button", { type: "button", class: "preset", title: p.name, onclick: () => {
        Object.assign(t, { primary: p.primary, secondary: p.secondary, dark: !!p.dark });
        delete t.background; delete t.surface; delete t.text;
        if (!app.iconUrl) ic.background = p.primary;
        changed(); drawPanel(); refreshHeadIcon();
      } }, el("span", { style: { background: `linear-gradient(135deg, ${p.primary} 55%, ${p.secondary} 55%)` } }), el("small", {}, p.name))));

    const themeFields = [
      { k: "dark", l: "Dark mode", t: "bool" },
      { k: "font", l: "Font style", t: "select", def: "system", options: [["system", "Modern (system)"], ["rounded", "Rounded / friendly"], ["serif", "Elegant serif"], ["condensed", "Bold condensed"], ["mono", "Technical mono"]] },
      { k: "corners", l: "Corners", t: "select", def: "rounded", options: [["rounded", "Rounded"], ["pill", "Extra round"], ["square", "Square"]] },
      { k: "headerStyle", l: "Header", t: "select", def: "solid", options: [["solid", "Brand colour"], ["light", "Light / white"]] },
    ];
    const navField = [
      { k: "navigation", l: "Navigation", t: "select", def: "bottom", options: [["bottom", "Bottom tab bar"], ["drawer", "Side menu (drawer)"]] },
      { k: "features.floatingButton", l: "Floating action button", t: "select", def: "whatsapp", options: [["whatsapp", "WhatsApp chat"], ["call", "Call"], ["none", "None"]] },
    ];

    const iconPreview = el("div", { class: "launcher-preview" });
    const drawIcon = () => {
      fill(iconPreview, 
        el("div", { class: "lp lp-round" }, appIcon(app, 72)),
        el("div", { class: "lp lp-square" }, appIcon(app, 72)),
        el("small", { class: "muted" }, app.name));
    };
    drawIcon();
    const refreshHeadIcon = () => {
      const holder = head.querySelector(".editor-title .app-icon");
      if (holder) holder.replaceWith(appIcon(app, 36));
      drawIcon();
    };
    const iconFile = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp", hidden: true, onchange: async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const res = await upload(`/api/apps/${app.id}/icon`, f);
        app.iconUrl = res.iconUrl;
        toast("Icon uploaded");
        drawPanel(); refreshHeadIcon();
      } catch (err) { toast(err.message, "error"); }
    } });

    panel.append(
      section("Colour theme", "Pick a preset or fine-tune your brand colours.",
        presetGrid,
        el("div", { class: "row2" },
          labeled("Primary colour", colorInput(t.primary || "#1E63E9", (v) => { t.primary = v; changed(); })),
          labeled("Accent colour", colorInput(t.secondary || t.primary || "#1E63E9", (v) => { t.secondary = v; changed(); }))),
        renderFields(themeFields, t, { onChange: changed })),
      section("Layout", "", renderFields(navField, cfg, { onChange: changed })),
      section("App icon", "Shown on the phone's home screen. Use a symbol on your brand colour, or upload a 512×512 PNG logo.",
        el("div", { class: "icon-editor" },
          iconPreview,
          el("div", { class: "fields" },
            app.iconUrl
              ? el("div", { class: "field" }, el("span", { class: "field-label" }, "Custom icon"),
                el("div", { class: "row-actions" },
                  el("button", { class: "btn btn-small", onclick: () => iconFile.click() }, "Replace"),
                  el("button", { class: "btn btn-small btn-ghost", onclick: async () => {
                    await del(`/api/apps/${app.id}/icon`); app.iconUrl = null; drawPanel(); refreshHeadIcon();
                  } }, "Use symbol instead")))
              : [
                labeled("Symbol", iconButton(ic.symbol || "star", (v) => { ic.symbol = v; changed(); refreshHeadIcon(); })),
                el("div", { class: "row2" },
                  labeled("Background", colorInput(ic.background || t.primary || "#1E63E9", (v) => { ic.background = v; changed(); refreshHeadIcon(); })),
                  labeled("Symbol colour", colorInput(ic.foreground || "#FFFFFF", (v) => { ic.foreground = v; changed(); refreshHeadIcon(); }))),
                el("button", { class: "btn btn-small btn-outline", onclick: () => iconFile.click() }, icon("image"), "Upload your own icon"),
              ],
            iconFile))));
  }

  // ---------------------------------------------------------------- business
  function businessTab() {
    cfg.business = cfg.business || {};
    panel.append(section("Business details", "Used across the app: home screen, contact page, quick actions, orders and bookings.",
      renderFields(BUSINESS_FIELDS, cfg.business, { onChange: changed })));
  }

  // ---------------------------------------------------------------- pages
  function pagesTab() {
    if (cfg.mode === "website") {
      panel.append(section("Website app", "This app shows your website. Switch to a native app in Settings to add pages.",
        el("button", { class: "btn", onclick: () => go("settings") }, "Open settings")));
      return;
    }
    cfg.pages = cfg.pages || [];
    if (!state.pageId || !cfg.pages.some((p) => p.id === state.pageId)) state.pageId = cfg.pages[0] && cfg.pages[0].id;
    const list = el("div", { class: "page-list" });
    const editor = el("div", { class: "page-editor" });

    const drawList = () => {
      fill(list, 
        ...cfg.pages.map((p, i) => el("div", { class: `page-row${p.id === state.pageId ? " on" : ""}${p.hidden ? " off" : ""}`, onclick: () => select(p.id) },
          icon(p.icon || "star"),
          el("div", { class: "page-row-text" }, el("strong", {}, p.title), el("small", {}, (PAGE_TYPES[p.type] || {}).label || p.type)),
          el("span", { class: "list-tools" },
            el("button", { class: "icon-btn sm", title: "Move up", onclick: (e) => { e.stopPropagation(); move(i, -1); } }, "↑"),
            el("button", { class: "icon-btn sm", title: "Move down", onclick: (e) => { e.stopPropagation(); move(i, 1); } }, "↓")))),
        el("button", { class: "btn btn-outline btn-block", onclick: addPage }, icon("plus"), "Add page"),
        cfg.navigation !== "drawer" && cfg.pages.filter((p) => !p.hidden).length > 5
          ? el("p", { class: "muted small" }, "The first 4 pages appear in the bottom bar; the rest go under “More”.") : null);
    };
    const move = (i, d) => {
      const j = i + d;
      if (j < 0 || j >= cfg.pages.length) return;
      [cfg.pages[i], cfg.pages[j]] = [cfg.pages[j], cfg.pages[i]];
      changed(); drawList();
    };
    const select = (id) => {
      state.pageId = id;
      drawList(); drawEditor(); pushPreview();
    };
    const drawEditor = () => {
      const p = cfg.pages.find((x) => x.id === state.pageId);
      if (!p) { fill(editor, el("p", { class: "muted" }, "Add a page to get started.")); return; }
      const type = PAGE_TYPES[p.type] || { label: p.type, fields: [] };
      const titleInput = el("input", { value: p.title || "", maxlength: 40, oninput: (e) => { p.title = e.target.value; changed(); list.querySelector(".page-row.on strong").textContent = p.title; } });
      fill(editor, 
        el("div", { class: "page-editor-head" },
          el("div", {}, el("span", { class: "pill" }, type.label), el("p", { class: "muted small" }, type.desc || "")),
          el("button", { class: "btn btn-small btn-ghost danger", onclick: async () => {
            if (!(await confirmDialog("Delete page", `Delete the "${p.title}" page?`, { danger: true, confirm: "Delete" }))) return;
            cfg.pages = cfg.pages.filter((x) => x !== p);
            state.pageId = cfg.pages[0] && cfg.pages[0].id;
            changed(); drawList(); drawEditor();
          } }, "Delete page")),
        el("div", { class: "row2" },
          labeled("Page title", titleInput),
          labeled("Menu icon", iconButton(p.icon || type.icon || "star", (v) => { p.icon = v; changed(); drawList(); }))),
        el("label", { class: "field field-check" },
          el("input", { type: "checkbox", checked: !!p.hidden, onchange: (e) => { p.hidden = e.target.checked; changed(); drawList(); } }),
          el("span", {}, "Hide this page")),
        type.note ? el("p", { class: "note" }, type.note) : null,
        renderFields(type.fields, p, { onChange: changed, pages: () => cfg.pages.filter((x) => x !== p) }));
    };
    const addPage = () => {
      const grid = el("div", { class: "type-grid" }, Object.entries(PAGE_TYPES).map(([k, t]) =>
        el("button", { type: "button", class: "type-card", onclick: () => {
          let id = k;
          let n = 1;
          while (cfg.pages.some((p) => p.id === id)) id = `${k}${++n}`;
          cfg.pages.push({ id, type: k, title: t.label.split(" /")[0], icon: t.icon });
          m.close();
          changed();
          select(id);
        } }, icon(t.icon), el("strong", {}, t.label), el("small", {}, t.desc))));
      const m = modal({ title: "Add a page", body: grid, wide: true });
    };
    drawList();
    drawEditor();
    panel.append(el("div", { class: "pages-layout" }, el("div", { class: "card page-list-card" }, el("h2", {}, "Pages"), list), el("div", { class: "card" }, editor)));
  }

  // ---------------------------------------------------------------- settings
  function settingsTab() {
    const name = el("input", { value: app.name, maxlength: 50 });
    const pkg = el("input", { value: app.packageName, spellcheck: "false" });
    const ver = el("input", { value: app.versionName, maxlength: 30 });
    const saveMeta = async (confirmPackageChange = false) => {
      try {
        const res = await put(`/api/apps/${app.id}`, { name: name.value, packageName: pkg.value.trim(), versionName: ver.value.trim(), confirmPackageChange });
        Object.assign(app, { name: res.app.name, packageName: res.app.packageName, versionName: res.app.versionName });
        cfg.appName = res.app.name;
        head.querySelector(".editor-title h1").textContent = app.name;
        head.querySelector(".editor-title code").textContent = app.packageName;
        pushPreview();
        toast("Settings saved");
      } catch (e) {
        if (e.status === 409 && !confirmPackageChange && /Confirm/.test(e.message)) {
          if (await confirmDialog("Change package name?", e.message, { danger: true, confirm: "Change it" })) return saveMeta(true);
          return;
        }
        toast(e.message, "error");
      }
    };

    const mode = el("select", {}, el("option", { value: "app", selected: cfg.mode !== "website" }, "Native business app (pages, catalog, bookings…)"),
      el("option", { value: "website", selected: cfg.mode === "website" }, "Website app (wrap an existing website)"));
    const url = el("input", { type: "url", placeholder: "https://www.example.com", value: (cfg.website && cfg.website.url) || "" });
    const urlField = labeled("Website address", url);
    urlField.hidden = cfg.mode !== "website";
    mode.addEventListener("change", () => { cfg.mode = mode.value; urlField.hidden = cfg.mode !== "website"; changed(); });
    url.addEventListener("input", () => { cfg.website = { ...(cfg.website || {}), url: url.value.trim() }; changed(); });

    const importInput = el("input", { type: "file", accept: "application/json,.json", hidden: true, onchange: async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        const next = data.config || data;
        if (!next || typeof next !== "object" || !("pages" in next || "mode" in next)) throw new Error("This file is not an app configuration");
        if (!(await confirmDialog("Import configuration", "Replace this app's design, business info and pages with the imported file?", { confirm: "Import" }))) return;
        Object.keys(cfg).forEach((k) => delete cfg[k]);
        Object.assign(cfg, next);
        await doSave();
        pushPreview.flush(true);
        toast("Configuration imported");
      } catch (err) { toast(err.message, "error"); }
    } });

    panel.append(
      section("App identity", "",
        labeled("App name (shown under the icon)", name),
        labeled("Package name (unique app ID)", pkg, "Like com.yourcompany.app. Don't change it after publishing — phones and Google Play treat it as a different app."),
        labeled("Version", ver, "Shown to users. The internal version code increases automatically with every build."),
        el("button", { class: "btn btn-primary", onclick: () => saveMeta() }, "Save")),
      section("App type", "", labeled("Type", mode), urlField),
      section("Sharing", "", renderFields([{ k: "features.shareText", l: "Share message", t: "textarea", rows: 2, ph: "Text used by the “Share this app” button" }], cfg, { onChange: changed })),
      section("Backup & reuse", "",
        el("div", { class: "row-actions" },
          el("button", { class: "btn", onclick: () => {
            const blob = new Blob([JSON.stringify({ name: app.name, config: cfg }, null, 2)], { type: "application/json" });
            const a = el("a", { href: URL.createObjectURL(blob), download: `${app.packageName}.json` });
            a.click();
          } }, "Export JSON"),
          el("button", { class: "btn", onclick: () => importInput.click() }, "Import JSON"),
          el("button", { class: "btn", onclick: async () => {
            const res = await post(`/api/apps/${app.id}/duplicate`);
            toast("App duplicated");
            location.hash = `#/apps/${res.app.id}/settings`;
          } }, "Duplicate app"),
          session.user.role === "admin" ? el("button", { class: "btn", onclick: saveAsTemplate }, "Save as template") : null,
          importInput)),
      section("Danger zone", "",
        el("button", { class: "btn btn-danger", onclick: async () => {
          if (!(await confirmDialog("Delete app", `Delete "${app.name}", its builds, leads and signing key? This cannot be undone.`, { danger: true, confirm: "Delete forever" }))) return;
          await del(`/api/apps/${app.id}`);
          toast("App deleted");
          location.hash = "#/apps";
        } }, "Delete app")));
  }

  function saveAsTemplate() {
    const n = el("input", { value: app.name });
    const c = el("input", { value: "Custom" });
    const d = el("textarea", { rows: 2 });
    modal({
      title: "Save as template",
      body: el("div", { class: "fields" }, labeled("Template name", n), labeled("Category", c), labeled("Description", d),
        el("p", { class: "muted small" }, "All users on this installation will be able to start from this template.")),
      actions: [{ label: "Cancel" }, { label: "Save template", primary: true, onClick: async () => {
        await save.flush();
        await post("/api/admin/templates", { appId: app.id, name: n.value, category: c.value, description: d.value });
        toast("Template saved");
      } }],
    });
  }

  // ---------------------------------------------------------------- build
  function buildTab() {
    const current = el("div", { class: "build-current" });
    const historyBox = el("div");
    const keyBox = el("div");
    const nextInfo = el("p", { class: "muted small" });
    const drawNext = () => { nextInfo.textContent = `Next build: version ${app.versionName} · code ${app.versionCode + 1} · ${app.packageName}`; };
    drawNext();

    const startBuild = async (format) => {
      await save.flush();
      try {
        const { build } = await post(`/api/apps/${app.id}/builds`, { format });
        toast(`${format.toUpperCase()} build queued`);
        track(build.id);
        loadHistory();
      } catch (e) { toast(e.message, "error"); }
    };

    const track = (buildId) => {
      const logEl = el("pre", { class: "log" });
      const header = el("div", { class: "build-progress-head" });
      const box = el("div", { class: "card build-live" }, header, el("div", { class: "progress" }, el("div", { class: "progress-bar" })), logEl);
      fill(current, box);
      let stopped = false;
      const poll = async () => {
        if (stopped || state.disposed) return;
        try {
          const { build } = await get(`/api/builds/${buildId}`);
          const active = ["queued", "building"].includes(build.status);
          fill(header, 
            el("div", {}, el("h3", {}, `Version ${build.versionName} (${build.versionCode}) · ${build.format.toUpperCase()}`),
              el("span", { class: "muted small" }, build.status === "queued" ? "Waiting for a build worker…" : active ? "Compiling and signing your app…" : `Finished ${timeAgo(build.finishedAt)}`)),
            statusPill(build.status),
            active ? el("button", { class: "btn btn-small btn-ghost", onclick: async () => { await post(`/api/builds/${buildId}/cancel`); poll(); } }, "Cancel") : null);
          box.classList.toggle("done", !active);
          box.querySelector(".progress").hidden = !active;
          const atBottom = logEl.scrollTop + logEl.clientHeight >= logEl.scrollHeight - 20;
          logEl.textContent = build.log || "";
          if (atBottom) logEl.scrollTop = logEl.scrollHeight;
          if (!active) {
            stopped = true;
            clearInterval(timer);
            if (build.status === "success") {
              box.insertBefore(downloadPanel(build), logEl);
              logEl.hidden = true;
              box.append(el("button", { class: "btn btn-small btn-ghost", onclick: () => { logEl.hidden = !logEl.hidden; } }, "Show build log"));
              toast("Your app is ready!", "success");
            } else if (build.status === "failed") {
              box.insertBefore(el("p", { class: "note error" }, build.error || "Build failed"), logEl);
            }
            loadHistory();
            loadKey();
          }
        } catch (e) { /* transient */ }
      };
      const timer = setInterval(poll, 2000);
      state.timers.push(timer);
      poll();
    };

    const downloadPanel = (b) => el("div", { class: "download-panel" },
      el("div", { class: "download-main" },
        el("a", { class: "btn btn-primary btn-lg", href: b.downloadUrl }, icon("bolt"), `Download ${b.format.toUpperCase()} · ${formatBytes(b.size)}`),
        el("button", { class: "btn", onclick: () => copyText(b.downloadUrl) }, icon("link"), "Copy install link")),
      el("p", { class: "muted small" }, b.format === "apk"
        ? "Open the link on an Android phone to install (allow “Install unknown apps” when asked). The link works for 24 hours."
        : "Upload this .aab file to the Google Play Console. Keep your signing key safe — Play requires the same key for every update."),
      el("p", { class: "muted small mono" }, `SHA-256 ${b.sha256}`));

    const loadHistory = async () => {
      const { builds } = await get(`/api/apps/${app.id}/builds`);
      app.versionCode = Math.max(app.versionCode, ...builds.map((b) => b.versionCode));
      drawNext();
      const active = builds.find((b) => ["queued", "building"].includes(b.status));
      if (active && !current.firstChild) track(active.id);
      fill(historyBox, builds.length
        ? el("div", { class: "table-wrap" }, el("table", { class: "table" },
          el("thead", {}, el("tr", {}, ["Version", "Type", "Status", "Built", "Size", ""].map((x) => el("th", {}, x)))),
          el("tbody", {}, builds.map((b) => el("tr", {},
            el("td", {}, `${b.versionName} `, el("span", { class: "muted small" }, `(${b.versionCode})`)),
            el("td", {}, b.format.toUpperCase()),
            el("td", {}, statusPill(b.status)),
            el("td", { title: b.createdAt }, timeAgo(b.createdAt)),
            el("td", {}, formatBytes(b.size)),
            el("td", { class: "right" },
              b.downloadUrl ? el("a", { class: "btn btn-small", href: b.downloadUrl }, "Download") : null,
              el("button", { class: "btn btn-small btn-ghost", onclick: () => track(b.id) }, "Details")))))))
        : el("p", { class: "muted" }, "No builds yet."));
    };

    const loadKey = async () => {
      if (state.tab !== "build") return;
      try {
        const k = await get(`/api/apps/${app.id}/keystore`);
        if (!k.alias) { fill(keyBox); return; }
        const pw = el("code", {}, "••••••••••••");
        fill(keyBox, section("Signing key", "Your app is signed with its own release key. Download a backup and store the password safely — you need both to publish updates on Google Play.",
          el("dl", { class: "kv" },
            el("dt", {}, "Type"), el("dd", {}, k.type),
            el("dt", {}, "Key alias"), el("dd", {}, el("code", {}, k.alias)),
            el("dt", {}, "Password"), el("dd", {}, pw, " ",
              el("button", { class: "btn btn-small btn-ghost", onclick: () => { pw.textContent = k.password; } }, "Show"),
              el("button", { class: "btn btn-small btn-ghost", onclick: () => copyText(k.password) }, "Copy")),
            el("dt", {}, "Created"), el("dd", {}, timeAgo(k.createdAt))),
          el("a", { class: "btn", href: k.downloadUrl }, "Download keystore (.p12)")));
      } catch {
        fill(keyBox, );
      }
    };

    panel.append(
      section("Build your app", "Builds are compiled from a clean Android project and signed with this app's own key.",
        el("div", { class: "build-options" },
          el("button", { class: "build-option", onclick: () => startBuild("apk") },
            icon("phone"), el("strong", {}, "APK"), el("span", {}, "Install directly on phones, share via link or WhatsApp, distribute on any store.")),
          el("button", { class: "build-option", onclick: () => startBuild("aab") },
            icon("store"), el("strong", {}, "App Bundle (AAB)"), el("span", {}, "The format Google Play requires for new apps."))),
        nextInfo),
      current,
      section("Build history", "", historyBox),
      keyBox);
    loadHistory();
    loadKey();
  }

  // ---------------------------------------------------------------- leads
  async function leadsTab() {
    const box = el("div", {}, el("p", { class: "muted" }, "Loading…"));
    panel.append(section("Leads inbox", "Messages, booking requests and orders sent from your app when a form is set to “Dashboard inbox”.",
      el("div", { class: "row-actions" },
        el("button", { class: "btn btn-small", onclick: () => downloadAuthed(`/api/apps/${app.id}/leads.csv`, `leads-${app.packageName}.csv`) }, "Export CSV"),
        el("button", { class: "btn btn-small btn-ghost", onclick: async () => { await post(`/api/apps/${app.id}/leads/read`); load(); } }, "Mark all as read")),
      box));
    const load = async () => {
      const { leads } = await get(`/api/apps/${app.id}/leads`);
      if (!leads.length) {
        fill(box, el("div", { class: "empty-state small" }, icon("email"), el("p", {}, "No leads yet. Try submitting the contact form in the preview!")));
        return;
      }
      fill(box, ...leads.map((l) => el("div", { class: `lead${l.read ? "" : " unread"}` },
        el("div", { class: "lead-head" },
          el("span", { class: `pill pill-${l.kind}` }, l.kind),
          el("strong", {}, l.data.name || "Anonymous"),
          el("span", { class: "muted small" }, new Date(l.createdAt).toLocaleString()),
          el("button", { class: "icon-btn sm danger", title: "Delete", onclick: async () => { await del(`/api/apps/${app.id}/leads/${l.id}`); load(); } }, "✕")),
        el("dl", { class: "kv compact" }, Object.entries(l.data).filter(([k, v]) => k !== "name" && typeof v !== "object" && v !== "").map(([k, v]) =>
          [el("dt", {}, k), el("dd", {}, k === "phone" ? el("a", { href: `tel:${v}` }, v) : String(v))])),
        Array.isArray(l.data.items) ? el("ul", { class: "lead-items" }, l.data.items.map((i) => el("li", {}, `${i.qty} × ${i.name}`))) : null)));
    };
    load();
  }

  // ---------------------------------------------------------------- helpers
  function section(title, desc, ...children) {
    return el("div", { class: "card" }, el("h2", {}, title), desc ? el("p", { class: "muted" }, desc) : null, ...children);
  }
  function labeled(label, control, help) {
    return el("label", { class: "field" }, el("span", { class: "field-label" }, label), control, help ? el("small", { class: "field-help" }, help) : null);
  }

  drawTabs();
  drawPanel();

  return () => {
    state.disposed = true;
    state.timers.forEach(clearInterval);
    window.removeEventListener("message", onMessage);
    save.flush();
  };
}
