import JSZip from "jszip";
import { expect, test, closeSettings, decode, downloadResult, fixture, imageDiff, makeImage, openTool, run, settings, sniff, upload, useEnglish } from "./helpers";
import { readMetadata, stripMetadata } from "../../src/tools/image/lib/metadata";
import { webpChunks } from "../../src/tools/image/lib/metadata/webp";
import { addJpegMetadata, addPngMetadata, addWebpMetadata, SAMPLE } from "../../src/tools/image/lib/metadata/test-fixtures";

const ACTION = /^(حذف البيانات|Remove metadata)$/;
const DROP_ALL = { keepIcc: false, keepOrientation: false };
const u8 = (b: Buffer) => new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
const has = (b: Buffer, s: string) => b.includes(Buffer.from(s, "utf8")) || b.includes(Buffer.from(s, "latin1"));

test.describe("Image Metadata", () => {
  test("shows camera, GPS (with a privacy warning) and removes everything except the colour profile, losslessly", async ({ page }) => {
    await openTool(page, "image-metadata");
    const raw = await makeImage(page, { width: 320, height: 240, pattern: "photo", format: "jpeg", quality: 0.9 });
    // Chromium and WebKit embed their own sRGB ICC profile in canvas JPEGs, so we add everything
    // except one. Firefox writes none, so there the fixture adds one too.
    const browserIcc = (await readMetadata(u8(raw))).blocks.some((b) => b.kind === "icc");
    const input = Buffer.from(addJpegMetadata(u8(raw), { thumbnail: 64, icc: !browserIcc }));
    await upload(page, [fixture("صورة الرحلة.jpg", input, "image/jpeg")]);

    const view = page.getByTestId("metadata-view");
    await expect(view.getByTestId("gps-warning")).toBeVisible();
    await expect(view.getByTestId("gps-warning")).toContainText("GPS");
    await expect(view.getByTestId("meta-make")).toContainText(SAMPLE.make);
    await expect(view.getByTestId("meta-model")).toContainText(SAMPLE.model);
    await expect(view.getByTestId("meta-lens")).toContainText(SAMPLE.lens);
    await expect(view.getByTestId("meta-date-original")).toContainText("2024-05-17 14:23:11");
    await expect(view.getByTestId("meta-exposure")).toContainText("1/250 s");
    await expect(view.getByTestId("meta-aperture")).toContainText("f/1.8");
    await expect(view.getByTestId("meta-gps")).toContainText("33.315000, 44.360000");
    await expect(view.getByTestId("meta-dimensions")).toContainText("320×240");
    await expect(view.getByTestId("meta-format")).toContainText("JPEG");
    await expect(view.getByTestId("meta-icc")).not.toContainText(/لا يوجد/);
    await expect(view.getByTestId("meta-artist")).toContainText(SAMPLE.artist);
    await expect(view.getByTestId("meta-city")).toContainText(SAMPLE.iptcCity);
    await expect(view.getByTestId("meta-blocks")).toContainText("EXIF");
    await expect(view.getByTestId("meta-blocks")).toContainText("XMP");
    await expect(view.getByTestId("meta-blocks")).toContainText("IPTC");

    await run(page, ACTION);
    await expect(page.getByText(/حُذف/).first()).toBeVisible();
    const out = await downloadResult(page);
    expect(out.name).toBe("صورة الرحلة-clean.jpg");
    expect(sniff(out.buffer)).toBe("jpeg");
    const after = await readMetadata(u8(out.buffer));
    expect(after.blocks.map((b) => b.kind)).toEqual(["icc"]);
    expect(after.exif).toBeNull();
    for (const s of [SAMPLE.make, SAMPLE.model, SAMPLE.xmpCreator, SAMPLE.iptcCity, SAMPLE.comment, "Exif", "TRAILING"]) expect(has(out.buffer, s), s).toBe(false);
    // Lossless: what is left is the browser's original JPEG (with its own ICC profile), byte for byte;
    // where the profile came from the fixture, the rest is the browser's JPEG byte for byte.
    if (browserIcc) expect(out.buffer.equals(raw)).toBe(true);
    const outStripped = stripMetadata(u8(out.buffer), DROP_ALL);
    expect(outStripped.removed.map((b) => b.kind)).toEqual(["icc"]);
    expect(Buffer.from(outStripped.bytes).equals(Buffer.from(stripMetadata(u8(raw), DROP_ALL).bytes))).toBe(true);
    const diff = await imageDiff(page, out.buffer, raw);
    expect(diff.max).toBe(0);
  });

  test("batch PNG + WebP without colour profile → ZIP, image data identical (English)", async ({ page }) => {
    await useEnglish(page);
    await openTool(page, "image-metadata");
    const png = await makeImage(page, { width: 120, height: 90, pattern: "quadrants", format: "png" });
    const webp = await makeImage(page, { width: 150, height: 100, pattern: "photo", format: "webp", quality: 0.8 });
    const pngIn = Buffer.from(await addPngMetadata(u8(png)));
    const webpIn = Buffer.from(addWebpMetadata(u8(webp)));
    await upload(page, [fixture("ملف ✓.png", pngIn), fixture("photo.webp", webpIn, "image/webp")]);
    await expect(page.getByTestId("gps-warning")).toBeVisible();
    await expect(page.getByTestId("meta-text-0")).toContainText(SAMPLE.pngText.value);

    const panel = await settings(page);
    await panel.getByRole("switch", { name: /Keep colour profile/ }).click();
    await closeSettings(page);
    await run(page, ACTION);
    const out = await downloadResult(page, true);
    expect(sniff(out.buffer)).toBe("zip");
    const zip = await JSZip.loadAsync(out.buffer);
    expect(Object.keys(zip.files).sort()).toEqual(["photo-clean.webp", "ملف ✓-clean.png"]);

    const pngOut = Buffer.from(await zip.files["ملف ✓-clean.png"].async("uint8array"));
    // Every metadata chunk gone, everything else untouched. Firefox adds its own private
    // "deBG" chunk to canvas PNGs on web pages; the tool removes that too, so compare with
    // the browser's PNG minus any such private chunk.
    const own = stripMetadata(u8(png), DROP_ALL);
    expect(own.removed.every((b) => b.kind === "app" && b.detail === "deBG"), JSON.stringify(own.removed)).toBe(true);
    expect(pngOut.equals(Buffer.from(own.bytes))).toBe(true);
    const webpOut = Buffer.from(await zip.files["photo-clean.webp"].async("uint8array"));
    expect((await readMetadata(u8(webpOut))).blocks).toEqual([]);
    const image = (b: Buffer) => webpChunks(u8(b)).find((c) => c.type === "VP8 " || c.type === "VP8L")!.data;
    expect(Buffer.from(image(webpOut)).equals(Buffer.from(image(webp)))).toBe(true);
    for (const s of [SAMPLE.make, SAMPLE.xmpTool, "EXIF", "XMP "]) expect(has(webpOut, s), s).toBe(false);
    expect((await imageDiff(page, webpOut, webp)).max).toBe(0);
    await expect(page.getByText(/Removed/).first()).toBeVisible();
  });

  test("camera orientation: keep only the tag (lossless), or rotate the pixels", async ({ page }) => {
    await openTool(page, "image-metadata");
    const raw = await makeImage(page, { width: 200, height: 100, pattern: "quadrants", format: "jpeg", quality: 0.95 });
    const input = Buffer.from(addJpegMetadata(u8(raw), { orientation: 6, icc: false }));
    await upload(page, [fixture("camera.jpg", input, "image/jpeg")]);
    await expect(page.getByTestId("meta-orientation")).toContainText("90°");

    await run(page, ACTION);
    let out = await downloadResult(page);
    let meta = await readMetadata(u8(out.buffer));
    expect(meta.orientation).toBe(6);
    expect(Object.keys(meta.exif!.tags)).toEqual(["Orientation"]);
    expect(meta.exif!.gps).toBeNull();
    expect(has(out.buffer, SAMPLE.make)).toBe(false);

    await page.getByRole("button", { name: /معالجة جديدة|Start over/ }).click();
    const panel = await settings(page);
    await panel.getByRole("radio", { name: /عدّل البكسلات/ }).click();
    await closeSettings(page);
    await run(page, ACTION);
    out = await downloadResult(page);
    meta = await readMetadata(u8(out.buffer));
    // Re-saved by the browser: at most its standard colour profile (kept by default), nothing else.
    expect(meta.blocks.every((b) => b.kind === "icc")).toBe(true);
    expect(meta.exif).toBeNull();
    const info = await decode(page, out.buffer, [[25, 50], [75, 50], [75, 150], [25, 150]]);
    expect([info.width, info.height]).toEqual([100, 200]);
  });

  test("a file without metadata says so and comes back unchanged", async ({ page }) => {
    await openTool(page, "image-metadata");
    const made = await makeImage(page, { width: 64, height: 64, pattern: "solid", format: "png", color: "#123456" });
    // Firefox adds a private "deBG" chunk to canvas PNGs; drop it so the file really has no metadata.
    const raw = Buffer.from(stripMetadata(u8(made), DROP_ALL).bytes);
    await upload(page, [fixture("clean.png", raw)]);
    await expect(page.getByTestId("meta-blocks")).toContainText("لا توجد بيانات وصفية");
    await expect(page.getByTestId("gps-warning")).toHaveCount(0);
    await run(page, ACTION);
    const out = await downloadResult(page);
    expect(out.buffer.equals(raw)).toBe(true);
  });
});
