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

Matches the **wui** component library (`D:/dev/wevmail/wui`). Locked, not provisional.

| Thing | Convention | Example |
|---|---|---|
| Component hook | `data-<name>` boolean attr on the host tag | `<aside data-callout>` |
| Variant / param | `data-<name>-<mod>` (namespaced to the component) | `data-callout-tone="warn"` |
| Tones | `danger · success · warn · info` (+ default) — house vocabulary | `data-callout-tone="danger"` |
| Enhance API | `window.wui.<name>(sel, opts)`, auto-runs on `[data-<name>]` at load; `.refresh(el)` | `wui.tabs('[data-tabs]')` |
| Theme styling | `--wui-<name>-*` custom props (fallback chain `--wui-* / --c-*`) | `--wui-callout-bg` |
| Dark mode | tokens redefined under `html.dark` | `html.dark { --wui-callout-bg: … }` |
| Icons | Phosphor via unpkg | `<i class="ph ph-warning"></i>` |
| Code language | `class="language-<lang>"` on `<code>` | `<code class="language-go">` |

- wui keeps the **native/semantic tag as source of truth**; JS generates the enhanced UI as a sibling; it degrades to valid HTML with no JS. Content components follow the same rule.
- Generated shell DOM uses an `x<name>` class prefix (`.xsel`, `.xsel-trigger`); CSS-only components (checkbox/radio/switch/cards) ship just a stylesheet.
- **Reuse today:** `tooltip` (+ its tone vocab), `float` (top-layer placer), `segments`. **To build new in wui style:** `callout`, `tabs`, `steps`, `code-group`.

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
| Callout | `<aside data-callout data-callout-tone="warn">…</aside>` | bordered box (CSS) | icon + color by tone | `callout` |
| Details | `<details><summary>…</summary>…</details>` | native disclosure | styled, animated | `details` |
| Tabs | `<div data-tabs><section data-tabs-tab="A">…</section>…</div>` | stacked sections w/ headings | tab bar | `tabs` (flatten) |
| Steps | `<ol data-steps><li>…</li></ol>` | numbered list | stepper rail | `list` |
| Timeline | `<ol data-timeline><li data-timeline-at="…">…</li></ol>` | list | timeline rail | `list` |
| Code group | `<div data-code-group><pre>…</pre>…</div>` | stacked code blocks | tabbed code | `code` ×n |
| Cards | `<div data-cards><a class="xcard">…</a>…</div>` | link list | grid | `list` |

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
  `data-<name>` / `data-<name>-*` / `language-*` namespace. Strip everything else.
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

## Part E — Decisions (locked)

- **Namespace:** wui's `data-<name>` + `data-<name>-<mod>` + `--wui-<name>-*`. Settled against the real library.
- **v1 components:** `callout`, `details` (native), `tabs`, `steps`, `code-group`. Timeline + cards later.
- **Sanitizer:** trusted-authors-only for v1 (inject HTML as-is, as today); generate the bluemonday allowlist from Parts A–B before opening authoring to untrusted roles.
- **Block IDs:** slug of the element text; on collision append `-2`, `-3`, … in document order.

## What you change on your end (component library)

- The 4 v1 content components (`callout`/`tabs`/`steps`/`code-group`) are **new wui components** — none exist yet. Author them in the house style: `data-<name>` hook, `window.wui.<name>` auto-enhancing on load, `--wui-<name>-*` tokens, Phosphor icons, native/degraded form valid without JS. `tooltip`/`float`/`segments` are reusable as-is.
- Ship the wui JS/CSS with the **static export** so enhancement runs on the CDN.
- Keep the fallback chain (`--wui-* / --c-*`) so a theme restyles via tokens without forking.

## What the theme changes (classic)

- **Bridge tokens:** alias `--wui-accent/-bg/-surface/-border/-hair/-text/-muted/-hover` to classic's own tokens (and under its dark selector) so wui components inherit the theme. Classic already loads Phosphor + Google fonts — no new deps.
