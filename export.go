package main

import (
	"context"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"

	dcms "github.com/blazing-Gael/dcms"
)

// handleExport builds the static site into ./public. Admin-only: static export is a
// publish action. The editor's "Export" button POSTs here.
func (s *Site) handleExport(req *dcms.Request) {
	if !req.Principal.Authenticated || !req.Principal.HasRole("admin") {
		http.Error(req.W, "export requires an admin", http.StatusForbidden)
		return
	}
	n, err := s.Export(req.R.Context(), req.Store, "public")
	if err != nil {
		http.Error(req.W, err.Error(), http.StatusInternalServerError)
		return
	}
	fmt.Fprintf(req.W, "exported %d page(s) to ./public\n", n)
}

// Export renders the published site to a directory of static files:
//
//	outDir/index.html            the homepage
//	outDir/p/<slug>/index.html   each published page (clean URLs: /p/<slug>/)
//	outDir/assets/...            the theme's static assets
//
// then runs Pagefind over it if the `pagefind` binary is on PATH. The result is a
// self-contained folder to drop on any CDN.
func (s *Site) Export(ctx context.Context, st dcms.HookStore, outDir string) (int, error) {
	if err := os.RemoveAll(outDir); err != nil {
		return 0, err
	}
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return 0, err
	}

	site := firstSite(ctx, st)
	if str(site["visibility"]) == "private" {
		return 0, fmt.Errorf("site %q is private; static export would expose it — serve it live instead", siteName(site))
	}

	// Homepage.
	homeNav, err := s.buildNav(ctx, st, "", false)
	if err != nil {
		return 0, err
	}
	if err := s.writeFile(filepath.Join(outDir, "index.html"), "home",
		pageView{SiteName: siteName(site), Title: siteName(site), Nav: homeNav, HomeIntro: bodyHTML(site["home_intro"])}); err != nil {
		return 0, err
	}

	// One file per published page. Labels and pure dropdowns have no body and no
	// route, so they're skipped — they exist only to shape the nav tree.
	pages, err := findAll(ctx, st, dcms.Query{Collection: "pages", Sort: "order", Filters: []dcms.Filter{publishedFilter}})
	if err != nil {
		return 0, err
	}
	built := 0
	for _, p := range pages {
		if str(p["kind"]) == "label" || str(p["slug"]) == "" || str(p["body"]) == "" {
			continue
		}
		nav, err := s.buildNav(ctx, st, str(p["slug"]), false)
		if err != nil {
			return 0, err
		}
		dir := filepath.Join(outDir, "p", str(p["slug"]))
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return 0, err
		}
		if err := s.writeFile(filepath.Join(dir, "index.html"), "page",
			pageView{SiteName: siteName(site), Title: str(p["title"]), Nav: nav, Content: bodyHTML(p["body"])}); err != nil {
			return 0, err
		}
		built++
	}

	if err := s.copyAssets(outDir); err != nil {
		return 0, err
	}
	runPagefind(outDir)
	return built, nil
}

func (s *Site) writeFile(dst, tmpl string, data pageView) error {
	f, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer f.Close()
	return s.tmpl.ExecuteTemplate(f, tmpl, data)
}

// copyAssets writes the embedded theme assets into outDir/assets.
func (s *Site) copyAssets(outDir string) error {
	root := "themes/" + s.theme + "/assets"
	return fs.WalkDir(themesFS, root, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			// No assets dir is fine.
			if os.IsNotExist(err) {
				return nil
			}
			return err
		}
		rel, _ := filepath.Rel(root, p)
		dst := filepath.Join(outDir, "assets", rel)
		if d.IsDir() {
			return os.MkdirAll(dst, 0o755)
		}
		data, err := themesFS.ReadFile(p)
		if err != nil {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
			return err
		}
		return os.WriteFile(dst, data, 0o644)
	})
}

// runPagefind builds a search index over the exported site if Pagefind is
// installed. It is optional: a missing binary just means no search.
func runPagefind(outDir string) {
	bin, err := exec.LookPath("pagefind")
	if err != nil {
		fmt.Println("note: `pagefind` not found on PATH — skipping search index.")
		fmt.Println("      install it and re-export to add search: https://pagefind.app")
		return
	}
	cmd := exec.Command(bin, "--site", outDir)
	cmd.Stdout, cmd.Stderr = os.Stdout, os.Stderr
	if err := cmd.Run(); err != nil {
		fmt.Printf("note: pagefind failed: %v\n", err)
	}
}
