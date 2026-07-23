Folio renders GitHub-flavoured Markdown. This document is both the reference and the proof — everything below is rendered live by the same code that renders your documents.

## Headings

Start at level two. Level one is reserved for the document title, which comes from the manifest.

```markdown
## Section
### Subsection
#### Small label
```

Level two and three appear in the contents rail on the right. Level four is styled as a small uppercase label and stays out of the contents.

## Text

**Bold**, *italic*, ***both***, `inline code`, and [a link](#/getting-started).

```markdown
**Bold**, *italic*, ***both***, `inline code`, and [a link](#/getting-started).
```

## Lists

An unordered list:

- Fetch the manifest
- Build the index
- Render the document

An ordered list:

1. Write the Markdown
2. Add it to the manifest
3. Push

Nesting works to any depth:

- Deployment
  - GitHub Pages
    - Custom domain

## Quotes

> Reserved for asides and warnings — the things a reader can skip without losing the thread, but should not.

```markdown
> Reserved for asides and warnings.
```

## Code

Fence a block and name the language for highlighting:

````markdown
```javascript
const docs = await fetch("./docs/manifest.json").then(r => r.json());
```
````

Which renders as:

```javascript
const docs = await fetch("./docs/manifest.json").then(r => r.json());
```

And in Python:

```python
def folio_mark(index: int) -> str:
    """Reading order becomes a shelf mark."""
    return f"f.{index:02d}"
```

And a shell session:

```bash
python3 -m http.server 8080
```

Around 190 languages are recognised. Leaving the language off gives you an unhighlighted block, which is right for plain output.

Code blocks never break across pages in the PDF, and long lines wrap rather than being cut off at the paper edge.

## Tables

| Column | Type | Default |
| --- | --- | --- |
| `id` | string | — |
| `title` | string | — |
| `updated` | date | none |
| `summary` | string | none |

```markdown
| Column | Type | Default |
| --- | --- | --- |
| `id` | string | — |
```

Alignment markers work as usual: `:---` left, `:---:` centre, `---:` right.

## Rules

Three hyphens on their own line draw a divider.

---

## Images

```markdown
![A description of the image](./assets/diagram.png)
```

Paths are relative to `index.html`, not to the Markdown file — so an image in `assets/` is `./assets/diagram.png`. Images are corner-rounded, scale to the column width, and are kept whole across page breaks in the PDF.

## Raw HTML

Permitted, and sanitised. Anything that could execute — `<script>`, event handlers such as `onclick`, `javascript:` URLs — is stripped before the content reaches the page. Layout and formatting tags survive untouched.
