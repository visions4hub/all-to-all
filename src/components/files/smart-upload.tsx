"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { FileDropzone } from "@/components/files/file-dropzone";
import { FileFacts } from "@/components/files/file-list";
import { FileThumb } from "@/components/files/file-thumb";
import { RecommendedTools } from "@/components/files/recommended-tools";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/files/format";
import { useLocale, useT } from "@/lib/i18n";
import { useWorkspace } from "@/stores/workspace";

/**
 * Homepage upload: detects each file's real type, previews it and suggests tools.
 * Files stay in memory, so opening a suggested tool keeps them loaded.
 */
export function SmartUpload() {
  const t = useT();
  const rtl = useLocale() === "ar";
  const files = useWorkspace((s) => s.files);
  const addFiles = useWorkspace((s) => s.addFiles);
  const remove = useWorkspace((s) => s.remove);
  const clear = useWorkspace((s) => s.clear);

  if (files.length === 0) {
    return <FileDropzone size="hero" enableCamera onFiles={(f) => void addFiles(f)} className="shadow-soft" />;
  }

  const shown = files.slice(0, 4);
  const Arrow = rtl ? ArrowLeft : ArrowRight;

  return (
    <div className="rounded-3xl border bg-card p-4 text-start shadow-lift sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <h2 className="me-auto font-semibold">
          {t({ ar: `${formatNumber(files.length)} ملف جاهز`, en: `${formatNumber(files.length)} file${files.length === 1 ? "" : "s"} ready` })}
        </h2>
        <Button variant="ghost" size="sm" onClick={clear} className="text-muted-foreground">
          {t({ ar: "مسح", en: "Clear" })}
        </Button>
      </div>
      <ul className="space-y-3">
        {shown.map((file) => (
          <li key={file.id} className="flex gap-3 rounded-2xl border bg-background/60 p-3 sm:gap-4">
            <FileThumb file={file} className="size-16 shrink-0 rounded-xl border sm:size-20" />
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p dir="auto" className="truncate font-medium">
                    {file.name}
                  </p>
                  <FileFacts file={file} />
                </div>
                <Button variant="ghost" size="icon-sm" onClick={() => remove(file.id)} aria-label={t({ ar: "إزالة", en: "Remove" })}>
                  <X />
                </Button>
              </div>
              <p className="mt-3 mb-2 text-xs font-medium text-muted-foreground">
                {t({ ar: "ماذا تريد أن تفعل بهذا الملف؟", en: "What do you want to do with it?" })}
              </p>
              <RecommendedTools kind={file.kind} limit={5} />
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <FileDropzone size="compact" onFiles={(f) => void addFiles(f)} enablePaste className="sm:flex-1" />
        <Button asChild variant="outline" className="h-12 rounded-xl">
          <Link href="/studio/">
            {files.length > shown.length
              ? t({ ar: `عرض كل الملفات (${formatNumber(files.length)})`, en: `See all files (${formatNumber(files.length)})` })
              : t({ ar: "فتح في الاستوديو", en: "Open in Studio" })}
            <Arrow />
          </Link>
        </Button>
      </div>
    </div>
  );
}
