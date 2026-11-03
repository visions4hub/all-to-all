"use client";

import { useEffect } from "react";
import { Direction } from "radix-ui";
import { TooltipProvider } from "@/components/ui/tooltip";
import { dirFor, usePrefs } from "@/lib/i18n";
import { useRecentTools } from "@/stores/recent-tools";

/** Loads saved preferences and keeps <html lang/dir/class> in sync with them. */
export function AppProviders({ children }: { children: React.ReactNode }) {
  const locale = usePrefs((s) => s.locale);
  const theme = usePrefs((s) => s.theme);

  useEffect(() => {
    void usePrefs.persist.rehydrate();
    void useRecentTools.persist.rehydrate();
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    html.lang = locale;
    html.dir = dirFor(locale);
  }, [locale]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && media.matches);
      document.documentElement.classList.toggle("dark", dark);
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);

  return (
    <Direction.Provider dir={dirFor(locale)}>
      <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
    </Direction.Provider>
  );
}
