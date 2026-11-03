// Pure edits for the organize grid. Items are immutable; every edit returns a new list
// (so undo/redo can keep snapshots).

import { normalizeRotation } from "./geometry";
import type { OrganizeItem } from "./structure";

let seq = 0;
export const newKey = () => `p${Date.now().toString(36)}${(seq++).toString(36)}`;

export function itemsForFile(fileId: string, pages: number[]): OrganizeItem[] {
  return pages.map((page) => ({ key: newKey(), fileId, page, rotate: 0 }));
}

/** Moves the selected items one step earlier (-1) or later (+1), keeping their order. */
export function moveItems(items: OrganizeItem[], keys: Set<string>, delta: -1 | 1): OrganizeItem[] {
  const out = [...items];
  const indexes = out.map((it, i) => (keys.has(it.key) ? i : -1)).filter((i) => i >= 0);
  if (!indexes.length) return items;
  if (delta < 0 ? indexes[0] === 0 : indexes[indexes.length - 1] === out.length - 1) return items;
  const order = delta < 0 ? indexes : [...indexes].reverse();
  for (const i of order) [out[i], out[i + delta]] = [out[i + delta], out[i]];
  return out;
}

/** Moves the selected items (or one dragged item) so they start at `target` in the remaining list. */
export function moveTo(items: OrganizeItem[], keys: Set<string>, targetKey: string, after: boolean): OrganizeItem[] {
  if (keys.has(targetKey)) return items;
  const moving = items.filter((it) => keys.has(it.key));
  const rest = items.filter((it) => !keys.has(it.key));
  let at = rest.findIndex((it) => it.key === targetKey);
  if (at < 0) return items;
  if (after) at++;
  return [...rest.slice(0, at), ...moving, ...rest.slice(at)];
}

export function rotateItems(items: OrganizeItem[], keys: Set<string>, by: number): OrganizeItem[] {
  return items.map((it) => (keys.has(it.key) ? { ...it, rotate: normalizeRotation(it.rotate + by) } : it));
}

/** Puts a copy of each selected item right after it. */
export function duplicateItems(items: OrganizeItem[], keys: Set<string>): OrganizeItem[] {
  return items.flatMap((it) => (keys.has(it.key) ? [it, { ...it, key: newKey() }] : [it]));
}

export function deleteItems(items: OrganizeItem[], keys: Set<string>): OrganizeItem[] {
  return items.filter((it) => !keys.has(it.key));
}

/** Inserts new items at an index (clamped). */
export function insertItems(items: OrganizeItem[], added: OrganizeItem[], at: number): OrganizeItem[] {
  const i = Math.max(0, Math.min(items.length, at));
  return [...items.slice(0, i), ...added, ...items.slice(i)];
}
