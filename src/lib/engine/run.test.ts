import { describe, expect, it, vi } from "vitest";
import { runProcessor } from "./run";
import { CancelledError, type ProcessContext, type ProcessInput, type Processor, type Progress, UserFacingError } from "./types";

function input(id: string): ProcessInput {
  return { id, name: `${id}.pdf`, kind: "pdf", file: new File([id], `${id}.pdf`) };
}

function ctx(controller = new AbortController()): ProcessContext & { progress: Progress[] } {
  const progress: Progress[] = [];
  return { signal: controller.signal, onProgress: (p) => progress.push(p), progress };
}

function out(name: string, sourceIds: string[]) {
  return { name, blob: new Blob([name]), sourceIds };
}

const tick = () => new Promise((r) => setTimeout(r, 1));

describe("runProcessor — per-file", () => {
  it("runs inputs one at a time, in order", async () => {
    const order: string[] = [];
    let running = 0;
    let maxRunning = 0;
    const processor: Processor<null> = async ([inp]) => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      order.push(`start:${inp.id}`);
      await tick();
      order.push(`end:${inp.id}`);
      running--;
      return [out(`${inp.id}-out.pdf`, [inp.id])];
    };
    const result = await runProcessor(processor, ["a", "b", "c"].map(input), null, "per-file", ctx());
    expect(order).toEqual(["start:a", "end:a", "start:b", "end:b", "start:c", "end:c"]);
    expect(maxRunning).toBe(1);
    expect(result.cancelled).toBe(false);
    expect(result.items.map((i) => [i.key, i.status])).toEqual([
      ["a", "done"],
      ["b", "done"],
      ["c", "done"],
    ]);
    expect(result.outputs.map((o) => o.name)).toEqual(["a-out.pdf", "b-out.pdf", "c-out.pdf"]);
  });

  it("passes exactly one input and the settings to each call", async () => {
    const processor = vi.fn<Processor<{ q: number }>>(async ([inp]) => [out(inp.id, [inp.id])]);
    const c = ctx();
    await runProcessor(processor, ["a", "b"].map(input), { q: 7 }, "per-file", c);
    expect(processor).toHaveBeenCalledTimes(2);
    expect(processor.mock.calls[0][0].map((i) => i.id)).toEqual(["a"]);
    expect(processor.mock.calls[1][0].map((i) => i.id)).toEqual(["b"]);
    expect(processor.mock.calls[0][1]).toEqual({ q: 7 });
    expect(processor.mock.calls[0][2]).toBe(c);
  });

  it("keeps going when one file fails", async () => {
    const processor: Processor<null> = async ([inp]) => {
      if (inp.id === "b") throw new UserFacingError("This PDF is password-protected.");
      return [out(inp.id, [inp.id])];
    };
    const result = await runProcessor(processor, ["a", "b", "c"].map(input), null, "per-file", ctx());
    expect(result.items).toEqual([
      expect.objectContaining({ key: "a", status: "done" }),
      { key: "b", status: "error", outputs: [], error: "This PDF is password-protected." },
      expect.objectContaining({ key: "c", status: "done" }),
    ]);
    expect(result.outputs).toHaveLength(2);
    expect(result.cancelled).toBe(false);
  });

  it("reports progress with done/total and labels", async () => {
    const c = ctx();
    await runProcessor(async ([inp]) => [out(inp.id, [inp.id])], ["a", "b", "c"].map(input), null, "per-file", c);
    expect(c.progress).toEqual([
      { done: 0, total: 3, label: "a.pdf" },
      { done: 1, total: 3, label: "b.pdf" },
      { done: 2, total: 3, label: "c.pdf" },
      { done: 3, total: 3 },
    ]);
  });

  it("calls onItem with running then the final status", async () => {
    const events: string[] = [];
    await runProcessor(
      async ([inp]) => {
        if (inp.id === "b") throw new Error("boom");
        return [out(inp.id, [inp.id])];
      },
      ["a", "b"].map(input),
      null,
      "per-file",
      ctx(),
      (key, item) => events.push(`${key}:${item.status}`),
    );
    expect(events).toEqual(["a:running", "a:done", "b:running", "b:error"]);
  });

  it("marks the remaining inputs cancelled when aborted mid-way", async () => {
    const controller = new AbortController();
    const calls: string[] = [];
    const processor: Processor<null> = async ([inp]) => {
      calls.push(inp.id);
      if (inp.id === "b") {
        controller.abort();
        throw new CancelledError();
      }
      return [out(inp.id, [inp.id])];
    };
    const result = await runProcessor(processor, ["a", "b", "c", "d"].map(input), null, "per-file", ctx(controller));
    expect(calls).toEqual(["a", "b"]);
    expect(result.cancelled).toBe(true);
    expect(result.items.map((i) => [i.key, i.status])).toEqual([
      ["a", "done"],
      ["b", "cancelled"],
      ["c", "cancelled"],
      ["d", "cancelled"],
    ]);
    expect(result.items.every((i) => i.error === undefined)).toBe(true);
    expect(result.outputs.map((o) => o.name)).toEqual(["a"]);
  });

  it("keeps the output of a file that finished before noticing the abort", async () => {
    const controller = new AbortController();
    const processor: Processor<null> = async ([inp]) => {
      if (inp.id === "a") controller.abort();
      return [out(inp.id, [inp.id])];
    };
    const result = await runProcessor(processor, ["a", "b"].map(input), null, "per-file", ctx(controller));
    expect(result.items.map((i) => i.status)).toEqual(["done", "cancelled"]);
    expect(result.cancelled).toBe(true);
  });

  it("does not call the processor at all when already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const processor = vi.fn<Processor<null>>(async () => []);
    const result = await runProcessor(processor, ["a", "b"].map(input), null, "per-file", ctx(controller));
    expect(processor).not.toHaveBeenCalled();
    expect(result.items.map((i) => i.status)).toEqual(["cancelled", "cancelled"]);
    expect(result.cancelled).toBe(true);
  });

  it("treats CancelledError and AbortError as cancelled, not error", async () => {
    const processor: Processor<null> = async ([inp]) => {
      if (inp.id === "a") throw new CancelledError();
      if (inp.id === "b") throw new DOMException("The operation was aborted.", "AbortError");
      return [out(inp.id, [inp.id])];
    };
    const result = await runProcessor(processor, ["a", "b", "c"].map(input), null, "per-file", ctx());
    expect(result.items.map((i) => [i.key, i.status])).toEqual([
      ["a", "cancelled"],
      ["b", "cancelled"],
      ["c", "done"],
    ]);
    expect(result.items[0].error).toBeUndefined();
    expect(result.cancelled).toBe(true);
  });

  it("treats any error thrown after the signal is aborted as cancelled", async () => {
    const controller = new AbortController();
    const processor: Processor<null> = async () => {
      controller.abort();
      throw new Error("decoder closed");
    };
    const result = await runProcessor(processor, [input("a")], null, "per-file", ctx(controller));
    expect(result.items[0].status).toBe("cancelled");
  });

  it("turns out-of-memory errors into a MEMORY: message", async () => {
    const processor: Processor<null> = async ([inp]) => {
      if (inp.id === "a") throw new RangeError("Invalid typed array length: 99999999999");
      throw new Error("Array buffer allocation failed");
    };
    const result = await runProcessor(processor, ["a", "b"].map(input), null, "per-file", ctx());
    for (const item of result.items) {
      expect(item.status).toBe("error");
      expect(item.error).toMatch(/^MEMORY:/);
    }
  });

  it("describes errors without a message and non-Error throws", async () => {
    const processor: Processor<null> = async ([inp]) => {
      if (inp.id === "a") throw new TypeError("");
      throw "plain string";
    };
    const result = await runProcessor(processor, ["a", "b"].map(input), null, "per-file", ctx());
    expect(result.items.map((i) => i.error)).toEqual(["TypeError", "plain string"]);
  });

  it("handles an empty input list", async () => {
    const c = ctx();
    const result = await runProcessor(async () => [], [], null, "per-file", c);
    expect(result).toEqual({ items: [], outputs: [], cancelled: false });
    expect(c.progress).toEqual([{ done: 0, total: 0 }]);
  });
});

describe("runProcessor — batch", () => {
  it("calls the processor once with every input", async () => {
    const processor = vi.fn<Processor<null>>(async (inputs) => [out("merged.pdf", inputs.map((i) => i.id))]);
    const events: string[] = [];
    const result = await runProcessor(processor, ["a", "b", "c"].map(input), null, "batch", ctx(), (k, i) =>
      events.push(`${k}:${i.status}`),
    );
    expect(processor).toHaveBeenCalledTimes(1);
    expect(processor.mock.calls[0][0].map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(result.items).toEqual([{ key: "batch", status: "done", outputs: result.outputs }]);
    expect(result.outputs[0].sourceIds).toEqual(["a", "b", "c"]);
    expect(result.cancelled).toBe(false);
    expect(events).toEqual(["batch:running", "batch:done"]);
  });

  it("reports a single error item", async () => {
    const result = await runProcessor(
      async () => {
        throw new UserFacingError("Damaged file");
      },
      ["a", "b"].map(input),
      null,
      "batch",
      ctx(),
    );
    expect(result.items).toEqual([{ key: "batch", status: "error", outputs: [], error: "Damaged file" }]);
    expect(result.outputs).toEqual([]);
    expect(result.cancelled).toBe(false);
  });

  it("reports cancellation", async () => {
    const controller = new AbortController();
    const result = await runProcessor(
      async () => {
        controller.abort();
        throw new CancelledError();
      },
      ["a", "b"].map(input),
      null,
      "batch",
      ctx(controller),
    );
    expect(result.items).toEqual([{ key: "batch", status: "cancelled", outputs: [] }]);
    expect(result.cancelled).toBe(true);
  });

  it("maps RangeError to a MEMORY: message", async () => {
    const result = await runProcessor(
      async () => {
        throw new RangeError("Array buffer allocation failed");
      },
      [input("a")],
      null,
      "batch",
      ctx(),
    );
    expect(result.items[0].error).toMatch(/^MEMORY:/);
  });
});
