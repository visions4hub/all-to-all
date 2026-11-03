import type { PDFDocument } from "pdf-lib";
import { throwIfCancelled } from "@/lib/engine/types";
import { normalizeRotation } from "./geometry";
import { createPdfDocument, loadPdfLib } from "./pdf-lib";

/** One page of an output document: which source, which page (0-based), extra rotation. */
export type PageRef = { source: number; page: number; rotate?: number };

/**
 * Builds a new PDF from pages of already-opened sources, in the given order.
 * Page content, annotations and links on the page are copied as they are
 * (text stays selectable). A page used twice is copied twice.
 */
export async function assemble(sources: PDFDocument[], plan: PageRef[], signal?: AbortSignal): Promise<PDFDocument> {
  const { degrees } = await loadPdfLib();
  const out = await createPdfDocument();
  // Copy each (source, page) once per occurrence; pages used once per source go in one batch.
  const seen = new Map<string, number>();
  const batches = new Map<number, number[]>();
  plan.forEach((ref) => {
    const key = `${ref.source}:${ref.page}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    if (n === 0) batches.set(ref.source, [...(batches.get(ref.source) ?? []), ref.page]);
  });
  const firstCopies = new Map<string, import("pdf-lib").PDFPage>();
  for (const [source, pages] of batches) {
    if (signal) throwIfCancelled(signal);
    const copied = await out.copyPages(sources[source], pages);
    pages.forEach((p, i) => firstCopies.set(`${source}:${p}`, copied[i]));
  }
  const used = new Set<string>();
  for (const ref of plan) {
    if (signal) throwIfCancelled(signal);
    const key = `${ref.source}:${ref.page}`;
    let page = firstCopies.get(key)!;
    if (used.has(key)) [page] = await out.copyPages(sources[ref.source], [ref.page]);
    used.add(key);
    if (ref.rotate) page.setRotation(degrees(normalizeRotation(page.getRotation().angle + ref.rotate)));
    out.addPage(page);
  }
  return out;
}

/** Rotates pages of a document in place (adds to their current rotation). */
export async function rotatePages(doc: PDFDocument, pageIndexes: number[], by: number) {
  const { degrees } = await loadPdfLib();
  for (const i of pageIndexes) {
    const page = doc.getPage(i);
    page.setRotation(degrees(normalizeRotation(page.getRotation().angle + by)));
  }
}

/** Removes pages (0-based) from a document in place. */
export function removePages(doc: PDFDocument, pageIndexes: number[]) {
  [...new Set(pageIndexes)].sort((a, b) => b - a).forEach((i) => doc.removePage(i));
}
