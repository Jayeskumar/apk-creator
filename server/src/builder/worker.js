"use strict";

/*
 * Build worker. Polls the database-backed queue, prepares a Gradle project
 * per build, runs it, signs it and uploads the APK/AAB to storage.
 *
 * Runs embedded in the API process (default on-premise) or as a standalone
 * process (src/worker.js) that can be scaled horizontally in the cloud: the
 * queue claim is atomic (SQLite single writer / Postgres SKIP LOCKED).
 */
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { prepareProject } = require("./project");
const { ensureKeystore } = require("./keystore");
const native = require("./nativeProject");
const { AppFiles } = require("../files");
const { slug } = require("../validation");
const security = require("../security");

const MAX_LOG = 256 * 1024;

/** Environment for Gradle: never hand server secrets to build scripts. */
function buildEnvironment(cfg) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (/^(SECRET_KEY|DATABASE_|ADMIN_|S3_|AWS_|TEST_|PGPASS)/.test(k)) continue;
    env[k] = v;
  }
  if (cfg.build.androidHome) env.ANDROID_HOME = cfg.build.androidHome;
  return env;
}

class BuildWorker {
  constructor({ db, storage, config, logger = console }) {
    this.db = db;
    this.storage = storage;
    this.config = config;
    this.files = new AppFiles({ db, storage, config });
    this.logger = logger;
    this.running = 0;
    this.stopped = true;
    this.timer = null;
    this.active = new Map();
  }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.logger.log(`[worker] started (id=${this.config.worker.id}, concurrency=${this.config.worker.concurrency})`);
    this.recoverStale().catch((e) => this.logger.error("[worker] stale recovery failed", e));
    this.schedule(100);
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    for (const job of this.active.values()) job.kill("shutdown");
  }

  schedule(ms) {
    if (this.stopped) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.tick(), ms);
  }

  async tick() {
    try {
      while (!this.stopped && this.running < this.config.worker.concurrency) {
        const build = await this.db.claimNextBuild(this.config.worker.id, security.now());
        if (!build) break;
        this.running++;
        this.runBuild(build)
          .catch((e) => this.logger.error(`[worker] build ${build.id} crashed`, e))
          .finally(() => {
            this.running--;
            this.schedule(50);
          });
      }
    } catch (e) {
      this.logger.error("[worker] poll failed:", e.message);
    }
    this.schedule(this.config.worker.pollMs);
  }

  /** Builds whose worker died (heartbeat too old) are marked failed. */
  async recoverStale() {
    const cutoff = new Date(Date.now() - this.config.worker.staleAfterMinutes * 60000).toISOString();
    const res = await this.db.run(
      "UPDATE builds SET status = 'failed', error = 'Build worker stopped responding', finished_at = ? WHERE status = 'building' AND heartbeat_at < ?",
      [security.now(), cutoff]
    );
    if (res.changes) this.logger.log(`[worker] marked ${res.changes} stale build(s) as failed`);
  }

  async runBuild(build) {
    const cfg = this.config;
    const started = Date.now();
    const workDir = path.join(cfg.build.workDir, build.id);
    let log = "";
    let dirty = false;
    let child = null;
    let killedReason = null;
    let finished = false;

    const projectPrefix = path.join(workDir, "project") + path.sep;
    const append = (text) => {
      // Show project-relative paths (app/src/...) instead of the worker's temp directory.
      log += text.split(projectPrefix).join("");
      if (log.length > MAX_LOG) log = "…(truncated)…\n" + log.slice(-MAX_LOG);
      dirty = true;
    };
    const flush = async () => {
      if (!dirty || finished) return;
      dirty = false;
      await this.db.run("UPDATE builds SET log = ?, heartbeat_at = ? WHERE id = ?", [log, security.now(), build.id]);
    };
    const job = {
      kill: (reason) => {
        killedReason = reason;
        if (child && child.pid) {
          try { process.kill(-child.pid, "SIGTERM"); } catch { try { child.kill("SIGTERM"); } catch { /* gone */ } }
        }
      },
    };
    this.active.set(build.id, job);

    const ticker = setInterval(async () => {
      try {
        dirty = true; // heartbeat even when quiet
        await flush();
        const row = await this.db.get("SELECT status FROM builds WHERE id = ?", [build.id]);
        if (row && row.status === "canceled") job.kill("canceled");
      } catch (e) {
        this.logger.error("[worker] flush failed", e.message);
      }
    }, 2000);

    try {
      append(`▶ Build ${build.id} for ${build.app_name} (${build.package_name}) v${build.version_name} (${build.version_code})\n`);
      append(`  worker=${cfg.worker.id} format=${build.format}\n\n`);
      await fsp.rm(workDir, { recursive: true, force: true });
      await fsp.mkdir(workDir, { recursive: true });
      const projectDir = path.join(workDir, "project");

      append("• Generating signing key / loading existing key\n");
      const signing = await ensureKeystore({
        db: this.db, storage: this.storage, config: cfg, appId: build.app_id, appName: build.app_name, workDir, log: append,
      });

      const mode = JSON.parse(build.config).mode;
      const isProject = mode === "project";
      const task = build.format === "aab" ? "bundleRelease" : "assembleRelease";
      let gradleCmd = cfg.build.gradleCmd;
      let args;
      let printable;
      if (isProject) {
        append("• Preparing your Gradle project\n");
        const prepared = await native.prepareNativeProject({ dir: projectDir, build, files: this.files, config: cfg, log: append });
        gradleCmd = prepared.gradleCmd;
        ({ args, printable } = native.gradleArgs({ dir: projectDir, task, signing, config: cfg }));
      } else {
        append(mode === "code" ? "• Packaging your web app into the Android shell\n" : "• Preparing Android project from template\n");
        await prepareProject({ dir: projectDir, build, storage: this.storage, config: cfg, signing, files: this.files, log: append });
        args = ["-p", projectDir, "--console=plain", ...(cfg.build.gradleOffline ? ["--offline"] : []), ...cfg.build.gradleArgs, task];
        printable = args;
      }
      append(`• Running ${path.basename(gradleCmd)} ${printable.map((a) => (a === projectDir ? "<project>" : a)).join(" ")}\n\n`);

      const timeoutSeconds = isProject ? cfg.build.projectTimeoutSeconds : cfg.build.timeoutSeconds;
      const code = await new Promise((resolve, reject) => {
        child = spawn(gradleCmd, args, { cwd: projectDir, env: buildEnvironment(cfg), detached: true, stdio: ["ignore", "pipe", "pipe"] });
        child.stdout.on("data", (d) => append(d.toString()));
        child.stderr.on("data", (d) => append(d.toString()));
        child.on("error", (e) => reject(new Error(`Could not start Gradle (${gradleCmd}): ${e.message}`)));
        child.on("close", resolve);
        const timeout = setTimeout(() => job.kill("timeout"), timeoutSeconds * 1000);
        child.on("close", () => clearTimeout(timeout));
      });

      if (killedReason === "canceled") throw Object.assign(new Error("Build canceled"), { canceled: true });
      if (killedReason === "timeout") throw new Error(`Build timed out after ${timeoutSeconds}s`);
      if (killedReason) throw new Error(`Build aborted (${killedReason})`);
      if (code !== 0) throw new Error(`Gradle exited with code ${code}`);

      let out;
      let info = null;
      if (isProject) {
        out = await native.findArtifact(projectDir, build.format);
        if (!out) throw new Error(`The build finished but produced no release .${build.format} file`);
        out = await native.ensureSigned({ artifact: out, format: build.format, signing, config: cfg, workDir, log: append });
        if (build.format === "apk") info = await native.readApkInfo(out, cfg);
      } else {
        out = build.format === "aab"
          ? path.join(projectDir, "app", "build", "outputs", "bundle", "release", "app-release.aab")
          : path.join(projectDir, "app", "build", "outputs", "apk", "release", "app-release.apk");
        if (!fs.existsSync(out)) throw new Error(`Expected output not found: ${path.relative(projectDir, out)}`);
      }

      const buf = await fsp.readFile(out);
      const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
      const versionName = (info && /^[0-9A-Za-z._-]{1,30}$/.test(info.versionName) && info.versionName) || build.version_name;
      const fileName = `${slug(build.app_name, 40) || "app"}-${versionName}.${build.format}`;
      const key = `builds/${build.id}/${fileName}`;
      await this.storage.putFile(key, out);

      const secs = ((Date.now() - started) / 1000).toFixed(1);
      finished = true;
      append(`\n✔ Build succeeded in ${secs}s — ${(buf.length / 1048576).toFixed(2)} MB, sha256 ${sha256}\n`);
      clearInterval(ticker);
      await this.db.run(
        "UPDATE builds SET status = 'success', log = ?, artifact_key = ?, artifact_size = ?, sha256 = ?, finished_at = ? WHERE id = ?",
        [log, key, buf.length, sha256, security.now(), build.id]
      );
      // Native projects define their own package name and version: record what was actually built.
      if (info) {
        await this.db.run("UPDATE builds SET package_name = ?, version_name = ?, version_code = ? WHERE id = ?",
          [info.packageName, versionName, info.versionCode || build.version_code, build.id]);
      }
    } catch (e) {
      clearInterval(ticker);
      finished = true;
      append(`\n✖ ${e.message}\n`);
      await this.db.run(
        "UPDATE builds SET status = ?, log = ?, error = ?, finished_at = ? WHERE id = ?",
        [e.canceled ? "canceled" : "failed", log, e.message.slice(0, 1000), security.now(), build.id]
      );
    } finally {
      this.active.delete(build.id);
      if (!cfg.build.keepWorkDirs) await fsp.rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

module.exports = { BuildWorker };
