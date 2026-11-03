import { describe, expect, it } from "vitest";
import { detectFileKind, detectKindFromBytes, groupOf, KIND_INFO } from "./detect";

const enc = new TextEncoder();

/** Bytes from numbers and/or ASCII strings, padded with zeros to `minLength`. */
function bytes(parts: (number | string)[], minLength = 16): Uint8Array<ArrayBuffer> {
  const out: number[] = [];
  for (const p of parts) {
    if (typeof p === "number") out.push(p);
    else out.push(...enc.encode(p));
  }
  while (out.length < minLength) out.push(0);
  return new Uint8Array(out);
}

describe("detectKindFromBytes", () => {
  it("detects JPEG", () => {
    expect(detectKindFromBytes(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg");
  });

  it("detects PNG", () => {
    expect(detectKindFromBytes(bytes([0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("png");
  });

  it("detects GIF87a and GIF89a", () => {
    expect(detectKindFromBytes(bytes(["GIF87a"]))).toBe("gif");
    expect(detectKindFromBytes(bytes(["GIF89a"]))).toBe("gif");
  });

  it("detects WebP (RIFF....WEBP) but not other RIFF files", () => {
    expect(detectKindFromBytes(bytes(["RIFF", 0x24, 0, 0, 0, "WEBPVP8 "]))).toBe("webp");
    expect(detectKindFromBytes(bytes(["RIFF", 0x24, 0, 0, 0, "WAVEfmt "]))).toBe("unknown");
  });

  it("detects BMP only when long enough for a header", () => {
    expect(detectKindFromBytes(bytes(["BM"], 14))).toBe("bmp");
    expect(detectKindFromBytes(bytes(["BM"], 10))).toBe("unknown");
  });

  it("detects little- and big-endian TIFF", () => {
    expect(detectKindFromBytes(bytes([0x49, 0x49, 0x2a, 0x00]))).toBe("tiff");
    expect(detectKindFromBytes(bytes([0x4d, 0x4d, 0x00, 0x2a]))).toBe("tiff");
  });

  it("detects HEIC brands", () => {
    expect(detectKindFromBytes(bytes([0, 0, 0, 0x18, "ftypheic"]))).toBe("heic");
    expect(detectKindFromBytes(bytes([0, 0, 0, 0x18, "ftypmif1"]))).toBe("heic");
    expect(detectKindFromBytes(bytes([0, 0, 0, 0x18, "ftypheix"]))).toBe("heic");
  });

  it("detects AVIF brands", () => {
    expect(detectKindFromBytes(bytes([0, 0, 0, 0x1c, "ftypavif"]))).toBe("avif");
    expect(detectKindFromBytes(bytes([0, 0, 0, 0x1c, "ftypavis"]))).toBe("avif");
  });

  it("does not treat an MP4 (ftyp isom) as an image", () => {
    expect(detectKindFromBytes(bytes([0, 0, 0, 0x18, "ftypisom"]))).toBe("unknown");
  });

  it("detects PDF at the start and after leading junk", () => {
    expect(detectKindFromBytes(bytes(["%PDF-1.7\n"]))).toBe("pdf");
    expect(detectKindFromBytes(bytes([0x00, 0x0a, 0x20, 0x0d, "%PDF-1.4\n"]))).toBe("pdf");
  });

  it("ignores a PDF header beyond the first 1024 bytes", () => {
    const b = new Uint8Array(1100).fill(0x20);
    b.set(enc.encode("%PDF-1.4"), 1050);
    expect(detectKindFromBytes(b)).toBe("unknown");
  });

  it("detects plain SVG", () => {
    expect(detectKindFromBytes(enc.encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBe("svg");
    expect(detectKindFromBytes(enc.encode("  \n<svg>\n</svg>"))).toBe("svg");
  });

  it("detects SVG with a UTF-8 BOM", () => {
    const body = enc.encode("<svg viewBox='0 0 1 1'></svg>");
    const b = new Uint8Array(3 + body.length);
    b.set([0xef, 0xbb, 0xbf]);
    b.set(body, 3);
    expect(detectKindFromBytes(b)).toBe("svg");
  });

  it("detects SVG after an XML prolog, comment and doctype", () => {
    const text =
      '<?xml version="1.0" encoding="UTF-8"?>\n<!-- Generator: Illustrator -->\n' +
      '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n' +
      '<svg width="10" height="10"></svg>';
    expect(detectKindFromBytes(enc.encode(text))).toBe("svg");
    const withSubset = '<!DOCTYPE svg [ <!ENTITY ns "http://www.w3.org/2000/svg"> ]>\n<svg xmlns="&ns;"/>';
    expect(detectKindFromBytes(enc.encode(withSubset))).toBe("svg");
    expect(detectKindFromBytes(enc.encode("<SVG/>"))).toBe("svg");
  });

  it("does not treat HTML as SVG, even with inline <svg>", () => {
    expect(detectKindFromBytes(enc.encode("<html><body>hi</body></html>"))).toBe("unknown");
    expect(detectKindFromBytes(enc.encode("<!DOCTYPE html><html><body><svg></svg></body></html>"))).toBe("unknown");
  });

  it("does not treat elements whose name only starts with svg as SVG", () => {
    expect(detectKindFromBytes(enc.encode("<svgfoo></svgfoo>"))).toBe("unknown");
  });

  it("returns unknown for plain text and random bytes", () => {
    expect(detectKindFromBytes(enc.encode("Hello, this is just text."))).toBe("unknown");
    expect(detectKindFromBytes(enc.encode("نص عربي عادي"))).toBe("unknown");
    expect(detectKindFromBytes(new Uint8Array([0x13, 0x37, 0xc0, 0xde, 0x01, 0x02, 0x03, 0x04]))).toBe("unknown");
  });

  it("returns unknown for fewer than 4 bytes", () => {
    expect(detectKindFromBytes(new Uint8Array([]))).toBe("unknown");
    expect(detectKindFromBytes(new Uint8Array([0xff, 0xd8, 0xff]))).toBe("unknown");
  });
});

describe("detectFileKind", () => {
  it("reads the first bytes of a Blob", async () => {
    await expect(detectFileKind(new Blob([bytes([0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a])]))).resolves.toBe("png");
    await expect(detectFileKind(new Blob(["%PDF-1.7\n"], { type: "image/png" }))).resolves.toBe("pdf");
    await expect(detectFileKind(new Blob(["<svg></svg>"]))).resolves.toBe("svg");
    await expect(detectFileKind(new Blob([]))).resolves.toBe("unknown");
  });

  it("ignores the file name and reported MIME type", async () => {
    const file = new File([bytes([0xff, 0xd8, 0xff, 0xe1])], "photo.png", { type: "image/png" });
    await expect(detectFileKind(file)).resolves.toBe("jpeg");
  });
});

describe("KIND_INFO / groupOf", () => {
  it("groups kinds", () => {
    expect(groupOf("pdf")).toBe("pdf");
    expect(groupOf("heic")).toBe("image");
    expect(groupOf("unknown")).toBe("other");
    expect(KIND_INFO.jpeg.ext).toBe("jpg");
  });
});
