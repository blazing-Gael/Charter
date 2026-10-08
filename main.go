// Command dcms-docs is a documentation CMS built on DCMS. The backend (sites,
// sections, pages, auth, admin panel) is generated from schema.yaml; this program
// adds the public-facing site rendering and the static-export pipeline on top of
// the public dcms package.
//
// Run it from this directory:
//
//	cp .env.example .env   # set the first admin, then edit
//	go run .               # migrates, seeds the admin, serves on http://localhost:8080
//
// Authors write pages at /__admin. The rendered site is served at / (live). An admin
// can POST /__export to build the static site into ./public for a CDN.
package main

import (
	"bufio"
	"context"
	"log"
	"os"
	"os/signal"
	"strings"

	dcms "github.com/blazing-Gael/dcms"
)

func main() {
	loadDotEnv(".env")

	app, err := dcms.New(dcms.Options{
		SchemaPath:     "schema.yaml",
		ConfigPath:     "config.yaml",
		ConfigRequired: true,
		AutoMigrate:    true, // create/upgrade tables on start (dev convenience)
		Dev:            true,
		Label:          "dcms-docs",
	})
	if err != nil {
		log.Fatal(err)
	}
	defer app.Close()

	// The shell/theme is compiled in (see themes/). Everything content-related comes
	// from the DCMS backend at request time.
	site, err := newSite(os.Getenv("DOCS_THEME"))
	if err != nil {
		log.Fatal(err)
	}
	site.mount(app) // GET / , GET /p/{slug}, GET /assets/* , POST /__export

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	if err := app.Serve(ctx); err != nil {
		log.Fatal(err)
	}
}

// loadDotEnv reads KEY=VALUE lines from a .env file into the process environment
// (env wins over the file; a missing file is fine). Dependency-free on purpose.
func loadDotEnv(path string) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, val, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		val = strings.Trim(strings.TrimSpace(val), `"'`)
		if _, exists := os.LookupEnv(key); !exists {
			_ = os.Setenv(key, val)
		}
	}
}
