// Generic schema-driven form renderer used for pages, business info and lists.
import { fill, el, icon, iconNames, modal, toast } from "./ui.js";
import { upload } from "./api.js";

export function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function setPath(obj, path, value) {
  const keys = path.split(".");
  let o = obj;
  for (const k of keys.slice(0, -1)) {
    if (o[k] == null || typeof o[k] !== "object") o[k] = {};
    o = o[k];
  }
  o[keys[keys.length - 1]] = value;
}

/**
 * Renders `fields` for `obj` into a container element that re-renders itself
 * when a field affecting visibility (bool/select) changes.
 * ctx: { onChange(), pages: () => [...] }
 */
export function renderFields(fields, obj, ctx) {
  const box = el("div", { class: "fields" });
  const draw = () => {
    fill(box, ...fields.filter((f) => !f.showIf || f.showIf(obj)).map((f) => field(f, obj, ctx, draw)));
  };
  draw();
  return box;
}

function field(f, obj, ctx, redraw) {
  const value = getPath(obj, f.k);
  const set = (v, structural = false) => {
    setPath(obj, f.k, v);
    ctx.onChange();
    if (structural) redraw();
  };
  const wrap = (control, extraClass = "") =>
    el("label", { class: `field ${extraClass}` },
      el("span", { class: "field-label" }, f.l),
      control,
      f.help ? el("small", { class: "field-help" }, f.help) : null);

  switch (f.t) {
    case "textarea":
      return wrap(el("textarea", { rows: f.rows || 3, placeholder: f.ph || "", oninput: (e) => set(e.target.value) }, value ?? ""));
    case "number":
      return wrap(el("input", { type: "number", min: f.min, max: f.max, value: value ?? "", oninput: (e) => set(e.target.value === "" ? "" : Number(e.target.value)) }));
    case "date":
      return wrap(el("input", { type: "date", value: value ?? "", oninput: (e) => set(e.target.value) }));
    case "url":
      return wrap(el("input", { type: "url", placeholder: f.ph || "https://", value: value ?? "", oninput: (e) => set(e.target.value.trim()) }));
    case "color":
      return wrap(colorInput(value || f.def || "#1E63E9", (v) => set(v)));
    case "bool": {
      const checked = value === undefined ? !!f.def : !!value;
      return el("label", { class: "field field-check" },
        el("input", { type: "checkbox", checked, onchange: (e) => set(e.target.checked, true) }),
        el("span", {}, f.l));
    }
    case "select": {
      const current = value ?? f.def ?? "";
      return wrap(el("select", { onchange: (e) => set(e.target.value, true) },
        f.options.map(([v, label]) => el("option", { value: v, selected: v === current }, label))));
    }
    case "action":
      return wrap(actionSelect(value, ctx.pages ? ctx.pages() : [], (v) => set(v)));
    case "icon":
      return wrap(iconButton(value || "star", (v) => set(v, true)));
    case "image":
      return wrap(imageInput(value, (v) => set(v, true)), "field-image");
    case "list":
      return listField(f, obj, ctx);
    default:
      return wrap(el("input", { type: "text", placeholder: f.ph || "", value: value ?? "", oninput: (e) => set(e.target.value) }));
  }
}

export function colorInput(value, onChange) {
  const text = el("input", { type: "text", value, maxlength: 7, class: "color-text" });
  const picker = el("input", { type: "color", value });
  picker.addEventListener("input", () => { text.value = picker.value.toUpperCase(); onChange(text.value); });
  text.addEventListener("input", () => {
    if (/^#[0-9a-fA-F]{6}$/.test(text.value)) { picker.value = text.value; onChange(text.value.toUpperCase()); }
  });
  return el("div", { class: "color-input" }, picker, text);
}

function actionSelect(value, pages, onChange) {
  const opts = [
    ["call", "Call the business"], ["whatsapp", "Open WhatsApp chat"], ["email", "Send an email"],
    ["map", "Get directions"], ["website", "Open website"],
    ...pages.map((p) => [p.id, `Go to page: ${p.title}`]),
  ];
  return el("select", { onchange: (e) => onChange(e.target.value) },
    opts.map(([v, l]) => el("option", { value: v, selected: v === (value || "call") }, l)));
}

export function iconButton(value, onChange) {
  const btn = el("button", { type: "button", class: "icon-pick" }, icon(value), el("span", {}, value));
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    openIconPicker(value, (v) => {
      fill(btn, icon(v), el("span", {}, v));
      onChange(v);
    });
  });
  return btn;
}

export function openIconPicker(current, onPick) {
  const grid = el("div", { class: "icon-grid" }, iconNames().map((n) =>
    el("button", { type: "button", class: n === current ? "on" : "", title: n, onclick: () => { onPick(n); m.close(); } }, icon(n), el("small", {}, n))));
  const m = modal({ title: "Choose an icon", body: grid, wide: true });
}

function imageInput(value, onChange) {
  const box = el("div", { class: "image-input" });
  const draw = (v) => {
    const file = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif", hidden: true });
    file.addEventListener("change", async () => {
      if (!file.files[0]) return;
      try {
        box.classList.add("busy");
        const res = await upload("/api/media", file.files[0]);
        onChange(res.url);
        draw(res.url);
      } catch (e) {
        toast(e.message, "error");
      } finally {
        box.classList.remove("busy");
      }
    });
    const url = el("input", { type: "url", placeholder: "or paste an image URL", value: v && !v.startsWith("/api/media/") ? v : "" });
    url.addEventListener("change", () => { onChange(url.value.trim()); draw(url.value.trim()); });
    fill(box, 
      v ? el("img", { src: v, alt: "" }) : el("div", { class: "image-ph" }, icon("image")),
      el("div", { class: "image-actions" },
        el("button", { type: "button", class: "btn btn-small", onclick: (e) => { e.preventDefault(); file.click(); } }, v ? "Replace" : "Upload"),
        v ? el("button", { type: "button", class: "btn btn-small btn-ghost", onclick: (e) => { e.preventDefault(); onChange(""); draw(""); } }, "Remove") : null,
        url),
      file);
  };
  draw(value || "");
  return box;
}

function listField(f, obj, ctx) {
  const box = el("div", { class: "field field-list" });
  const items = () => {
    let arr = getPath(obj, f.k);
    if (!Array.isArray(arr)) { arr = []; setPath(obj, f.k, arr); }
    return arr;
  };
  let open = -1;
  const draw = () => {
    const arr = items();
    fill(box, 
      el("div", { class: "list-head" }, el("span", { class: "field-label" }, `${f.l} (${arr.length})`)),
      ...arr.map((item, i) => {
        const titleText = () => (f.title && item[f.title]) || `${f.item} ${i + 1}`;
        const title = el("span", { class: "list-title" }, titleText());
        const move = (d) => (e) => {
          e.preventDefault(); e.stopPropagation();
          const j = i + d;
          if (j < 0 || j >= arr.length) return;
          [arr[i], arr[j]] = [arr[j], arr[i]];
          open = open === i ? j : open;
          ctx.onChange(); draw();
        };
        const details = el("details", { class: "list-item", open: open === i },
          el("summary", {},
            f.fields.some((sf) => sf.t === "image") && (item.image || item.photo) ? el("img", { class: "list-thumb", src: item.image || item.photo, alt: "" }) : null,
            title,
            el("span", { class: "list-tools" },
              el("button", { type: "button", class: "icon-btn sm", title: "Move up", onclick: move(-1) }, "↑"),
              el("button", { type: "button", class: "icon-btn sm", title: "Move down", onclick: move(1) }, "↓"),
              el("button", { type: "button", class: "icon-btn sm danger", title: "Delete", onclick: (e) => {
                e.preventDefault(); e.stopPropagation(); arr.splice(i, 1); open = -1; ctx.onChange(); draw();
              } }, "✕"))),
          renderFields(f.fields, item, { ...ctx, onChange: () => { title.textContent = titleText(); ctx.onChange(); } }));
        details.addEventListener("toggle", () => { if (details.open) open = i; else if (open === i) open = -1; });
        return details;
      }),
      el("button", { type: "button", class: "btn btn-small btn-outline", onclick: (e) => {
        e.preventDefault(); arr.push({}); open = arr.length - 1; ctx.onChange(); draw();
      } }, icon("plus"), `Add ${f.item.toLowerCase()}`));
  };
  draw();
  return box;
}
