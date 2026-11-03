"use client";

import { useEffect, useState } from "react";
import type { WorkspaceFile } from "@/lib/engine/types";
import { openPdf, PdfOpenError } from "@/lib/pdf/pdfjs";
import { useWorkspace } from "@/stores/workspace";

type PdfJsDoc = Awaited<ReturnType<typeof openPdf>>;

// One PDF.js document per file, shared by every component showing it, destroyed
// shortly after the last one lets go. Page thumbnails are cached per document.
type Entry = { promise: Promise<PdfJsDoc>; refs: number; timer?: ReturnType<typeof setTimeout>; thumbs: Map<string, Promise<Thumb>> };
const docs = new Map<Blob, Entry>();

export type Thumb = { url: string; width: number; height: number };

function acquire(file: Blob): Entry {
  let entry = docs.get(file);
  if (!entry) {
    entry = { promise: file.arrayBuffer().then((b) => openPdf(b)), refs: 0, thumbs: new Map() };
    docs.set(file, entry);
  }
  if (entry.timer) clearTimeout(entry.timer);
  entry.timer = undefined;
  entry.refs++;
  return entry;
}

function release(file: Blob) {
  const entry = docs.get(file);
  if (!entry) return;
  entry.refs--;
  if (entry.refs > 0) return;
  entry.timer = setTimeout(() => {
    docs.delete(file);
    entry.promise.then((d) => d.loadingTask.destroy()).catch(() => undefined);
    entry.thumbs.forEach((t) => t.then((x) => URL.revokeObjectURL(x.url)).catch(() => undefined));
  }, 4000);
}

export type PdfState = { doc: PdfJsDoc | null; error: "password" | "invalid" | "unknown" | null; numPages: number };

/** Opens a PDF with PDF.js for previews. Shared and cleaned up automatically. */
export function usePdfJs(file: Blob | undefined): PdfState {
  const [state, setState] = useState<PdfState & { for?: Blob }>({ doc: null, error: null, numPages: 0 });
  useEffect(() => {
    if (!file) return;
    let alive = true;
    const entry = acquire(file);
    entry.promise.then(
      (doc) => alive && setState({ doc, error: null, numPages: doc.numPages, for: file }),
      (e) => alive && setState({ doc: null, error: e instanceof PdfOpenError ? e.code : "unknown", numPages: 0, for: file }),
    );
    return () => {
      alive = false;
      release(file);
    };
  }, [file]);
  // Don't show the previous file's document while a new one opens.
  return state.for === file ? state : { doc: null, error: null, numPages: 0 };
}

/** Opens several PDFs at once (organize: pages can come from more than one file). */
export function usePdfJsMany(files: Blob[]): Map<Blob, PdfState> {
  const [states, setStates] = useState<Map<Blob, PdfState>>(new Map());
  const key = files;
  useEffect(() => {
    let alive = true;
    const entries = key.map((f) => [f, acquire(f)] as const);
    for (const [f, entry] of entries) {
      entry.promise.then(
        (doc) => alive && setStates((m) => new Map(m).set(f, { doc, error: null, numPages: doc.numPages })),
        (e) => alive && setStates((m) => new Map(m).set(f, { doc: null, error: e instanceof PdfOpenError ? e.code : "unknown", numPages: 0 })),
      );
    }
    return () => {
      alive = false;
      entries.forEach(([f]) => release(f));
    };
  }, [key]);
  return states;
}

/** Page count for a workspace file, filled in (and saved to the store) when not yet known. */
export function usePageCount(file: WorkspaceFile | undefined): number | undefined {
  const update = useWorkspace((s) => s.update);
  const need = file && file.kind === "pdf" && !file.pageCount && !file.previewError;
  const { numPages, error } = usePdfJs(need ? file.file : undefined);
  useEffect(() => {
    if (!file || !need) return;
    if (numPages) update(file.id, { pageCount: numPages });
    else if (error) update(file.id, { previewError: error });
  }, [file, need, numPages, error, update]);
  return file?.pageCount ?? (numPages || undefined);
}

// Thumbnails render one at a time so long documents don't exhaust memory.
let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
}

/** A rendered page image (object URL). Cached per file/page/width. */
export function pageThumb(file: Blob, page: number, width: number): Promise<Thumb> {
  const entry = docs.get(file);
  if (!entry) return Promise.reject(new Error("Document not open"));
  const key = `${page}:${width}`;
  let thumb = entry.thumbs.get(key);
  if (!thumb) {
    thumb = enqueue(async () => {
      const doc = await entry.promise;
      const p = await doc.getPage(page);
      const base = p.getViewport({ scale: 1 });
      const viewport = p.getViewport({ scale: (width * (window.devicePixelRatio > 1 ? 2 : 1)) / base.width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const c = canvas.getContext("2d")!;
      c.fillStyle = "#fff";
      c.fillRect(0, 0, canvas.width, canvas.height);
      await p.render({ canvas, canvasContext: c, viewport }).promise;
      p.cleanup();
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
      canvas.width = canvas.height = 0;
      if (!blob) throw new Error("Thumbnail failed");
      return { url: URL.createObjectURL(blob), width: base.width, height: base.height };
    });
    entry.thumbs.set(key, thumb);
    thumb.catch(() => entry.thumbs.delete(key));
  }
  return thumb;
}

/** Hook form of pageThumb; renders only once the element is near the viewport. */
export function usePageThumb(file: Blob | undefined, page: number, width: number, el: React.RefObject<HTMLElement | null>, ready: boolean) {
  const [thumb, setThumb] = useState<{ key: string; value: Thumb } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const key = `${page}:${width}`;
  useEffect(() => {
    if (!file || !ready || !el.current) return;
    let alive = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        pageThumb(file, page, width).then(
          (value) => alive && setThumb({ key, value }),
          () => alive && setFailed(key),
        );
      },
      { rootMargin: "300px" },
    );
    observer.observe(el.current);
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [file, page, width, el, ready, key]);
  return { thumb: thumb?.key === key ? thumb.value : null, failed: failed === key };
}
