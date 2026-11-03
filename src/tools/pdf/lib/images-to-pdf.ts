// Image → PDF. JPG and PNG are embedded as they are (no re-encoding, no quality loss);
// WebP is converted to PNG by the browser first (see the tool module).

import type { PDFImage, PDFPage } from "pdf-lib";
import { throwIfCancelled, UserFacingError, type ProcessContext, type ProcessInput, type ProcessOutput } from "@/lib/engine/types";
import { buildOutputName } from "@/lib/files/filename";
import { userError } from "./errors";
import { mmToPt, type Box, type Matrix } from "./geometry";
import { createPdfDocument, loadPdfLib, savePdf } from "./pdf-lib";

export type PageSizeName = "a4" | "letter" | "original" | "custom";
export type ImageFit = "fit" | "fill" | "actual";

export type ImageToPdfSettings = {
  output: "single" | "separate";
  pageSize: PageSizeName;
  /** Custom size in millimetres (portrait values; orientation may swap them). */
  customWidth: number;
  customHeight: number;
  orientation: "auto" | "portrait" | "landscape";
  /** Millimetres on every side. */
  margin: number;
  fit: ImageFit;
};

export const DEFAULT_IMAGE_TO_PDF: ImageToPdfSettings = {
  output: "single",
  pageSize: "a4",
  customWidth: 210,
  customHeight: 297,
  orientation: "auto",
  margin: 10,
  fit: "fit",
};

const SIZES_PT: Record<"a4" | "letter", [number, number]> = { a4: [595.28, 841.89], letter: [612, 792] };
/** Pixels are treated as CSS pixels (96 per inch) for "original size". */
export const PX_TO_PT = 72 / 96;

/** Page size in points for an image of the given displayed pixel size. */
export function pageSizeFor(s: ImageToPdfSettings, imgW: number, imgH: number): [number, number] {
  const marginPt = mmToPt(Math.max(0, s.margin));
  if (s.pageSize === "original") return [imgW * PX_TO_PT + 2 * marginPt, imgH * PX_TO_PT + 2 * marginPt];
  let [w, h] = s.pageSize === "custom" ? [mmToPt(s.customWidth), mmToPt(s.customHeight)] : SIZES_PT[s.pageSize];
  const landscape = s.orientation === "landscape" || (s.orientation === "auto" && imgW > imgH);
  if (landscape !== w > h) [w, h] = [h, w];
  return [w, h];
}

/**
 * Where the image goes on the page (its displayed rectangle) and the clip area.
 * fit: whole image, as large as fits · fill: covers the area, edges cropped ·
 * actual: original size (96 px/inch), shrunk only if it doesn't fit.
 */
export function placeImage(fit: ImageFit, page: [number, number], marginPt: number, imgW: number, imgH: number): { rect: Box; clip: Box } {
  const clip = { x: marginPt, y: marginPt, width: Math.max(1, page[0] - 2 * marginPt), height: Math.max(1, page[1] - 2 * marginPt) };
  const fitScale = Math.min(clip.width / imgW, clip.height / imgH);
  const scale = fit === "fill" ? Math.max(clip.width / imgW, clip.height / imgH) : fit === "actual" ? Math.min(PX_TO_PT, fitScale) : fitScale;
  const width = imgW * scale;
  const height = imgH * scale;
  return { rect: { x: clip.x + (clip.width - width) / 2, y: clip.y + (clip.height - height) / 2, width, height }, clip };
}

// ---- EXIF orientation ---------------------------------------------------------

/** Reads the EXIF orientation (1–8) of a JPEG; 1 when absent. */
export function jpegOrientation(bytes: Uint8Array): number {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return 1;
    const marker = bytes[offset + 1];
    if (marker === 0xda || marker === 0xd9) return 1; // image data starts: no EXIF before it
    const length = view.getUint16(offset + 2);
    if (marker === 0xe1 && offset + 10 <= bytes.length && String.fromCharCode(...bytes.subarray(offset + 4, offset + 8)) === "Exif") {
      const tiff = offset + 10;
      if (tiff + 8 > bytes.length) return 1;
      const little = view.getUint16(tiff) === 0x4949;
      const ifd = tiff + view.getUint32(tiff + 4, little);
      if (ifd + 2 > bytes.length) return 1;
      const entries = view.getUint16(ifd, little);
      for (let i = 0; i < entries; i++) {
        const entry = ifd + 2 + i * 12;
        if (entry + 10 > bytes.length) return 1;
        if (view.getUint16(entry, little) === 0x0112) {
          const value = view.getUint16(entry + 8, little);
          return value >= 1 && value <= 8 ? value : 1;
        }
      }
      return 1;
    }
    offset += 2 + length;
  }
  return 1;
}

/** Orientations 5–8 turn the image a quarter, so its displayed width/height swap. */
export const swapsAxes = (orientation: number) => orientation >= 5 && orientation <= 8;

/**
 * Matrix that draws the stored image (PDF unit square) into `rect` so it looks as
 * the camera intended. Each row: s = su·u + sv·v + s0, t = tu·u + tv·v + t0.
 */
const ORIENT: Record<number, [number, number, number, number, number, number]> = {
  1: [1, 0, 0, 0, 1, 0],
  2: [-1, 0, 1, 0, 1, 0],
  3: [-1, 0, 1, 0, -1, 1],
  4: [1, 0, 0, 0, -1, 1],
  5: [0, -1, 1, -1, 0, 1],
  6: [0, 1, 0, -1, 0, 1],
  7: [0, 1, 0, 1, 0, 0],
  8: [0, -1, 1, 1, 0, 0],
};

export function orientationMatrix(orientation: number, rect: Box): Matrix {
  const [su, sv, s0, tu, tv, t0] = ORIENT[orientation] ?? ORIENT[1];
  return [rect.width * su, rect.height * tu, rect.width * sv, rect.height * tv, rect.x + rect.width * s0, rect.y + rect.height * t0];
}

async function drawOriented(page: PDFPage, image: PDFImage, orientation: number, rect: Box, clip: Box) {
  const lib = await loadPdfLib();
  const name = page.node.newXObject("Image", image.ref);
  page.pushOperators(
    lib.pushGraphicsState(),
    lib.rectangle(clip.x, clip.y, clip.width, clip.height),
    lib.clip(),
    lib.endPath(),
    lib.concatTransformationMatrix(...orientationMatrix(orientation, rect)),
    lib.drawObject(name),
    lib.popGraphicsState(),
  );
}

// ---- Processor --------------------------------------------------------------------

export type ImageBytes = { bytes: Uint8Array; type: "jpeg" | "png" };
/** Turns an input into embeddable bytes (the browser converts WebP to PNG). */
export type ImageLoader = (input: ProcessInput) => Promise<ImageBytes>;

export const defaultImageLoader: ImageLoader = async (input) => {
  if (input.kind !== "jpeg" && input.kind !== "png") {
    throw new UserFacingError(`${input.name}: unsupported image type`);
  }
  return { bytes: new Uint8Array(await input.file.arrayBuffer()), type: input.kind };
};

export async function imagesToPdf(
  inputs: ProcessInput[],
  settings: ImageToPdfSettings,
  ctx: ProcessContext,
  load: ImageLoader = defaultImageLoader,
): Promise<ProcessOutput[]> {
  const marginPt = mmToPt(Math.max(0, settings.margin));
  if (settings.pageSize === "custom" && (!(settings.customWidth >= 20) || !(settings.customHeight >= 20) || settings.customWidth > 5000 || settings.customHeight > 5000)) {
    throw userError({ ar: "اكتب مقاس صفحة بين 20 و5000 ملم.", en: "Enter a page size between 20 and 5000 mm." });
  }
  const outputs: ProcessOutput[] = [];
  let doc = await createPdfDocument();
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    throwIfCancelled(ctx.signal);
    ctx.onProgress({ done: i, total: inputs.length, label: input.name });
    let image: PDFImage;
    let orientation = 1;
    try {
      const { bytes, type } = await load(input);
      if (type === "jpeg") {
        orientation = jpegOrientation(bytes);
        image = await doc.embedJpg(bytes);
      } else image = await doc.embedPng(bytes);
    } catch (error) {
      if (error instanceof UserFacingError) throw error;
      throw userError({ ar: `تعذّرت قراءة الصورة «${input.name}»؛ قد تكون تالفة.`, en: `Couldn't read the image “${input.name}”; it may be damaged.` });
    }
    const [w, h] = swapsAxes(orientation) ? [image.height, image.width] : [image.width, image.height];
    const size = pageSizeFor(settings, w, h);
    if (size[0] - 2 * marginPt < 10 || size[1] - 2 * marginPt < 10) {
      throw userError({ ar: "الهوامش أكبر من الصفحة.", en: "The margins are larger than the page." });
    }
    const page = doc.addPage(size);
    const { rect, clip } = placeImage(settings.fit, size, marginPt, w, h);
    await drawOriented(page, image, orientation, rect, clip);

    if (settings.output === "separate") {
      outputs.push({
        name: buildOutputName(input.name, { ext: "pdf" }),
        blob: await savePdf(doc),
        sourceIds: [input.id],
        meta: [{ label: { ar: "الصفحات", en: "Pages" }, value: 1 }],
      });
      if (i < inputs.length - 1) doc = await createPdfDocument();
    }
  }
  if (settings.output === "single") {
    outputs.push({
      name: buildOutputName(inputs[0].name, { suffix: inputs.length > 1 ? "images" : undefined, ext: "pdf" }),
      blob: await savePdf(doc),
      sourceIds: inputs.map((f) => f.id),
      meta: [{ label: { ar: "الصفحات", en: "Pages" }, value: doc.getPageCount() }],
    });
  }
  ctx.onProgress({ done: inputs.length, total: inputs.length });
  return outputs;
}
