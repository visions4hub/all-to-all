"use client";

import { useT } from "@/lib/i18n";
import type { PreviewProps, SettingsProps, ToolModule } from "@/tools/types";
import { Note } from "./lib/controls";
import { OverlayEditor } from "./lib/overlay-editor";
import { EMPTY_OVERLAYS, exportOverlays, type OverlaySettings } from "./lib/overlays";
import { rasterizeText } from "./lib/raster-text";

function Settings({ settings }: SettingsProps<OverlaySettings>) {
  const t = useT();
  const pages = new Set(settings.overlays.map((o) => o.page)).size;
  return (
    <div className="space-y-4">
      <p className="text-sm" role="status">
        {t({ ar: `${settings.overlays.length} عنصر مضاف في ${pages} صفحة`, en: `${settings.overlays.length} object(s) added on ${pages} page(s)` })}
      </p>
      <Note tone="warning">
        {t({
          ar: "هذه الأداة تضيف عناصر فوق الصفحة (نصوص، صور، أشكال، تظليل). لا تعدّل النص الأصلي الموجود في الملف ولا تحذفه.",
          en: "This tool adds objects on top of the page (text, images, shapes, highlights). It doesn't change or delete the original text in the file.",
        })}
      </Note>
      <Note>
        {t({
          ar: "النص اللاتيني يُحفظ نصاً حقيقياً قابلاً للتحديد. النص العربي يُحفظ كصورة لأن مكتبة PDF لا تدعم تشكيل العربية.",
          en: "Latin text is saved as real, selectable text. Arabic text is saved as an image because the PDF library can't shape Arabic.",
        })}
      </Note>
    </div>
  );
}

function Preview({ settings, onChange, file }: PreviewProps<OverlaySettings>) {
  return (
    <OverlayEditor
      file={file.file}
      settings={settings}
      onChange={onChange}
      tools={["select", "text", "image", "rect", "ellipse", "line", "arrow", "path", "highlight", "underline"]}
    />
  );
}

const mod: ToolModule<OverlaySettings> = {
  mode: "per-file",
  defaultSettings: EMPTY_OVERLAYS,
  Settings,
  Preview,
  process: (inputs, settings, ctx) => exportOverlays(inputs, settings, ctx, rasterizeText, "edited"),
  validate: (_files, s) => (s.overlays.length ? null : { ar: "أضف عنصراً واحداً على الأقل", en: "Add at least one object" }),
  actionLabel: { ar: "حفظ PDF", en: "Save PDF" },
};

export default mod;
