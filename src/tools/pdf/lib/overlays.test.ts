import { describe, expect, it } from "vitest";
import { UserFacingError } from "@/lib/engine/types";
import { arrowHead, exportOverlays, localPoint, normalizePoints, overlayFrame, type Overlay } from "./overlays";
import type { TextRasterizer } from "./page-space";
import { asInput, ctx, makePdf, openOutput, pageContent, pageImageCount, pageTexts, RED_PNG } from "./test-fixtures";

const fakeRaster: TextRasterizer = async (text, style) => ({ png: RED_PNG, width: text.length * style.fontSize * 0.5, height: style.fontSize * 1.3 });

const base = { rotation: 0, color: "#ff0000", fill: null, strokeWidth: 2, opacity: 1 };
const obj = (o: Partial<Overlay> & Pick<Overlay, "kind">): Overlay => ({ id: Math.random().toString(36), page: 0, x: 0.1, y: 0.1, w: 0.2, h: 0.1, ...base, ...o });

describe("overlay geometry", () => {
  it("maps top-left fractions to display points (y up)", () => {
    expect(overlayFrame({ x: 0.1, y: 0.2, w: 0.5, h: 0.25 }, { width: 600, height: 800 })).toEqual({ cx: 210, cy: 540, w: 300, h: 200 });
    expect(localPoint([0, 0], 100, 50)).toEqual({ x: -50, y: 25 });
    expect(localPoint([1, 1], 100, 50)).toEqual({ x: 50, y: -25 });
  });

  it("normalizes freehand points to the box", () => {
    const n = normalizePoints([
      [0.2, 0.4],
      [0.6, 0.5],
      [0.4, 0.8],
    ]);
    expect(n.minX).toBe(0.2);
    expect(n.spanY).toBeCloseTo(0.4);
    expect(n.points[0]).toEqual([0, 0]);
    expect(n.points[1][0]).toBeCloseTo(1);
    expect(n.points[2][1]).toBeCloseTo(1);
  });

  it("builds an arrowhead behind the tip", () => {
    const [a, b] = arrowHead({ x: 0, y: 0 }, { x: 10, y: 0 }, 5);
    expect(a.x).toBeLessThan(10);
    expect(b.x).toBeLessThan(10);
    expect(a.y).toBeCloseTo(-b.y);
  });
});

describe("export", () => {
  it("draws shapes, Latin text, Arabic text and images on the right pages", async () => {
    const input = asInput(await makePdf(2));
    const overlays: Overlay[] = [
      obj({ kind: "rect", fill: "#00ff00" }),
      obj({ kind: "ellipse" }),
      obj({ kind: "arrow", points: [[0, 0], [1, 1]] }),
      obj({ kind: "path", points: [[0, 0], [0.5, 1], [1, 0]] }),
      obj({ kind: "highlight", opacity: 0.4 }),
      obj({ kind: "text", text: "Approved", fontSize: 18, rotation: 30 }),
      obj({ kind: "text", text: "تمت الموافقة", fontSize: 18, page: 1 }),
      obj({ kind: "image", imageId: "logo", page: 1 }),
    ];
    const [out] = await exportOverlays(
      [input],
      { overlays, images: { logo: { bytes: RED_PNG, type: "png", width: 1, height: 1 } } },
      ctx(),
      fakeRaster,
      "edited",
    );
    expect(out.name).toBe("تقرير الطالب-edited.pdf");
    const doc = await openOutput(out);
    expect(doc.getPageCount()).toBe(2);
    const texts = await pageTexts(out.blob);
    expect(texts[0]).toContain("Approved");
    expect(texts[0]).toContain("Page 1"); // original content kept
    const c0 = await pageContent(doc, 0);
    expect(c0).toMatch(/0 1 0 rg/); // green rectangle fill
    expect(c0).toMatch(/\bc\b/); // ellipse curves
    expect(c0).toMatch(/\/GS-?\w*\s+gs/); // opacity state for the highlight
    expect(await pageImageCount(doc, 0)).toBe(0);
    expect(await pageImageCount(doc, 1)).toBe(2); // Arabic text image + logo
  });

  it("refuses to export with nothing added", async () => {
    const input = asInput(await makePdf(1));
    await expect(exportOverlays([input], { overlays: [], images: {} }, ctx(), fakeRaster, "edited")).rejects.toBeInstanceOf(UserFacingError);
  });
});
