// Number formatting always uses English (Latin) digits, in both languages.

export function formatNumber(value: number, maxFractionDigits = 0): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: maxFractionDigits }).format(value);
}

const UNITS = ["B", "KB", "MB", "GB", "TB"];

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${formatNumber(value, digits)} ${UNITS[unit]}`;
}

/** Signed percentage change from `before` to `after`; -42.5 means 42.5% smaller. */
export function percentChange(before: number, after: number): number {
  if (before <= 0) return 0;
  return ((after - before) / before) * 100;
}
