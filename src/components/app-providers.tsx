"use client";

import { useEffect } from "react";
import { Direction } from "radix-ui";
import { TooltipProvider } from "@/components/ui/tooltip";
import { dirFor, usePrefs } from "@/lib/i18n";
import { useRecentTools } from "@/stores/recent-tools";

/** Loads saved preferences and keeps <html lang/dir> in sync with them. The site is dark only. */
export function AppProviders({ children }: { children: React.ReactNode }) {
  const locale = usePrefs((s) => s.locale);

  useEffect(() => {
    void usePrefs.persist.rehydrate();
    void useRecentTools.persist.rehydrate();
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    html.lang = locale;
    html.dir = dirFor(locale);
  }, [locale]);

  return (
    <Direction.Provider dir={dirFor(locale)}>
      <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
    </Direction.Provider>
  );
}
