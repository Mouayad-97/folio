Folio has four moving parts. That is the whole system.

```
folio/
├── index.html          the page — the only HTML file
├── assets/
│   ├── styles.css      the design
│   └── app.js          routing, rendering, PDF export
├── docs/
│   ├── manifest.json   what appears in the index, and in what order
│   └── *.md            your documents
└── .nojekyll           tells GitHub Pages to serve files as-is
```

## The request cycle

1. The page loads and asks for `docs/manifest.json`.
2. It builds the sidebar from the sections and documents it finds there.
3. When you click a document, it fetches that `.md` file over HTTP.
4. The Markdown is parsed, sanitised, highlighted, and written into the page.
5. Headings are given IDs, and the contents rail on the right is built from them.

Nothing is pre-rendered. Nothing is bundled. The `.md` files stay `.md` files, which means they still read well on GitHub, in an editor, or piped through any other tool.

## How the PDF is made

The PDF is built in your browser. When you press **Download PDF**, Folio clones the rendered document into an off-screen sheet with fixed light-mode styling, paints it to a canvas, and writes an A4 PDF from that.

This matters in two ways:

- The PDF looks the same whether you are in light or dark mode.
- No file ever leaves your machine. There is no server involved.

> If the PDF library fails to load — an offline machine, a blocked CDN — the button quietly falls back to your browser's print dialogue, which can also save to PDF.

## The libraries

Four small scripts, loaded from a CDN:

| Library | Job |
| --- | --- |
| `marked` | Markdown to HTML |
| `DOMPurify` | Strips anything unsafe from the result |
| `highlight.js` | Colours code blocks |
| `html2pdf.js` | Turns the rendered page into a PDF |

If you would rather not depend on a CDN, download those four files into `assets/vendor/` and point the `<script>` tags in `index.html` at them. Nothing else changes.
