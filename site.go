package main

import (
	"context"
	"embed"
	"html/template"
	"mime"
	"net/http"
	"path"

	dcms "github.com/blazing-Gael/dcms"
)

//go:embed themes
var themesFS embed.FS

// publishedFilter restricts a pages query to published rows. A custom route's Store
// is the privileged handle (no gateway lifecycle filtering), so public serving must
// filter drafts out itself. See docs/ARCHITECTURE.md in the dcms repo.
var publishedFilter = dcms.Filter{Field: "_status", Operator: dcms.Eq, Value: "published"}

// Site holds the parsed theme templates and serves the rendered documentation.
type Site struct {
	theme string
	tmpl  *template.Template
}

// navNode is one entry in the sidebar tree. Its shape decides how a theme renders it:
//   - Kind=="label": a static section header (not clickable, not collapsible).
//   - HasPage: it links to /p/<Slug>.
//   - len(Children)>0: it's collapsible (a dropdown).
//
// A node can be both a link and a dropdown (HasPage && has children).
type navNode struct {
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
	return &Site{theme: theme, tmpl: t}, nil
}

func (s *Site) mount(app *dcms.App) {
	app.Route("GET", "/", s.handleHome)
	app.Route("GET", "/p/{slug}", s.handlePage)
	app.Route("GET", "/__edit/{slug}", s.handleEdit)
	app.Route("GET", "/assets/*", s.handleAsset)
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
	s.render(req.W, "page", pageView{
		SiteName: siteName(site),
		Title:    str(rec["title"]),
		Nav:      nav,
		Content:  bodyHTML(rec["body"]),
		CanEdit:  preview,
		EditSlug: slug,
		Draft:    str(rec["_status"]) != "published",
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
	s.render(req.W, "edit", pageView{
		SiteName:  siteName(site),
		Title:     str(rec["title"]),
		Nav:       nav,
		Content:   bodyHTML(rec["body"]),
		CanEdit:   true,
		EditSlug:  slug,
		EditID:    str(rec["id"]),
		Published: str(rec["_status"]) == "published",
		Draft:     str(rec["_status"]) != "published",
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

// bodyHTML returns a stored HTML body (what the DOM editor produces) as template
// content, injected as-is. Bodies are authored by a trusted, authenticated editor
// (admin/editor role). NOTE: for defense-in-depth against a compromised editor
// session, sanitize on write (e.g. bluemonday) before storing — tracked as a TODO.
// Markdown is only an import/export convenience; it is not the stored format.
func bodyHTML(v any) template.HTML {
	s, _ := v.(string)
	return template.HTML(s) //nolint:gosec // trusted author-authored content
}
