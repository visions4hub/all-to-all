import { readFile } from "node:fs/promises";
import { expect, type Download, type Page } from "@playwright/test";
import JSZip from "jszip";
import { PDFDict, PDFDocument, PDFName, StandardFonts, degrees } from "pdf-lib";

export type Locale = "ar" | "en";

/** Opens a tool page with the chosen language (stored like the site stores it). */
export async function openTool(page: Page, slug: string, locale: Locale = "ar") {
  await page.addInitScript((l) => {
    localStorage.setItem("ata-prefs", JSON.stringify({ state: { locale: l, theme: "light" }, version: 0 }));
  }, locale);
  await page.goto(`/tools/${slug}/`);
  await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
  // The tool module has loaded once its drop zone is shown.
  await expect(page.locator('input[type="file"]').first()).toBeAttached();
}

export type Upload = { name: string; mimeType: string; buffer: Buffer };

export const pdfUpload = (name: string, bytes: Uint8Array): Upload => ({ name, mimeType: "application/pdf", buffer: Buffer.from(bytes) });

export async function upload(page: Page, files: Upload[]) {
  await page.locator('input[type="file"]').first().setInputFiles(files);
}

/** Labels are bilingual; pick by the current locale. */
export const L = (locale: Locale, ar: string, en: string) => (locale === "ar" ? ar : en);

/** On phones the settings live in a bottom sheet. Opens it when needed. */
export async function openSettings(page: Page, locale: Locale) {
  const mobileButton = page.locator(".sticky.bottom-0").getByRole("button", { name: L(locale, "الإعدادات", "Settings") });
  if (await mobileButton.isVisible()) {
    await mobileButton.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    return page.getByRole("dialog");
  }
  return page.locator("aside").filter({ has: page.getByRole("heading", { name: L(locale, "الإعدادات", "Settings") }) });
}

export async function closeSettings(page: Page) {
  const dialog = page.getByRole("dialog");
  if (await dialog.isVisible()) {
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  }
}

/** Clicks the main action (the visible one: sidebar on desktop, sticky bar on phones). */
export async function runTool(page: Page, label: string) {
  const button = page.getByRole("button", { name: label, exact: true }).locator("visible=true").first();
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.getByRole("heading", { name: /ملفاتك جاهزة|Your files are ready|لم تنجح المعالجة|Processing failed/ })).toBeVisible({ timeout: 60_000 });
}

export async function downloadResult(page: Page, locale: Locale): Promise<{ name: string; bytes: Buffer }> {
  const results = page.locator("section[aria-live=polite]");
  const zip = results.getByRole("button", { name: L(locale, "تنزيل الكل (ZIP)", "Download all (ZIP)") });
  const single = results.getByRole("button", { name: L(locale, "تنزيل", "Download"), exact: true });
  const [download] = await Promise.all([page.waitForEvent("download"), (await zip.isVisible()) ? zip.click() : single.click()]);
  return readDownload(download);
}

export async function readDownload(download: Download) {
  const path = await download.path();
  return { name: download.suggestedFilename(), bytes: await readFile(path!) };
}

export async function unzip(bytes: Buffer): Promise<{ name: string; bytes: Uint8Array }[]> {
  const zip = await JSZip.loadAsync(bytes);
  const out: { name: string; bytes: Uint8Array }[] = [];
  for (const name of Object.keys(zip.files).sort()) out.push({ name, bytes: await zip.files[name].async("uint8array") });
  return out;
}

// ---- Fixtures -------------------------------------------------------------------

export async function makePdf(pages: number, label = "Page", size: [number, number] = [595, 842]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) doc.addPage(size).drawText(`${label} ${i}`, { x: 50, y: size[1] - 80, size: 28, font });
  return doc.save();
}

export async function makeForm(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Registration form", { x: 50, y: 780, size: 20, font });
  const form = doc.getForm();
  form.createTextField("name").addToPage(page, { x: 50, y: 700, width: 300, height: 24 });
  form.createCheckBox("agree").addToPage(page, { x: 50, y: 650, width: 16, height: 16 });
  const city = form.createDropdown("city");
  city.addOptions(["Baghdad", "Basra"]);
  city.addToPage(page, { x: 50, y: 600, width: 150, height: 22 });
  return doc.save();
}

export async function makeRotatedPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]).setRotation(degrees(90));
  return doc.save();
}

// ---- Reading results -------------------------------------------------------------

export async function loadPdf(bytes: Uint8Array) {
  expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe("%PDF-");
  return PDFDocument.load(bytes);
}

type PdfJs = typeof import("pdfjs-dist");
let pdfjs: Promise<PdfJs> | null = null;
export async function pageTexts(bytes: Uint8Array): Promise<string[]> {
  pdfjs ??= import("pdfjs-dist/legacy/build/pdf.mjs") as Promise<PdfJs>;
  const m = await pdfjs;
  const doc = await m.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false }).promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    out.push(c.items.map((it) => ("str" in it ? it.str : "")).join(" ").replace(/\s+/g, " ").trim());
  }
  await doc.loadingTask.destroy();
  return out;
}

/** Distinct image XObjects drawn on a page. */
export function imageCount(doc: PDFDocument, index: number): number {
  const xobjects = doc.getPage(index).node.Resources()?.lookupMaybe(PDFName.of("XObject"), PDFDict);
  if (!xobjects) return 0;
  const refs = new Set<string>();
  for (const [, ref] of xobjects.entries()) {
    const obj = doc.context.lookup(ref) as { dict?: PDFDict } | undefined;
    if (String(obj?.dict?.get(PDFName.of("Subtype"))) === "/Image") refs.add(String(ref));
  }
  return refs.size;
}

/** Makes images in the browser (real PNG/JPEG/WebP encoders). */
export async function makeImages(page: Page): Promise<Upload[]> {
  const data = await page.evaluate(async () => {
    const make = async (w: number, h: number, type: string, color: string) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const x = c.getContext("2d")!;
      x.fillStyle = color;
      x.fillRect(0, 0, w, h);
      x.fillStyle = "#fff";
      x.fillRect(w / 4, h / 4, w / 2, h / 2);
      const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), type, 0.9));
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    };
    return { png: await make(400, 300, "image/png", "#c00"), jpg: await make(300, 500, "image/jpeg", "#06c"), webp: await make(200, 200, "image/webp", "#090") };
  });
  return [
    { name: "صورة 1.png", mimeType: "image/png", buffer: Buffer.from(data.png) },
    { name: "photo.jpg", mimeType: "image/jpeg", buffer: Buffer.from(data.jpg) },
    { name: "pic.webp", mimeType: "image/webp", buffer: Buffer.from(data.webp) },
  ];
}
