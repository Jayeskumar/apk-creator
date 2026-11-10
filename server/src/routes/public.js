"use strict";

/*
 * Endpoints called by the generated Android apps themselves (no login):
 * contact forms, bookings and orders are captured as "leads" that the app
 * owner sees in the dashboard.
 */
const express = require("express");
const security = require("../security");
const { bad, notFound, HttpError, h } = require("../http");

const hits = new Map();
function rateLimited(key, limit = 30, windowMs = 10 * 60000) {
  const now = Date.now();
  const e = hits.get(key) || { n: 0, reset: now + windowMs };
  if (now > e.reset) Object.assign(e, { n: 0, reset: now + windowMs });
  e.n++;
  hits.set(key, e);
  if (hits.size > 50000) hits.clear();
  return e.n > limit;
}

function cleanLead(input) {
  const out = {};
  if (!input || typeof input !== "object") return out;
  for (const [k, v] of Object.entries(input).slice(0, 30)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(k)) continue;
    if (typeof v === "string") out[k] = v.slice(0, 4000);
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (k === "items" && Array.isArray(v)) {
      out.items = v.slice(0, 100).map((i) => ({
        name: String((i && i.name) || "").slice(0, 200),
        qty: Math.max(0, Math.min(999, parseInt(i && i.qty, 10) || 0)),
        price: Number(i && i.price) || 0,
      }));
    }
  }
  return out;
}

module.exports = function publicRoutes(ctx) {
  const r = express.Router();

  r.use((req, res, next) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  // Apps post with text/plain to avoid CORS preflights from file:// origins.
  r.post("/leads/:appId", express.text({ type: ["text/plain", "application/json"], limit: "64kb" }), h(async (req, res) => {
    if (rateLimited(`${req.ip}|${req.params.appId}`)) throw new HttpError(429, "Too many submissions");
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { throw bad("Invalid JSON"); }
    }
    const app = await ctx.db.get("SELECT id FROM apps WHERE id = ?", [req.params.appId]);
    if (!app) throw notFound("App not found");
    const kind = ["contact", "booking", "order"].includes(body && body.kind) ? body.kind : "contact";
    const data = cleanLead(body && body.data);
    if (!Object.keys(data).length) throw bad("Empty submission");
    await ctx.db.run("INSERT INTO leads (id, app_id, kind, data, is_read, created_at) VALUES (?, ?, ?, ?, 0, ?)",
      [security.id(), app.id, kind, JSON.stringify(data), security.now()]);
    res.status(201).json({ ok: true });
  }));

  return r;
};
