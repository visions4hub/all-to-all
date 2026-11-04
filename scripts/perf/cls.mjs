// Dev-time: cumulative layout shift during load, per page and language, on a
// phone-sized viewport with 4× CPU slowdown. Usage: node scripts/perf/cls.mjs <baseUrl>
import { chromium } from "@playwright/test";
const base = process.argv[2] || "http://localhost:4302";
const PAGES = ["/", "/tools/", "/tools/merge-pdf/", "/tools/compress-image/", "/workflows/", "/help/"];
const browser = await chromium.launch();
for (const locale of ["ar", "en"]) {
  for (const path of PAGES) {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript((l) => {
      localStorage.setItem("ata-prefs", JSON.stringify({ state: { locale: l, theme: "light" }, version: 0 }));
      window.__cls = 0;
      window.__shifts = [];
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (e.hadRecentInput) continue;
          window.__cls += e.value;
          window.__shifts.push([Math.round(e.startTime), +e.value.toFixed(4), (e.sources || []).map((s) => s.node?.nodeName + "." + String(s.node?.className || "").slice(0, 40)).join(",")]);
        }
      }).observe({ type: "layout-shift", buffered: true });
    }, locale);
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.goto(base + path, { waitUntil: "load" });
    await page.waitForTimeout(2500);
    const { cls, shifts } = await page.evaluate(() => ({ cls: window.__cls, shifts: window.__shifts }));
    console.log(locale, path.padEnd(24), "CLS", cls.toFixed(4), shifts.length ? JSON.stringify(shifts.slice(0, 3)) : "");
    await ctx.close();
  }
}
await browser.close();
