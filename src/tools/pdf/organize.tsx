"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Copy, FilePlus2, Redo2, RotateCcw, RotateCw, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WorkspaceFile } from "@/lib/engine/types";
import { useT } from "@/lib/i18n";
import { useHistory } from "@/hooks/use-history";
import { useWorkspace } from "@/stores/workspace";
import { cn } from "@/lib/utils";
import type { PreviewProps, SettingsProps, ToolModule } from "@/tools/types";
import { Field, Note, SelectField } from "./lib/controls";
import { deleteItems, duplicateItems, insertItems, itemsForFile, moveItems, moveTo, rotateItems } from "./lib/organize-ops";
import { PageImage, PdfStatus } from "./lib/pages";
import { resolvePages } from "./lib/page-selection";
import { organizePdf, type OrganizeItem, type OrganizeSettings } from "./lib/structure";
import { usePdfJsMany } from "./lib/use-pdf";

const FILE_TINTS = ["bg-pdf-soft text-pdf", "bg-brand-soft text-primary", "bg-teal-soft text-teal", "bg-muted text-foreground"];

function Settings({ settings, files }: SettingsProps<OrganizeSettings>) {
  const t = useT();
  const used = new Set(settings.items.map((i) => i.fileId));
  return (
    <div className="space-y-4">
      <p className="text-sm" role="status">
        {t({ ar: `${settings.items.length} صفحة في الناتج`, en: `${settings.items.length} pages in the result` })}
        {used.size > 1 && t({ ar: ` · من ${used.size} ملفات`, en: ` · from ${used.size} files` })}
      </p>
      <Note>
        {t({
          ar: "اسحب الصفحات بالفأرة لإعادة ترتيبها، أو حدّدها ثم استخدم أزرار النقل في شريط الأدوات (تعمل باللمس ولوحة المفاتيح). للتراجع: Ctrl+Z.",
          en: "Drag pages with a mouse to reorder them, or select them and use the move buttons in the toolbar (works with touch and keyboard). Undo: Ctrl+Z.",
        })}
      </Note>
      {files.length > 1 && (
        <Note>
          {t({
            ar: "لإدراج صفحات من ملف آخر أضفه إلى قائمة الملفات ثم اختر «إدراج صفحات».",
            en: "To insert pages from another file, add it to the file list, then use “Insert pages”.",
          })}
        </Note>
      )}
    </div>
  );
}

function InsertPanel({ files, onInsert, onClose }: { files: WorkspaceFile[]; onInsert: (fileId: string, pages: number[], where: "start" | "after" | "end") => void; onClose: () => void }) {
  const t = useT();
  const addFiles = useWorkspace((s) => s.addFiles);
  const [fileId, setFileId] = useState(files[files.length - 1]?.id ?? "");
  const [ranges, setRanges] = useState("");
  const [where, setWhere] = useState<"start" | "after" | "end">("after");
  const inputRef = useRef<HTMLInputElement>(null);
  const file = files.find((f) => f.id === fileId) ?? files[0];
  const total = file?.pageCount;
  const check = total ? resolvePages(ranges.trim() ? { scope: "custom", ranges } : { scope: "all", ranges: "" }, total) : null;

  return (
    <div className="space-y-3 rounded-xl border bg-background p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t({ ar: "من الملف", en: "From file" })}>
          <SelectField value={file?.id ?? ""} onChange={setFileId} options={files.map((f) => ({ value: f.id, label: f.name }))} ariaLabel={t({ ar: "من الملف", en: "From file" })} />
        </Field>
        <Field label={t({ ar: "الصفحات (فارغ = الكل)", en: "Pages (empty = all)" })}>
          <input
            dir="ltr"
            value={ranges}
            aria-label={t({ ar: "الصفحات (فارغ = الكل)", en: "Pages (empty = all)" })}
            placeholder="1-3, 5"
            onChange={(e) => setRanges(e.target.value)}
            aria-invalid={check ? !check.ok : undefined}
            className="h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive"
          />
        </Field>
        <Field label={t({ ar: "الموضع", en: "Where" })}>
          <SelectField
            value={where}
            onChange={setWhere}
            ariaLabel={t({ ar: "الموضع", en: "Where" })}
            options={[
              { value: "after", label: t({ ar: "بعد التحديد", en: "After selection" }) },
              { value: "start", label: t({ ar: "في البداية", en: "At the start" }) },
              { value: "end", label: t({ ar: "في النهاية", en: "At the end" }) },
            ]}
          />
        </Field>
      </div>
      {check && !check.ok && <p className="text-xs text-destructive">{t(check.error)}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!check?.ok} onClick={() => check?.ok && onInsert(file.id, check.pages, where)}>
          {t({ ar: "إدراج", en: "Insert" })}
        </Button>
        <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
          {t({ ar: "إضافة ملف PDF آخر", en: "Add another PDF" })}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={async (e) => {
            const list = e.target.files;
            if (list?.length) {
              const added = await addFiles(list);
              if (added[0]) setFileId(added[0].id);
            }
            e.target.value = "";
          }}
        />
        <Button size="sm" variant="ghost" onClick={onClose}>
          {t({ ar: "إغلاق", en: "Close" })}
        </Button>
      </div>
    </div>
  );
}

function Preview({ settings, onChange, files }: PreviewProps<OrganizeSettings>) {
  const t = useT();
  const primary = files[0];
  const blobs = useMemo(() => files.map((f) => f.file), [files]);
  const docs = usePdfJsMany(blobs);
  const history = useHistory<OrganizeItem[]>(settings.items);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [inserting, setInserting] = useState(false);
  const initFor = useRef<string | null>(null);
  const anchor = useRef<string | null>(null);
  const primaryState = primary ? docs.get(primary.file) : undefined;

  // Start from the first file's pages; restart if that file changes.
  useEffect(() => {
    if (!primary || !primaryState?.numPages || initFor.current === primary.id) return;
    initFor.current = primary.id;
    if (settings.items.length && settings.items.every((i) => files.some((f) => f.id === i.fileId))) return;
    history.reset(itemsForFile(primary.id, Array.from({ length: primaryState.numPages }, (_, i) => i)));
  }, [primary, primaryState?.numPages, settings.items, files, history]);

  // Report every edit to the workspace (it processes `settings.items`).
  const value = history.value;
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    onChangeRef.current({ items: value });
  }, [value]);

  // Drop pages whose file was removed from the workspace.
  useEffect(() => {
    if (value.some((i) => !files.some((f) => f.id === i.fileId))) history.set(value.filter((i) => files.some((f) => f.id === i.fileId)));
  }, [files, value, history]);

  if (!primary || !primaryState?.doc) return <PdfStatus pdf={primaryState ?? { doc: null, error: null, numPages: 0 }} />;

  const items = value;
  const sel = new Set([...selected].filter((k) => items.some((i) => i.key === k)));
  const apply = (next: OrganizeItem[]) => history.set(next);
  const fileIndex = (id: string) => files.findIndex((f) => f.id === id);
  const toggle = (key: string, extend: boolean) => {
    const next = new Set(sel);
    if (extend && anchor.current) {
      const a = items.findIndex((i) => i.key === anchor.current);
      const b = items.findIndex((i) => i.key === key);
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) next.add(items[i].key);
    } else if (next.has(key)) next.delete(key);
    else next.add(key);
    anchor.current = key;
    setSelected(next);
  };
  const none = sel.size === 0;
  const rtl = typeof document !== "undefined" && document.documentElement.dir === "rtl";
  // "Earlier" points to the reading start: right in Arabic, left in English.
  const Earlier = rtl ? ArrowRight : ArrowLeft;
  const Later = rtl ? ArrowLeft : ArrowRight;

  return (
    <div className="space-y-3">
      <div className="sticky top-16 z-10 flex flex-wrap items-center gap-1.5 rounded-xl border bg-card/95 p-2 backdrop-blur" role="toolbar" aria-label={t({ ar: "أدوات الترتيب", en: "Organize tools" })}>
        <Button size="sm" variant="outline" disabled={none} onClick={() => apply(moveItems(items, sel, -1))} aria-label={t({ ar: "نقل للأمام", en: "Move earlier" })}>
          <Earlier />
          <span className="hidden sm:inline">{t({ ar: "للأمام", en: "Earlier" })}</span>
        </Button>
        <Button size="sm" variant="outline" disabled={none} onClick={() => apply(moveItems(items, sel, 1))} aria-label={t({ ar: "نقل للخلف", en: "Move later" })}>
          <Later />
          <span className="hidden sm:inline">{t({ ar: "للخلف", en: "Later" })}</span>
        </Button>
        <Button size="icon-sm" variant="outline" disabled={none} onClick={() => apply(rotateItems(items, sel, -90))} aria-label={t({ ar: "تدوير لليسار", en: "Rotate left" })}>
          <RotateCcw />
        </Button>
        <Button size="icon-sm" variant="outline" disabled={none} onClick={() => apply(rotateItems(items, sel, 90))} aria-label={t({ ar: "تدوير لليمين", en: "Rotate right" })}>
          <RotateCw />
        </Button>
        <Button size="icon-sm" variant="outline" disabled={none} onClick={() => apply(duplicateItems(items, sel))} aria-label={t({ ar: "تكرار", en: "Duplicate" })}>
          <Copy />
        </Button>
        <Button
          size="icon-sm"
          variant="destructive"
          disabled={none}
          onClick={() => {
            apply(deleteItems(items, sel));
            setSelected(new Set());
          }}
          aria-label={t({ ar: "حذف", en: "Delete" })}
        >
          <Trash2 />
        </Button>
        <Button size="sm" variant="outline" onClick={() => setInserting((v) => !v)} aria-expanded={inserting}>
          <FilePlus2 />
          <span>{t({ ar: "إدراج صفحات", en: "Insert pages" })}</span>
        </Button>
        <span className="mx-1 h-6 w-px bg-border" aria-hidden />
        <Button size="icon-sm" variant="ghost" disabled={!history.canUndo} onClick={history.undo} aria-label={t({ ar: "تراجع", en: "Undo" })}>
          <Undo2 className="rtl:-scale-x-100" />
        </Button>
        <Button size="icon-sm" variant="ghost" disabled={!history.canRedo} onClick={history.redo} aria-label={t({ ar: "إعادة", en: "Redo" })}>
          <Redo2 className="rtl:-scale-x-100" />
        </Button>
        <span className="ms-auto text-xs text-muted-foreground">
          {none ? t({ ar: "اضغط الصفحات لتحديدها", en: "Tap pages to select" }) : t({ ar: `${sel.size} محددة`, en: `${sel.size} selected` })}
        </span>
        {!none && (
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            {t({ ar: "إلغاء", en: "Clear" })}
          </Button>
        )}
      </div>

      {inserting && (
        <InsertPanel
          files={files}
          onClose={() => setInserting(false)}
          onInsert={(fileId, pages, where) => {
            const added = itemsForFile(fileId, pages.map((p) => p - 1));
            const lastSelected = Math.max(-1, ...items.map((it, i) => (sel.has(it.key) ? i : -1)));
            const at = where === "start" ? 0 : where === "end" || lastSelected < 0 ? items.length : lastSelected + 1;
            apply(insertItems(items, added, at));
            setSelected(new Set(added.map((a) => a.key)));
            setInserting(false);
          }}
        />
      )}

      {items.length === 0 ? (
        <p className="rounded-xl bg-muted p-6 text-center text-sm text-muted-foreground">
          {t({ ar: "لا توجد صفحات. تراجع (Ctrl+Z) أو أدرج صفحات.", en: "No pages left. Undo (Ctrl+Z) or insert pages." })}
        </p>
      ) : (
        <ol className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2.5 sm:grid-cols-[repeat(auto-fill,minmax(128px,1fr))]" aria-label={t({ ar: "صفحات الناتج", en: "Result pages" })}>
          {items.map((item, i) => {
            const fi = fileIndex(item.fileId);
            const src = files[fi];
            const state = src ? docs.get(src.file) : undefined;
            const isSel = sel.has(item.key);
            return (
              <li
                key={item.key}
                draggable
                onDragStart={(e) => {
                  setDragKey(item.key);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", item.key);
                }}
                onDragOver={(e) => {
                  if (dragKey) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!dragKey) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const rtlNow = getComputedStyle(e.currentTarget).direction === "rtl";
                  const inEndHalf = rtlNow ? e.clientX < rect.left + rect.width / 2 : e.clientX > rect.left + rect.width / 2;
                  const moving = sel.has(dragKey) ? sel : new Set([dragKey]);
                  apply(moveTo(items, moving, item.key, inEndHalf));
                  setDragKey(null);
                }}
                onDragEnd={() => setDragKey(null)}
                className={cn("list-none", dragKey === item.key && "opacity-40")}
              >
                <button
                  type="button"
                  aria-pressed={isSel}
                  aria-label={t({ ar: `الموضع ${i + 1}: صفحة ${item.page + 1} من ${src?.name ?? ""}`, en: `Position ${i + 1}: page ${item.page + 1} of ${src?.name ?? ""}` })}
                  onClick={(e) => toggle(item.key, e.shiftKey)}
                  className={cn(
                    "relative w-full cursor-grab rounded-xl border-2 p-1 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing",
                    isSel ? "border-primary bg-brand-soft" : "border-transparent hover:border-border",
                  )}
                >
                  {src && <PageImage file={src.file} page={item.page + 1} ready={!!state?.doc} rotate={item.rotate} />}
                  <span className="mt-1 flex items-center justify-center gap-1 text-xs" dir="ltr">
                    <span className="font-semibold">{i + 1}</span>
                    {files.length > 1 && <span className={cn("rounded px-1 text-[10px]", FILE_TINTS[fi % FILE_TINTS.length])}>{String.fromCharCode(65 + (fi % 26))}{item.page + 1}</span>}
                    {files.length === 1 && <span className="text-muted-foreground">· p{item.page + 1}</span>}
                    {item.rotate !== 0 && <span className="text-muted-foreground">↻{item.rotate}°</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

const mod: ToolModule<OrganizeSettings> = {
  mode: "batch",
  defaultSettings: { items: [] },
  Settings,
  Preview,
  process: organizePdf,
  validate: (_files, s) => (s.items.length ? null : { ar: "لا توجد صفحات في الناتج", en: "The result has no pages" }),
  actionLabel: { ar: "حفظ الملف المرتب", en: "Save organized PDF" },
};

export default mod;
