import { describe, expect, it } from "vitest";
import { estimatePeakMemory, memoryBudget, memoryLevel } from "./memory";

const MB = 1024 ** 2;
const GB = 1024 ** 3;
const photo = { size: 5 * MB, kind: "jpeg", width: 4000, height: 3000 };

describe("memory estimate", () => {
  it("is zero with no files", () => {
    expect(estimatePeakMemory([], "per-file")).toBe(0);
  });

  it("per-file: holds every file, works on the largest one at a time", () => {
    const peak = estimatePeakMemory([photo, photo, { ...photo, width: 8000, height: 6000 }], "per-file");
    // 3 × 5 MB held twice (inputs + outputs) + one 48 MP image × 4 bytes × 3 copies
    expect(peak).toBe(30 * MB + 8000 * 6000 * 4 * 3);
  });

  it("batch: every file stays decoded, plus the one being worked on", () => {
    const peak = estimatePeakMemory([photo, photo], "batch");
    expect(peak).toBe(20 * MB + 4000 * 3000 * 4 * 3 + 2 * 4000 * 3000 * 4);
  });

  it("an image whose pixel size isn't known yet is guessed from its file size", () => {
    const unknown = { size: 5 * MB, kind: "jpeg" };
    expect(estimatePeakMemory([unknown], "per-file")).toBe(10 * MB + 5 * MB * 10 * 3);
    // 30 such photos in one batch warn on a 4 GB phone before any of their sizes is read.
    expect(memoryLevel(estimatePeakMemory(Array.from({ length: 30 }, () => unknown), "batch"), memoryBudget(4))).toBe("high");
  });

  it("PDFs without pixel sizes count their parsed size", () => {
    expect(estimatePeakMemory([{ size: 100 * MB, kind: "pdf", pageCount: 500 }], "per-file")).toBe(200 * MB + 400 * MB);
    expect(estimatePeakMemory([{ size: 100 * MB, kind: "pdf" }, { size: 100 * MB, kind: "pdf" }], "batch")).toBe(400 * MB + 400 * MB + 800 * MB);
  });

  it("30 camera photos in one batch is more than a phone's budget, one photo isn't", () => {
    const thirty = Array.from({ length: 30 }, () => photo);
    expect(memoryLevel(estimatePeakMemory(thirty, "batch"), memoryBudget(4))).toBe("high");
    expect(memoryLevel(estimatePeakMemory([photo], "per-file"), memoryBudget(4))).toBe("ok");
    // The same 30 photos processed one by one fit a desktop's budget.
    expect(memoryLevel(estimatePeakMemory(thirty, "per-file"), memoryBudget(8))).toBe("ok");
  });

  it("budget is a quarter of device memory, 4 GB assumed when unknown", () => {
    expect(memoryBudget(8)).toBe(2 * GB);
    expect(memoryBudget(undefined)).toBe(1 * GB);
    expect(memoryBudget(0)).toBe(1 * GB);
  });
});
