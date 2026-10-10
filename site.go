package main

import (
	"context"
	"embed"
	"encoding/json"
	"html/template"
	"mime"
	"net/http"
	"path"
	"strings"
	"time"

	dcms "github.com/blazing-Gael/dcms"
)

//go:embed themes
var themesFS embed.FS

// The rich-text engine (shared across themes, so served from /editor rather than a
// theme's assets). It runs only in edit mode on the live server — never in a static
// export. See editor/README.md and docs/ELEMENT_CONTRACT.md.
//
//go:embed editor/editor.js
var editorJS []byte

// The wui component library (float + tooltip), shared across themes and used on both
// the reading site and the editor chrome. Served from /wui and copied into a static
// export so tooltips work on the CDN too.
//
//go:embed wui
var wuiFS embed.FS

// publishedFilter restricts a pages query to published rows. A custom route's Store
// is the privileged handle (no gateway lifecycle filtering), so public serving must
// filter drafts out itself. See docs/ARCHITECTURE.md in the dcms repo.
var publishedFilter = dcms.Filter{Field: "_status", Operator: dcms.Eq, Value: "published"}

// Site holds the parsed theme templates and serves the rendered documentation.
type Site struct {
	theme      string
	tmpl       *template.Template
	feedbackRL *rateLimiter // per-IP limit on the public feedback route
}

// navNode is one entry in the sidebar tree. Its shape decides how a theme renders it:
//   - Kind=="label": a static section header (not clickable, not collapsible).
//   - HasPage: it links to /p/<Slug>.
//   - len(Children)>0: it's collapsible (a dropdown).
//
// A node can be both a link and a dropdown (HasPage && has children).
type navNode struct {
	ID       string // page id — lets edit-mode drag-and-drop PATCH the right record
	Title    string
	Slug     string
	Kind     string // "page" | "label"
	HasPage  bool   // kind==page and body is non-empty → routable link
	Current  bool
	Children []navNode
}

// pageView is the data every theme template receives.
type pageView struct {
	SiteName  string
	Title     string
	Nav       []navNode
	Content   template.HTML // rendered page body (page/edit view)
	HomeIntro template.HTML // rendered site intro (home view)

	// Prev/next page in reading order (nil on the home page or at the ends).
	Prev *navNode
	Next *navNode

	TOC []Heading // headings for the "On this page" column (reading view)

	// Page-header extras — the row under the H1 (all optional, render when set).
	Description string   // subtext under the title
	Author      string   // byline
	Badges      []string // pills (parsed from the comma-separated field)
	BadgesRaw   string   // the comma-separated field verbatim (edit-mode input)
	MDUrl       string   // where this page's Markdown lives (Copy/AI-chat actions)

	PageID        string // current page id (feedback widget + editor comments)
	Updated       string // "last updated" date, pre-formatted
	FeedbackEmail string // site's feedback email policy: none | optional | required

	// Read-view extras (set when a logged-in editor is previewing).
	CanEdit  bool   // show the Edit pencil + preview drafts
	EditSlug string // slug to edit from the current page ("" on home)
	Draft    bool   // current page is an unpublished draft → badge

	// Edit-view extras.
	EditID    string // id of the page being edited
	Published bool   // current status is published (toggles the topbar action)
}

// canEdit reports whether a principal may enter edit mode / preview drafts.
func canEdit(p dcms.Principal) bool {
	return p.Authenticated && (p.HasRole("admin") || p.HasRole("editor"))
}

func newSite(theme string) (*Site, error) {
	if theme == "" {
		theme = "classic"
	}
	t, err := template.ParseFS(themesFS, "themes/"+theme+"/*.html")
	if err != nil {
		return nil, err
	}
	return &Site{theme: theme, tmpl: t, feedbackRL: newRateLimiter(5, 10*time.Minute)}, nil
}

func (s *Site) mount(app *dcms.App) {
	app.Route("GET", "/", s.handleHome)
	app.Route("GET", "/p/{slug}", s.handlePage)
	app.Route("GET", "/__md/{slug}", s.handlePageMarkdown)
	app.Route("GET", "/__edit/{slug}", s.handleEdit)
	app.Route("GET", "/assets/*", s.handleAsset)
	app.Route("GET", "/editor/editor.js", s.handleEditorJS)
	app.Route("GET", "/wui/*", s.handleWui)
	app.Route("GET", "/__nav", s.handleNavData)
	app.Route("POST", "/__feedback", s.handleFeedback)
	app.Route("GET", "/__search-index.json", s.handleSearchIndex)
	app.Route("POST", "/__export", s.handleExport)
}

func (s *Site) handleHome(req *dcms.Request) {
	ctx := req.R.Context()
	site := firstSite(ctx, req.Store)
	if !s.allowed(req, site) {
		return
	}
	preview := canEdit(req.Principal)
	nav, err := s.buildNav(ctx, req.Store, "", preview)
	if err != nil {
		http.Error(req.W, err.Error(), http.StatusInternalServerError)
		return
	}
	s.render(req.W, "home", pageView{SiteName: siteName(site), Title: siteName(site), Nav: nav, HomeIntro: bodyHTML(site["home_intro"]), CanEdit: preview})
}

func (s *Site) handlePage(req *dcms.Request) {
	ctx := req.R.Context()
	site := firstSite(ctx, req.Store)
	if !s.allowed(req, site) {
		return
	}
	preview := canEdit(req.Principal)
	slug := path.Base(req.R.URL.Path) // "/p/{slug}" → slug
	rec, ok := s.lookupPage(ctx, req.Store, slug, preview)
	if !ok {
		http.NotFound(req.W, req.R)
		return
	}
	nav, _ := s.buildNav(ctx, req.Store, slug, preview)
	prev, next := neighbors(nav, slug)
	content, toc := withHeadingIDs(str(rec["body"]))
	s.render(req.W, "page", pageView{
		SiteName:      siteName(site),
		Title:         str(rec["title"]),
		Nav:           nav,
		Content:       content,
		TOC:           toc,
		Prev:          prev,
		Next:          next,
		Description:   str(rec["description"]),
		Author:        str(rec["author"]),
		Badges:        splitBadges(str(rec["badges"])),
		MDUrl:         "/__md/" + slug,
		PageID:        str(rec["id"]),
		Updated:       fmtDate(rec["updated_at"]),
		FeedbackEmail: str(site["feedback_email"]),
		CanEdit:       preview,
		EditSlug:      slug,
		Draft:         str(rec["_status"]) != "published",
	})
}

// handleEdit renders a page in the chosen theme's edit mode: the same shell and
// sidebar, an editable content region, and a Save/Publish/Export topbar. Gated to
// editors/admins.
func (s *Site) handleEdit(req *dcms.Request) {
	if !canEdit(req.Principal) {
		http.Redirect(req.W, req.R, "/__admin", http.StatusFound)
		return
	}
	ctx := req.R.Context()
	site := firstSite(ctx, req.Store)
	slug := path.Base(req.R.URL.Path) // "/__edit/{slug}" → slug
	rec, ok := s.lookupPage(ctx, req.Store, slug, true)
	if !ok {
		http.NotFound(req.W, req.R)
		return
	}
	nav, _ := s.buildNav(ctx, req.Store, slug, true)
	prev, next := neighbors(nav, slug)
	s.render(req.W, "edit", pageView{
		SiteName:    siteName(site),
		Title:       str(rec["title"]),
		Nav:         nav,
		Content:     bodyHTML(rec["body"]),
		Prev:        prev,
		Next:        next,
		Description: str(rec["description"]),
		Author:      str(rec["author"]),
		BadgesRaw:   str(rec["badges"]),
		MDUrl:       "/__md/" + slug,
		CanEdit:     true,
		EditSlug:    slug,
		EditID:      str(rec["id"]),
		Published:   str(rec["_status"]) == "published",
		Draft:       str(rec["_status"]) != "published",
	})
}

// lookupPage finds one page by slug. When includeAll is false (public), only a
// published page matches; when true (editor preview/edit), drafts match too.
func (s *Site) lookupPage(ctx context.Context, st dcms.HookStore, slug string, includeAll bool) (dcms.Record, bool) {
	filters := []dcms.Filter{{Field: "slug", Operator: dcms.Eq, Value: slug}}
	if !includeAll {
		filters = append(filters, publishedFilter)
	}
	pages, err := findAll(ctx, st, dcms.Query{Collection: "pages", Limit: 1, Filters: filters})
	if err != nil || len(pages) == 0 {
		return nil, false
	}
	return pages[0], true
}

// handleAsset serves a theme static asset from the embedded FS.
func (s *Site) handleAsset(req *dcms.Request) {
	rel := path.Clean("/" + req.R.URL.Path[len("/assets/"):]) // leading-slash clean blocks ../ traversal
	data, err := themesFS.ReadFile("themes/" + s.theme + "/assets" + rel)
	if err != nil {
		http.NotFound(req.W, req.R)
		return
	}
	if ct := mime.TypeByExtension(path.Ext(rel)); ct != "" {
		req.W.Header().Set("Content-Type", ct)
	}
	_, _ = req.W.Write(data)
}

// handleEditorJS serves the embedded rich-text engine. Edit-mode only, but harmless
// to serve unauthenticated — it's a static script, and edit routes gate separately.
func (s *Site) handleEditorJS(req *dcms.Request) {
	req.W.Header().Set("Content-Type", "application/javascript; charset=utf-8")
	_, _ = req.W.Write(editorJS)
}

// handleNavData returns the whole page tree (incl. drafts) as a flat JSON list for
// edit-mode sidebar drag-and-drop. Edit-gated: it exposes draft titles/structure.
func (s *Site) handleNavData(req *dcms.Request) {
	if !canEdit(req.Principal) {
		http.Error(req.W, "forbidden", http.StatusForbidden)
		return
	}
	pages, err := findAll(req.R.Context(), req.Store, dcms.Query{Collection: "pages", Sort: "order"})
	if err != nil {
		http.Error(req.W, err.Error(), http.StatusInternalServerError)
		return
	}
	type node struct {
		ID     string `json:"id"`
		Parent string `json:"parent"`
		Title  string `json:"title"`
		Slug   string `json:"slug"`
		Kind   string `json:"kind"`
		Order  int    `json:"order"`
	}
	out := make([]node, 0, len(pages))
	for _, p := range pages {
		out = append(out, node{
			ID: str(p["id"]), Parent: str(p["parent"]), Title: str(p["title"]),
			Slug: str(p["slug"]), Kind: str(p["kind"]), Order: toInt(p["order"]),
		})
	}
	req.W.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(req.W).Encode(out)
}

// handleWui serves the embedded wui component files (float.js, tooltip.js, tooltip.css).
func (s *Site) handleWui(req *dcms.Request) {
	rel := path.Clean("/" + req.R.URL.Path[len("/wui/"):]) // leading-slash clean blocks ../ traversal
	data, err := wuiFS.ReadFile("wui" + rel)
	if err != nil {
		http.NotFound(req.W, req.R)
		return
	}
	if ct := mime.TypeByExtension(path.Ext(rel)); ct != "" {
		req.W.Header().Set("Content-Type", ct)
	}
	_, _ = req.W.Write(data)
}

// allowed enforces the private-site gate at the HTML layer: a private site requires
// an authenticated caller. (The raw REST API read rule is separate — see README
// "Private docs" for the v1 limitation.) Returns false and writes a response when
// access is denied.
func (s *Site) allowed(req *dcms.Request, site dcms.Record) bool {
	if str(site["visibility"]) == "private" && !req.Principal.Authenticated {
		http.Redirect(req.W, req.R, "/__admin", http.StatusFound)
		return false
	}
	return true
}

func (s *Site) render(w http.ResponseWriter, name string, data pageView) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := s.tmpl.ExecuteTemplate(w, name, data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

// buildNav loads the nodes and assembles the sidebar tree, ordered by `order` within
// each set of siblings. `current` is the slug of the page being viewed (to mark the
// active link). When includeAll is true (an editor previewing/editing), draft nodes
// are included; otherwise only published ones.
func (s *Site) buildNav(ctx context.Context, st dcms.HookStore, current string, includeAll bool) ([]navNode, error) {
	q := dcms.Query{Collection: "pages", Sort: "order"}
	if !includeAll {
		q.Filters = []dcms.Filter{publishedFilter}
	}
	pages, err := findAll(ctx, st, q)
	if err != nil {
		return nil, err
	}
	// Group by parent id ("" = root). Input is already ordered, so each slice keeps
	// its siblings in order.
	childrenOf := map[string][]dcms.Record{}
	for _, p := range pages {
		childrenOf[str(p["parent"])] = append(childrenOf[str(p["parent"])], p)
	}
	var build func(parentID string) []navNode
	build = func(parentID string) []navNode {
		var out []navNode
		for _, p := range childrenOf[parentID] {
			kind := str(p["kind"])
			if kind == "" {
				kind = "page"
			}
			slug := str(p["slug"])
			out = append(out, navNode{
				ID:       str(p["id"]),
				Title:    str(p["title"]),
				Slug:     slug,
				Kind:     kind,
				HasPage:  kind == "page" && str(p["body"]) != "",
				Current:  current != "" && slug == current,
				Children: build(str(p["id"])),
			})
		}
		return out
	}
	return build(""), nil
}

// neighbors returns the previous and next routable pages around `slug` in reading
// order — the nav tree flattened depth-first, keeping only nodes that link to a page.
// Either is nil at an end. This is how the footer pager stays in sync with the nav.
func neighbors(nav []navNode, slug string) (prev, next *navNode) {
	var flat []navNode
	var walk func([]navNode)
	walk = func(ns []navNode) {
		for _, n := range ns {
			if n.HasPage {
				flat = append(flat, n)
			}
			walk(n.Children)
		}
	}
	walk(nav)
	for i := range flat {
		if flat[i].Slug == slug {
			if i > 0 {
				prev = &flat[i-1]
			}
			if i < len(flat)-1 {
				next = &flat[i+1]
			}
			return
		}
	}
	return
}

// findAll pages through the store (Find caps each page at ~100 rows) and returns
// every matching record.
func findAll(ctx context.Context, st dcms.HookStore, q dcms.Query) ([]dcms.Record, error) {
	var out []dcms.Record
	for {
		page, err := st.Find(ctx, q)
		if err != nil {
			return nil, err
		}
		out = append(out, page.Data...)
		if page.NextCursor == "" {
			break
		}
		q.Cursor = page.NextCursor
	}
	return out, nil
}

// firstSite returns the single site this scaffold serves. Multi-site routing (by
// host or path prefix) is a TODO; see README.
func firstSite(ctx context.Context, st dcms.HookStore) dcms.Record {
	sites, err := findAll(ctx, st, dcms.Query{Collection: "sites", Limit: 1})
	if err != nil || len(sites) == 0 {
		return dcms.Record{}
	}
	return sites[0]
}

func siteName(site dcms.Record) string {
	if n := str(site["name"]); n != "" {
		return n
	}
	return "Docs"
}

func str(v any) string {
	s, _ := v.(string)
	return s
}

// splitBadges turns the comma-separated `badges` field into trimmed, non-empty pills.
func splitBadges(s string) []string {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	var out []string
	for _, part := range strings.Split(s, ",") {
		if p := strings.TrimSpace(part); p != "" {
			out = append(out, p)
		}
	}
	return out
}

// fmtDate renders a stored timestamp (time.Time or an RFC3339 string) as M/D/YYYY,
// matching the "Last updated on 10/9/2026" line. Empty when unparseable.
func fmtDate(v any) string {
	var t time.Time
	switch x := v.(type) {
	case time.Time:
		t = x
	case string:
		p, err := time.Parse(time.RFC3339, x)
		if err != nil {
			return ""
		}
		t = p
	default:
		return ""
	}
	return t.Format("1/2/2006")
}

// toInt coerces a stored numeric field (the store may hand back int64 or float64).
func toInt(v any) int {
	switch n := v.(type) {
	case int:
		return n
	case int64:
		return int(n)
	case float64:
		return int(n)
	}
	return 0
}

// bodyHTML returns a stored HTML body (what the DOM editor produces) as template
// content, injected as-is. Bodies are authored by a trusted, authenticated editor
// (admin/editor role). NOTE: for defense-in-depth against a compromised editor
// session, sanitize on write (e.g. bluemonday) before storing — tracked as a TODO.
// Markdown is only an import/export convenience; it is not the stored format.
func bodyHTML(v any) template.HTML {
	s, _ := v.(string)
	return template.HTML(s) //nolint:gosec // trusted author-authored content
}
