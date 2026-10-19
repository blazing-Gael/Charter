// Slash menu for #doc-editor. Type "/" on an empty line → a filterable block picker.
// "Turn into" items run an engine command on the current line; "insert" items drop
// a block via insertBlocks (keeps data-*). Loaded after editor-boot.js, edit mode only.
(function () {
  "use strict";
  var ed = document.getElementById("doc-editor");
  if (!ed || typeof window.composeCommand !== "function") return;

  var ZWSP = /​/g;
  function cmd(name, args) { window.composeCommand(ed, name, args); }

  // A fresh id base per inserted block, so several tab groups on one page never collide.
  function rid() { return Math.random().toString(36).slice(2, 8); }

  // wui tabs: a .wui-tab-list of anchor links over .wui-tab-panel sections (ELEMENT_CONTRACT
  // + wui/tabs.js). Stored with every panel visible and no `hidden`; tabs.js hides all but the
  // selected one on the reading page, and leaves them all visible (editable) in the editor.
  function tabsHTML() {
    var a = "t-" + rid(), b = "t-" + rid();
    return '<div class="wui-tabs"><div class="wui-tab-list" aria-label="Tabs">' +
      '<a class="wui-tab" href="#' + a + '" aria-current="true">Tab one</a>' +
      '<a class="wui-tab" href="#' + b + '">Tab two</a></div>' +
      '<section class="wui-tab-panel" id="' + a + '"><p>First tab.</p></section>' +
      '<section class="wui-tab-panel" id="' + b + '"><p>Second tab.</p></section></div>';
  }

  // Code group = tabs whose panels each wrap a code block; the tab label is the filename.
  function codeGroupHTML() {
    var a = "c-" + rid(), b = "c-" + rid();
    return '<div class="wui-tabs wui-tabs--code"><div class="wui-tab-list" aria-label="Code">' +
      '<a class="wui-tab" href="#' + a + '" aria-current="true">file.go</a>' +
      '<a class="wui-tab" href="#' + b + '">go.mod</a></div>' +
      '<section class="wui-tab-panel" id="' + a + '"><pre><code class="language-go">one</code></pre></section>' +
      '<section class="wui-tab-panel" id="' + b + '"><pre><code class="language-">two</code></pre></section></div>';
  }

  // run: operates on the current (now-empty) line. insert: replaces the line with html.
  var ITEMS = [
    { label: "Heading 2", icon: "ph-text-h-two", keys: "h2 heading title", run: function () { cmd("block", { tag: "h2" }); } },
    { label: "Heading 3", icon: "ph-text-h-three", keys: "h3 subheading", run: function () { cmd("block", { tag: "h3" }); } },
    { label: "Heading 4", icon: "ph-text-h-four", keys: "h4 minor heading", run: function () { cmd("block", { tag: "h4" }); } },
    { label: "Text", icon: "ph-paragraph", keys: "text paragraph body", run: function () { cmd("block", { tag: "p" }); } },
    { label: "Bulleted list", icon: "ph-list-bullets", keys: "bullet unordered ul list", run: function () { cmd("list", { tag: "ul" }); } },
    { label: "Numbered list", icon: "ph-list-numbers", keys: "number ordered ol list", run: function () { cmd("list", { tag: "ol" }); } },
    { label: "Quote", icon: "ph-quotes", keys: "quote blockquote", run: function () { cmd("blockquote", {}); } },
    { label: "Divider", icon: "ph-minus", keys: "divider rule hr separator", insert: "<hr>" },
    { label: "Code block", icon: "ph-code", keys: "code pre snippet", insert: '<pre><code class="language-">code</code></pre>' },
    { label: "Callout", icon: "ph-warning-circle", keys: "callout note aside admonition", insert: '<aside data-callout data-callout-tone="info"><p>Callout text</p></aside>' },
    { label: "Details", icon: "ph-caret-circle-down", keys: "details accordion disclosure toggle collapse", insert: "<details><summary>Summary</summary><p>Hidden content.</p></details>" },
    { label: "Table", icon: "ph-table", keys: "table grid rows columns", insert: '<table><thead><tr><th>Column</th><th>Column</th></tr></thead><tbody><tr><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td></tr></tbody></table>' },
    { label: "Steps", icon: "ph-list-checks", keys: "steps stepper howto", insert: "<ol data-steps><li>First step</li><li>Second step</li></ol>" },
    { label: "Timeline", icon: "ph-git-commit", keys: "timeline history dates events changelog", insert: "<ol data-timeline><li><time>Date</time>First event</li><li><time>Date</time>Second event</li></ol>" },
    { label: "Tabs", icon: "ph-browsers", keys: "tabs tabbed sections", insert: tabsHTML },
    { label: "Code group", icon: "ph-code-block", keys: "code group tabs files", insert: codeGroupHTML },
    { label: "Cards", icon: "ph-squares-four", keys: "cards grid links tiles", insert: '<div data-cards><a class="xcard" href="/p/">Card one</a><a class="xcard" href="/p/">Card two</a></div>' }
  ];

  // menu DOM, created once, portaled to <body> so it is never clipped. Rows are wui
  // `.wui-menu-item`s (same look as the page dropdown), but the panel is NOT a `.wui-menu`
  // on purpose: this is a type-to-filter combobox — focus stays in the editor — and the
  // wui menu driver's roving focus (focuses the hovered row) would blur the editor and
  // close us. We drive selection ourselves; menu.js's global handlers gate on a `.wui-menu`
  // ancestor, so they skip this panel.
  var menu = document.createElement("div");
  menu.className = "rte-slash wui-scroll";   // wui-scroll = thin themed scrollbar when the list overflows
  menu.setAttribute("role", "listbox");
  menu.hidden = true;
  document.body.appendChild(menu);
  var list = menu;

  var open = false, sel = 0, line = null, filtered = [];

  function lineText(el) { return (el.textContent || "").replace(ZWSP, ""); }

  // The direct child line of the editable holding the caret (slash fires on a
  // top-level empty line, so this is enough).
  function caretLine() {
    var s = window.getSelection();
    if (!s.rangeCount) return null;
    var n = s.getRangeAt(0).startContainer;
    if (!ed.contains(n)) return null;
    while (n && n.parentNode !== ed) n = n.parentNode;
    return n && n.nodeType === 1 ? n : null;
  }

  function placeMenu() {
    var s = window.getSelection();
    if (!s.rangeCount) return;
    // Anchor to the caret Range (or the line if the caret has no box yet), placed
    // below-left; wui.float flips above and clamps on-screen near the viewport edge.
    var anchor = s.getRangeAt(0);
    if (!anchor.getBoundingClientRect().height && line) anchor = line;
    if (window.wui && window.wui.float) {
      window.wui.float.place(menu, anchor, { side: "bottom", align: "start", gap: 6 });
    } else {
      var rect = anchor.getBoundingClientRect();
      menu.style.left = Math.round(rect.left) + "px";
      menu.style.top = Math.round(rect.bottom + 6) + "px";
    }
  }

  function render() {
    var q = lineText(line).slice(1).trim().toLowerCase();
    filtered = ITEMS.filter(function (it) {
      return !q || it.label.toLowerCase().indexOf(q) !== -1 || it.keys.indexOf(q) !== -1;
    });
    if (!filtered.length) { closeMenu(); return; }
    if (sel >= filtered.length) sel = 0;
    list.innerHTML = filtered.map(function (it, i) {
      var on = i === sel;
      return '<button type="button" role="option" class="wui-menu-item' + (on ? " is-sel" : "") +
        '" aria-selected="' + on + '" data-i="' + i + '">' +
        '<span class="wui-menu-ico"><i class="ph ' + it.icon + '"></i></span>' + it.label + "</button>";
    }).join("");
    // keep the keyboard-selected row in view when the list overflows (block:nearest only
    // scrolls the menu, minimally — no page jump for an already-visible row).
    var selEl = list.children[sel];
    if (selEl) selEl.scrollIntoView({ block: "nearest" });
  }

  function openMenu(ln) {
    open = true; sel = 0; line = ln;
    menu.hidden = false;
    render(); placeMenu();
  }
  function closeMenu() { open = false; line = null; menu.hidden = true; }

  // Clear the "/query" line back to empty, caret inside — for "turn into" items.
  function clearSlash(ln) {
    while (ln.firstChild) ln.removeChild(ln.firstChild);
    ln.appendChild(document.createElement("br"));
    var r = document.createRange(); r.setStart(ln, 0); r.collapse(true);
    var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  }

  function choose(it) {
    var ln = line;
    closeMenu();
    if (!ln) return;
    if (it.run) { clearSlash(ln); it.run(); return; }
    // insert: replace the slash line wholesale (one undo step, no stray blanks)
    ln.id = "__slash_target";
    var html = typeof it.insert === "function" ? it.insert() : it.insert;
    window.insertBlocks(ed, { html: html, replace: "#__slash_target" });
  }

  // "/" on an empty line opens; typing after refilters; deleting the "/" closes.
  ed.addEventListener("input", function (e) {
    if (open) {
      if (!line || !lineText(line).startsWith("/")) { closeMenu(); return; }
      render(); placeMenu();
      return;
    }
    if (e.inputType === "insertText" && e.data === "/") {
      var ln = caretLine();
      if (ln && lineText(ln) === "/") openMenu(ln);
    }
  });

  // Capture phase so these win over the engine's own keydown (Enter especially).
  ed.addEventListener("keydown", function (e) {
    if (!open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); sel = (sel + 1) % filtered.length; render(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); sel = (sel - 1 + filtered.length) % filtered.length; render(); }
    else if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); choose(filtered[sel]); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeMenu(); }
  }, true);

  list.addEventListener("mousedown", function (e) {
    var li = e.target.closest("[data-i]");
    if (!li) return;
    e.preventDefault();
    choose(filtered[+li.getAttribute("data-i")]);
  });

  // Close on blur / outside click / scroll.
  ed.addEventListener("blur", function () { setTimeout(closeMenu, 120); });
  window.addEventListener("scroll", function () { if (open) placeMenu(); }, true);
})();
