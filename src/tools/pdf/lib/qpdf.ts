// Thin wrapper around qpdf compiled to WebAssembly (@neslinesli93/qpdf-wasm, qpdf 12).
// The same code runs in the browser worker and in Node tests; only the factory differs.

/** The part of the Emscripten module we use. */
export type QpdfInstance = {
  callMain(args: string[]): number;
  FS: {
    writeFile(path: string, data: Uint8Array): void;
    readFile(path: string): Uint8Array;
    unlink(path: string): void;
  };
};

export type QpdfFactory = () => Promise<QpdfInstance>;

/** Runs one qpdf command and returns its exit code (qpdf may report it by throwing). */
export function runQpdf(q: QpdfInstance, args: string[]): number {
  try {
    // Emscripten's callMain modifies the array it receives.
    const code = q.callMain([...args]);
    return typeof code === "number" ? code : 0;
  } catch (error) {
    const status = (error as { status?: unknown })?.status;
    if (typeof status === "number") return status;
    throw error;
  }
}

export type Encryption = "none" | "no-password" | "password";

/**
 * qpdf's --requires-password exit codes: 0 = a password is needed, 3 = encrypted but
 * opens without one, 2 = not encrypted. In this WebAssembly build qpdf can't recover
 * from internal errors, so it also returns 2 for password-locked and damaged files:
 * only 3 (and 0) are conclusive; the caller checks the rest another way.
 */
export function qpdfEncryption(q: QpdfInstance, path: string): "no-password" | "password" | "unknown" {
  const code = runQpdf(q, ["--requires-password", path]);
  if (code === 0) return "password";
  if (code === 3) return "no-password";
  return "unknown";
}

/**
 * Lossless structural optimisation. qpdf rewrites the whole file, keeping only objects
 * reachable from the document (old revisions and orphaned objects are dropped), packs
 * objects into compressed object streams, compresses uncompressed streams, converts
 * LZW/ASCII filters to Flate and recompresses every Flate stream at the highest level.
 * Page content streams, fonts and images are not altered; encryption is kept as it is.
 */
export const QPDF_OPTIMIZE_ARGS = [
  "--object-streams=generate",
  "--compress-streams=y",
  "--decode-level=generalized",
  "--recompress-flate",
  "--compression-level=9",
];

/** Exit code 0 = success, 3 = success with warnings; 2 = error (including damaged files, see above). */
export function optimizeWithQpdf(q: QpdfInstance, input: string, output: string): { ok: boolean; warnings: boolean } {
  const code = runQpdf(q, [input, ...QPDF_OPTIMIZE_ARGS, output]);
  return { ok: code === 0 || code === 3, warnings: code === 3 };
}
