import { UserFacingError } from "@/lib/engine/types";
import { usePrefs, type Localized } from "@/lib/i18n";

/** Text in the current UI language, for strings built outside React (processors). */
export function localize(text: Localized): string {
  return text[usePrefs.getState().locale] ?? text.en;
}

/** Throws an error whose message is shown to the user as-is, in their language. */
export function userError(text: Localized): never {
  throw new UserFacingError(localize(text));
}

export const MESSAGES = {
  decode: {
    ar: "تعذّرت قراءة الصورة. قد يكون الملف تالفاً أو بصيغة لا يستطيع هذا المتصفح فتحها.",
    en: "Couldn't read this image. The file may be damaged, or in a format this browser can't open.",
  },
  tooLarge: (w: number, h: number): Localized => ({
    ar: `الصورة كبيرة جداً على ذاكرة الرسم في هذا المتصفح (${w}×${h}). جرّب أبعاداً أصغر أو متصفحاً على حاسوب.`,
    en: `This image is too large for this browser's canvas (${w}×${h}). Try smaller dimensions or a desktop browser.`,
  }),
  encode: {
    ar: "تعذّر حفظ الصورة الناتجة. ربما نفدت ذاكرة المتصفح؛ جرّب أبعاداً أصغر.",
    en: "Couldn't save the result. The browser may be out of memory; try smaller dimensions.",
  },
  formatUnsupported: (label: string): Localized => ({
    ar: `هذا المتصفح لا يستطيع حفظ الصور بصيغة ${label}. اختر صيغة أخرى مثل JPG أو PNG.`,
    en: `This browser can't save images as ${label}. Choose another format such as JPG or PNG.`,
  }),
  svgBlocked: {
    ar: "يحتوي ملف SVG على عناصر يمنع المتصفح تحويلها إلى صورة لأسباب أمنية (مثل محتوى HTML مضمّن).",
    en: "This SVG contains content the browser won't rasterise for security reasons (such as embedded HTML).",
  },
} satisfies Record<string, Localized | ((...args: never[]) => Localized)>;
