#!/usr/bin/env node
/**
 * Draws the TRC-20 Forge app icon (rose rounded square + white hexagon outline, as in the site header)
 * and writes desktop/icon.ico with 16/24/32/48/64/128/256 px PNG frames. No dependencies.
 *   node desktop/make-icon.mjs
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SIZES = [16, 24, 32, 48, 64, 128, 256];
const TOP = [0xf4, 0x3f, 0x5e]; // rose-500
const BOTTOM = [0xe1, 0x1d, 0x48]; // rose-600

/** Coverage in [0,1] of the shape at unit coordinates (u,v in 0..1), 4x4 supersampled by the caller. */
function roundedSquare(u, v, r) {
  const dx = Math.max(Math.abs(u - 0.5) - (0.5 - r), 0);
  const dy = Math.max(Math.abs(v - 0.5) - (0.5 - r), 0);
  return dx * dx + dy * dy <= r * r;
}

// Hexagon outline (pointy top), centred, like lucide's Hexagon icon.
const HEX = Array.from({ length: 6 }, (_, i) => {
  const a = Math.PI / 2 + (i * Math.PI) / 3;
  return [0.5 + 0.27 * Math.cos(a), 0.5 - 0.27 * Math.sin(a)];
});
function distToSegment(px, py, [ax, ay], [bx, by]) {
  const vx = bx - ax, vy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}
function onHexStroke(u, v, half) {
  for (let i = 0; i < 6; i++) if (distToSegment(u, v, HEX[i], HEX[(i + 1) % 6]) <= half) return true;
  return false;
}

function render(size) {
  const px = Buffer.alloc(size * size * 4);
  const SS = 4;
  const stroke = Math.max(0.055, 1.6 / size); // keep the line visible at 16 px
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bg = 0, fg = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const u = (x + (sx + 0.5) / SS) / size, v = (y + (sy + 0.5) / SS) / size;
        if (roundedSquare(u, v, 0.22)) { bg++; if (onHexStroke(u, v, stroke / 2)) fg++; }
      }
      const n = SS * SS, t = y / (size - 1);
      const base = TOP.map((c, i) => c + (BOTTOM[i] - c) * t);
      const f = bg ? fg / bg : 0;
      const o = (y * size + x) * 4;
      for (let i = 0; i < 3; i++) px[o + i] = Math.round(base[i] * (1 - f) + 255 * f);
      px[o + 3] = Math.round((bg / n) * 255);
    }
  }
  return png(size, px);
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

const frames = SIZES.map(render);
const header = Buffer.alloc(6); header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(frames.length, 4);
let offset = 6 + 16 * frames.length;
const dir = frames.map((f, i) => {
  const e = Buffer.alloc(16), s = SIZES[i];
  e[0] = s >= 256 ? 0 : s; e[1] = s >= 256 ? 0 : s; e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
  e.writeUInt32LE(f.length, 8); e.writeUInt32LE(offset, 12); offset += f.length;
  return e;
});
fs.writeFileSync(path.join(here, "icon.ico"), Buffer.concat([header, ...dir, ...frames]));
fs.writeFileSync(path.join(here, "icon-256.png"), frames.at(-1));
console.log("wrote desktop/icon.ico");
