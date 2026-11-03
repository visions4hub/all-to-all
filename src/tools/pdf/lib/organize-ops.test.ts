import { describe, expect, it } from "vitest";
import { deleteItems, duplicateItems, insertItems, itemsForFile, moveItems, moveTo, rotateItems } from "./organize-ops";

const pages = (list: { page: number }[]) => list.map((i) => i.page);

describe("organize edits", () => {
  const base = itemsForFile("a", [0, 1, 2, 3, 4]);
  const keys = (...idx: number[]) => new Set(idx.map((i) => base[i].key));

  it("moves selected pages one step, keeping them together", () => {
    expect(pages(moveItems(base, keys(1, 2), -1))).toEqual([1, 2, 0, 3, 4]);
    expect(pages(moveItems(base, keys(1, 2), 1))).toEqual([0, 3, 1, 2, 4]);
    expect(moveItems(base, keys(0), -1)).toBe(base); // already first
    expect(moveItems(base, keys(4), 1)).toBe(base); // already last
  });

  it("moves pages to a drop target", () => {
    expect(pages(moveTo(base, keys(0), base[3].key, true))).toEqual([1, 2, 3, 0, 4]);
    expect(pages(moveTo(base, keys(4), base[0].key, false))).toEqual([4, 0, 1, 2, 3]);
    expect(pages(moveTo(base, keys(1, 3), base[4].key, true))).toEqual([0, 2, 4, 1, 3]);
  });

  it("rotates, duplicates, deletes and inserts", () => {
    const r = rotateItems(base, keys(1), -90);
    expect(r[1].rotate).toBe(270);
    expect(rotateItems(r, keys(1), 90)[1].rotate).toBe(0);
    const d = duplicateItems(base, keys(2));
    expect(pages(d)).toEqual([0, 1, 2, 2, 3, 4]);
    expect(new Set(d.map((i) => i.key)).size).toBe(6);
    expect(pages(deleteItems(base, keys(0, 4)))).toEqual([1, 2, 3]);
    const added = itemsForFile("b", [0, 1]);
    const ins = insertItems(base, added, 2);
    expect(ins.map((i) => `${i.fileId}${i.page}`)).toEqual(["a0", "a1", "b0", "b1", "a2", "a3", "a4"]);
    expect(insertItems(base, added, 99).slice(-2)).toEqual(added);
  });
});
