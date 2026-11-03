"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { PreviewProps, SettingsProps, ToolModule } from "@/tools/types";
import { Note, SelectField, TextField, ToggleField } from "./lib/controls";
import { DEFAULT_FILL, fieldsNeedingRaster, fillForm, fillPdfForm, normalizeFormValue, readFormFields, type FillSettings, type FormFieldInfo, type FormValue } from "./lib/forms";
import { LivePagePreview } from "./lib/live-preview";
import { openPdfDocument } from "./lib/pdf-lib";
import { rasterizeText } from "./lib/raster-text";
import { usePdfJs } from "./lib/use-pdf";

/** Reads the form fields of a file (cached per File). */
const fieldCache = new WeakMap<File, Promise<FormFieldInfo[]>>();
function loadFields(file: File) {
  let p = fieldCache.get(file);
  if (!p) {
    p = openPdfDocument(file).then(readFormFields);
    fieldCache.set(file, p);
    p.catch(() => fieldCache.delete(file));
  }
  return p;
}

function useFields(file: File | undefined) {
  const [state, setState] = useState<{ file?: File; fields: FormFieldInfo[] | null; error: string | null }>({ fields: null, error: null });
  useEffect(() => {
    if (!file) return;
    let alive = true;
    loadFields(file).then(
      (fields) => alive && setState({ file, fields, error: null }),
      (e) => alive && setState({ file, fields: null, error: (e as Error).message }),
    );
    return () => {
      alive = false;
    };
  }, [file]);
  return state.file === file ? state : { fields: null, error: null };
}

function Settings({ settings, onChange, activeFile, disabled }: SettingsProps<FillSettings>) {
  const t = useT();
  const { fields } = useFields(activeFile?.file);
  const arabic = fields ? fieldsNeedingRaster(fields, settings.values).filter((n) => n in settings.values) : [];
  return (
    <div className="space-y-4">
      <ToggleField
        checked={settings.flatten}
        disabled={disabled}
        onChange={(flatten) => onChange({ ...settings, flatten })}
        label={t({ ar: "تسطيح النموذج", en: "Flatten the form" })}
        hint={t({ ar: "تصبح القيم جزءاً ثابتاً من الصفحة ولا يمكن تعديلها لاحقاً", en: "Values become a fixed part of the page and can't be edited later" })}
      />
      {arabic.length > 0 && (
        <Note tone="warning">
          {settings.flatten
            ? t({
                ar: "القيم العربية تُرسم كصورة عند التسطيح (مكتبة PDF لا تشكّل العربية)؛ تظهر صحيحة لكنها غير قابلة للتحديد.",
                en: "Arabic values are drawn as an image when flattening (the PDF library can't shape Arabic); they look right but aren't selectable.",
              })
            : t({
                ar: "القيم العربية تُحفظ في الحقول كما هي، ويرسمها برنامج العرض. Adobe Acrobat ومعظم المتصفحات تعرضها، لكن بعض البرامج قد لا تعرضها. للضمان فعّل «تسطيح النموذج».",
                en: "Arabic values are saved in the fields as they are and drawn by the viewer. Adobe Acrobat and most browsers show them, but some apps may not. To be sure, turn on “Flatten the form”.",
              })}
        </Note>
      )}
      <Note>{t({ ar: "يدعم نماذج AcroForm. نماذج XFA الخاصة ببرنامج Adobe غير مدعومة.", en: "Supports AcroForm forms. Adobe XFA forms are not supported." })}</Note>
    </div>
  );
}

function FieldInput({ field, value, onChange }: { field: FormFieldInfo; value: FormValue; onChange: (v: FormValue) => void }) {
  const t = useT();
  const check = normalizeFormValue(field, value);
  const invalid = !check.ok;
  switch (field.type) {
    case "text":
      return (
        <>
          <TextField value={value as string} onChange={onChange} multiline={field.multiline} disabled={field.readOnly} invalid={invalid} ariaLabel={field.label} />
          {!check.ok && check.reason === "length" && (
            <p className="text-xs text-destructive">{t({ ar: `الحد الأقصى ${field.maxLength} حرفاً`, en: `At most ${field.maxLength} characters` })}</p>
          )}
        </>
      );
    case "checkbox":
      return (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={value === true} disabled={field.readOnly} onChange={(e) => onChange(e.target.checked)} />
          {t({ ar: "محدد", en: "Checked" })}
        </label>
      );
    case "radio":
      return (
        <div className="flex flex-wrap gap-3" role="radiogroup" aria-label={field.label}>
          {field.options.map((o) => (
            <label key={o} className="flex items-center gap-1.5 text-sm">
              <input type="radio" className="size-4 accent-[var(--primary)]" name={field.name} checked={value === o} disabled={field.readOnly} onChange={() => onChange(o)} />
              <span dir="auto">{o}</span>
            </label>
          ))}
        </div>
      );
    case "dropdown":
      return field.editable ? (
        <>
          <TextField value={value as string} onChange={onChange} disabled={field.readOnly} ariaLabel={field.label} />
          <p className="text-xs text-muted-foreground" dir="auto">{field.options.join(" · ")}</p>
        </>
      ) : (
        <SelectField
          value={value as string}
          onChange={onChange}
          disabled={field.readOnly}
          ariaLabel={field.label}
          options={[{ value: "", label: "—" }, ...field.options.map((o) => ({ value: o, label: o }))]}
        />
      );
    case "optionlist": {
      const list = Array.isArray(value) ? value : [];
      return (
        <div className="flex flex-wrap gap-3">
          {field.options.map((o) => (
            <label key={o} className="flex items-center gap-1.5 text-sm">
              <input
                type={field.multiSelect ? "checkbox" : "radio"}
                name={field.name}
                className="size-4 accent-[var(--primary)]"
                checked={list.includes(o)}
                disabled={field.readOnly}
                onChange={(e) => onChange(field.multiSelect ? (e.target.checked ? [...list, o] : list.filter((x) => x !== o)) : [o])}
              />
              <span dir="auto">{o}</span>
            </label>
          ))}
        </div>
      );
    }
    default:
      return <p className="text-xs text-muted-foreground">{t({ ar: "لا يمكن تعبئة هذا الحقل هنا (زر أو توقيع رقمي).", en: "This field can't be filled here (button or digital signature)." })}</p>;
  }
}

function Preview({ settings, onChange, file }: PreviewProps<FillSettings>) {
  const t = useT();
  const { fields, error } = useFields(file.file);
  const pdf = usePdfJs(file.file);
  const [page, setPage] = useState<number | null>(null);
  if (error) return <p className="rounded-xl bg-destructive/8 p-4 text-sm text-destructive">{error}</p>;
  if (!fields) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!fields.length) {
    return (
      <Note tone="warning">
        {t({
          ar: "لا يحتوي هذا الملف على حقول نموذج قابلة للتعبئة. لإضافة نص فوق صفحات عادية استخدم أداة «تعديل PDF».",
          en: "This PDF has no fillable form fields. To add text on top of ordinary pages, use the “Edit PDF” tool.",
        })}
      </Note>
    );
  }
  const valueOf = (f: FormFieldInfo) => (f.name in settings.values ? settings.values[f.name] : f.value);
  const pages = [...new Set(fields.map((f) => f.page).filter((p) => p >= 0))].sort((a, b) => a - b);
  const numPages = Math.max(1, pdf.numPages);
  const shown = page ?? pages[0] ?? 0;
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{t({ ar: `${fields.length} حقل في هذا النموذج`, en: `${fields.length} fields in this form` })}</p>
        {fields.map((f) => (
          <div key={f.name} className="space-y-1.5 rounded-xl border bg-background p-3" onFocusCapture={() => f.page >= 0 && setPage(f.page)}>
            <p className="flex items-center gap-2 text-sm font-medium">
              <span dir="auto">{f.label}</span>
              {f.page >= 0 && <span className="text-xs font-normal text-muted-foreground">{t({ ar: `ص ${f.page + 1}`, en: `p. ${f.page + 1}` })}</span>}
              {f.readOnly && <span className="text-xs font-normal text-muted-foreground">{t({ ar: "للقراءة فقط", en: "read-only" })}</span>}
            </p>
            <FieldInput field={f} value={valueOf(f)} onChange={(v) => onChange({ ...settings, values: { ...settings.values, [f.name]: v } })} />
          </div>
        ))}
      </div>
      <div className="xl:sticky xl:top-20 xl:self-start">
        <LivePagePreview
          file={file.file}
          page={shown}
          numPages={numPages}
          onPage={setPage}
          signature={JSON.stringify(settings)}
          apply={async (doc) => {
            await fillForm(doc, settings, rasterizeText);
          }}
        />
      </div>
    </div>
  );
}

const mod: ToolModule<FillSettings> = {
  mode: "per-file",
  defaultSettings: DEFAULT_FILL,
  Settings,
  Preview,
  process: (inputs, settings, ctx) => fillPdfForm(inputs, settings, ctx, rasterizeText),
  actionLabel: { ar: "حفظ النموذج", en: "Save form" },
};

export default mod;
