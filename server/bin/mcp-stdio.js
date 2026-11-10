#!/usr/bin/env node
"use strict";

/*
 * APK Creator MCP stdio bridge.
 *
 * For MCP clients that launch a local command instead of connecting to an
 * HTTP endpoint (e.g. Claude Desktop). It forwards JSON-RPC messages between
 * stdin/stdout and the server's /mcp endpoint. No dependencies; Node.js 18+.
 *
 *   APK_CREATOR_URL=https://apps.example.com APK_CREATOR_API_KEY=apkc_... node mcp-stdio.js
 */
const readline = require("node:readline");

const base = (process.env.APK_CREATOR_URL || "http://localhost:8080").replace(/\/+$/, "");
const endpoint = base.endsWith("/mcp") ? base : `${base}/mcp`;
const apiKey = process.env.APK_CREATOR_API_KEY || "";

if (!apiKey) {
  process.stderr.write("APK_CREATOR_API_KEY is not set. Create a key in the APK Creator web app under AI & API.\n");
}

const send = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");
let pending = 0;
let closed = false;
const maybeExit = () => { if (closed && pending === 0) process.exit(0); };

async function forward(line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
  }
  const wantsReply = Array.isArray(msg) ? msg.some((m) => m && m.id !== undefined && m.method) : msg && msg.id !== undefined && msg.method;
  const fail = (message) => {
    process.stderr.write(`[apk-creator-mcp] ${message}\n`);
    if (wantsReply && !Array.isArray(msg)) send({ jsonrpc: "2.0", id: msg.id, error: { code: -32000, message } });
  };
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${apiKey}` },
      body: line,
    });
    if (res.status === 202 || res.status === 204) return;
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { return fail(`Unexpected response from ${endpoint} (HTTP ${res.status})`); }
    if (res.status === 401 && wantsReply && !Array.isArray(msg)) {
      return send({ jsonrpc: "2.0", id: msg.id, error: (data && data.error) || { code: -32001, message: "Unauthorized" } });
    }
    send(data);
  } catch (e) {
    fail(`Cannot reach ${endpoint}: ${e.message}`);
  }
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on("line", (line) => {
  if (!line.trim()) return;
  pending++;
  forward(line).finally(() => { pending--; maybeExit(); });
});
rl.on("close", () => { closed = true; maybeExit(); });
