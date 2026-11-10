"use strict";

/* API + web UI server. Also runs the build worker when EMBEDDED_WORKER=true. */
const { createServices } = require("./services");
const { createApp } = require("./app");
const { BuildWorker } = require("./builder/worker");
const { ensureAdmin } = require("./bootstrap");

async function main() {
  const ctx = await createServices();
  await ensureAdmin(ctx);
  if (ctx.config.worker.embedded) {
    ctx.worker = new BuildWorker(ctx);
    ctx.worker.start();
  }
  const app = createApp(ctx);
  const server = app.listen(ctx.config.port, ctx.config.host, () => {
    console.log(`[server] ${ctx.config.brandName} (${ctx.config.mode}) listening on ${ctx.config.host}:${ctx.config.port}`);
    console.log(`[server] public URL ${ctx.config.publicUrl} · db=${ctx.db.driver} · storage=${ctx.storage.driver} · worker=${ctx.worker ? "embedded" : "external"}`);
  });

  const shutdown = async (sig) => {
    console.log(`[server] ${sig} received, shutting down`);
    server.close();
    if (ctx.worker) await ctx.worker.stop();
    await ctx.db.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
