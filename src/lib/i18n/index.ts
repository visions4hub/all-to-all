"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Locale, Localized } from "@/lib/tools/types";

export type { Locale, Localized };

export const DEFAULT_LOCALE: Locale = "ar";

type PrefsState = {
  locale: Locale;
  theme: "light" | "dark" | "system";
  setLocale: (locale: Locale) => void;
  setTheme: (theme: "light" | "dark" | "system") => void;
};

/** Browser-only preferences. Stored in localStorage under "ata-prefs". */
export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      locale: DEFAULT_LOCALE,
      theme: "system",
      setLocale: (locale) => set({ locale }),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: "ata-prefs",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
    },
  ),
);

export function useLocale(): Locale {
  return usePrefs((s) => s.locale);
}

/**
 * Text is written next to where it is used as { ar, en } pairs:
 *   const t = useT();  t({ ar: "دمج", en: "Merge" })
 * This keeps each feature's strings in its own files, so parallel work
 * on different tools never edits a shared dictionary.
 */
export function useT() {
  const locale = useLocale();
  return (text: Localized) => text[locale];
}

export function dirFor(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}
