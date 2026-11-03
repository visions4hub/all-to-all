import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { UserFacingError } from "@/lib/engine/types";
import { extractPdfPages, mergePdfs, organizePdf, removePdfPages, rotatePdf, splitGroups, splitPdf } from "./structure";
import { asInput, ctx, makePdf, openOutput, pageTexts } from "./test-fixtures";

describe("merge", () => {
  it("joins files in order, keeps text extractable and keeps the Arabic name", async () => {
    const a = asInput(await makePdf(2, { label: "A" }), "تقرير الطالب.pdf");
    const b = asInput(await makePdf(3, { label: "B" }), "b.pdf");
    const [out] = await mergePdfs([a, b], {}, ctx());
    expect(out.name).toBe("تقرير الطالب-merged.pdf");
    expect(out.sourceIds).toEqual([a.id, b.id]);
    const doc = await openOutput(out);
    expect(doc.getPageCount()).toBe(5);
    expect(await pageTexts(out.blob)).toEqual(["A 1", "A 2", "B 1", "B 2", "B 3"]);
  });

  it("keeps link annotations on copied pages", async () => {
    const src = await PDFDocument.create();
    const page = src.addPage([300, 300]);
    const annot = src.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [10, 10, 100, 40],
      A: { Type: "Action", S: "URI", URI: src.context.obj("https://example.com") },
    });
    page.node.addAnnot(src.context.register(annot));
    const a = asInput(await src.save(), "links.pdf");
    const b = asInput(await makePdf(1), "b.pdf");
    const [out] = await mergePdfs([a, b], {}, ctx());
    const doc = await openOutput(out);
    const annots = doc.getPage(0).node.Annots();
    expect(annots?.size()).toBe(1);
  });

  it("names the file that failed", async () => {
    const good = asInput(await makePdf(1), "good.pdf");
    const bad = asInput(new TextEncoder().encode("not a pdf at all"), "bad.pdf");
    await expect(mergePdfs([good, bad], {}, ctx())).rejects.toThrow(/bad\.pdf/);
  });
});

describe("split", () => {
  it("computes groups for each mode", () => {
    expect(splitGroups({ mode: "every-page", ranges: "", every: 1 }, 3)).toEqual({ ok: true, groups: [[1], [2], [3]] });
    expect(splitGroups({ mode: "every-n", ranges: "", every: 2 }, 5)).toEqual({ ok: true, groups: [[1, 2], [3, 4], [5]] });
    expect(splitGroups({ mode: "ranges", ranges: "1-2, 4-", every: 1 }, 5)).toEqual({ ok: true, groups: [[1, 2], [4, 5]] });
    expect(splitGroups({ mode: "ranges", ranges: "9", every: 1 }, 5).ok).toBe(false);
    expect(splitGroups({ mode: "every-n", ranges: "", every: 0 }, 5).ok).toBe(false);
  });

  it("writes one PDF per range with the right pages", async () => {
    const input = asInput(await makePdf(5));
    const outs = await splitPdf([input], { mode: "ranges", ranges: "1-2, 5, ٣-٤", every: 1 }, ctx());
    expect(outs.map((o) => o.name)).toEqual(["تقرير الطالب-pages-1-2.pdf", "تقرير الطالب-page-5.pdf", "تقرير الطالب-pages-3-4.pdf"]);
    expect(await pageTexts(outs[0].blob)).toEqual(["Page 1", "Page 2"]);
    expect(await pageTexts(outs[1].blob)).toEqual(["Page 5"]);
    expect(await pageTexts(outs[2].blob)).toEqual(["Page 3", "Page 4"]);
  });

  it("rejects invalid ranges with a user-facing error", async () => {
    const input = asInput(await makePdf(2));
    await expect(splitPdf([input], { mode: "ranges", ranges: "5", every: 1 }, ctx())).rejects.toBeInstanceOf(UserFacingError);
  });
});

describe("remove pages", () => {
  it("removes the selected pages and keeps the rest in order", async () => {
    const input = asInput(await makePdf(5));
    const [out] = await removePdfPages([input], { ranges: "2, 4" }, ctx());
    expect(await pageTexts(out.blob)).toEqual(["Page 1", "Page 3", "Page 5"]);
  });

  it("refuses to remove every page", async () => {
    const input = asInput(await makePdf(2));
    await expect(removePdfPages([input], { ranges: "1-2" }, ctx())).rejects.toBeInstanceOf(UserFacingError);
  });
});

describe("extract pages", () => {
  it("extracts into one file", async () => {
    const input = asInput(await makePdf(6));
    const [out] = await extractPdfPages([input], { ranges: "2-3, 6", output: "single" }, ctx());
    expect(out.name).toBe("تقرير الطالب-extracted.pdf");
    expect(await pageTexts(out.blob)).toEqual(["Page 2", "Page 3", "Page 6"]);
  });

  it("extracts per page and per range", async () => {
    const input = asInput(await makePdf(6));
    const perPage = await extractPdfPages([input], { ranges: "2-3, 6", output: "per-page" }, ctx());
    expect(perPage).toHaveLength(3);
    const perRange = await extractPdfPages([input], { ranges: "2-3, 6", output: "per-range" }, ctx());
    expect(perRange.map((o) => o.name)).toEqual(["تقرير الطالب-pages-2-3.pdf", "تقرير الطالب-page-6.pdf"]);
    expect(await pageTexts(perRange[0].blob)).toEqual(["Page 2", "Page 3"]);
  });
});

describe("rotate", () => {
  it("adds rotation to the selected pages only", async () => {
    const input = asInput(await makePdf(3, { rotate: [0, 90, 0] }));
    const [out] = await rotatePdf([input], { angle: 90, selection: { scope: "custom", ranges: "2-3" } }, ctx());
    const doc = await openOutput(out);
    expect(doc.getPages().map((p) => p.getRotation().angle)).toEqual([0, 180, 90]);
  });

  it("rotates every page by -90 and 180", async () => {
    const input = asInput(await makePdf(2));
    const [left] = await rotatePdf([input], { angle: -90, selection: { scope: "all", ranges: "" } }, ctx());
    expect((await openOutput(left)).getPages().map((p) => p.getRotation().angle)).toEqual([270, 270]);
    const [half] = await rotatePdf([input], { angle: 180, selection: { scope: "all", ranges: "" } }, ctx());
    expect((await openOutput(half)).getPages().map((p) => p.getRotation().angle)).toEqual([180, 180]);
  });
});

describe("organize", () => {
  it("reorders, rotates, duplicates, and inserts pages from another file", async () => {
    const a = asInput(await makePdf(3, { label: "A" }), "a.pdf");
    const b = asInput(await makePdf(2, { label: "B" }), "b.pdf");
    const items = [
      { key: "1", fileId: a.id, page: 2, rotate: 0 },
      { key: "2", fileId: b.id, page: 1, rotate: 90 },
      { key: "3", fileId: a.id, page: 0, rotate: 0 },
      { key: "4", fileId: a.id, page: 0, rotate: 180 },
    ];
    const [out] = await organizePdf([a, b], { items }, ctx());
    const doc = await openOutput(out);
    expect(await pageTexts(out.blob)).toEqual(["A 3", "B 2", "A 1", "A 1"]);
    expect(doc.getPages().map((p) => p.getRotation().angle)).toEqual([0, 90, 0, 180]);
    expect(out.name).toBe("a-organized.pdf");
  });

  it("refuses an empty result", async () => {
    const a = asInput(await makePdf(1));
    await expect(organizePdf([a], { items: [] }, ctx())).rejects.toBeInstanceOf(UserFacingError);
  });
});

describe("encrypted and damaged files", () => {
  it("reports an encrypted PDF clearly", async () => {
    // A minimal document whose trailer has an /Encrypt dictionary.
    const doc = await PDFDocument.create();
    doc.addPage();
    const enc = doc.context.register(doc.context.obj({ Filter: "Standard", V: 1, R: 2, O: "x", U: "y", P: -4 }));
    doc.context.trailerInfo.Encrypt = enc;
    const input = asInput(await doc.save({ useObjectStreams: false }));
    await expect(rotatePdf([input], { angle: 90, selection: { scope: "all", ranges: "" } }, ctx())).rejects.toThrow(/password|كلمة مرور/);
  });

  it("reports a damaged file", async () => {
    const input = asInput(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x00, 0x01]));
    await expect(splitPdf([input], { mode: "every-page", ranges: "", every: 1 }, ctx())).rejects.toBeInstanceOf(UserFacingError);
  });
});
