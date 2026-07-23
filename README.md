# Folio

A one-page documentation site. Pick a document from the index on the left, read it in the browser, or take it with you as a PDF.

No build step, no dependencies to install, no framework. It is one HTML file, one stylesheet, one script, and a folder of Markdown.

![Folio](https://img.shields.io/badge/build-none%20required-134E3F) ![License](https://img.shields.io/badge/license-MIT-A8720B)

---

## Run it locally

Browsers block pages from reading files off your hard drive, so opening `index.html` by double-clicking it will not work. Serve the folder over HTTP:

```bash
python3 -m http.server 8080
# or: npx serve .
# or: php -S localhost:8080
```

Then open <http://localhost:8080>.

## Put it on GitHub Pages

**Without the terminal**

1. Create a new **public** repository at <https://github.com/new>. Do not add a README — you already have one.
2. On the empty repository page, click **uploading an existing file** and drag in everything *inside* this folder (`index.html`, `assets`, `docs`, `README.md`, `.nojekyll`) — not the folder itself.
3. Commit.
4. Go to **Settings › Pages**. Set **Source** to *Deploy from a branch*, **Branch** to `main`, folder `/ (root)`. Save.
5. Wait a minute, then open `https://YOUR-USERNAME.github.io/YOUR-REPO-NAME/`.

**With the terminal**

```bash
git init
git add .
git commit -m "Add Folio documentation site"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO-NAME.git
git push -u origin main
```

Then follow step 4 above.

> `.nojekyll` is an empty file that stops GitHub from running Jekyll over the repository. It is hidden in Finder and Explorer by default — press <kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>.</kbd> on macOS, or tick **Hidden items** in Explorer's View tab, to see it and make sure it uploads.

The full guide, including custom domains and troubleshooting, is in the site itself under **Guides › Deploying to GitHub Pages**.

## Add a document

1. Write `docs/your-doc.md`, starting at heading level two.
2. Add an entry to `docs/manifest.json`:

```json
{
  "id": "your-doc",
  "title": "Your document",
  "file": "your-doc.md",
  "updated": "2026-07-23",
  "summary": "Searched by the filter box."
}
```

Order in the manifest is order in the sidebar, and the folio numbers follow it.

## Layout

```
.
├── index.html          the page
├── assets/
│   ├── styles.css      the design — all colour lives in CSS variables at the top
│   └── app.js          routing, Markdown rendering, PDF export
├── docs/
│   ├── manifest.json   what appears in the index
│   └── *.md            your documents
└── .nojekyll           serve files as-is on GitHub Pages
```

## Built with

[marked](https://github.com/markedjs/marked) · [DOMPurify](https://github.com/cure53/DOMPurify) · [highlight.js](https://highlightjs.org) · [html2pdf.js](https://github.com/eKoopmans/html2pdf.js) — all loaded from a CDN. Vendor them into `assets/vendor/` if you need the site to work offline.

## Licence

MIT — see [LICENSE](LICENSE). Created by Mouayad Aloula.
