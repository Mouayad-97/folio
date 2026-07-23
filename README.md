# Folio

A one-page documentation site. Pick a document from the index on the left, read it in the browser, or take it with you as a PDF.

No build step, no dependencies to install, no framework. It is one HTML file, one stylesheet, one script, and a folder of Markdown.

![Folio](https://img.shields.io/badge/build-none%20required-134E3F) ![License](https://img.shields.io/badge/license-MIT-A8720B)

---

## What you get

- **An index that filters.** Press <kbd>/</kbd> from anywhere to jump to the filter box; <kbd>Esc</kbd> clears it. Documents are grouped into sections and numbered `f.01`, `f.02`, … in the order the manifest lists them.
- **Deep links.** Every document has a URL (`#/getting-started`) and every heading has one too (`#/getting-started#running-it`), so you can point someone at an exact paragraph.
- **On-page contents** that highlights the section you are reading.
- **Light and dark**, following your system by default and remembered after that.
- **PDF and print.** Both keep the reading layout and drop the site chrome.
- **Syntax highlighting**, tables, callouts — the usual Markdown, styled to match.

## Run it locally

Browsers block pages from reading files off your hard drive, so opening `index.html` by double-clicking it will not work. Serve the folder over HTTP:

```bash
python3 -m http.server 8080
# or: npx serve .
# or: php -S localhost:8080
```

Then open <http://localhost:8080>.

## Add a document

Run the helper and answer the questions:

```bash
node scripts/add-doc.js
```

It asks for the Markdown file, offers your existing sections (or a new one), suggests a title, URL id and summary read out of the file itself, then copies the file into `docs/` and writes the manifest entry. Nothing is touched until it shows you what it is about to do and you confirm.

By hand, it is two steps. Write `docs/your-doc.md` starting at heading level two — the `#` title comes from the manifest, not the file:

```markdown
## First section

Body text.
```

Then add an entry to the right section in `docs/manifest.json`:

```jsonc
{
  "site": { "name": "Folio", "tagline": "Documentation" },
  "sections": [
    {
      "label": "Start here",
      "docs": [
        {
          "id": "your-doc",              // the URL: #/your-doc
          "title": "Your document",      // the heading Folio renders
          "file": "your-doc.md",
          "updated": "2026-07-23",
          "summary": "Searched by the filter box."
        }
      ]
    }
  ]
}
```

Order in the manifest is order in the sidebar, and the folio numbers follow it.

## Put it on GitHub Pages

**Without the terminal**

1. Create a new **public** repository at <https://github.com/new>. Do not add a README — you already have one.
2. On the empty repository page, click **uploading an existing file** and drag in everything *inside* this folder (`index.html`, `assets`, `docs`, `scripts`, `README.md`, `LICENSE`, `.nojekyll`) — not the folder itself.
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

## Making it yours

All colour, spacing and type live in CSS variables at the top of `assets/styles.css` — `:root` for light, `[data-theme="dark"]` for dark. Restyling should mean editing those, not chasing rules. The site name and tagline come from `site` in the manifest; the favicon is an inline SVG in the `<head>`.

## About the PDF

Each page of the PDF is an image of the reading layout, captured with html2canvas and placed with jsPDF. Long documents are captured in bands and cut into A4 pages on block boundaries, so a table or code block is kept whole where it fits — a single capture would exceed the browser's canvas limit and come back blank.

That means a long document makes a large file (roughly 300 KB per page). **Print** is the lighter option: your browser's *Save as PDF* produces real, selectable text at a fraction of the size. Use the PDF button when you want the layout captured exactly, print when you want a small file you can search.

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
├── scripts/
│   └── add-doc.js      interactive "add a document" helper
└── .nojekyll           serve files as-is on GitHub Pages
```

## Built with

[marked](https://github.com/markedjs/marked) · [DOMPurify](https://github.com/cure53/DOMPurify) · [highlight.js](https://highlightjs.org) · [html2canvas](https://html2canvas.hertzen.com) · [jsPDF](https://github.com/parallax/jsPDF) — all loaded from a CDN, along with the fonts. Vendor them into `assets/vendor/` if you need the site to work offline.

## Licence

MIT — see [LICENSE](LICENSE). Created by Mouayad Aloula.
