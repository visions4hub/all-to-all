// Dev-time runtime profile with large inputs, against a served static build.
// Records, per scenario: wall time, main-thread long tasks (> 50 ms) and
// freezes (> 200 ms), JS heap, the browser's whole-process memory (Windows),
// object URLs and Web Workers still alive after leaving the tool.
//
//   node scripts/perf/runtime.mjs <baseUrl> <fixturesDir> [out.json] [scenario...]
//
// Fixtures (a 150-page PDF, 30 × 12 MP JPEGs, 60 GIF frames) are generated
// into fixturesDir on first run; nothing binary is committed.
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { chromium } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const run = promisify(execFile);
const [base = "http://localhost:4301", fixtures = "perf-fixtures", outFile, ...only] = process.argv.slice(2);
mkdirSync(fixtures, { recursive: true });

// ---- instrumentation injected before any page script ----------------------
const INSTRUMENT = () => {
  const p = (window.__perf = { long: [], urls: new Set(), created: 0, workers: 0, alive: 0, gaps: [] });
  try {
    new PerformanceObserver((l) => l.getEntries().forEach((e) => p.long.push(Math.round(e.duration)))).observe({ type: "longtask", buffered: true });
  } catch {}
  const create = URL.createObjectURL.bind(URL);
  const revoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (o) => {
    const u = create(o);
    p.urls.add(u);
    p.created++;
    return u;
  };
  URL.revokeObjectURL = (u) => {
    p.urls.delete(u);
    revoke(u);
  };
  const W = window.Worker;
  window.Worker = class extends W {
    constructor(...a) {
      super(...a);
      p.workers++;
      p.alive++;
    }
    terminate() {
      if (!this.__t) p.alive--;
      this.__t = true;
      super.terminate();
    }
  };
  // Frame gaps catch freezes that aren't reported as one long task.
  let last = performance.now();
  const tick = (t) => {
    if (t - last > 200) p.gaps.push(Math.round(t - last));
    last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

async function treeMemory(pid) {
  // Private bytes of the browser and all its child processes (renderer, GPU, utility).
  const ps = `$all=Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,PrivatePageCount;$ids=@(${pid});$i=0;while($i -lt $ids.Count){$all|?{$_.ParentProcessId -eq $ids[$i]}|%{$ids+=$_.ProcessId};$i++};($all|?{$ids -contains $_.ProcessId}|Measure-Object PrivatePageCount -Sum).Sum`;
  try {
    const { stdout } = await run("powershell.exe", ["-NoProfile", "-Command", ps]);
    return Number(stdout.trim()) || 0;
  } catch {
    return 0;
  }
}

function sampler(pid) {
  let peak = 0;
  let stop = false;
  const loop = (async () => {
    while (!stop) {
      peak = Math.max(peak, await treeMemory(pid));
      await new Promise((r) => setTimeout(r, 500));
    }
  })();
  return async () => {
    stop = true;
    await loop;
    return peak;
  };
}

// ---- fixtures ---------------------------------------------------------------
async function makeFixtures(page) {
  const jpgDir = join(fixtures, "jpg");
  const gifDir = join(fixtures, "gif");
  mkdirSync(jpgDir, { recursive: true });
  mkdirSync(gifDir, { recursive: true });
  const draw = async (w, h, seed, q) =>
    Buffer.from(
      await page.evaluate(
        async ({ w, h, seed, q }) => {
          const c = new OffscreenCanvas(w, h);
          const x = c.getContext("2d");
          const g = x.createLinearGradient(0, 0, w, h);
          g.addColorStop(0, `hsl(${seed * 37} 70% 55%)`);
          g.addColorStop(1, `hsl(${seed * 37 + 140} 60% 35%)`);
          x.fillStyle = g;
          x.fillRect(0, 0, w, h);
          for (let i = 0; i < 40; i++) {
            x.fillStyle = `hsla(${(seed * 53 + i * 29) % 360} 80% 60% / .5)`;
            x.beginPath();
            x.arc(((i * 97 + seed * 13) % 100) / 100 * w, ((i * 61 + seed * 7) % 100) / 100 * h, (w / 12) * (1 + (i % 4)), 0, 7);
            x.fill();
          }
          const img = x.getImageData(0, 0, w, h);
          let s = seed * 9973 + 1;
          for (let i = 0; i < img.data.length; i += 4) {
            s = (s * 1103515245 + 12345) & 0x7fffffff;
            const n = (s % 41) - 20;
            img.data[i] += n;
            img.data[i + 1] += n;
            img.data[i + 2] += n;
          }
          x.putImageData(img, 0, 0);
          const blob = await c.convertToBlob({ type: "image/jpeg", quality: q });
          const url = await new Promise((r) => {
            const fr = new FileReader();
            fr.onload = () => r(fr.result);
            fr.readAsDataURL(blob);
          });
          return url.slice(url.indexOf(",") + 1);
        },
        { w, h, seed, q },
      ),
      "base64",
    );
  if (readdirSync(jpgDir).length < 30) {
    for (let i = 1; i <= 30; i++) writeFileSync(join(jpgDir, `photo-${String(i).padStart(2, "0")}.jpg`), await draw(4000, 3000, i, 0.92));
  }
  if (readdirSync(gifDir).length < 60) {
    for (let i = 1; i <= 60; i++) writeFileSync(join(gifDir, `frame-${String(i).padStart(2, "0")}.jpg`), await draw(1280, 960, i + 100, 0.85));
  }
  const pdfPath = join(fixtures, "book-150.pdf");
  if (!existsSync(pdfPath)) {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const photo = await doc.embedJpg(await draw(1600, 1200, 7, 0.85));
    for (let n = 1; n <= 150; n++) {
      const p = doc.addPage([595.28, 841.89]);
      p.drawText(`Chapter ${Math.ceil(n / 10)} — page ${n}`, { x: 50, y: 790, size: 20, font: bold });
      if (n % 3 === 0) p.drawImage(photo, { x: 50, y: 470, width: 495, height: 300 });
      for (let l = 0; l < (n % 3 === 0 ? 22 : 44); l++) {
        p.drawText(`Line ${l + 1}: the quick brown fox jumps over the lazy dog, page ${n}, 0123456789.`, { x: 50, y: (n % 3 === 0 ? 440 : 760) - l * 16, size: 10, font });
      }
      for (let r = 0; r < 12; r++) p.drawRectangle({ x: 50 + r * 40, y: 40, width: 30, height: 20 + ((n + r) % 7) * 6, color: rgb((r % 3) / 3, 0.4, 0.7) });
    }
    writeFileSync(pdfPath, await doc.save());
  }
  return {
    jpgs: readdirSync(jpgDir).sort().map((f) => join(jpgDir, f)),
    frames: readdirSync(gifDir).sort().map((f) => join(gifDir, f)),
    pdf: pdfPath,
  };
}

// ---- helpers -----------------------------------------------------------------
async function openPage(browser, path) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
  await context.addInitScript(() => localStorage.setItem("ata-prefs", JSON.stringify({ state: { locale: "en", theme: "light" }, version: 0 })));
  await context.addInitScript(INSTRUMENT);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  await page.goto(base + path);
  return { context, page, cdp };
}

async function heapMB(cdp, gc = false) {
  if (gc) {
    await cdp.send("HeapProfiler.collectGarbage");
    await new Promise((r) => setTimeout(r, 300));
  }
  const { metrics } = await cdp.send("Performance.getMetrics");
  return +(metrics.find((m) => m.name === "JSHeapUsedSize").value / 1048576).toFixed(1);
}

async function snapshot(page) {
  return page.evaluate(() => {
    const p = window.__perf;
    const long = p.long;
    return {
      longTasks: long.length,
      longest: Math.max(0, ...long),
      longTotal: long.reduce((a, b) => a + b, 0),
      over200: long.filter((d) => d > 200).length,
      frameGapsOver200: p.gaps.length,
      maxFrameGap: Math.max(0, ...p.gaps),
      liveUrls: p.urls.size,
      urlsCreated: p.created,
      workersCreated: p.workers,
      workersAlive: p.alive,
      domNodes: document.getElementsByTagName("*").length,
    };
  });
}

const resetCounters = (page) => page.evaluate(() => ((window.__perf.long = []), (window.__perf.gaps = [])));
const runButton = (page, name) => page.getByRole("button", { name, exact: true }).locator("visible=true").first();
const resultsHeading = (page) => page.getByRole("heading", { name: /Your files are ready|Processing failed/ });
const loadedImages = (page, scope = "main") => page.evaluate((s) => [...document.querySelectorAll(`${s} img`)].filter((i) => i.complete && i.naturalWidth > 0).length, scope);

/** Client-side navigation away from the tool, then wait out delayed cleanups. */
async function leave(page) {
  await page.locator('header a[href="/tools/"]').first().click();
  await page.waitForURL(/\/tools\/$/);
  await page.waitForTimeout(5500);
}

// ---- scenarios -------------------------------------------------------------------
const SCENARIOS = {
  async "organize-150"(browser, fx, pid) {
    const { page, cdp, context } = await openPage(browser, "/tools/organize-pdf/");
    await page.locator('input[type="file"]').first().waitFor({ state: "attached" });
    const stopMem = sampler(pid);
    const t0 = Date.now();
    await page.locator('input[type="file"]').first().setInputFiles(fx.pdf);
    await page.waitForFunction(() => document.querySelectorAll("main [data-page] img, main li img").length >= 12, null, { timeout: 120000 });
    const firstThumbs = Date.now() - t0;
    // Scroll through every page so all thumbnails render.
    for (let i = 0; i < 60; i++) {
      await page.mouse.wheel(0, 900);
      await page.waitForTimeout(150);
    }
    await page.waitForFunction(() => [...document.querySelectorAll("main img")].filter((i) => i.complete && i.naturalWidth).length >= 150, null, { timeout: 180000 }).catch(() => {});
    const allThumbs = Date.now() - t0;
    const during = await snapshot(page);
    const heap = await heapMB(cdp);
    await leave(page);
    const after = await snapshot(page);
    const r = { firstThumbsMs: firstThumbs, allThumbsMs: allThumbs, thumbs: await loadedImages(page), ...during, heapMB: heap, peakMemMB: Math.round((await stopMem()) / 1048576), afterLeave: { liveUrls: after.liveUrls, workersAlive: after.workersAlive, heapMB: await heapMB(cdp, true) } };
    await context.close();
    return r;
  },

  async "merge-3x150"(browser, fx, pid) {
    const { page, cdp, context } = await openPage(browser, "/tools/merge-pdf/");
    await page.locator('input[type="file"]').first().waitFor({ state: "attached" });
    const bytes = readFileSync(fx.pdf);
    await page.locator('input[type="file"]').first().setInputFiles([1, 2, 3].map((i) => ({ name: `book-${i}.pdf`, mimeType: "application/pdf", buffer: bytes })));
    await page.waitForTimeout(3000);
    await resetCounters(page);
    const stopMem = sampler(pid);
    const t0 = Date.now();
    await runButton(page, "Merge files").click();
    await resultsHeading(page).waitFor({ timeout: 180000 });
    const runMs = Date.now() - t0;
    const during = await snapshot(page);
    const r = { runMs, ...during, heapMB: await heapMB(cdp), peakMemMB: Math.round((await stopMem()) / 1048576) };
    await leave(page);
    const after = await snapshot(page);
    r.afterLeave = { liveUrls: after.liveUrls, workersAlive: after.workersAlive, heapMB: await heapMB(cdp, true) };
    await context.close();
    return r;
  },

  async "pdf-to-image-150"(browser, fx, pid) {
    const { page, cdp, context } = await openPage(browser, "/tools/pdf-to-image/");
    await page.locator('input[type="file"]').first().waitFor({ state: "attached" });
    await page.locator('input[type="file"]').first().setInputFiles(fx.pdf);
    await page.waitForTimeout(2500);
    await resetCounters(page);
    const stopMem = sampler(pid);
    const t0 = Date.now();
    await runButton(page, "Convert to images").click();
    await resultsHeading(page).waitFor({ timeout: 300000 });
    const runMs = Date.now() - t0;
    await page.waitForTimeout(1500);
    const during = await snapshot(page);
    const r = { runMs, resultImagesLoaded: await loadedImages(page, "section[aria-live=polite]"), ...during, heapMB: await heapMB(cdp), peakMemMB: Math.round((await stopMem()) / 1048576) };
    await leave(page);
    const after = await snapshot(page);
    r.afterLeave = { liveUrls: after.liveUrls, workersAlive: after.workersAlive, heapMB: await heapMB(cdp, true), memMB: Math.round((await treeMemory(pid)) / 1048576) };
    await context.close();
    return r;
  },

  async "compress-30x12mp"(browser, fx, pid) {
    const { page, cdp, context } = await openPage(browser, "/tools/compress-image/");
    await page.locator('input[type="file"]').first().waitFor({ state: "attached" });
    const stopAdd = sampler(pid);
    const t0 = Date.now();
    await page.locator('input[type="file"]').first().setInputFiles(fx.jpgs);
    await page.getByText("30 files").first().waitFor();
    const listed = Date.now();
    // The list shows about 8 rows; wait until they all have their picture.
    await page.waitForFunction(() => [...document.querySelectorAll("aside li img")].filter((i) => i.complete && i.naturalWidth).length >= 8, null, { timeout: 120000 });
    const thumbsMs = Date.now() - listed;
    await page.waitForTimeout(4000);
    const add = { addMs: listed - t0, visibleThumbsMs: thumbsMs, ...(await snapshot(page)), peakMemMB: Math.round((await stopAdd()) / 1048576) };
    await resetCounters(page);
    const stopMem = sampler(pid);
    const t1 = Date.now();
    await runButton(page, "Compress").click();
    await resultsHeading(page).waitFor({ timeout: 600000 });
    const runMs = Date.now() - t1;
    await page.waitForTimeout(1500);
    const during = await snapshot(page);
    const r = { add, runMs, ...during, heapMB: await heapMB(cdp), peakMemMB: Math.round((await stopMem()) / 1048576), memAfterRunMB: Math.round((await treeMemory(pid)) / 1048576) };
    await page.getByRole("button", { name: "Clear all" }).first().click();
    await leave(page);
    const after = await snapshot(page);
    r.afterLeave = { liveUrls: after.liveUrls, workersAlive: after.workersAlive, heapMB: await heapMB(cdp, true), memMB: Math.round((await treeMemory(pid)) / 1048576) };
    await context.close();
    return r;
  },

  async "gif-60-frames"(browser, fx, pid) {
    const { page, cdp, context } = await openPage(browser, "/tools/gif-maker/");
    await page.locator('input[type="file"]').first().waitFor({ state: "attached" });
    const stopAdd = sampler(pid);
    const t0 = Date.now();
    await page.locator('input[type="file"]').first().setInputFiles(fx.frames);
    await page.getByTestId("gif-frame").nth(59).waitFor();
    await page.waitForTimeout(3000);
    const add = { addMs: Date.now() - t0, ...(await snapshot(page)), peakMemMB: Math.round((await stopAdd()) / 1048576) };
    await resetCounters(page);
    const stopMem = sampler(pid);
    const t1 = Date.now();
    await runButton(page, "Make GIF").click();
    await resultsHeading(page).waitFor({ timeout: 600000 });
    const runMs = Date.now() - t1;
    const during = await snapshot(page);
    const r = { add, runMs, ...during, heapMB: await heapMB(cdp), peakMemMB: Math.round((await stopMem()) / 1048576) };
    await page.getByRole("button", { name: "Clear all" }).first().click().catch(() => {});
    await leave(page);
    const after = await snapshot(page);
    r.afterLeave = { liveUrls: after.liveUrls, workersAlive: after.workersAlive, heapMB: await heapMB(cdp, true) };
    await context.close();
    return r;
  },

  async "workflow-3x20"(browser, fx, pid) {
    const { page, cdp, context } = await openPage(browser, "/workflows/");
    const addStep = async (slug) => {
      await page.getByRole("button", { name: "Add step" }).click();
      await page.getByRole("dialog").locator(`[data-tool="${slug}"]`).click();
      await page.locator(`[data-testid=workflow-step][data-slug="${slug}"]`).waitFor();
    };
    await page.getByRole("button", { name: "Add step" }).waitFor();
    await addStep("rotate-image");
    await addStep("convert-image");
    await addStep("compress-image");
    await page.locator('input[type="file"]:not([capture]):not([data-testid])').first().setInputFiles(fx.jpgs.slice(0, 20));
    await page.getByRole("button", { name: /^Run workflow$/ }).waitFor();
    await page.waitForTimeout(3000);
    await resetCounters(page);
    const stopMem = sampler(pid);
    const t0 = Date.now();
    await page.getByRole("button", { name: /^Run workflow$/ }).click();
    await page.getByRole("heading", { name: /Your files are ready|Processing failed|Workflow/ }).last().waitFor({ timeout: 600000 });
    await page.getByRole("button", { name: /^Run workflow$/ }).waitFor({ timeout: 600000 });
    const runMs = Date.now() - t0;
    const during = await snapshot(page);
    const r = { runMs, ...during, heapMB: await heapMB(cdp), peakMemMB: Math.round((await stopMem()) / 1048576) };
    await page.getByRole("button", { name: "Clear all" }).first().click().catch(() => {});
    await leave(page);
    const after = await snapshot(page);
    r.afterLeave = { liveUrls: after.liveUrls, workersAlive: after.workersAlive, heapMB: await heapMB(cdp, true) };
    await context.close();
    return r;
  },
};

// ---- main ----------------------------------------------------------------------
const results = {};
{
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(base + "/");
  var fx = await makeFixtures(page);
  await browser.close();
}
for (const [name, fn] of Object.entries(SCENARIOS)) {
  if (only.length && !only.includes(name)) continue;
  // A fresh browser per scenario so memory numbers don't leak between them.
  const server = await chromium.launchServer({ args: ["--enable-precise-memory-info"] });
  const pid = server.process().pid;
  const browser = await chromium.connect(server.wsEndpoint());
  try {
    results[name] = await fn(browser, fx, pid);
  } catch (e) {
    results[name] = { error: String(e?.message ?? e).split("\n").slice(0, 6).join(" | ") };
  }
  await browser.close();
  await server.close();
  console.log(name, JSON.stringify(results[name]));
}
if (outFile) writeFileSync(outFile, JSON.stringify(results, null, 2));
