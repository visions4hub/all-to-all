// Runs Compare PDF diffs in a shared Web Worker (public/vendor/pdf-compare-worker.js).
// If a worker can't start (or in Node tests), the same functions run here instead.

import { CancelledError } from "@/lib/engine/types";
import { comparePageText, diffPixels, type PageResult, type PageText } from "./compare-core";

export type CompareJob =
  | { op: "ping" }
  | { op: "pixels"; a: Uint8ClampedArray | null; b: Uint8ClampedArray | null; width: number; height: number; threshold: number }
  | { op: "text"; page: number; a: PageText; b: PageText };

type PixelResult = ReturnType<typeof diffPixels>;
type Pending = { resolve: (r: unknown) => void; reject: (e: Error) => void };

let worker: Worker | null = null;
let ready: Promise<boolean> | null = null;
let seq = 0;
const pending = new Map<number, Pending>();

function spawn(): Promise<boolean> {
  if (typeof Worker === "undefined") return Promise.resolve(false);
  ready ??= new Promise<boolean>((resolve) => {
    try {
      const w = new Worker("/vendor/pdf-compare-worker.js");
      const timer = setTimeout(() => {
        w.terminate();
        resolve(false);
      }, 5000);
      w.onmessage = (event: MessageEvent<{ id: number; result?: unknown; error?: string }>) => {
        const { id, result, error } = event.data;
        if (id === 0) {
          clearTimeout(timer);
          worker = w;
          document.documentElement.dataset.pdfCompareWorker = "ready";
          resolve(true);
          return;
        }
        const p = pending.get(id);
        if (!p) return;
        pending.delete(id);
        if (error) p.reject(new Error(error));
        else p.resolve(result);
      };
      w.onerror = (event) => {
        event.preventDefault();
        clearTimeout(timer);
        if (worker !== w) resolve(false);
      };
      w.postMessage({ id: 0, job: { op: "ping" } satisfies CompareJob });
    } catch {
      resolve(false);
    }
  });
  return ready;
}

async function run<T>(job: Exclude<CompareJob, { op: "ping" }>, local: () => T, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) throw new CancelledError();
  if (!(await spawn()) || !worker) return local();
  const id = ++seq;
  const w = worker;
  return new Promise<T>((resolve, reject) => {
    // Jobs are short (one page), so cancelling just drops this job's result; the shared
    // worker keeps serving the preview and the report.
    const onAbort = () => {
      pending.delete(id);
      reject(new CancelledError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    pending.set(id, {
      resolve: (r) => {
        signal?.removeEventListener("abort", onAbort);
        resolve(r as T);
      },
      reject: (e) => {
        signal?.removeEventListener("abort", onAbort);
        reject(e);
      },
    });
    const transfer = job.op === "pixels" ? [job.a?.buffer, job.b?.buffer].filter((b): b is ArrayBuffer => b instanceof ArrayBuffer) : [];
    w.postMessage({ id, job }, transfer);
  });
}

/** Pixel diff. The input buffers are transferred to the worker: don't reuse them. */
export function comparePixels(a: Uint8ClampedArray | null, b: Uint8ClampedArray | null, width: number, height: number, threshold: number, signal?: AbortSignal): Promise<PixelResult> {
  return run({ op: "pixels", a, b, width, height, threshold }, () => diffPixels(a, b, width, height, threshold), signal);
}

export function compareText(page: number, a: PageText, b: PageText, signal?: AbortSignal): Promise<PageResult> {
  return run({ op: "text", page, a, b }, () => comparePageText(page, a, b), signal);
}
