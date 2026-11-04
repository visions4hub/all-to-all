// Reads IPTC-IIM fields from a Photoshop "8BIM" resource block (JPEG APP13).

import { startsWith, text, u16be, u32be } from "./bytes";

const DATASETS: Record<number, string> = {
  5: "ObjectName",
  25: "Keywords",
  40: "SpecialInstructions",
  55: "DateCreated",
  80: "Byline",
  85: "BylineTitle",
  90: "City",
  92: "Sublocation",
  95: "Province",
  100: "CountryCode",
  101: "Country",
  105: "Headline",
  110: "Credit",
  115: "Source",
  116: "Copyright",
  120: "Caption",
  122: "Writer",
};

/** Lists the Photoshop resources in an APP13 payload (after "Photoshop 3.0\0"). */
export function photoshopResources(b: Uint8Array): { id: number; data: Uint8Array }[] {
  const out: { id: number; data: Uint8Array }[] = [];
  let o = 0;
  while (o + 12 <= b.length && startsWith(b, o, "8BIM")) {
    const id = u16be(b, o + 4);
    const nameLen = b[o + 6];
    let p = o + 7 + nameLen;
    if ((nameLen + 1) % 2) p++; // the Pascal name is padded to an even length
    if (p + 4 > b.length) break;
    const size = u32be(b, p);
    p += 4;
    if (p + size > b.length) break;
    out.push({ id, data: b.subarray(p, p + size) });
    o = p + size + (size % 2);
  }
  return out;
}

export function parseIptc(iim: Uint8Array): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  let o = 0;
  while (o + 5 <= iim.length && iim[o] === 0x1c) {
    const record = iim[o + 1];
    const dataset = iim[o + 2];
    let len = u16be(iim, o + 3);
    let p = o + 5;
    if (len & 0x8000) {
      // Extended length: the low bits give how many bytes hold the real length.
      const n = len & 0x7fff;
      len = 0;
      for (let i = 0; i < n && i < 4; i++) len = len * 256 + iim[p + i];
      p += n;
    }
    if (p + len > iim.length) break;
    const name = record === 2 ? DATASETS[dataset] : undefined;
    if (name) {
      const value = text(iim.subarray(p, p + len));
      if (value) (out[name] ??= []).push(value);
    }
    o = p + len;
  }
  return out;
}
