"use strict";

/*
 * Model Context Protocol server (Streamable HTTP transport, stateless).
 *
 *   POST /mcp   JSON-RPC 2.0 request(s) -> application/json response
 *
 * It lets AI assistants (Claude Code, Claude Desktop, any MCP client) create
 * apps, write their source files, build them and read build errors. Every
 * request is authenticated with a personal API key (Authorization: Bearer
 * apkc_...) and acts as that user.
 *
 * The server keeps no session state and never initiates messages, so GET
 * (server-to-client stream) is answered with 405 as the specification allows.
 *
 * Every request must carry the API key in a header, which a web page cannot
 * make a browser attach, so cross-site and DNS-rebinding requests fail
 * authentication rather than relying on Origin checks.
 */
const express = require("express");
const { authenticate } = require("../http");
const { defineTools, ToolError } = require("./tools");
const { INSTRUCTIONS } = require("./guide");
const pkg = require("../../package.json");

const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

const rpcError = (id, code, message) => ({ jsonrpc: "2.0", id: id === undefined ? null : id, error: { code, message } });

/** Minimal JSON-Schema check of tool arguments: required keys, unknown keys and primitive types. */
function validateArgs(schema, args) {
  if (!args || typeof args !== "object" || Array.isArray(args)) return "arguments must be an object";
  for (const key of schema.required || []) {
    if (args[key] === undefined || args[key] === null || args[key] === "") return `missing required argument "${key}"`;
  }
  for (const [key, value] of Object.entries(args)) {
    const prop = schema.properties[key];
    if (!prop) return `unknown argument "${key}"`;
    const actual = Array.isArray(value) ? "array" : Number.isInteger(value) ? "integer" : typeof value;
    const ok = prop.type === actual || (prop.type === "number" && actual === "integer");
    if (!ok) return `argument "${key}" must be of type ${prop.type}`;
    if (prop.enum && !prop.enum.includes(value)) return `argument "${key}" must be one of: ${prop.enum.join(", ")}`;
  }
  return null;
}

function mcpRoutes(ctx) {
  const r = express.Router();
  const tools = defineTools(ctx);
  const byName = new Map(tools.map((t) => [t.name, t]));
  const auth = authenticate(ctx);

  /** Calls this server's REST API as the caller (same address the request arrived on). */
  function apiFor(req) {
    const host = req.socket.localAddress.includes(":") ? `[${req.socket.localAddress}]` : req.socket.localAddress;
    const base = `http://${host}:${req.socket.localPort}`;
    return async (method, path, body) => {
      const res = await fetch(base + path, {
        method,
        headers: { authorization: req.get("authorization"), ...(body !== undefined ? { "content-type": "application/json" } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new ToolError(data.error || `Request failed (${res.status})`);
      return data;
    };
  }

  async function callTool(req, params) {
    const tool = byName.get(params && params.name);
    if (!tool) return { error: { code: -32602, message: `Unknown tool: ${params && params.name}` } };
    const args = params.arguments || {};
    const invalid = validateArgs(tool.inputSchema, args);
    if (invalid) return { result: { content: [{ type: "text", text: `Invalid arguments for ${tool.name}: ${invalid}` }], isError: true } };
    try {
      const out = await tool.handler(args, apiFor(req));
      if (out.text !== undefined) return { result: { content: [{ type: "text", text: out.text }] } };
      return { result: { content: [{ type: "text", text: JSON.stringify(out.data, null, 2) }], structuredContent: out.data, isError: !!out.isError } };
    } catch (e) {
      if (!(e instanceof ToolError)) console.error("[mcp]", tool.name, e);
      // Tool failures are results (isError), so the model can read them and recover.
      return { result: { content: [{ type: "text", text: e instanceof ToolError ? e.message : "Internal error while running the tool" }], isError: true } };
    }
  }

  async function handle(req, msg) {
    if (!msg || typeof msg !== "object" || msg.jsonrpc !== "2.0") return rpcError(msg && msg.id, -32600, "Invalid JSON-RPC request");
    if (typeof msg.method !== "string") return null; // a response from the client: nothing to do
    const isNotification = msg.id === undefined;
    const reply = (result) => (isNotification ? null : { jsonrpc: "2.0", id: msg.id, result });

    switch (msg.method) {
      case "initialize": {
        const requested = msg.params && msg.params.protocolVersion;
        return reply({
          protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "apk-creator", title: ctx.config.brandName, version: pkg.version },
          instructions: INSTRUCTIONS,
        });
      }
      case "ping":
        return reply({});
      case "tools/list":
        return reply({ tools: tools.map(({ handler, ...t }) => t) });
      case "tools/call": {
        const out = await callTool(req, msg.params);
        if (isNotification) return null;
        return out.error ? { jsonrpc: "2.0", id: msg.id, error: out.error } : { jsonrpc: "2.0", id: msg.id, result: out.result };
      }
      default:
        if (isNotification || msg.method.startsWith("notifications/")) return null;
        return rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
    }
  }

  r.post("/", (req, res, next) => {
    auth(req, res, (err) => {
      if (!err) return next();
      res.set("WWW-Authenticate", 'Bearer realm="APK Creator MCP"');
      res.status(401).json(rpcError(null, -32001, "Unauthorized: send an API key as 'Authorization: Bearer apkc_...'. Create one in the web app under AI & API."));
    });
  }, async (req, res) => {
    const body = req.body;
    const batch = Array.isArray(body);
    const messages = batch ? body : [body];
    if (!messages.length) return res.status(400).json(rpcError(null, -32600, "Empty batch"));
    const responses = [];
    for (const msg of messages) {
      const out = await handle(req, msg);
      if (out) responses.push(out);
    }
    if (!responses.length) return res.status(202).end(); // only notifications / responses
    res.json(batch ? responses : responses[0]);
  });

  const notAllowed = (req, res) => res.set("Allow", "POST").status(405)
    .json(rpcError(null, -32000, "Method not allowed: this MCP server is stateless, use POST."));
  r.get("/", notAllowed);
  r.delete("/", notAllowed);

  return r;
}

module.exports = { mcpRoutes, PROTOCOL_VERSIONS, validateArgs };
