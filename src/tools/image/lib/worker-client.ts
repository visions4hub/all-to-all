"use client";

import { CancelledError } from "@/lib/engine/types";
import { runJob, transferables, type Job, type JobResult } from "./jobs";

// One shared worker for pixel jobs. If workers can't start in this browser,
// jobs run on the main thread instead (slower, same result).

type Pending = { resolve: (r: JobResult) => void; reject: (e: Error) => void };

let worker: Worker | null = null;
let ready: Promise<boolean> | null = null;
let seq = 0;
const pending = new Map<number, Pending>();

function toError(message: string): Error {
  if (message.startsWith("RangeError")) return new RangeError(message);
  return new Error(message);
}

function spawn(): Promise<boolean> {
  if (ready) return ready;
  ready = new Promise<boolean>((resolve) => {
    try {
      const w = new Worker(new URL("./image.worker.ts", import.meta.url), { type: "module" });
      const timer = setTimeout(() => {
        w.terminate();
        resolve(false);
      }, 5000);
      w.onmessage = (event: MessageEvent<{ id: number; result?: JobResult; error?: string }>) => {
        const { id, result, error } = event.data;
        if (id === 0) {
          clearTimeout(timer);
          worker = w;
          resolve(true);
          return;
        }
        const p = pending.get(id);
        if (!p) return;
        pending.delete(id);
        if (error) p.reject(toError(error));
        else p.resolve(result!);
      };
      w.onerror = () => {
        clearTimeout(timer);
        if (worker !== w) resolve(false);
      };
      w.postMessage({ id: 0, job: { op: "ping" } satisfies Job });
    } catch {
      resolve(false);
    }
  });
  return ready;
}

function reset() {
  worker?.terminate();
  worker = null;
  ready = null;
  for (const p of pending.values()) p.reject(new CancelledError());
  pending.clear();
}

/**
 * Runs a job in the worker. Pixel buffers are transferred, so the caller must
 * use the returned pixels, not the ones it passed in. Aborting stops the job.
 */
export async function runImageJob(job: Job, signal?: AbortSignal): Promise<JobResult> {
  if (signal?.aborted) throw new CancelledError();
  const ok = typeof Worker !== "undefined" && (await spawn());
  if (!ok || !worker) return runJob(job);
  const id = ++seq;
  const w = worker;
  return new Promise<JobResult>((resolve, reject) => {
    const onAbort = () => reset();
    signal?.addEventListener("abort", onAbort, { once: true });
    pending.set(id, {
      resolve: (r) => {
        signal?.removeEventListener("abort", onAbort);
        resolve(r);
      },
      reject: (e) => {
        signal?.removeEventListener("abort", onAbort);
        reject(e);
      },
    });
    w.postMessage({ id, job }, transferables(job));
  });
}

export async function runPixelJob(job: Extract<Job, { px: unknown }>, signal?: AbortSignal) {
  const result = await runImageJob(job, signal);
  if (result.op !== "pixels") throw new Error("Unexpected worker result");
  return result.px;
}
