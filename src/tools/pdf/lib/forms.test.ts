import { describe, expect, it } from "vitest";
import { PDFDocument, PDFName, PDFRef, PDFString } from "pdf-lib";
import { UserFacingError } from "@/lib/engine/types";
import { fieldsNeedingRaster, fillPdfForm, normalizeFormValue, readFormFields, type FormFieldInfo } from "./forms";
import type { TextRasterizer } from "./page-space";
import { asInput, ctx, makePdf, openOutput, pageImageCount, pageTexts, RED_PNG } from "./test-fixtures";

const fakeRaster: TextRasterizer = async (text, style) => ({ png: RED_PNG, width: text.length * style.fontSize * 0.5, height: style.fontSize * 1.3 });

async function makeForm(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]);
  const page = doc.addPage([595, 842]);
  const form = doc.getForm();
  const name = form.createTextField("student.name");
  name.addToPage(page, { x: 50, y: 700, width: 300, height: 24 });
  name.acroField.dict.set(PDFName.of("TU"), PDFString.of("Student name"));
  const notes = form.createTextField("notes");
  notes.enableMultiline();
  notes.addToPage(page, { x: 50, y: 600, width: 300, height: 60 });
  const agree = form.createCheckBox("agree");
  agree.addToPage(page, { x: 50, y: 550, width: 16, height: 16 });
  const grade = form.createRadioGroup("grade");
  grade.addOptionToPage("A", page, { x: 50, y: 500, width: 14, height: 14 });
  grade.addOptionToPage("B", page, { x: 80, y: 500, width: 14, height: 14 });
  const city = form.createDropdown("city");
  city.addOptions(["Baghdad", "Basra"]);
  city.addToPage(page, { x: 50, y: 450, width: 150, height: 22 });
  const subjects = form.createOptionList("subjects");
  subjects.addOptions(["Biology", "Chemistry", "Physics"]);
  subjects.enableMultiselect();
  subjects.addToPage(page, { x: 50, y: 350, width: 150, height: 60 });
  return doc.save();
}

describe("form value mapping", () => {
  const text: FormFieldInfo = { name: "t", label: "t", type: "text", value: "", options: [], multiline: false, readOnly: false, page: 0, editable: false, multiSelect: false, maxLength: 5 };
  const radio: FormFieldInfo = { ...text, type: "radio", options: ["A", "B"], maxLength: undefined };
  const list: FormFieldInfo = { ...radio, type: "optionlist", multiSelect: false };
  it("checks values against field types", () => {
    expect(normalizeFormValue(text, "ab\ncd")).toEqual({ ok: true, value: "ab cd" });
    expect(normalizeFormValue(text, "toolong")).toEqual({ ok: false, reason: "length" });
    expect(normalizeFormValue(text, true)).toEqual({ ok: false, reason: "type" });
    expect(normalizeFormValue(radio, "B")).toEqual({ ok: true, value: "B" });
    expect(normalizeFormValue(radio, "C")).toEqual({ ok: false, reason: "option" });
    expect(normalizeFormValue({ ...radio, type: "checkbox" }, true)).toEqual({ ok: true, value: true });
    expect(normalizeFormValue(list, ["A", "B"])).toEqual({ ok: true, value: ["A"] });
    expect(normalizeFormValue({ ...radio, type: "dropdown", editable: true }, "Other")).toEqual({ ok: true, value: "Other" });
  });

  it("finds fields that need the Arabic renderer", () => {
    expect(fieldsNeedingRaster([text, radio], { t: "حسام" })).toEqual(["t"]);
    expect(fieldsNeedingRaster([text], { t: "Hussam" })).toEqual([]);
  });
});

describe("fill PDF forms", () => {
  it("detects every field type with labels, options and page", async () => {
    const fields = await readFormFields(await PDFDocument.load(await makeForm()));
    expect(fields.map((f) => [f.name, f.type, f.page])).toEqual([
      ["student.name", "text", 1],
      ["notes", "text", 1],
      ["agree", "checkbox", 1],
      ["grade", "radio", 1],
      ["city", "dropdown", 1],
      ["subjects", "optionlist", 1],
    ]);
    expect(fields[0].label).toBe("Student name");
    expect(fields[1].multiline).toBe(true);
    expect(fields[3].options).toEqual(["A", "B"]);
    expect(fields[5].multiSelect).toBe(true);
  });

  it("fills values that read back correctly", async () => {
    const input = asInput(await makeForm(), "استمارة.pdf");
    const values = { "student.name": "Hussam Khalil", notes: "Line 1\nLine 2", agree: true, grade: "B", city: "Basra", subjects: ["Biology", "Physics"] };
    const [out] = await fillPdfForm([input], { values, flatten: false }, ctx());
    expect(out.name).toBe("استمارة-filled.pdf");
    const form = (await openOutput(out)).getForm();
    expect(form.getTextField("student.name").getText()).toBe("Hussam Khalil");
    expect(form.getTextField("notes").getText()).toBe("Line 1\nLine 2");
    expect(form.getCheckBox("agree").isChecked()).toBe(true);
    expect(form.getRadioGroup("grade").getSelected()).toBe("B");
    expect(form.getDropdown("city").getSelected()).toEqual(["Basra"]);
    expect(form.getOptionList("subjects").getSelected()).toEqual(["Biology", "Physics"]);
    // The visible appearance was regenerated for the new value.
    const widget = form.getTextField("student.name").acroField.getWidgets()[0];
    expect(widget.getNormalAppearance()).toBeInstanceOf(PDFRef);
  });

  it("flattens: fields become page content", async () => {
    const input = asInput(await makeForm());
    const [out] = await fillPdfForm([input], { values: { "student.name": "Hussam", agree: true }, flatten: true }, ctx());
    const doc = await openOutput(out);
    expect(doc.getForm().getFields()).toHaveLength(0);
    expect((await pageTexts(out.blob))[1]).toContain("Hussam");
  });

  it("keeps Arabic values without drawing broken glyphs", async () => {
    const input = asInput(await makeForm());
    const [out] = await fillPdfForm([input], { values: { "student.name": "حسام خليل" }, flatten: false }, ctx());
    const doc = await openOutput(out);
    expect(doc.getForm().getTextField("student.name").getText()).toBe("حسام خليل");
    expect(doc.getForm().acroForm.dict.get(PDFName.of("NeedAppearances"))?.toString()).toBe("true");
  });

  it("flattens Arabic values as an image", async () => {
    const input = asInput(await makeForm());
    const [out] = await fillPdfForm([input], { values: { "student.name": "حسام خليل" }, flatten: true }, ctx(), fakeRaster);
    const doc = await openOutput(out);
    expect(doc.getForm().getFields()).toHaveLength(0);
    expect(await pageImageCount(doc, 1)).toBe(1);
  });

  it("explains when a PDF has no form", async () => {
    const input = asInput(await makePdf(1));
    await expect(fillPdfForm([input], { values: {}, flatten: false }, ctx())).rejects.toBeInstanceOf(UserFacingError);
  });

  it("rejects an invalid option", async () => {
    const input = asInput(await makeForm());
    await expect(fillPdfForm([input], { values: { grade: "Z" }, flatten: false }, ctx())).rejects.toBeInstanceOf(UserFacingError);
  });
});
