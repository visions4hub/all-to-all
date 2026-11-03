// Small byte helpers shared by the metadata readers and writers.

export const latin1 = (b: Uint8Array, start = 0, end = b.length) => {
  let s = "";
  for (let i = start; i < end && i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
};

const utf8Decoder = new TextDecoder("utf-8");
export const utf8 = (b: Uint8Array) => utf8Decoder.decode(b);

/** Decodes text that is usually UTF-8 but sometimes Latin-1; trims trailing NULs and spaces. */
export function text(b: Uint8Array): string {
  let end = b.length;
  while (end > 0 && (b[end - 1] === 0 || b[end - 1] === 0x20)) end--;
  const slice = b.subarray(0, end);
  const s = utf8(slice);
  return (s.includes("�") ? latin1(slice) : s).trim();
}

export const u16be = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
export const u32be = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
export const u16le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
export const u24le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
export const u32le = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

export function startsWith(b: Uint8Array, at: number, sig: string): boolean {
  if (at + sig.length > b.length) return false;
  for (let i = 0; i < sig.length; i++) if (b[at + i] !== sig.charCodeAt(i)) return false;
  return true;
}

export function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function ascii(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

/** zlib (RFC 1950) inflate with the standard DecompressionStream. */
export async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Thrown when a file's structure is broken in a way we can't safely rewrite. */
export class DamagedFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DamagedFileError";
  }
}
