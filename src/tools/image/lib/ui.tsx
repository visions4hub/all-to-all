"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import type { WorkspaceFile } from "@/lib/engine/types";
import { readImageSize } from "@/lib/files/image-info";
import { formatNumber } from "@/lib/files/format";
import { dirFor, useLocale, useT, type Localized } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { FONTS, type FontKey } from "./fonts";
import { FORMAT_INFO, OUTPUT_FORMATS, type FormatChoice } from "./format";
import type { Size } from "./geometry";

export function Field({ label, hint, children, htmlFor }: { label: ReactNode; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs leading-5 text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <fieldset className="min-w-0 space-y-3 rounded-xl border p-3">
      <legend className="px-1 text-xs font-semibold text-muted-foreground">{title}</legend>
      {children}
    </fieldset>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled,
  columns,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  label: string;
  disabled?: boolean;
  columns?: number;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("grid gap-1 rounded-xl bg-muted p-1", !columns && "auto-cols-fr grid-flow-col")}
      style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            "min-h-9 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50",
            value === o.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  placeholder,
  disabled,
  hint,
}: {
  label: ReactNode;
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  placeholder?: string;
  disabled?: boolean;
  hint?: ReactNode;
}) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <div className="flex items-center rounded-lg border bg-background focus-within:ring-2 focus-within:ring-ring/40" dir="ltr">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          className="h-10 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none disabled:opacity-50"
          value={value ?? ""}
          min={min}
          max={max}
          step={step}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") return onChange(null);
            const n = Number(raw);
            if (Number.isFinite(n)) onChange(n);
          }}
        />
        {suffix && <span className="pe-3 text-sm text-muted-foreground">{suffix}</span>}
      </div>
    </Field>
  );
}

export function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  format,
  disabled,
  hint,
  onCommit,
}: {
  label: ReactNode;
  value: number;
  onChange: (v: number) => void;
  /** Called when a drag or key press ends (for one undo step per change). */
  onCommit?: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  disabled?: boolean;
  hint?: ReactNode;
}) {
  const locale = useLocale();
  const id = useId();
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span id={id} className="text-sm font-medium">
          {label}
        </span>
        <span dir="ltr" className="text-xs tabular-nums text-muted-foreground">
          {format ? format(value) : formatNumber(value, 2)}
        </span>
      </div>
      <Slider
        aria-labelledby={id}
        dir={dirFor(locale)}
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={(v) => onChange(v[0])}
        onValueCommit={onCommit ? (v) => onCommit(v[0]) : undefined}
        className="py-2"
      />
      {hint && <p className="text-xs leading-5 text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function SwitchField({
  label,
  checked,
  onChange,
  disabled,
  hint,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  hint?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
      </div>
      {hint && <p className="text-xs leading-5 text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function ColorField({ label, value, onChange, disabled }: { label: ReactNode; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <span className="flex items-center gap-2" dir="ltr">
        <span className="text-xs uppercase text-muted-foreground">{value}</span>
        <input
          id={id}
          type="color"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded-lg border bg-background p-1"
        />
      </span>
    </div>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: ReactNode;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id}>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function FontField({ value, onChange, disabled }: { value: FontKey; onChange: (v: FontKey) => void; disabled?: boolean }) {
  const t = useT();
  return (
    <SelectField
      label={t({ ar: "الخط", en: "Font" })}
      value={value}
      disabled={disabled}
      onChange={onChange}
      options={FONTS.map((f) => ({ value: f.key, label: t(f.label) }))}
    />
  );
}

export function Note({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warning" }) {
  return (
    <p
      className={cn(
        "flex items-start gap-2 rounded-lg p-2.5 text-xs leading-5",
        tone === "warning" ? "bg-warning/10 text-foreground" : "bg-muted text-muted-foreground",
      )}
    >
      <Info className={cn("mt-0.5 size-3.5 shrink-0", tone === "warning" && "text-warning")} />
      <span>{children}</span>
    </p>
  );
}

export const METADATA_NOTE: Localized = {
  ar: "الحفظ عبر المتصفح يزيل بيانات الصورة الوصفية (EXIF مثل الكاميرا والموقع) وملف الألوان.",
  en: "Saving through the browser removes image metadata (EXIF such as camera and location) and the colour profile.",
};

/** Output format (+ quality for lossy formats). */
export function OutputFormatFields({
  format,
  quality,
  onChange,
  allowKeep = true,
  disabled,
  formats = OUTPUT_FORMATS,
}: {
  format: FormatChoice;
  quality: number;
  onChange: (next: { format: FormatChoice; quality: number }) => void;
  allowKeep?: boolean;
  disabled?: boolean;
  formats?: readonly (keyof typeof FORMAT_INFO)[];
}) {
  const t = useT();
  const options: { value: FormatChoice; label: ReactNode }[] = [
    ...(allowKeep ? [{ value: "keep" as const, label: t({ ar: "كما هي", en: "Same" }) }] : []),
    ...formats.map((f) => ({ value: f, label: FORMAT_INFO[f].label })),
  ];
  const lossy = format === "keep" || FORMAT_INFO[format].lossy;
  return (
    <div className="space-y-3">
      <Field label={t({ ar: "صيغة الناتج", en: "Output format" })}>
        <Segmented label={t({ ar: "صيغة الناتج", en: "Output format" })} value={format} options={options} disabled={disabled} onChange={(f) => onChange({ format: f, quality })} />
      </Field>
      {lossy && (
        <SliderField
          label={t({ ar: "الجودة", en: "Quality" })}
          value={quality}
          min={1}
          max={100}
          disabled={disabled}
          onChange={(q) => onChange({ format, quality: q })}
          format={(v) => `${v}%`}
          hint={format === "keep" ? t({ ar: "تُطبَّق على JPG وWebP فقط؛ PNG بلا فقد دائماً.", en: "Applies to JPG and WebP only; PNG is always lossless." }) : undefined}
        />
      )}
    </div>
  );
}

/** Pixel size of a workspace image (from the store, or read once). */
export function useImageSize(file?: WorkspaceFile): Size | null {
  const [read, setRead] = useState<{ id: string; size: Size } | null>(null);
  const knownW = file?.width;
  const knownH = file?.height;
  useEffect(() => {
    if (!file || (knownW && knownH)) return;
    let alive = true;
    readImageSize(file.file)
      .then((size) => alive && setRead({ id: file.id, size }))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [file, knownW, knownH]);
  if (knownW && knownH) return { width: knownW, height: knownH };
  return read && read.id === file?.id ? read.size : null;
}

/** Loads a picked image file (e.g. a logo) as an <img> URL for previews. */
export function useObjectUrl(blob?: Blob | null): string | null {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  return url;
}
