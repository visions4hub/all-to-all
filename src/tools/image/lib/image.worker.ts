/// <reference lib="webworker" />
// Runs pixel jobs off the main thread so the page stays responsive.

import { runJob, transferables, type Job } from "./jobs";

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = async (event: MessageEvent<{ id: number; job: Job }>) => {
  const { id, job } = event.data;
  try {
    const result = await runJob(job);
    scope.postMessage({ id, result }, transferables(result));
  } catch (error) {
    scope.postMessage({ id, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) });
  }
};
