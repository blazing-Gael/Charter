package main

import (
	"net/http"
	"path"
	"strings"

	dcms "github.com/blazing-Gael/dcms"
	"golang.org/x/net/html"
)

// handlePageMarkdown serves a page as Markdown (text/markdown). It powers the page
// header's "Copy page / View as Markdown / Open in ChatGPT|Claude" actions and gives
// LLMs a clean, token-cheap view of the content. Drafts are editor-only, same as the
// HTML page. Route: GET /__md/{slug}.
func (s *Site) handlePageMarkdown(req *dcms.Request) {
	ctx := req.R.Context()
	site := firstSite(ctx, req.Store)
	if !s.allowed(req, site) {
		return
	}
	preview := canEdit(req.Principal)
	slug := strings.TrimSuffix(path.Base(req.R.URL.Path), ".md")
	rec, ok := s.lookupPage(ctx, req.Store, slug, preview)
	if !ok {
		http.NotFound(req.W, req.R)
		return
	}
	req.W.Header().Set("Content-Type", "text/markdown; charset=utf-8")
	_, _ = req.W.Write([]byte(pageMarkdown(str(rec["title"]), str(rec["description"]), str(rec["body"]))))
}

// pageMarkdown renders a page to Markdown: an H1 title, an optional italic lead, then
// the body converted from its stored HTML. Parsing failure falls back to the title
// plus the raw body so the output is never empty.
func pageMarkdown(title, description, body string) string {
	var b strings.Builder
	if title != "" {
		b.WriteString("# ")
		b.WriteString(title)
		b.WriteString("\n\n")
	}
	if strings.TrimSpace(description) != "" {
		b.WriteString("> ")
		b.WriteString(strings.TrimSpace(description))
		b.WriteString("\n\n")
	}
	b.WriteString(htmlToMarkdown(body))
	out := strings.TrimRight(b.String(), "\n")
	return out + "\n"
}

// htmlToMarkdown converts the constrained HTML the editor produces (headings, lists,
// quotes, code, tables, links, marks, images, callouts) into Markdown. It is best-
// effort: unknown wrappers are descended into, so nothing is silently dropped.
func htmlToMarkdown(body string) string {
	doc, err := html.Parse(strings.NewReader(body))
	if err != nil {
		return strings.TrimSpace(body)
	}
	bod := findBody(doc)
	if bod == nil {
		return strings.TrimSpace(body)
	}
	m := &mdConv{}
	for c := bod.FirstChild; c != nil; c = c.NextSibling {
		m.block(c)
	}
	// Collapse 3+ blank lines to a single blank line.
	lines := strings.Split(m.sb.String(), "\n")
	var out []string
	blank := 0
	for _, ln := range lines {
		if strings.TrimSpace(ln) == "" {
			blank++
			if blank > 1 {
				continue
			}
		} else {
			blank = 0
		}
		out = append(out, strings.TrimRight(ln, " "))
	}
	return strings.TrimSpace(strings.Join(out, "\n"))
}

type mdConv struct{ sb strings.Builder }

// block renders a block-level node, followed by a blank line.
func (m *mdConv) block(n *html.Node) {
	if n.Type == html.TextNode {
		if strings.TrimSpace(n.Data) != "" {
			m.sb.WriteString(strings.TrimSpace(n.Data))
			m.sb.WriteString("\n\n")
		}
		return
	}
	if n.Type != html.ElementNode {
		return
	}

	// Component hooks win over the tag (match extract.go's classification).
	if hasAttr(n, "data-callout") {
		m.callout(n)
		return
	}
	// wui tabs / code-group: a .wui-tab-list of labels over .wui-tab-panel sections.
	// Markdown has no tabs, so each panel becomes an h4 of its label + its content
	// (code-group panels wrap a <pre>, so they fence as code blocks).
	if hasClass(n, "wui-tabs") {
		m.tabs(n)
		return
	}
	if hasAttr(n, "data-code-group") {
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			if c.Type == html.ElementNode && c.Data == "pre" {
				m.codeBlock(c)
			}
		}
		return
	}

	switch n.Data {
	case "h1", "h2", "h3", "h4", "h5", "h6":
		m.sb.WriteString(strings.Repeat("#", int(n.Data[1]-'0')) + " " + m.inline(n) + "\n\n")
	case "p":
		if t := strings.TrimSpace(m.inline(n)); t != "" {
			m.sb.WriteString(t + "\n\n")
		}
	case "ul":
		m.list(n, false, 0)
		m.sb.WriteString("\n")
	case "ol":
		m.list(n, true, 0)
		m.sb.WriteString("\n")
	case "blockquote":
		for _, ln := range strings.Split(strings.TrimSpace(m.inlineBlocks(n)), "\n") {
			m.sb.WriteString("> " + ln + "\n")
		}
		m.sb.WriteString("\n")
	case "pre":
		m.codeBlock(n)
	case "table":
		m.table(n)
	case "figure", "img":
		img := n
		if n.Data != "img" {
			img = firstDesc(n, "img")
		}
		if img != nil {
			m.sb.WriteString("![" + attr(img, "alt") + "](" + attr(img, "src") + ")\n\n")
		}
	case "hr":
		m.sb.WriteString("---\n\n")
	case "details":
		m.sb.WriteString(strings.TrimSpace(m.inlineBlocks(n)) + "\n\n")
	default:
		// Unknown wrapper (bare div/section): descend so nested blocks survive.
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			m.block(c)
		}
	}
}

// callout renders aside[data-callout] as a GitHub-style blockquote admonition.
func (m *mdConv) callout(n *html.Node) {
	tone := attr(n, "data-callout-tone")
	kind := map[string]string{"info": "NOTE", "success": "TIP", "warn": "WARNING", "danger": "CAUTION"}[tone]
	if kind == "" {
		kind = "NOTE"
	}
	m.sb.WriteString("> [!" + kind + "]\n")
	for _, ln := range strings.Split(strings.TrimSpace(m.inlineBlocks(n)), "\n") {
		m.sb.WriteString("> " + ln + "\n")
	}
	m.sb.WriteString("\n")
}

// tabs renders a wui tabs / code-group block. It maps each tab link's target id to its
// label, then walks the panels: each becomes an h4 of its label followed by its content.
func (m *mdConv) tabs(n *html.Node) {
	labels := map[string]string{}
	var collect func(*html.Node)
	collect = func(x *html.Node) {
		if x.Type == html.ElementNode && x.Data == "a" && hasClass(x, "wui-tab") {
			if h := attr(x, "href"); strings.HasPrefix(h, "#") {
				labels[h[1:]] = strings.TrimSpace(m.inline(x))
			}
		}
		for c := x.FirstChild; c != nil; c = c.NextSibling {
			collect(c)
		}
	}
	collect(n)

	var panels func(*html.Node)
	panels = func(x *html.Node) {
		if x.Type == html.ElementNode && hasClass(x, "wui-tab-panel") {
			if lbl := labels[attr(x, "id")]; lbl != "" {
				m.sb.WriteString("#### " + lbl + "\n\n")
			}
			for c := x.FirstChild; c != nil; c = c.NextSibling {
				m.block(c)
			}
			return
		}
		for c := x.FirstChild; c != nil; c = c.NextSibling {
			panels(c)
		}
	}
	panels(n)
}

// codeBlock renders a <pre> as a fenced block, keeping its language.
func (m *mdConv) codeBlock(n *html.Node) {
	lang := langOf(firstDesc(n, "code"))
	m.sb.WriteString("```" + lang + "\n")
	m.sb.WriteString(strings.TrimRight(rawText(n), "\n") + "\n")
	m.sb.WriteString("```\n\n")
}

// list renders ul/ol, indenting nested lists by depth.
func (m *mdConv) list(n *html.Node, ordered bool, depth int) {
	idx := 1
	for li := n.FirstChild; li != nil; li = li.NextSibling {
		if li.Type != html.ElementNode || li.Data != "li" {
			continue
		}
		marker := "- "
		if ordered {
			marker = itoa(idx) + ". "
			idx++
		}
		// The li's own inline text (excluding nested lists).
		var nested []*html.Node
		var inlineParts strings.Builder
		for c := li.FirstChild; c != nil; c = c.NextSibling {
			if c.Type == html.ElementNode && (c.Data == "ul" || c.Data == "ol") {
				nested = append(nested, c)
				continue
			}
			inlineParts.WriteString(m.inlineNode(c))
		}
		m.sb.WriteString(strings.Repeat("  ", depth) + marker + strings.TrimSpace(inlineParts.String()) + "\n")
		for _, sub := range nested {
			m.list(sub, sub.Data == "ol", depth+1)
		}
	}
}

// table renders a GFM pipe table from the first row's cell count.
func (m *mdConv) table(n *html.Node) {
	var rows [][]string
	var walk func(*html.Node)
	walk = func(x *html.Node) {
		if x.Type == html.ElementNode && x.Data == "tr" {
			var cells []string
			for c := x.FirstChild; c != nil; c = c.NextSibling {
				if c.Type == html.ElementNode && (c.Data == "td" || c.Data == "th") {
					cells = append(cells, strings.TrimSpace(m.inline(c)))
				}
			}
			rows = append(rows, cells)
			return
		}
		for c := x.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(n)
	if len(rows) == 0 {
		return
	}
	cols := len(rows[0])
	for i, r := range rows {
		m.sb.WriteString("| " + strings.Join(pad(r, cols), " | ") + " |\n")
		if i == 0 {
			sep := make([]string, cols)
			for j := range sep {
				sep[j] = "---"
			}
			m.sb.WriteString("| " + strings.Join(sep, " | ") + " |\n")
		}
	}
	m.sb.WriteString("\n")
}

// inline renders a node's children as inline Markdown (one line).
func (m *mdConv) inline(n *html.Node) string {
	var sb strings.Builder
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		sb.WriteString(m.inlineNode(c))
	}
	return sb.String()
}

// inlineBlocks renders a container's children, keeping paragraph breaks as newlines —
// used for blockquotes and callouts that may hold several paragraphs.
func (m *mdConv) inlineBlocks(n *html.Node) string {
	var sb strings.Builder
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		if c.Type == html.ElementNode && c.Data == "p" {
			sb.WriteString(strings.TrimSpace(m.inline(c)) + "\n")
		} else {
			sb.WriteString(m.inlineNode(c))
		}
	}
	return sb.String()
}

// inlineNode renders a single inline node (text or mark).
func (m *mdConv) inlineNode(n *html.Node) string {
	if n.Type == html.TextNode {
		return n.Data
	}
	if n.Type != html.ElementNode {
		return ""
	}
	switch n.Data {
	case "strong", "b":
		return "**" + m.inline(n) + "**"
	case "em", "i":
		return "_" + m.inline(n) + "_"
	case "s", "strike", "del":
		return "~~" + m.inline(n) + "~~"
	case "code":
		return "`" + rawText(n) + "`"
	case "a":
		return "[" + m.inline(n) + "](" + attr(n, "href") + ")"
	case "br":
		return "  \n"
	case "img":
		return "![" + attr(n, "alt") + "](" + attr(n, "src") + ")"
	default:
		return m.inline(n)
	}
}

// rawText returns a node's text content verbatim (no whitespace normalization),
// for code where spacing is significant.
func rawText(n *html.Node) string {
	if n == nil {
		return ""
	}
	var sb strings.Builder
	var rec func(*html.Node)
	rec = func(x *html.Node) {
		if x.Type == html.TextNode {
			sb.WriteString(x.Data)
		}
		for c := x.FirstChild; c != nil; c = c.NextSibling {
			rec(c)
		}
	}
	rec(n)
	return sb.String()
}

func pad(r []string, n int) []string {
	for len(r) < n {
		r = append(r, "")
	}
	return r[:n]
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	return string(b[i:])
}
