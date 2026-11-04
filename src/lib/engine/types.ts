import type { FileKind } from "@/lib/files/detect";
import type { Localized } from "@/lib/tools/types";

/** A file the user added, held only in this browser tab's memory. */
export type WorkspaceFile = {
  id: string;
  file: File;
  /** Display name (the original filename). */
  name: string;
  size: number;
  kind: FileKind;
  /** Object URL for image previews / PDF thumbnail; revoked when the file is removed. */
  previewUrl?: string;
  /** Small preview of a large photo for lists and grids (object URL); revoked with the file. */
  thumbUrl?: string;
  /** Pages, for PDFs, once known. */
  pageCount?: number;
  /** Pixel size, for images, once known. */
  width?: number;
  height?: number;
  /** Set when the preview could not be generated (e.g. damaged or encrypted file). */
  previewError?: string;
};

export type ProcessInput = Pick<WorkspaceFile, "id" | "file" | "name" | "kind" | "pageCount" | "width" | "height">;

/** A real, processed file ready to download. */
export type ProcessOutput = {
  name: string;
  blob: Blob;
  /** Ids of the inputs this output came from. */
  sourceIds: string[];
  /** Facts worth showing next to the result, e.g. [{ label: { ar: "الأبعاد", en: "Size" }, value: "800×600" }]. */
  meta?: { label: Localized; value: string | number }[];
};

export type Progress = { done: number; total: number; label?: string };

export type ProcessContext = {
  signal: AbortSignal;
  onProgress: (progress: Progress) => void;
};

/**
 * "per-file": process() is called once per input; one failing file does not stop the others.
 * "batch":    process() is called once with every input (merge, image→PDF, GIF…).
 */
export type ProcessMode = "per-file" | "batch";

export type Processor<S> = (inputs: ProcessInput[], settings: S, ctx: ProcessContext) => Promise<ProcessOutput[]>;

export type ItemStatus = "pending" | "running" | "done" | "error" | "cancelled";

export type RunResult = {
  /** One entry per input (per-file mode) or a single "batch" entry. */
  items: { key: string; status: ItemStatus; outputs: ProcessOutput[]; error?: string }[];
  outputs: ProcessOutput[];
  cancelled: boolean;
};

/** Thrown by processors for problems the user can act on; the message is shown as-is. */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}

export class CancelledError extends Error {
  constructor() {
    super("Cancelled");
    this.name = "CancelledError";
  }
}

export function throwIfCancelled(signal: AbortSignal) {
  if (signal.aborted) throw new CancelledError();
}
