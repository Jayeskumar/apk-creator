"use strict";

/*
 * Minimal, defensive ZIP reader (stored + deflate entries) used to import
 * source archives. It enforces entry-count and size limits before inflating
 * (zip bombs), ignores directories and symlinks, and never touches the disk —
 * callers validate every path before using it.
 */
const zlib = require("node:zlib");

class ZipError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

function findEndOfCentralDirectory(buf) {
  const min = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  throw new ZipError("Not a ZIP archive");
}

/**
 * @returns {{path: string, data: Buffer}[]}
 */
function readZip(buf, { maxEntries = 2000, maxEntryBytes = 5 * 1048576, maxTotalBytes = 40 * 1048576 } = {}) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) throw new ZipError("Not a ZIP archive");
  const eocd = findEndOfCentralDirectory(buf);
  const count = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  let pos = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || cdSize === 0xffffffff || pos === 0xffffffff) throw new ZipError("ZIP64 archives are not supported");
  if (count > maxEntries) throw new ZipError(`Archive has too many entries (${count} > ${maxEntries})`);

  const out = [];
  let total = 0;
  for (let i = 0; i < count; i++) {
    if (pos + 46 > buf.length || buf.readUInt32LE(pos) !== 0x02014b50) throw new ZipError("Corrupt ZIP archive");
    const flags = buf.readUInt16LE(pos + 8);
    const method = buf.readUInt16LE(pos + 10);
    const compSize = buf.readUInt32LE(pos + 20);
    const size = buf.readUInt32LE(pos + 24);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const externalAttrs = buf.readUInt32LE(pos + 38);
    const localOffset = buf.readUInt32LE(pos + 42);
    const name = buf.toString("utf8", pos + 46, pos + 46 + nameLen);
    pos += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith("/")) continue; // directory
    if (((externalAttrs >>> 16) & 0o170000) === 0o120000) continue; // symlink
    if (flags & 0x1) throw new ZipError("Encrypted ZIP archives are not supported");
    if (size > maxEntryBytes) throw new ZipError(`${name} is too large (max ${Math.round(maxEntryBytes / 1048576)} MB per file)`);
    total += size;
    if (total > maxTotalBytes) throw new ZipError(`Archive is too large when extracted (max ${Math.round(maxTotalBytes / 1048576)} MB)`);

    if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== 0x04034b50) throw new ZipError("Corrupt ZIP archive");
    const start = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
    const raw = buf.subarray(start, start + compSize);
    let data;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) {
      try {
        data = zlib.inflateRawSync(raw, { maxOutputLength: maxEntryBytes });
      } catch {
        throw new ZipError(`Could not decompress ${name}`);
      }
    } else throw new ZipError(`Unsupported compression method in ${name}`);
    out.push({ path: name, data });
  }
  return out;
}

module.exports = { readZip, ZipError };
