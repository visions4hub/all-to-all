"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Camera, FolderOpen, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Props = {
  onFiles: (files: File[]) => void;
  /** Value for the file input's accept attribute. Empty = anything. */
  accept?: string;
  multiple?: boolean;
  /** Listen for Ctrl/⌘+V image paste anywhere on the page. */
  enablePaste?: boolean;
  /** Offer a camera button (phones). */
  enableCamera?: boolean;
  size?: "hero" | "default" | "compact";
  className?: string;
};

/**
 * Drag-and-drop area with file picker, paste and camera support.
 * Files are only handed to the page in memory; nothing is uploaded.
 */
export function FileDropzone({
  onFiles,
  accept = "",
  multiple = true,
  enablePaste = true,
  enableCamera = false,
  size = "default",
  className,
}: Props) {
  const t = useT();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  const take = useCallback(
    (list: FileList | File[] | null | undefined) => {
      const files = Array.from(list ?? []).filter((f) => f.size > 0 || f.type);
      if (files.length) onFiles(multiple ? files : files.slice(0, 1));
    },
    [multiple, onFiles],
  );

  useEffect(() => {
    if (!enablePaste) return;
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=true]")) return;
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length) {
        e.preventDefault();
        take(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [enablePaste, take]);

  const hero = size === "hero";
  const compact = size === "compact";

  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault();
        depth.current++;
        setDragging(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        depth.current = 0;
        setDragging(false);
        take(e.dataTransfer.files);
      }}
      className={cn(
        "relative flex flex-col items-center justify-center rounded-3xl border-2 border-dashed text-center",
        dragging ? "border-gold bg-brand-soft" : "border-border bg-card hover:border-gold/50",
        hero && "px-6 py-12 sm:py-16",
        size === "default" && "px-6 py-10",
        compact && "rounded-2xl px-4 py-5",
        className,
      )}
    >
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        className="sr-only"
        accept={accept || undefined}
        multiple={multiple}
        onChange={(e) => {
          take(e.target.files);
          e.target.value = "";
        }}
      />
      {enableCamera && (
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            take(e.target.files);
            e.target.value = "";
          }}
        />
      )}

      {!compact && (
        <span
          className={cn(
            "mb-5 flex items-center justify-center rounded-2xl bg-brand-soft text-primary",
            hero ? "size-16" : "size-12",
          )}
          aria-hidden
        >
          <UploadCloud className={hero ? "size-8" : "size-6"} strokeWidth={1.7} />
        </span>
      )}

      <div className={cn("flex flex-wrap items-center justify-center gap-2", compact && "w-full")}>
        <Button
          type="button"
          size="lg"
          onClick={() => inputRef.current?.click()}
          className={cn("rounded-xl", hero && "h-12 px-6 text-base", compact && "h-10 flex-1")}
        >
          <FolderOpen className="size-5" />
          {compact ? t({ ar: "إضافة ملفات", en: "Add files" }) : t({ ar: "اختر ملفاتك", en: "Choose files" })}
        </Button>
        {enableCamera && (
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => cameraRef.current?.click()}
            className={cn("rounded-xl sm:hidden", hero && "h-12", compact && "h-10")}
          >
            <Camera className="size-5" />
            {t({ ar: "الكاميرا", en: "Camera" })}
          </Button>
        )}
      </div>

      {!compact && (
        <p className="mt-4 text-sm text-muted-foreground">
          {t({
            ar: "أو اسحب الملفات وأفلتها هنا، أو الصقها بـ Ctrl+V",
            en: "or drag & drop files here, or paste with Ctrl+V",
          })}
        </p>
      )}
      {dragging && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[inherit] bg-brand-soft/90 text-lg font-semibold text-primary">
          {t({ ar: "أفلت الملفات هنا", en: "Drop files here" })}
        </div>
      )}
    </div>
  );
}
