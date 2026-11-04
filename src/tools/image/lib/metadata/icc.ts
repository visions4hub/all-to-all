// Reads the header and description of an ICC colour profile.

import { latin1, text, u32be } from "./bytes";

export type IccInfo = { bytes: number; name?: string; colourSpace?: string; deviceClass?: string; version?: string };

export function parseIcc(p: Uint8Array): IccInfo {
  const info: IccInfo = { bytes: p.length };
  if (p.length < 132) return info;
  info.version = `${p[8]}.${p[9] >> 4}`;
  info.deviceClass = latin1(p, 12, 16).trim();
  info.colourSpace = latin1(p, 16, 20).trim();
  const count = u32be(p, 128);
  for (let i = 0; i < count && i < 200; i++) {
    const e = 132 + i * 12;
    if (e + 12 > p.length) break;
    if (latin1(p, e, e + 4) !== "desc") continue;
    const off = u32be(p, e + 4);
    const size = u32be(p, e + 8);
    if (off + size > p.length || size < 12) break;
    const tag = p.subarray(off, off + size);
    const type = latin1(tag, 0, 4);
    if (type === "desc") {
      const n = u32be(tag, 8);
      info.name = text(tag.subarray(12, 12 + n)) || undefined;
    } else if (type === "mluc") {
      const records = u32be(tag, 8);
      if (records > 0 && tag.length >= 28) {
        const len = u32be(tag, 20);
        const at = u32be(tag, 24);
        let s = "";
        for (let j = at; j + 1 < at + len && j + 1 < tag.length; j += 2) s += String.fromCharCode((tag[j] << 8) | tag[j + 1]);
        info.name = s.replace(/\0+$/, "").trim() || undefined;
      }
    }
    break;
  }
  return info;
}
