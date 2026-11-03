import type { FileKind } from "@/lib/files/detect";

export type OutputFormat = "jpeg" | "png" | "webp";
export type FormatChoice = OutputFormat | "keep";

export const OUTPUT_FORMATS: OutputFormat[] = ["jpeg", "png", "webp"];

export const FORMAT_INFO: Record<OutputFormat, { mime: string; ext: string; label: string; lossy: boolean; alpha: boolean }> = {
  jpeg: { mime: "image/jpeg", ext: "jpg", label: "JPG", lossy: true, alpha: false },
  png: { mime: "image/png", ext: "png", label: "PNG", lossy: false, alpha: true },
  webp: { mime: "image/webp", ext: "webp", label: "WebP", lossy: true, alpha: true },
};

/** The output format matching an input kind; formats we can't write become PNG. */
export function formatForKind(kind: FileKind): OutputFormat {
  return kind === "jpeg" ? "jpeg" : kind === "webp" ? "webp" : "png";
}

export function resolveFormat(choice: FormatChoice, kind: FileKind): OutputFormat {
  return choice === "keep" ? formatForKind(kind) : choice;
}

/** Magic-byte check of an encoded image, used to confirm the browser really wrote the format asked for. */
export function sniffFormat(bytes: Uint8Array): OutputFormat | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
    return "webp";
  return null;
}
