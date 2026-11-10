"use strict";

/*
 * Object storage for uploaded media, launcher icons, signing keystores and
 * build artifacts.
 *   - local: a directory on disk (on-premise; mount a volume or NFS share)
 *   - s3:    any S3-compatible service (AWS S3, MinIO, Cloudflare R2, GCS interop…)
 */
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { pipeline } = require("node:stream/promises");

function assertKey(key) {
  if (typeof key !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(key) || key.includes("..")) {
    throw new Error(`Invalid storage key: ${key}`);
  }
}

class LocalStorage {
  constructor(dir) {
    this.driver = "local";
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
  }
  file(key) {
    assertKey(key);
    return path.join(this.dir, key);
  }
  async put(key, body) {
    const f = this.file(key);
    await fsp.mkdir(path.dirname(f), { recursive: true });
    await fsp.writeFile(f, body);
  }
  async putFile(key, srcPath) {
    const f = this.file(key);
    await fsp.mkdir(path.dirname(f), { recursive: true });
    await fsp.copyFile(srcPath, f);
  }
  async get(key) {
    return fsp.readFile(this.file(key));
  }
  async stream(key) {
    const f = this.file(key);
    const stat = await fsp.stat(f);
    return { stream: fs.createReadStream(f), size: stat.size };
  }
  async downloadTo(key, destPath) {
    await fsp.copyFile(this.file(key), destPath);
  }
  async exists(key) {
    try {
      await fsp.access(this.file(key));
      return true;
    } catch {
      return false;
    }
  }
  async delete(key) {
    await fsp.rm(this.file(key), { force: true });
  }
}

class S3Storage {
  constructor(opts) {
    const { S3Client } = require("@aws-sdk/client-s3");
    if (!opts.bucket) throw new Error("S3_BUCKET is required when STORAGE_DRIVER=s3");
    this.driver = "s3";
    this.bucket = opts.bucket;
    this.prefix = opts.prefix ? opts.prefix + "/" : "";
    this.s3 = new S3Client({
      region: opts.region,
      endpoint: opts.endpoint,
      forcePathStyle: opts.forcePathStyle,
      credentials: opts.accessKeyId ? { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey } : undefined,
    });
    this.cmd = require("@aws-sdk/client-s3");
  }
  k(key) {
    assertKey(key);
    return this.prefix + key;
  }
  async put(key, body) {
    await this.s3.send(new this.cmd.PutObjectCommand({ Bucket: this.bucket, Key: this.k(key), Body: body }));
  }
  async putFile(key, srcPath) {
    const stat = await fsp.stat(srcPath);
    await this.s3.send(new this.cmd.PutObjectCommand({
      Bucket: this.bucket, Key: this.k(key), Body: fs.createReadStream(srcPath), ContentLength: stat.size,
    }));
  }
  async get(key) {
    const res = await this.s3.send(new this.cmd.GetObjectCommand({ Bucket: this.bucket, Key: this.k(key) }));
    return Buffer.from(await res.Body.transformToByteArray());
  }
  async stream(key) {
    const res = await this.s3.send(new this.cmd.GetObjectCommand({ Bucket: this.bucket, Key: this.k(key) }));
    return { stream: res.Body, size: res.ContentLength };
  }
  async downloadTo(key, destPath) {
    const { stream } = await this.stream(key);
    await pipeline(stream, fs.createWriteStream(destPath));
  }
  async exists(key) {
    try {
      await this.s3.send(new this.cmd.HeadObjectCommand({ Bucket: this.bucket, Key: this.k(key) }));
      return true;
    } catch {
      return false;
    }
  }
  async delete(key) {
    await this.s3.send(new this.cmd.DeleteObjectCommand({ Bucket: this.bucket, Key: this.k(key) }));
  }
}

function create(config) {
  if (config.storage.driver === "s3") return new S3Storage(config.storage.s3);
  return new LocalStorage(config.storage.localDir);
}

module.exports = { create, LocalStorage, S3Storage };
