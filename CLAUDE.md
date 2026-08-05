# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Folio is a static, single-page documentation site: `index.html` + `assets/styles.css` + `assets/app.js` + a folder of Markdown in `docs/`. There is no build step, no package manager, no test suite, and no dependencies to install. Libraries (marked, DOMPurify, highlight.js, mermaid, html2canvas, jsPDF) are loaded from a CDN via `<script>` tags in [index.html](index.html) — there is no bundler, so anything they expose is read off `window`.

## Running it

Browsers block `fetch` against `file://`, so double-clicking `index.html` will always fail with the "index could not be loaded" panel. Serve over HTTP from the repo root:

```bash
python3 -m http.server 8080   # or: npx serve .  /  php -S localhost:8080
```

Deployment is GitHub Pages from `main`, root folder. `.nojekyll` (empty file, must stay committed) keeps Pages from running Jekyll over the repo.

## Architecture

Everything runs inside one IIFE in [assets/app.js](assets/app.js). Flow:

1. On load, fetch `docs/manifest.json` → `buildIndex()` walks `sections[].docs[]`, assigns each doc a sequential folio number (`f.01`, `f.02`, …) **in manifest order across all sections**, defaults `id` from the title slug, and populates the `docs` array + `byId` map. Reordering the manifest renumbers the folios.
2. `route()` reads `location.hash` of the form `#/<doc-id>#<heading-anchor>`. Note the **double** `#`: the doc id and the in-page anchor are both in the hash, split on `#`. Empty id → home panel. Same doc id as `current` → treated as a heading jump, not a reload.
3. `load()` fetches `docs/<file>`, renders through `marked` → `DOMPurify.sanitize()` (never bypass the sanitizer), then `highlightAll()`, `renderMermaid()`, `decorateHeadings()` (assigns de-duplicated slug ids to `h2`/`h3` and appends `#` anchor links) → `buildToc()` (skipped if fewer than 2 headings; wires an IntersectionObserver scrollspy). Rendered Markdown is cached per doc id in `cache` for the session.

   ` ```mermaid ` fences would otherwise render as code; `renderMermaid()` replaces each with an SVG figure and keeps the raw source on `data-src`, so figures can be repainted when the theme flips (`renderFiguresIn`) — `highlightAll()` skips these blocks. Diagrams are drawn `neutral` (light) / `dark` to match the theme; the PDF forces `neutral` into the off-screen sheet before capture so diagrams never come out dark-on-white. `flowchart.htmlLabels` is off so labels are SVG `<text>`, which html2canvas rasterises reliably (foreignObject does not).
4. PDF export clones the rendered `.prose` HTML into an off-screen `#pdfStage` wrapped in a `.sheet` node with its own header, runs html2pdf over it, and removes it. `.sheet` styling lives in the "PDF render stage" section of the stylesheet and is what actually controls PDF appearance — the on-screen prose styles do not apply.

Every DOM lookup goes through `$()` and every listener through `on()`/`text()`, which no-op on missing nodes. This is deliberate: buttons in the topbar/doc header can be deleted from `index.html` without breaking the rest of the page. Keep new chrome optional the same way.

The code is intentionally ES5-style (`var`, `function`, `Array.prototype.forEach.call`) with no transpilation. Match it.

## Adding or changing documents

`node scripts/add-doc.js` does this interactively — it copies a Markdown file into `docs/` and appends the manifest entry. By hand:

Write `docs/<name>.md` starting at heading level two (`##`) — `h1` is rendered from the manifest `title`, not from the file. Then add an entry under the appropriate `sections[].docs[]` in [docs/manifest.json](docs/manifest.json):

```json
{ "id": "your-doc", "title": "Your document", "file": "your-doc.md",
  "updated": "2026-07-23", "summary": "Text the sidebar filter searches." }
```

`summary` is only used by the filter box (which matches title + summary + section label). `updated` must be `YYYY-MM-DD`. Only `h2`/`h3` reach the on-page contents; deeper headings are ignored.

Markdown sourced from elsewhere usually needs two edits before it lands in `docs/`: drop the `h1`, and rewrite in-page links from GitHub's `#anchor` form to `#/<doc-id>#<anchor>` — a bare `#anchor` is parsed by the router as a document id and bounces the reader to the home panel. Note also that Folio's slugger collapses repeated hyphens where GitHub keeps them (`#1-a--b` → `1-a-b`).

## Styling

All colour and layout tokens are CSS custom properties at the top of [assets/styles.css](assets/styles.css): `:root` for light, `[data-theme="dark"]` for dark. Theme is set on `<html data-theme>` by `setTheme()`, persisted in `localStorage` under `folio:theme`, defaulting to `prefers-color-scheme`. Restyling should mean editing variables, not rules. Dark-mode overrides must be added to the `[data-theme="dark"]` block — there is no `prefers-color-scheme` media query driving colours at rule level.

The stylesheet is organised by the `/* ─── section ─── */` banner comments (shell, index, page, prose, on this page, toast, code tokens, responsive, PDF render stage, print). Add rules to the matching section. Sidebar collapses to a drawer at the `860px` breakpoint.

## PDF export

Every PDF page is a JPEG of the off-screen `.sheet`. Captures are banded (max `PDF.band` device px per `html2canvas` call) and cut into A4 pages at block boundaries by `pageBreaks()`. **Do not "simplify" this back into a single capture** — a canvas taller than ~65,535 device px comes back blank, which is exactly what a long document produces. `PDF.scale` and `PDF.quality` are the file-size dials.

## Commits

Conventional Commits, always: `type(scope): subject` — `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `chore`. Subject in the imperative, lowercase, no trailing period. Scope is optional and matches the area touched (`pdf`, `docs`, `ui`, `scripts`).

**Never add a `Co-Authored-By` trailer** (or any other AI attribution) to a commit message.
