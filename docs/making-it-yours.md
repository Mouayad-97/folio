Folio is deliberately small, so most changes are one line in one file.

## Name and tagline

Both come from the top of `docs/manifest.json`:

```json
"site": {
  "name": "Folio",
  "tagline": "Documentation"
}
```

They appear in the sidebar wordmark and in the browser tab title.

## Colour

Every colour in the site is a CSS variable, declared twice near the top of `assets/styles.css` — once for light mode, once for dark.

```css
:root {
  --paper:       #E8EAE5;   /* page background */
  --card:        #F8F9F6;   /* raised surfaces, code blocks */
  --ink:         #13211D;   /* body text */
  --ink-2:       #5B6B66;   /* secondary text */
  --rule:        #CFD5CE;   /* borders */
  --accent:      #134E3F;   /* links, primary button, active contents */
  --saffron:     #A8720B;   /* folio marks, the active index tab */
}
```

Change the seven above and the whole site moves with them, including the PDF header and the code highlighting. Then change the matching values in the `[data-theme="dark"]` block below so dark mode stays legible.

The default palette is cool linen paper with a pine-ink text, a viridian accent for anything actionable, and saffron reserved for one job only: marking your place in the index.

## Type

Three faces, three roles:

| Face | Used for |
| --- | --- |
| Bricolage Grotesque | Titles, headings, index entries |
| Source Serif 4 | Body prose |
| IBM Plex Mono | Labels, buttons, metadata, code |

To swap one out, change the Google Fonts `<link>` in `index.html` and the matching variable in `styles.css`:

```css
--sans:  "Bricolage Grotesque", sans-serif;
--serif: "Source Serif 4", Georgia, serif;
--mono:  "IBM Plex Mono", monospace;
```

## Line length

Prose is capped at 68 characters per line, which is comfortable for long reading. Widen or narrow it with one variable:

```css
--measure: 68ch;
```

## Favicon

The icon is an inline SVG in the `<link rel="icon">` tag in `index.html`. The green is URL-encoded as `%23134E3F` — `%23` is a `#`. Swap the hex value there to recolour it, or replace the whole tag with `<link rel="icon" href="./assets/favicon.png">` if you would rather use an image.

## Removing the PDF button

Delete the `<button id="pdf">` element from `index.html`. The script checks that its buttons exist before wiring them up, so nothing breaks.

## Going offline

The four libraries load from a CDN. To vendor them, download each file into `assets/vendor/` and repoint the `<script>` tags at the bottom of `index.html`. Folio degrades rather than crashes if any of them is missing: without `marked` you get plain text, and without `html2pdf.js` the download button opens the print dialogue instead.
