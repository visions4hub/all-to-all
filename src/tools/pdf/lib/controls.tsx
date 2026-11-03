"use client";

import { useId, useState, type ReactNode } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useT, type Localized } from "@/lib/i18n";
import { toLatinDigits } from "@/lib/pdf/page-ranges";
import { cn } from "@/lib/utils";
import { ANCHORS, type Anchor } from "./geometry";
import { resolvePages, type PageSelection } from "./page-selection";
import type { StandardFontName } from "./page-space";

export const FONT_OPTIONS: { value: StandardFontName; label: string }[] = [
  { value: "helvetica", label: "Helvetica" },
  { value: "times", label: "Times" },
  { value: "courier", label: "Courier" },
];

export function Field({ label, hint, children, htmlFor, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; htmlFor?: string; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs leading-5 text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
  label,
  columns,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
  label: string;
  columns?: number;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid gap-1 rounded-xl bg-muted p-1"
      style={{ gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          title={o.title}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            "min-h-9 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50",
            o.value === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const inputClass =
  "h-10 w-full min-w-0 rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 aria-invalid:border-destructive";

/** Number input that lets people type freely and only reports valid numbers. */
export function NumberField({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  id,
  disabled,
  integer,
  ariaLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  id?: string;
  disabled?: boolean;
  integer?: boolean;
  ariaLabel?: string;
}) {
  const [text, setText] = useState(String(value));
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    // Follow outside changes (e.g. a drag on the preview) unless the text already means this value.
    setSeen(value);
    if (Number(toLatinDigits(text)) !== value) setText(String(value));
  }
  const n = Number(toLatinDigits(text.trim()));
  const valid = text.trim() !== "" && Number.isFinite(n) && (min === undefined || n >= min) && (max === undefined || n <= max) && (!integer || Number.isInteger(n));
  return (
    <div className="flex items-center gap-2" dir="ltr">
      <input
        id={id}
        inputMode={integer ? "numeric" : "decimal"}
        value={text}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-invalid={!valid}
        onChange={(e) => {
          setText(e.target.value);
          const v = Number(toLatinDigits(e.target.value.trim()));
          if (e.target.value.trim() !== "" && Number.isFinite(v) && (min === undefined || v >= min) && (max === undefined || v <= max) && (!integer || Number.isInteger(v))) onChange(v);
        }}
        onBlur={() => !valid && setText(String(value))}
        step={step}
        className={inputClass}
      />
      {suffix && <span className="shrink-0 text-xs text-muted-foreground">{suffix}</span>}
    </div>
  );
}

export function TextField({
  value,
  onChange,
  id,
  disabled,
  placeholder,
  invalid,
  multiline,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
  invalid?: boolean;
  multiline?: boolean;
  ariaLabel?: string;
}) {
  if (multiline) {
    return (
      <textarea
        id={id}
        dir="auto"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-invalid={invalid}
        onChange={(e) => onChange(e.target.value)}
        className={cn(inputClass, "h-auto min-h-20 py-2")}
      />
    );
  }
  return (
    <input
      id={id}
      dir="auto"
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={ariaLabel}
      aria-invalid={invalid}
      onChange={(e) => onChange(e.target.value)}
      className={inputClass}
    />
  );
}

export function SelectField<T extends string>({
  value,
  onChange,
  options,
  id,
  disabled,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  id?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <select id={id} value={value} disabled={disabled} aria-label={ariaLabel} onChange={(e) => onChange(e.target.value as T)} className={cn(inputClass, "bg-card")}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function ColorField({ value, onChange, id, disabled, ariaLabel }: { value: string; onChange: (v: string) => void; id?: string; disabled?: boolean; ariaLabel?: string }) {
  return (
    <div className="flex items-center gap-2" dir="ltr">
      <input
        id={id}
        type="color"
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-14 cursor-pointer rounded-lg border border-input bg-transparent p-1"
      />
      <span className="font-mono text-xs text-muted-foreground uppercase">{value}</span>
    </div>
  );
}

export function ToggleField({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {hint && <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{hint}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} className="mt-0.5" />
    </div>
  );
}

export function RangeField({
  value,
  onChange,
  min,
  max,
  step = 1,
  format,
  id,
  disabled,
  ariaLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  id?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-6 w-full min-w-0 cursor-pointer accent-[var(--primary)]"
      />
      <span dir="ltr" className="w-12 shrink-0 text-end text-xs text-muted-foreground tabular-nums">
        {format ? format(value) : value}
      </span>
    </div>
  );
}

export function Note({ tone = "info", children }: { tone?: "info" | "warning"; children: ReactNode }) {
  const Icon = tone === "warning" ? AlertTriangle : Info;
  return (
    <p
      className={cn(
        "flex items-start gap-2 rounded-xl p-3 text-xs leading-5",
        tone === "warning" ? "border border-warning/30 bg-warning/8" : "bg-muted text-muted-foreground",
      )}
    >
      <Icon className={cn("mt-0.5 size-3.5 shrink-0", tone === "warning" && "text-warning")} />
      <span>{children}</span>
    </p>
  );
}

/** All pages / custom page ranges, validated against the file's page count. */
export function PageSelectionField({
  value,
  onChange,
  pageCount,
  disabled,
  label,
}: {
  value: PageSelection;
  onChange: (v: PageSelection) => void;
  pageCount?: number;
  disabled?: boolean;
  label?: Localized;
}) {
  const t = useT();
  const id = useId();
  const check = value.scope === "custom" && pageCount ? resolvePages(value, pageCount) : null;
  return (
    <Field label={t(label ?? { ar: "الصفحات", en: "Pages" })} htmlFor={id}>
      <Segmented
        label={t(label ?? { ar: "الصفحات", en: "Pages" })}
        value={value.scope}
        disabled={disabled}
        onChange={(scope) => onChange({ ...value, scope })}
        options={[
          { value: "all", label: t({ ar: "كل الصفحات", en: "All pages" }) },
          { value: "custom", label: t({ ar: "صفحات محددة", en: "Some pages" }) },
        ]}
      />
      {value.scope === "custom" && (
        <>
          <input
            id={id}
            dir="ltr"
            value={value.ranges}
            disabled={disabled}
            placeholder="1-3, 5, 8-"
            aria-invalid={check ? !check.ok : undefined}
            onChange={(e) => onChange({ ...value, ranges: e.target.value })}
            className={inputClass}
          />
          <p className={cn("text-xs", check && !check.ok ? "text-destructive" : "text-muted-foreground")}>
            {check && !check.ok
              ? t(check.error)
              : check?.ok
                ? t({ ar: `${check.pages.length} صفحة من ${pageCount}`, en: `${check.pages.length} of ${pageCount} pages` })
                : t({ ar: "مثال: 1-3, 5, 8- (حتى النهاية)", en: "Example: 1-3, 5, 8- (to the end)" })}
          </p>
        </>
      )}
    </Field>
  );
}

const ANCHOR_LABELS: Record<Anchor, Localized> = {
  "top-left": { ar: "أعلى اليسار", en: "Top left" },
  "top-center": { ar: "أعلى الوسط", en: "Top centre" },
  "top-right": { ar: "أعلى اليمين", en: "Top right" },
  "middle-left": { ar: "وسط اليسار", en: "Middle left" },
  center: { ar: "المنتصف", en: "Centre" },
  "middle-right": { ar: "وسط اليمين", en: "Middle right" },
  "bottom-left": { ar: "أسفل اليسار", en: "Bottom left" },
  "bottom-center": { ar: "أسفل الوسط", en: "Bottom centre" },
  "bottom-right": { ar: "أسفل اليمين", en: "Bottom right" },
};

/**
 * Position on the page. The grid is the page itself, so it is laid out
 * physically (left stays left) even in Arabic.
 */
export function AnchorPicker({ value, onChange, allowed = ANCHORS, disabled, label }: { value: Anchor; onChange: (a: Anchor) => void; allowed?: Anchor[]; disabled?: boolean; label: string }) {
  const t = useT();
  return (
    <div role="radiogroup" aria-label={label} dir="ltr" className="grid w-36 grid-cols-3 gap-1.5 rounded-xl border bg-muted/50 p-2">
      {ANCHORS.map((a) => {
        const enabled = allowed.includes(a);
        return (
          <button
            key={a}
            type="button"
            role="radio"
            aria-checked={value === a}
            aria-label={t(ANCHOR_LABELS[a])}
            title={t(ANCHOR_LABELS[a])}
            disabled={disabled || !enabled}
            onClick={() => onChange(a)}
            className={cn(
              "flex h-9 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              !enabled ? "invisible" : value === a ? "bg-primary" : "bg-card hover:bg-brand-soft",
            )}
          >
            <span className={cn("size-2 rounded-full", value === a ? "bg-primary-foreground" : "bg-muted-foreground/40")} />
          </button>
        );
      })}
    </div>
  );
}
