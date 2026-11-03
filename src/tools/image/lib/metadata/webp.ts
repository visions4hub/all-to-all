// WebP (RIFF): walks the chunks. Stripping drops EXIF / XMP (and optionally
// ICCP), fixes the VP8X feature flags and the RIFF size, and copies the image
// chunks unchanged.

import { ascii, concat, DamagedFileError, latin1, u16le, u24le, u32le } from "./bytes";
import { parseIcc } from "./icc";
import { orientationOnlyTiff, parseExif } from "./tiff";
import { parseXmp } from "./xmp";
import { isRemovable, type Block, type MetadataReport, type Part, type StripOptions, type StripResult } from "./types";

const IMAGE_CHUNKS = new Set(["VP8X", "VP8 ", "VP8L", "ALPH", "ANIM", "ANMF"]);
const FLAG = { icc: 0x20, alpha: 0x10, exif: 0x08, xmp: 0x04, animation: 0x02 };

type Chunk = Part & { type: string; data: Uint8Array };

function classify(type: string, data: Uint8Array): Block | undefined {
  const bytes = 8 + data.length + (data.length % 2);
  if (type === "EXIF") return { kind: "exif", bytes };
  if (type === "XMP ") return { kind: "xmp", bytes };
  if (type === "ICCP") return { kind: "icc", bytes };
  if (IMAGE_CHUNKS.has(type)) return undefined;
  return { kind: "app", bytes, detail: type.trim() };
}

export function webpChunks(b: Uint8Array): Chunk[] {
  if (latin1(b, 0, 4) !== "RIFF" || latin1(b, 8, 12) !== "WEBP") throw new DamagedFileError("Not a WebP");
  const riffEnd = Math.min(b.length, 8 + u32le(b, 4));
  const chunks: Chunk[] = [];
  let o = 12;
  while (o + 8 <= riffEnd) {
    const type = latin1(b, o, o + 4);
    const len = u32le(b, o + 4);
    const dataEnd = o + 8 + len;
    if (dataEnd > b.length) throw new DamagedFileError("Truncated WebP chunk");
    const end = Math.min(dataEnd + (len % 2), b.length);
    const data = b.subarray(o + 8, dataEnd);
    chunks.push({ start: o, end, type, data, block: classify(type, data) });
    o = end;
  }
  if (riffEnd < b.length) chunks.push({ start: riffEnd, end: b.length, type: "", data: b.subarray(0, 0), block: { kind: "trailing", bytes: b.length - riffEnd } });
  return chunks;
}

export function readWebp(b: Uint8Array): MetadataReport {
  const chunks = webpChunks(b);
  const report: MetadataReport = {
    format: "webp",
    width: 0,
    height: 0,
    orientation: null,
    colour: { bitDepth: 8 },
    exif: null,
    xmp: {},
    iptc: {},
    comments: [],
    texts: [],
    blocks: chunks.flatMap((c) => (c.block ? [c.block] : [])),
  };
  let frames = 0;
  for (const c of chunks) {
    const d = c.data;
    if (c.type === "VP8X" && d.length >= 10) {
      report.colour.alpha = !!(d[0] & FLAG.alpha);
      report.colour.animated = !!(d[0] & FLAG.animation);
      report.width = u24le(d, 4) + 1;
      report.height = u24le(d, 7) + 1;
    } else if (c.type === "VP8 " && d.length >= 10) {
      report.colour.compression ??= "lossy";
      if (!report.width && d[3] === 0x9d && d[4] === 0x01 && d[5] === 0x2a) {
        report.width = u16le(d, 6) & 0x3fff;
        report.height = u16le(d, 8) & 0x3fff;
      }
    } else if (c.type === "VP8L" && d.length >= 5 && d[0] === 0x2f) {
      report.colour.compression ??= "lossless";
      const bits = u32le(d, 1);
      if (!report.width) {
        report.width = (bits & 0x3fff) + 1;
        report.height = ((bits >> 14) & 0x3fff) + 1;
      }
      if ((bits >> 28) & 1) report.colour.alpha = true;
    } else if (c.type === "ALPH") report.colour.alpha = true;
    else if (c.type === "ANMF") {
      frames++;
      // The first frame's bitstream tells lossy/lossless.
      if (!report.colour.compression && d.length >= 24) {
        const inner = latin1(d, 16, 20);
        report.colour.compression = inner === "VP8L" ? "lossless" : "lossy";
      }
    } else if (c.type === "EXIF" && !report.exif) {
      report.exif = parseExif(latin1(d, 0, 6) === "Exif\0\0" ? d.subarray(6) : d);
    } else if (c.type === "XMP ") {
      Object.assign(report.xmp, parseXmp(new TextDecoder().decode(d)));
    } else if (c.type === "ICCP") {
      report.colour.icc = parseIcc(d);
    }
  }
  if (frames) report.colour.frames = frames;
  report.colour.colourType = report.colour.alpha ? "RGBA" : "RGB";
  report.orientation = report.exif?.orientation ?? null;
  return report;
}

function makeChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + data.length + (data.length % 2));
  out.set(ascii(type), 0);
  new DataView(out.buffer).setUint32(4, data.length, true);
  out.set(data, 8);
  return out;
}

export function stripWebp(b: Uint8Array, opts: StripOptions, orientation: number | null): StripResult {
  const chunks = webpChunks(b);
  const removed: Block[] = [];
  const kept: Block[] = [];
  const body: Uint8Array[] = [];
  const vp8x = chunks.find((c) => c.type === "VP8X");
  // EXIF needs the extended (VP8X) format, which every WebP that had EXIF already uses.
  const writeOrientation = vp8x && opts.keepOrientation && orientation && orientation !== 1 ? orientation : null;
  const keptIcc = chunks.some((c) => c.type === "ICCP" && !isRemovable(c.block!, opts));
  for (const c of chunks) {
    if (c.block && isRemovable(c.block, opts)) {
      removed.push(c.block);
      continue;
    }
    if (c.block) kept.push(c.block);
    if (c === vp8x) {
      const chunk = b.slice(c.start, c.end);
      let flags = chunk[8] & ~(FLAG.exif | FLAG.xmp | FLAG.icc);
      if (keptIcc) flags |= FLAG.icc;
      if (writeOrientation) flags |= FLAG.exif;
      chunk[8] = flags;
      body.push(chunk);
    } else body.push(b.subarray(c.start, c.end));
  }
  // EXIF goes after the image data.
  if (writeOrientation) body.push(makeChunk("EXIF", orientationOnlyTiff(writeOrientation)));
  const size = 4 + body.reduce((n, p) => n + p.length, 0);
  const header = concat([ascii("RIFF"), Uint8Array.of(size & 0xff, (size >> 8) & 0xff, (size >> 16) & 0xff, (size >>> 24) & 0xff), ascii("WEBP")]);
  return { bytes: concat([header, ...body]), removed, kept, orientationKept: writeOrientation };
}
