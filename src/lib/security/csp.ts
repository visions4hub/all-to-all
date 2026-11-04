import headers from "./headers.json";

type Directives = Record<string, string[]>;

export function serializeCsp(directives: Directives): string {
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

// `next dev` only: React's development build uses eval() to rebuild error stack traces.
// Production builds never use eval, so the shipped policy stays without it.
const devCsp: Directives =
  process.env.NODE_ENV === "development"
    ? { ...headers.csp, "script-src": [...headers.csp["script-src"], "'unsafe-eval'"] }
    : headers.csp;

/** CSP for the <meta> tag. frame-ancestors is ignored in <meta>, so it is header-only. */
export const META_CSP = serializeCsp(devCsp);

/** Full CSP for HTTP headers. */
export const HEADER_CSP = serializeCsp({ ...headers.csp, ...headers.cspHeaderOnly });
