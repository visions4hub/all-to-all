// Test helpers for Compress PDF (imported by *.test.ts only).

import { createRequire } from "node:module";
import { join } from "node:path";
import { PDFDocument, PDFName, StandardFonts, concatTransformationMatrix, drawObject, popGraphicsState, pushGraphicsState, type PDFPage } from "pdf-lib";
import type { ImageCodec } from "./image-recompress";
import { runQpdf, type QpdfFactory, type QpdfInstance } from "./qpdf";

const QPDF_DIR = join(process.cwd(), "node_modules/@neslinesli93/qpdf-wasm/dist/");

/** The same qpdf WebAssembly build the browser uses, loaded from node_modules. */
export const nodeQpdf: QpdfFactory = async () => {
  const create = createRequire(import.meta.url)(join(QPDF_DIR, "qpdf.js")) as (o: object) => Promise<QpdfInstance>;
  // qpdf prints diagnostics with console.log/error; keep test output readable.
  const { log, error } = console;
  console.log = console.error = () => undefined;
  try {
    return await create({ locateFile: () => join(QPDF_DIR, "qpdf.wasm") });
  } finally {
    console.log = log;
    console.error = error;
  }
};

/** Runs a qpdf command line on bytes (used to build encrypted fixtures). */
export async function qpdfTransform(bytes: Uint8Array, args: string[]): Promise<Uint8Array> {
  const q = await nodeQpdf();
  q.FS.writeFile("/a.pdf", bytes);
  const code = runQpdf(q, ["/a.pdf", ...args, "/b.pdf"]);
  if (code !== 0 && code !== 3) throw new Error(`qpdf exited with ${code}`);
  return q.FS.readFile("/b.pdf").slice();
}

/** Deterministic pseudo-random bytes (so fixtures are the same on every run). */
function noise(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s >>> 24;
  };
}

function drawImage(page: PDFPage, name: string, x: number, y: number, w: number, h: number) {
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(w, 0, 0, h, x, y), drawObject(name), popGraphicsState());
}

/**
 * A wasteful but valid PDF: 3 text pages, an uncompressed 800×800 RGB image,
 * and 300 KB of objects nothing refers to. Lossless optimisation must shrink it a lot.
 */
export async function makeBloatedPdf(): Promise<{ bytes: Uint8Array; pixels: Uint8Array }> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const w = 800;
  const pixels = new Uint8Array(w * w * 3);
  for (let y = 0; y < w; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      pixels[i] = (x * 255) / w;
      pixels[i + 1] = (y * 255) / w;
      pixels[i + 2] = 128;
    }
  const image = doc.context.register(doc.context.stream(pixels, { Type: "XObject", Subtype: "Image", Width: w, Height: w, ColorSpace: "DeviceRGB", BitsPerComponent: 8 }));
  for (let i = 0; i < 3; i++) doc.context.register(doc.context.stream(new Uint8Array(100_000).fill(65 + i)));
  for (let p = 1; p <= 3; p++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`Report page ${p}`, { x: 50, y: 780, size: 24, font });
    page.drawText(`Total ${p * 100} units`, { x: 50, y: 740, size: 14, font });
    if (p === 1) {
      page.node.setXObject(PDFName.of("Im1"), image);
      drawImage(page, "Im1", 50, 200, 400, 400);
    }
  }
  return { bytes: await doc.save({ useObjectStreams: false }), pixels };
}

/**
 * One A4 page with text and a 2400×2400 Flate image (PNG "Up" predictor) drawn across
 * the page: four solid quadrants (red, green, blue, white) and a band of noise.
 */
export async function makePhotoPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const n = 2400;
  const rand = noise(7);
  const colors = [
    [220, 30, 30],
    [30, 200, 60],
    [30, 60, 220],
    [255, 255, 255],
  ];
  const rowLen = n * 3;
  const predicted = new Uint8Array(n * (rowLen + 1));
  let prev = new Uint8Array(rowLen);
  for (let y = 0; y < n; y++) {
    const row = new Uint8Array(rowLen);
    for (let x = 0; x < n; x++) {
      const band = y >= 1100 && y < 1300;
      const c = colors[(y < n / 2 ? 0 : 2) + (x < n / 2 ? 0 : 1)];
      for (let k = 0; k < 3; k++) row[x * 3 + k] = band ? rand() : c[k];
    }
    predicted[y * (rowLen + 1)] = 2; // Up
    for (let i = 0; i < rowLen; i++) predicted[y * (rowLen + 1) + 1 + i] = (row[i] - prev[i]) & 0xff;
    prev = row;
  }
  const image = doc.context.register(
    doc.context.flateStream(predicted, {
      Type: "XObject",
      Subtype: "Image",
      Width: n,
      Height: n,
      ColorSpace: "DeviceRGB",
      BitsPerComponent: 8,
      DecodeParms: { Predictor: 15, Colors: 3, BitsPerComponent: 8, Columns: n },
    }),
  );
  const page = doc.addPage([595, 842]);
  page.node.setXObject(PDFName.of("Photo"), image);
  drawImage(page, "Photo", 0, 0, 595, 595);
  page.drawText("Photo caption stays text", { x: 50, y: 780, size: 20, font });
  return doc.save({ useObjectStreams: false });
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * A pure-JS codec for Node tests: box-filter downsampling to the target size, stored as
 * Flate RGB. (The browser codec writes JPEG with canvas; that path is tested in Playwright.)
 * It can't decode JPEG, so DCT images are left alone.
 */
export const boxCodec: ImageCodec = {
  async encode(source, target) {
    if (source.kind !== "pixels") return null;
    const { rgba, width, height } = source;
    const { width: tw, height: th } = target;
    const out = new Uint8Array(tw * th * 3);
    for (let y = 0; y < th; y++) {
      const y0 = Math.floor((y * height) / th);
      const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * height) / th));
      for (let x = 0; x < tw; x++) {
        const x0 = Math.floor((x * width) / tw);
        const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * width) / tw));
        let r = 0;
        let g = 0;
        let b = 0;
        for (let yy = y0; yy < y1; yy++)
          for (let xx = x0; xx < x1; xx++) {
            const i = (yy * width + xx) * 4;
            r += rgba[i];
            g += rgba[i + 1];
            b += rgba[i + 2];
          }
        const count = (y1 - y0) * (x1 - x0);
        const o = (y * tw + x) * 3;
        out[o] = Math.round(r / count);
        out[o + 1] = Math.round(g / count);
        out[o + 2] = Math.round(b / count);
      }
    }
    return { bytes: await deflate(out), width: tw, height: th, filter: "FlateDecode", components: 3 };
  },
};
