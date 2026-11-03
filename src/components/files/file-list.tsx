"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, GripVertical, Trash2, X } from "lucide-react";
import { FileThumb } from "@/components/files/file-thumb";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { WorkspaceFile } from "@/lib/engine/types";
import { KIND_INFO } from "@/lib/files/detect";
import { splitExtension } from "@/lib/files/filename";
import { formatBytes, formatNumber } from "@/lib/files/format";
import { useT, type Localized } from "@/lib/i18n";
import { useWorkspace } from "@/stores/workspace";
import { cn } from "@/lib/utils";

export const PREVIEW_ERRORS: Record<string, Localized> = {
  password: { ar: "الملف محمي بكلمة مرور", en: "Password-protected" },
  invalid: { ar: "ملف PDF تالف أو غير صالح", en: "Damaged or invalid PDF" },
  decode: { ar: "تعذّر عرض الصورة في هذا المتصفح", en: "This browser can't display it" },
  unknown: { ar: "تعذّرت المعاينة", en: "Preview failed" },
};

/** One-line facts about a file: type · size · pages or pixels. */
export function FileFacts({ file, className }: { file: WorkspaceFile; className?: string }) {
  const t = useT();
  const typeLabel = file.kind === "unknown" ? splitExtension(file.name).ext.toUpperCase() || "?" : KIND_INFO[file.kind].label;
  const parts: string[] = [typeLabel, formatBytes(file.size)];
  if (file.pageCount) parts.push(t({ ar: `${formatNumber(file.pageCount)} صفحة`, en: `${formatNumber(file.pageCount)} pages` }));
  if (file.width && file.height) parts.push(`${file.width}×${file.height}`);
  return (
    <p className={cn("truncate text-xs text-muted-foreground", className)}>
      <span dir="ltr" className="ltr-isolate">{parts.join(" · ")}</span>
      {file.previewError && <span className="ms-1.5 text-destructive">— {t(PREVIEW_ERRORS[file.previewError] ?? PREVIEW_ERRORS.unknown)}</span>}
    </p>
  );
}

/**
 * Reorderable file list. Desktop: drag the rows. Touch and keyboard: the
 * up/down buttons, so ordering never depends on a mouse.
 */
export function FileList({
  files,
  selectedId,
  onSelect,
  reorderable = true,
  invalidIds,
  className,
}: {
  files: WorkspaceFile[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  reorderable?: boolean;
  /** Files the current tool can't accept; shown with a warning. */
  invalidIds?: Set<string>;
  className?: string;
}) {
  const t = useT();
  const move = useWorkspace((s) => s.move);
  const remove = useWorkspace((s) => s.remove);
  const allFiles = useWorkspace((s) => s.files);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const indexInStore = (id: string) => allFiles.findIndex((f) => f.id === id);

  return (
    <ul className={cn("space-y-2", className)}>
      {files.map((file, i) => {
        const invalid = invalidIds?.has(file.id);
        return (
          <li
            key={file.id}
            draggable={reorderable}
            onDragStart={(e) => {
              setDragId(file.id);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", file.id);
            }}
            onDragOver={(e) => {
              if (!dragId) return;
              e.preventDefault();
              setOverId(file.id);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (dragId && dragId !== file.id) move(indexInStore(dragId), indexInStore(file.id));
              setDragId(null);
              setOverId(null);
            }}
            onDragEnd={() => {
              setDragId(null);
              setOverId(null);
            }}
            className={cn(
              "group flex items-center gap-3 rounded-xl border bg-card p-2 pe-1.5 transition-all",
              selectedId === file.id && "border-primary/50 ring-2 ring-primary/15",
              dragId === file.id && "opacity-40",
              overId === file.id && dragId !== file.id && "border-primary border-dashed",
              invalid && "border-destructive/40 bg-destructive/5",
            )}
          >
            {reorderable && (
              <GripVertical className="hidden size-4 shrink-0 cursor-grab text-muted-foreground/60 sm:block" aria-hidden />
            )}
            <button
              type="button"
              onClick={() => onSelect?.(file.id)}
              className="flex min-w-0 flex-1 items-center gap-3 text-start"
              aria-pressed={selectedId === file.id}
            >
              <FileThumb file={file} className="size-12 shrink-0 rounded-lg border" />
              <span className="min-w-0 flex-1">
                <span dir="auto" className="block truncate text-sm font-medium">
                  {file.name}
                </span>
                <FileFacts file={file} />
                {invalid && (
                  <span className="mt-0.5 block text-xs text-destructive">
                    {t({ ar: "هذه الأداة لا تقبل هذا النوع", en: "This tool doesn't accept this type" })}
                  </span>
                )}
              </span>
            </button>
            {reorderable && files.length > 1 && (
              <div className="flex flex-col">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  disabled={i === 0}
                  onClick={() => move(indexInStore(file.id), indexInStore(files[i - 1].id))}
                  aria-label={t({ ar: "تحريك للأعلى", en: "Move up" })}
                >
                  <ArrowUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  disabled={i === files.length - 1}
                  onClick={() => move(indexInStore(file.id), indexInStore(files[i + 1].id))}
                  aria-label={t({ ar: "تحريك للأسفل", en: "Move down" })}
                >
                  <ArrowDown />
                </Button>
              </div>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => remove(file.id)}
              aria-label={t({ ar: `إزالة ${file.name}`, en: `Remove ${file.name}` })}
              className="text-muted-foreground hover:text-destructive"
            >
              <X />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

/** Sort + clear controls shown above a file list. */
export function FileListToolbar({ count, totalSize }: { count: number; totalSize: number }) {
  const t = useT();
  const sortBy = useWorkspace((s) => s.sortBy);
  const clear = useWorkspace((s) => s.clear);
  return (
    <div className="flex items-center gap-2">
      <p className="me-auto text-sm text-muted-foreground">
        {t({ ar: `${formatNumber(count)} ملف`, en: `${formatNumber(count)} file${count === 1 ? "" : "s"}` })}
        <span className="mx-1.5">·</span>
        <span dir="ltr">{formatBytes(totalSize)}</span>
      </p>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="rounded-lg">
            <ArrowUpDown />
            {t({ ar: "ترتيب", en: "Sort" })}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => sortBy("name")}>{t({ ar: "حسب الاسم", en: "By name" })}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => sortBy("size")}>{t({ ar: "حسب الحجم", en: "By size" })}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => sortBy("type")}>{t({ ar: "حسب النوع", en: "By type" })}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="ghost" size="sm" className="rounded-lg text-muted-foreground hover:text-destructive" onClick={clear}>
        <Trash2 />
        {t({ ar: "مسح الكل", en: "Clear all" })}
      </Button>
    </div>
  );
}
