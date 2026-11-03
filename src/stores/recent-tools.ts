"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

const MAX_RECENT = 6;

type RecentState = {
  slugs: string[];
  markUsed: (slug: string) => void;
  clear: () => void;
};

/** Recently opened tools, kept only in this browser (no account needed). */
export const useRecentTools = create<RecentState>()(
  persist(
    (set) => ({
      slugs: [],
      markUsed: (slug) => set((s) => ({ slugs: [slug, ...s.slugs.filter((x) => x !== slug)].slice(0, MAX_RECENT) })),
      clear: () => set({ slugs: [] }),
    }),
    { name: "ata-recent-tools", storage: createJSONStorage(() => localStorage), skipHydration: true },
  ),
);
