package main

// Derived block index (ELEMENT_CONTRACT Part D). The page `body` is HTML; this
// walks it into a flat index the search/AI layers consume. Nothing here is the
// source of truth — it is recomputed from the body whenever needed.
//
//	text    flattened plain text (FTS / Pagefind fallback)
//	outline headings in document order (TOC, embedding chunks)
//	blocks  one entry per block element, addressable by id (AI / MCP)
//
// Element → block type follows Parts A/B. The component hooks are wui's
// data-<name> attributes (data-callout, data-tabs, …); see docs/ELEMENT_CONTRACT.md.

import (
	"fmt"
	"html/template"
	"strings"

	"golang.org/x/net/html"
)

// Heading is one entry in the outline.
type Heading struct {
	Level int    `json:"level"`
	Text  string `json:"text"`
	ID    string `json:"id"`
}

// Block is one indexed content block.
type Block struct {
	ID      string `json:"id"`
	Type    string `json:"type"`
	Text    string `json:"text,omitempty"`
	Level   int    `json:"level,omitempty"`   // heading
	Lang    string `json:"lang,omitempty"`    // code
	Variant string `json:"variant,omitempty"` // callout tone
}

// Index is the derived block index for one page body.
type Index struct {
	Text    string    `json:"text"`
	Outline []Heading `json:"outline"`
	Blocks  []Block   `json:"blocks"`
}

// Extract walks an HTML body into its derived index. A parse error yields an empty
// index rather than failing the caller (indexing is best-effort).
func Extract(body string) Index {
	doc, err := html.Parse(strings.NewReader(body))
	if err != nil {
		return Index{}
	}
	e := &extractor{seen: map[string]int{}}
	if b := findBody(doc); b != nil {
		for c := b.FirstChild; c != nil; c = c.NextSibling {
			e.walk(c)
		}
	}
	e.idx.Text = norm(e.text.String())
	return e.idx
}

type extractor struct {
	idx  Index
	text strings.Builder
	seq  int            // block counter → fallback ids b1, b2, …
	seen map[string]int // heading slug → count, for collision suffixes
}

// walk classifies one node. Component hooks (data-<name>) win over the tag; unknown
// wrappers (a bare div/section) are descended into so nested blocks still index.
func (e *extractor) walk(n *html.Node) {
	if n.Type == html.TextNode {
		e.text.WriteString(n.Data)
		e.text.WriteByte(' ')
		return
	}
	if n.Type != html.ElementNode {
		return
	}

	switch {
	case hasAttr(n, "data-callout"):
		e.add("callout", textOf(n), func(b *Block) { b.Variant = attr(n, "data-callout-tone") })
		return
	case hasAttr(n, "data-tabs"):
		e.add("tabs", textOf(n), nil)
		return
	case hasAttr(n, "data-steps"), hasAttr(n, "data-timeline"), hasAttr(n, "data-cards"):
		e.add("list", textOf(n), nil)
		return
	case hasAttr(n, "data-code-group"):
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			if c.Type == html.ElementNode && c.Data == "pre" {
				lang := langOf(firstDesc(c, "code"))
				e.add("code", textOf(c), func(b *Block) { b.Lang = lang })
			}
		}
		return
	}

	switch n.Data {
	case "h1", "h2", "h3", "h4", "h5", "h6":
		e.heading(int(n.Data[1]-'0'), textOf(n))
	case "p":
		e.add("text", textOf(n), nil)
	case "ul", "ol":
		e.add("list", textOf(n), nil)
	case "blockquote":
		e.add("quote", textOf(n), nil)
	case "pre":
		lang := langOf(firstDesc(n, "code"))
		e.add("code", textOf(n), func(b *Block) { b.Lang = lang })
	case "table":
		e.add("table", textOf(n), nil)
	case "figure", "img":
		e.add("image", attr(firstDesc(n, "img"), "alt"), nil)
	case "details":
		e.add("details", textOf(n), nil)
	case "hr":
		// skip — no content
	default:
		// inline mark or unknown wrapper: descend to catch nested blocks + text
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			e.walk(c)
		}
	}
}

func (e *extractor) add(typ, text string, mod func(*Block)) {
	e.seq++
	b := Block{ID: fmt.Sprintf("b%d", e.seq), Type: typ, Text: text}
	if mod != nil {
		mod(&b)
	}
	e.idx.Blocks = append(e.idx.Blocks, b)
	e.text.WriteString(text)
	e.text.WriteByte(' ')
}

func (e *extractor) heading(level int, text string) {
	e.seq++
	id := e.headingID(text)
	e.idx.Blocks = append(e.idx.Blocks, Block{ID: id, Type: "heading", Text: text, Level: level})
	e.idx.Outline = append(e.idx.Outline, Heading{Level: level, Text: text, ID: id})
	e.text.WriteString(text)
	e.text.WriteByte(' ')
}

// headingID slugs the heading text; on collision it appends -2, -3, … in document order.
func (e *extractor) headingID(text string) string {
	base := slugify(text)
	if base == "" {
		base = "section"
	}
	e.seen[base]++
	if e.seen[base] == 1 {
		return base
	}
	return fmt.Sprintf("%s-%d", base, e.seen[base])
}

// ── html helpers ──────────────────────────────────────────────────────────

func findBody(n *html.Node) *html.Node {
	if n.Type == html.ElementNode && n.Data == "body" {
		return n
	}
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		if b := findBody(c); b != nil {
			return b
		}
	}
	return nil
}

// firstDesc returns the first descendant element with the given tag (nil if none).
func firstDesc(n *html.Node, tag string) *html.Node {
	if n == nil {
		return nil
	}
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		if c.Type == html.ElementNode && c.Data == tag {
			return c
		}
		if d := firstDesc(c, tag); d != nil {
			return d
		}
	}
	return nil
}

// textOf gathers all descendant text, whitespace-normalized.
func textOf(n *html.Node) string {
	if n == nil {
		return ""
	}
	var sb strings.Builder
	var rec func(*html.Node)
	rec = func(x *html.Node) {
		if x.Type == html.TextNode {
			sb.WriteString(x.Data)
			sb.WriteByte(' ')
		}
		for c := x.FirstChild; c != nil; c = c.NextSibling {
			rec(c)
		}
	}
	rec(n)
	return norm(sb.String())
}

func hasAttr(n *html.Node, key string) bool {
	for _, a := range n.Attr {
		if a.Key == key {
			return true
		}
	}
	return false
}

func attr(n *html.Node, key string) string {
	if n == nil {
		return ""
	}
	for _, a := range n.Attr {
		if a.Key == key {
			return a.Val
		}
	}
	return ""
}

// langOf reads a code block's language from class="language-<lang>".
func langOf(code *html.Node) string {
	for _, c := range strings.Fields(attr(code, "class")) {
		if lang, ok := strings.CutPrefix(c, "language-"); ok {
			return lang
		}
	}
	return ""
}

func norm(s string) string { return strings.Join(strings.Fields(s), " ") }

// withHeadingIDs stamps an id on every h2–h4 in a page body (slug of its text,
// collision-suffixed) and returns the rewritten HTML plus the outline — so the "On
// this page" TOC can link to #id and a scrollspy can observe them. Headings that
// already carry an id keep it. A parse failure returns the body untouched.
func withHeadingIDs(body string) (template.HTML, []Heading) {
	doc, err := html.Parse(strings.NewReader(body))
	if err != nil {
		return template.HTML(body), nil //nolint:gosec // trusted author content
	}
	b := findBody(doc)
	if b == nil {
		return template.HTML(body), nil //nolint:gosec // trusted author content
	}
	seen := map[string]int{}
	var outline []Heading
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode && len(n.Data) == 2 && n.Data[0] == 'h' && n.Data[1] >= '2' && n.Data[1] <= '4' {
			text := textOf(n)
			id := attr(n, "id")
			if id == "" {
				id = uniqueSlug(slugify(text), seen)
				n.Attr = append(n.Attr, html.Attribute{Key: "id", Val: id})
			}
			outline = append(outline, Heading{Level: int(n.Data[1] - '0'), Text: text, ID: id})
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(b)
	var sb strings.Builder
	for c := b.FirstChild; c != nil; c = c.NextSibling {
		_ = html.Render(&sb, c)
	}
	return template.HTML(sb.String()), outline //nolint:gosec // trusted author content
}

// uniqueSlug returns base, or base-2/base-3/… on repeat, tracking counts in `seen`.
func uniqueSlug(base string, seen map[string]int) string {
	if base == "" {
		base = "section"
	}
	seen[base]++
	if seen[base] == 1 {
		return base
	}
	return fmt.Sprintf("%s-%d", base, seen[base])
}

// slugify lowercases and keeps [a-z0-9], collapsing any other run to a single dash.
func slugify(s string) string {
	var b strings.Builder
	dash := false
	for _, r := range strings.ToLower(s) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			dash = false
		default:
			if !dash && b.Len() > 0 {
				b.WriteByte('-')
				dash = true
			}
		}
	}
	return strings.Trim(b.String(), "-")
}
