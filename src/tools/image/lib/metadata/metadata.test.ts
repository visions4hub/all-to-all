import { describe, expect, it } from "vitest";
import { deflateSync, inflateSync } from "node:zlib";
import { crc32 } from "../png";
import { ascii, concat, latin1, u32be, u32le } from "./bytes";
import { parseIcc } from "./icc";
import { readMetadata, stripMetadata, DamagedFileError, type StripOptions } from "./index";
import { jpegParts } from "./jpeg";
import { pngChunks } from "./png-meta";
import { webpChunks } from "./webp";
import { parseExif } from "./tiff";
import { parseXmp } from "./xmp";
import { addJpegMetadata, addPngMetadata, addWebpMetadata, buildExif, buildIcc, SAMPLE } from "./test-fixtures";

// ---------- Base images with no metadata ----------

const seg = (marker: number, payload: number[] | Uint8Array) =>
  Uint8Array.from([0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload]);

/** A structurally complete baseline JPEG (16×8, 4:2:0). Its entropy data contains stuffed bytes and restart markers. */
function baseJpeg(progressive = false): Uint8Array {
  const jfif = seg(0xe0, [...ascii("JFIF\0"), 1, 2, 1, 0, 72, 0, 72, 0, 0]);
  const dqt = seg(0xdb, [0, ...Array.from({ length: 64 }, (_, i) => (i % 50) + 1)]);
  const sof = seg(progressive ? 0xc2 : 0xc0, [8, 0, 8, 0, 16, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  const dht = seg(0xc4, [0, ...Array.from({ length: 16 }, () => 0), 0]);
  const adobe = seg(0xee, [...ascii("Adobe"), 0, 100, 0, 0, 0, 0, 1]);
  const sos = seg(0xda, [3, 1, 0, 2, 0x11, 3, 0x11, 0, 63, 0]);
  const scan = Uint8Array.from([0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56, 0xff, 0x00, 0xff, 0xd1, 0x78, 0x9a]);
  const parts = [Uint8Array.of(0xff, 0xd8), jfif, adobe, dqt, sof, dht, sos, scan];
  if (progressive) parts.push(dht, sos, Uint8Array.of(0xab, 0xff, 0x00, 0xcd));
  parts.push(Uint8Array.of(0xff, 0xd9));
  return concat(parts);
}

function pngChunk(type: string, data: Uint8Array) {
  const out = new Uint8Array(12 + data.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, data.length);
  out.set(ascii(type), 4);
  out.set(data, 8);
  v.setUint32(8 + data.length, crc32(out, 4, 8 + data.length));
  return out;
}

/** A real 2×2 RGB PNG. */
function basePng(): Uint8Array {
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, 2);
  v.setUint32(4, 2);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const raw = Uint8Array.from([0, 255, 0, 0, 0, 255, 0, 0, 0, 0, 255, 255, 255, 0]);
  return concat([Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), pngChunk("IHDR", ihdr), pngChunk("pHYs", Uint8Array.of(0, 0, 0x0e, 0xc4, 0, 0, 0x0e, 0xc4, 1)), pngChunk("IDAT", deflateSync(raw)), pngChunk("IEND", new Uint8Array(0))]);
}

function riff(chunks: Uint8Array[]) {
  const body = concat(chunks);
  const size = 4 + body.length;
  return concat([ascii("RIFF"), Uint8Array.of(size & 255, (size >> 8) & 255, (size >> 16) & 255, size >>> 24), ascii("WEBP"), body]);
}
const webpChunk = (type: string, data: Uint8Array) => {
  const out = new Uint8Array(8 + data.length + (data.length % 2));
  out.set(ascii(type));
  new DataView(out.buffer).setUint32(4, data.length, true);
  out.set(data, 8);
  return out;
};

/** A simple-format lossless WebP header (30×20 with alpha); the bitstream after the header is filler. */
function baseWebp(): Uint8Array {
  const bits = 29 | (19 << 14) | (1 << 28);
  return riff([webpChunk("VP8L", Uint8Array.of(0x2f, bits & 255, (bits >> 8) & 255, (bits >> 16) & 255, bits >>> 24, 1, 2, 3, 4))]);
}

const KEEP_ICC: StripOptions = { keepIcc: true, keepOrientation: false };
const DROP_ALL: StripOptions = { keepIcc: false, keepOrientation: false };

const contains = (b: Uint8Array, s: string) => latin1(b).includes(s) || new TextDecoder().decode(b).includes(s);
const SECRETS = [SAMPLE.make, SAMPLE.model, SAMPLE.lens, SAMPLE.xmpCreator, SAMPLE.iptcCity, SAMPLE.comment, "TRAILING", "Exif", "8BIM", SAMPLE.software];

// ---------- JPEG ----------

describe("JPEG metadata", () => {
  it("reads camera, capture, GPS, XMP, IPTC, comment, ICC and image facts", async () => {
    const file = addJpegMetadata(baseJpeg(), { orientation: 6, thumbnail: 40 });
    const r = await readMetadata(file);
    expect(r.format).toBe("jpeg");
    expect([r.width, r.height]).toEqual([16, 8]);
    expect(r.orientation).toBe(6);
    expect(r.colour).toMatchObject({ bitDepth: 8, components: 3, subsampling: "4:2:0", progressive: false, colourType: "YCbCr", dpi: 72 });
    expect(r.colour.icc?.name).toBe(SAMPLE.iccName);
    const t = r.exif!.tags;
    expect(t.Make).toBe(SAMPLE.make);
    expect(t.Model).toBe(SAMPLE.model);
    expect(t.LensModel).toBe(SAMPLE.lens);
    expect(t.Artist).toBe(SAMPLE.artist);
    expect(t.DateTimeOriginal).toBe(SAMPLE.dateTimeOriginal);
    expect(t.ExposureTime).toBeCloseTo(1 / 250);
    expect(t.FNumber).toBeCloseTo(1.8);
    expect(t.ISO).toBe(400);
    expect(r.exif!.gps!.latitude).toBeCloseTo(33 + 18 / 60 + 54 / 3600, 6);
    expect(r.exif!.gps!.longitude).toBeCloseTo(44 + 21 / 60 + 36 / 3600, 6);
    expect(r.exif!.gps!.altitude).toBeCloseTo(34);
    expect(r.exif!.thumbnailBytes).toBe(40);
    expect(r.xmp["xmp:CreatorTool"]).toBe(SAMPLE.xmpTool);
    expect(r.xmp["dc:creator"]).toBe(SAMPLE.xmpCreator);
    expect(r.xmp["dc:rights"]).toBe("© Test & Co");
    expect(r.iptc).toMatchObject({ Byline: [SAMPLE.iptcByline], City: [SAMPLE.iptcCity], Keywords: SAMPLE.iptcKeywords });
    expect(r.comments).toEqual([SAMPLE.comment]);
    expect(r.blocks.map((b) => b.kind)).toEqual(["exif", "xmp", "icc", "iptc", "comment", "trailing"]);
  });

  it("every byte belongs to exactly one part (stuffed bytes and restart markers stay inside the scan)", () => {
    for (const progressive of [false, true]) {
      const file = addJpegMetadata(baseJpeg(progressive));
      const parts = jpegParts(file);
      expect(parts[0].start).toBe(0);
      for (let i = 1; i < parts.length; i++) expect(parts[i].start).toBe(parts[i - 1].end);
      expect(parts.at(-1)!.end).toBe(file.length);
      expect(parts.filter((p) => p.marker === 0xda)).toHaveLength(progressive ? 2 : 1);
    }
  });

  it("removing everything gives back the original image bytes exactly", async () => {
    for (const progressive of [false, true]) {
      const base = baseJpeg(progressive);
      const res = stripMetadata(addJpegMetadata(base, { thumbnail: 20 }), DROP_ALL);
      expect(res.bytes).toEqual(base);
      expect(res.removed.map((b) => b.kind)).toEqual(["exif", "xmp", "icc", "iptc", "comment", "trailing"]);
      expect(res.kept).toEqual([]);
      for (const s of SECRETS) expect(contains(res.bytes, s), s).toBe(false);
      const after = await readMetadata(res.bytes);
      expect(after.exif).toBeNull();
      expect(after.blocks).toEqual([]);
    }
  });

  it("keeps the ICC profile when asked, and nothing else", async () => {
    const base = baseJpeg();
    const res = stripMetadata(addJpegMetadata(base), KEEP_ICC);
    expect(res.kept.map((b) => b.kind)).toEqual(["icc"]);
    const after = await readMetadata(res.bytes);
    expect(after.colour.icc?.name).toBe(SAMPLE.iccName);
    expect(after.blocks.map((b) => b.kind)).toEqual(["icc"]);
    expect(after.exif).toBeNull();
    // Removing the ICC segment too gives the base image.
    expect(stripMetadata(res.bytes, DROP_ALL).bytes).toEqual(base);
  });

  it("keeps only the orientation tag (no camera, no GPS)", async () => {
    const base = baseJpeg();
    const res = stripMetadata(addJpegMetadata(base, { orientation: 6 }), { keepIcc: false, keepOrientation: true }, 6);
    expect(res.orientationKept).toBe(6);
    const after = await readMetadata(res.bytes);
    expect(after.orientation).toBe(6);
    expect(Object.keys(after.exif!.tags)).toEqual(["Orientation"]);
    expect(after.exif!.gps).toBeNull();
    for (const s of SECRETS.filter((s) => s !== "Exif")) expect(contains(res.bytes, s), s).toBe(false);
    // The tag goes right after JFIF; the rest is the base image unchanged.
    const parts = jpegParts(res.bytes);
    expect(parts[2].block?.kind).toBe("exif");
    expect(concat(parts.filter((p) => !p.block).map((p) => res.bytes.subarray(p.start, p.end)))).toEqual(base);
  });

  it("orientation 1 needs no tag", () => {
    const res = stripMetadata(addJpegMetadata(baseJpeg(), { orientation: 1 }), { keepIcc: false, keepOrientation: true }, 1);
    expect(res.orientationKept).toBeNull();
    expect(res.bytes).toEqual(baseJpeg());
  });

  it("a file with no metadata comes back unchanged", () => {
    const base = baseJpeg();
    const res = stripMetadata(base, DROP_ALL);
    expect(res.bytes).toEqual(base);
    expect(res.removed).toEqual([]);
  });

  it("refuses a truncated segment instead of writing a broken file", () => {
    const file = addJpegMetadata(baseJpeg());
    expect(() => stripMetadata(file.subarray(0, 30), DROP_ALL)).toThrow(DamagedFileError);
  });

  it("drops other APPn segments but keeps Adobe APP14 (needed for colours)", () => {
    const base = baseJpeg();
    const ducky = seg(0xec, [...ascii("Ducky"), 1, 0, 4, 0, 0, 0, 60, 0, 0]);
    const file = concat([base.subarray(0, 2), ducky, base.subarray(2)]);
    const res = stripMetadata(file, DROP_ALL);
    expect(res.removed).toEqual([{ kind: "app", bytes: ducky.length, detail: "APP12 Ducky" }]);
    expect(res.bytes).toEqual(base);
  });
});

// ---------- EXIF details ----------

describe("EXIF parser", () => {
  it("reads big-endian (Motorola) EXIF the same", () => {
    const le = parseExif(buildExif({ orientation: 3 }));
    const be = parseExif(buildExif({ orientation: 3, bigEndian: true }));
    expect(be.tags).toEqual(le.tags);
    expect(be.gps).toEqual(le.gps);
    expect(be.orientation).toBe(3);
  });

  it("survives damaged data without throwing", () => {
    const exif = buildExif();
    for (const n of [0, 4, 8, 13, 40, 90]) expect(() => parseExif(exif.subarray(0, n))).not.toThrow();
    const looped = exif.slice();
    looped[4] = 8; // IFD0 pointing to itself is fine; a next-IFD loop must not hang
    expect(() => parseExif(looped)).not.toThrow();
  });

  it("no GPS block means no location", () => {
    expect(parseExif(buildExif({ gps: false })).gps).toBeNull();
  });
});

describe("XMP and ICC readers", () => {
  it("reads attribute and element forms and decodes entities", () => {
    const xmp = parseXmp(`<x><rdf:Description photoshop:City="Basra &amp; Co"><dc:title><rdf:Alt><rdf:li xml:lang="x-default">عنوان</rdf:li></rdf:Alt></dc:title><dc:subject><rdf:Bag><rdf:li>a</rdf:li><rdf:li>b</rdf:li></rdf:Bag></dc:subject></rdf:Description></x>`);
    expect(xmp).toEqual({ "photoshop:City": "Basra & Co", "dc:title": "عنوان", "dc:subject": "a, b" });
  });

  it("reads an ICC v2 description and v4 mluc names", () => {
    expect(parseIcc(buildIcc())).toMatchObject({ name: SAMPLE.iccName, colourSpace: "RGB", deviceClass: "mntr", version: "2.1" });
    const p = buildIcc();
    const name = "Display P3";
    const mluc = new Uint8Array(28 + name.length * 2);
    const v = new DataView(mluc.buffer);
    mluc.set(ascii("mluc"));
    v.setUint32(8, 1);
    v.setUint32(12, 12);
    mluc.set(ascii("enUS"), 16);
    v.setUint32(20, name.length * 2);
    v.setUint32(24, 28);
    for (let i = 0; i < name.length; i++) v.setUint16(28 + i * 2, name.charCodeAt(i));
    const profile = concat([p.subarray(0, 144), mluc]);
    new DataView(profile.buffer).setUint32(140, mluc.length);
    expect(parseIcc(profile).name).toBe(name);
  });
});

// ---------- PNG ----------

describe("PNG metadata", () => {
  it("reads text chunks, XMP, eXIf (GPS), tIME, iCCP and image facts", async () => {
    const r = await readMetadata(await addPngMetadata(basePng(), { orientation: 8 }));
    expect([r.width, r.height]).toEqual([2, 2]);
    expect(r.colour).toMatchObject({ bitDepth: 8, colourType: "RGB", alpha: false, interlaced: false, dpi: 96 });
    expect(r.colour.icc?.name).toBe(SAMPLE.iccName);
    expect(r.orientation).toBe(8);
    expect(r.exif!.gps!.latitude).toBeCloseTo(33.315, 3);
    expect(r.xmp["dc:creator"]).toBe(SAMPLE.xmpCreator);
    expect(r.texts).toEqual([
      { keyword: SAMPLE.pngText.keyword, value: SAMPLE.pngText.value },
      { keyword: "Comment", value: SAMPLE.comment },
    ]);
    expect(r.blocks.map((b) => [b.kind, b.detail])).toEqual([
      ["icc", undefined],
      ["text", "Author"],
      ["text", "Comment"],
      ["xmp", undefined],
      ["time", undefined],
      ["exif", undefined],
      ["app", "prVt"],
      ["trailing", undefined],
    ]);
  });

  it("removing everything gives back the original PNG exactly, and pixels decode the same", async () => {
    const base = basePng();
    const res = stripMetadata(await addPngMetadata(base), DROP_ALL);
    expect(res.bytes).toEqual(base);
    expect(res.removed.map((b) => b.kind)).toEqual(["icc", "text", "text", "xmp", "time", "exif", "app", "trailing"]);
    for (const s of [...SECRETS, "tEXt", "zTXt", "iTXt", "tIME", "eXIf"]) expect(contains(res.bytes, s), s).toBe(false);
    const idat = pngChunks(res.bytes).find((c) => c.type === "IDAT")!;
    expect(Array.from(inflateSync(idat.data))).toEqual([0, 255, 0, 0, 0, 255, 0, 0, 0, 0, 255, 255, 255, 0]);
  });

  it("keeps iCCP when asked, and writes a valid orientation-only eXIf before IDAT", async () => {
    const res = stripMetadata(await addPngMetadata(basePng(), { orientation: 6 }), { keepIcc: true, keepOrientation: true }, 6);
    const chunks = pngChunks(res.bytes);
    expect(chunks.map((c) => c.type)).toEqual(["", "IHDR", "iCCP", "pHYs", "eXIf", "IDAT", "IEND"]);
    for (const c of chunks.slice(1)) expect(u32be(res.bytes, c.end - 4)).toBe(crc32(res.bytes, c.start + 4, c.end - 4));
    const after = await readMetadata(res.bytes);
    expect(after.orientation).toBe(6);
    expect(Object.keys(after.exif!.tags)).toEqual(["Orientation"]);
    expect(after.colour.icc?.name).toBe(SAMPLE.iccName);
  });

  it("never drops unknown critical chunks", () => {
    const base = basePng();
    const file = concat([base.subarray(0, 33), pngChunk("ZZZZ", ascii("x")), base.subarray(33)]);
    expect(stripMetadata(file, DROP_ALL).bytes).toEqual(file);
  });

  it("refuses a truncated chunk", async () => {
    const file = await addPngMetadata(basePng());
    expect(() => stripMetadata(file.subarray(0, 60), DROP_ALL)).toThrow(DamagedFileError);
  });
});

// ---------- WebP ----------

describe("WebP metadata", () => {
  it("reads VP8X facts, EXIF (GPS), XMP and ICCP", async () => {
    const r = await readMetadata(addWebpMetadata(baseWebp(), { orientation: 3 }));
    expect([r.width, r.height]).toEqual([30, 20]);
    expect(r.colour).toMatchObject({ alpha: true, compression: "lossless", animated: false });
    expect(r.colour.icc?.name).toBe(SAMPLE.iccName);
    expect(r.orientation).toBe(3);
    expect(r.exif!.tags.Make).toBe(SAMPLE.make);
    expect(r.exif!.gps).not.toBeNull();
    expect(r.xmp["xmp:CreatorTool"]).toBe(SAMPLE.xmpTool);
    expect(r.blocks.map((b) => b.kind)).toEqual(["icc", "exif", "xmp"]);
  });

  it("drops EXIF/XMP/ICCP, clears the VP8X flags, fixes the RIFF size, keeps the bitstream identical", async () => {
    const base = baseWebp();
    const res = stripMetadata(addWebpMetadata(base), DROP_ALL);
    expect(res.removed.map((b) => b.kind)).toEqual(["icc", "exif", "xmp"]);
    const chunks = webpChunks(res.bytes);
    expect(chunks.map((c) => c.type)).toEqual(["VP8X", "VP8L"]);
    expect(chunks[0].data[0]).toBe(0x10); // only the alpha flag is left
    expect(u32le(res.bytes, 4)).toBe(res.bytes.length - 8);
    expect(chunks[1].data).toEqual(webpChunks(base)[0].data);
    for (const s of SECRETS) expect(contains(res.bytes, s), s).toBe(false);
    expect((await readMetadata(res.bytes)).blocks).toEqual([]);
  });

  it("keeps ICCP (flag set) and an orientation-only EXIF chunk (flag set) when asked", async () => {
    const res = stripMetadata(addWebpMetadata(baseWebp(), { orientation: 6 }), { keepIcc: true, keepOrientation: true }, 6);
    const chunks = webpChunks(res.bytes);
    expect(chunks.map((c) => c.type)).toEqual(["VP8X", "ICCP", "VP8L", "EXIF"]);
    expect(chunks[0].data[0]).toBe(0x10 | 0x20 | 0x08);
    expect(u32le(res.bytes, 4)).toBe(res.bytes.length - 8);
    const after = await readMetadata(res.bytes);
    expect(after.orientation).toBe(6);
    expect(Object.keys(after.exif!.tags)).toEqual(["Orientation"]);
  });

  it("a simple WebP without metadata comes back unchanged", () => {
    const base = baseWebp();
    expect(stripMetadata(base, DROP_ALL).bytes).toEqual(base);
  });
});

// ---------- Display rows and summaries ----------

import { describeMetadata, formatExposure } from "./describe";
import { cleanLossless, summarizeBlocks } from "./clean";

describe("metadata display", () => {
  it("groups the fields with formatted values and marks private ones", async () => {
    const r = await readMetadata(addJpegMetadata(baseJpeg(), { orientation: 6 }));
    const groups = describeMetadata(r, "1 KB");
    expect(groups.map((g) => g.id)).toEqual(["file", "colour", "camera", "capture", "location", "rights"]);
    const rows = Object.fromEntries(groups.flatMap((g) => g.rows).map((row) => [row.id, row]));
    expect(rows.dimensions.value).toBe("16×8");
    expect(rows.orientation.value).toEqual({ ar: "يُعرض مدوّراً 90° مع عقارب الساعة", en: "Shown rotated 90° clockwise" });
    expect(rows.icc.value).toBe(SAMPLE.iccName);
    expect(rows.make.value).toBe(SAMPLE.make);
    expect(rows.lens.value).toBe(SAMPLE.lens);
    expect(rows.exposure.value).toBe("1/250 s");
    expect(rows.aperture.value).toBe("f/1.8");
    expect(rows.iso.value).toBe("400");
    expect(rows["date-original"].value).toBe("2024-05-17 14:23:11");
    expect(rows.gps).toMatchObject({ value: "33.315000, 44.360000", sensitive: true });
    expect(rows.altitude.value).toBe("34 m");
    expect(rows.city.value).toBe(SAMPLE.iptcCity);
    expect(rows.artist.value).toBe(SAMPLE.artist);
    expect(rows.copyright.value).toBe("© Test & Co");
    expect(rows.keywords.value).toBe("one, two");
    expect(rows["comment-0"].value).toBe(SAMPLE.comment);
    expect(formatExposure(2)).toBe("2 s");
  });

  it("a clean file shows only file and colour facts", async () => {
    const groups = describeMetadata(await readMetadata(basePng()), "100 B");
    expect(groups.map((g) => g.id)).toEqual(["file", "colour"]);
  });

  it("summarises removed blocks in either language", () => {
    const res = stripMetadata(addJpegMetadata(baseJpeg()), KEEP_ICC);
    expect(summarizeBlocks(res.removed, (l) => l.en)).toMatch(/^EXIF \(camera, date, location\) · [\d.]+ (B|KB), XMP · .+, IPTC \/ Photoshop · .+, Comment · .+, Data after the image end · 13 B$/);
    expect(summarizeBlocks(res.removed, (l) => l.ar)).toContain("، ");
  });

  it("self-checked clean keeps only what was chosen", async () => {
    const file = addJpegMetadata(baseJpeg(), { orientation: 6 });
    const report = await readMetadata(file);
    const res = await cleanLossless(file, report, { keepIcc: true, keepOrientation: true });
    expect(res.kept.map((b) => b.kind)).toEqual(["icc"]);
    expect(res.orientationKept).toBe(6);
  });
});
