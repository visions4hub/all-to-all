// PNG: walks the chunks. Stripping drops metadata chunks and copies every other
// chunk (with its CRC) unchanged.

import { ascii, concat, DamagedFileError, inflate, latin1, u32be } from "./bytes";
import { crc32 } from "../png";
import { parseIcc } from "./icc";
import { orientationOnlyTiff, parseExif } from "./tiff";
import { parseXmp } from "./xmp";
import { isRemovable, type Block, type MetadataReport, type Part, type StripOptions, type StripResult } from "./types";

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Chunks that describe the image itself (pixels, colours, display, animation). */
const IMAGE_CHUNKS = new Set([
  "IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA", "cHRM", "sRGB", "sBIT", "bKGD", "pHYs", "hIST", "sPLT",
  "acTL", "fcTL", "fdAT", "cICP", "mDCV", "cLLI", "mDCv", "cLLi",
]);

type Chunk = Part & { type: string; data: Uint8Array };

function keywordOf(data: Uint8Array) {
  const z = data.indexOf(0);
  return latin1(data, 0, z < 0 ? Math.min(data.length, 79) : z);
}

function classify(type: string, data: Uint8Array): Block | undefined {
  const bytes = data.length + 12;
  if (type === "tEXt" || type === "zTXt" || type === "iTXt") {
    const keyword = keywordOf(data);
    if (type === "iTXt" && keyword === "XML:com.adobe.xmp") return { kind: "xmp", bytes };
    return { kind: "text", bytes, detail: keyword };
  }
  if (type === "eXIf" || type === "exIf") return { kind: "exif", bytes };
  if (type === "tIME") return { kind: "time", bytes };
  if (type === "iCCP") return { kind: "icc", bytes };
  if (IMAGE_CHUNKS.has(type)) return undefined;
  // Unknown critical chunks (uppercase first letter) must never be dropped.
  if (type.charCodeAt(0) < 0x61) return undefined;
  return { kind: "app", bytes, detail: type };
}

export function pngChunks(b: Uint8Array): Chunk[] {
  if (!SIGNATURE.every((v, i) => b[i] === v)) throw new DamagedFileError("Not a PNG");
  const chunks: Chunk[] = [{ start: 0, end: 8, type: "", data: b.subarray(0, 0) }];
  let o = 8;
  while (o < b.length) {
    if (o + 12 > b.length) throw new DamagedFileError("Truncated PNG chunk");
    const len = u32be(b, o);
    const type = latin1(b, o + 4, o + 8);
    const end = o + 12 + len;
    if (end > b.length) throw new DamagedFileError("Truncated PNG chunk");
    const data = b.subarray(o + 8, o + 8 + len);
    chunks.push({ start: o, end, type, data, block: classify(type, data) });
    o = end;
    if (type === "IEND") {
      if (o < b.length) chunks.push({ start: o, end: b.length, type: "", data: b.subarray(0, 0), block: { kind: "trailing", bytes: b.length - o } });
      break;
    }
  }
  return chunks;
}

async function textValue(type: string, data: Uint8Array): Promise<string> {
  const z = data.indexOf(0);
  if (z < 0) return "";
  if (type === "tEXt") return latin1(data, z + 1);
  if (type === "zTXt") return latin1(await inflate(data.subarray(z + 2)));
  // iTXt: keyword\0 flag method lang\0 translated\0 text
  const compressed = data[z + 1] === 1;
  let p = z + 3;
  p = data.indexOf(0, p) + 1; // language tag
  p = data.indexOf(0, p) + 1; // translated keyword
  if (p <= 0) return "";
  const body = data.subarray(p);
  return new TextDecoder().decode(compressed ? await inflate(body) : body);
}

const COLOUR_TYPES: Record<number, string> = { 0: "Grayscale", 2: "RGB", 3: "Palette", 4: "Grayscale + alpha", 6: "RGBA" };

export async function readPng(b: Uint8Array): Promise<MetadataReport> {
  const chunks = pngChunks(b);
  const report: MetadataReport = {
    format: "png",
    width: 0,
    height: 0,
    orientation: null,
    colour: {},
    exif: null,
    xmp: {},
    iptc: {},
    comments: [],
    texts: [],
    blocks: chunks.flatMap((c) => (c.block ? [c.block] : [])),
  };
  let frames = 0;
  let hasTrns = false;
  for (const c of chunks) {
    const d = c.data;
    try {
      if (c.type === "IHDR" && d.length >= 13) {
        report.width = u32be(d, 0);
        report.height = u32be(d, 4);
        report.colour.bitDepth = d[8];
        report.colour.colourType = COLOUR_TYPES[d[9]];
        report.colour.alpha = d[9] === 4 || d[9] === 6;
        report.colour.interlaced = d[12] === 1;
      } else if (c.type === "tRNS") hasTrns = true;
      else if (c.type === "sRGB") report.colour.srgb = true;
      else if (c.type === "gAMA" && d.length >= 4) report.colour.gamma = Math.round((100000 / u32be(d, 0)) * 100) / 100;
      else if (c.type === "pHYs" && d.length >= 9 && d[8] === 1) report.colour.dpi = Math.round(u32be(d, 0) * 0.0254);
      else if (c.type === "acTL" && d.length >= 4) {
        report.colour.animated = true;
        frames = u32be(d, 0);
      } else if (c.block?.kind === "exif" && !report.exif) {
        // Some writers keep the "Exif\0\0" prefix inside the chunk.
        report.exif = parseExif(latin1(d, 0, 6) === "Exif\0\0" ? d.subarray(6) : d);
      } else if (c.block?.kind === "xmp") {
        Object.assign(report.xmp, parseXmp(await textValue(c.type, d)));
      } else if (c.block?.kind === "text") {
        const value = await textValue(c.type, d);
        report.texts.push({ keyword: c.block.detail ?? "", value: value.length > 2000 ? `${value.slice(0, 2000)}…` : value });
      } else if (c.type === "iCCP") {
        const z = d.indexOf(0);
        const name = latin1(d, 0, z);
        let info: MetadataReport["colour"]["icc"] = { bytes: d.length, name };
        try {
          const profile = await inflate(d.subarray(z + 2));
          info = { ...parseIcc(profile), name: parseIcc(profile).name || name };
        } catch {
          // keep the chunk's own name
        }
        report.colour.icc = info;
      }
    } catch {
      // A damaged metadata chunk is still listed in `blocks`; we just can't show its value.
    }
  }
  if (hasTrns) report.colour.alpha = true;
  if (frames) report.colour.frames = frames;
  report.orientation = report.exif?.orientation ?? null;
  return report;
}

function makeChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, data.length);
  out.set(ascii(type), 4);
  out.set(data, 8);
  v.setUint32(8 + data.length, crc32(out, 4, 8 + data.length));
  return out;
}

export function stripPng(b: Uint8Array, opts: StripOptions, orientation: number | null): StripResult {
  const chunks = pngChunks(b);
  const out: Uint8Array[] = [];
  const removed: Block[] = [];
  const kept: Block[] = [];
  const writeOrientation = opts.keepOrientation && orientation && orientation !== 1 ? orientation : null;
  let wrote = false;
  for (const c of chunks) {
    // eXIf must come before the image data.
    if (writeOrientation && !wrote && (c.type === "IDAT" || c.type === "IEND")) {
      out.push(makeChunk("eXIf", orientationOnlyTiff(writeOrientation)));
      wrote = true;
    }
    if (c.block && isRemovable(c.block, opts)) removed.push(c.block);
    else {
      if (c.block) kept.push(c.block);
      out.push(b.subarray(c.start, c.end));
    }
  }
  return { bytes: concat(out), removed, kept, orientationKept: writeOrientation };
}
