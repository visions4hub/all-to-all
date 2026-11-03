# Workflow builder — verification report (Milestone 4)

Branch `m4-workflow-builder`. Last run: 4 November 2026.

| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | pass (0 problems) |
| `npm test` (Vitest) | 317 passing — 55 new in `src/lib/workflows/*.test.ts` |
| `npm run build` | pass, `/workflows` is a static page |
| `npx playwright test e2e/workflows` (`E2E_PORT=4193`) | 24 passing (12 specs × desktop 1366 px + mobile 375 px with touch); then 72/72 with `--repeat-each=3 --workers=12` |

New dependencies: **none**. Saved workflows use plain IndexedDB.

## What it does

`/workflows/` is a builder for chains of tools that run one after another on the files added once:

- **Steps**: add (dialog lists tools that fit the current output first), remove, reorder by dragging the grip (desktop) or with the Move up / Move down buttons (touch and keyboard).
- **Settings**: each step shows that tool's own `Settings` component and starts from its `defaultSettings`. Step 1 gets the real files (so page counts and image sizes show); later steps get none, because their inputs don't exist yet.
- **Compatibility**: checked before running from the registry `accepts` / `outputs` and the step's `format` setting (`src/lib/workflows/kinds.ts`); errors block the run and name both steps, partial fits are warnings. While running, every produced file is re-detected by its magic bytes and must be accepted by the next step.
- **Running** (`runChain`, `src/lib/workflows/engine.ts`): each step goes through the existing `runProcessor`, and its `ProcessOutput` blobs become the next step's `ProcessInput` files in memory. Per-step status (waiting / running n/m / done · N files / stopped / cancelled / not run) and an overall progress bar. The first problem stops the chain with a message that names the step (and file): wrong file kind, too few/many files for the tool, the tool's own `validate` message, a failed file, an empty result, out of memory. Cancel stops the current step and skips the rest.
- **Results**: the existing `ResultsPanel` (single download, ZIP, rename, share, size change against the original file — final outputs' `sourceIds` are mapped back to the user's files).
- **Presets** (`src/lib/tools/workflow-presets.ts`): five runnable chains with settings. The homepage cards and the builder cards open them pre-filled (`/workflows/?preset=<id>`).
- **Saved workflows** in IndexedDB (`all-to-all` database, `workflows` store): name, steps, settings, dates. Open, delete, clear all (with confirmation).
- **JSON export / import** (`src/lib/workflows/schema.ts`): one workflow or all of them. Binary settings (watermark logo `File`, PDF watermark image bytes) are written as base64 markers, so a file round-trips.
- Tool modules load only when a step uses them (`src/lib/workflows/modules.ts`).

### Chainable tools

Any tool that is usable (`operational` / `beta`), has a module loader, is not in `NOT_CHAINABLE`, and whose module has no `Workspace` override. New tools from other Milestone 4 work (compress PDF, compare PDF, image metadata, GIF maker) become steps automatically once their status is usable and their loader is registered.

Not chainable (listed on the page with the reason): Photo Editor, Blur & Pixelate, Meme Generator, Organize PDF, Edit PDF, Sign PDF, Fill PDF Forms — their settings are made by hand on one specific file (drawn regions, placed objects, form fields, page thumbnails). No current module uses a `Workspace` override, so the list is explicit in `src/lib/workflows/chainable.ts`.

The old preset "Photos to tidy PDF" (Image to PDF → Organize PDF) became "Photos to numbered PDF" (Image to PDF → Add Page Numbers), since Organize can't run unattended.

### Import safety

`parseWorkflowFile` rejects, with a message in both languages: files over 20 MB, invalid JSON, another format or version, no workflows / more than 100, a workflow without a name or steps / more than 30 steps, a step whose tool is unknown, not chainable, not built yet or has odd characters, settings that aren't an object, `__proto__` / `constructor` / `prototype` keys anywhere, nesting deeper than 12, bad base64 or file types. Names lose control and bidi-override characters and are capped at 100 characters (React shows them as text). After the file is accepted, each step's settings are merged onto the tool's defaults: only known keys with the default's type are kept, everything else is reset (and the user is told).

## Tests

### Unit (`src/lib/workflows/`)

- `engine.test.ts` — compatibility: real registry chains (Resize → Compress → Watermark, Merge → Page numbers → Watermark PDF, Image to PDF → Rotate/Page numbers, Crop → Convert, PDF to image → Resize → Image to PDF) pass; PDF to text → Rotate PDF, images into Merge PDF, PDF into Resize fail naming the steps; format setting followed (WebP into a PNG-only step fails); partial-fit warning; interactive tools flagged; output-kind prediction. Running: outputs fed into the next step in order (content `x>A>B>C`), per-file calls, origins kept for batch steps; error in step 2 stops the chain (step 3 never called, message names step 2 and the file); cancel during step 2 (step 3 never called, statuses done / cancelled / skipped); pre-aborted signal runs nothing; real-bytes check (TXT into an image step); too few / too many files; tool `validate` message; empty output; interactive tool or `Workspace` module refused; out-of-memory message.
- `schema.test.ts` — chainable list and presets; JSON round trip including a `File` logo and `Uint8Array` image bytes; 21 malformed or malicious files rejected with the right message (including `__proto__` pollution attempts, unknown and non-chainable slugs, path-like slugs, deep nesting, oversized input); name cleaning; `sanitizeSettings` (valid values applied, wrong types reset and reported, unknown keys dropped, null defaults accept files but not functions); encode/decode.

### End to end (`e2e/workflows/workflows.spec.ts`)

Run in Arabic and English, desktop and 375 px phone:

1. **Resize → Compress → Watermark** on two noisy PNGs (800×600, 600×400, Arabic filename): Resize 50%, Compress to WebP, red "Visions" text. The ZIP holds `…-400x300-compressed-watermarked.webp` and `…-300x200-…`; each is WebP by magic bytes, exactly 400×300 / 300×200, under a third of the input size, has red text pixels in the bottom-right of its white band and none in the bottom-left.
2. **Image to PDF → Rotate PDF** on PNG + JPG + WebP: one PDF, 3 pages, every page `/Rotate 90`.
3. **Homepage preset** "Merged, numbered PDF" opens the builder with 3 steps and its name; merging a 2-page and a 3-page PDF gives 5 pages, each with added content.
4. **Errors**: PDF to text → Rotate PDF shows a TXT incompatibility and the run button stays disabled; Rotate PDF → Merge PDF on one file stops at "Step 2 (Merge PDF): needs at least 2 files", step 1 shown as done.
5. **Storage**: reorder with the Move up button, set Resize to max width 640, name and save, reload — still there; open it (setting kept); export JSON (format, steps and settings checked); clear all with confirmation; reload — empty; importing invalid JSON and an unknown tool shows the error and saves nothing; importing the export brings it back (steps and settings), and it survives a reload.
6. Interactive tools are listed as not chainable and absent from the Add step dialog.
7. Drag reorder (desktop grip) and keyboard reorder (Enter on Move down).

Every test fails on any uncaught page error. Layout at 375 px was checked for horizontal overflow (one found and fixed: the steps grid needed `grid-cols-1`).

## Shared files changed

- `src/lib/tools/workflow-presets.ts` — presets are now `{ id, name, description, steps: { slug, settings? }[] }` (was `steps: string[]`), plus `getWorkflowPreset`. Only used by the files below.
- `src/components/workflow-presets.tsx` — cards link to `/workflows/?preset=<id>`, or call `onSelect` inside the builder.
- `src/app/home-content.tsx` — presets section text: removed "(In progress)", link now "Build your own".
- `src/app/workflows/workflows-content.tsx` — the builder replaces the "in progress" note.

No changes to tool modules, registries, the engine, the workspace or `ResultsPanel` (it was reusable as is).

## Known limits

- Tools with `maxFiles` (Crop Image, Remove/Extract Pages, Crop PDF) stop the chain when more files reach them than they allow; the message says so. The "Crop and convert" preset therefore takes one image at a time.
- Settings that depend on a specific file (Crop Image's hand-placed rectangle, page ranges checked against a page count) can only be previewed for step 1; later steps use ratio-based / typed values and are checked when the step runs.
- A saved workflow that uses a tool later marked non-chainable can't be opened (clear message); its JSON can still be exported.
- Once, under heavy machine load from parallel sessions, 3 of 24 e2e tests failed in one run; the cause was not captured and it did not happen again in 4 later runs (120 test runs, including a stress run with 12 workers).
