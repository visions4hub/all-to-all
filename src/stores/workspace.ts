"use client";

import { create } from "zustand";
import { BROWSER_DECODABLE, detectFileKind } from "@/lib/files/detect";
import type { WorkspaceFile } from "@/lib/engine/types";

// Files the user added. Held in memory only (never uploaded, never persisted),
// and shared across pages so a file picked on the homepage is still there
// when the user opens a tool.

let counter = 0;
const newId = () => `f${Date.now().toString(36)}${(counter++).toString(36)}`;

export type SortKey = "name" | "size" | "type";

type WorkspaceState = {
  files: WorkspaceFile[];
  addFiles: (files: File[] | FileList) => Promise<WorkspaceFile[]>;
  update: (id: string, patch: Partial<WorkspaceFile>) => void;
  remove: (id: string) => void;
  clear: () => void;
  move: (from: number, to: number) => void;
  sortBy: (key: SortKey) => void;
};

function release(file: WorkspaceFile) {
  if (file.previewUrl) URL.revokeObjectURL(file.previewUrl);
  if (file.thumbUrl) URL.revokeObjectURL(file.thumbUrl);
}

export const useWorkspace = create<WorkspaceState>()((set, get) => ({
  files: [],

  addFiles: async (input) => {
    const list = Array.from(input);
    const added = await Promise.all(
      list.map(async (file): Promise<WorkspaceFile> => {
        const kind = await detectFileKind(file);
        return {
          id: newId(),
          file,
          name: file.name || "pasted-image",
          size: file.size,
          kind,
          // Images preview straight from the file; PDFs get a rendered thumbnail later.
          previewUrl: BROWSER_DECODABLE.includes(kind) ? URL.createObjectURL(file) : undefined,
        };
      }),
    );
    set((s) => ({ files: [...s.files, ...added] }));
    return added;
  },

  update: (id, patch) =>
    set((s) => ({
      files: s.files.map((f) => {
        if (f.id !== id) return f;
        if (patch.previewUrl && f.previewUrl && patch.previewUrl !== f.previewUrl) URL.revokeObjectURL(f.previewUrl);
        if (patch.thumbUrl && f.thumbUrl && patch.thumbUrl !== f.thumbUrl) URL.revokeObjectURL(f.thumbUrl);
        return { ...f, ...patch };
      }),
    })),

  remove: (id) => {
    const target = get().files.find((f) => f.id === id);
    if (target) release(target);
    set((s) => ({ files: s.files.filter((f) => f.id !== id) }));
  },

  clear: () => {
    get().files.forEach(release);
    set({ files: [] });
  },

  move: (from, to) =>
    set((s) => {
      if (from === to || from < 0 || to < 0 || from >= s.files.length || to >= s.files.length) return s;
      const files = [...s.files];
      const [item] = files.splice(from, 1);
      files.splice(to, 0, item);
      return { files };
    }),

  sortBy: (key) =>
    set((s) => {
      const collator = new Intl.Collator(["ar", "en"], { numeric: true, sensitivity: "base" });
      const files = [...s.files].sort((a, b) =>
        key === "size" ? a.size - b.size : key === "type" ? a.kind.localeCompare(b.kind) || collator.compare(a.name, b.name) : collator.compare(a.name, b.name),
      );
      return { files };
    }),
}));
