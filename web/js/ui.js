// Small DOM helpers shared by all views.
const ICONS = window.ICONS || {};

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "style" && typeof v === "object") {
      for (const [prop, val] of Object.entries(v)) {
        if (prop.startsWith("--")) node.style.setProperty(prop, val);
        else node.style[prop] = val;
      }
    }
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "html") node.innerHTML = v;
    else if (v === true) node.setAttribute(k, "");
    else node.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

/** Like node.replaceChildren() but skips null/false/undefined (conditional children). */
export function fill(node, ...children) {
  node.replaceChildren(...children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}

export function icon(name, cls = "") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", `ico ${cls}`);
  svg.setAttribute("aria-hidden", "true");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", ICONS[name] || ICONS.star);
  svg.append(p);
  return svg;
}

export const iconNames = () => Object.keys(ICONS).filter((n) => !["back", "chevron", "close", "plus", "minus", "menu"].includes(n));

export function toast(message, kind = "info") {
  let host = document.getElementById("toasts");
  if (!host) {
    host = el("div", { id: "toasts" });
    document.body.append(host);
  }
  const t = el("div", { class: `toast toast-${kind}`, role: "status" }, message);
  host.append(t);
  setTimeout(() => t.classList.add("out"), 3200);
  setTimeout(() => t.remove(), 3600);
}

export function modal({ title, body, actions = [], wide = false, onClose }) {
  const close = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
    onClose && onClose();
  };
  const onKey = (e) => e.key === "Escape" && close();
  const footer = el("div", { class: "modal-actions" },
    actions.map((a) => el("button", {
      class: `btn ${a.primary ? "btn-primary" : a.danger ? "btn-danger" : "btn-ghost"}`,
      type: "button",
      onclick: async (e) => {
        if (a.onClick) {
          const btn = e.currentTarget;
          btn.disabled = true;
          try {
            const keep = await a.onClick(close);
            if (keep !== true) close();
          } catch (err) {
            toast(err.message, "error");
          } finally {
            btn.disabled = false;
          }
        } else close();
      },
    }, a.label)));
  const box = el("div", { class: `modal${wide ? " modal-wide" : ""}`, role: "dialog", "aria-modal": "true" },
    el("div", { class: "modal-head" }, el("h2", {}, title),
      el("button", { class: "icon-btn", type: "button", "aria-label": "Close", onclick: close }, icon("close"))),
    el("div", { class: "modal-body" }, body),
    actions.length ? footer : null);
  const overlay = el("div", { class: "overlay", onmousedown: (e) => e.target === overlay && close() }, box);
  document.body.append(overlay);
  document.addEventListener("keydown", onKey);
  const first = box.querySelector("input, select, textarea");
  // Autofocus the first field, unless the user has already moved into the dialog.
  if (first) setTimeout(() => { if (!box.contains(document.activeElement)) first.focus(); }, 30);
  return { close, box };
}

export function confirmDialog(title, message, { danger = false, confirm = "Confirm" } = {}) {
  return new Promise((resolve) => {
    let done = false;
    modal({
      title,
      body: el("p", {}, message),
      onClose: () => !done && resolve(false),
      actions: [
        { label: "Cancel" },
        { label: confirm, primary: !danger, danger, onClick: () => { done = true; resolve(true); } },
      ],
    });
  });
}

export function formatBytes(n) {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1048576).toFixed(2)} MB`;
}

export function timeAgo(iso) {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString();
}

export function statusPill(status) {
  const labels = { queued: "Queued", building: "Building", success: "Ready", failed: "Failed", canceled: "Canceled" };
  return el("span", { class: `pill pill-${status}` }, status === "building" ? el("span", { class: "dot-spin" }) : null, labels[status] || status);
}

/** Rounded launcher icon preview (symbol on colour, or uploaded image). */
export function appIcon(app, size = 48) {
  const cfg = app.config || {};
  const ic = cfg.icon || {};
  const wrap = el("div", { class: "app-icon", style: { width: `${size}px`, height: `${size}px`, background: ic.background || (cfg.theme && cfg.theme.primary) || "#1E63E9" } });
  if (app.iconUrl) wrap.append(el("img", { src: app.iconUrl, alt: "" }));
  else {
    const i = icon(ic.symbol || "star");
    i.style.fill = ic.foreground || "#fff";
    wrap.append(i);
  }
  return wrap;
}

export function debounce(fn, ms) {
  let t;
  let pending = false;
  const d = () => {
    pending = true;
    clearTimeout(t);
    t = setTimeout(() => { pending = false; fn(); }, ms);
  };
  /** Run now if a call is pending (or always when force is true). */
  d.flush = (force = false) => {
    clearTimeout(t);
    const run = pending || force;
    pending = false;
    return run ? fn() : Promise.resolve();
  };
  return d;
}

export function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(() => toast("Copied"));
  const ta = el("textarea", { style: { position: "fixed", opacity: "0" } }, text);
  document.body.append(ta);
  ta.select();
  document.execCommand("copy");
  ta.remove();
  toast("Copied");
  return Promise.resolve();
}
