# Editor

Drop your RTE / organizer editor scripts here.

## How it wires to the backend

The editor is a client of the generated DCMS REST API — it doesn't need any Go. It
authenticates once (session cookie via `POST /auth/login`, or a Bearer PAT) and then
reads/writes the same collections the site renders from:

| Action | Call |
|---|---|
| List pages (incl. drafts) | `GET /api/v1/pages` (authenticated) |
| Create a page | `POST /api/v1/pages` `{title, slug, body, section, order}` |
| Edit a page | `PATCH /api/v1/pages/{id}` `{body: "..."}` |
| Reorder / move section | `PATCH /api/v1/pages/{id}` `{order, section}` |
| Save draft vs. publish | create leaves it a draft; `POST /api/v1/pages/{id}/publish` goes live |
| History / undo | `GET /api/v1/pages/{id}/revisions` → restore from the admin panel |
| Upload an image | `POST /__media` → use the returned URL in the markdown |
| Build the static site | `POST /__export` (admin) → writes `./public` |

`body` is **markdown** (the source of truth lives in the DB). The site renderer and
the static export both run that markdown through goldmark — so what the editor saves
is exactly what ships.

## Suggested layout once you add it

```
editor/
├── index.html      # the editor shell
├── editor.js       # your RTE + organizer
└── editor.css
```

Serve it however you like. Two easy options:
- Mount it as a custom route in `main.go` (e.g. `GET /__edit`) using `app.Route`,
  serving these files from an `embed.FS` — same pattern as `site.go`'s asset handler.
- Or run it as a separate static app during development pointed at the API.

Tell Claude which one you want and it'll wire the route.
