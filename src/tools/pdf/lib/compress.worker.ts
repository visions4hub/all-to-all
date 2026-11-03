/// <reference lib="webworker" />
// Compress PDF runs here, off the main thread. Bundled by scripts/build-pdf-worker.mjs
// into public/vendor/pdf-compress-worker.js; qpdf's WebAssembly is served from
// public/vendor/qpdf/ (our own origin, no CDN). One worker per file: cancelling
// terminates it.

import createQpdf from "@neslinesli93/qpdf-wasm";
import { canvasCodec } from "./canvas-codec";
import { compressPdfBytes, CompressError } from "./compress-core";
import type { CompressRequest, CompressResponse } from "./compress-settings";
import type { QpdfFactory, QpdfInstance } from "./qpdf";

const scope = self as unknown as DedicatedWorkerGlobalScope;
const post = (message: CompressResponse, transfer: Transferable[] = []) => scope.postMessage(message, transfer);

const qpdf: QpdfFactory = async () => (await createQpdf({ locateFile: () => "/vendor/qpdf/qpdf.wasm" })) as unknown as QpdfInstance;

const canEncode = typeof OffscreenCanvas !== "undefined" && typeof createImageBitmap === "function";

scope.onmessage = async (event: MessageEvent<CompressRequest>) => {
  const { bytes, settings } = event.data;
  try {
    const result = await compressPdfBytes(new Uint8Array(bytes), settings, { qpdf, codec: canEncode ? canvasCodec : undefined }, (stage, done, total) =>
      post({ type: "progress", stage, done, total }),
    );
    const out = result.bytes.buffer.slice(result.bytes.byteOffset, result.bytes.byteOffset + result.bytes.byteLength) as ArrayBuffer;
    post({ type: "done", bytes: out, report: result.report }, [out]);
  } catch (error) {
    if (error instanceof CompressError) post({ type: "error", code: error.code });
    else post({ type: "error", code: "engine", detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error) });
  }
};
