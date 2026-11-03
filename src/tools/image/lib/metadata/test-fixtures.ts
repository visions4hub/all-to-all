// Builders for test files that carry known metadata (EXIF with GPS, XMP, IPTC,
// ICC, comments, text chunks). Used by the unit tests and the browser tests;
// not imported by the app.

import { crc32 } from "../png";
import { ascii, concat, latin1, u16be, u16le, u32le } from "./bytes";

export const SAMPLE = {
  make: "TestCam",
  model: "Model X100",
  software: "Camera Firmware 1.2",
  lens: "50mm F1.8 Test Lens",
  dateTimeOriginal: "2024:05:17 14:23:11",
  exposure: [1, 250] as [number, number],
  fNumber: [18, 10] as [number, number],
  iso: 400,
  // Baghdad
  gps: { lat: [33, 18, 54], latRef: "N", lon: [44, 21, 36], lonRef: "E", alt: [3400, 100] as [number, number] },
  artist: "حسام",
  xmpCreator: "XMP Creator Name",
  xmpTool: "Test Editor 3.0",
  iptcByline: "IPTC Photographer",
  iptcCity: "Baghdad",
  iptcKeywords: ["one", "two"],
  comment: "secret comment",
  iccName: "Test RGB Profile",
  pngText: { keyword: "Author", value: "PNG Author" },
};

type Entry = { tag: number; type: number; values: number[] | string | Uint8Array };

/** Writes a TIFF block (EXIF) with IFD0, Exif IFD, GPS IFD and optional IFD1, little- or big-endian. */
export function buildExif({ orientation = 1, bigEndian = false, gps = true, thumbnail = 0 } = {}): Uint8Array {
  const enc = new TextEncoder();
  const asciiVal = (s: string) => concat([enc.encode(s), Uint8Array.of(0)]);
  const rat = (pairs: number[][]) => pairs.flat();
  const ifd0: Entry[] = [
    { tag: 0x010f, type: 2, values: asciiVal(SAMPLE.make) },
    { tag: 0x0110, type: 2, values: asciiVal(SAMPLE.model) },
    { tag: 0x0112, type: 3, values: [orientation] },
    { tag: 0x0131, type: 2, values: asciiVal(SAMPLE.software) },
    { tag: 0x013b, type: 2, values: asciiVal(SAMPLE.artist) },
    { tag: 0x8769, type: 4, values: [0] }, // Exif IFD pointer, patched below
    ...(gps ? [{ tag: 0x8825, type: 4, values: [0] }] : []),
  ];
  const exif: Entry[] = [
    { tag: 0x829a, type: 5, values: rat([SAMPLE.exposure]) },
    { tag: 0x829d, type: 5, values: rat([SAMPLE.fNumber]) },
    { tag: 0x8827, type: 3, values: [SAMPLE.iso] },
    { tag: 0x9003, type: 2, values: asciiVal(SAMPLE.dateTimeOriginal) },
    { tag: 0xa434, type: 2, values: asciiVal(SAMPLE.lens) },
  ];
  const g = SAMPLE.gps;
  const gpsIfd: Entry[] = [
    { tag: 0x01, type: 2, values: asciiVal(g.latRef) },
    { tag: 0x02, type: 5, values: rat(g.lat.map((v) => [v, 1])) },
    { tag: 0x03, type: 2, values: asciiVal(g.lonRef) },
    { tag: 0x04, type: 5, values: rat(g.lon.map((v) => [v, 1])) },
    { tag: 0x05, type: 1, values: [0] },
    { tag: 0x06, type: 5, values: rat([g.alt]) },
  ];
  const ifd1: Entry[] = thumbnail ? [{ tag: 0x0201, type: 4, values: [0] }, { tag: 0x0202, type: 4, values: [thumbnail] }] : [];

  const size: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 4 };
  const bytesOf = (e: Entry) => (typeof e.values === "string" ? 0 : e.values instanceof Uint8Array ? e.values.length : e.values.length * size[e.type]);
  const countOf = (e: Entry) => (e.values instanceof Uint8Array ? e.values.length : e.type === 5 ? (e.values as number[]).length / 2 : (e.values as number[]).length);
  const ifds = [ifd0, exif, ...(gps ? [gpsIfd] : []), ...(thumbnail ? [ifd1] : [])];
  // Layout: header, then each IFD followed by its out-of-line data.
  const offsets: number[] = [];
  let pos = 8;
  for (const ifd of ifds) {
    offsets.push(pos);
    pos += 2 + ifd.length * 12 + 4;
    for (const e of ifd) if (bytesOf(e) > 4) pos += bytesOf(e) + (bytesOf(e) % 2);
  }
  const thumbAt = pos;
  pos += thumbnail;
  const out = new Uint8Array(pos);
  const v = new DataView(out.buffer);
  const le = !bigEndian;
  out.set(ascii(bigEndian ? "MM" : "II"), 0);
  v.setUint16(2, 42, le);
  v.setUint32(4, 8, le);
  // Patch pointers.
  ifd0.find((e) => e.tag === 0x8769)!.values = [offsets[1]];
  if (gps) ifd0.find((e) => e.tag === 0x8825)!.values = [offsets[2]];
  if (thumbnail) ifd1[0].values = [thumbAt];
  const writeValues = (e: Entry, at: number) => {
    if (e.values instanceof Uint8Array) out.set(e.values, at);
    else (e.values as number[]).forEach((n, i) => {
      if (e.type === 1) out[at + i] = n;
      else if (e.type === 3) v.setUint16(at + i * 2, n, le);
      else v.setUint32(at + i * 4, n, le);
    });
  };
  ifds.forEach((ifd, k) => {
    const p = offsets[k];
    v.setUint16(p, ifd.length, le);
    let data = p + 2 + ifd.length * 12 + 4;
    ifd.forEach((e, i) => {
      const at = p + 2 + i * 12;
      v.setUint16(at, e.tag, le);
      v.setUint16(at + 2, e.type, le);
      v.setUint32(at + 4, countOf(e), le);
      if (bytesOf(e) <= 4) writeValues(e, at + 8);
      else {
        v.setUint32(at + 8, data, le);
        writeValues(e, data);
        data += bytesOf(e) + (bytesOf(e) % 2);
      }
    });
    // Next IFD: IFD0 → IFD1 (thumbnail) when present.
    const next = k === 0 && thumbnail ? offsets[ifds.length - 1] : 0;
    v.setUint32(p + 2 + ifd.length * 12, next, le);
  });
  for (let i = 0; i < thumbnail; i++) out[thumbAt + i] = 0xaa;
  return out;
}

export function buildXmp(): string {
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/"
 xmlns:exif="http://ns.adobe.com/exif/1.0/" xmp:CreatorTool="${SAMPLE.xmpTool}" exif:GPSLatitude="33,18.9N" exif:GPSLongitude="44,21.6E">
<dc:creator><rdf:Seq><rdf:li>${SAMPLE.xmpCreator}</rdf:li></rdf:Seq></dc:creator>
<dc:rights><rdf:Alt><rdf:li xml:lang="x-default">© Test &amp; Co</rdf:li></rdf:Alt></dc:rights>
</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
}

export function buildIptcApp13Payload(): Uint8Array {
  const enc = new TextEncoder();
  const ds = (n: number, s: string) => {
    const v = enc.encode(s);
    return concat([Uint8Array.of(0x1c, 2, n, v.length >> 8, v.length & 0xff), v]);
  };
  const iim = concat([ds(80, SAMPLE.iptcByline), ds(90, SAMPLE.iptcCity), ...SAMPLE.iptcKeywords.map((k) => ds(25, k))]);
  const pad = iim.length % 2 ? Uint8Array.of(0) : new Uint8Array(0);
  const size = Uint8Array.of(iim.length >>> 24, (iim.length >> 16) & 255, (iim.length >> 8) & 255, iim.length & 255);
  return concat([ascii("Photoshop 3.0\0"), ascii("8BIM"), Uint8Array.of(0x04, 0x04, 0, 0), size, iim, pad]);
}

/** A small (not colour-accurate) ICC v2 profile with a "desc" tag. */
export function buildIcc(): Uint8Array {
  const name = ascii(SAMPLE.iccName + "\0");
  const descSize = 12 + name.length + 4 + 4 + 67 + 3; // desc type with empty unicode/scriptcode parts
  const total = 128 + 4 + 12 + descSize;
  const p = new Uint8Array(total);
  const v = new DataView(p.buffer);
  v.setUint32(0, total);
  p.set(ascii("test"), 4);
  p[8] = 2;
  p[9] = 0x10;
  p.set(ascii("mntr"), 12);
  p.set(ascii("RGB "), 16);
  p.set(ascii("XYZ "), 20);
  p.set(ascii("acsp"), 36);
  v.setUint32(128, 1);
  p.set(ascii("desc"), 132);
  v.setUint32(136, 144);
  v.setUint32(140, descSize);
  p.set(ascii("desc"), 144);
  v.setUint32(152, name.length);
  p.set(name, 156);
  return p;
}

const seg = (marker: number, payload: Uint8Array) => concat([Uint8Array.of(0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff), payload]);

export type MetaOptions = { orientation?: number; gps?: boolean; icc?: boolean; thumbnail?: number };

/** Inserts EXIF, XMP, ICC, IPTC and a comment into a JPEG (right after SOI / JFIF). Adds trailing bytes too. */
export function addJpegMetadata(jpeg: Uint8Array, { orientation = 1, gps = true, icc = true, thumbnail = 0 }: MetaOptions = {}): Uint8Array {
  let at = 2;
  if (jpeg[2] === 0xff && jpeg[3] === 0xe0) at = 4 + u16be(jpeg, 4);
  const iccData = buildIcc();
  const segments = [
    seg(0xe1, concat([ascii("Exif\0\0"), buildExif({ orientation, gps, thumbnail })])),
    seg(0xe1, concat([ascii("http://ns.adobe.com/xap/1.0/\0"), new TextEncoder().encode(buildXmp())])),
    ...(icc ? [seg(0xe2, concat([ascii("ICC_PROFILE\0"), Uint8Array.of(1, 1), iccData]))] : []),
    seg(0xed, buildIptcApp13Payload()),
    seg(0xfe, ascii(SAMPLE.comment)),
  ];
  return concat([jpeg.subarray(0, at), ...segments, jpeg.subarray(at), ascii("TRAILING-DATA")]);
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, data.length);
  out.set(ascii(type), 4);
  out.set(data, 8);
  v.setUint32(8 + data.length, crc32(out, 4, 8 + data.length));
  return out;
}

async function zlib(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Inserts tEXt, zTXt, iTXt (XMP), iCCP, tIME and eXIf chunks into a PNG. */
export async function addPngMetadata(png: Uint8Array, { orientation = 1, gps = true, icc = true }: MetaOptions = {}): Promise<Uint8Array> {
  const ihdrEnd = 8 + 25;
  const enc = new TextEncoder();
  const chunks = [
    ...(icc ? [pngChunk("iCCP", concat([ascii("ICC profile\0\0"), await zlib(buildIcc())]))] : []),
    pngChunk("tEXt", concat([ascii(SAMPLE.pngText.keyword + "\0"), ascii(SAMPLE.pngText.value)])),
    pngChunk("zTXt", concat([ascii("Comment\0\0"), await zlib(ascii(SAMPLE.comment))])),
    pngChunk("iTXt", concat([ascii("XML:com.adobe.xmp\0\0\0\0\0"), enc.encode(buildXmp())])),
    pngChunk("tIME", Uint8Array.of(0x07, 0xe8, 5, 17, 14, 23, 11)),
    pngChunk("eXIf", buildExif({ orientation, gps })),
    pngChunk("prVt", ascii("private app data")),
  ];
  return concat([png.subarray(0, ihdrEnd), ...chunks, png.subarray(ihdrEnd), ascii("TRAILING")]);
}

/** Converts a WebP to the extended format (VP8X) and adds ICCP, EXIF and XMP chunks. */
export function addWebpMetadata(webp: Uint8Array, { orientation = 1, gps = true, icc = true }: MetaOptions = {}): Uint8Array {
  const chunks: { type: string; data: Uint8Array }[] = [];
  let o = 12;
  while (o + 8 <= webp.length) {
    const type = latin1(webp, o, o + 4);
    const len = u32le(webp, o + 4);
    chunks.push({ type, data: webp.subarray(o + 8, o + 8 + len) });
    o += 8 + len + (len % 2);
  }
  let width = 0;
  let height = 0;
  let alpha = false;
  let vp8x = chunks.find((c) => c.type === "VP8X");
  const image = chunks.filter((c) => c.type !== "VP8X");
  if (!vp8x) {
    const vp8 = chunks.find((c) => c.type === "VP8 ");
    const vp8l = chunks.find((c) => c.type === "VP8L");
    if (vp8) {
      width = u16le(vp8.data, 6) & 0x3fff;
      height = u16le(vp8.data, 8) & 0x3fff;
    } else if (vp8l) {
      const bits = u32le(vp8l.data, 1);
      width = (bits & 0x3fff) + 1;
      height = ((bits >> 14) & 0x3fff) + 1;
      alpha = !!((bits >> 28) & 1);
    }
    const d = new Uint8Array(10);
    d[0] = alpha ? 0x10 : 0;
    d.set([(width - 1) & 255, ((width - 1) >> 8) & 255, ((width - 1) >> 16) & 255], 4);
    d.set([(height - 1) & 255, ((height - 1) >> 8) & 255, ((height - 1) >> 16) & 255], 7);
    vp8x = { type: "VP8X", data: d };
  }
  const flags = vp8x.data.slice();
  flags[0] |= 0x08 | 0x04 | (icc ? 0x20 : 0);
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(8 + data.length + (data.length % 2));
    out.set(ascii(type), 0);
    new DataView(out.buffer).setUint32(4, data.length, true);
    out.set(data, 8);
    return out;
  };
  const body = concat([
    chunk("VP8X", flags),
    ...(icc ? [chunk("ICCP", buildIcc())] : []),
    ...image.map((c) => chunk(c.type, c.data)),
    chunk("EXIF", buildExif({ orientation, gps })),
    chunk("XMP ", new TextEncoder().encode(buildXmp())),
  ]);
  const size = 4 + body.length;
  return concat([ascii("RIFF"), Uint8Array.of(size & 255, (size >> 8) & 255, (size >> 16) & 255, size >>> 24), ascii("WEBP"), body]);
}
