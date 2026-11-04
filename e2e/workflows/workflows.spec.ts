import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { test as base, expect, type Locator, type Page } from "@playwright/test";
import { decode, sniff } from "../image/helpers";
import { L, loadPdf, makeImages, makePdf, pdfUpload, unzip, type Locale, type Upload } from "../pdf/helpers";

// The workflow builder at /workflows/: steps run in order, in memory, on the
// files added once. Each test checks the real downloaded output.

const test = base.extend<{ pageErrors: string[] }>({
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

async function open(page: Page, locale: Locale, query = "") {
  await page.addInitScript((l) => {
    localStorage.setItem("ata-prefs", JSON.stringify({ state: { locale: l, theme: "light" }, version: 0 }));
  }, locale);
  await page.goto(`/workflows/${query}`);
  await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
  await expect(page.getByRole("button", { name: L(locale, "إضافة خطوة", "Add step") })).toBeEnabled();
}

const stepCard = (page: Page, slug: string) => page.locator(`[data-testid=workflow-step][data-slug="${slug}"]`);

async function addStep(page: Page, locale: Locale, slug: string) {
  await page.getByRole("button", { name: L(locale, "إضافة خطوة", "Add step") }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator(`[data-tool="${slug}"]`).click();
  await expect(dialog).toBeHidden();
  await expect(stepCard(page, slug)).toBeVisible();
}

/** Opens a step's settings and returns the settings group. */
async function stepSettings(page: Page, slug: string): Promise<Locator> {
  const card = stepCard(page, slug);
  const toggle = card.locator("button[aria-expanded]");
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  const group = card.getByTestId("step-settings");
  await expect(group).toBeVisible();
  await expect(group.getByText(/جارٍ التحميل|Loading/)).toHaveCount(0);
  return group;
}

async function addFiles(page: Page, files: Upload[], expectRunnable = true) {
  // The drop zone's input (the JSON import input has a test id).
  await page.locator('input[type="file"]:not([capture]):not([data-testid])').first().setInputFiles(files);
  await expect(page.locator("main li").filter({ hasText: files[0].name }).first()).toBeVisible();
  if (expectRunnable) await expect(page.getByRole("button", { name: /^(تشغيل سير العمل|Run workflow)$/ })).toBeEnabled();
}

async function runWorkflow(page: Page) {
  await page.getByRole("button", { name: /^(تشغيل سير العمل|Run workflow)$/ }).click();
  await expect(page.getByRole("heading", { name: /ملفاتك جاهزة|Your files are ready/ })).toBeVisible({ timeout: 60_000 });
}

async function download(page: Page, button: Locator) {
  const [dl] = await Promise.all([page.waitForEvent("download"), button.click()]);
  return { name: dl.suggestedFilename(), bytes: await readFile((await dl.path())!) };
}

/** A noisy photo-like PNG (compresses well as WebP) with a white band at the bottom 30%. */
async function photoWithWhiteBand(page: Page, width: number, height: number): Promise<Buffer> {
  const b64 = await page.evaluate(
    async ({ w, h }) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d")!;
      const img = ctx.createImageData(w, h);
      let seed = 7;
      const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const white = y >= h * 0.7;
          const n = (rnd() - 0.5) * 40;
          img.data[i] = white ? 255 : 110 + 60 * Math.sin(x / 23) + n;
          img.data[i + 1] = white ? 255 : 120 + 60 * Math.cos(y / 31) + n;
          img.data[i + 2] = white ? 255 : 160 + 60 * Math.sin((x + y) / 47) + n;
          img.data[i + 3] = 255;
        }
      ctx.putImageData(img, 0, 0);
      const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), "image/png"));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let bin = "";
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return btoa(bin);
    },
    { w: width, h: height },
  );
  return Buffer.from(b64, "base64");
}

/** Counts strongly red pixels in a region of an encoded image. */
async function redPixels(page: Page, buf: Buffer | Uint8Array, region: { x: number; y: number; width: number; height: number }) {
  return page.evaluate(
    async ({ b64, r }) => {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const bmp = await createImageBitmap(new Blob([bytes]));
      const c = document.createElement("canvas");
      c.width = bmp.width;
      c.height = bmp.height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(bmp, 0, 0);
      const d = ctx.getImageData(r.x, r.y, r.width, r.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] < 140 && d[i + 2] < 140) n++;
      return n;
    },
    { b64: Buffer.from(buf).toString("base64"), r: region },
  );
}

for (const locale of ["ar", "en"] as const) {
  test.describe(`Workflow builder (${locale})`, () => {
    test("Resize → Compress → Watermark on 2 images", async ({ page }) => {
      await open(page, locale);
      await addStep(page, locale, "resize-image");
      await addStep(page, locale, "compress-image");
      await addStep(page, locale, "watermark-image");
      await expect(page.locator("[data-testid=workflow-step]")).toHaveCount(3);

      const a = await photoWithWhiteBand(page, 800, 600);
      const b = await photoWithWhiteBand(page, 600, 400);
      await addFiles(page, [
        { name: "صورة أ.png", mimeType: "image/png", buffer: a },
        { name: "b.png", mimeType: "image/png", buffer: b },
      ]);

      // 1. Resize to 50%.
      const resize = await stepSettings(page, "resize-image");
      await resize.getByRole("radio", { name: L(locale, "نسبة %", "Percent") }).click();
      await expect(resize.getByLabel(L(locale, "النسبة المئوية", "Percentage"))).toHaveValue("50");
      // 2. Compress to WebP.
      const compress = await stepSettings(page, "compress-image");
      await compress.getByRole("radio", { name: "WebP" }).click();
      // 3. Red text watermark, no outline (bottom-right by default).
      const mark = await stepSettings(page, "watermark-image");
      await mark.getByLabel(L(locale, "نص العلامة", "Watermark text")).fill("Visions");
      await mark.getByLabel(L(locale, "اللون", "Colour")).fill("#ff0000");
      await mark.getByLabel(L(locale, "حدّ حول النص للوضوح", "Outline for legibility")).click();

      await runWorkflow(page);
      for (const slug of ["resize-image", "compress-image", "watermark-image"]) {
        await expect(stepCard(page, slug).getByText(L(locale, "تمت · 2 ملف", "Done · 2 file(s)"))).toBeVisible();
      }

      const zip = await download(page, page.getByRole("button", { name: L(locale, "تنزيل الكل (ZIP)", "Download all (ZIP)") }));
      expect(zip.name).toBe("صورة أ-workflow.zip");
      const files = await unzip(zip.bytes);
      expect(files.map((f) => f.name).sort()).toEqual(["b-300x200-compressed-watermarked.webp", "صورة أ-400x300-compressed-watermarked.webp"].sort());

      for (const [source, w, h] of [[a, 400, 300], [b, 300, 200]] as const) {
        const out = files.find((f) => f.name.startsWith(source === a ? "صورة أ" : "b-"))!;
        expect(sniff(Buffer.from(out.bytes))).toBe("webp");
        const info = await decode(page, Buffer.from(out.bytes));
        expect([info.width, info.height]).toEqual([w, h]);
        expect(out.bytes.length).toBeLessThan(source.length / 3);
        // Watermark text in the bottom-right of the white band; none in the bottom-left.
        const band = { y: Math.ceil(h * 0.72), height: Math.floor(h * 0.28) };
        expect(await redPixels(page, out.bytes, { x: w / 2, ...band, width: w / 2 })).toBeGreaterThan(30);
        expect(await redPixels(page, out.bytes, { x: 0, ...band, width: w / 4 })).toBe(0);
      }
    });

    test("Image to PDF → Rotate PDF: one PDF, every page turned", async ({ page }) => {
      await open(page, locale);
      await addStep(page, locale, "image-to-pdf");
      await addStep(page, locale, "rotate-pdf");
      const images = await makeImages(page);
      await addFiles(page, images);
      await runWorkflow(page);
      await expect(stepCard(page, "image-to-pdf").getByText(L(locale, "تمت · 1 ملف", "Done · 1 file(s)"))).toBeVisible();
      const out = await download(page, page.locator("section[aria-live=polite]").getByRole("button", { name: L(locale, "تنزيل", "Download"), exact: true }));
      expect(out.name).toMatch(/\.pdf$/);
      const doc = await loadPdf(out.bytes);
      expect(doc.getPageCount()).toBe(images.length);
      expect(doc.getPages().map((p) => p.getRotation().angle)).toEqual([90, 90, 90]);
    });

    test("homepage preset opens the builder pre-filled; Merge → Page numbers → Watermark runs", async ({ page }) => {
      await page.addInitScript((l) => {
        localStorage.setItem("ata-prefs", JSON.stringify({ state: { locale: l, theme: "light" }, version: 0 }));
      }, locale);
      await page.goto("/");
      await page.locator('a[data-preset="pdf-package"]').click();
      await expect(page).toHaveURL(/\/workflows\/\?preset=pdf-package/);
      await expect(page.locator("[data-testid=workflow-step]")).toHaveCount(3);
      await expect(page.getByLabel(L(locale, "اسم سير العمل", "Workflow name"))).toHaveValue(L(locale, "ملف PDF موحّد ومرقّم", "Merged, numbered PDF"));
      await addFiles(page, [pdfUpload("a.pdf", await makePdf(2, "A")), pdfUpload("b.pdf", await makePdf(3, "B"))]);
      await runWorkflow(page);
      const out = await download(page, page.locator("section[aria-live=polite]").getByRole("button", { name: L(locale, "تنزيل", "Download"), exact: true }));
      const doc = await loadPdf(out.bytes);
      expect(doc.getPageCount()).toBe(5);
      // Page numbers and the watermark add content to every page.
      const plain = await PDFDocument.load(await makePdf(1, "A"));
      const contentSize = (d: PDFDocument, i: number) => d.getPage(i).node.Contents()?.toString().length ?? 0;
      for (let i = 0; i < 5; i++) expect(contentSize(doc, i)).toBeGreaterThan(contentSize(plain, 0));
    });

    test("an incompatible chain is blocked, and a failing step stops the chain with its name", async ({ page }) => {
      await open(page, locale);
      await addStep(page, locale, "pdf-to-text");
      await addStep(page, locale, "rotate-pdf");
      const issue = stepCard(page, "rotate-pdf").getByText(/TXT/);
      await expect(issue).toBeVisible();
      await addFiles(page, [pdfUpload("x.pdf", await makePdf(1))], false);
      await expect(page.getByRole("button", { name: /^(تشغيل سير العمل|Run workflow)$/ })).toBeDisabled();

      // Remove the bad step; a 1-file merge after it fails at run time and names the step.
      await stepCard(page, "rotate-pdf").getByRole("button", { name: L(locale, "حذف «تدوير PDF»", "Remove “Rotate PDF”") }).click();
      await stepCard(page, "pdf-to-text").getByRole("button", { name: /حذف|Remove/ }).click();
      await addStep(page, locale, "rotate-pdf");
      await addStep(page, locale, "merge-pdf");
      await page.getByRole("button", { name: /^(تشغيل سير العمل|Run workflow)$/ }).click();
      const error = page.getByTestId("workflow-error");
      await expect(error).toBeVisible();
      await expect(error).toContainText(L(locale, "الخطوة 2 (دمج PDF)", "Step 2 (Merge PDF)"));
      await expect(error).toContainText(L(locale, "تحتاج 2 ملفات على الأقل", "needs at least 2 files"));
      await expect(stepCard(page, "rotate-pdf").getByText(L(locale, "تمت · 1 ملف", "Done · 1 file(s)"))).toBeVisible();
    });

    test("reorder with buttons, save, reload, export JSON, clear, import back", async ({ page }) => {
      await open(page, locale);
      await addStep(page, locale, "compress-image");
      await addStep(page, locale, "resize-image");
      // Move Resize above Compress (buttons work with touch and keyboard).
      await stepCard(page, "resize-image").getByRole("button", { name: /للأعلى|up$/ }).click();
      await expect(page.locator("[data-testid=workflow-step]").first()).toHaveAttribute("data-slug", "resize-image");
      const resize = await stepSettings(page, "resize-image");
      await resize.getByRole("radio", { name: L(locale, "حد أقصى", "Max size") }).click();
      await resize.getByLabel(L(locale, "أقصى عرض", "Max width")).fill("640");

      const name = L(locale, "صور المتجر", "Shop photos");
      await page.getByLabel(L(locale, "اسم سير العمل", "Workflow name")).fill(name);
      await page.getByRole("button", { name: L(locale, "حفظ", "Save"), exact: true }).click();
      await expect(page.getByTestId("workflow-notice")).toContainText(name);

      await page.reload();
      const saved = page.getByTestId("saved-workflow");
      await expect(saved).toHaveCount(1);
      await expect(saved).toContainText(name);
      await saved.getByRole("button", { name: L(locale, "فتح", "Open") }).click();
      await expect(page.locator("[data-testid=workflow-step]")).toHaveCount(2);
      await expect((await stepSettings(page, "resize-image")).getByLabel(L(locale, "أقصى عرض", "Max width"))).toHaveValue("640");

      // Export.
      const exported = await download(page, saved.getByRole("button", { name: L(locale, `تصدير «${name}»`, `Export “${name}”`) }));
      expect(exported.name).toBe(`${name}.workflow.json`);
      const json = JSON.parse(exported.bytes.toString("utf8"));
      expect(json.format).toBe("all-to-all/workflow");
      expect(json.workflows[0].name).toBe(name);
      expect(json.workflows[0].steps.map((s: { tool: string }) => s.tool)).toEqual(["resize-image", "compress-image"]);
      expect(json.workflows[0].steps[0].settings).toMatchObject({ mode: "max", maxWidth: 640 });

      // Clear all (with confirmation).
      await page.getByRole("button", { name: L(locale, "مسح الكل", "Clear all") }).click();
      await page.getByRole("dialog").getByRole("button", { name: L(locale, "مسح الكل", "Clear all") }).click();
      await expect(saved).toHaveCount(0);
      await page.reload();
      await expect(page.getByText(L(locale, "لا يوجد سير عمل محفوظ بعد.", "No saved workflows yet."))).toBeVisible();

      // Bad files are rejected with a clear message.
      const importInput = page.getByTestId("workflow-import-input");
      await importInput.setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from("{not json") });
      await expect(page.getByTestId("workflow-notice")).toContainText(L(locale, "الملف ليس JSON صالحاً", "isn't valid JSON"));
      const evil = { ...json, workflows: [{ name: "x", steps: [{ tool: "evil-tool", settings: {} }] }] };
      await importInput.setInputFiles({ name: "evil.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(evil)) });
      await expect(page.getByTestId("workflow-notice")).toContainText("evil-tool");
      await expect(page.getByTestId("saved-workflow")).toHaveCount(0);

      // Import the export back.
      await importInput.setInputFiles({ name: exported.name, mimeType: "application/json", buffer: exported.bytes });
      await expect(page.getByTestId("saved-workflow")).toHaveCount(1);
      await expect(page.getByTestId("saved-workflow")).toContainText(name);
      await expect(page.locator("[data-testid=workflow-step]")).toHaveCount(2);
      await expect((await stepSettings(page, "resize-image")).getByLabel(L(locale, "أقصى عرض", "Max width"))).toHaveValue("640");
      await page.reload();
      await expect(page.getByTestId("saved-workflow")).toHaveCount(1);
    });
  });
}

test("interactive tools are listed as not chainable and not offered as steps", async ({ page }) => {
  await open(page, "en");
  await page.getByText("Tools that can't be chained").click();
  const list = page.getByTestId("not-chainable");
  for (const name of ["Photo Editor", "Edit PDF", "Sign PDF", "Organize PDF"]) await expect(list).toContainText(name);
  await page.getByRole("button", { name: "Add step" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator('[data-tool="resize-image"]')).toBeVisible();
  for (const slug of ["photo-editor", "edit-pdf", "sign-pdf", "organize-pdf", "fill-pdf-forms", "blur-image", "meme-generator"]) {
    await expect(dialog.locator(`[data-tool="${slug}"]`)).toHaveCount(0);
  }
});

test("steps can be reordered by dragging (desktop) and with the keyboard", async ({ page }) => {
  await open(page, "en");
  for (const slug of ["resize-image", "compress-image", "watermark-image"]) await addStep(page, "en", slug);
  const order = () => page.locator("[data-testid=workflow-step]").evaluateAll((els) => els.map((e) => e.getAttribute("data-slug")));
  if ((page.viewportSize()?.width ?? 0) >= 640) {
    // The grip handle is shown from the sm breakpoint; drag Watermark onto Resize.
    await stepCard(page, "watermark-image").locator("[draggable=true]").dragTo(stepCard(page, "resize-image"));
    await expect.poll(order).toEqual(["watermark-image", "resize-image", "compress-image"]);
  }
  // Keyboard: focus "Move down" on the first step and press Enter.
  const first = page.locator("[data-testid=workflow-step]").first();
  const slug = (await first.getAttribute("data-slug"))!;
  await first.getByRole("button", { name: /down$/ }).focus();
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await order()).indexOf(slug)).toBe(1);
});
