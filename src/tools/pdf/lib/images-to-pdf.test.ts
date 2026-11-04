import { describe, expect, it } from "vitest";
import { UserFacingError } from "@/lib/engine/types";
import { applyMatrix, mmToPt } from "./geometry";
import {
  DEFAULT_IMAGE_TO_PDF,
  fromUnit,
  imagesToPdf,
  jpegOrientation,
  MM_PER_UNIT,
  orientationMatrix,
  PAGE_PRESETS,
  pageSizeFor,
  placeImage,
  PX_TO_PT,
  swapsAxes,
  toUnit,
  type ImageToPdfSettings,
  type LengthUnit,
} from "./images-to-pdf";
import { asInput, ctx, openOutput, pageContent, pageImageCount, RED_PNG } from "./test-fixtures";

/** A structurally valid JPEG header (enough for pdf-lib) with an EXIF orientation. */
function fakeJpeg(width: number, height: number, orientation?: number): Uint8Array {
  const bytes: number[] = [0xff, 0xd8];
  if (orientation) {
    const tiff = [0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8, 0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0, 0, 0, 1, 0x00, orientation, 0, 0, 0, 0, 0, 0];
    const payload = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
    const len = payload.length + 2;
    bytes.push(0xff, 0xe1, len >> 8, len & 255, ...payload);
  }
  bytes.push(0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01);
  bytes.push(0xff, 0xd9);
  return new Uint8Array(bytes);
}

describe("page size and fit math", () => {
  it("chooses A4/Letter, orientation and original size", () => {
    expect(pageSizeFor({ ...DEFAULT_IMAGE_TO_PDF, orientation: "auto" }, 400, 300)).toEqual([841.89, 595.28]);
    expect(pageSizeFor({ ...DEFAULT_IMAGE_TO_PDF, orientation: "portrait" }, 400, 300)).toEqual([595.28, 841.89]);
    expect(pageSizeFor({ ...DEFAULT_IMAGE_TO_PDF, pageSize: "letter", orientation: "landscape" }, 10, 20)).toEqual([792, 612]);
    const [w, h] = pageSizeFor({ ...DEFAULT_IMAGE_TO_PDF, pageSize: "original", margin: 0 }, 960, 480);
    expect([w, h]).toEqual([720, 360]);
    const [cw, ch] = pageSizeFor({ ...DEFAULT_IMAGE_TO_PDF, pageSize: "custom", customWidth: 100, customHeight: 150, orientation: "portrait" }, 1, 1);
    expect(cw).toBeCloseTo(mmToPt(100));
    expect(ch).toBeCloseTo(mmToPt(150));
  });

  it("fits, fills and keeps actual size", () => {
    const fit = placeImage("fit", [600, 800], 0, 300, 100);
    expect(fit.rect).toEqual({ x: 0, y: 300, width: 600, height: 200 });
    const fill = placeImage("fill", [600, 800], 0, 300, 100);
    expect(fill.rect.height).toBe(800);
    expect(fill.rect.width).toBe(2400);
    expect(fill.clip).toEqual({ x: 0, y: 0, width: 600, height: 800 });
    const actual = placeImage("actual", [600, 800], 0, 400, 200);
    expect(actual.rect.width).toBe(400 * PX_TO_PT);
    const shrunk = placeImage("actual", [600, 800], 0, 4000, 200);
    expect(shrunk.rect.width).toBe(600);
  });
});

describe("EXIF orientation", () => {
  it("reads the orientation tag", () => {
    expect(jpegOrientation(fakeJpeg(10, 10))).toBe(1);
    expect(jpegOrientation(fakeJpeg(10, 10, 6))).toBe(6);
    expect(jpegOrientation(fakeJpeg(10, 10, 3))).toBe(3);
    expect(jpegOrientation(RED_PNG)).toBe(1);
  });

  it("maps the stored image so it displays upright", () => {
    const rect = { x: 0, y: 0, width: 100, height: 200 };
    // Orientation 6 (camera turned 90° clockwise): stored top-left → displayed top-right.
    const m6 = orientationMatrix(6, rect);
    expect(applyMatrix(m6, 0, 1)).toEqual({ x: 100, y: 200 });
    expect(applyMatrix(m6, 0, 0)).toEqual({ x: 0, y: 200 });
    // Orientation 8: stored top-left → displayed bottom-left.
    expect(applyMatrix(orientationMatrix(8, rect), 0, 1)).toEqual({ x: 0, y: 0 });
    // Orientation 3: upside down.
    expect(applyMatrix(orientationMatrix(3, rect), 0, 1)).toEqual({ x: 100, y: 0 });
    // Orientation 1: identity into the rect.
    expect(applyMatrix(orientationMatrix(1, rect), 1, 1)).toEqual({ x: 100, y: 200 });
    expect(swapsAxes(6)).toBe(true);
    expect(swapsAxes(3)).toBe(false);
  });
});

describe("images → PDF", () => {
  it("makes one page per image in order, in one PDF", async () => {
    const a = asInput(RED_PNG, "صورة.png", "png");
    const b = asInput(fakeJpeg(200, 100), "b.jpg", "jpeg");
    const [out] = await imagesToPdf([a, b], DEFAULT_IMAGE_TO_PDF, ctx());
    expect(out.name).toBe("صورة-images.pdf");
    const doc = await openOutput(out);
    expect(doc.getPageCount()).toBe(2);
    expect(await pageImageCount(doc, 0)).toBe(1);
    // The JPEG is landscape → landscape A4 in auto mode.
    expect(doc.getPage(1).getSize()).toEqual({ width: 841.89, height: 595.28 });
  });

  it("makes separate PDFs", async () => {
    const outs = await imagesToPdf(
      [asInput(RED_PNG, "a.png", "png"), asInput(RED_PNG, "b.png", "png")],
      { ...DEFAULT_IMAGE_TO_PDF, output: "separate" },
      ctx(),
    );
    expect(outs.map((o) => o.name)).toEqual(["a.pdf", "b.pdf"]);
    for (const o of outs) expect((await openOutput(o)).getPageCount()).toBe(1);
  });

  it("turns a phone photo upright (EXIF 6) and sizes the page for it", async () => {
    const photo = asInput(fakeJpeg(400, 300, 6), "phone.jpg", "jpeg");
    const [out] = await imagesToPdf([photo], { ...DEFAULT_IMAGE_TO_PDF, pageSize: "original", margin: 0 }, ctx());
    const doc = await openOutput(out);
    // Stored 400×300 but displayed 300×400.
    expect(doc.getPage(0).getSize()).toEqual({ width: 300 * PX_TO_PT, height: 400 * PX_TO_PT });
    expect(await pageContent(doc, 0)).toMatch(/0 -300 225 0 0 300 cm/);
  });

  it("reports a broken image", async () => {
    const bad = asInput(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]), "bad.png", "png");
    await expect(imagesToPdf([bad], DEFAULT_IMAGE_TO_PDF, ctx())).rejects.toBeInstanceOf(UserFacingError);
  });

  it("rejects margins bigger than the page", async () => {
    await expect(imagesToPdf([asInput(RED_PNG, "a.png", "png")], { ...DEFAULT_IMAGE_TO_PDF, margin: 200 }, ctx())).rejects.toBeInstanceOf(UserFacingError);
  });
});

describe("page size choices", () => {
  const portrait = (s: Partial<ImageToPdfSettings>) => pageSizeFor({ ...DEFAULT_IMAGE_TO_PDF, orientation: "portrait", ...s }, 100, 200);

  it("every preset has its standard size in points", () => {
    expect(portrait({ pageSize: "a3" })).toEqual([841.89, 1190.55]);
    expect(portrait({ pageSize: "a4" })).toEqual([595.28, 841.89]);
    expect(portrait({ pageSize: "a5" })).toEqual([419.53, 595.28]);
    expect(portrait({ pageSize: "a6" })).toEqual([297.64, 419.53]);
    expect(portrait({ pageSize: "b5" })).toEqual([498.9, 708.66]);
    expect(portrait({ pageSize: "letter" })).toEqual([612, 792]);
    expect(portrait({ pageSize: "legal" })).toEqual([612, 1008]);
    expect(portrait({ pageSize: "tabloid" })).toEqual([792, 1224]);
    expect(portrait({ pageSize: "photo-10x15" })).toEqual([288, 432]);
    expect(portrait({ pageSize: "photo-13x18" })).toEqual([360, 504]);
  });

  it("landscape swaps every preset", () => {
    for (const name of Object.keys(PAGE_PRESETS) as (keyof typeof PAGE_PRESETS)[]) {
      const [w, h] = pageSizeFor({ ...DEFAULT_IMAGE_TO_PDF, pageSize: name, orientation: "landscape" }, 100, 200);
      expect(w).toBeGreaterThan(h);
    }
  });

  it("custom sizes are stored in millimetres whatever unit is shown", () => {
    expect(portrait({ pageSize: "custom", customWidth: 100, customHeight: 150, customUnit: "cm" })).toEqual([283.46, 425.2]);
  });

  it("unit conversion round-trips and uses 96 px per inch", () => {
    for (const unit of Object.keys(MM_PER_UNIT) as LengthUnit[]) expect(fromUnit(toUnit(210, unit), unit)).toBeCloseTo(210, 9);
    expect(toUnit(25.4, "in")).toBe(1);
    expect(toUnit(25.4, "px")).toBeCloseTo(96, 9);
    expect(fromUnit(21, "cm")).toBe(210);
  });

  it("an unknown page size name (from an old or edited workflow) falls back to A4", () => {
    expect(portrait({ pageSize: "folio" as never })).toEqual([595.28, 841.89]);
  });

  it("a custom size outside 20–5000 mm is refused with a clear message", async () => {
    const run = imagesToPdf([asInput(RED_PNG, "a.png", "png")], { ...DEFAULT_IMAGE_TO_PDF, pageSize: "custom", customWidth: 10 }, ctx());
    await expect(run).rejects.toBeInstanceOf(UserFacingError);
  });
});
