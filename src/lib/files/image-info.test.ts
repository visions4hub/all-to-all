import { describe, expect, it } from "vitest";
import { thumbSize, THUMB_MAX } from "./image-info";

describe("thumbSize", () => {
  it("small images are shown as they are", () => {
    expect(thumbSize(400, 300)).toBeNull();
    expect(thumbSize(THUMB_MAX * 2, 100)).toBeNull();
  });

  it("large photos get a preview whose longest side is THUMB_MAX, same shape", () => {
    expect(thumbSize(4000, 3000)).toEqual({ width: 320, height: 240 });
    expect(thumbSize(3000, 4000)).toEqual({ width: 240, height: 320 });
    expect(thumbSize(20000, 10)).toEqual({ width: 320, height: 1 });
  });

  it("ignores empty sizes", () => {
    expect(thumbSize(0, 3000)).toBeNull();
  });
});
