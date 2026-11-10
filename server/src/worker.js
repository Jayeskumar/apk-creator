"use strict";

/* Standalone build worker (cloud / scaled on-premise deployments). */
const { createServices } = require("./services");
const { BuildWorker } = require("./builder/worker");

async function main() {
  const ctx = await createServices();
  const worker = new BuildWorker(ctx);
  worker.start();
  const shutdown = async (sig) => {
    console.log(`[worker] ${sig} received, stopping`);
    await worker.stop();
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
