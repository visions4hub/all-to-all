import { getToolLoader } from "@/tools/load";
import type { ToolModule } from "@/tools/types";

// Tool modules are loaded only when a step uses them, and loaded once.

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- modules have different settings types
type AnyModule = ToolModule<any>;
const cache = new Map<string, Promise<AnyModule>>();

export function loadToolModule(slug: string): Promise<AnyModule> {
  let p = cache.get(slug);
  if (!p) {
    const loader = getToolLoader(slug);
    if (!loader) return Promise.reject(new Error(`No module for ${slug}`));
    p = loader().then((m) => m.default);
    p.catch(() => cache.delete(slug));
    cache.set(slug, p);
  }
  return p;
}
