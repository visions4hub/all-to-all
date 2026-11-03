import { expect, test } from "@playwright/test";
import JSZip from "jszip";
import { decode, downloadResult, fixture, imageDiff, makeImage, openTool, run, settings, sniff, upload, useEnglish } from "./helpers";

const ACTION = /^(ضغط الصور|Compress)$/;

test.describe("Compress Image", () => {
  test("JPG photo gets smaller, keeps size, Arabic filename", async ({ page }) => {
    await openTool(page, "compress-image");
    const input = await makeImage(page, { width: 800, height: 600, pattern: "photo", format: "jpeg", quality: 0.98 });
    await upload(page, [fixture("صورة تجربة.jpg", input, "image/jpeg")]);
    await run(page, ACTION);
    const out = await downloadResult(page);
    expect(out.name).toBe("صورة تجربة-compressed.jpg");
    expect(sniff(out.buffer)).toBe("jpeg");
    expect(out.buffer.length).toBeLessThan(input.length * 0.7);
    const info = await decode(page, out.buffer);
    expect([info.width, info.height]).toEqual([800, 600]);
    // Savings are reported next to the result.
    await expect(page.locator("section[aria-live]").getByText(/أصغر|smaller/).first()).toBeVisible();
  });

  test("PNG lossless keeps every pixel exactly (encoded in a Web Worker)", async ({ page }) => {
    const workers: string[] = [];
    page.on("worker", (w) => workers.push(w.url()));
    await openTool(page, "compress-image");
    const input = await makeImage(page, { width: 640, height: 480, pattern: "quadrants", format: "png" });
    await upload(page, [fixture("graphic.png", input)]);
    await run(page, ACTION);
    const out = await downloadResult(page);
    expect(sniff(out.buffer)).toBe("png");
    expect(out.buffer.length).toBeLessThanOrEqual(input.length);
    const diff = await imageDiff(page, input, out.buffer);
    expect(diff.sameSize).toBe(true);
    expect(diff.max).toBe(0);
    expect(workers.some((u) => u.endsWith("/vendor/image-worker.js"))).toBe(true);
    await expect(page.locator("html")).toHaveAttribute("data-image-worker", "ready");
  });

  test("PNG with fewer colours is much smaller and still looks the same", async ({ page }) => {
    await openTool(page, "compress-image");
    const input = await makeImage(page, { width: 500, height: 400, pattern: "photo", format: "png" });
    await upload(page, [fixture("ملف ✓ 🎨.png", input)]);
    const panel = await settings(page);
    await panel.getByRole("radio", { name: /تقليل الألوان|Fewer colours/ }).click();
    await run(page, ACTION);
    const out = await downloadResult(page);
    expect(out.name).toBe("ملف ✓ 🎨-compressed.png");
    expect(sniff(out.buffer)).toBe("png");
    expect(out.buffer.length).toBeLessThan(input.length * 0.6);
    const diff = await imageDiff(page, input, out.buffer);
    expect(diff.sameSize).toBe(true);
    expect(diff.mean).toBeLessThan(12);
  });

  test("max side shrinks dimensions, WebP output", async ({ page }) => {
    await openTool(page, "compress-image");
    const input = await makeImage(page, { width: 1200, height: 800, pattern: "photo", format: "png" });
    await upload(page, [fixture("big.png", input)]);
    const panel = await settings(page);
    await panel.getByRole("radio", { name: "WebP" }).click();
    await panel.getByLabel(/أقصى طول|Max longer side/).fill("600");
    await run(page, ACTION);
    const out = await downloadResult(page);
    expect(sniff(out.buffer)).toBe("webp");
    const info = await decode(page, out.buffer);
    expect([info.width, info.height]).toEqual([600, 400]);
  });

  test("batch of 3 gives a ZIP of 3 valid images; a broken file shows an error", async ({ page }) => {
    await openTool(page, "compress-image");
    const a = await makeImage(page, { width: 300, height: 200, pattern: "photo", format: "jpeg", quality: 0.98 });
    const b = await makeImage(page, { width: 200, height: 300, pattern: "photo", format: "webp", quality: 0.98 });
    const c = await makeImage(page, { width: 256, height: 256, pattern: "quadrants", format: "png" });
    const broken = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 7)]);
    await upload(page, [
      fixture("a.jpg", a, "image/jpeg"),
      fixture("b.webp", b, "image/webp"),
      fixture("c.png", c),
      fixture("broken.png", broken),
    ]);
    await run(page, ACTION);
    await expect(page.getByText(/تعذّرت قراءة الصورة|Couldn't read this image/)).toBeVisible();
    const out = await downloadResult(page, true);
    expect(sniff(out.buffer)).toBe("zip");
    const zip = await JSZip.loadAsync(out.buffer);
    const names = Object.keys(zip.files).sort();
    expect(names).toEqual(["a-compressed.jpg", "b-compressed.webp", "c-compressed.png"]);
    for (const name of names) {
      const bytes = Buffer.from(await zip.files[name].async("uint8array"));
      expect(sniff(bytes)).toBe(name.endsWith("jpg") ? "jpeg" : name.endsWith("webp") ? "webp" : "png");
      const info = await decode(page, bytes);
      expect(info.width).toBeGreaterThan(0);
    }
  });

  test("English UI is left-to-right and works", async ({ page }) => {
    await useEnglish(page);
    await openTool(page, "compress-image");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    const input = await makeImage(page, { width: 400, height: 300, pattern: "photo", format: "jpeg", quality: 0.98 });
    await upload(page, [fixture("photo.jpg", input, "image/jpeg")]);
    await run(page, /^Compress$/);
    await expect(page.getByRole("heading", { name: "Your files are ready" })).toBeVisible();
    const out = await downloadResult(page);
    expect(sniff(out.buffer)).toBe("jpeg");
    expect(out.buffer.length).toBeLessThan(input.length);
  });
});
