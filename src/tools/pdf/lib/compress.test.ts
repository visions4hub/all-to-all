import { describe, expect, it } from "vitest";
import { PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef, decodePDFRawStream, type PDFDict } from "pdf-lib";
import { boxCodec, makeBloatedPdf, makePhotoPdf, nodeQpdf, qpdfTransform } from "./compress-fixtures";
import { CompressError, compressPdfBytes } from "./compress-core";
import { compressionOutput, verifyCompressed } from "./compress-result";
import { DEFAULT_COMPRESS, type CompressReport } from "./compress-settings";
import { stripJpegExif, targetSize, toRgba, unpredictPng } from "./image-recompress";
import { qpdfEncryption, runQpdf } from "./qpdf";
import { asInput, makePdf, openWithPdfJs, pageTexts } from "./test-fixtures";
import type { PdfOpener } from "./text-extract";

const open: PdfOpener = (data) => openWithPdfJs(data);
const deps = { qpdf: nodeQpdf, codec: boxCodec };

async function imageOf(bytes: Uint8Array, name: string) {
  const doc = await PDFDocument.load(bytes);
  const xobjects = doc.getPage(0).node.Resources()!.lookup(PDFName.of("XObject")) as PDFDict;
  const ref = xobjects.get(PDFName.of(name)) as PDFRef;
  const stream = doc.context.lookup(ref) as PDFRawStream;
  const num = (k: string) => (stream.dict.lookup(PDFName.of(k)) as PDFNumber).asNumber();
  return { stream, width: num("Width"), height: num("Height"), filter: String(stream.dict.lookup(PDFName.of("Filter"))), pixels: () => decodePDFRawStream(stream).decode() };
}

describe("image helpers", () => {
  it("targetSize keeps at least maxDpi across the page's long side", () => {
    // A4 long side 842 pt = 11.69 in → 150 dpi needs 1754.2 px, rounded up.
    expect(targetSize(2400, 2400, 842, 150)).toEqual({ width: 1755, height: 1755 });
    expect(targetSize(3000, 1500, 842, 72)).toEqual({ width: 842, height: 421 });
    // Never enlarged.
    expect(targetSize(500, 400, 842, 300)).toEqual({ width: 500, height: 400 });
  });

  it("unpredictPng reverses Sub, Up, Average and Paeth rows", () => {
    // 2×4 RGB rows with known values, encoded by hand with each filter type.
    const rows = [
      [10, 20, 30, 40, 50, 60],
      [11, 22, 33, 44, 55, 66],
      [200, 100, 50, 25, 12, 6],
      [1, 2, 3, 250, 251, 252],
    ];
    const enc: number[] = [];
    // Row 0: Sub (1)
    enc.push(1, 10, 20, 30, 40 - 10, 50 - 20, 60 - 30);
    // Row 1: Up (2)
    enc.push(2, ...rows[1].map((v, i) => (v - rows[0][i]) & 0xff));
    // Row 2: Average (3)
    enc.push(3, ...rows[2].map((v, i) => (v - (((i >= 3 ? rows[2][i - 3] : 0) + rows[1][i]) >> 1)) & 0xff));
    // Row 3: Paeth (4)
    const paeth = (a: number, b: number, c: number) => {
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
    };
    enc.push(4, ...rows[3].map((v, i) => (v - paeth(i >= 3 ? rows[3][i - 3] : 0, rows[2][i], i >= 3 ? rows[2][i - 3] : 0)) & 0xff));
    expect(Array.from(unpredictPng(Uint8Array.from(enc), 2, 3))).toEqual(rows.flat());
  });

  it("toRgba expands gray and RGB samples", () => {
    expect(Array.from(toRgba(Uint8Array.from([7, 9]), 2, 1, 1))).toEqual([7, 7, 7, 255, 9, 9, 9, 255]);
    expect(Array.from(toRgba(Uint8Array.from([1, 2, 3]), 1, 1, 3))).toEqual([1, 2, 3, 255]);
    expect(() => toRgba(Uint8Array.from([1]), 2, 2, 1)).toThrow();
  });

  it("stripJpegExif removes only the EXIF segment", () => {
    const soi = [0xff, 0xd8];
    const app0 = [0xff, 0xe0, 0x00, 0x06, 0x4a, 0x46, 0x49, 0x46]; // "JFIF"
    const exif = [0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"
    const sos = [0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0xd9];
    const out = stripJpegExif(Uint8Array.from([...soi, ...app0, ...exif, ...sos]));
    expect(Array.from(out)).toEqual([...soi, ...app0, ...sos]);
    const plain = Uint8Array.from([...soi, ...app0, ...sos]);
    expect(stripJpegExif(plain)).toBe(plain);
  });
});

describe("qpdf engine (WebAssembly, same build as the browser)", () => {
  it("reads encryption from qpdf's exit codes (only the conclusive ones)", async () => {
    const plain = await makePdf(1);
    const ownerOnly = await qpdfTransform(plain, ["--encrypt", "", "owner-secret", "256", "--"]);
    const locked = await qpdfTransform(plain, ["--encrypt", "user-secret", "owner-secret", "256", "--"]);
    const q = await nodeQpdf();
    q.FS.writeFile("/p.pdf", plain);
    q.FS.writeFile("/o.pdf", ownerOnly);
    q.FS.writeFile("/l.pdf", locked);
    q.FS.writeFile("/x.pdf", new TextEncoder().encode("not a pdf at all"));
    expect(qpdfEncryption(q, "/p.pdf")).toBe("unknown");
    expect(qpdfEncryption(q, "/o.pdf")).toBe("no-password");
    // This WebAssembly build can't tell a locked file from a damaged one; compressPdfBytes asks pdf-lib.
    expect(qpdfEncryption(q, "/l.pdf")).toBe("unknown");
    expect(qpdfEncryption(q, "/x.pdf")).toBe("unknown");
  });

  it("losslessly shrinks a wasteful PDF: same pages, same text, identical image pixels", async () => {
    const { bytes, pixels } = await makeBloatedPdf();
    const { bytes: out, report } = await compressPdfBytes(bytes, DEFAULT_COMPRESS, deps);
    expect(report).toMatchObject({ encryption: "none", images: null, imagesSkipped: null });
    // Uncompressed image (1.9 MB) + 300 KB of orphans → a small fraction remains.
    expect(bytes.length).toBeGreaterThan(2_000_000);
    expect(out.length).toBeLessThan(bytes.length * 0.1);
    expect(await pageTexts(out)).toEqual(await pageTexts(bytes));
    expect(await pageTexts(out)).toEqual(["Report page 1 Total 100 units", "Report page 2 Total 200 units", "Report page 3 Total 300 units"]);
    const img = await imageOf(out, "Im1");
    expect(img.filter).toBe("/FlateDecode");
    expect([img.width, img.height]).toEqual([800, 800]);
    expect(Buffer.from(img.pixels()).equals(Buffer.from(pixels))).toBe(true);
    // Uses object streams (PDF 1.5 cross-reference streams) and drops the orphaned objects.
    expect(new TextDecoder("latin1").decode(out)).toContain("/ObjStm");
    expect(new TextDecoder("latin1").decode(out)).not.toContain("AAAAAAAAAA");

    const v = await verifyCompressed(bytes, out, open);
    expect(v).toEqual({ ok: true, pages: 3, textChecked: true });
  });

  it("an already optimised file gives no saving, and the original is offered instead", async () => {
    const once = (await compressPdfBytes((await makeBloatedPdf()).bytes, DEFAULT_COMPRESS, deps)).bytes;
    const { bytes: twice, report } = await compressPdfBytes(once, DEFAULT_COMPRESS, deps);
    expect(twice.length).toBeGreaterThanOrEqual(once.length);
    const input = asInput(once, "ملف مضغوط.pdf");
    const result = compressionOutput(input, once, twice, report, await verifyCompressed(once, twice, open), "ar");
    expect(result.name).toBe("ملف مضغوط.pdf");
    expect(Buffer.from(await result.blob.arrayBuffer()).equals(Buffer.from(once))).toBe(true);
    expect(result.meta?.find((m) => m.label.en === "Result")?.value).toContain("لم يصغر الحجم");
    expect(result.meta?.some((m) => m.label.en === "Saved")).toBe(false);
  });

  it("a small plain PDF is not made larger", async () => {
    const plain = await makePdf(1);
    const { bytes: out, report } = await compressPdfBytes(plain, DEFAULT_COMPRESS, deps);
    const result = compressionOutput(asInput(plain, "a.pdf"), plain, out, report, await verifyCompressed(plain, out, open), "en");
    expect(result.blob.size).toBeLessThanOrEqual(plain.length);
    if (out.length >= plain.length) expect(result.meta?.find((m) => m.label.en === "Result")?.value).toContain("No reduction");
  });

  it("keeps owner-only encryption and skips the image step for such files", async () => {
    const { bytes } = await makeBloatedPdf();
    const enc = await qpdfTransform(bytes, ["--encrypt", "", "owner-secret", "256", "--"]);
    const { bytes: out, report } = await compressPdfBytes(enc, { ...DEFAULT_COMPRESS, images: true }, deps);
    expect(report.encryption).toBe("no-password");
    expect(report.imagesSkipped).toBe("encrypted");
    expect(out.length).toBeLessThan(enc.length);
    const q = await nodeQpdf();
    q.FS.writeFile("/o.pdf", out);
    expect(qpdfEncryption(q, "/o.pdf")).toBe("no-password");
    expect(await verifyCompressed(enc, out, open)).toEqual({ ok: true, pages: 3, textChecked: true });
  });

  it("refuses password-protected and unreadable files with clear codes", async () => {
    const locked = await qpdfTransform(await makePdf(1), ["--encrypt", "u", "o", "256", "--"]);
    await expect(compressPdfBytes(locked, DEFAULT_COMPRESS, deps)).rejects.toEqual(new CompressError("password"));
    await expect(compressPdfBytes(new TextEncoder().encode("%PDF-1.7 garbage"), DEFAULT_COMPRESS, deps)).rejects.toMatchObject({ code: "damaged" });
  });

  it("rebuilds files with a broken cross-reference table or stream instead of failing", async () => {
    for (const objectStreams of [true, false]) {
      const good = await (await PDFDocument.load(await makePdf(2))).save({ useObjectStreams: objectStreams });
      // Node's "latin1" maps bytes 1:1 (TextDecoder's "latin1" is Windows-1252 and would corrupt streams).
      const text = Buffer.from(good).toString("latin1");
      const broken = new Uint8Array(Buffer.from(text.replace(/startxref\s+\d+/, "startxref\n99999"), "latin1"));
      const { bytes: out, report } = await compressPdfBytes(broken, DEFAULT_COMPRESS, deps);
      expect(report.repaired).toBe(true);
      expect(await pageTexts(out)).toEqual(["Page 1", "Page 2"]);
      expect(await verifyCompressed(broken, out, open)).toEqual({ ok: true, pages: 2, textChecked: true });
    }
  });
});

describe("optional image recompression (lossy)", () => {
  it("downsamples a large photo to the chosen DPI, keeps text as text, and decodes PNG predictors correctly", async () => {
    const photo = await makePhotoPdf();
    const lossless = await compressPdfBytes(photo, DEFAULT_COMPRESS, deps);
    const lossy = await compressPdfBytes(photo, { images: true, maxDpi: 72, quality: 75 }, deps);
    expect(lossy.report.images).toMatchObject({ found: 1, recompressed: 1 });
    expect(lossy.bytes.length).toBeLessThan(lossless.bytes.length);

    const img = await imageOf(lossy.bytes, "Photo");
    // A4 long side 842 pt at 72 dpi → 842 px.
    expect([img.width, img.height]).toEqual([842, 842]);
    const px = img.pixels();
    expect(Array.from(px.subarray(0, 3))).toEqual([220, 30, 30]); // top-left quadrant: red
    expect(Array.from(px.subarray(px.length - 3))).toEqual([255, 255, 255]); // bottom-right: white
    // Page and text untouched (the caption is still real text, not part of an image).
    expect(await pageTexts(lossy.bytes)).toEqual(["Photo caption stays text"]);
    expect(await verifyCompressed(photo, lossy.bytes, open)).toEqual({ ok: true, pages: 1, textChecked: true });
  });

  it("leaves images alone when the codec can't make them smaller", async () => {
    const photo = await makePhotoPdf();
    const never = { encode: async () => null };
    const { report, bytes } = await compressPdfBytes(photo, { images: true, maxDpi: 72, quality: 75 }, { qpdf: nodeQpdf, codec: never });
    expect(report.images).toMatchObject({ found: 1, recompressed: 0 });
    expect((await imageOf(bytes, "Photo")).width).toBe(2400);
  });

  it("without an image codec (browser lacks OffscreenCanvas) images are left alone and the reason is shown", async () => {
    const photo = await makePhotoPdf();
    const { report, bytes } = await compressPdfBytes(photo, { images: true, maxDpi: 72, quality: 75 }, { qpdf: nodeQpdf });
    expect(report).toMatchObject({ images: null, imagesSkipped: "browser" });
    expect((await imageOf(bytes, "Photo")).width).toBe(2400);
    // The note is shown whether or not the lossless step made the file smaller.
    const out = compressionOutput(asInput(photo, "p.pdf"), photo, photo, report, null, "en");
    expect(out.meta?.find((m) => m.label.en === "Note")?.value).toContain("this browser can't encode images");
  });

  it("doesn't touch small images, masks or images it can't decode exactly", async () => {
    const { bytes } = await makeBloatedPdf();
    // 800×800 on A4 at 300 dpi needs 3508 px, so the image isn't resized; Flate re-encode
    // from the box codec equals the original size class, so it's only replaced if smaller.
    const { report } = await compressPdfBytes(bytes, { images: true, maxDpi: 300, quality: 75 }, deps);
    expect(report.images?.found).toBe(1);
    const small = await makePdf(1);
    const r2 = await compressPdfBytes(small, { images: true, maxDpi: 72, quality: 75 }, deps);
    expect(r2.report.images).toMatchObject({ found: 0, recompressed: 0 });
  });
});

describe("verification and result", () => {
  it("rejects outputs with different page counts or text", async () => {
    const a = await makePdf(3);
    expect(await verifyCompressed(a, await makePdf(2), open)).toEqual({ ok: false, reason: "pages" });
    expect(await verifyCompressed(a, await makePdf(3, { label: "Seite" }), open)).toEqual({ ok: false, reason: "text" });
    expect(await verifyCompressed(a, new TextEncoder().encode("nope"), open)).toEqual({ ok: false, reason: "unreadable" });
  });

  it("a smaller file that failed the check is never offered", async () => {
    const a = (await makeBloatedPdf()).bytes;
    const fakeSmaller = await makePdf(1);
    const report: CompressReport = { encryption: "none", images: null, imagesSkipped: null, repaired: false };
    const out = compressionOutput(asInput(a, "x.pdf"), a, fakeSmaller, report, { ok: false, reason: "pages" }, "en");
    expect(out.blob.size).toBe(a.length);
    expect(out.meta?.find((m) => m.label.en === "Result")?.value).toContain("failed the check");
  });

  it("reports exact sizes and the real percentage", async () => {
    const original = new Uint8Array(1000);
    const smaller = new Uint8Array(250);
    const report: CompressReport = { encryption: "none", images: null, imagesSkipped: null, repaired: false };
    const out = compressionOutput(asInput(original, "تقرير.pdf"), original, smaller, report, { ok: true, pages: 2, textChecked: true }, "ar");
    expect(out.name).toBe("تقرير-compressed.pdf");
    expect(out.blob.size).toBe(250);
    expect(out.meta?.find((m) => m.label.en === "Saved")?.value).toBe("750 B (75%)");
    expect(out.meta?.find((m) => m.label.en === "Original size")?.value).toBe("1000 B");
  });
});

it("qpdf exit code helper treats thrown exit statuses as codes", () => {
  const fake = { callMain: () => { throw { status: 2 }; }, FS: {} as never };
  expect(runQpdf(fake, [])).toBe(2);
});
