import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, PDFName, PDFDict, PDFHexString, PDFNumber, PDFRawStream, StandardFonts, concatTransformationMatrix, drawObject, popGraphicsState, pushGraphicsState } from "pdf-lib";
import { closeSettings, downloadResult, L, loadPdf, openSettings, openTool, pageTexts, pdfUpload, runTool, unzip, upload, type Locale } from "./helpers";

// ---- Fixtures --------------------------------------------------------------------

/** 3 text pages, an uncompressed 800×800 image and 300 KB of unreferenced objects. */
async function bloatedPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const n = 800;
  const px = new Uint8Array(n * n * 3);
  for (let i = 0; i < n * n; i++) {
    px[i * 3] = (i % n) * 0.3;
    px[i * 3 + 1] = Math.floor(i / n) * 0.3;
    px[i * 3 + 2] = 128;
  }
  const img = doc.context.register(doc.context.stream(px, { Type: "XObject", Subtype: "Image", Width: n, Height: n, ColorSpace: "DeviceRGB", BitsPerComponent: 8 }));
  for (let i = 0; i < 3; i++) doc.context.register(doc.context.stream(new Uint8Array(100_000).fill(65 + i)));
  for (let p = 1; p <= 3; p++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`Annual report page ${p}`, { x: 50, y: 780, size: 22, font });
    if (p === 1) {
      page.node.setXObject(PDFName.of("Im1"), img);
      page.pushOperators(pushGraphicsState(), concatTransformationMatrix(400, 0, 0, 400, 50, 200), drawObject("Im1"), popGraphicsState());
    }
  }
  return doc.save({ useObjectStreams: false });
}

/** Large noisy JPEG and PNG made by the browser's own encoders, placed on A4 pages with a caption. */
async function photoPdf(page: Page): Promise<Uint8Array> {
  // Base64 keeps the transfer out of the browser fast (number arrays of megabytes are slow).
  const data = await page.evaluate(async () => {
    const b64 = (blob: Blob) =>
      new Promise<string>((r) => {
        const fr = new FileReader();
        fr.onload = () => r(String(fr.result).split(",")[1]);
        fr.readAsDataURL(blob);
      });
    const paint = (w: number, h: number) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const x = c.getContext("2d")!;
      const g = x.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, "#1d4ed8");
      g.addColorStop(1, "#f59e0b");
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
      // Fine detail so the image is large, like a real photo.
      const img = x.getImageData(0, 0, w, h);
      let s = 12345;
      for (let i = 0; i < img.data.length; i += 4) {
        s = (s * 1664525 + 1013904223) >>> 0;
        const d = (s >>> 24) % 48;
        img.data[i] += d;
        img.data[i + 1] += d;
        img.data[i + 2] += d;
      }
      x.putImageData(img, 0, 0);
      return { c, img };
    };
    const photo = paint(3000, 2000).c;
    const jpg = await b64(await new Promise<Blob>((r) => photo.toBlob((b) => r(b!), "image/jpeg", 0.95)));
    const { img } = paint(1600, 1200);
    const rgb = new Uint8Array(1600 * 1200 * 3);
    for (let i = 0, o = 0; i < img.data.length; i += 4) {
      rgb[o++] = img.data[i];
      rgb[o++] = img.data[i + 1];
      rgb[o++] = img.data[i + 2];
    }
    return { jpg, rgb: await b64(new Blob([rgb])) };
  });
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const jpg = await doc.embedJpg(Buffer.from(data.jpg, "base64"));
  // A Flate RGB image, as many PDF producers write PNG-like images.
  const raw = doc.context.register(
    doc.context.flateStream(Buffer.from(data.rgb, "base64"), { Type: "XObject", Subtype: "Image", Width: 1600, Height: 1200, ColorSpace: "DeviceRGB", BitsPerComponent: 8 }),
  );
  const p1 = doc.addPage([595, 842]);
  p1.drawImage(jpg, { x: 0, y: 300, width: 595, height: 397 });
  p1.drawText("Holiday photo caption", { x: 50, y: 780, size: 20, font });
  const p2 = doc.addPage([595, 842]);
  p2.node.setXObject(PDFName.of("Chart"), raw);
  p2.pushOperators(pushGraphicsState(), concatTransformationMatrix(595, 0, 0, 446, 0, 300), drawObject("Chart"), popGraphicsState());
  p2.drawText("Chart caption", { x: 50, y: 780, size: 20, font });
  return doc.save();
}

/** A file whose trailer says it is encrypted with a password we don't have. */
async function lockedPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage();
  const hex = (n: number) => PDFHexString.of("ab".repeat(n));
  const enc = doc.context.obj({ Filter: "Standard", V: 2, R: 3, Length: 128, P: PDFNumber.of(-3904) }) as PDFDict;
  enc.set(PDFName.of("O"), hex(32));
  enc.set(PDFName.of("U"), hex(32));
  doc.context.trailerInfo.Encrypt = doc.context.register(enc);
  return doc.save({ useObjectStreams: false });
}

function imagesOf(doc: PDFDocument) {
  const out: { width: number; filter: string }[] = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream) || obj.dict.get(PDFName.of("Subtype")) !== PDFName.of("Image")) continue;
    out.push({ width: (obj.dict.lookup(PDFName.of("Width")) as PDFNumber).asNumber(), filter: String(obj.dict.lookup(PDFName.of("Filter"))) });
  }
  return out.sort((a, b) => b.width - a.width);
}

const results = (page: Page) => page.locator("section[aria-live=polite]");
const action = (locale: Locale) => L(locale, "ضغط PDF", "Compress PDF");

// ---- Tests -----------------------------------------------------------------------

for (const locale of ["ar", "en"] as Locale[]) {
  test(`compress: lossless, real saving, same pages and text (${locale})`, async ({ page }) => {
    await openTool(page, "compress-pdf", locale);
    const input = await bloatedPdf();
    await upload(page, [pdfUpload("التقرير السنوي.pdf", input)]);
    await runTool(page, action(locale));
    await expect(page.locator("html")).toHaveAttribute("data-pdf-compress-worker", "running");
    const out = await downloadResult(page, locale);
    expect(out.name).toBe("التقرير السنوي-compressed.pdf");
    expect(out.bytes.length).toBeLessThan(input.length * 0.1);
    const doc = await loadPdf(out.bytes);
    expect(doc.getPageCount()).toBe(3);
    expect(await pageTexts(out.bytes)).toEqual(await pageTexts(input));
    // The real numbers are shown: original size, saving and method.
    const saved = Math.round(((input.length - out.bytes.length) / input.length) * 1000) / 10;
    await expect(results(page)).toContainText(L(locale, "الموفَّر", "Saved"));
    await expect(results(page)).toContainText(`(${saved}%)`);
    await expect(results(page)).toContainText(L(locale, "تحسين البنية دون أي فقد", "Lossless structure optimisation"));
  });
}

test("compress: an already optimised file is returned unchanged and labelled", async ({ page }) => {
  await openTool(page, "compress-pdf", "en");
  await upload(page, [pdfUpload("report.pdf", await bloatedPdf())]);
  await runTool(page, "Compress PDF");
  const once = await downloadResult(page, "en");

  await page.getByRole("button", { name: /Start over|New/ }).first().click().catch(() => undefined);
  await openTool(page, "compress-pdf", "en");
  await upload(page, [pdfUpload("report-compressed.pdf", once.bytes)]);
  await runTool(page, "Compress PDF");
  await expect(results(page)).toContainText("No reduction");
  const again = await downloadResult(page, "en");
  expect(again.name).toBe("report-compressed.pdf");
  expect(Buffer.compare(again.bytes, once.bytes)).toBe(0);
});

test("compress: optional image recompression downsamples photos, text stays text (ar)", async ({ page }) => {
  await openTool(page, "compress-pdf", "ar");
  const input = await photoPdf(page);
  await upload(page, [pdfUpload("صور الرحلة.pdf", input)]);
  const settings = await openSettings(page, "ar");
  await settings.getByRole("switch", { name: "إعادة ضغط الصور أيضاً (بفقد في الجودة)" }).click();
  await expect(settings.getByText("هذا الخيار يفقد جزءاً من جودة الصور")).toBeVisible();
  await settings.getByRole("radio", { name: "72 DPI" }).click();
  // Image recompression needs OffscreenCanvas in the worker. Playwright's WebKit build (and
  // Safari before 16.4) lacks it: the tool must say so up front and in the result, and only
  // the lossless step runs.
  const canvasOk = await page.evaluate(() => typeof OffscreenCanvas !== "undefined");
  if (!canvasOk) {
    await expect(settings.getByTestId("images-unsupported")).toContainText("هذا المتصفح لا يدعم إعادة ضغط الصور");
    await closeSettings(page);
    await runTool(page, "ضغط PDF");
    await expect(results(page)).toContainText("لم يُعَد ضغط الصور: هذا المتصفح لا يدعم ترميز الصور");
    const kept = await downloadResult(page, "ar");
    expect(kept.bytes.length).toBeLessThanOrEqual(input.length);
    expect(imagesOf(await loadPdf(kept.bytes)).map((i) => i.width)).toEqual([3000, 1600]);
    return;
  }
  await expect(settings.getByTestId("images-unsupported")).toHaveCount(0);
  await closeSettings(page);
  await runTool(page, "ضغط PDF");
  const out = await downloadResult(page, "ar");
  expect(out.bytes.length).toBeLessThan(input.length * 0.5);
  const doc = await loadPdf(out.bytes);
  expect(doc.getPageCount()).toBe(2);
  expect(await pageTexts(out.bytes)).toEqual(["Holiday photo caption", "Chart caption"]);
  // Both images re-encoded as JPEG at ≤ 842 px (A4's long side at 72 DPI); no extra images (pages not rasterised).
  const before = imagesOf(await loadPdf(input));
  const after = imagesOf(doc);
  expect(before.map((i) => i.width)).toEqual([3000, 1600]);
  expect(after).toHaveLength(2);
  for (const img of after) {
    expect(img.width).toBeLessThanOrEqual(842);
    expect(img.filter).toBe("/DCTDecode");
  }
  await expect(results(page)).toContainText("صور أُعيد ضغطها");

  // The re-encoded photo looks the same overall: average colour within a few levels of the original.
  const jpegOf = (d: PDFDocument) => [...d.context.enumerateIndirectObjects()].map(([, o]) => o).find((o): o is PDFRawStream => o instanceof PDFRawStream && o.dict.lookup(PDFName.of("Filter")) === PDFName.of("DCTDecode") && o.dict.get(PDFName.of("Subtype")) === PDFName.of("Image"))!;
  const means = await page.evaluate(
    async ([a, b]) => {
      const mean = async (base64: string) => {
        const bmp = await createImageBitmap(await (await fetch(`data:image/jpeg;base64,${base64}`)).blob());
        const c = new OffscreenCanvas(64, 64);
        const x = c.getContext("2d")!;
        x.drawImage(bmp, 0, 0, 64, 64);
        const d = x.getImageData(0, 0, 64, 64).data;
        const m = [0, 0, 0];
        for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) m[k] += d[i + k] / (64 * 64);
        return m;
      };
      return [await mean(a), await mean(b)];
    },
    [Buffer.from(jpegOf(await loadPdf(input)).contents).toString("base64"), Buffer.from(jpegOf(doc).contents).toString("base64")],
  );
  for (let k = 0; k < 3; k++) expect(Math.abs(means[0][k] - means[1][k])).toBeLessThan(6);
});

test("compress: batch of two files, one with nothing to save, in a ZIP", async ({ page }) => {
  await openTool(page, "compress-pdf", "en");
  const small = await PDFDocument.create();
  small.addPage().drawText("Tiny", { font: await small.embedFont(StandardFonts.Helvetica) });
  const tiny = await small.save();
  await upload(page, [pdfUpload("big.pdf", await bloatedPdf()), pdfUpload("tiny.pdf", tiny)]);
  await runTool(page, "Compress PDF");
  const files = await unzip((await downloadResult(page, "en")).bytes);
  const names = files.map((f) => f.name);
  expect(names).toContain("big-compressed.pdf");
  const tinyOut = files.find((f) => f.name.startsWith("tiny"))!;
  // Either smaller (and verified) or the untouched original — never larger.
  expect(tinyOut.bytes.length).toBeLessThanOrEqual(tiny.length);
  if (tinyOut.name === "tiny.pdf") expect(Buffer.compare(Buffer.from(tinyOut.bytes), Buffer.from(tiny))).toBe(0);
});

test("compress: password-protected and damaged files get clear messages", async ({ page }) => {
  await openTool(page, "compress-pdf", "en");
  await upload(page, [pdfUpload("locked.pdf", await lockedPdf()), pdfUpload("broken.pdf", new TextEncoder().encode("%PDF-1.7\nnot really"))]);
  await runTool(page, "Compress PDF");
  await expect(results(page)).toContainText("password-protected or encrypted");
  await expect(results(page)).toContainText("may be damaged or not a PDF");
});
