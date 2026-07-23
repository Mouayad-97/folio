Adding a document takes two steps: write the file, then list it.

## 1. Write the Markdown

Create a new file in `docs/`. Use a lowercase, hyphenated name — it becomes part of the URL and the PDF filename.

```bash
touch docs/api-keys.md
```

Start at heading level two. The document title comes from the manifest and is already printed at the top of the page, so an `#` heading in the file would just repeat it.

```markdown
A short opening line that says what this document is for.

## First section

Body text.

### A subsection

More body text.
```

## 2. Add it to the manifest

Open `docs/manifest.json` and add an entry to whichever section it belongs in.

```json
{
  "id": "api-keys",
  "title": "Managing API keys",
  "file": "api-keys.md",
  "updated": "2026-07-23",
  "summary": "Create, rotate, and revoke keys."
}
```

| Field | Required | What it does |
| --- | --- | --- |
| `id` | yes | The URL slug and the PDF filename |
| `title` | yes | Shown in the index and as the page title |
| `file` | yes | Filename inside `docs/` |
| `updated` | no | `YYYY-MM-DD`, shown under the title |
| `summary` | no | Not displayed, but searched by the filter box |

Reload the page. The document is there, and the folio numbers renumber themselves to match the new order.

## Adding a whole section

Sections are the labelled groups in the index. Add another object to the `sections` array:

```json
{
  "label": "Operations",
  "docs": [ ]
}
```

Order in the file is order on the page, for both sections and documents.

## Linking between documents

Use the hash route:

```markdown
See [Deploying to GitHub Pages](#/deploy-github-pages).
```

To link to a specific heading in another document, add a second hash and the heading's slug:

```markdown
See [the DNS step](#/deploy-github-pages#use-your-own-domain).
```

The slug is the heading text, lowercased, with spaces turned into hyphens. Hovering any heading reveals a `#` anchor that gives you the exact link.
