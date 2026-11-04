import headers from "./headers.json";

type Directives = Record<string, string[]>;

export function serializeCsp(directives: Directives): string {
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

/** CSP for the <meta> tag. frame-ancestors is ignored in <meta>, so it is header-only. */
export const META_CSP = serializeCsp(headers.csp);

/** Full CSP for HTTP headers. */
export const HEADER_CSP = serializeCsp({ ...headers.csp, ...headers.cspHeaderOnly });
