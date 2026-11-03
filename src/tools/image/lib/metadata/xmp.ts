// Reads a few well-known XMP properties for display. XMP is XML; a small
// pattern reader is enough for showing values (it never executes anything).

const FIELDS = [
  "xmp:CreatorTool",
  "xmp:CreateDate",
  "xmp:ModifyDate",
  "dc:creator",
  "dc:title",
  "dc:description",
  "dc:rights",
  "dc:subject",
  "photoshop:City",
  "photoshop:State",
  "photoshop:Country",
  "photoshop:Credit",
  "photoshop:DateCreated",
  "Iptc4xmpCore:Location",
  "tiff:Make",
  "tiff:Model",
  "aux:Lens",
  "exifEX:LensModel",
  "exif:GPSLatitude",
  "exif:GPSLongitude",
  "exif:DateTimeOriginal",
  "xmpRights:Owner",
] as const;

const decodeEntities = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function parseXmp(xml: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of FIELDS) {
    const n = escapeRe(name);
    // Attribute form: <rdf:Description exif:GPSLatitude="34,30.5N" …>
    const attr = new RegExp(`[\\s<]${n}\\s*=\\s*"([^"]*)"`).exec(xml) ?? new RegExp(`[\\s<]${n}\\s*=\\s*'([^']*)'`).exec(xml);
    if (attr) {
      out[name] = decodeEntities(attr[1]).trim();
      continue;
    }
    // Element form, possibly with rdf:Alt / rdf:Seq / rdf:Bag lists inside.
    const el = new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`).exec(xml);
    if (!el) continue;
    const inner = el[1];
    const items = [...inner.matchAll(/<rdf:li(?:\s[^>]*)?>([\s\S]*?)<\/rdf:li>/g)].map((m) => decodeEntities(m[1]).trim()).filter(Boolean);
    const value = items.length ? items.join(", ") : decodeEntities(inner.replace(/<[^>]+>/g, "")).trim();
    if (value) out[name] = value;
  }
  return out;
}
