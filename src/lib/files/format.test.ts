import { describe, expect, it } from "vitest";
import { formatBytes, formatNumber, percentChange } from "./format";

describe("formatBytes", () => {
  it("formats B, KB, MB, GB and TB", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(150 * 1024)).toBe("150 KB");
    expect(formatBytes(10 * 1024 * 1024)).toBe("10 MB");
    expect(formatBytes(2.25 * 1024 ** 3)).toBe("2.25 GB");
    expect(formatBytes(5 * 1024 ** 4)).toBe("5 TB");
  });

  it("returns a dash for invalid sizes", () => {
    expect(formatBytes(-1)).toBe("—");
    expect(formatBytes(NaN)).toBe("—");
    expect(formatBytes(Infinity)).toBe("—");
  });

  it("uses Latin digits only", () => {
    for (const n of [0, 999, 1536, 123456789, 9.9 * 1024 ** 3]) {
      expect(formatBytes(n)).toMatch(/^[0-9.,]+ (B|KB|MB|GB|TB)$/);
    }
  });
});

describe("formatNumber", () => {
  it("uses Latin digits and en-US grouping", () => {
    expect(formatNumber(1234567)).toBe("1,234,567");
    expect(formatNumber(1.236, 2)).toBe("1.24");
  });
});

describe("percentChange", () => {
  it("returns the signed percentage change", () => {
    expect(percentChange(100, 50)).toBe(-50);
    expect(percentChange(200, 300)).toBe(50);
    expect(percentChange(100, 100)).toBe(0);
  });

  it("returns 0 when there is no valid starting size", () => {
    expect(percentChange(0, 100)).toBe(0);
    expect(percentChange(-5, 100)).toBe(0);
  });
});
