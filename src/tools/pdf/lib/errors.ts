import { UserFacingError } from "@/lib/engine/types";
import { usePrefs, type Localized } from "@/lib/i18n";

/** The current UI language, readable outside React (processors run outside components). */
export function currentLocale(): "ar" | "en" {
  try {
    return usePrefs.getState().locale;
  } catch {
    return "ar";
  }
}

/** A problem the user can act on, in the current UI language. */
export function userError(message: Localized): UserFacingError {
  return new UserFacingError(message[currentLocale()]);
}

export const PDF_ERRORS = {
  encrypted: {
    ar: "هذا الملف محمي بكلمة مرور أو مشفّر. أزل الحماية أولاً ثم أعد المحاولة؛ لا يمكن تعديل ملف مشفّر دون إفساده.",
    en: "This PDF is password-protected or encrypted. Remove the protection first, then try again; an encrypted file can't be changed without breaking it.",
  },
  damaged: {
    ar: "تعذّرت قراءة هذا الملف. قد يكون تالفاً أو ليس ملف PDF.",
    en: "This file couldn't be read. It may be damaged or not a PDF.",
  },
  empty: { ar: "هذا الملف لا يحتوي على صفحات.", en: "This PDF has no pages." },
  noPages: { ar: "لم تُحدَّد أي صفحة.", en: "No pages were selected." },
} satisfies Record<string, Localized>;
