// Turns a metadata report into labelled rows for display (and for tests).

import type { Localized } from "@/lib/i18n";
import type { ExifValue } from "./tiff";
import type { Block, BlockKind, MetadataReport } from "./types";

export type Row = { id: string; label: string | Localized; value: string | Localized; sensitive?: boolean };
export type Group = { id: "file" | "colour" | "camera" | "capture" | "location" | "rights"; title: Localized; rows: Row[] };

const L = (ar: string, en: string): Localized => ({ ar, en });

export const ORIENTATION: Record<number, Localized> = {
  1: L("عادي", "Normal"),
  2: L("معكوس أفقياً", "Mirrored horizontally"),
  3: L("مقلوب 180°", "Rotated 180°"),
  4: L("معكوس عمودياً", "Mirrored vertically"),
  5: L("معكوس ومدوّر 90° عكس عقارب الساعة", "Mirrored, rotated 90° counter-clockwise"),
  6: L("يُعرض مدوّراً 90° مع عقارب الساعة", "Shown rotated 90° clockwise"),
  7: L("معكوس ومدوّر 90° مع عقارب الساعة", "Mirrored, rotated 90° clockwise"),
  8: L("يُعرض مدوّراً 90° عكس عقارب الساعة", "Shown rotated 90° counter-clockwise"),
};

const BLOCK_LABELS: Record<BlockKind, Localized> = {
  exif: L("EXIF (الكاميرا والتاريخ والموقع)", "EXIF (camera, date, location)"),
  xmp: L("XMP", "XMP"),
  iptc: L("IPTC / Photoshop", "IPTC / Photoshop"),
  icc: L("ملف الألوان ICC", "ICC colour profile"),
  comment: L("تعليق", "Comment"),
  text: L("نص PNG", "PNG text"),
  time: L("وقت التعديل (tIME)", "Modified time (tIME)"),
  thumbnail: L("صورة مصغّرة مضمّنة", "Embedded thumbnail"),
  "multi-picture": L("فهرس صور متعددة (MPF)", "Multi-picture index (MPF)"),
  app: L("بيانات تطبيق", "Application data"),
  trailing: L("بيانات بعد نهاية الصورة", "Data after the image end"),
};

export function blockLabel(block: Block): Localized {
  const base = BLOCK_LABELS[block.kind];
  if (!block.detail) return base;
  return { ar: `${base.ar}: ${block.detail}`, en: `${base.en}: ${block.detail}` };
}

const fmt = (n: number, digits = 2) => String(Math.round(n * 10 ** digits) / 10 ** digits);

export function formatExposure(seconds: number): string {
  if (!seconds) return "";
  if (seconds >= 1) return `${fmt(seconds, 1)} s`;
  return `1/${Math.round(1 / seconds)} s`;
}

/** "2024:05:17 14:23:11" → "2024-05-17 14:23:11". */
export function formatExifDate(v: string): string {
  return v.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3");
}

const str = (v: ExifValue | undefined): string | undefined => {
  if (v === undefined) return undefined;
  if (typeof v === "string") return v || undefined;
  if (typeof v === "number") return fmt(v);
  return undefined;
};

export function describeMetadata(r: MetadataReport, fileSize: string): Group[] {
  const t = r.exif?.tags ?? {};
  const x = r.xmp;
  const i = r.iptc;
  const c = r.colour;
  const groups: Group[] = [];
  const push = (id: Group["id"], title: Localized, rows: (Row | null | undefined | false | "" | 0)[]) => {
    const list = rows.filter((row): row is Row => !!row && (typeof row.value !== "string" || row.value.trim() !== ""));
    if (list.length) groups.push({ id, title, rows: list });
  };
  const row = (id: string, label: string | Localized, value: string | Localized | undefined, sensitive = false): Row | null =>
    value === undefined || value === "" ? null : { id, label, value, sensitive };
  const yes = L("نعم", "Yes");
  const no = L("لا", "No");

  push("file", L("الملف", "File"), [
    row("format", L("الصيغة الحقيقية", "Real format"), { jpeg: "JPEG", png: "PNG", webp: "WebP" }[r.format]),
    row("dimensions", L("الأبعاد", "Dimensions"), r.width && r.height ? `${r.width}×${r.height}` : undefined),
    row("size", L("حجم الملف", "File size"), fileSize),
    row("orientation", L("الاتجاه", "Orientation"), r.orientation ? ORIENTATION[r.orientation] : L("غير محدد (عادي)", "Not set (normal)")),
  ]);

  push("colour", L("الألوان", "Colour"), [
    row("bit-depth", L("عمق اللون", "Bit depth"), c.bitDepth ? `${c.bitDepth}-bit` : undefined),
    row("colour-type", L("نوع الألوان", "Colour type"), c.colourType),
    row("subsampling", L("تقليل دقة الألوان", "Chroma subsampling"), c.subsampling),
    r.format === "jpeg" && row("progressive", L("تدريجي (Progressive)", "Progressive"), c.progressive ? yes : no),
    r.format === "png" && row("interlaced", L("متشابك (Interlaced)", "Interlaced"), c.interlaced ? yes : no),
    r.format !== "jpeg" && row("alpha", L("شفافية", "Transparency"), c.alpha ? yes : no),
    row("compression", L("الضغط", "Compression"), c.compression === "lossless" ? L("بلا فقد", "Lossless") : c.compression === "lossy" ? L("مع فقد", "Lossy") : undefined),
    c.animated && row("frames", L("متحركة", "Animated"), c.frames ? { ar: `نعم، ${c.frames} إطار`, en: `Yes, ${c.frames} frames` } : yes),
    row("icc", L("ملف الألوان ICC", "ICC profile"), c.icc ? c.icc.name || L("موجود (بلا اسم)", "Present (unnamed)") : L("لا يوجد", "None")),
    c.icc?.colourSpace && row("icc-space", L("فضاء ألوان الملف", "Profile colour space"), `${c.icc.colourSpace}${c.icc.version ? ` · v${c.icc.version}` : ""}`),
    c.srgb && row("srgb", "sRGB", yes),
    t.ColorSpace !== undefined && row("exif-colour-space", L("فضاء الألوان (EXIF)", "Colour space (EXIF)"), t.ColorSpace === 1 ? "sRGB" : L("غير معاير", "Uncalibrated")),
    c.gamma && row("gamma", L("غاما", "Gamma"), fmt(c.gamma)),
    c.dpi && row("dpi", L("الدقة", "Resolution"), `${c.dpi} DPI`),
  ]);

  const lens = str(t.LensModel) ?? x["aux:Lens"] ?? x["exifEX:LensModel"];
  push("camera", L("الكاميرا والبرنامج", "Camera & software"), [
    row("make", L("الشركة المصنّعة", "Make"), str(t.Make) ?? x["tiff:Make"]),
    row("model", L("الطراز", "Model"), str(t.Model) ?? x["tiff:Model"]),
    row("lens", L("العدسة", "Lens"), lens && str(t.LensMake) && !lens.includes(str(t.LensMake)!) ? `${str(t.LensMake)} ${lens}` : lens),
    row("software", L("البرنامج", "Software"), str(t.Software) ?? x["xmp:CreatorTool"]),
    row("body-serial", L("الرقم التسلسلي للكاميرا", "Camera serial number"), str(t.BodySerialNumber), true),
    row("lens-serial", L("الرقم التسلسلي للعدسة", "Lens serial number"), str(t.LensSerialNumber), true),
    row("owner", L("مالك الكاميرا", "Camera owner"), str(t.CameraOwnerName), true),
    row("unique-id", L("معرّف الصورة", "Image ID"), str(t.ImageUniqueID), true),
  ]);

  const focal = typeof t.FocalLength === "number" ? `${fmt(t.FocalLength, 1)} mm${typeof t.FocalLengthIn35mm === "number" ? ` (${t.FocalLengthIn35mm} mm 35mm)` : ""}` : undefined;
  push("capture", L("التصوير", "Capture"), [
    row("date-original", L("تاريخ التصوير", "Date taken"), typeof t.DateTimeOriginal === "string" ? formatExifDate(t.DateTimeOriginal) + (t.OffsetTimeOriginal ? ` ${t.OffsetTimeOriginal}` : "") : x["exif:DateTimeOriginal"] ?? x["photoshop:DateCreated"], true),
    row("date-modified", L("تاريخ التعديل", "Date modified"), typeof t.DateTime === "string" ? formatExifDate(t.DateTime) : x["xmp:ModifyDate"]),
    row("exposure", L("زمن التعريض", "Exposure"), typeof t.ExposureTime === "number" ? formatExposure(t.ExposureTime) : undefined),
    row("aperture", L("فتحة العدسة", "Aperture"), typeof t.FNumber === "number" ? `f/${fmt(t.FNumber, 1)}` : undefined),
    row("iso", "ISO", typeof t.ISO === "number" ? String(t.ISO) : Array.isArray(t.ISO) ? String(t.ISO[0]) : undefined),
    row("focal", L("البعد البؤري", "Focal length"), focal),
    row("bias", L("تعويض التعريض", "Exposure bias"), typeof t.ExposureBias === "number" ? `${t.ExposureBias > 0 ? "+" : ""}${fmt(t.ExposureBias, 1)} EV` : undefined),
    row("flash", L("الفلاش", "Flash"), typeof t.Flash === "number" ? (t.Flash & 1 ? L("استُخدم", "Fired") : L("لم يُستخدم", "Did not fire")) : undefined),
  ]);

  const gps = r.exif?.gps;
  push("location", L("الموقع", "Location"), [
    gps && row("gps", L("الإحداثيات (GPS)", "Coordinates (GPS)"), `${gps.latitude.toFixed(6)}, ${gps.longitude.toFixed(6)}`, true),
    gps && gps.altitude !== undefined && row("altitude", L("الارتفاع", "Altitude"), `${fmt(gps.altitude, 1)} m`, true),
    !gps && x["exif:GPSLatitude"] && row("xmp-gps", L("الإحداثيات (XMP)", "Coordinates (XMP)"), `${x["exif:GPSLatitude"]}, ${x["exif:GPSLongitude"] ?? ""}`, true),
    row("city", L("المدينة", "City"), i.City?.join(", ") ?? x["photoshop:City"], true),
    row("place", L("المكان", "Place"), i.Sublocation?.join(", ") ?? x["Iptc4xmpCore:Location"], true),
    row("province", L("المحافظة / الولاية", "State / province"), i.Province?.join(", ") ?? x["photoshop:State"], true),
    row("country", L("البلد", "Country"), i.Country?.join(", ") ?? x["photoshop:Country"], true),
  ]);

  const textRows = r.texts.map((tx, k) => row(`text-${k}`, { ar: `نص: ${tx.keyword}`, en: `Text: ${tx.keyword}` }, tx.value, true));
  push("rights", L("الأشخاص والحقوق والوصف", "People, rights & description"), [
    row("artist", L("المصوّر / المؤلف", "Artist / author"), str(t.Artist) ?? str(t.XPAuthor) ?? x["dc:creator"] ?? i.Byline?.join(", "), true),
    row("copyright", L("حقوق النشر", "Copyright"), str(t.Copyright) ?? x["dc:rights"] ?? i.Copyright?.join(", ")),
    row("credit", L("المصدر", "Credit"), i.Credit?.join(", ") ?? x["photoshop:Credit"]),
    row("title", L("العنوان", "Title"), i.ObjectName?.join(", ") ?? i.Headline?.join(", ") ?? x["dc:title"] ?? str(t.XPTitle)),
    row("description", L("الوصف", "Description"), str(t.ImageDescription) ?? i.Caption?.join(", ") ?? x["dc:description"], true),
    row("keywords", L("الكلمات المفتاحية", "Keywords"), i.Keywords?.join(", ") ?? x["dc:subject"] ?? str(t.XPKeywords)),
    row("user-comment", L("تعليق المستخدم", "User comment"), str(t.UserComment) ?? str(t.XPComment), true),
    ...r.comments.map((cm, k) => row(`comment-${k}`, L("تعليق", "Comment"), cm, true)),
    ...textRows,
  ]);
  return groups;
}
