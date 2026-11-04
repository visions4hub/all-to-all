/// <reference lib="webworker" />
// Compare PDF: pixel and word diffs run here, off the main thread. Bundled by
// scripts/build-pdf-worker.mjs into public/vendor/pdf-compare-worker.js.

import { comparePageText, diffPixels } from "./compare-core";
import type { CompareJob } from "./compare-client";

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<{ id: number; job: CompareJob }>) => {
  const { id, job } = event.data;
  try {
    if (job.op === "ping") scope.postMessage({ id, result: null });
    else if (job.op === "pixels") {
      const result = diffPixels(job.a, job.b, job.width, job.height, job.threshold);
      scope.postMessage({ id, result }, [result.image.buffer]);
    } else scope.postMessage({ id, result: comparePageText(job.page, job.a, job.b) });
  } catch (error) {
    scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
