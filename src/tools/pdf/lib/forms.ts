// Fill PDF forms (AcroForm). XFA-only forms are not supported by pdf-lib.

import type { PDFDocument, PDFField, PDFFont, PDFPage, PDFWidgetAnnotation } from "pdf-lib";
import { throwIfCancelled, type ProcessContext, type ProcessInput, type ProcessOutput } from "@/lib/engine/types";
import { buildOutputName } from "@/lib/files/filename";
import { userError } from "./errors";
import { canUseStandardFont, hasRtl, standardFont, type TextRasterizer } from "./page-space";
import { loadPdfLib, openPdfDocument, savePdf } from "./pdf-lib";

export type FieldType = "text" | "checkbox" | "radio" | "dropdown" | "optionlist" | "button" | "signature";

export type FormFieldInfo = {
  name: string;
  /** Tooltip (TU) when the form has one, otherwise the field name. */
  label: string;
  type: FieldType;
  value: string | boolean | string[];
  options: string[];
  multiline: boolean;
  readOnly: boolean;
  /** 0-based page of the first widget, -1 when unknown. */
  page: number;
  maxLength?: number;
  /** Dropdown accepts values not in its list. */
  editable: boolean;
  multiSelect: boolean;
};

export type FormValue = string | boolean | string[];
export type FormValues = Record<string, FormValue>;

async function fieldType(field: PDFField): Promise<FieldType> {
  const lib = await loadPdfLib();
  if (field instanceof lib.PDFTextField) return "text";
  if (field instanceof lib.PDFCheckBox) return "checkbox";
  if (field instanceof lib.PDFRadioGroup) return "radio";
  if (field instanceof lib.PDFDropdown) return "dropdown";
  if (field instanceof lib.PDFOptionList) return "optionlist";
  if (field instanceof lib.PDFSignature) return "signature";
  return "button";
}

function widgetPage(doc: PDFDocument, widget: PDFWidgetAnnotation): PDFPage | undefined {
  const pages = doc.getPages();
  const ref = widget.P();
  const byRef = pages.find((p) => p.ref === ref);
  if (byRef) return byRef;
  const widgetRef = doc.context.getObjectRef(widget.dict);
  return widgetRef ? doc.findPageForAnnotationRef(widgetRef) : undefined;
}

async function tooltip(field: PDFField): Promise<string | undefined> {
  const { PDFName, PDFString, PDFHexString } = await loadPdfLib();
  const tu = field.acroField.dict.lookup(PDFName.of("TU"));
  if (tu instanceof PDFString || tu instanceof PDFHexString) return tu.decodeText().trim() || undefined;
  return undefined;
}

export async function readFormFields(doc: PDFDocument): Promise<FormFieldInfo[]> {
  const lib = await loadPdfLib();
  const form = doc.getForm();
  const pages = doc.getPages();
  const out: FormFieldInfo[] = [];
  for (const field of form.getFields()) {
    const type = await fieldType(field);
    const widget = field.acroField.getWidgets()[0];
    const page = widget ? widgetPage(doc, widget) : undefined;
    const info: FormFieldInfo = {
      name: field.getName(),
      label: (await tooltip(field)) ?? field.getName(),
      type,
      value: "",
      options: [],
      multiline: false,
      readOnly: field.isReadOnly(),
      page: page ? pages.indexOf(page) : -1,
      editable: false,
      multiSelect: false,
    };
    if (field instanceof lib.PDFTextField) {
      info.value = field.getText() ?? "";
      info.multiline = field.isMultiline();
      info.maxLength = field.getMaxLength();
    } else if (field instanceof lib.PDFCheckBox) info.value = field.isChecked();
    else if (field instanceof lib.PDFRadioGroup) {
      info.options = field.getOptions();
      info.value = field.getSelected() ?? "";
    } else if (field instanceof lib.PDFDropdown) {
      info.options = field.getOptions();
      info.value = field.getSelected()[0] ?? "";
      info.editable = field.isEditable();
    } else if (field instanceof lib.PDFOptionList) {
      info.options = field.getOptions();
      info.value = field.getSelected();
      info.multiSelect = field.isMultiselect();
    }
    out.push(info);
  }
  return out;
}

/**
 * Checks a value against a field. Returns the cleaned value, or an error text.
 * Used both by the form UI and before filling.
 */
export function normalizeFormValue(field: FormFieldInfo, raw: FormValue): { ok: true; value: FormValue } | { ok: false; reason: "type" | "option" | "length" } {
  switch (field.type) {
    case "text": {
      if (typeof raw !== "string") return { ok: false, reason: "type" };
      const value = field.multiline ? raw.replace(/\r\n?/g, "\n") : raw.replace(/[\r\n]+/g, " ");
      if (field.maxLength !== undefined && Array.from(value).length > field.maxLength) return { ok: false, reason: "length" };
      return { ok: true, value };
    }
    case "checkbox":
      return typeof raw === "boolean" ? { ok: true, value: raw } : { ok: false, reason: "type" };
    case "radio":
      if (typeof raw !== "string") return { ok: false, reason: "type" };
      return raw === "" || field.options.includes(raw) ? { ok: true, value: raw } : { ok: false, reason: "option" };
    case "dropdown":
      if (typeof raw !== "string") return { ok: false, reason: "type" };
      return raw === "" || field.editable || field.options.includes(raw) ? { ok: true, value: raw } : { ok: false, reason: "option" };
    case "optionlist": {
      const list = Array.isArray(raw) ? raw : typeof raw === "string" && raw ? [raw] : [];
      if (!list.every((v) => field.options.includes(v))) return { ok: false, reason: "option" };
      return { ok: true, value: field.multiSelect ? list : list.slice(0, 1) };
    }
    default:
      return { ok: false, reason: "type" };
  }
}

/** Text a field will show, for deciding whether the standard font can draw it. */
function shownText(value: FormValue): string {
  return Array.isArray(value) ? value.join("\n") : typeof value === "string" ? value : "";
}

/** Fields whose value can't be drawn with the standard PDF font (e.g. Arabic). */
export function fieldsNeedingRaster(fields: FormFieldInfo[], values: FormValues): string[] {
  return fields
    .filter((f) => ["text", "dropdown", "optionlist"].includes(f.type))
    .filter((f) => !canUseStandardFont(shownText(values[f.name] ?? f.value)))
    .map((f) => f.name);
}

export type FillSettings = { values: FormValues; flatten: boolean };
export const DEFAULT_FILL: FillSettings = { values: {}, flatten: false };

function fontSizeFor(field: PDFField, rectHeight: number): number {
  const da = (field.acroField as unknown as { getDefaultAppearance?: () => string | undefined }).getDefaultAppearance?.() ?? "";
  const m = /(\d+(?:\.\d+)?)\s+Tf/.exec(da);
  const size = m ? Number(m[1]) : 0;
  return size > 0 ? size : Math.max(6, Math.min(12, rectHeight * 0.65));
}

/** Draws a widget's own appearance onto its page (what flattening means). */
async function stampWidgetAppearance(page: PDFPage, field: PDFField, widget: PDFWidgetAnnotation) {
  const lib = await loadPdfLib();
  let ap = widget.getNormalAppearance();
  if (ap instanceof lib.PDFDict && (field instanceof lib.PDFCheckBox || field instanceof lib.PDFRadioGroup)) {
    const state = widget.getAppearanceState() ?? (field.acroField.getValue() as import("pdf-lib").PDFName);
    const ref = ap.get(state) ?? ap.get(lib.PDFName.of("Off"));
    if (ref instanceof lib.PDFRef) ap = ref;
  }
  if (!(ap instanceof lib.PDFRef)) return; // no appearance to keep
  const hidden = (widget.getFlags() & 2) !== 0;
  if (hidden) return;
  const rect = widget.getRectangle();
  const name = page.node.newXObject("FlatWidget", ap);
  page.pushOperators(lib.pushGraphicsState(), lib.translate(rect.x, rect.y), lib.drawObject(name), lib.popGraphicsState());
}

export async function fillForm(doc: PDFDocument, settings: FillSettings, rasterize: TextRasterizer | undefined, signal?: AbortSignal) {
  const lib = await loadPdfLib();
  const form = doc.getForm();
  const infos = await readFormFields(doc);
  if (!infos.length) {
    throw userError({
      ar: "لا يحتوي هذا الملف على حقول نموذج قابلة للتعبئة (AcroForm).",
      en: "This PDF has no fillable form fields (AcroForm).",
    });
  }
  const raster = new Set(fieldsNeedingRaster(infos, settings.values));
  if (raster.size && settings.flatten && !rasterize) throw new Error("Arabic flattening needs the browser renderer");
  let font: PDFFont | null = null;
  const filled: string[] = [];

  for (const info of infos) {
    if (signal) throwIfCancelled(signal);
    if (info.readOnly || !(info.name in settings.values)) continue;
    const check = normalizeFormValue(info, settings.values[info.name]);
    if (!check.ok) {
      throw userError({ ar: `قيمة غير صالحة للحقل «${info.label}».`, en: `Invalid value for the field “${info.label}”.` });
    }
    const field = form.getField(info.name);
    const value = check.value;
    if (field instanceof lib.PDFTextField) field.setText(value as string || undefined);
    else if (field instanceof lib.PDFCheckBox) (value ? field.check() : field.uncheck());
    else if (field instanceof lib.PDFRadioGroup) (value ? field.select(value as string) : field.clear());
    else if (field instanceof lib.PDFDropdown) (value ? field.select(value as string) : field.clear());
    else if (field instanceof lib.PDFOptionList) {
      const list = value as string[];
      if (list.length) field.select(list);
      else field.clear();
    }
    filled.push(info.name);

    // Appearances: regenerate with Helvetica where it can draw the value. Arabic values keep
    // the value in the file; viewers redraw them (NeedAppearances) or they are rasterized on flatten.
    if (field instanceof lib.PDFCheckBox || field instanceof lib.PDFRadioGroup) field.defaultUpdateAppearances();
    else if (!raster.has(info.name)) {
      font ??= await standardFont(doc, "helvetica");
      (field as import("pdf-lib").PDFTextField).updateAppearances(font);
    } else if (!settings.flatten) {
      // A stale appearance would show the old value; remove it so viewers draw the new one.
      for (const w of field.acroField.getWidgets()) w.dict.delete(lib.PDFName.of("AP"));
    }
  }

  if (!settings.flatten) {
    if (raster.size) form.acroForm.dict.set(lib.PDFName.of("NeedAppearances"), lib.PDFBool.True);
    return { filled, rasterized: [] as string[], flattened: false };
  }

  // Flatten: draw every field's appearance into the page, then remove the fields.
  const rasterized: string[] = [];
  for (const field of form.getFields()) {
    if (signal) throwIfCancelled(signal);
    const name = field.getName();
    for (const widget of field.acroField.getWidgets()) {
      const page = widgetPage(doc, widget);
      if (!page) continue;
      if (raster.has(name)) {
        const text = shownText(settings.values[name] ?? infos.find((i) => i.name === name)!.value);
        if (!text.trim()) continue;
        const rect = widget.getRectangle();
        const size = fontSizeFor(field, rect.height);
        const img = await rasterize!(text, { fontSize: size, color: "#000000", align: hasRtl(text) ? "end" : "start" });
        const scale = Math.min(1, (rect.width - 4) / img.width, rect.height / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        const embedded = await doc.embedPng(img.png);
        const x = hasRtl(text) ? rect.x + rect.width - 2 - w : rect.x + 2;
        page.drawImage(embedded, { x, y: rect.y + (rect.height - h) / 2, width: w, height: h });
      } else {
        await stampWidgetAppearance(page, field, widget);
      }
    }
    if (raster.has(name)) rasterized.push(name);
  }
  // Remove the widgets from the pages directly (pdf-lib's removeField fails on fields
  // without an appearance), then the form itself.
  for (const field of form.getFields()) {
    for (const widget of field.acroField.getWidgets()) {
      const ref = doc.context.getObjectRef(widget.dict);
      const page = widgetPage(doc, widget);
      if (ref && page) page.node.removeAnnot(ref);
    }
  }
  // An empty AcroForm left behind confuses some viewers.
  doc.catalog.delete(lib.PDFName.of("AcroForm"));
  return { filled, rasterized, flattened: true };
}

export async function fillPdfForm(
  inputs: ProcessInput[],
  settings: FillSettings,
  ctx: ProcessContext,
  rasterize?: TextRasterizer,
): Promise<ProcessOutput[]> {
  const [input] = inputs;
  const doc = await openPdfDocument(input.file);
  const result = await fillForm(doc, settings, rasterize, ctx.signal);
  return [
    {
      name: buildOutputName(input.name, { suffix: "filled", ext: "pdf" }),
      blob: await savePdf(doc),
      sourceIds: [input.id],
      meta: [
        { label: { ar: "حقول معبّأة", en: "Fields filled" }, value: result.filled.length },
        ...(result.flattened ? [{ label: { ar: "مسطّح", en: "Flattened" }, value: "✓" }] : []),
      ],
    },
  ];
}
