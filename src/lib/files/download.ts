import { dedupeNames } from "./filename";

/** Triggers a browser download for a Blob, then frees the object URL. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser time to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Packs files into a ZIP in the browser. Names are made unique. */
export async function zipFiles(
  files: { name: string; blob: Blob }[],
  onProgress?: (percent: number) => void,
): Promise<Blob> {
  // JSZip (and its zlib) loads only when someone asks for a ZIP, not with every tool page.
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const names = dedupeNames(files.map((f) => f.name));
  files.forEach((f, i) => zip.file(names[i], f.blob, { binary: true }));
  // Already-compressed formats (JPG, PNG, PDF…) barely shrink, so store them to save time.
  return zip.generateAsync({ type: "blob", compression: "STORE" }, (meta) => onProgress?.(meta.percent));
}

/** Uses the native share sheet on phones when it can share files. */
export async function shareFiles(files: { name: string; blob: Blob }[]): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.canShare) return false;
  const list = files.map((f) => new File([f.blob], f.name, { type: f.blob.type }));
  if (!navigator.canShare({ files: list })) return false;
  try {
    await navigator.share({ files: list });
    return true;
  } catch {
    return false;
  }
}
