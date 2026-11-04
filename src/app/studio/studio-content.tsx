"use client";

import { useState } from "react";
import { FileArchive, Loader2 } from "lucide-react";
import { FileDropzone } from "@/components/files/file-dropzone";
import { FileList, FileListToolbar, PREVIEW_ERRORS } from "@/components/files/file-list";
import { FileThumb } from "@/components/files/file-thumb";
import { RecommendedTools } from "@/components/files/recommended-tools";
import { Container, PageHero } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { downloadBlob, zipFiles } from "@/lib/files/download";
import { KIND_INFO } from "@/lib/files/detect";
import { formatBytes, formatNumber } from "@/lib/files/format";
import { useT, type Localized } from "@/lib/i18n";
import { useWorkspace } from "@/stores/workspace";

export function StudioContent() {
  const t = useT();
  const files = useWorkspace((s) => s.files);
  const addFiles = useWorkspace((s) => s.addFiles);
  const [selectedId, setSelectedId] = useState<string>();
  const [zipping, setZipping] = useState(false);
  const active = files.find((f) => f.id === selectedId) ?? files[0];

  const zipAll = async () => {
    setZipping(true);
    try {
      downloadBlob(await zipFiles(files.map((f) => ({ name: f.name, blob: f.file }))), "all-to-all-files.zip");
    } finally {
      setZipping(false);
    }
  };

  const rows: [Localized, string][] = active
    ? [
        [{ ar: "النوع الحقيقي", en: "Detected type" }, KIND_INFO[active.kind].label],
        [{ ar: "الحجم", en: "Size" }, `${formatBytes(active.size)} (${formatNumber(active.size)} B)`],
        ...(active.pageCount ? [[{ ar: "عدد الصفحات", en: "Pages" }, formatNumber(active.pageCount)] as [Localized, string]] : []),
        ...(active.width ? [[{ ar: "الأبعاد", en: "Dimensions" }, `${active.width} × ${active.height} px`] as [Localized, string]] : []),
        ...(active.file.lastModified
          ? [[{ ar: "آخر تعديل", en: "Last modified" }, new Date(active.file.lastModified).toLocaleString("en-GB")] as [Localized, string]]
          : []),
      ]
    : [];

  return (
    <>
      <PageHero
        title={{ ar: "الاستوديو", en: "Studio" }}
        description={{
          ar: "مساحة واحدة لكل ملفاتك: أضفها، رتّبها، اعرف نوعها الحقيقي وتفاصيلها، ثم افتح الأداة المناسبة. كل شيء يبقى على جهازك.",
          en: "One place for all your files: add them, arrange them, see their real type and details, then open the right tool. Everything stays on your device.",
        }}
      />
      <Container className="py-8">
        {files.length === 0 ? (
          <FileDropzone size="hero" enableCamera onFiles={(f) => void addFiles(f)} />
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
            <aside className="space-y-3 rounded-2xl border bg-card p-3 lg:sticky lg:top-20">
              <FileListToolbar count={files.length} totalSize={files.reduce((n, f) => n + f.size, 0)} />
              <FileList files={files} selectedId={active?.id} onSelect={setSelectedId} className="max-h-[55vh] overflow-y-auto" />
              <FileDropzone size="compact" enableCamera onFiles={(f) => void addFiles(f)} />
              {files.length > 1 && (
                <Button variant="outline" className="h-10 w-full rounded-xl" onClick={zipAll} disabled={zipping}>
                  {zipping ? <Loader2 className="animate-spin" /> : <FileArchive />}
                  {t({ ar: "تنزيل الكل كملف ZIP", en: "Download all as ZIP" })}
                </Button>
              )}
            </aside>
            {active && (
              <section className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
                <div className="rounded-2xl border bg-card p-3">
                  <FileThumb file={active} fit="contain" full className="aspect-[4/3] w-full rounded-xl" />
                  <p dir="auto" className="mt-3 truncate px-1 font-medium">
                    {active.name}
                  </p>
                </div>
                <div className="space-y-4">
                  <div className="rounded-2xl border bg-card p-4">
                    <h2 className="mb-3 font-semibold">{t({ ar: "تفاصيل الملف", en: "File details" })}</h2>
                    <dl className="space-y-2 text-sm">
                      {rows.map(([label, value]) => (
                        <div key={label.en} className="flex justify-between gap-3">
                          <dt className="text-muted-foreground">{t(label)}</dt>
                          <dd dir="ltr" className="text-end font-medium">
                            {value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    {active.previewError && (
                      <p className="mt-3 rounded-lg bg-destructive/8 p-2 text-xs text-destructive">
                        {t(PREVIEW_ERRORS[active.previewError] ?? PREVIEW_ERRORS.unknown)}
                      </p>
                    )}
                  </div>
                  <div className="rounded-2xl border bg-card p-4">
                    <h2 className="mb-3 font-semibold">{t({ ar: "أدوات مناسبة", en: "Suitable tools" })}</h2>
                    <RecommendedTools kind={active.kind} limit={12} />
                  </div>
                </div>
              </section>
            )}
          </div>
        )}
      </Container>
    </>
  );
}
