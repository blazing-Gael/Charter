package main

import (
	"context"
	"encoding/json"
	"net/http"

	dcms "github.com/blazing-Gael/dcms"
)

// searchDoc is one page's entry in the content search index. It is derived from the
// body via Extract — text for matching, outline for section deep-links.
type searchDoc struct {
	Slug    string    `json:"slug"`
	Title   string    `json:"title"`
	URL     string    `json:"url"`
	Text    string    `json:"text"`
	Outline []Heading `json:"outline"`
}

// buildSearchDocs returns a content index over the published, routable pages. Labels
// and pure dropdowns (no body/route) are skipped. Mirrors Export's page selection so
// the index matches what's actually served.
func buildSearchDocs(ctx context.Context, st dcms.HookStore) ([]searchDoc, error) {
	pages, err := findAll(ctx, st, dcms.Query{Collection: "pages", Sort: "order", Filters: []dcms.Filter{publishedFilter}})
	if err != nil {
		return nil, err
	}
	docs := make([]searchDoc, 0, len(pages))
	for _, p := range pages {
		slug := str(p["slug"])
		if str(p["kind"]) == "label" || slug == "" || str(p["body"]) == "" {
			continue
		}
		idx := Extract(str(p["body"]))
		title := str(p["title"])
		docs = append(docs, searchDoc{
			Slug:    slug,
			Title:   title,
			URL:     "/p/" + slug + "/",
			Text:    title + " " + idx.Text, // title is searchable too
			Outline: idx.Outline,
		})
	}
	return docs, nil
}

// handleSearchIndex serves the live content index as JSON. The private-site gate
// applies (same as the rendered pages). The search dialog falls back to this when
// Pagefind isn't present (i.e. the live binary, or an export without the pagefind CLI).
func (s *Site) handleSearchIndex(req *dcms.Request) {
	ctx := req.R.Context()
	if !s.allowed(req, firstSite(ctx, req.Store)) {
		return
	}
	docs, err := buildSearchDocs(ctx, req.Store)
	if err != nil {
		http.Error(req.W, err.Error(), http.StatusInternalServerError)
		return
	}
	req.W.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(req.W).Encode(docs)
}
