/*
 * APK Creator app runtime.
 *
 * Renders a complete business app from a single JSON configuration
 * (window.APP_CONFIG). The very same file runs:
 *   - inside the generated Android APK (WebView, config baked into config.js)
 *   - inside the builder's live preview (sandboxed iframe, config via postMessage)
 */
(function () {
  "use strict";

  var ICONS = window.ICONS || {};
  var root = document.getElementById("app");
  var cfg = null;
  var isNative = typeof window.ApkBridge !== "undefined";
  var isPreview = !isNative && window.parent !== window;
  var memoryStore = {};

  // ---------------------------------------------------------------- helpers

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /** Allow only harmless URL schemes in links and image sources. */
  function safeUrl(url, forImage) {
    var u = String(url || "").trim();
    if (!u) return "";
    if (/^(https?:|mailto:|tel:|sms:|geo:|whatsapp:|intent:)/i.test(u) && !forImage) return u;
    if (/^https?:/i.test(u)) return u;
    if (forImage && /^data:image\/(png|jpe?g|gif|webp|svg\+xml);/i.test(u)) return u;
    if (/^(\/|\.\/|media\/)[^:]*$/.test(u)) return u;
    return "";
  }

  function icon(name, cls) {
    var d = ICONS[name] || ICONS.star;
    return '<svg class="ico ' + (cls || "") + '" viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '"/></svg>';
  }

  /** Very small markdown subset: paragraphs, bullet lists, **bold**, *italic*, links. */
  function richText(text) {
    var blocks = String(text || "").replace(/\r/g, "").split(/\n{2,}/);
    return blocks.map(function (block) {
      var lines = block.split("\n");
      var isList = lines.every(function (l) { return /^\s*[-*•]\s+/.test(l); });
      var inline = function (s) {
        return esc(s)
          .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
          .replace(/(^|\s)\*(.+?)\*(?=\s|$)/g, "$1<em>$2</em>")
          .replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" data-external="1">$1</a>');
      };
      if (isList) {
        return "<ul>" + lines.map(function (l) { return "<li>" + inline(l.replace(/^\s*[-*•]\s+/, "")) + "</li>"; }).join("") + "</ul>";
      }
      return "<p>" + lines.map(inline).join("<br>") + "</p>";
    }).join("");
  }

  function store(key, value) {
    var k = "apkc:" + (cfg && cfg.appId ? cfg.appId : "app") + ":" + key;
    try {
      if (value === undefined) {
        var raw = window.localStorage.getItem(k);
        return raw ? JSON.parse(raw) : null;
      }
      window.localStorage.setItem(k, JSON.stringify(value));
    } catch (e) {
      // Sandboxed preview iframes have no localStorage.
      if (value === undefined) return memoryStore[k] || null;
      memoryStore[k] = value;
    }
    return value;
  }

  function digits(phone) { return String(phone || "").replace(/[^\d+]/g, ""); }
  function waNumber(phone) { return String(phone || "").replace(/\D/g, ""); }

  function hexToRgb(hex) {
    var h = String(hex || "").replace("#", "");
    if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join("");
    var n = parseInt(h, 16);
    if (isNaN(n) || h.length !== 6) return null;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function luminance(hex) {
    var c = hexToRgb(hex);
    return c ? (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255 : 0.5;
  }

  function contrastText(hex) {
    var c = hexToRgb(hex);
    if (!c) return "#ffffff";
    var lum = (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
    return lum > 0.62 ? "#111111" : "#ffffff";
  }

  function rgba(hex, alpha) {
    var c = hexToRgb(hex);
    return c ? "rgba(" + c.r + "," + c.g + "," + c.b + "," + alpha + ")" : hex;
  }

  function formatPrice(price) {
    if (price === "" || price == null) return "";
    var currency = (cfg.business && cfg.business.currency) || "";
    var n = Number(price);
    if (isNaN(n)) return esc(price);
    var str = n % 1 === 0 ? String(n) : n.toFixed(2);
    return esc(currency ? currency + " " + str : str);
  }

  function toast(msg) {
    if (isNative && window.ApkBridge.toast) { window.ApkBridge.toast(msg); return; }
    var t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add("show"); }, 10);
    setTimeout(function () { t.classList.remove("show"); setTimeout(function () { t.remove(); }, 300); }, 2400);
  }

  function openLink(url) {
    url = safeUrl(url);
    if (!url) return;
    if (isNative) { window.ApkBridge.openExternal(url); return; }
    if (/^whatsapp:/.test(url)) {
      var m = /phone=([^&]*)/.exec(url), t = /text=([^&]*)/.exec(url);
      url = "https://wa.me/" + (m ? m[1] : "") + (t ? "?text=" + t[1] : "");
    }
    if (isPreview) { toast("Opens: " + decodeURIComponent(url).slice(0, 80)); return; }
    window.open(url, "_blank");
  }

  function whatsappUrl(text) {
    var b = cfg.business || {};
    var num = waNumber(b.whatsapp || b.phone);
    return "whatsapp://send?phone=" + num + (text ? "&text=" + encodeURIComponent(text) : "");
  }

  function mapUrl() {
    var b = cfg.business || {};
    var q = b.mapQuery || b.address || b.name;
    return isNative ? "geo:0,0?q=" + encodeURIComponent(q) : "https://maps.google.com/?q=" + encodeURIComponent(q);
  }

  function runAction(action) {
    var b = cfg.business || {};
    if (!action) return;
    if (action === "call") return openLink("tel:" + digits(b.phone));
    if (action === "whatsapp") return openLink(whatsappUrl("Hello " + (b.name || "") + "!"));
    if (action === "email") return openLink("mailto:" + (b.email || ""));
    if (action === "map") return openLink(mapUrl());
    if (action === "website") return openLink(b.website);
    if (action.indexOf("url:") === 0) return openLink(action.slice(4));
    var target = findPage(action) || firstPageOfType(action);
    if (target) go("/p/" + target.id);
  }

  // ---------------------------------------------------------------- pages

  function pages() { return (cfg.pages || []).filter(function (p) { return p && !p.hidden; }); }
  function findPage(id) { return pages().filter(function (p) { return p.id === id; })[0]; }
  function firstPageOfType(type) { return pages().filter(function (p) { return p.type === type; })[0]; }

  function go(path) {
    if (location.hash !== "#" + path) location.hash = path;
    else render();
  }

  function sectionTitle(text) { return text ? '<h2 class="section-title">' + esc(text) + "</h2>" : ""; }

  function img(src, cls, alt) {
    var s = safeUrl(src, true);
    return s ? '<img class="' + (cls || "") + '" src="' + esc(s) + '" alt="' + esc(alt || "") + '" loading="lazy">' : "";
  }

  function quickActions() {
    var b = cfg.business || {};
    var out = [];
    if (b.phone) out.push(['call', 'phone', 'Call']);
    if (b.whatsapp) out.push(['whatsapp', 'whatsapp', 'WhatsApp']);
    if (b.address || b.mapQuery) out.push(['map', 'place', 'Directions']);
    if (b.email) out.push(['email', 'email', 'Email']);
    if (b.website) out.push(['website', 'web', 'Website']);
    if (!out.length) return "";
    return '<div class="quick-actions">' + out.slice(0, 4).map(function (a) {
      return '<button class="qa" data-action="' + a[0] + '">' + icon(a[1]) + "<span>" + a[2] + "</span></button>";
    }).join("") + "</div>";
  }

  var renderers = {
    home: function (p) {
      var b = cfg.business || {};
      var heroImg = safeUrl(p.heroImage, true);
      var html = '<section class="hero' + (heroImg ? " has-img" : "") + '"' +
        (heroImg ? ' style="background-image:linear-gradient(180deg,rgba(0,0,0,.15),rgba(0,0,0,.65)),url(&quot;' + esc(heroImg) + '&quot;)"' : "") + ">" +
        (b.logo ? img(b.logo, "hero-logo", b.name) : "") +
        "<h1>" + esc(p.heroTitle || b.name || cfg.appName) + "</h1>" +
        (p.heroSubtitle || b.tagline ? "<p>" + esc(p.heroSubtitle || b.tagline) + "</p>" : "") +
        (p.ctaLabel ? '<button class="btn btn-hero" data-action="' + esc(p.ctaAction || "call") + '">' + esc(p.ctaLabel) + "</button>" : "") +
        "</section>";
      if (p.showQuickActions !== false) html += quickActions();
      if (p.intro) html += '<div class="card prose">' + richText(p.intro) + "</div>";
      if (p.highlights && p.highlights.length) {
        html += sectionTitle(p.highlightsTitle || "Why choose us") + '<div class="highlights">' +
          p.highlights.map(function (h) {
            return '<div class="highlight">' + '<div class="hl-ico">' + icon(h.icon || "check") + "</div>" +
              "<div><h3>" + esc(h.title) + "</h3><p>" + esc(h.text) + "</p></div></div>";
          }).join("") + "</div>";
      }
      var shortcuts = pages().filter(function (x) { return x.id !== p.id; }).slice(0, 6);
      if (p.showShortcuts !== false && shortcuts.length) {
        html += sectionTitle(p.shortcutsTitle || "Explore") + '<div class="shortcuts">' + shortcuts.map(function (x) {
          return '<a class="shortcut" href="#/p/' + esc(x.id) + '">' + icon(x.icon || "star") + "<span>" + esc(x.title) + "</span></a>";
        }).join("") + "</div>";
      }
      return html;
    },

    about: function (p) {
      var html = p.image ? img(p.image, "banner", p.title) : "";
      html += '<div class="card prose">' + richText(p.content || (cfg.business || {}).description) + "</div>";
      if (p.stats && p.stats.length) {
        html += '<div class="stats">' + p.stats.map(function (s) {
          return '<div class="stat"><strong>' + esc(s.value) + "</strong><span>" + esc(s.label) + "</span></div>";
        }).join("") + "</div>";
      }
      return html;
    },

    text: function (p) {
      return (p.image ? img(p.image, "banner", p.title) : "") + '<div class="card prose">' + richText(p.content) + "</div>";
    },

    catalog: function (p, sub) {
      var items = p.items || [];
      if (sub != null && items[sub]) return catalogDetail(p, items[sub], sub);
      var cats = [];
      items.forEach(function (it) { if (it.category && cats.indexOf(it.category) < 0) cats.push(it.category); });
      var active = store("cat:" + p.id) || "";
      if (cats.indexOf(active) < 0) active = "";
      var html = p.intro ? '<p class="intro">' + esc(p.intro) + "</p>" : "";
      if (cats.length > 1) {
        html += '<div class="chips">' + ['<button class="chip' + (active ? "" : " on") + '" data-cat="" data-page="' + esc(p.id) + '">All</button>']
          .concat(cats.map(function (c) {
            return '<button class="chip' + (active === c ? " on" : "") + '" data-cat="' + esc(c) + '" data-page="' + esc(p.id) + '">' + esc(c) + "</button>";
          })).join("") + "</div>";
      }
      var grid = p.layout === "grid";
      html += '<div class="' + (grid ? "grid" : "list") + '">';
      items.forEach(function (it, i) {
        if (active && it.category !== active) return;
        html += '<a class="item' + (grid ? " tile" : "") + '" href="#/p/' + esc(p.id) + "/" + i + '">' +
          (it.image ? img(it.image, "thumb", it.name) : '<div class="thumb ph">' + icon(p.icon || "tag") + "</div>") +
          '<div class="item-body"><div class="item-head"><h3>' + esc(it.name) + "</h3>" +
          (it.badge ? '<span class="badge">' + esc(it.badge) + "</span>" : "") + "</div>" +
          (it.description ? "<p>" + esc(it.description) + "</p>" : "") +
          (p.showPrices !== false && it.price !== "" && it.price != null ? '<div class="price">' + formatPrice(it.price) + "</div>" : "") +
          "</div>" +
          (p.enableOrders ? '<button class="add" data-add="' + i + '" data-page="' + esc(p.id) + '" aria-label="Add">' + icon("plus") + "</button>" : "") +
          "</a>";
      });
      html += "</div>";
      return html;
    },

    gallery: function (p) {
      var imgs = (p.images || []).filter(function (i) { return safeUrl(i.image, true); });
      if (!imgs.length) return empty("image", "Photos will appear here.");
      return (p.intro ? '<p class="intro">' + esc(p.intro) + "</p>" : "") + '<div class="gallery">' + imgs.map(function (g, i) {
        return '<figure data-zoom="' + i + '" data-page="' + esc(p.id) + '">' + img(g.image, "", g.caption) +
          (g.caption ? "<figcaption>" + esc(g.caption) + "</figcaption>" : "") + "</figure>";
      }).join("") + "</div>";
    },

    team: function (p) {
      return (p.intro ? '<p class="intro">' + esc(p.intro) + "</p>" : "") + '<div class="list">' + (p.members || []).map(function (m) {
        return '<div class="item person">' + (m.photo ? img(m.photo, "avatar", m.name) :
          '<div class="avatar ph">' + esc((m.name || "?").charAt(0)) + "</div>") +
          '<div class="item-body"><h3>' + esc(m.name) + "</h3>" + (m.role ? '<div class="role">' + esc(m.role) + "</div>" : "") +
          (m.bio ? "<p>" + esc(m.bio) + "</p>" : "") + "</div></div>";
      }).join("") + "</div>";
    },

    testimonials: function (p) {
      return '<div class="list">' + (p.items || []).map(function (t) {
        var r = Math.max(0, Math.min(5, parseInt(t.rating, 10) || 5));
        return '<div class="card quote"><div class="stars">' + new Array(r + 1).join(icon("star")) + "</div>" +
          "<p>&ldquo;" + esc(t.text) + "&rdquo;</p><strong>" + esc(t.name) + "</strong></div>";
      }).join("") + "</div>";
    },

    faq: function (p) {
      return '<div class="faq">' + (p.items || []).map(function (f) {
        return "<details><summary>" + esc(f.question) + icon("chevron", "chev") + '</summary><div class="prose">' + richText(f.answer) + "</div></details>";
      }).join("") + "</div>";
    },

    offers: function (p) {
      var items = p.items || [];
      if (!items.length) return empty("offer", "No offers right now. Check back soon!");
      return '<div class="list">' + items.map(function (o) {
        return '<div class="card offer">' + (o.image ? img(o.image, "banner", o.title) : "") +
          '<div class="offer-body"><h3>' + esc(o.title) + "</h3><p>" + esc(o.description) + "</p>" +
          '<div class="offer-meta">' + (o.code ? '<span class="code">' + esc(o.code) + "</span>" : "") +
          (o.validUntil ? "<span>Valid until " + esc(o.validUntil) + "</span>" : "") + "</div></div></div>";
      }).join("") + "</div>";
    },

    events: function (p) {
      var items = p.items || [];
      if (!items.length) return empty("event", "No upcoming events.");
      return '<div class="list">' + items.map(function (e) {
        var d = String(e.date || "");
        var parts = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
        var months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
        var dateBox = parts ? '<div class="datebox"><strong>' + parts[3] + "</strong><span>" + months[parseInt(parts[2], 10) - 1] + "</span></div>" :
          '<div class="datebox">' + icon("event") + "</div>";
        return '<div class="item event">' + dateBox + '<div class="item-body"><h3>' + esc(e.title) + "</h3>" +
          '<div class="role">' + esc([e.time, e.location].filter(Boolean).join(" · ")) + "</div>" +
          (e.description ? "<p>" + esc(e.description) + "</p>" : "") + "</div></div>";
      }).join("") + "</div>";
    },

    pricing: function (p) {
      return (p.intro ? '<p class="intro">' + esc(p.intro) + "</p>" : "") + '<div class="list">' + (p.items || []).map(function (plan) {
        var feats = String(plan.features || "").split("\n").filter(function (f) { return f.trim(); });
        return '<div class="card plan' + (plan.highlighted ? " featured" : "") + '">' +
          (plan.highlighted ? '<span class="badge">Popular</span>' : "") +
          "<h3>" + esc(plan.name) + '</h3><div class="plan-price">' + formatPrice(plan.price) +
          (plan.period ? "<small>/" + esc(plan.period) + "</small>" : "") + "</div>" +
          "<ul>" + feats.map(function (f) { return "<li>" + icon("check") + esc(f) + "</li>"; }).join("") + "</ul>" +
          '<button class="btn" data-enquire="' + esc(plan.name) + '">' + esc(p.buttonLabel || "Enquire") + "</button></div>";
      }).join("") + "</div>";
    },

    links: function (p) {
      return '<div class="card menu-list">' + (p.items || []).map(function (l) {
        return '<a href="#" data-link="' + esc(safeUrl(l.url)) + '">' + icon(l.icon || "link") + "<span>" + esc(l.label) + "</span>" + icon("chevron", "chev") + "</a>";
      }).join("") + "</div>";
    },

    contact: function (p) {
      var b = cfg.business || {};
      var rows = [];
      if (b.phone) rows.push(["call", "phone", "Phone", b.phone]);
      if (b.whatsapp) rows.push(["whatsapp", "whatsapp", "WhatsApp", b.whatsapp]);
      if (b.email) rows.push(["email", "email", "Email", b.email]);
      if (b.address) rows.push(["map", "place", "Address", b.address]);
      if (b.website) rows.push(["website", "web", "Website", b.website.replace(/^https?:\/\//, "")]);
      var html = p.intro ? '<p class="intro">' + esc(p.intro) + "</p>" : "";
      html += '<div class="card menu-list">' + rows.map(function (r) {
        return '<a href="#" data-action="' + r[0] + '">' + icon(r[1]) + '<span><small>' + r[2] + "</small>" + esc(r[3]) + "</span>" + icon("chevron", "chev") + "</a>";
      }).join("") + "</div>";
      if (p.showHours !== false && b.hours && b.hours.length) {
        html += sectionTitle("Opening hours") + '<div class="card hours">' + b.hours.map(function (h) {
          return "<div><span>" + esc(h.label) + "</span><strong>" + esc(h.value) + "</strong></div>";
        }).join("") + "</div>";
      }
      var social = b.social || {};
      var socialKeys = Object.keys(social).filter(function (k) { return safeUrl(social[k]); });
      if (socialKeys.length) {
        html += sectionTitle("Follow us") + '<div class="social">' + socialKeys.map(function (k) {
          return '<button class="chip" data-link="' + esc(social[k]) + '">' + esc(k.charAt(0).toUpperCase() + k.slice(1)) + "</button>";
        }).join("") + "</div>";
      }
      if (p.showForm !== false) {
        html += sectionTitle(p.formTitle || "Send us a message") + form("contact", [
          { name: "name", label: "Your name", required: true },
          { name: "phone", label: "Phone", type: "tel", required: true },
          { name: "message", label: "Message", type: "textarea", required: true }
        ], p.submitVia, p.buttonLabel || "Send message");
      }
      return html;
    },

    booking: function (p) {
      var services = String(p.services || "").split(/\n|,/).map(function (s) { return s.trim(); }).filter(Boolean);
      var fields = [
        { name: "name", label: "Full name", required: true },
        { name: "phone", label: "Phone", type: "tel", required: true }
      ];
      if (services.length) fields.push({ name: "service", label: p.serviceLabel || "Service", type: "select", options: services, required: true });
      if (p.askDate !== false) fields.push({ name: "date", label: "Preferred date", type: "date", required: true });
      if (p.askTime !== false) fields.push({ name: "time", label: "Preferred time", type: "time" });
      if (p.askGuests) fields.push({ name: "guests", label: "Number of people", type: "number" });
      fields.push({ name: "notes", label: "Notes", type: "textarea" });
      return (p.intro ? '<p class="intro">' + esc(p.intro) + "</p>" : "") + form("booking", fields, p.submitVia, p.buttonLabel || "Request booking");
    },

    web: function (p) {
      var url = safeUrl(p.url);
      if (!url) return empty("web", "Add a website address for this page.");
      return '<div class="web-wrap"><iframe src="' + esc(url) + '" title="' + esc(p.title) + '"></iframe>' +
        (isPreview ? '<div class="web-note">Preview of ' + esc(url) + " — some sites block previews, but they open normally in the app.</div>" : "") + "</div>";
    }
  };

  function empty(ic, text) {
    return '<div class="empty">' + icon(ic) + "<p>" + esc(text) + "</p></div>";
  }

  function form(kind, fields, via, label) {
    return '<form class="card form" data-form="' + kind + '" data-via="' + esc(via || "whatsapp") + '">' + fields.map(function (f) {
      var req = f.required ? " required" : "";
      var input;
      if (f.type === "textarea") input = '<textarea name="' + f.name + '" rows="3"' + req + "></textarea>";
      else if (f.type === "select") input = '<select name="' + f.name + '"' + req + '><option value="">Choose…</option>' +
        f.options.map(function (o) { return "<option>" + esc(o) + "</option>"; }).join("") + "</select>";
      else input = '<input name="' + f.name + '" type="' + (f.type || "text") + '"' + req + ">";
      return "<label><span>" + esc(f.label) + "</span>" + input + "</label>";
    }).join("") + '<button class="btn btn-block" type="submit">' + icon("send") + esc(label) + "</button></form>";
  }

  function catalogDetail(p, it, i) {
    var html = it.image ? img(it.image, "banner", it.name) : "";
    html += '<div class="card detail"><div class="item-head"><h2>' + esc(it.name) + "</h2>" +
      (it.badge ? '<span class="badge">' + esc(it.badge) + "</span>" : "") + "</div>" +
      (p.showPrices !== false && it.price !== "" && it.price != null ? '<div class="price big">' + formatPrice(it.price) + "</div>" : "") +
      (it.category ? '<div class="role">' + esc(it.category) + "</div>" : "") +
      '<div class="prose">' + richText(it.details || it.description) + "</div>";
    if (p.enableOrders) {
      html += '<button class="btn btn-block" data-add="' + i + '" data-page="' + esc(p.id) + '">' + icon("cart") + "Add to order</button>";
    } else {
      html += '<button class="btn btn-block" data-enquire="' + esc(it.name) + '">' + icon("chat") + esc(p.enquireLabel || "Enquire now") + "</button>";
    }
    return html + "</div>";
  }

  // ---------------------------------------------------------------- cart

  function cart() { return store("cart") || []; }
  function saveCart(c) { store("cart", c); updateCartBadge(); }
  function cartCount() { return cart().reduce(function (n, l) { return n + l.qty; }, 0); }

  function addToCart(pageId, index) {
    var p = findPage(pageId);
    if (!p || !p.items || !p.items[index]) return;
    var it = p.items[index];
    var c = cart();
    var key = pageId + ":" + index;
    var line = c.filter(function (l) { return l.key === key; })[0];
    if (line) line.qty += 1;
    else c.push({ key: key, page: pageId, name: it.name, price: Number(it.price) || 0, qty: 1 });
    saveCart(c);
    toast(it.name + " added");
  }

  function updateCartBadge() {
    var el = document.querySelector(".cart-count");
    if (!el) return;
    var n = cartCount();
    el.textContent = n;
    el.style.display = n ? "" : "none";
  }

  function orderPage() {
    return pages().filter(function (p) { return p.type === "catalog" && p.enableOrders; })[0];
  }

  function renderCart() {
    var c = cart();
    if (!c.length) return empty("cart", "Your order is empty.");
    var total = 0;
    var html = '<div class="card cart">' + c.map(function (l, i) {
      total += l.price * l.qty;
      return '<div class="cart-line"><div><strong>' + esc(l.name) + "</strong><small>" + formatPrice(l.price) + "</small></div>" +
        '<div class="qty"><button data-qty="' + i + '" data-d="-1">' + icon("minus") + "</button><span>" + l.qty +
        '</span><button data-qty="' + i + '" data-d="1">' + icon("plus") + "</button></div></div>";
    }).join("") + '<div class="cart-total"><span>Total</span><strong>' + formatPrice(total) + "</strong></div></div>";
    var op = orderPage();
    html += sectionTitle("Your details") + form("order", [
      { name: "name", label: "Name", required: true },
      { name: "phone", label: "Phone", type: "tel", required: true },
      { name: "address", label: "Delivery address / table", type: "textarea" },
      { name: "notes", label: "Notes", type: "textarea" }
    ], op ? op.orderVia : "whatsapp", "Place order");
    return html;
  }

  // ---------------------------------------------------------------- forms

  function submitForm(formEl) {
    var data = {};
    Array.prototype.forEach.call(formEl.elements, function (el) {
      if (el.name) data[el.name] = el.value.trim();
    });
    var kind = formEl.getAttribute("data-form");
    var via = formEl.getAttribute("data-via") || "whatsapp";
    var b = cfg.business || {};
    var lines = [];
    var title = kind === "booking" ? "New booking request" : kind === "order" ? "New order" : "New message";
    lines.push("*" + title + "* — " + (b.name || cfg.appName));
    Object.keys(data).forEach(function (k) { if (data[k]) lines.push(k.charAt(0).toUpperCase() + k.slice(1) + ": " + data[k]); });
    if (kind === "order") {
      var total = 0;
      lines.push("", "Items:");
      cart().forEach(function (l) { total += l.price * l.qty; lines.push("• " + l.qty + " × " + l.name); });
      lines.push("Total: " + (b.currency ? b.currency + " " : "") + total.toFixed(2));
      data.items = cart();
      data.total = total;
    }
    var text = lines.join("\n");

    var done = function () {
      if (kind === "order") saveCart([]);
      formEl.reset();
      root.querySelector(".content").innerHTML = '<div class="empty success">' + icon("check") +
        "<h2>Thank you!</h2><p>" + esc(kind === "order" ? "Your order has been sent." : "We'll get back to you shortly.") + "</p>" +
        '<a class="btn" href="#/">Back to home</a></div>';
    };

    if (via === "server" && cfg.leadsEndpoint) {
      var btn = formEl.querySelector("button[type=submit]");
      if (btn) btn.disabled = true;
      fetch(cfg.leadsEndpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: JSON.stringify({ kind: kind, data: data })
      }).then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        done();
      }).catch(function () {
        if (btn) btn.disabled = false;
        toast("Couldn't send. Opening WhatsApp instead…");
        openLink(whatsappUrl(text));
      });
      return;
    }
    if (via === "email" && b.email) {
      openLink("mailto:" + b.email + "?subject=" + encodeURIComponent(title) + "&body=" + encodeURIComponent(text.replace(/\*/g, "")));
    } else {
      openLink(whatsappUrl(text));
    }
    done();
  }

  // ---------------------------------------------------------------- shell

  function applyTheme() {
    var t = cfg.theme || {};
    var primary = t.primary || "#1e63e9";
    var dark = !!t.dark;
    var bg = t.background || (dark ? "#101114" : "#f5f6f8");
    var surface = t.surface || (dark ? "#1b1d22" : "#ffffff");
    var text = t.text || (dark ? "#eceef2" : "#1d2129");
    var fonts = {
      system: 'system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif',
      serif: 'Georgia,"Times New Roman",serif',
      rounded: '"Nunito","Varela Round","SF Pro Rounded",system-ui,sans-serif',
      mono: '"SFMono-Regular",Menlo,Consolas,monospace',
      condensed: '"Roboto Condensed","Arial Narrow",system-ui,sans-serif'
    };
    var radius = t.corners === "square" ? "4px" : t.corners === "pill" ? "22px" : "14px";
    var s = document.documentElement.style;
    // "accent" is the brand colour used for text, icons and buttons on surfaces.
    // On dark themes a very dark brand colour would vanish, so fall back to the
    // secondary colour (or white) to keep everything readable.
    var accent = primary;
    if (dark && luminance(primary) < 0.35) accent = luminance(t.secondary) >= 0.35 ? t.secondary : "#e8eaf0";
    if (!dark && luminance(primary) > 0.8) accent = luminance(t.secondary) <= 0.6 ? t.secondary : "#1d2129";
    s.setProperty("--primary", primary);
    s.setProperty("--on-primary", contrastText(primary));
    s.setProperty("--accent", accent);
    s.setProperty("--on-accent", contrastText(accent));
    s.setProperty("--primary-soft", rgba(accent, dark ? 0.2 : 0.12));
    s.setProperty("--secondary", t.secondary || primary);
    s.setProperty("--on-secondary", contrastText(t.secondary || primary));
    s.setProperty("--bg", bg);
    s.setProperty("--surface", surface);
    s.setProperty("--text", text);
    s.setProperty("--muted", rgba(text.length === 7 ? text : "#1d2129", 0.62));
    s.setProperty("--line", rgba(text.length === 7 ? text : "#1d2129", 0.1));
    s.setProperty("--radius", radius);
    s.setProperty("--font", fonts[t.font] || fonts.system);
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.classList.toggle("header-light", t.headerStyle === "light");
    document.title = cfg.appName || "App";
    if (isNative && window.ApkBridge.setStatusBarColor) {
      window.ApkBridge.setStatusBarColor(t.headerStyle === "light" ? surface : primary);
    }
  }

  function navItems() {
    var list = pages();
    if (cfg.navigation === "drawer") return list;
    return list.length > 5 ? list.slice(0, 4).concat([{ id: "__more", title: "More", icon: "menu" }]) : list;
  }

  function parseRoute() {
    var h = location.hash.replace(/^#/, "") || "/";
    var m;
    if (h === "/cart") return { cart: true };
    if (h === "/more") return { more: true };
    if ((m = /^\/p\/([^/]+)(?:\/(\d+))?$/.exec(h))) return { page: decodeURIComponent(m[1]), sub: m[2] != null ? parseInt(m[2], 10) : null };
    return { page: (pages()[0] || {}).id };
  }

  function render() {
    if (!cfg) return;
    if (cfg.mode === "website" && cfg.website && safeUrl(cfg.website.url)) {
      var url = safeUrl(cfg.website.url);
      if (isNative) { location.replace(url); return; }
      root.innerHTML = '<div class="web-wrap full"><iframe src="' + esc(url) + '"></iframe>' +
        '<div class="web-note">Website app preview of ' + esc(url) + ". If it looks blank, the site blocks embedding — the Android app will still load it.</div></div>";
      return;
    }
    var route = parseRoute();
    var page = route.page ? findPage(route.page) : null;
    var title, body, back = false, activeId = page ? page.id : null;

    if (route.cart) { title = "Your order"; body = renderCart(); back = true; }
    else if (route.more) { title = "More"; body = moreMenu(); activeId = "__more"; }
    else if (!page) { title = cfg.appName; body = empty("info", "Add a page to get started."); }
    else {
      title = page.type === "home" ? (cfg.business && cfg.business.name) || cfg.appName : page.title;
      var r = renderers[page.type] || renderers.text;
      body = r(page, route.sub);
      if (route.sub != null) back = true;
      if (pages().indexOf(page) >= 4 && cfg.navigation !== "drawer" && pages().length > 5) activeId = "__more";
    }

    var hasCart = !!orderPage();
    var drawer = cfg.navigation === "drawer";
    var nav = navItems();
    var fab = (cfg.features || {}).floatingButton;
    var b = cfg.business || {};

    root.className = "app" + (drawer ? " nav-drawer" : " nav-bottom");
    root.innerHTML =
      '<header class="appbar">' +
      (back ? '<button class="icon-btn" data-back="1" aria-label="Back">' + icon("back") + "</button>" :
        drawer ? '<button class="icon-btn" data-drawer="open" aria-label="Menu">' + icon("menu") + "</button>" : "") +
      '<div class="appbar-title">' + esc(title) + "</div>" +
      (hasCart ? '<button class="icon-btn cart-btn" data-go="/cart" aria-label="Order">' + icon("cart") + '<span class="cart-count"></span></button>' : "") +
      "</header>" +
      '<main class="content page-' + esc(page ? page.type : "x") + '">' + body + '<div class="footer-space"></div></main>' +
      (drawer ? drawerHtml(activeId) :
        nav.length > 1 ? '<nav class="bottom-nav">' + nav.map(function (p) {
          var href = p.id === "__more" ? "#/more" : "#/p/" + esc(p.id);
          return '<a href="' + href + '" class="' + (p.id === activeId ? "on" : "") + '">' + icon(p.icon || "star") + "<span>" + esc(p.title) + "</span></a>";
        }).join("") + "</nav>" : "") +
      (fab === "whatsapp" && (b.whatsapp || b.phone) ? '<button class="fab" data-action="whatsapp" aria-label="WhatsApp">' + icon("whatsapp") + "</button>" :
        fab === "call" && b.phone ? '<button class="fab" data-action="call" aria-label="Call">' + icon("phone") + "</button>" : "");
    updateCartBadge();
    window.scrollTo(0, 0);
  }

  function moreMenu() {
    var rest = pages().slice(4);
    return '<div class="card menu-list">' + rest.map(function (p) {
      return '<a href="#/p/' + esc(p.id) + '">' + icon(p.icon || "star") + "<span>" + esc(p.title) + "</span>" + icon("chevron", "chev") + "</a>";
    }).join("") + '<a href="#" data-share="1">' + icon("share") + "<span>Share this app</span>" + icon("chevron", "chev") + "</a></div>";
  }

  function drawerHtml(activeId) {
    var b = cfg.business || {};
    return '<div class="drawer-scrim" data-drawer="close"></div><aside class="drawer">' +
      '<div class="drawer-head">' + (b.logo ? img(b.logo, "drawer-logo", b.name) : '<div class="drawer-logo ph">' + esc((b.name || cfg.appName || "A").charAt(0)) + "</div>") +
      "<strong>" + esc(b.name || cfg.appName) + "</strong>" + (b.tagline ? "<small>" + esc(b.tagline) + "</small>" : "") + "</div>" +
      pages().map(function (p) {
        return '<a href="#/p/' + esc(p.id) + '" class="' + (p.id === activeId ? "on" : "") + '">' + icon(p.icon || "star") + "<span>" + esc(p.title) + "</span></a>";
      }).join("") +
      '<a href="#" data-share="1">' + icon("share") + "<span>Share this app</span></a></aside>";
  }

  function share() {
    var b = cfg.business || {};
    var text = (cfg.features && cfg.features.shareText) || ("Check out " + (b.name || cfg.appName) + (b.website ? " " + b.website : ""));
    if (isNative && window.ApkBridge.share) window.ApkBridge.share(cfg.appName || "", text);
    else if (navigator.share && !isPreview) navigator.share({ title: cfg.appName, text: text }).catch(function () {});
    else toast("Share: " + text);
  }

  function lightbox(pageId, index) {
    var p = findPage(pageId);
    if (!p) return;
    var g = (p.images || []).filter(function (i) { return safeUrl(i.image, true); })[index];
    if (!g) return;
    var box = document.createElement("div");
    box.className = "lightbox";
    box.innerHTML = img(g.image, "", g.caption) + (g.caption ? "<p>" + esc(g.caption) + "</p>" : "") +
      '<button class="icon-btn" aria-label="Close">' + icon("close") + "</button>";
    box.addEventListener("click", function () { box.remove(); });
    document.body.appendChild(box);
  }

  // ---------------------------------------------------------------- events

  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-action],[data-go],[data-back],[data-drawer],[data-add],[data-qty],[data-cat],[data-link],[data-share],[data-enquire],[data-zoom],a[data-external]");
    if (!el) return;
    if (el.hasAttribute("data-add")) {
      e.preventDefault(); e.stopPropagation();
      addToCart(el.getAttribute("data-page"), parseInt(el.getAttribute("data-add"), 10));
    } else if (el.hasAttribute("data-action")) {
      e.preventDefault(); runAction(el.getAttribute("data-action"));
    } else if (el.hasAttribute("data-go")) {
      e.preventDefault(); go(el.getAttribute("data-go"));
    } else if (el.hasAttribute("data-back")) {
      e.preventDefault(); history.back();
    } else if (el.hasAttribute("data-drawer")) {
      e.preventDefault(); root.classList.toggle("drawer-open", el.getAttribute("data-drawer") === "open");
    } else if (el.hasAttribute("data-qty")) {
      e.preventDefault();
      var c = cart(), i = parseInt(el.getAttribute("data-qty"), 10);
      c[i].qty += parseInt(el.getAttribute("data-d"), 10);
      if (c[i].qty <= 0) c.splice(i, 1);
      saveCart(c); render();
    } else if (el.hasAttribute("data-cat")) {
      e.preventDefault(); store("cat:" + el.getAttribute("data-page"), el.getAttribute("data-cat")); render();
    } else if (el.hasAttribute("data-link")) {
      e.preventDefault(); openLink(el.getAttribute("data-link"));
    } else if (el.hasAttribute("data-share")) {
      e.preventDefault(); share();
    } else if (el.hasAttribute("data-enquire")) {
      e.preventDefault();
      openLink(whatsappUrl("Hi! I'm interested in: " + el.getAttribute("data-enquire")));
    } else if (el.hasAttribute("data-zoom")) {
      lightbox(el.getAttribute("data-page"), parseInt(el.getAttribute("data-zoom"), 10));
    } else if (el.hasAttribute("data-external")) {
      e.preventDefault(); openLink(el.getAttribute("href"));
    }
  });

  document.addEventListener("submit", function (e) {
    if (e.target.matches("form[data-form]")) { e.preventDefault(); submitForm(e.target); }
  });

  window.addEventListener("hashchange", function () { root.classList.remove("drawer-open"); render(); });

  // Live preview protocol with the builder UI.
  window.addEventListener("message", function (e) {
    var msg = e.data || {};
    if (msg.type === "apkc:config" && msg.config) {
      cfg = msg.config;
      applyTheme();
      if (msg.pageId && findPage(msg.pageId)) {
        var target = "/p/" + msg.pageId;
        if (location.hash !== "#" + target) { location.hash = target; return; }
      }
      render();
    }
  });

  function boot() {
    if (window.APP_CONFIG) {
      cfg = window.APP_CONFIG;
      applyTheme();
      render();
    } else if (isPreview) {
      window.parent.postMessage({ type: "apkc:ready" }, "*");
    } else {
      root.innerHTML = '<div class="empty">' + icon("info") + "<p>No app configuration found.</p></div>";
    }
  }

  boot();
})();
