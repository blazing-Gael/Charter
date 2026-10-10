// classic theme — minimal vanilla JS. No framework, no build step.
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };

  /* ── theme toggle ─────────────────────────────────────────────── */
  var root = document.documentElement;
  var themeBtn = $("[data-theme-toggle]");
  if (themeBtn) themeBtn.addEventListener("click", function () {
    var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    store.set("docs-theme", next);
  });

  /* ── sidebar collapse / mobile drawer ─────────────────────────── */
  var mobile = function () { return window.matchMedia("(max-width: 900px)").matches; };
  $$("[data-sidebar-toggle]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (mobile()) document.body.classList.toggle("nav-open");
      else {
        document.body.classList.toggle("sidebar-collapsed");
        store.set("docs-sidebar", document.body.classList.contains("sidebar-collapsed") ? "collapsed" : "open");
      }
    });
  });
  if (store.get("docs-sidebar") === "collapsed" && !mobile()) document.body.classList.add("sidebar-collapsed");

  /* ── nav dropdowns (collapse, persisted; split-click) ─────────── */
  var collapsed = JSON.parse(store.get("docs-groups") || "{}");
  function applyCollapse() {
    $$(".nav-node[data-collapsible]").forEach(function (node) {
      node.classList.toggle("is-collapsed", !!collapsed[node.getAttribute("data-key")]);
    });
  }
  applyCollapse();
  // delegate: a [data-toggle] (the chevron, or a pure-dropdown's label button)
  // toggles its own node. A link+dropdown's text is an <a>, so it navigates.
  document.addEventListener("click", function (e) {
    var t = e.target.closest ? e.target.closest("[data-toggle]") : null;
    if (!t) return;
    var node = t.closest(".nav-node[data-collapsible]");
    if (!node) return;
    e.preventDefault();
    var isCol = node.classList.toggle("is-collapsed");
    collapsed[node.getAttribute("data-key")] = isCol;
    store.set("docs-groups", JSON.stringify(collapsed));
  });

  /* ── sidebar filter ───────────────────────────────────────────── */
  var filter = $("#sidebar-filter");
  function resetFilter() {
    $$(".nav-link, .nav-node, .nav-group").forEach(function (el) { el.style.display = ""; });
    applyCollapse();
  }
  if (filter) filter.addEventListener("input", function () {
    var q = filter.value.trim().toLowerCase();
    if (!q) { resetFilter(); return; }
    $$(".nav-link").forEach(function (a) {
      a.style.display = a.textContent.toLowerCase().indexOf(q) !== -1 ? "" : "none";
    });
    // a container shows if it holds a visible link; expand it to reveal matches
    $$(".nav-node, .nav-group").forEach(function (c) {
      var vis = $$(".nav-link", c).some(function (a) { return a.style.display !== "none"; });
      c.style.display = vis ? "" : "none";
      if (vis) c.classList.remove("is-collapsed");
    });
  });

  /* ── search dialog ────────────────────────────────────────────── */
  var dlg = $("#search-dialog"), input = $("#search-input"), results = $("#search-results");
  var sel = -1, debounce, pf = null, pfTried = false;

  function openSearch() {
    if (!dlg) return;
    if (!dlg.open && dlg.showModal) dlg.showModal();
    input.value = ""; render([]); setTimeout(function () { input.focus(); }, 0);
  }
  function closeSearch() { if (dlg && dlg.open) dlg.close(); }
  $$("[data-search-open]").forEach(function (b) { b.addEventListener("click", openSearch); });
  if (dlg) dlg.addEventListener("click", function (e) { if (e.target === dlg) closeSearch(); }); // backdrop click

  function ensurePagefind() {
    if (pfTried) return Promise.resolve(pf);
    pfTried = true;
    return import("/pagefind/pagefind.js").then(function (m) { pf = m; return pf; }).catch(function () { pf = null; return null; });
  }

  // Derived content index (search-index.json). Loaded once, on first miss of
  // Pagefind. Static export writes it next to the pages; the live server serves it
  // at /__search-index.json. Null once if neither is reachable.
  var idx = null, idxTried = false;
  function ensureIndex() {
    if (idxTried) return Promise.resolve(idx);
    idxTried = true;
    return fetch("/search-index.json").then(function (r) {
      return r.ok ? r : fetch("/__search-index.json");
    }).then(function (r) {
      if (!r.ok) throw 0;
      return r.json();
    }).then(function (d) { idx = d; return idx; }).catch(function () { idx = null; return null; });
  }

  // Rank index docs by a query: title/heading hits weigh more than body hits.
  function indexSearch(q) {
    if (!idx) return [];
    var ql = q.toLowerCase();
    var hits = [];
    idx.forEach(function (d) {
      var titleHit = d.title.toLowerCase().indexOf(ql) !== -1;
      var sec = (d.outline || []).filter(function (h) { return h.text.toLowerCase().indexOf(ql) !== -1; })[0];
      var at = d.text.toLowerCase().indexOf(ql);
      if (!titleHit && !sec && at === -1) return;
      var score = titleHit ? 3 : sec ? 2 : 1;
      var url = sec ? d.url + "#" + sec.id : d.url;
      var excerpt = sec ? sec.text : at !== -1 ? snippet(d.text, at, ql.length) : "";
      hits.push({ score: score, title: d.title, url: url, excerpt: excerpt });
    });
    return hits.sort(function (a, b) { return b.score - a.score; }).slice(0, 8);
  }

  // A ~140-char window around a match, ellipsized.
  function snippet(text, at, len) {
    var start = Math.max(0, at - 60), end = Math.min(text.length, at + len + 80);
    return (start ? "… " : "") + text.slice(start, end).trim() + (end < text.length ? " …" : "");
  }

  function render(items) {
    sel = -1;
    if (!items.length) {
      results.innerHTML = '<li class="search-empty">' + (input.value ? "No results" : "Type to search") + "</li>";
      return;
    }
    results.innerHTML = items.map(function (it, i) {
      return '<li><a class="search-result" href="' + it.url + '" data-i="' + i + '">' +
        '<span class="search-result__title">' + it.title + "</span>" +
        (it.excerpt ? '<span class="search-result__ex">' + it.excerpt + "</span>" : "") +
        "</a></li>";
    }).join("");
  }

  function navFallback(q) {
    var ql = q.toLowerCase();
    return $$(".nav-link").filter(function (a) { return a.textContent.toLowerCase().indexOf(ql) !== -1; })
      .slice(0, 8).map(function (a) { return { title: a.textContent.trim(), url: a.getAttribute("href"), excerpt: "" }; });
  }

  function doSearch() {
    var q = input.value.trim();
    if (!q) { render([]); return; }
    ensurePagefind().then(function (engine) {
      if (engine) {
        engine.search(q).then(function (s) {
          return Promise.all(s.results.slice(0, 8).map(function (r) {
            return r.data().then(function (d) {
              return { title: (d.meta && d.meta.title) || d.url, url: d.url, excerpt: d.excerpt };
            });
          }));
        }).then(render).catch(function () { render(navFallback(q)); });
        return;
      }
      // No Pagefind: search the derived content index; nav titles as last resort.
      ensureIndex().then(function (data) {
        render(data ? indexSearch(q) : navFallback(q));
      });
    });
  }
  if (input) input.addEventListener("input", function () { clearTimeout(debounce); debounce = setTimeout(doSearch, 120); });

  function move(d) {
    var links = $$(".search-result", results);
    if (!links.length) return;
    sel = Math.max(0, Math.min(sel + d, links.length - 1));
    links.forEach(function (l, i) { l.classList.toggle("is-sel", i === sel); });
    links[sel].scrollIntoView({ block: "nearest" });
  }
  if (input) input.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter") {
      var links = $$(".search-result", results);
      if (links[sel]) { e.preventDefault(); location.href = links[sel].href; }
      else if (links[0]) { e.preventDefault(); location.href = links[0].href; }
    }
  });

  /* ── global keyboard shortcuts ────────────────────────────────── */
  document.addEventListener("keydown", function (e) {
    var t = e.target, typing = /^(input|textarea|select)$/i.test(t.tagName) || t.isContentEditable;
    if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) { e.preventDefault(); openSearch(); }
    else if (e.key === "/" && !typing) { e.preventDefault(); if (filter) filter.focus(); }
  });
})();
