# dcms-docs

A documentation CMS built on [DCMS](../dcms). Write docs in the browser, organize and
link them, then export a static site (with search) to drop on any CDN — or serve them
live behind authentication for private/internal docs.

It's also a working example that DCMS builds real products: the entire backend —
sites, sections, pages, auth, drafts/publishing, revisions, media, the admin panel —
is generated from [`schema.yaml`](./schema.yaml). The only hand-written code is the
site rendering and the static-export pipeline (`site.go`, `export.go`, `render.go`).

## Run it

Requires Go 1.25+ and the sibling `../dcms` checkout (see the `replace` in `go.mod`).

```bash
cp .env.example .env    # set the first admin, then edit
go run .                # migrates, seeds the admin, serves on http://localhost:8080
```

- **/__admin** — sign in and author content (until your editor lands in `editor/`).
- **/** — the rendered documentation site.
- **/api/v1** — the REST API the editor and site both use.

Reset any time: stop the server and `rm -f docs.db && rm -rf public`.

## Content model

Three collections (all generated from `schema.yaml`):

- **sites** — a docs space. `visibility` (public | private) decides how it's served.
- **pages** — one self-referential tree (sidebar + content in one collection). Each
  node has `title`, `slug`, `kind` (`page` | `label`), `body` (**HTML**), `order`, and
  `parent`. Its shape decides how it renders in the sidebar:
  - `kind: label` → a static section header (not clickable, not collapsible)
  - `page` with a body, no children → a plain link
  - `page` with children, no body → a dropdown
  - `page` with a body **and** children → a link that's also a dropdown (split click)

Publishing keeps drafts private; revisions give every page history/undo.

Source of truth is the **database**, not files — so the tree, ordering, links, access,
and draft state are all queryable. `body` stores **HTML** (what the DOM editor
produces); markdown is only an import/export convenience, never the stored format.

## Public vs. private

This is the one real fork, because static files on a CDN can't be access-controlled:

- **Public site** → `POST /__export` renders `./public` (clean-URL HTML + assets +
  a Pagefind search index) → push to any CDN.
- **Private site** (`visibility: private`) → **not exported**. Served live from this
  binary; the site routes require an authenticated caller and redirect to `/__admin`
  otherwise. Run the instance behind your own network/SSO.

> **v1 limitation (honest):** the private gate is enforced at the HTML layer. The raw
> REST read rule on `pages` is still `public`, so a private site's content is
> reachable via the API if the instance is publicly exposed. For true private docs in
> v1, keep the instance off the public internet. Per-record visibility via an access
> rule is a later step — see `../dcms/TODO.md`.

## Static export + search

`POST /__export` (admin only) writes:

```
public/
├── index.html            # homepage
├── p/<slug>/index.html   # each published page (clean URLs)
├── assets/...            # theme CSS etc.
└── pagefind/...          # search index (if the `pagefind` binary is installed)
```

Search uses [Pagefind](https://pagefind.app): install its CLI and it's picked up on
the next export. Without it, export still works — just no search.

## Editing

Logged-in editors (role `editor`/`admin`) get an in-theme editing flow — no separate
app, the same shell and sidebar as the live site:

- **Preview:** while logged in, the live site also shows **drafts** (hidden from the
  public) with a *Draft* badge, and an **Edit** pencil in the topbar.
- **Edit mode** (`/__edit/<slug>`, gated): the chosen theme rendered with an editable
  content region (`#doc-editor`) and a topbar with **Save · Publish/Unpublish ·
  Export**. `Ctrl/⌘S` saves.
- Those buttons call the generated REST API (`PATCH /api/v1/pages/{id}`, the lifecycle
  publish endpoints, `POST /__export`) — no custom editor backend.

The content region is a stubbed `contenteditable` today. **Your DOM editor mounts onto
`#doc-editor`**; edit mode only reads its `innerHTML` as the saved body (HTML), so it's
compatible with whatever editor you drop in — see [`editor/`](./editor/).

## Themes

The shell lives in `themes/<name>/` (`layout.html`, `page.html`, `home.html`,
`edit.html`, `assets/`) and is compiled into the binary via `go:embed`. One theme ships
— **`classic`** (squarish B&W, Phosphor icons, light/dark, collapsible tree sidebar,
`⌘K` search). The theme system takes more: add a folder and select it with the
`DOCS_THEME` env var (or per-site via `sites.theme`). Themes are content-agnostic —
they receive a rendered page plus the nav tree.

## What's a TODO

- Multi-site routing (serve several sites by host/path — the schema already supports
  it; `firstSite` currently serves one).
- Per-record/private access rule so private docs are gated at the API too.
- Nav build is N+1 per page during export (fine at docs scale; batch later).
