import { test as base, expect, type Locator, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

// Shared helpers for the image tool tests. Fixtures are generated in the
// browser at test time, so nothing binary is committed to the repo.

/** Playwright test that fails if the page throws any uncaught error. */
export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await use(errors);
      expect(errors, "uncaught page errors").toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

export type Fixture = { name: string; mimeType: string; buffer: Buffer };
export type ImgFormat = "jpeg" | "png" | "webp";

export const EN_PREFS = JSON.stringify({ state: { locale: "en", theme: "light" }, version: 0 });

export async function useEnglish(page: Page) {
  await page.addInitScript((prefs) => localStorage.setItem("ata-prefs", prefs), EN_PREFS);
}

export async function openTool(page: Page, slug: string) {
  await page.goto(`/tools/${slug}/`);
  await expect(page.locator('input[type="file"]:not([capture])').first()).toBeAttached();
}

export type Pattern = "photo" | "quadrants" | "solid" | "transparent-square";

/**
 * Draws a test image in the page and returns its encoded bytes.
 * - photo: smooth gradients + noise (behaves like a camera photo when compressed)
 * - quadrants: red / green / blue / yellow quarters (top-left, top-right, bottom-left, bottom-right)
 * - solid: one colour
 * - transparent-square: transparent background with an opaque red square in the middle
 */
export async function makeImage(
  page: Page,
  opts: { width: number; height: number; pattern: Pattern; format: ImgFormat; quality?: number; color?: string },
): Promise<Buffer> {
  const b64 = await page.evaluate(async (o) => {
    const c = document.createElement("canvas");
    c.width = o.width;
    c.height = o.height;
    const ctx = c.getContext("2d")!;
    const w = o.width;
    const h = o.height;
    if (o.pattern === "photo") {
      const img = ctx.createImageData(w, h);
      let seed = 12345;
      const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const n = (rnd() - 0.5) * 40;
          img.data[i] = 128 + 100 * Math.sin(x / 23) + n;
          img.data[i + 1] = 128 + 100 * Math.cos(y / 31) + n;
          img.data[i + 2] = 128 + 90 * Math.sin((x + y) / 47) + n;
          img.data[i + 3] = 255;
        }
      ctx.putImageData(img, 0, 0);
    } else if (o.pattern === "quadrants") {
      const hw = Math.floor(w / 2);
      const hh = Math.floor(h / 2);
      ctx.fillStyle = "#ff0000";
      ctx.fillRect(0, 0, hw, hh);
      ctx.fillStyle = "#00ff00";
      ctx.fillRect(hw, 0, w - hw, hh);
      ctx.fillStyle = "#0000ff";
      ctx.fillRect(0, hh, hw, h - hh);
      ctx.fillStyle = "#ffff00";
      ctx.fillRect(hw, hh, w - hw, h - hh);
    } else if (o.pattern === "solid") {
      ctx.fillStyle = o.color || "#808080";
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.fillStyle = "#ff0000";
      ctx.fillRect(w / 4, h / 4, w / 2, h / 2);
    }
    const mime = `image/${o.format}`;
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), mime, o.quality ?? 0.92));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }, opts);
  return Buffer.from(b64, "base64");
}

export function fixture(name: string, buffer: Buffer, mimeType = "image/png"): Fixture {
  return { name, mimeType, buffer };
}

export async function upload(page: Page, files: Fixture[]) {
  await page.locator('input[type="file"]:not([capture])').first().setInputFiles(files);
}

export function isMobile(page: Page) {
  return (page.viewportSize()?.width ?? 1200) < 1024;
}

/** The settings container: the sidebar on desktop, the bottom sheet on phones (opened if needed). */
export async function settings(page: Page): Promise<Locator> {
  if (!isMobile(page)) return page.locator("aside").filter({ has: page.getByRole("heading", { name: /الإعدادات|Settings/ }) });
  const dialog = page.getByRole("dialog");
  if (!(await dialog.isVisible())) {
    await page.getByRole("button", { name: /^(الإعدادات|Settings)$/ }).click();
    await expect(dialog).toBeVisible();
  }
  return dialog;
}

/** Clicks the main action button (inside the sheet on phones when it is open). */
export async function run(page: Page, label: RegExp) {
  const scope = isMobile(page) && (await page.getByRole("dialog").isVisible()) ? page.getByRole("dialog") : page;
  await scope.getByRole("button", { name: label }).filter({ visible: true }).first().click();
  await expect(page.getByRole("heading", { name: /ملفاتك جاهزة|Your files are ready|لم تنجح المعالجة|Processing failed/ })).toBeVisible({ timeout: 60_000 });
}

/** Clicks the single "Download" or "Download all (ZIP)" button and returns the file. */
export async function downloadResult(page: Page, zip = false): Promise<{ name: string; buffer: Buffer }> {
  const label = zip ? /تنزيل الكل|Download all/ : /^(تنزيل|Download)$/;
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: label }).first().click()]);
  const path = await download.path();
  return { name: download.suggestedFilename(), buffer: await readFile(path) };
}

// ---------- Decoding results ----------

export function sniff(buf: Buffer): ImgFormat | "zip" | null {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") return "webp";
  if (buf[0] === 0x50 && buf[1] === 0x4b) return "zip";
  return null;
}

/** Decodes an image in the page; returns its size and a function-free pixel sampler result. */
export async function decode(
  page: Page,
  buf: Buffer,
  samples: [number, number][] = [],
): Promise<{ width: number; height: number; pixels: number[][] }> {
  return page.evaluate(
    async ({ b64, samples }) => {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const bmp = await createImageBitmap(new Blob([bytes]), { imageOrientation: "none", colorSpaceConversion: "none", premultiplyAlpha: "none" });
      const c = document.createElement("canvas");
      c.width = bmp.width;
      c.height = bmp.height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(bmp, 0, 0);
      const pixels = samples.map(([x, y]) => Array.from(ctx.getImageData(x, y, 1, 1).data));
      return { width: bmp.width, height: bmp.height, pixels };
    },
    { b64: buf.toString("base64"), samples },
  );
}

/** Mean absolute difference between two images of the same size (0 = identical). */
export async function imageDiff(page: Page, a: Buffer, b: Buffer, region?: { x: number; y: number; width: number; height: number }) {
  return page.evaluate(
    async ({ a64, b64, region }) => {
      const load = async (s: string) => {
        const bin = atob(s);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const bmp = await createImageBitmap(new Blob([bytes]));
        const c = document.createElement("canvas");
        c.width = bmp.width;
        c.height = bmp.height;
        c.getContext("2d")!.drawImage(bmp, 0, 0);
        const r = region ?? { x: 0, y: 0, width: bmp.width, height: bmp.height };
        return { w: bmp.width, h: bmp.height, data: c.getContext("2d")!.getImageData(r.x, r.y, r.width, r.height).data };
      };
      const A = await load(a64);
      const B = await load(b64);
      if (A.w !== B.w || A.h !== B.h) return { sameSize: false, mean: Infinity, max: Infinity };
      let sum = 0;
      let max = 0;
      for (let i = 0; i < A.data.length; i++) {
        const d = Math.abs(A.data[i] - B.data[i]);
        sum += d;
        if (d > max) max = d;
      }
      return { sameSize: true, mean: sum / A.data.length, max };
    },
    { a64: a.toString("base64"), b64: b.toString("base64"), region },
  );
}

export function near(actual: number[], expected: number[], tolerance = 16) {
  return actual.every((v, i) => Math.abs(v - expected[i]) <= tolerance);
}

/** A real touch drag (Chrome DevTools touch events → pointer events with pointerType "touch"). */
export async function touchDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 8) {
  const cdp = await page.context().newCDPSession(page);
  const point = (p: { x: number; y: number }) => [{ x: Math.round(p.x), y: Math.round(p.y), id: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(from) });
  for (let i = 1; i <= steps; i++) {
    const p = { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps };
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: point(p) });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

/** Mouse drag on desktop, touch drag on phones. */
export async function dragBy(page: Page, target: Locator, dx: number, dy: number, offset = { x: 0, y: 0 }) {
  const box = (await target.boundingBox())!;
  const from = { x: box.x + box.width / 2 + offset.x, y: box.y + box.height / 2 + offset.y };
  const to = { x: from.x + dx, y: from.y + dy };
  if (isMobile(page)) return touchDrag(page, from, to);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

/** Sets a Radix slider (found by its label) to its minimum or maximum with the keyboard. */
export async function sliderTo(scope: Locator, label: RegExp, where: "min" | "max") {
  const thumb = scope.getByLabel(label).getByRole("slider");
  await thumb.focus();
  await thumb.press(where === "max" ? "End" : "Home");
}

/** Drags between two points given as fractions of the target's box (mouse on desktop, touch on phones). */
export async function dragFrac(page: Page, target: Locator, from: [number, number], to: [number, number]) {
  const box = (await target.boundingBox())!;
  const a = { x: box.x + box.width * from[0], y: box.y + box.height * from[1] };
  const b = { x: box.x + box.width * to[0], y: box.y + box.height * to[1] };
  if (isMobile(page)) return touchDrag(page, a, b);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
}
