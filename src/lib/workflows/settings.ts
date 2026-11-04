// Step settings: merging saved/imported/preset values onto a tool's defaults,
// and turning binary values (logo files, image bytes) into JSON and back.

export const MAX_DEPTH = 12;
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function isForbiddenKey(key: string) {
  return FORBIDDEN_KEYS.has(key);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== "object") return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

const isBinary = (v: unknown): v is Blob | Uint8Array => v instanceof Uint8Array || (typeof Blob !== "undefined" && v instanceof Blob);

/** Copies a value made only of primitives, arrays, plain objects and binaries; anything else becomes null. */
function cleanFree(raw: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return null;
  if (raw === null || typeof raw === "string" || typeof raw === "boolean") return raw;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (isBinary(raw)) return raw;
  if (Array.isArray(raw)) return raw.map((v) => cleanFree(v, depth + 1));
  if (isPlainObject(raw)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(raw)) if (!isForbiddenKey(key)) out[key] = cleanFree(raw[key], depth + 1);
    return out;
  }
  return null;
}

export type SanitizeReport = { reset: string[] };

/**
 * Returns the tool's defaults with every valid value from `raw` applied.
 * Only keys the defaults know are kept, each must have the default's type,
 * and anything wrong is reset to the default (listed in `report.reset`).
 * A `null` default accepts any clean value (numbers left empty, optional files…).
 */
export function sanitizeSettings<S>(defaults: S, raw: unknown, report: SanitizeReport = { reset: [] }, path = ""): S {
  return walk(defaults, raw, report, path, 0) as S;
}

function walk(def: unknown, raw: unknown, report: SanitizeReport, path: string, depth: number): unknown {
  if (raw === undefined) return def;
  const reset = () => {
    report.reset.push(path || "(root)");
    return def;
  };
  if (depth > MAX_DEPTH) return reset();
  if (def === null) return cleanFree(raw, depth);
  if (typeof def === "number") return typeof raw === "number" && Number.isFinite(raw) ? raw : reset();
  if (typeof def === "string") return typeof raw === "string" ? raw : reset();
  if (typeof def === "boolean") return typeof raw === "boolean" ? raw : reset();
  if (def instanceof Uint8Array) return raw instanceof Uint8Array ? raw : reset();
  if (typeof Blob !== "undefined" && def instanceof Blob) return raw instanceof Blob ? raw : reset();
  if (Array.isArray(def)) {
    if (!Array.isArray(raw)) return reset();
    return raw.map((item, i) => (def.length ? walk(def[0], item, report, `${path}[${i}]`, depth + 1) : cleanFree(item, depth + 1)));
  }
  if (isPlainObject(def)) {
    if (!isPlainObject(raw)) return reset();
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(def)) out[key] = walk(def[key], raw[key], report, path ? `${path}.${key}` : key, depth + 1);
    return out;
  }
  return def;
}

// ---- JSON encoding of binary values -------------------------------------------

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

function fromBase64(text: string): Uint8Array {
  if (text.length % 4 !== 0 || !BASE64.test(text)) throw new Error("bad base64");
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Settings → JSON-safe value. Uint8Array → {"$bytes"}, File/Blob → {"$file"}. Non-data values become null. */
export async function encodeSettings(value: unknown, depth = 0): Promise<unknown> {
  if (depth > MAX_DEPTH) return null;
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Uint8Array) return { $bytes: toBase64(value) };
  if (typeof Blob !== "undefined" && value instanceof Blob) {
    const bytes = new Uint8Array(await value.arrayBuffer());
    const name = typeof File !== "undefined" && value instanceof File ? value.name : "";
    return { $file: { name, type: value.type, data: toBase64(bytes) } };
  }
  if (Array.isArray(value)) return Promise.all(value.map((v) => encodeSettings(v, depth + 1)));
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value)) if (!isForbiddenKey(key)) out[key] = await encodeSettings(value[key], depth + 1);
    return out;
  }
  return null;
}

export class SettingsDecodeError extends Error {}

/** JSON value → settings value, decoding the binary markers. Throws SettingsDecodeError on bad input. */
export function decodeSettings(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) throw new SettingsDecodeError("too deep");
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new SettingsDecodeError("bad number");
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => decodeSettings(v, depth + 1));
  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    for (const key of keys) if (isForbiddenKey(key)) throw new SettingsDecodeError(`forbidden key ${key}`);
    if (keys.length === 1 && keys[0] === "$bytes") {
      if (typeof value.$bytes !== "string") throw new SettingsDecodeError("bad bytes");
      try {
        return fromBase64(value.$bytes);
      } catch {
        throw new SettingsDecodeError("bad bytes");
      }
    }
    if (keys.length === 1 && keys[0] === "$file") {
      const f = value.$file;
      if (!isPlainObject(f) || typeof f.data !== "string" || typeof f.name !== "string" || typeof f.type !== "string") {
        throw new SettingsDecodeError("bad file");
      }
      if (f.type && !/^[\w.+-]+\/[\w.+-]+$/.test(f.type)) throw new SettingsDecodeError("bad file type");
      let bytes: Uint8Array;
      try {
        bytes = fromBase64(f.data);
      } catch {
        throw new SettingsDecodeError("bad file");
      }
      const name = f.name.replace(/[\\/\u0000-\u001f]/g, "").slice(0, 200);
      return new File([bytes as Uint8Array<ArrayBuffer>], name || "file", { type: f.type });
    }
    const out: Record<string, unknown> = {};
    for (const key of keys) out[key] = decodeSettings(value[key], depth + 1);
    return out;
  }
  throw new SettingsDecodeError("unsupported value");
}
