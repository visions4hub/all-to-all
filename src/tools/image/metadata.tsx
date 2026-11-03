"use client";

import { useEffect, useState } from "react";
import { Loader2, MapPin, ShieldCheck } from "lucide-react";
import { FileThumb } from "@/components/files/file-thumb";
import { throwIfCancelled, type ProcessOutput } from "@/lib/engine/types";
import { formatBytes } from "@/lib/files/format";
import { useT, type Localized } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { PreviewProps, SettingsProps, ToolModule } from "@/tools/types";
import { localize, userError } from "./lib/errors";
import { formatForKind, FORMAT_INFO } from "./lib/format";
import { exportCanvas, loadToCanvas, META, outputName } from "./lib/pipeline";
import { releaseCanvas } from "./lib/canvas";
import { Field, Note, Segmented, SwitchField } from "./lib/ui";
import { readMetadata, stripMetadata, DamagedFileError, type MetadataReport } from "./lib/metadata";
import { blockLabel, describeMetadata, type Group } from "./lib/metadata/describe";
import { cleanLossless, summarizeBlocks } from "./lib/metadata/clean";

export type MetadataSettings = {
  /** Keep the ICC colour profile so colours look the same. */
  keepIcc: boolean;
  /** "tag": keep only the orientation tag (lossless). "pixels": turn the pixels upright (re-encodes). */
  orientation: "tag" | "pixels";
};

const defaultSettings: MetadataSettings = { keepIcc: true, orientation: "tag" };

const DAMAGED: Localized = {
  ar: "بنية الملف تالفة، فلا يمكن حذف بياناته بأمان دون إفساد الصورة.",
  en: "The file's structure is damaged, so its metadata can't be removed safely without breaking the image.",
};

function Settings({ settings: s, onChange, disabled }: SettingsProps<MetadataSettings>) {
  const t = useT();
  const set = (patch: Partial<MetadataSettings>) => onChange({ ...s, ...patch });
  return (
    <div className="space-y-4">
      <Note>
        {t({
          ar: "يُحذف كل شيء: الكاميرا والتاريخ والموقع (GPS) وXMP وIPTC والتعليقات والنصوص والصور المصغّرة المضمّنة. الحذف يتم على بايتات الملف مباشرة، فلا تُعاد ضغط الصورة ولا تتغير جودتها.",
          en: "Everything goes: camera, dates, location (GPS), XMP, IPTC, comments, text and embedded thumbnails. It works on the file's bytes directly, so the image is not re-compressed and quality doesn't change.",
        })}
      </Note>
      <SwitchField
        label={t({ ar: "أبقِ ملف الألوان (ICC)", en: "Keep colour profile (ICC)" })}
        checked={s.keepIcc}
        disabled={disabled}
        onChange={(keepIcc) => set({ keepIcc })}
        hint={t({
          ar: "لا يحتوي معلومات شخصية عادةً، وحذفه قد يغيّر الألوان في الصور ذات الألوان الواسعة.",
          en: "It rarely holds personal data, and removing it can shift colours in wide-gamut photos.",
        })}
      />
      <Field label={t({ ar: "اتجاه صور الكاميرا", en: "Camera orientation" })}>
        <Segmented
          label={t({ ar: "اتجاه صور الكاميرا", en: "Camera orientation" })}
          value={s.orientation}
          disabled={disabled}
          onChange={(orientation) => set({ orientation })}
          options={[
            { value: "tag", label: t({ ar: "أبقِ وسم الاتجاه", en: "Keep the tag" }) },
            { value: "pixels", label: t({ ar: "عدّل البكسلات", en: "Rotate pixels" }) },
          ]}
        />
      </Field>
      <p className="text-xs leading-5 text-muted-foreground">
        {s.orientation === "tag"
          ? t({
              ar: "بلا فقد: يبقى وسم الاتجاه وحده (بلا أي معلومة أخرى) حتى تظهر الصورة معتدلة.",
              en: "Lossless: only the orientation tag is kept (nothing else), so the photo still shows upright.",
            })
          : t({
              ar: "للصور التي تحمل وسم اتجاه فقط: تُدار البكسلات وتُحفظ الصورة من جديد (JPG/WebP بجودة 92%، وPNG بلا فقد) دون أي بيانات وصفية.",
              en: "Only for photos with an orientation tag: the pixels are turned and the image is saved again (JPG/WebP at 92%, PNG lossless), with no metadata.",
            })}
      </p>
    </div>
  );
}

type ReadState = { id: string; report?: MetadataReport; error?: boolean };

function Value({ value }: { value: string | Localized }) {
  const t = useT();
  return typeof value === "string" ? (
    <bdi dir="auto" className="break-words">
      {value}
    </bdi>
  ) : (
    <>{t(value)}</>
  );
}

function GroupTable({ group }: { group: Group }) {
  const t = useT();
  return (
    <section className="min-w-0 rounded-xl border p-3" data-testid={`meta-group-${group.id}`}>
      <h3 className="mb-2 text-sm font-semibold">{t(group.title)}</h3>
      <dl className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-3 gap-y-1.5 text-sm">
        {group.rows.map((row) => (
          <div key={row.id} className="contents" data-testid={`meta-${row.id}`}>
            <dt className="text-muted-foreground">{typeof row.label === "string" ? row.label : t(row.label)}</dt>
            <dd className={cn("min-w-0", row.sensitive && "font-medium text-foreground")}>
              <Value value={row.value} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Preview({ file }: PreviewProps<MetadataSettings>) {
  const t = useT();
  const [state, setState] = useState<ReadState | null>(null);
  useEffect(() => {
    let alive = true;
    file.file
      .arrayBuffer()
      .then((buf) => readMetadata(new Uint8Array(buf)))
      .then((report) => alive && setState({ id: file.id, report }))
      .catch(() => alive && setState({ id: file.id, error: true }));
    return () => {
      alive = false;
    };
  }, [file.id, file.file]);

  const current = state?.id === file.id ? state : null;
  const report = current?.report;
  const gps = report?.exif?.gps;
  const groups = report ? describeMetadata(report, formatBytes(file.size)) : [];
  const blocks = report?.blocks ?? [];

  return (
    <div className="space-y-3" data-testid="metadata-view">
      <div className="flex items-center gap-3">
        <FileThumb file={file} fit="contain" className="size-20 shrink-0 rounded-lg sm:size-24" />
        <p dir="auto" className="min-w-0 truncate font-medium">
          {file.name}
        </p>
      </div>
      {!current && (
        <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t({ ar: "جارٍ قراءة البيانات…", en: "Reading metadata…" })}
        </div>
      )}
      {current?.error && <Note tone="warning">{t(DAMAGED)}</Note>}
      {gps && (
        <div role="alert" data-testid="gps-warning" className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <MapPin className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p>
            {t({
              ar: "تحتوي هذه الصورة على موقع التصوير الدقيق (GPS). أي شخص تُرسلها إليه يستطيع معرفة مكان التقاطها، وربما مكان سكنك. احذف البيانات قبل المشاركة.",
              en: "This photo contains the exact place it was taken (GPS). Anyone you send it to can see where that was — possibly your home. Remove the metadata before sharing.",
            })}
          </p>
        </div>
      )}
      {report && (
        <section className="rounded-xl bg-muted p-3 text-sm" data-testid="meta-blocks">
          {blocks.length ? (
            <>
              <h3 className="mb-1.5 font-semibold">{t({ ar: "بيانات وصفية موجودة في الملف", en: "Metadata found in this file" })}</h3>
              <ul className="space-y-1">
                {blocks.map((b, k) => (
                  <li key={k} className="flex justify-between gap-3">
                    <span className="min-w-0 break-words">{t(blockLabel(b))}</span>
                    <span dir="ltr" className="shrink-0 tabular-nums text-muted-foreground">
                      {formatBytes(b.bytes)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-teal" />
              {t({ ar: "لا توجد بيانات وصفية في هذا الملف.", en: "This file has no metadata." })}
            </p>
          )}
        </section>
      )}
      {groups.length > 0 && (
        <div className="grid gap-3 xl:grid-cols-2">
          {groups.map((g) => (
            <GroupTable key={g.id} group={g} />
          ))}
        </div>
      )}
    </div>
  );
}

const metadata: ToolModule<MetadataSettings> = {
  mode: "per-file",
  defaultSettings,
  Settings,
  Preview,
  actionLabel: { ar: "حذف البيانات", en: "Remove metadata" },
  async process([input], s, { signal }): Promise<ProcessOutput[]> {
    const bytes = new Uint8Array(await input.file.arrayBuffer());
    let report: MetadataReport;
    try {
      report = await readMetadata(bytes);
    } catch (e) {
      if (e instanceof DamagedFileError) userError(DAMAGED);
      throw e;
    }
    throwIfCancelled(signal);
    const format = formatForKind(input.kind);
    const name = outputName(input, "clean", format);
    const removedLabel = { ar: "حُذف", en: "Removed" };
    const keptLabel = { ar: "أُبقي", en: "Kept" };
    const methodLabel = { ar: "الطريقة", en: "Method" };

    if (s.orientation === "pixels" && report.orientation && report.orientation !== 1) {
      // Re-encode with the camera orientation applied to the pixels.
      const { canvas } = await loadToCanvas(input);
      try {
        const encoded = new Uint8Array(await (await exportCanvas(canvas, format, { quality: 92, signal })).arrayBuffer());
        // Browsers may add a standard colour profile when saving; keep or drop it like any other.
        const clean = stripMetadata(encoded, { keepIcc: s.keepIcc, keepOrientation: false });
        const blob = new Blob([clean.bytes as BlobPart], { type: FORMAT_INFO[format].mime });
        return [
          {
            name,
            blob,
            sourceIds: [input.id],
            meta: [
              { label: removedLabel, value: summarizeBlocks(report.blocks, localize) },
              { label: methodLabel, value: localize({ ar: `أُعيد الحفظ مع تعديل الاتجاه (${canvas.width}×${canvas.height})`, en: `re-saved with orientation applied (${canvas.width}×${canvas.height})` }) },
            ],
          },
        ];
      } finally {
        releaseCanvas(canvas);
      }
    }

    let result;
    try {
      result = await cleanLossless(bytes, report, { keepIcc: s.keepIcc, keepOrientation: true });
    } catch (e) {
      if (e instanceof DamagedFileError) userError(DAMAGED);
      throw e;
    }
    const kept: string[] = result.kept.map((b) => localize(blockLabel(b)));
    if (result.orientationKept) kept.push(localize({ ar: `وسم الاتجاه فقط (${result.orientationKept})`, en: `orientation tag only (${result.orientationKept})` }));
    const meta: NonNullable<ProcessOutput["meta"]> = [
      {
        label: removedLabel,
        value: result.removed.length ? summarizeBlocks(result.removed, localize) : localize({ ar: "لا شيء — لم توجد بيانات وصفية، الملف كما هو", en: "nothing — no metadata found, file unchanged" }),
      },
    ];
    if (kept.length) meta.push({ label: keptLabel, value: kept.join(localize({ ar: "، ", en: ", " })) });
    meta.push(META.size(report), { label: methodLabel, value: localize({ ar: "بلا فقد — بيانات الصورة لم تتغير", en: "lossless — image data unchanged" }) });
    return [{ name, blob: new Blob([result.bytes as BlobPart], { type: FORMAT_INFO[format].mime }), sourceIds: [input.id], meta }];
  },
};

export default metadata;
