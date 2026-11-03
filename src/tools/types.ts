import type { ComponentType } from "react";
import type { ProcessMode, Processor, WorkspaceFile } from "@/lib/engine/types";
import type { Localized } from "@/lib/i18n";
import type { ToolDefinition } from "@/lib/tools/types";

export type SettingsProps<S> = {
  settings: S;
  onChange: (next: S) => void;
  /** Files currently accepted by the tool, in the user's order. */
  files: WorkspaceFile[];
  /** The file shown in the preview. */
  activeFile?: WorkspaceFile;
  disabled: boolean;
};

export type PreviewProps<S> = {
  settings: S;
  onChange: (next: S) => void;
  file: WorkspaceFile;
  files: WorkspaceFile[];
};

/**
 * What a tool provides to the universal workspace (src/components/workspace/tool-workspace.tsx).
 *
 * Simple tools give `Settings` + `process`; the workspace supplies file handling,
 * preview, progress, cancel, results, downloads and ZIP.
 * Tools with their own editor surface (photo editor, edit/sign PDF, organize)
 * may also give `Preview` to replace the default preview area, or `Workspace`
 * to replace the whole layout.
 */
export type ToolModule<S = unknown> = {
  mode: ProcessMode;
  defaultSettings: S;
  Settings?: ComponentType<SettingsProps<S>>;
  Preview?: ComponentType<PreviewProps<S>>;
  Workspace?: ComponentType<{ tool: ToolDefinition }>;
  process: Processor<S>;
  /** Returns a message when the current files/settings can't be processed yet. */
  validate?: (files: WorkspaceFile[], settings: S) => Localized | null;
  /** Label for the main action, e.g. { ar: "دمج", en: "Merge" }. */
  actionLabel: Localized;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loaders return modules with different settings types
export type ToolModuleLoader = () => Promise<{ default: ToolModule<any> }>;
