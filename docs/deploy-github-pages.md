GitHub Pages serves static files straight out of a repository, for free, over HTTPS. Folio is nothing but static files, so there is no configuration to write and no build to run.

Two routes are described below. The first uses only the GitHub website — no tools, no terminal. The second uses Git from the command line. Pick one.

## Before you start

- A GitHub account.
- The `folio` folder on your computer, unzipped.
- A **public** repository. On free accounts, Pages only works on public repositories. Private repositories need GitHub Pro or an organisation plan.

## Route A — the website only

**1. Create the repository.** Go to [github.com/new](https://github.com/new). Give it a name — `docs` and `handbook` are good choices, and the name becomes part of your URL. Set it to **Public**. Do not tick "Add a README file"; you already have one. Press **Create repository**.

**2. Upload the files.** On the empty repository page, click **uploading an existing file**. Open your `folio` folder, select everything *inside* it — `index.html`, `assets`, `docs`, `README.md`, `.nojekyll` — and drag it all onto the page.

> Drag the *contents* of the folder, not the folder itself. If you drop the `folio` folder in, everything ends up one level too deep and the site will show a 404.

Wait for the upload to finish, then press **Commit changes**.

**3. Check `.nojekyll` came along.** Files beginning with a dot are hidden by default in macOS Finder — press <kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>.</kbd> to reveal them, and in Windows Explorer tick **Hidden items** under the View tab. If it did not upload, create it in the browser: **Add file › Create new file**, name it `.nojekyll`, leave it empty, commit.

**4. Turn on Pages.** In the repository, go to **Settings › Pages**. Under **Build and deployment**, set **Source** to *Deploy from a branch*, **Branch** to `main`, and the folder to `/ (root)`. Press **Save**.

**5. Wait, then visit.** The first deployment takes a minute or two. The **Actions** tab shows a running workflow, and a green tick means it is live. Your site is at:

```
https://YOUR-USERNAME.github.io/YOUR-REPO-NAME/
```

The Pages settings page shows the exact address once it is ready.

## Route B — the command line

From inside the `folio` folder:

```bash
git init
git add .
git commit -m "Add Folio documentation site"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO-NAME.git
git push -u origin main
```

Create the repository on GitHub first, empty, so the remote exists. Then follow step 4 above to switch Pages on.

Every later change is three commands:

```bash
git add .
git commit -m "Update the API keys document"
git push
```

Pages rebuilds automatically, usually within a minute.

## Publishing at the root of your account

Name the repository exactly `YOUR-USERNAME.github.io` and the site is served from the top of your domain instead of a subfolder:

```
https://YOUR-USERNAME.github.io/
```

Everything else is identical. You get one of these per account.

## Use your own domain

**1.** In **Settings › Pages › Custom domain**, type your domain and press **Save**. This writes a `CNAME` file into the repository.

**2.** At your DNS provider, add the records for the kind of domain you are using.

For a subdomain such as `docs.example.com`, one record:

| Type | Name | Value |
| --- | --- | --- |
| CNAME | `docs` | `YOUR-USERNAME.github.io` |

For an apex domain such as `example.com`, four A records pointing at GitHub's Pages servers:

| Type | Name | Value |
| --- | --- | --- |
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |

**3.** DNS takes anywhere from a few minutes to a day to propagate. Once GitHub verifies the domain, tick **Enforce HTTPS** on the same settings page. The certificate is issued automatically and free.

## When something is wrong

**The page loads but the sidebar says "index unavailable".** The `docs` folder did not upload, or the files landed one level too deep. Open the repository and confirm that `index.html` sits at the top level, not inside another folder.

**You get a 404.** Either Pages has not finished its first deployment, or the branch and folder in **Settings › Pages** do not match where the files actually are. Check the **Actions** tab for a failed run.

**The site is stale after a push.** Pages caches hard. Force a fresh copy with <kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>R</kbd> on macOS or <kbd>Ctrl</kbd> <kbd>⇧</kbd> <kbd>R</kbd> on Windows, or open it in a private window.

**Some files are missing without explanation.** That is Jekyll, which GitHub runs by default and which skips files and folders starting with `_` or `.`. The empty `.nojekyll` file turns it off. Make sure it is in the repository root.

**A deep link like `/docs/getting-started` 404s.** Folio routes with a hash — `#/getting-started` — precisely so that this cannot happen. If you see a path-style URL, it was not produced by this site.
