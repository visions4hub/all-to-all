// Compress PDF on the main thread: checks the worker's output with PDF.js and builds
// the result shown to the user. The compressed file is offered only when it is
// smaller and passed the check; otherwise the original is returned, clearly labelled.

import type { ProcessInput, ProcessOutput } from "@/lib/engine/types";
import { buildOutputName } from "@/lib/files/filename";
import { formatBytes, formatNumber } from "@/lib/files/format";
import type { Localized } from "@/lib/i18n";
import type { CompressReport } from "./compress-settings";
import { readPagesText, type PdfOpener, type TextSourceDoc } from "./text-extract";

export type Verification = { ok: true; pages: number; textChecked: boolean } | { ok: false; reason: "unreadable" | "pages" | "text" };

async function tryOpen(open: PdfOpener, bytes: Uint8Array): Promise<TextSourceDoc | null> {
  try {
    return await open(bytes);
  } catch {
    return null;
  }
}

/**
 * Checks a compressed file against its original with PDF.js: it must open, have the
 * same number of pages, and every page must give exactly the same text.
 */
export async function verifyCompressed(original: Uint8Array, output: Uint8Array, open: PdfOpener, signal?: AbortSignal): Promise<Verification> {
  const out = await tryOpen(open, output);
  if (!out) return { ok: false, reason: "unreadable" };
  const src = await tryOpen(open, original);
  try {
    if (!src) return out.numPages > 0 ? { ok: true, pages: out.numPages, textChecked: false } : { ok: false, reason: "unreadable" };
    if (src.numPages !== out.numPages) return { ok: false, reason: "pages" };
    const pages = Array.from({ length: src.numPages }, (_, i) => i + 1);
    // One page at a time from each file keeps memory flat on long documents.
    for (const p of pages) {
      const [a] = await readPagesText(src, [p], signal);
      const [b] = await readPagesText(out, [p], signal);
      if (a.text !== b.text) return { ok: false, reason: "text" };
    }
    return { ok: true, pages: out.numPages, textChecked: true };
  } finally {
    await out.loadingTask.destroy();
    await src?.loadingTask.destroy();
  }
}

export const COMPRESS_MESSAGES = {
  noSavings: {
    ar: "لم يصغر الحجم: هذا الملف مضغوط جيداً أصلاً. الملف المعروض هو ملفك الأصلي دون تغيير.",
    en: "No reduction: this file is already well compressed. The file offered is your original, unchanged.",
  },
  verifyFailed: {
    ar: "لم يجتز الملف المضغوط التحقق (عدد الصفحات أو النص لم يطابق الأصل)، لذا أُعيد ملفك الأصلي دون تغيير.",
    en: "The compressed file failed the check (page count or text didn't match the original), so your original file is returned unchanged.",
  },
} satisfies Record<string, Localized>;

function resultNotes(report: CompressReport): Localized[] {
  const notes: Localized[] = [];
  if (report.imagesSkipped === "encrypted")
    notes.push({ ar: "الملف مشفّر، لذا لم تُغيَّر الصور وبقي التشفير كما هو.", en: "The file is encrypted, so images weren't changed and the encryption was kept." });
  if (report.imagesSkipped === "unsupported")
    notes.push({ ar: "تعذّرت إعادة ضغط الصور في هذا الملف؛ طُبّق التحسين دون فقد فقط.", en: "Images in this file couldn't be recompressed; only lossless optimisation was applied." });
  if (report.images && report.images.found > 0 && report.images.recompressed === 0)
    notes.push({ ar: "لم تصبح أي صورة أصغر بالإعدادات المختارة، فبقيت الصور كما هي.", en: "No image got smaller with the chosen settings, so images were left as they were." });
  if (report.repaired) notes.push({ ar: "كانت بنية الملف تالفة وأُعيد بناؤها.", en: "The file's structure was damaged and has been rebuilt." });
  return notes;
}

/**
 * Builds the result for one file: the compressed file only if it is smaller and passed
 * the check; otherwise the original, clearly labelled. Sizes are exact byte counts.
 */
export function compressionOutput(
  input: ProcessInput,
  original: Uint8Array,
  compressed: Uint8Array,
  report: CompressReport,
  verification: Verification | null,
  locale: "ar" | "en",
): ProcessOutput {
  const before = original.length;
  const smaller = compressed.length < before;
  const verified = verification?.ok === true;
  const meta: ProcessOutput["meta"] = [{ label: { ar: "الحجم الأصلي", en: "Original size" }, value: formatBytes(before) }];

  if (!smaller || !verified) {
    const why = smaller ? COMPRESS_MESSAGES.verifyFailed : COMPRESS_MESSAGES.noSavings;
    meta.push({ label: { ar: "النتيجة", en: "Result" }, value: why[locale] });
    return { name: input.name, blob: new Blob([original as Uint8Array<ArrayBuffer>], { type: "application/pdf" }), sourceIds: [input.id], meta };
  }

  const saved = before - compressed.length;
  meta.push(
    { label: { ar: "الحجم الجديد", en: "New size" }, value: formatBytes(compressed.length) },
    { label: { ar: "الموفَّر", en: "Saved" }, value: `${formatBytes(saved)} (${formatNumber((saved / before) * 100, 1)}%)` },
    { label: { ar: "الصفحات", en: "Pages" }, value: verification.pages },
  );
  const lossy = !!report.images?.recompressed;
  meta.push({
    label: { ar: "الطريقة", en: "Method" },
    value: lossy
      ? { ar: "تحسين البنية + إعادة ضغط الصور (بفقد)", en: "Structure optimisation + image recompression (lossy)" }[locale]
      : { ar: "تحسين البنية دون أي فقد", en: "Lossless structure optimisation" }[locale],
  });
  if (lossy) meta.push({ label: { ar: "صور أُعيد ضغطها", en: "Images recompressed" }, value: report.images!.recompressed });
  for (const note of resultNotes(report)) meta.push({ label: { ar: "ملاحظة", en: "Note" }, value: note[locale] });
  return {
    name: buildOutputName(input.name, { suffix: "compressed", ext: "pdf" }),
    blob: new Blob([compressed as Uint8Array<ArrayBuffer>], { type: "application/pdf" }),
    sourceIds: [input.id],
    meta,
  };
}
