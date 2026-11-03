// Output filename helpers. Arabic and other Unicode names are kept as they are;
// only characters that are invalid on common file systems are replaced.

const INVALID = /[\\/:*?"<>|\u0000-\u001f\u007f]/g;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const MAX_BASE_LENGTH = 150;

export function splitExtension(name: string): { base: string; ext: string } {
  const clean = name.trim();
  const dot = clean.lastIndexOf(".");
  if (dot <= 0 || dot === clean.length - 1) return { base: clean, ext: "" };
  return { base: clean.slice(0, dot), ext: clean.slice(dot + 1).toLowerCase() };
}

export function sanitizeBaseName(base: string, fallback = "file"): string {
  let out = base.normalize("NFC").replace(INVALID, "_").replace(/\s+/g, " ").trim();
  out = out.replace(/[. ]+$/g, ""); // Windows forbids trailing dots and spaces
  if (!out || RESERVED.test(out)) out = fallback;
  if (out.length > MAX_BASE_LENGTH) out = Array.from(out).slice(0, MAX_BASE_LENGTH).join("").trim();
  return out;
}

/**
 * Builds an output filename from the original one.
 * buildOutputName("تقرير.pdf", { suffix: "merged" }) → "تقرير-merged.pdf"
 */
export function buildOutputName(
  original: string,
  options: { suffix?: string; ext?: string; index?: number } = {},
): string {
  const { base, ext } = splitExtension(original);
  let name = sanitizeBaseName(base);
  if (options.suffix) name += `-${sanitizeBaseName(options.suffix, "out")}`;
  if (options.index !== undefined) name += `-${options.index}`;
  const finalExt = (options.ext ?? ext).replace(/^\./, "").toLowerCase();
  return finalExt ? `${name}.${finalExt}` : name;
}

/** Applies a user-typed custom name while forcing the required extension. */
export function applyCustomName(custom: string, ext: string, fallback: string): string {
  const { base, ext: typedExt } = splitExtension(custom);
  const keep = typedExt === ext.toLowerCase() ? base : custom;
  const safe = sanitizeBaseName(keep, "");
  return safe ? `${safe}.${ext}` : fallback;
}

/** Makes every name in a list unique (required inside ZIP archives). */
export function dedupeNames(names: string[]): string[] {
  const seen = new Set<string>();
  return names.map((name) => {
    if (!seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      return name;
    }
    const { base, ext } = splitExtension(name);
    let n = 2;
    let candidate = "";
    do {
      candidate = ext ? `${base} (${n}).${ext}` : `${base} (${n})`;
      n++;
    } while (seen.has(candidate.toLowerCase()));
    seen.add(candidate.toLowerCase());
    return candidate;
  });
}
