import { describe, expect, it } from "vitest";
import { readPixelSource, runJob, transferables } from "./jobs";

const px = { data: new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]), width: 2, height: 1 };

describe("pixel sources for worker jobs", () => {
  it("pixels already read pass straight through", () => {
    expect(readPixelSource(px)).toBe(px);
  });

  it("transfers the bitmap itself (not a copy) when the worker reads the canvas", () => {
    const bitmap = { width: 2, height: 1, close() {} } as unknown as ImageBitmap;
    expect(transferables({ op: "png", px: { bitmap, width: 2, height: 1 } })).toEqual([bitmap]);
    expect(transferables({ op: "png", px })).toEqual([px.data.buffer]);
  });

  it("PNG job still encodes plain pixels", async () => {
    const result = await runJob({ op: "png", px: { ...px, data: px.data.slice() } });
    expect(result.op).toBe("png");
    if (result.op === "png") expect([...result.bytes.subarray(1, 4)]).toEqual([0x50, 0x4e, 0x47]); // "PNG"
  });
});
