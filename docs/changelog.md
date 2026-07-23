Newest first.

## 1.0.0 — 23 July 2026

First release.

**The page**

- Single-page site, hash-routed, with a deep link for every document and every heading
- Sidebar index grouped into sections, numbered in reading order
- Filter box over titles, sections, and summaries — press <kbd>/</kbd> from anywhere
- Contents rail built from your headings, tracking your scroll position
- Light and dark themes, following the system by default and remembering a manual choice
- Full layout down to phone width, with the index as a slide-in drawer

**Documents**

- GitHub-flavoured Markdown: tables, fenced code, task lists, autolinks
- Syntax highlighting across roughly 190 languages, themed to the palette rather than dropped in
- Output sanitised before it reaches the page
- Reading time and last-updated date derived from the file and the manifest

**Taking documents with you**

- PDF export rendered in the browser, always on white paper regardless of theme
- Page breaks kept out of code blocks, tables, quotes, and images
- Print stylesheet that drops the sidebar, the contents, and the buttons
- Falls back to the print dialogue if the PDF library is unavailable

**Deployment**

- No build step and no dependencies to install
- Ships with `.nojekyll` so GitHub Pages serves every file as-is
- Clear on-page instructions when the site is opened from the file system instead of a server
