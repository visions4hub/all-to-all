"use client";

import { useT } from "@/lib/i18n";
import type { PreviewProps, SettingsProps, ToolModule } from "@/tools/types";
import { Note } from "./lib/controls";
import { PagePicker, RangesField, selectedFromRanges } from "./lib/page-picker";
import { removePdfPages, type RemoveSettings } from "./lib/structure";
import { usePageCount } from "./lib/use-pdf";

function Settings({ settings, onChange, activeFile, disabled }: SettingsProps<RemoveSettings>) {
  const t = useT();
  const total = usePageCount(activeFile);
  const count = total ? selectedFromRanges(settings.ranges, total).length : 0;
  return (
    <div className="space-y-4">
      <RangesField
        label={{ ar: "الصفحات المراد حذفها", en: "Pages to remove" }}
        value={settings.ranges}
        total={total}
        disabled={disabled}
        onChange={(ranges) => onChange({ ranges })}
      />
      {total ? (
        <p className="text-sm text-muted-foreground" role="status">
          {t({ ar: `ستبقى ${total - count} صفحة من ${total}`, en: `${total - count} of ${total} pages will remain` })}
        </p>
      ) : null}
      <Note>
        {t({
          ar: "ملفك الأصلي لا يتغير؛ تحصل على نسخة جديدة بدون الصفحات المحددة.",
          en: "Your original file is not changed; you get a new copy without the selected pages.",
        })}
      </Note>
    </div>
  );
}

function Preview({ settings, onChange, file }: PreviewProps<RemoveSettings>) {
  return (
    <PagePicker
      file={file.file}
      ranges={settings.ranges}
      onRanges={(ranges) => onChange({ ranges })}
      mark="removed"
      summary={(n, total) => ({ ar: `${n} صفحة للحذف · ستبقى ${total - n}`, en: `${n} to remove · ${total - n} will remain` })}
    />
  );
}

const mod: ToolModule<RemoveSettings> = {
  mode: "per-file",
  defaultSettings: { ranges: "" },
  Settings,
  Preview,
  process: removePdfPages,
  validate: (files, s) => {
    if (!s.ranges.trim()) return { ar: "اختر الصفحات المراد حذفها", en: "Select the pages to remove" };
    const total = files[0]?.pageCount;
    if (total) {
      const n = selectedFromRanges(s.ranges, total).length;
      if (!n) return { ar: "تحقق من أرقام الصفحات", en: "Check the page numbers" };
      if (n >= total) return { ar: "اترك صفحة واحدة على الأقل", en: "Keep at least one page" };
    }
    return null;
  },
  actionLabel: { ar: "حذف الصفحات", en: "Remove pages" },
};

export default mod;
