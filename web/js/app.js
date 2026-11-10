// Builder SPA: routing, shell, auth, dashboard, template gallery, admin.
import { session, get, post, put, patch, del } from "./api.js";
import { fill, el, icon, toast, modal, timeAgo, statusPill, appIcon, formatBytes, confirmDialog } from "./ui.js";
import { renderEditor } from "./editor.js";

const root = document.getElementById("root");
let cleanup = null;

// ------------------------------------------------------------------ routing

const routes = [
  [/^\/login$/, () => authView("login")],
  [/^\/register$/, () => authView("register")],
  [/^\/$|^\/apps$/, () => shell("apps", dashboardView)],
  [/^\/templates$/, () => shell("templates", templatesView)],
  [/^\/apps\/([^/]+)(?:\/([a-z]+))?$/, (m) => shell("apps", (main) => renderEditor(main, m[1], m[2] || "design"), { full: true })],
  [/^\/admin$/, () => shell("admin", adminView)],
  [/^\/account$/, () => shell("account", accountView)],
];

async function route() {
  if (cleanup) { try { cleanup(); } catch { /* ignore */ } cleanup = null; }
  const path = location.hash.replace(/^#/, "") || "/";
  if (!session.user && !["/login", "/register"].includes(path)) {
    if (session.token) {
      try { session.user = (await get("/api/auth/me")).user; } catch { session.token = null; }
    }
    if (!session.user) { location.hash = "#/login"; return; }
  }
  for (const [re, view] of routes) {
    const m = re.exec(path);
    if (m) {
      const res = await view(m);
      if (typeof res === "function") cleanup = res;
      return;
    }
  }
  location.hash = "#/apps";
}

window.addEventListener("hashchange", route);

// ------------------------------------------------------------------ shell

function brand() {
  return el("a", { href: "#/apps", class: "brand" },
    el("span", { class: "brand-mark" }, icon("store")),
    el("span", {}, (session.system && session.system.brandName) || "APK Creator"));
}

function shell(active, render, { full = false } = {}) {
  const u = session.user;
  const nav = [
    ["apps", "#/apps", "list", "My apps"],
    ["templates", "#/templates", "image", "Templates"],
    u.role === "admin" ? ["admin", "#/admin", "shield", "Admin"] : null,
  ].filter(Boolean);
  const main = el("main", { class: `main${full ? " main-full" : ""}` });
  fill(root, 
    el("header", { class: "topbar" },
      brand(),
      el("nav", { class: "topnav" }, nav.map(([k, href, ic, label]) =>
        el("a", { href, class: k === active ? "on" : "" }, icon(ic), el("span", {}, label)))),
      el("div", { class: "topbar-right" },
        session.system ? el("span", { class: `mode-badge mode-${session.system.mode}` }, session.system.mode === "cloud" ? "Cloud" : "On-premise") : null,
        el("a", { href: "#/account", class: `user-chip${active === "account" ? " on" : ""}`, title: u.email },
          el("span", { class: "avatar-sm" }, (u.name || u.email).charAt(0).toUpperCase()), el("span", { class: "hide-sm" }, u.name || u.email)),
        el("button", { class: "icon-btn", title: "Sign out", onclick: logout }, icon("back")))),
    main);
  return render(main);
}

function logout() {
  session.token = null;
  session.user = null;
  location.hash = "#/login";
}

// ------------------------------------------------------------------ auth

function authView(mode) {
  const sys = session.system || {};
  const isLogin = mode === "login";
  const form = el("form", { class: "auth-form" },
    el("h2", {}, isLogin ? "Sign in" : "Create your account"),
    !isLogin ? el("label", { class: "field" }, el("span", { class: "field-label" }, "Name"), el("input", { name: "name", autocomplete: "name" })) : null,
    el("label", { class: "field" }, el("span", { class: "field-label" }, "Email"), el("input", { name: "email", type: "email", required: true, autocomplete: "email" })),
    el("label", { class: "field" }, el("span", { class: "field-label" }, "Password"),
      el("input", { name: "password", type: "password", required: true, minlength: isLogin ? undefined : 8, autocomplete: isLogin ? "current-password" : "new-password" })),
    el("button", { class: "btn btn-primary btn-block", type: "submit" }, isLogin ? "Sign in" : "Create account"),
    sys.allowSignup !== false || !isLogin
      ? el("p", { class: "muted center" }, isLogin ? "New here? " : "Already have an account? ",
        el("a", { href: isLogin ? "#/register" : "#/login" }, isLogin ? "Create an account" : "Sign in"))
      : el("p", { class: "muted center" }, "Ask your administrator for an account."));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    try {
      const res = await post(isLogin ? "/api/auth/login" : "/api/auth/register", data);
      session.token = res.token;
      session.user = res.user;
      location.hash = isLogin ? "#/apps" : "#/templates";
    } catch (err) {
      toast(err.message, "error");
    }
  });
  const features = [
    ["image", "30+ business templates", "Restaurants, salons, clinics, gyms, real estate, retail and more."],
    ["phone", "Live phone preview", "See every change instantly, exactly as it looks in the app."],
    ["cart", "Orders, bookings & leads", "WhatsApp checkout, appointment forms and a lead inbox."],
    ["shield", "Your keys, your apps", "Signed release APKs & Play-ready AABs with a per-app key."],
  ];
  fill(root, el("div", { class: "auth" },
    el("section", { class: "auth-hero" },
      brand(),
      el("h1", {}, "Build a professional Android app for your business — no code."),
      el("p", { class: "auth-lead" }, "Pick a template, add your details, and download a ready-to-install APK in minutes."),
      el("ul", { class: "feature-list" }, features.map(([ic, t, d]) => el("li", {}, el("span", { class: "feature-ico" }, icon(ic)), el("div", {}, el("strong", {}, t), el("span", {}, d))))),
      el("p", { class: "muted small" }, `${sys.mode === "cloud" ? "Cloud" : "On-premise"} edition · v${sys.version || "1.0.0"}`)),
    el("section", { class: "auth-card" }, form)));
}

// ------------------------------------------------------------------ dashboard

async function dashboardView(main) {
  main.append(el("div", { class: "page-head" },
    el("div", {}, el("h1", {}, "My apps"), el("p", { class: "muted" }, "Create, edit and build your Android apps.")),
    el("a", { class: "btn btn-primary", href: "#/templates" }, icon("plus"), "Create app")));
  const grid = el("div", { class: "app-grid" }, el("div", { class: "skeleton" }), el("div", { class: "skeleton" }));
  main.append(grid);
  const { apps } = await get("/api/apps");
  if (!apps.length) {
    grid.replaceWith(el("div", { class: "empty-state" },
      icon("phone"),
      el("h2", {}, "No apps yet"),
      el("p", {}, "Start from one of our business templates — it only takes a minute."),
      el("a", { class: "btn btn-primary", href: "#/templates" }, "Browse templates")));
    return;
  }
  fill(grid, ...apps.map((a) => el("a", { class: "app-card", href: `#/apps/${a.id}` },
    el("div", { class: "app-card-top" }, appIcon(a, 56),
      el("div", { class: "app-card-meta" }, el("h3", {}, a.name), el("code", {}, a.packageName))),
    el("div", { class: "app-card-foot" },
      a.latestBuild ? statusPill(a.latestBuild.status) : el("span", { class: "pill" }, "Not built"),
      el("span", { class: "muted small" }, `v${a.versionName} · edited ${timeAgo(a.updatedAt)}`),
      a.unreadLeads ? el("span", { class: "badge-count", title: "New leads" }, a.unreadLeads) : null))));
}

// ------------------------------------------------------------------ templates

async function templatesView(main) {
  main.append(el("div", { class: "page-head" },
    el("div", {}, el("h1", {}, "Choose a template"), el("p", { class: "muted" }, "Every template is fully editable — pages, content, colours and icon."))));
  const { templates } = await get("/api/templates");
  const categories = ["All", ...new Set(templates.map((t) => t.category))];
  let active = "All";
  let query = "";
  const search = el("input", { type: "search", class: "search", placeholder: "Search templates (e.g. salon, menu, booking)…" });
  const chips = el("div", { class: "chips" });
  const grid = el("div", { class: "tpl-grid" });
  const draw = () => {
    fill(chips, ...categories.map((c) => el("button", { class: `chip${c === active ? " on" : ""}`, onclick: () => { active = c; draw(); } }, c)));
    const q = query.toLowerCase();
    const list = templates.filter((t) => (active === "All" || t.category === active) &&
      (!q || `${t.name} ${t.category} ${t.description} ${t.pages.map((p) => p.title).join(" ")}`.toLowerCase().includes(q)));
    fill(grid, ...list.map(templateCard));
    if (!list.length) grid.append(el("p", { class: "muted" }, "No templates match your search."));
  };
  search.addEventListener("input", () => { query = search.value; draw(); });
  main.append(el("div", { class: "tpl-toolbar" }, search), chips, grid);
  draw();
}

function templateCard(t) {
  const phone = el("div", { class: "tpl-phone", style: { "--tp": t.primary || "#1E63E9", "--ts": t.secondary || t.primary || "#1E63E9" } },
    el("div", { class: "tpl-bar" }),
    el("div", { class: "tpl-hero" }, icon(t.icon)),
    t.mode === "website"
      ? el("div", { class: "tpl-web" }, icon("web"), el("span", {}, "Your website"))
      : el("div", { class: "tpl-rows" }, t.pages.slice(1, 5).map((p) => el("div", { class: "tpl-row" }, icon(p.icon || "star"), el("span", {}, p.title)))),
    t.mode === "website" ? null : el("div", { class: "tpl-nav" }, t.pages.slice(0, 5).map((p) => icon(p.icon || "star"))));
  return el("button", { class: "tpl-card", onclick: () => createFromTemplate(t) },
    phone,
    el("div", { class: "tpl-info" },
      el("div", { class: "tpl-title" }, el("h3", {}, t.name), t.builtin ? null : el("span", { class: "pill" }, "Custom")),
      el("span", { class: "tpl-cat" }, t.category),
      el("p", {}, t.description),
      t.mode === "website" ? null : el("span", { class: "muted small" }, `${t.pageCount} pages`)));
}

function createFromTemplate(t) {
  const name = el("input", { required: true, maxlength: 50, placeholder: "e.g. Rosa's Pizzeria" });
  const url = el("input", { type: "url", placeholder: "https://www.example.com" });
  modal({
    title: `New app · ${t.name}`,
    body: el("div", { class: "fields" },
      el("label", { class: "field" }, el("span", { class: "field-label" }, "App / business name"), name),
      t.mode === "website" ? el("label", { class: "field" }, el("span", { class: "field-label" }, "Website address"), url) : null,
      el("p", { class: "muted small" }, "You can change everything later.")),
    actions: [
      { label: "Cancel" },
      { label: "Create app", primary: true, onClick: async () => {
        if (!name.value.trim()) { toast("Please enter a name", "error"); return true; }
        const { app } = await post("/api/apps", { templateId: t.id, name: name.value.trim(), websiteUrl: url.value.trim() || undefined });
        location.hash = `#/apps/${app.id}/${t.mode === "website" ? "settings" : "design"}`;
      } },
    ],
  });
  name.addEventListener("keydown", (e) => e.key === "Enter" && e.target.closest(".modal").querySelector(".btn-primary").click());
}

// ------------------------------------------------------------------ admin

async function adminView(main) {
  main.append(el("div", { class: "page-head" }, el("div", {}, el("h1", {}, "Administration"), el("p", { class: "muted" }, "Users, builds and system status."))));
  const [stats, { users }, { builds }, { templates }] = await Promise.all([
    get("/api/admin/stats"), get("/api/admin/users"), get("/api/admin/builds"), get("/api/templates"),
  ]);
  const s = stats.system;
  main.append(
    el("div", { class: "stat-grid" }, [
      ["Users", stats.users], ["Apps", stats.apps], ["Builds (24h)", stats.buildsToday], ["Queue", `${stats.queued} queued · ${stats.building} building`],
      ["Failed (24h)", stats.failedToday], ["Leads", stats.leads],
    ].map(([l, v]) => el("div", { class: "stat-card" }, el("span", {}, l), el("strong", {}, v)))),
    el("div", { class: "card" }, el("h2", {}, "System"),
      el("dl", { class: "kv" }, [
        ["Deployment", s.mode === "cloud" ? "Cloud" : "On-premise"], ["Database", s.database], ["Storage", s.storage],
        ["Build worker", s.embeddedWorker ? "Embedded in API server" : "External worker pool"], ["Public URL", s.publicUrl],
        ["Self sign-up", s.allowSignup ? "Enabled" : "Disabled"], ["Node.js", s.node],
      ].map(([k, v]) => [el("dt", {}, k), el("dd", {}, v)]))));

  const userTable = el("table", { class: "table" },
    el("thead", {}, el("tr", {}, ["User", "Role", "Apps", "Joined", ""].map((h) => el("th", {}, h)))),
    el("tbody", {}, users.map((u) => el("tr", { class: u.disabled ? "row-off" : "" },
      el("td", {}, el("strong", {}, u.name), el("br"), el("span", { class: "muted small" }, u.email)),
      el("td", {}, u.role === "admin" ? el("span", { class: "pill pill-success" }, "Admin") : "User"),
      el("td", {}, u.apps),
      el("td", {}, timeAgo(u.createdAt)),
      el("td", { class: "right" },
        u.id === session.user.id ? el("span", { class: "muted small" }, "You") : [
          el("button", { class: "btn btn-small btn-ghost", onclick: async () => { await patch(`/api/admin/users/${u.id}`, { role: u.role === "admin" ? "user" : "admin" }); route(); } },
            u.role === "admin" ? "Make user" : "Make admin"),
          el("button", { class: "btn btn-small btn-ghost", onclick: async () => { await patch(`/api/admin/users/${u.id}`, { disabled: !u.disabled }); route(); } },
            u.disabled ? "Enable" : "Disable"),
        ])))));
  main.append(el("div", { class: "card" },
    el("div", { class: "card-head" }, el("h2", {}, "Users"), el("button", { class: "btn btn-small btn-primary", onclick: addUserDialog }, icon("plus"), "Add user")),
    el("div", { class: "table-wrap" }, userTable)));

  main.append(el("div", { class: "card" }, el("h2", {}, "Recent builds"),
    el("div", { class: "table-wrap" }, el("table", { class: "table" },
      el("thead", {}, el("tr", {}, ["App", "Owner", "Version", "Status", "Worker", "When", ""].map((h) => el("th", {}, h)))),
      el("tbody", {}, builds.map((b) => el("tr", {},
        el("td", {}, el("a", { href: `#/apps/${b.appId}/build` }, b.appName), el("br"), el("code", { class: "small" }, b.packageName)),
        el("td", { class: "small" }, b.owner || ""),
        el("td", {}, `${b.versionName} (${b.versionCode}) · ${b.format.toUpperCase()}`),
        el("td", {}, statusPill(b.status), b.error ? el("div", { class: "small muted" }, b.error) : null),
        el("td", { class: "small muted" }, b.worker || ""),
        el("td", {}, timeAgo(b.createdAt)),
        el("td", {}, b.downloadUrl ? el("a", { href: b.downloadUrl, class: "btn btn-small" }, formatBytes(b.size)) : null))))))));

  const custom = templates.filter((t) => t.source === "custom");
  main.append(el("div", { class: "card" }, el("h2", {}, "Custom templates"),
    el("p", { class: "muted" }, "Save any app as a template from its Settings tab. File-based templates can also be placed in TEMPLATES_DIR."),
    custom.length ? el("ul", { class: "plain-list" }, custom.map((t) => el("li", {},
      el("span", {}, el("strong", {}, t.name), ` · ${t.category}`),
      el("button", { class: "btn btn-small btn-ghost", onclick: async () => {
        if (await confirmDialog("Delete template", `Delete "${t.name}"? Existing apps are not affected.`, { danger: true, confirm: "Delete" })) {
          await del(`/api/admin/templates/${t.id}`); route();
        }
      } }, "Delete")))) : el("p", { class: "muted small" }, "No custom templates yet.")));
}

function addUserDialog() {
  const f = { name: el("input"), email: el("input", { type: "email" }), password: el("input", { type: "password", minlength: 8 }),
    role: el("select", {}, el("option", { value: "user" }, "User"), el("option", { value: "admin" }, "Administrator")) };
  modal({
    title: "Add user",
    body: el("div", { class: "fields" }, Object.entries({ Name: f.name, Email: f.email, "Temporary password": f.password, Role: f.role })
      .map(([l, c]) => el("label", { class: "field" }, el("span", { class: "field-label" }, l), c))),
    actions: [{ label: "Cancel" }, { label: "Create user", primary: true, onClick: async () => {
      await post("/api/admin/users", { name: f.name.value, email: f.email.value, password: f.password.value, role: f.role.value });
      toast("User created");
      route();
    } }],
  });
}

// ------------------------------------------------------------------ account

function accountView(main) {
  const u = session.user;
  const name = el("input", { value: u.name || "" });
  const cur = el("input", { type: "password", autocomplete: "current-password" });
  const next = el("input", { type: "password", autocomplete: "new-password", minlength: 8 });
  main.append(el("div", { class: "page-head" }, el("div", {}, el("h1", {}, "Account"), el("p", { class: "muted" }, u.email))),
    el("div", { class: "card narrow" }, el("h2", {}, "Profile"),
      el("label", { class: "field" }, el("span", { class: "field-label" }, "Name"), name),
      el("button", { class: "btn btn-primary", onclick: async () => { session.user = (await put("/api/auth/me", { name: name.value })).user; toast("Saved"); } }, "Save")),
    el("div", { class: "card narrow" }, el("h2", {}, "Change password"),
      el("label", { class: "field" }, el("span", { class: "field-label" }, "Current password"), cur),
      el("label", { class: "field" }, el("span", { class: "field-label" }, "New password"), next),
      el("button", { class: "btn btn-primary", onclick: async () => {
        try { await put("/api/auth/me", { currentPassword: cur.value, newPassword: next.value }); toast("Password changed"); cur.value = next.value = ""; } catch (e) { toast(e.message, "error"); }
      } }, "Update password")));
}

// ------------------------------------------------------------------ boot

window.addEventListener("unhandledrejection", (e) => {
  if (e.reason && e.reason.message) toast(e.reason.message, "error");
});

(async () => {
  try { session.system = await get("/api/system"); } catch { session.system = {}; }
  document.title = session.system.brandName || "APK Creator";
  route();
})();

export { route };
