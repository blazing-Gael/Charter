# Content Element Contract

The shared schema for a page `body`. One definition that the **editor**, **component
library**, **themes**, **sanitizer**, and **search/AI extractor** all agree on. For
anyone touching any of those five.

Body is **HTML** (semantic, canonical). A JSON block index is *derived* from it for
search/AI — never authored. See [ARCHITECTURE](../../dcms/docs/ARCHITECTURE.md) for why
HTML stays the source of truth.

## Principles

1. **Semantic HTML, no inline styling for structure.** Structure (headings, lists,
   tables, code) is plain tags; the **theme owns presentation**. Inline style only for
   deliberate author choices (a specific color), never for layout.
2. **Progressive enhancement.** Every element is valid and meaningful **without JS**.
   The component library upgrades it; it is never required for correctness. A hook that
   breaks without JS violates the contract.
3. **One hook, five consumers.** A component is `<tag data-dc="name">`. The editor
   emits it, the library enhances it, the theme styles it, the sanitizer allows it, the
   extractor maps it. Define the hook once → all five stay in sync.
4. **Stable IDs.** Block-level elements carry an `id` (slug of their text) for deep
   links, TOC, and AI/MCP block addressing.

## Conventions

| Thing | Convention | Example |
|---|---|---|
| Component hook | `data-dc="<name>"` on a standard tag | `<aside data-dc="callout">` |
| Variant | `data-variant="<v>"` | `data-variant="warning"` |
| Params | `data-*` | `data-time="2024"` |
| Theme styling | class `dc-<name>` + CSS custom props | `.dc-callout { --callout-bg: … }` |
| Code language | `class="language-<lang>"` on `<code>` | `<code class="language-go">` |

> Align `data-dc`/`dc-` with your component library's actual convention before building.
> Everything below assumes this one; swap the namespace in one place if it differs.

## Part A — Primitives (plain HTML, theme-styled, no JS)

| Element | Canonical HTML | Attrs allowed | Extractor type |
|---|---|---|---|
| Heading | `<h2 id="…">` … `<h4>` | `id` | `heading` (level, text) |
| Paragraph | `<p>` | — | `text` |
| List | `<ul>`/`<ol>` > `<li>` | — | `list` |
| Quote | `<blockquote>` | — | `quote` |
| Code block | `<pre><code class="language-x">` | `class` | `code` (lang) |
| Inline code | `<code>` | — | inline |
| Table | `<table><thead><tbody><tr><th><td>` | — | `table` |
| Link | `<a href rel target>` | `href,rel,target,title` | inline |
| Image | `<figure><img src alt><figcaption>` | `src,alt,width,height` | `image` (alt) |
| Rule | `<hr>` | — | skip |
| Marks | `strong em u s mark sub sup code a` | per above | inline |

- `h1` is the page **title** (the `title` field), not written in the body.
- Images `src` point at `/__media/…` (the DCMS media pipeline).

## Part B — Components (enhanced via hook, degrade to valid HTML)

The pattern: **authored shape is already meaningful**; the hook upgrades it.

| Component | Authored HTML | Degrades to | Enhanced to | Extractor |
|---|---|---|---|---|
| Callout | `<aside data-dc="callout" data-variant="note">…</aside>` | bordered box (CSS) | icon + color by variant | `callout` |
| Details | `<details><summary>…</summary>…</details>` | native disclosure | styled, animated | `details` |
| Tabs | `<div data-dc="tabs"><section data-tab="A">…</section>…</div>` | stacked sections w/ headings | tab bar | `tabs` (flatten) |
| Steps | `<ol data-dc="steps"><li>…</li></ol>` | numbered list | stepper rail | `list` |
| Timeline | `<ol data-dc="timeline"><li data-time="…">…</li></ol>` | list | timeline rail | `list` |
| Code group | `<div data-dc="code-group"><pre>…</pre>…</div>` | stacked code blocks | tabbed code | `code` ×n |
| Cards | `<div data-dc="cards"><a class="dc-card">…</a>…</div>` | link list | grid | `list` |

Rule of thumb: pick the tag whose **native meaning already matches** (steps → `<ol>`,
details → `<details>`), then add the hook. That's what makes it degrade cleanly and
extract cleanly.

## Part C — What each consumer does with it

- **Editor** — toolbar inserts the canonical shapes; stamps block `id`s; emits semantic
  tags, no structural inline styles.
- **Component library** — on load, scans `[data-dc]` and enhances. CSS handles the
  degraded look so the no-JS form is still styled.
- **Theme** — styles primitives + `.dc-*` components via classes and CSS custom props;
  a theme can override any `--dc-*` var. Content inherits theme typography + dark mode.
- **Sanitizer (server, on write)** — allowlist = the tags/attrs in Parts A–B + the
  `data-dc`/`data-variant`/`data-*`/`language-*` namespace. Strip everything else.
  (bluemonday policy generated from this table.)
- **Extractor (search/AI)** — walks the HTML → the block index below.

## Part D — Derived block index (search / AI / MCP)

Computed from `body` at write/index time. Not stored as source.

```json
{
  "text": "flattened plain text for FTS / Pagefind",
  "outline": [{ "level": 2, "text": "Install", "id": "install" }],
  "blocks": [
    { "id": "install", "type": "heading", "text": "Install" },
    { "id": "b2", "type": "code", "lang": "go", "text": "go run ." },
    { "id": "b3", "type": "callout", "variant": "warning", "text": "…" }
  ]
}
```

- **FTS / Pagefind** consume `text`. **Embeddings** chunk by `outline` + `blocks`.
- **AI / MCP** address by block `id` ("answer from `#install`").
- Code blocks: index as text, tagged with `lang` (so "find Python examples" works).

## Part E — Decisions to lock before building

- [ ] Confirm the `data-dc` / `dc-` namespace matches the component library.
- [ ] Which components ship v1 (suggest: callout, details, tabs, steps, code-group).
- [ ] Sanitizer: trusted-authors-only now, or enforce the allowlist on write from day 1.
- [ ] Block-id scheme (slug + collision suffix).

## What you change on your end (component library)

- Enhance on `[data-dc="<name>"]`; **never require JS** for the content to read.
- Ship the library JS with the **static export** so enhancement runs on the CDN.
- Expose per-component CSS custom props (`--dc-callout-bg`, …) so themes restyle without
  forking the library.
