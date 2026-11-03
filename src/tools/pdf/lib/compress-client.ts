"use client";

import { CancelledError } from "@/lib/engine/types";
import type { Localized } from "@/lib/i18n";
import { PDF_ERRORS, userError } from "./errors";
import type { CompressReport, CompressRequest, CompressResponse, CompressSettings, CompressStage } from "./compress-settings";

export const ENGINE_ERROR: Localized = {
  ar: "تعذّر تشغيل محرك الضغط في هذا المتصفح. حدّث المتصفح أو جرّب متصفحاً آخر.",
  en: "The compression engine couldn't start in this browser. Update it or try another browser.",
};

/**
 * Compresses one PDF in a dedicated Web Worker (built by scripts/build-pdf-worker.mjs).
 * The input buffer is transferred to the worker. Aborting terminates the worker at once.
 */
export function compressInWorker(
  bytes: Uint8Array,
  settings: CompressSettings,
  signal: AbortSignal,
  onProgress: (stage: CompressStage, done: number, total: number) => void,
): Promise<{ bytes: Uint8Array; report: CompressReport }> {
  if (signal.aborted) return Promise.reject(new CancelledError());
  if (typeof Worker === "undefined") return Promise.reject(userError(ENGINE_ERROR));
  return new Promise((resolve, reject) => {
    const worker = new Worker("/vendor/pdf-compress-worker.js");
    const finish = () => {
      signal.removeEventListener("abort", onAbort);
      worker.terminate();
    };
    const onAbort = () => {
      finish();
      reject(new CancelledError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    worker.onmessage = (event: MessageEvent<CompressResponse>) => {
      const msg = event.data;
      if (msg.type === "progress") {
        // Lets tests see that the work really runs in the worker.
        document.documentElement.dataset.pdfCompressWorker = "running";
        onProgress(msg.stage, msg.done, msg.total);
        return;
      }
      finish();
      if (msg.type === "done") resolve({ bytes: new Uint8Array(msg.bytes), report: msg.report });
      else if (msg.code === "password") reject(userError(PDF_ERRORS.encrypted));
      else if (msg.code === "damaged") reject(userError(PDF_ERRORS.damaged));
      else {
        if (msg.detail) console.error("Compress PDF engine:", msg.detail);
        reject(userError(ENGINE_ERROR));
      }
    };
    worker.onerror = (event) => {
      event.preventDefault();
      finish();
      reject(userError(ENGINE_ERROR));
    };
    const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    worker.postMessage({ bytes: copy, settings } satisfies CompressRequest, [copy]);
  });
}
