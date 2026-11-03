"use client";

import { useCallback, useEffect, useReducer } from "react";

type State<T> = { past: T[]; present: T; future: T[] };
type Action<T> =
  | { type: "set"; value: T; limit: number }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; value: T };

function reducer<T>(state: State<T>, action: Action<T>): State<T> {
  switch (action.type) {
    case "set":
      if (Object.is(action.value, state.present)) return state;
      return { past: [...state.past, state.present].slice(-action.limit), present: action.value, future: [] };
    case "undo":
      if (!state.past.length) return state;
      return { past: state.past.slice(0, -1), present: state.past[state.past.length - 1], future: [state.present, ...state.future] };
    case "redo":
      if (!state.future.length) return state;
      return { past: [...state.past, state.present], present: state.future[0], future: state.future.slice(1) };
    case "reset":
      return { past: [], present: action.value, future: [] };
  }
}

/**
 * Undo/redo for editors. Store immutable snapshots (plain objects/arrays).
 * Ctrl/⌘+Z undoes, Ctrl/⌘+Shift+Z or Ctrl+Y redoes, unless typing in a field.
 */
export function useHistory<T>(initial: T, { limit = 100, keyboard = true } = {}) {
  const [state, dispatch] = useReducer(reducer<T>, { past: [], present: initial, future: [] });

  const set = useCallback((value: T) => dispatch({ type: "set", value, limit }), [limit]);
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  const reset = useCallback((value: T) => dispatch({ type: "reset", value }), []);

  useEffect(() => {
    if (!keyboard) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=true]")) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keyboard, undo, redo]);

  return {
    value: state.present,
    set,
    undo,
    redo,
    reset,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
