package main

import "testing"

func TestExtractOutlineAndText(t *testing.T) {
	idx := Extract(`<h2>Install</h2><p>Run <code>go run .</code> to start.</p><h3>Notes</h3>`)

	if len(idx.Outline) != 2 {
		t.Fatalf("outline: want 2, got %d (%+v)", len(idx.Outline), idx.Outline)
	}
	if idx.Outline[0] != (Heading{Level: 2, Text: "Install", ID: "install"}) {
		t.Errorf("outline[0] = %+v", idx.Outline[0])
	}
	if idx.Outline[1].Level != 3 || idx.Outline[1].ID != "notes" {
		t.Errorf("outline[1] = %+v", idx.Outline[1])
	}
	want := "Install Run go run . to start. Notes"
	if idx.Text != want {
		t.Errorf("text = %q, want %q", idx.Text, want)
	}
}

func TestExtractBlockTypes(t *testing.T) {
	idx := Extract(`
		<p>para</p>
		<ul><li>a</li></ul>
		<blockquote>q</blockquote>
		<pre><code class="language-go">x := 1</code></pre>
		<table><tr><td>c</td></tr></table>
		<figure><img src="/x.png" alt="a diagram"><figcaption>cap</figcaption></figure>
		<hr>
	`)
	got := map[string]int{}
	for _, b := range idx.Blocks {
		got[b.Type]++
	}
	for _, typ := range []string{"text", "list", "quote", "code", "table", "image"} {
		if got[typ] != 1 {
			t.Errorf("block type %q: got %d, want 1 (%+v)", typ, got[typ], idx.Blocks)
		}
	}
	if got["heading"] != 0 {
		t.Errorf("unexpected heading blocks: %d", got["heading"])
	}
	// hr produces no block
	if n := len(idx.Blocks); n != 6 {
		t.Errorf("block count = %d, want 6", n)
	}
	// code carries its language + the image its alt
	for _, b := range idx.Blocks {
		if b.Type == "code" && b.Lang != "go" {
			t.Errorf("code lang = %q, want go", b.Lang)
		}
		if b.Type == "image" && b.Text != "a diagram" {
			t.Errorf("image text = %q, want alt", b.Text)
		}
	}
}

func TestExtractComponents(t *testing.T) {
	idx := Extract(`
		<aside data-callout data-callout-tone="warn"><p>careful</p></aside>
		<div data-tabs><section data-tabs-tab="npm"><pre><code>npm i</code></pre></section></div>
		<ol data-steps><li>one</li><li>two</li></ol>
		<div data-code-group>
			<pre><code class="language-go">a</code></pre>
			<pre><code class="language-bash">b</code></pre>
		</div>
	`)
	var callout, tabs, list, code int
	for _, b := range idx.Blocks {
		switch b.Type {
		case "callout":
			callout++
			if b.Variant != "warn" {
				t.Errorf("callout variant = %q, want warn", b.Variant)
			}
		case "tabs":
			tabs++
		case "list":
			list++
		case "code":
			code++
		}
	}
	if callout != 1 || tabs != 1 || list != 1 {
		t.Errorf("components: callout=%d tabs=%d list=%d (want 1 each)", callout, tabs, list)
	}
	if code != 2 { // code-group fans out to one block per <pre>
		t.Errorf("code-group blocks = %d, want 2", code)
	}
}

func TestHeadingIDCollisions(t *testing.T) {
	idx := Extract(`<h2>Setup</h2><h2>Setup</h2><h3>Setup</h3>`)
	want := []string{"setup", "setup-2", "setup-3"}
	if len(idx.Outline) != 3 {
		t.Fatalf("want 3 headings, got %d", len(idx.Outline))
	}
	for i, h := range idx.Outline {
		if h.ID != want[i] {
			t.Errorf("heading[%d].ID = %q, want %q", i, h.ID, want[i])
		}
	}
}

func TestExtractEmptyAndGarbage(t *testing.T) {
	if idx := Extract(""); idx.Text != "" || len(idx.Blocks) != 0 {
		t.Errorf("empty body should yield empty index, got %+v", idx)
	}
	// Unclosed/garbage still parses (html is lenient) and never panics.
	_ = Extract(`<p>hi<aside data-callout>oops`)
}

func TestSlugify(t *testing.T) {
	cases := map[string]string{
		"Hello World":       "hello-world",
		"  Trim  Me  ":      "trim-me",
		"Go 1.25 & chi":     "go-1-25-chi",
		"---":               "",
		"Café déjà":         "caf-d-j", // non-ascii dropped
		"API/SDK Reference": "api-sdk-reference",
	}
	for in, want := range cases {
		if got := slugify(in); got != want {
			t.Errorf("slugify(%q) = %q, want %q", in, got, want)
		}
	}
}
