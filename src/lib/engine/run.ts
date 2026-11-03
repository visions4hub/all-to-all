import {
  CancelledError,
  type ProcessContext,
  type ProcessInput,
  type ProcessMode,
  type Processor,
  type RunResult,
} from "./types";

function describeError(error: unknown): string {
  if (error instanceof Error) {
    // Browsers report out-of-memory in different ways; give one clear message.
    if (error.name === "RangeError" || /out of memory|allocation failed|array buffer allocation/i.test(error.message)) {
      return "MEMORY: The browser ran out of memory for this file. Try fewer or smaller files at once.";
    }
    return error.message || error.name;
  }
  return String(error);
}

function isCancel(error: unknown, signal: AbortSignal) {
  return error instanceof CancelledError || (error instanceof DOMException && error.name === "AbortError") || signal.aborted;
}

/**
 * Runs a processor over the inputs.
 * - per-file: files run one after another (keeps memory use low) and each gets its own status.
 * - batch: one call with every input.
 * Nothing is skipped silently: every input ends as done, error or cancelled.
 */
export async function runProcessor<S>(
  processor: Processor<S>,
  inputs: ProcessInput[],
  settings: S,
  mode: ProcessMode,
  ctx: ProcessContext,
  onItem?: (key: string, status: RunResult["items"][number]) => void,
): Promise<RunResult> {
  const result: RunResult = { items: [], outputs: [], cancelled: false };

  if (mode === "batch") {
    const key = "batch";
    onItem?.(key, { key, status: "running", outputs: [] });
    try {
      const outputs = await processor(inputs, settings, ctx);
      const item = { key, status: "done" as const, outputs };
      result.items.push(item);
      result.outputs.push(...outputs);
      onItem?.(key, item);
    } catch (error) {
      const cancelled = isCancel(error, ctx.signal);
      const item = cancelled
        ? { key, status: "cancelled" as const, outputs: [] }
        : { key, status: "error" as const, outputs: [], error: describeError(error) };
      result.cancelled = cancelled;
      result.items.push(item);
      onItem?.(key, item);
    }
    return result;
  }

  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    if (ctx.signal.aborted) {
      const item = { key: input.id, status: "cancelled" as const, outputs: [] };
      result.items.push(item);
      onItem?.(input.id, item);
      result.cancelled = true;
      continue;
    }
    onItem?.(input.id, { key: input.id, status: "running", outputs: [] });
    ctx.onProgress({ done: i, total: inputs.length, label: input.name });
    try {
      const outputs = await processor([input], settings, ctx);
      const item = { key: input.id, status: "done" as const, outputs };
      result.items.push(item);
      result.outputs.push(...outputs);
      onItem?.(input.id, item);
    } catch (error) {
      const cancelled = isCancel(error, ctx.signal);
      if (cancelled) result.cancelled = true;
      const item = cancelled
        ? { key: input.id, status: "cancelled" as const, outputs: [] }
        : { key: input.id, status: "error" as const, outputs: [], error: describeError(error) };
      result.items.push(item);
      onItem?.(input.id, item);
    }
  }
  ctx.onProgress({ done: inputs.length, total: inputs.length });
  return result;
}
