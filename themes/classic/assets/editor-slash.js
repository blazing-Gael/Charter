// Slash menu for #doc-editor. Type "/" on an empty line → a filterable block picker.
// "Turn into" items run an engine command on the current line; "insert" items drop
// a block via insertBlocks (keeps data-*). Loaded after editor-boot.js, edit mode only.
(function () {
  "use strict";
  var ed = document.getElementById("doc-editor");
  if (!ed || typeof window.composeCommand !== "function") return;

  var ZWSP = /​/g;
  function cmd(name, args) { window.composeCommand(ed, name, args); }

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
    { label: "Steps", icon: "ph-list-checks", keys: "steps stepper howto", insert: "<ol data-steps><li>First step</li><li>Second step</li></ol>" },
    { label: "Code group", icon: "ph-code-block", keys: "code group tabs", insert: '<div data-code-group><pre><code class="language-">one</code></pre><pre><code class="language-">two</code></pre></div>' }
  ];

  // menu DOM, created once, portaled to <body> so it is never clipped.
  var menu = document.createElement("div");
  menu.className = "rte-slash";
  menu.setAttribute("role", "listbox");
  menu.hidden = true;
  menu.innerHTML = '<ul class="rte-slash__list"></ul>';
  document.body.appendChild(menu);
  var list = menu.querySelector(".rte-slash__list");

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
      return '<li class="rte-slash__item' + (i === sel ? " is-sel" : "") + '" data-i="' + i + '">' +
        '<i class="ph ' + it.icon + '"></i><span>' + it.label + "</span></li>";
    }).join("");
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
    window.insertBlocks(ed, { html: it.insert, replace: "#__slash_target" });
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
