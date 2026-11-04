// JPEG: walks the marker segments and the entropy-coded image data byte by byte.
// Stripping drops metadata segments and copies every other byte unchanged.

import { ascii, concat, DamagedFileError, latin1, startsWith, u16be } from "./bytes";
import { parseIcc } from "./icc";
import { parseIptc, photoshopResources } from "./iptc";
import { orientationOnlyTiff, parseExif } from "./tiff";
import { parseXmp } from "./xmp";
import { isRemovable, type Block, type MetadataReport, type Part, type StripOptions, type StripResult } from "./types";

const XMP_SIG = "http://ns.adobe.com/xap/1.0/\0";
const XMP_EXT_SIG = "http://ns.adobe.com/xmp/extension/\0";

const isSof = (m: number) => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;

function signature(payload: Uint8Array): string {
  let end = 0;
  while (end < payload.length && end < 32 && payload[end] >= 0x20 && payload[end] < 0x7f) end++;
  return latin1(payload, 0, end);
}

function classify(marker: number, payload: Uint8Array): Block | undefined {
  const bytes = payload.length + 4;
  if (marker === 0xe0) return startsWith(payload, 0, "JFXX\0") ? { kind: "thumbnail", bytes, detail: "JFXX" } : undefined;
  if (marker === 0xe1) {
    if (startsWith(payload, 0, "Exif\0")) return { kind: "exif", bytes };
    if (startsWith(payload, 0, XMP_SIG)) return { kind: "xmp", bytes };
    if (startsWith(payload, 0, XMP_EXT_SIG)) return { kind: "xmp", bytes, detail: "extended" };
    return { kind: "app", bytes, detail: `APP1 ${signature(payload)}`.trim() };
  }
  if (marker === 0xe2) {
    if (startsWith(payload, 0, "ICC_PROFILE\0")) return { kind: "icc", bytes };
    if (startsWith(payload, 0, "MPF\0")) return { kind: "multi-picture", bytes };
    return { kind: "app", bytes, detail: `APP2 ${signature(payload)}`.trim() };
  }
  if (marker === 0xed) return { kind: "iptc", bytes, detail: signature(payload) || undefined };
  // APP14 "Adobe" tells decoders how to convert colours: it is image data, not metadata.
  if (marker === 0xee && startsWith(payload, 0, "Adobe")) return undefined;
  if (marker >= 0xe3 && marker <= 0xef) return { kind: "app", bytes, detail: `APP${marker - 0xe0} ${signature(payload)}`.trim() };
  if (marker === 0xfe) return { kind: "comment", bytes };
  return undefined;
}

type Seg = Part & { marker: number };

/** Splits a JPEG into byte ranges. Every byte of the file belongs to exactly one range. */
export function jpegParts(b: Uint8Array): Seg[] {
  if (b[0] !== 0xff || b[1] !== 0xd8) throw new DamagedFileError("Not a JPEG");
  const parts: Seg[] = [{ start: 0, end: 2, marker: 0xd8 }];
  let o = 2;
  while (o < b.length) {
    const start = o;
    if (b[o] !== 0xff) {
      // Not a marker where one must be: keep the rest untouched.
      parts.push({ start, end: b.length, marker: -1 });
      break;
    }
    while (o + 1 < b.length && b[o + 1] === 0xff) o++; // fill bytes
    if (o + 1 >= b.length) {
      parts.push({ start, end: b.length, marker: -1 });
      break;
    }
    const marker = b[o + 1];
    o += 2;
    if (marker === 0xd9) {
      parts.push({ start, end: o, marker });
      if (o < b.length) parts.push({ start: o, end: b.length, marker: -1, block: { kind: "trailing", bytes: b.length - o } });
      break;
    }
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      parts.push({ start, end: o, marker });
      continue;
    }
    if (o + 2 > b.length) throw new DamagedFileError("Truncated JPEG segment");
    const len = u16be(b, o);
    const end = o + len;
    if (len < 2 || end > b.length) throw new DamagedFileError("Truncated JPEG segment");
    const payload = b.subarray(o + 2, end);
    if (marker === 0xda) {
      // Start of scan: the entropy-coded data runs until the next real marker.
      let i = end;
      while (i + 1 < b.length) {
        if (b[i] === 0xff) {
          const n = b[i + 1];
          if (n !== 0x00 && !(n >= 0xd0 && n <= 0xd7)) break;
        }
        i++;
      }
      if (i + 1 >= b.length) i = b.length;
      parts.push({ start, end: i, marker, payload });
      o = i;
      continue;
    }
    parts.push({ start, end, marker, payload, block: classify(marker, payload) });
    o = end;
  }
  return parts;
}

export function readJpeg(b: Uint8Array): MetadataReport {
  const parts = jpegParts(b);
  const report: MetadataReport = {
    format: "jpeg",
    width: 0,
    height: 0,
    orientation: null,
    colour: {},
    exif: null,
    xmp: {},
    iptc: {},
    comments: [],
    texts: [],
    blocks: parts.flatMap((p) => (p.block ? [p.block] : [])),
  };
  const icc: { seq: number; data: Uint8Array }[] = [];
  let adobeTransform: number | null = null;
  for (const p of parts) {
    const d = p.payload;
    if (!d) continue;
    if (isSof(p.marker) && d.length >= 6 && !report.width) {
      report.colour.bitDepth = d[0];
      report.height = u16be(d, 1);
      report.width = u16be(d, 3);
      const n = d[5];
      report.colour.components = n;
      report.colour.progressive = [0xc2, 0xc6, 0xca, 0xce].includes(p.marker);
      if (n === 3 && d.length >= 6 + 9) {
        const h = [d[7] >> 4, d[10] >> 4, d[13] >> 4];
        const v = [d[7] & 15, d[10] & 15, d[13] & 15];
        if (h[1] === h[2] && v[1] === v[2] && h[1] && v[1]) {
          const hr = h[0] / h[1];
          const vr = v[0] / v[1];
          report.colour.subsampling = hr === 1 && vr === 1 ? "4:4:4" : hr === 2 && vr === 1 ? "4:2:2" : hr === 2 && vr === 2 ? "4:2:0" : hr === 4 && vr === 1 ? "4:1:1" : `${h[0]}x${v[0]}`;
        }
      }
    } else if (p.marker === 0xe0 && startsWith(d, 0, "JFIF\0") && d.length >= 12) {
      const units = d[7];
      const x = u16be(d, 8);
      if (units === 1 && x > 1) report.colour.dpi = x;
      else if (units === 2 && x > 1) report.colour.dpi = Math.round(x * 2.54);
    } else if (p.marker === 0xee && startsWith(d, 0, "Adobe") && d.length >= 12) {
      adobeTransform = d[11];
    } else if (p.block?.kind === "exif" && !report.exif) {
      report.exif = parseExif(d.subarray(6));
    } else if (p.block?.kind === "xmp" && !p.block.detail) {
      Object.assign(report.xmp, parseXmp(new TextDecoder().decode(d.subarray(XMP_SIG.length))));
    } else if (p.block?.kind === "iptc") {
      if (startsWith(d, 0, "Photoshop 3.0\0")) {
        for (const r of photoshopResources(d.subarray(14))) if (r.id === 0x0404) Object.assign(report.iptc, parseIptc(r.data));
      }
    } else if (p.block?.kind === "icc" && d.length > 14) {
      icc.push({ seq: d[12], data: d.subarray(14) });
    } else if (p.block?.kind === "comment") {
      const s = new TextDecoder().decode(d).replace(/\0+$/, "").trim();
      if (s) report.comments.push(s);
    }
  }
  const n = report.colour.components;
  report.colour.colourType =
    n === 1 ? "Grayscale" : n === 3 ? (adobeTransform === 0 ? "RGB" : "YCbCr") : n === 4 ? (adobeTransform === 2 ? "YCCK" : "CMYK") : undefined;
  if (icc.length) report.colour.icc = parseIcc(concat(icc.sort((a, b) => a.seq - b.seq).map((c) => c.data)));
  report.orientation = report.exif?.orientation ?? null;
  return report;
}

export function stripJpeg(b: Uint8Array, opts: StripOptions, orientation: number | null): StripResult {
  const parts = jpegParts(b);
  const out: Uint8Array[] = [];
  const removed: Block[] = [];
  const kept: Block[] = [];
  const writeOrientation = opts.keepOrientation && orientation && orientation !== 1 ? orientation : null;
  let wroteOrientation = false;
  const emitOrientation = () => {
    if (!writeOrientation || wroteOrientation) return;
    const payload = concat([ascii("Exif\0\0"), orientationOnlyTiff(writeOrientation)]);
    out.push(Uint8Array.of(0xff, 0xe1, (payload.length + 2) >> 8, (payload.length + 2) & 0xff), payload);
    wroteOrientation = true;
  };
  parts.forEach((p, i) => {
    // The orientation block goes right after SOI and an APP0 JFIF header, if any.
    if (i > 0 && !(p.marker === 0xe0 && !p.block)) emitOrientation();
    if (p.block && isRemovable(p.block, opts)) removed.push(p.block);
    else {
      if (p.block) kept.push(p.block);
      out.push(b.subarray(p.start, p.end));
    }
  });
  emitOrientation();
  return { bytes: concat(out), removed, kept, orientationKept: writeOrientation };
}
