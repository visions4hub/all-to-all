"use client";

import { useEffect, useRef } from "react";
import { FileQuestion, FileText, ImageOff, Loader2 } from "lucide-react";
import type { WorkspaceFile } from "@/lib/engine/types";
import { BROWSER_DECODABLE } from "@/lib/files/detect";
import { createLimiter } from "@/lib/limit";
import { readImageDetails } from "@/lib/files/image-info";
import { pdfThumbnail, PdfOpenError } from "@/lib/pdf/pdfjs";
import { useWorkspace } from "@/stores/workspace";
import { cn } from "@/lib/utils";

// Previews are made a few at a time, so adding many large files doesn't decode
// them all at once and exhaust memory: PDFs one at a time (each opens a whole
// document), photos three at a time (each holds one decoded image briefly).
const enqueue = createLimiter(1);
const enqueueImage = createLimiter(3);
const inFlight = new Set<string>();

/** Fills in preview, page count and pixel size for a file, lazily when it scrolls into view. */
function useFileDetails(file: WorkspaceFile, ref: React.RefObject<HTMLElement | null>) {
  const update = useWorkspace((s) => s.update);
  const needsPdf = file.kind === "pdf" && !file.previewUrl && !file.previewError;
  const needsSize = BROWSER_DECODABLE.includes(file.kind) && file.width === undefined && !file.previewError;

  useEffect(() => {
    if ((!needsPdf && !needsSize) || inFlight.has(file.id)) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting) || inFlight.has(file.id)) return;
        observer.disconnect();
        inFlight.add(file.id);
        const job = needsPdf
          ? enqueue(() => pdfThumbnail(file.file)).then(({ url, pageCount }) => {
              // The file may have been removed while we were rendering.
              if (useWorkspace.getState().files.some((f) => f.id === file.id)) update(file.id, { previewUrl: url, pageCount });
              else URL.revokeObjectURL(url);
            })
          : enqueueImage(() => readImageDetails(file.file)).then(({ thumbUrl, ...size }) => {
              if (useWorkspace.getState().files.some((f) => f.id === file.id)) update(file.id, thumbUrl ? { ...size, thumbUrl } : size);
              else if (thumbUrl) URL.revokeObjectURL(thumbUrl);
            });
        job
          .catch((error) => {
            const code = error instanceof PdfOpenError ? error.code : "unknown";
            update(file.id, { previewError: code });
          })
          .finally(() => inFlight.delete(file.id));
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [file.id, file.file, needsPdf, needsSize, ref, update]);
}

/**
 * File preview. Lists and grids show the small preview of a large photo;
 * `full` shows the original (the big preview area), at full detail.
 */
export function FileThumb({
  file,
  className,
  fit = "cover",
  full = false,
}: {
  file: WorkspaceFile;
  className?: string;
  fit?: "cover" | "contain";
  full?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFileDetails(file, ref);

  // In lists, wait for the size check (which makes the small preview of a large
  // photo) instead of decoding the full original for a few pixels.
  const waiting = !full && file.kind !== "pdf" && BROWSER_DECODABLE.includes(file.kind) && file.width === undefined && !file.previewError;
  const canShowImage = !waiting && !!file.previewUrl && !(file.kind !== "pdf" && file.previewError);
  return (
    <div
      ref={ref}
      className={cn(
        "relative flex items-center justify-center overflow-hidden bg-muted",
        file.kind === "pdf" && "bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,color-mix(in_oklab,var(--border)_45%,transparent)_6px,color-mix(in_oklab,var(--border)_45%,transparent)_7px)]",
        className,
      )}
    >
      {canShowImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- local object URL, not an optimizable remote image
        <img
          src={(!full && file.thumbUrl) || file.previewUrl}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className={cn("size-full", fit === "cover" ? "object-cover" : "object-contain", file.kind === "pdf" && "bg-white shadow-sm")}
          onError={() => useWorkspace.getState().update(file.id, { previewError: "decode" })}
        />
      ) : file.previewError ? (
        file.kind === "pdf" ? (
          <FileText className="size-7 text-pdf" aria-hidden />
        ) : (
          <ImageOff className="size-7 text-muted-foreground" aria-hidden />
        )
      ) : file.kind === "pdf" || waiting ? (
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
      ) : (
        <FileQuestion className="size-7 text-muted-foreground" aria-hidden />
      )}
    </div>
  );
}
