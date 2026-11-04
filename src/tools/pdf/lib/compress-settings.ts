// Compress PDF settings and the report the engine returns. No imports, so both the
// page and the Web Worker can use it without pulling in each other's code.

export type CompressSettings = {
  /** Lossy: re-encode large images as JPEG. Off unless the user turns it on. */
  images: boolean;
  /** Images keep at least this resolution for the largest page they appear on. */
  maxDpi: number;
  /** JPEG quality, 30–95. */
  quality: number;
};

export const DEFAULT_COMPRESS: CompressSettings = { images: false, maxDpi: 150, quality: 75 };
export const DPI_OPTIONS = [72, 100, 150, 200, 300] as const;

export type ImageStats = { found: number; recompressed: number; bytesBefore: number; bytesAfter: number };

export type CompressReport = {
  encryption: "none" | "no-password";
  /** Null when the image option was off or couldn't run. */
  images: ImageStats | null;
  /** Why the image option didn't run although it was on. */
  imagesSkipped: "encrypted" | "unsupported" | null;
  /** The file's structure was damaged and had to be rebuilt. */
  repaired: boolean;
};

export type CompressStage = "reading" | "images" | "optimizing";

/** Messages between the page and the compression worker. */
export type CompressRequest = { bytes: ArrayBuffer; settings: CompressSettings };
export type CompressResponse =
  | { type: "progress"; stage: CompressStage; done: number; total: number }
  | { type: "done"; bytes: ArrayBuffer; report: CompressReport }
  | { type: "error"; code: "password" | "damaged" | "engine"; detail?: string };
