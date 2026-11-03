// Reads the EXIF (TIFF) structure: IFD0, the Exif sub-IFD, the GPS IFD and IFD1
// (thumbnail). Never throws on damaged data: it reads what it can.

import { ascii, concat, text } from "./bytes";

export type ExifValue = string | number | number[];

export type ExifData = {
  /** Tags by name, e.g. { Make: "Canon", FNumber: 2.8 }. */
  tags: Record<string, ExifValue>;
  gps: { latitude: number; longitude: number; altitude?: number } | null;
  /** Size of the embedded JPEG thumbnail (IFD1), if any. */
  thumbnailBytes: number;
  orientation: number | null;
};

const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

const IFD0_TAGS: Record<number, string> = {
  0x010e: "ImageDescription",
  0x010f: "Make",
  0x0110: "Model",
  0x0112: "Orientation",
  0x011a: "XResolution",
  0x011b: "YResolution",
  0x0128: "ResolutionUnit",
  0x0131: "Software",
  0x0132: "DateTime",
  0x013b: "Artist",
  0x8298: "Copyright",
  0x9c9b: "XPTitle",
  0x9c9c: "XPComment",
  0x9c9d: "XPAuthor",
  0x9c9e: "XPKeywords",
};

const EXIF_TAGS: Record<number, string> = {
  0x829a: "ExposureTime",
  0x829d: "FNumber",
  0x8822: "ExposureProgram",
  0x8827: "ISO",
  0x9003: "DateTimeOriginal",
  0x9004: "DateTimeDigitized",
  0x9010: "OffsetTime",
  0x9011: "OffsetTimeOriginal",
  0x9204: "ExposureBias",
  0x9207: "MeteringMode",
  0x9209: "Flash",
  0x920a: "FocalLength",
  0x9286: "UserComment",
  0xa001: "ColorSpace",
  0xa002: "PixelXDimension",
  0xa003: "PixelYDimension",
  0xa403: "WhiteBalance",
  0xa405: "FocalLengthIn35mm",
  0xa420: "ImageUniqueID",
  0xa430: "CameraOwnerName",
  0xa431: "BodySerialNumber",
  0xa432: "LensSpecification",
  0xa433: "LensMake",
  0xa434: "LensModel",
  0xa435: "LensSerialNumber",
};

const GPS_TAGS: Record<number, string> = {
  0x01: "GPSLatitudeRef",
  0x02: "GPSLatitude",
  0x03: "GPSLongitudeRef",
  0x04: "GPSLongitude",
  0x05: "GPSAltitudeRef",
  0x06: "GPSAltitude",
  0x07: "GPSTimeStamp",
  0x10: "GPSImgDirectionRef",
  0x11: "GPSImgDirection",
  0x1d: "GPSDateStamp",
};

/** Parses a TIFF block (the part after "Exif\0\0"). */
export function parseExif(tiff: Uint8Array): ExifData {
  const out: ExifData = { tags: {}, gps: null, thumbnailBytes: 0, orientation: null };
  if (tiff.length < 8) return out;
  const le = tiff[0] === 0x49 && tiff[1] === 0x49;
  const be = tiff[0] === 0x4d && tiff[1] === 0x4d;
  if (!le && !be) return out;
  const v = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const u16 = (o: number) => v.getUint16(o, le);
  const u32 = (o: number) => v.getUint32(o, le);
  if (u16(2) !== 42) return out;
  const seen = new Set<number>();

  const readValue = (type: number, count: number, at: number): ExifValue | undefined => {
    const size = (TYPE_SIZE[type] ?? 0) * count;
    if (!size || at + size > tiff.length) return undefined;
    const many = (fn: (o: number) => number, step: number) => {
      const list: number[] = [];
      for (let i = 0; i < Math.min(count, 64); i++) list.push(fn(at + i * step));
      return list.length === 1 ? list[0] : list;
    };
    switch (type) {
      case 2:
        return text(tiff.subarray(at, at + count));
      case 1:
      case 6:
      case 7:
        return Array.from(tiff.subarray(at, at + Math.min(count, 256)));
      case 3:
        return many(u16, 2);
      case 8:
        return many((o) => v.getInt16(o, le), 2);
      case 4:
        return many(u32, 4);
      case 9:
        return many((o) => v.getInt32(o, le), 4);
      case 5:
        return many((o) => (u32(o + 4) ? u32(o) / u32(o + 4) : 0), 8);
      case 10:
        return many((o) => (v.getInt32(o + 4, le) ? v.getInt32(o, le) / v.getInt32(o + 4, le) : 0), 8);
      default:
        return undefined;
    }
  };

  /** Reads one IFD into `into`; returns the raw tag values by id and the next IFD offset. */
  const readIfd = (offset: number, names: Record<number, string>, into: Record<string, ExifValue>) => {
    const raw = new Map<number, ExifValue>();
    if (offset < 8 || offset + 2 > tiff.length || seen.has(offset)) return { raw, next: 0 };
    seen.add(offset);
    const n = u16(offset);
    for (let i = 0; i < n; i++) {
      const e = offset + 2 + i * 12;
      if (e + 12 > tiff.length) break;
      const tag = u16(e);
      const type = u16(e + 2);
      const count = u32(e + 4);
      const size = (TYPE_SIZE[type] ?? 0) * count;
      const at = size <= 4 ? e + 8 : u32(e + 8);
      const value = readValue(type, count, at);
      if (value === undefined) continue;
      raw.set(tag, value);
      const name = names[tag];
      if (name) into[name] = value;
    }
    const nextAt = offset + 2 + n * 12;
    return { raw, next: nextAt + 4 <= tiff.length ? u32(nextAt) : 0 };
  };

  const ifd0 = readIfd(u32(4), IFD0_TAGS, out.tags);
  const exifPtr = ifd0.raw.get(0x8769);
  if (typeof exifPtr === "number") readIfd(exifPtr, EXIF_TAGS, out.tags);
  const gpsPtr = ifd0.raw.get(0x8825);
  if (typeof gpsPtr === "number") {
    const gps: Record<string, ExifValue> = {};
    readIfd(gpsPtr, GPS_TAGS, gps);
    Object.assign(out.tags, gps);
    const lat = dms(gps.GPSLatitude);
    const lon = dms(gps.GPSLongitude);
    if (lat !== null && lon !== null) {
      out.gps = {
        latitude: gps.GPSLatitudeRef === "S" ? -lat : lat,
        longitude: gps.GPSLongitudeRef === "W" ? -lon : lon,
      };
      if (typeof gps.GPSAltitude === "number") {
        const below = Array.isArray(gps.GPSAltitudeRef) ? gps.GPSAltitudeRef[0] === 1 : gps.GPSAltitudeRef === 1;
        out.gps.altitude = below ? -gps.GPSAltitude : gps.GPSAltitude;
      }
    }
  }
  if (ifd0.next) {
    const ifd1 = readIfd(ifd0.next, {}, {});
    const len = ifd1.raw.get(0x0202);
    if (typeof len === "number") out.thumbnailBytes = len;
  }
  // UNDEFINED-typed text tags: UserComment has an 8-byte charset prefix; XP* tags are UTF-16LE.
  const uc = out.tags.UserComment;
  if (Array.isArray(uc)) {
    const body = Uint8Array.from(uc.slice(8));
    const s = String.fromCharCode(...uc.slice(0, 5)) === "UNICO" ? utf16(body, !le) : text(body);
    if (s) out.tags.UserComment = s;
    else delete out.tags.UserComment;
  }
  for (const key of ["XPTitle", "XPComment", "XPAuthor", "XPKeywords"]) {
    const val = out.tags[key];
    if (Array.isArray(val)) out.tags[key] = utf16(Uint8Array.from(val), false);
  }
  const o = out.tags.Orientation;
  if (typeof o === "number" && o >= 1 && o <= 8) out.orientation = o;
  return out;
}

function utf16(b: Uint8Array, bigEndian: boolean): string {
  let s = "";
  for (let i = 0; i + 1 < b.length; i += 2) {
    const c = bigEndian ? (b[i] << 8) | b[i + 1] : b[i] | (b[i + 1] << 8);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.trim();
}

function dms(v: ExifValue | undefined): number | null {
  if (!Array.isArray(v) || v.length < 3 || v.some((n) => typeof n !== "number" || !Number.isFinite(n))) return null;
  return v[0] + v[1] / 60 + v[2] / 3600;
}

/** A minimal little-endian TIFF block holding only the Orientation tag. */
export function orientationOnlyTiff(orientation: number): Uint8Array {
  return concat([
    ascii("II*\0"),
    Uint8Array.of(8, 0, 0, 0), // IFD0 at offset 8
    Uint8Array.of(1, 0), // one entry
    Uint8Array.of(0x12, 0x01, 3, 0, 1, 0, 0, 0, orientation & 0xff, 0, 0, 0), // Orientation, SHORT, 1 value
    Uint8Array.of(0, 0, 0, 0), // no next IFD
  ]);
}
