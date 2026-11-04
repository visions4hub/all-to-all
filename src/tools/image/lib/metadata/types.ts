import type { ExifData } from "./tiff";
import type { IccInfo } from "./icc";

export type MetaFormat = "jpeg" | "png" | "webp";

/** A kind of metadata block found in a file. */
export type BlockKind =
  | "exif" // camera, date, GPS…
  | "xmp" // Adobe XMP packet
  | "iptc" // IPTC / Photoshop resources
  | "icc" // colour profile (kept by default)
  | "comment" // JPEG COM
  | "text" // PNG tEXt / zTXt / iTXt
  | "time" // PNG tIME
  | "thumbnail" // JFIF extension thumbnail
  | "multi-picture" // JPEG MPF index
  | "app" // other application segment / chunk
  | "trailing"; // bytes after the end of the image

export type Block = { kind: BlockKind; bytes: number; /** Signature, keyword or chunk name. */ detail?: string };

/** A byte range of the file; `block` is set when it is metadata. */
export type Part = { start: number; end: number; block?: Block; payload?: Uint8Array };

export type ColourInfo = {
  bitDepth?: number;
  /** e.g. "YCbCr", "Grayscale", "CMYK", "RGBA", "Palette". */
  colourType?: string;
  components?: number;
  /** JPEG chroma subsampling, e.g. "4:2:0". */
  subsampling?: string;
  progressive?: boolean;
  interlaced?: boolean;
  alpha?: boolean;
  /** WebP: lossy or lossless. */
  compression?: "lossy" | "lossless";
  animated?: boolean;
  frames?: number;
  srgb?: boolean;
  gamma?: number;
  /** Pixels per inch, when stored. */
  dpi?: number;
  icc?: IccInfo;
};

export type MetadataReport = {
  format: MetaFormat;
  width: number;
  height: number;
  orientation: number | null;
  colour: ColourInfo;
  exif: ExifData | null;
  xmp: Record<string, string>;
  iptc: Record<string, string[]>;
  comments: string[];
  /** PNG text chunks. */
  texts: { keyword: string; value: string }[];
  /** Every metadata block found, in file order. */
  blocks: Block[];
};

export type StripOptions = {
  /** Keep the ICC colour profile (recommended: colours stay the same). */
  keepIcc: boolean;
  /** Keep the orientation as a tiny EXIF block holding only that tag. */
  keepOrientation: boolean;
};

export type StripResult = {
  bytes: Uint8Array;
  removed: Block[];
  kept: Block[];
  /** Orientation value written back (only the tag, nothing else). */
  orientationKept: number | null;
};

export const isRemovable = (block: Block, opts: StripOptions) => !(block.kind === "icc" && opts.keepIcc);
