"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, Eraser, PenTool, Signature } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/lib/i18n";
import type { PreviewProps, SettingsProps, ToolModule } from "@/tools/types";
import { ColorField, Note, Segmented, TextField, ToggleField } from "./lib/controls";
import { canvasToPng, readEmbeddableImage, type EmbeddableImage } from "./lib/image-input";
import { OverlayEditor, type EditorApi } from "./lib/overlay-editor";
import { EMPTY_OVERLAYS, exportOverlays, type OverlaySettings } from "./lib/overlays";
import { rasterizeText } from "./lib/raster-text";

type Mode = "draw" | "type" | "upload";

/** Copies the drawn part of a canvas (non-transparent pixels) with a small margin. */
function trimCanvas(src: HTMLCanvasElement): HTMLCanvasElement | null {
  const c = src.getContext("2d")!;
  const { width, height } = src;
  const data = c.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const pad = 6;
  const out = document.createElement("canvas");
  out.width = maxX - minX + 1 + pad * 2;
  out.height = maxY - minY + 1 + pad * 2;
  out.getContext("2d")!.drawImage(src, minX - pad, minY - pad, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

async function toImage(canvas: HTMLCanvasElement): Promise<EmbeddableImage | null> {
  const trimmed = trimCanvas(canvas);
  if (!trimmed) return null;
  return { bytes: await canvasToPng(trimmed), type: "png", width: trimmed.width, height: trimmed.height };
}

function DrawPad({ color, onReady }: { color: string; onReady: (c: HTMLCanvasElement | null) => void }) {
  const t = useT();
  const ref = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);
  useEffect(() => {
    const c = ref.current!;
    c.width = 1200;
    c.height = 440;
  }, []);
  const point = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * ref.current!.width, y: ((e.clientY - r.top) / r.height) * ref.current!.height };
  };
  const draw = (from: { x: number; y: number }, to: { x: number; y: number }, pressure: number) => {
    const c = ref.current!.getContext("2d")!;
    c.strokeStyle = color;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.lineWidth = 5 + 4 * (pressure || 0.5);
    c.beginPath();
    c.moveTo(from.x, from.y);
    c.lineTo(to.x, to.y);
    c.stroke();
  };
  return (
    <div className="space-y-2">
      <canvas
        ref={ref}
        aria-label={t({ ar: "مساحة رسم التوقيع", en: "Signature drawing area" })}
        className="aspect-[30/11] w-full touch-none rounded-xl border-2 border-dashed bg-white"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          last.current = point(e);
          draw(last.current, { x: last.current.x + 0.1, y: last.current.y }, e.pressure);
          setEmpty(false);
          onReady(ref.current);
        }}
        onPointerMove={(e) => {
          if (!last.current) return;
          const p = point(e);
          draw(last.current, p, e.pressure);
          last.current = p;
        }}
        onPointerUp={() => (last.current = null)}
        onPointerCancel={() => (last.current = null)}
      />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{empty ? t({ ar: "ارسم توقيعك بالفأرة أو بإصبعك", en: "Draw with a mouse or your finger" }) : ""}</span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            const c = ref.current!;
            c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
            setEmpty(true);
            onReady(null);
          }}
        >
          <Eraser />
          {t({ ar: "مسح", en: "Clear" })}
        </Button>
      </div>
    </div>
  );
}

const TYPE_FONTS = [
  { value: "body", css: "var(--font-body)", label: { ar: "بلكس", en: "Plex" } },
  { value: "display", css: "var(--font-display)", label: { ar: "ريدكس", en: "Readex" } },
  { value: "script", css: '"Segoe Script", "Brush Script MT", "Snell Roundhand", cursive', label: { ar: "مائل", en: "Script" } },
] as const;

function SignatureDialog({ open, onOpenChange, initials, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; initials: boolean; onDone: (img: EmbeddableImage) => void }) {
  const t = useT();
  const [mode, setMode] = useState<Mode>("draw");
  const [color, setColor] = useState("#1a237e");
  const [typed, setTyped] = useState("");
  const [font, setFont] = useState<(typeof TYPE_FONTS)[number]["value"]>("display");
  const [drawn, setDrawn] = useState<HTMLCanvasElement | null>(null);
  const [upload, setUpload] = useState<File | null>(null);
  const [whiteToClear, setWhiteToClear] = useState(true);
  const [error, setError] = useState(false);

  const create = async () => {
    setError(false);
    let img: EmbeddableImage | null = null;
    try {
      if (mode === "draw" && drawn) img = await toImage(drawn);
      if (mode === "type" && typed.trim()) {
        const css = TYPE_FONTS.find((f) => f.value === font)!.css;
        const family = getComputedStyle(document.body).getPropertyValue(css.startsWith("var(") ? css.slice(4, -1) : "--x").trim() || css;
        await document.fonts.load(`96px ${family}`, typed).catch(() => undefined);
        const c = document.createElement("canvas");
        const ctx = c.getContext("2d")!;
        ctx.font = `600 96px ${family}`;
        c.width = Math.ceil(ctx.measureText(typed).width + 40);
        c.height = 160;
        ctx.font = `600 96px ${family}`;
        ctx.fillStyle = color;
        ctx.textBaseline = "middle";
        ctx.direction = /[؀-ۿ]/.test(typed) ? "rtl" : "ltr";
        ctx.textAlign = "center";
        ctx.fillText(typed, c.width / 2, 80);
        img = await toImage(c);
      }
      if (mode === "upload" && upload) {
        const raw = await readEmbeddableImage(upload);
        if (whiteToClear) {
          // Make a white paper background transparent, so a scanned signature sits on the page cleanly.
          const bmp = await createImageBitmap(upload);
          const c = document.createElement("canvas");
          c.width = bmp.width;
          c.height = bmp.height;
          const ctx = c.getContext("2d")!;
          ctx.drawImage(bmp, 0, 0);
          bmp.close();
          const d = ctx.getImageData(0, 0, c.width, c.height);
          for (let i = 0; i < d.data.length; i += 4) {
            const lum = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2];
            if (lum > 225) d.data[i + 3] = 0;
          }
          ctx.putImageData(d, 0, 0);
          img = (await toImage(c)) ?? raw;
        } else img = raw;
      }
    } catch {
      setError(true);
      return;
    }
    if (!img) {
      setError(true);
      return;
    }
    onDone(img);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogTitle>{initials ? t({ ar: "الأحرف الأولى", en: "Initials" }) : t({ ar: "إنشاء توقيع", en: "Create a signature" })}</DialogTitle>
        <DialogDescription>{t({ ar: "يبقى التوقيع على جهازك ولا يُرفع إلى أي مكان.", en: "Your signature stays on your device and is never uploaded." })}</DialogDescription>
        <div className="space-y-4">
          <Segmented
            label={t({ ar: "طريقة الإنشاء", en: "Method" })}
            value={mode}
            onChange={setMode}
            options={[
              { value: "draw", label: t({ ar: "رسم", en: "Draw" }) },
              { value: "type", label: t({ ar: "كتابة", en: "Type" }) },
              { value: "upload", label: t({ ar: "رفع صورة", en: "Upload image" }) },
            ]}
          />
          {mode !== "upload" && <ColorField value={color} onChange={setColor} ariaLabel={t({ ar: "لون الحبر", en: "Ink colour" })} />}
          {mode === "draw" && <DrawPad color={color} onReady={setDrawn} />}
          {mode === "type" && (
            <div className="space-y-3">
              <TextField value={typed} onChange={setTyped} placeholder={initials ? t({ ar: "مثال: ح.خ", en: "e.g. H.K." }) : t({ ar: "اكتب اسمك", en: "Type your name" })} ariaLabel={t({ ar: "النص", en: "Text" })} />
              <Segmented label={t({ ar: "الخط", en: "Font" })} value={font} onChange={setFont} options={TYPE_FONTS.map((f) => ({ value: f.value, label: t(f.label) }))} />
              {typed && (
                <p className="rounded-xl border bg-white p-4 text-center text-4xl" dir="auto" style={{ color, fontFamily: TYPE_FONTS.find((f) => f.value === font)!.css, fontWeight: 600 }}>
                  {typed}
                </p>
              )}
            </div>
          )}
          {mode === "upload" && (
            <div className="space-y-3">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                aria-label={t({ ar: "صورة التوقيع", en: "Signature image" })}
                onChange={(e) => setUpload(e.target.files?.[0] ?? null)}
                className="block w-full text-sm file:me-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-2"
              />
              <ToggleField checked={whiteToClear} onChange={setWhiteToClear} label={t({ ar: "إزالة الخلفية البيضاء", en: "Remove white background" })} />
            </div>
          )}
          {error && <p className="text-sm text-destructive">{t({ ar: "لم يُنشأ التوقيع؛ ارسم أو اكتب شيئاً أولاً.", en: "No signature yet; draw or type something first." })}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t({ ar: "إلغاء", en: "Cancel" })}
            </Button>
            <Button onClick={create}>{t({ ar: "إضافة إلى الصفحة", en: "Add to page" })}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function todayText() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function SignToolbar({ api }: { api: EditorApi }) {
  const t = useT();
  const [dialog, setDialog] = useState<null | "signature" | "initials">(null);
  const [saved, setSaved] = useState<{ signature?: EmbeddableImage; initials?: EmbeddableImage }>({});
  return (
    <>
      <Button size="sm" onClick={() => setDialog("signature")}>
        <Signature />
        {t({ ar: "توقيع", en: "Signature" })}
      </Button>
      {saved.signature && (
        <Button size="sm" variant="outline" onClick={() => api.addImage(saved.signature!, 0.25)}>
          {t({ ar: "التوقيع مرة أخرى", en: "Sign again" })}
        </Button>
      )}
      <Button size="sm" variant="outline" onClick={() => (saved.initials ? api.addImage(saved.initials, 0.1) : setDialog("initials"))}>
        <PenTool />
        {t({ ar: "أحرف أولى", en: "Initials" })}
      </Button>
      <Button size="sm" variant="outline" onClick={() => api.addText(todayText(), { color: "#1a237e", fontSize: 12 })}>
        <CalendarDays />
        {t({ ar: "التاريخ", en: "Date" })}
      </Button>
      <SignatureDialog
        open={dialog !== null}
        onOpenChange={(v) => !v && setDialog(null)}
        initials={dialog === "initials"}
        onDone={(img) => {
          const kind = dialog === "initials" ? "initials" : "signature";
          setSaved((s) => ({ ...s, [kind]: img }));
          api.addImage(img, kind === "initials" ? 0.1 : 0.25);
        }}
      />
    </>
  );
}

function Settings({ settings }: SettingsProps<OverlaySettings>) {
  const t = useT();
  return (
    <div className="space-y-4">
      <p className="text-sm" role="status">
        {t({ ar: `${settings.overlays.length} عنصر على الصفحات`, en: `${settings.overlays.length} item(s) placed` })}
      </p>
      <Note tone="warning">
        {t({
          ar: "هذا توقيع مرئي (صورة على الصفحة)، وليس توقيعاً رقمياً مشفّراً بشهادة. لا يثبت هوية الموقّع ولا يمنع تعديل الملف.",
          en: "This is a visual signature (an image on the page), not a cryptographic digital signature with a certificate. It doesn't prove who signed or stop the file being changed.",
        })}
      </Note>
      <Note>
        {t({
          ar: "استخدم «نص» لإضافة الاسم أو المسمى الوظيفي بجانب التوقيع.",
          en: "Use “Text” to add a name or job title next to the signature.",
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
      tools={["select", "text"]}
      defaults={{ color: "#1a237e", fontSize: 12 }}
      toolbarExtras={(api) => <SignToolbar api={api} />}
    />
  );
}

const mod: ToolModule<OverlaySettings> = {
  mode: "per-file",
  defaultSettings: EMPTY_OVERLAYS,
  Settings,
  Preview,
  process: (inputs, settings, ctx) => exportOverlays(inputs, settings, ctx, rasterizeText, "signed"),
  validate: (_files, s) => (s.overlays.length ? null : { ar: "أضف توقيعك أولاً", en: "Add your signature first" }),
  actionLabel: { ar: "حفظ الملف الموقّع", en: "Save signed PDF" },
};

export default mod;
