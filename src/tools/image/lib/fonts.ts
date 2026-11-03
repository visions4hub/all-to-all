"use client";

import type { Localized } from "@/lib/i18n";

// Fonts for text drawn on images. The first two are the site's self-hosted
// fonts (Arabic + Latin); the others are common system fonts with fallbacks.

export type FontKey = "plex" | "readex" | "tahoma" | "naskh" | "serif" | "mono" | "impact";

export const FONTS: { key: FontKey; label: Localized }[] = [
  { key: "plex", label: { ar: "بلكس عربي", en: "IBM Plex Sans Arabic" } },
  { key: "readex", label: { ar: "ريدكس برو", en: "Readex Pro" } },
  { key: "tahoma", label: { ar: "تاهوما (النظام)", en: "Tahoma (system)" } },
  { key: "naskh", label: { ar: "نسخ (النظام)", en: "Naskh / serif (system)" } },
  { key: "serif", label: { ar: "تايمز (النظام)", en: "Times (system)" } },
  { key: "mono", label: { ar: "أحادي المسافة", en: "Monospace" } },
  { key: "impact", label: { ar: "إمباكت (للميمز)", en: "Impact (memes)" } },
];

function cssVar(name: string): string {
  if (typeof document === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** CSS font-family list for a font key. */
export function fontFamily(key: FontKey): string {
  switch (key) {
    case "plex":
      return `${cssVar("--font-body") || "'IBM Plex Sans Arabic'"}, Tahoma, sans-serif`;
    case "readex":
      return `${cssVar("--font-display") || "'Readex Pro'"}, Tahoma, sans-serif`;
    case "tahoma":
      return "Tahoma, 'Segoe UI', Arial, sans-serif";
    case "naskh":
      return "'Noto Naskh Arabic', 'Traditional Arabic', 'Times New Roman', serif";
    case "serif":
      return "'Times New Roman', Times, serif";
    case "mono":
      return "ui-monospace, Menlo, Consolas, monospace";
    case "impact":
      return `Impact, 'Arial Black', ${cssVar("--font-display") || "sans-serif"}, sans-serif`;
  }
}

export function cssFont(key: FontKey, sizePx: number, bold: boolean, italic = false): string {
  return `${italic ? "italic " : ""}${bold ? 700 : 400} ${Math.max(1, Math.round(sizePx))}px ${fontFamily(key)}`;
}

/** Waits until the glyphs for `text` are loaded, so the first render isn't drawn in a fallback font. */
export async function ensureFont(font: string, text: string): Promise<void> {
  if (typeof document === "undefined" || !document.fonts?.load) return;
  try {
    await document.fonts.load(font, text || "a");
  } catch {
    // An unknown system font just falls back; drawing still works.
  }
}
