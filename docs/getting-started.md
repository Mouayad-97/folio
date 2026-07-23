Folio is a documentation site that is one HTML page and a folder of Markdown files. There is no build step, no framework, and nothing to install. You edit `.md` files and the site updates.

Every document can be read in the browser or downloaded as a PDF from the buttons at the top of the page.

## Run it on your machine

Browsers block pages from reading files off your hard drive, so double-clicking `index.html` will not work. Serve the folder over HTTP instead. Any of these will do:

```bash
# Python (already installed on macOS and most Linux systems)
python3 -m http.server 8080

# Node
npx serve .

# PHP
php -S localhost:8080
```

Then open `http://localhost:8080`. Once the site is on GitHub Pages, it is served over HTTP already and this stops being a concern.

## What you get

| Feature | Notes |
| --- | --- |
| Markdown rendering | GitHub-flavoured, including tables and fenced code |
| Syntax highlighting | 190+ languages, themed to match the page |
| PDF download | Generated in the browser, always on white paper |
| Print | Clean print stylesheet, no sidebar or chrome |
| On-page contents | Built from your headings, follows your scroll |
| Filter | Press <kbd>/</kbd> anywhere to jump to the filter box |
| Dark mode | Follows your system, remembers your choice |
| Deep links | Every document and every heading has its own URL |

## Find your way around

The index on the left lists every document, grouped into sections and numbered in reading order — `f.01`, `f.02`, and so on. The number is the folio mark, and it comes from the order of the manifest, so reordering the manifest renumbers the shelf.

Next: read [How Folio works](#/how-it-works), or skip ahead to [Deploying to GitHub Pages](#/deploy-github-pages).
