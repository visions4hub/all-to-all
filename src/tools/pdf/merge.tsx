"use client";

import type { WorkspaceFile } from "@/lib/engine/types";
import { useT } from "@/lib/i18n";
import type { SettingsProps, ToolModule } from "@/tools/types";
import { Note } from "./lib/controls";
import { mergePdfs, type MergeSettings } from "./lib/structure";
import { usePageCount } from "./lib/use-pdf";

function FileRow({ file, index }: { file: WorkspaceFile; index: number }) {
  const t = useT();
  const pages = usePageCount(file);
  return (
    <li className="flex items-center gap-2 text-sm">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-pdf-soft text-xs font-semibold text-pdf" dir="ltr">
        {index + 1}
      </span>
      <span dir="auto" className="min-w-0 flex-1 truncate">
        {file.name}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {pages ? t({ ar: `${pages} صفحة`, en: `${pages} pages` }) : file.previewError ? "—" : "…"}
      </span>
    </li>
  );
}

function Settings({ files }: SettingsProps<MergeSettings>) {
  const t = useT();
  const total = files.reduce((n, f) => n + (f.pageCount ?? 0), 0);
  const known = files.every((f) => f.pageCount);
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-sm font-medium">{t({ ar: "ترتيب الدمج", en: "Merge order" })}</p>
        <ol className="space-y-2">
          {files.map((f, i) => (
            <FileRow key={f.id} file={f} index={i} />
          ))}
        </ol>
        {known && files.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">{t({ ar: `المجموع: ${total} صفحة`, en: `Total: ${total} pages` })}</p>
        )}
      </div>
      <Note>
        {t({
          ar: "غيّر الترتيب بالسحب أو بأزرار الأسهم في قائمة الملفات. يبقى النص قابلاً للتحديد، وتبقى روابط الويب داخل الصفحات؛ أما الفهرس (الإشارات المرجعية) وحقول النماذج فلا تُنقل.",
          en: "Change the order by dragging, or with the arrow buttons in the file list. Text stays selectable and web links on pages are kept; bookmarks and form fields are not carried over.",
        })}
      </Note>
    </div>
  );
}

const mod: ToolModule<MergeSettings> = {
  mode: "batch",
  defaultSettings: {},
  Settings,
  process: mergePdfs,
  actionLabel: { ar: "دمج الملفات", en: "Merge files" },
};

export default mod;
