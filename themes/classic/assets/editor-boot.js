// Mounts the shared rich-text engine (/editor/editor.js) onto #doc-editor and wires
// the formatting toolbar. The engine owns editing; this file is the host harness:
// setup, event wrappers, toolbar dispatch, and a docs-clean serialize for saving.
// No framework. Loaded after editor.js in edit mode only.
(function () {
  "use strict";
  var ed = document.getElementById("doc-editor");
  if (!ed || typeof window.wireComposeEditor !== "function") return;

  // Setup + adopt the server HTML into editing shape (decorated, normalized).
  // No html arg → adopt whatever the template already rendered into the element.
  window.wireComposeEditor(ed);
  window.adoptComposeBody(ed);

  var wrap = ed.closest(".compose-editor-wrap");
  var toolbar = wrap && wrap.querySelector(".rte-toolbar");

  function sync() { if (toolbar && window.syncToolbar) window.syncToolbar(ed, toolbar, toolbar); }

  // Cache the last non-collapsed selection in the editor. A toolbar click can
  // collapse the live selection before an inline-mark command reads it, so marks
  // restore this first. Block commands (heading/list/quote) act on the caret's
  // line and need no restore.
  var lastRange = null;
  var MARKS = { bold: 1, italic: 1, strikeThrough: 1, underline: 1 };
  document.addEventListener("selectionchange", function () {
    var s = window.getSelection();
    if (!s.rangeCount) return;
    var r = s.getRangeAt(0);
    if (!r.collapsed && ed.contains(r.startContainer) && ed.contains(r.endContainer)) lastRange = r.cloneRange();
  });

  // mousedown (not click) + preventDefault keeps the selection in the editor while
  // a button acts on it — a click would blur the editable first.
  if (toolbar) {
    toolbar.addEventListener("mousedown", function (e) {
      var btn = e.target.closest("[data-action]");
      if (!btn) return;
      e.preventDefault();
      if (MARKS[btn.getAttribute("data-action")] && lastRange) {
        var s = window.getSelection();
        s.removeAllRanges();
        s.addRange(lastRange);
      }
      window.composeEditorWrapper(btn);
      sync();
    });
  }

  // The engine's event wrappers do the work; we just forward the DOM events.
  ed.addEventListener("keydown", function (e) { window.composeKeyboardWrapper(ed, e); });
  ed.addEventListener("paste", function (e) { window.composePasteWrapper(ed, e); });
  ed.addEventListener("copy", function (e) { window.composeCopyWrapper(ed, e); });
  ["dragstart", "dragend", "dragover", "dragleave", "drop"].forEach(function (t) {
    ed.addEventListener(t, function (e) { window.composeDropWrapper(ed, e); });
  });
  document.addEventListener("selectionchange", sync);
  sync();

  /* Docs-clean serialize. serializeComposeBody keeps the engine's inline
     decoration (heading sizes in px, line margins, quote bars) — right for email,
     wrong for us: the THEME owns presentation. Strip that decoration so stored HTML
     is clean semantic HTML; keep author marks (they live on inner spans) and line
     intent (text-align, dir, author indent via margin-left). The server sanitizer
     will enforce the same allowlist later. */
  var DECOR = ["marginTop", "marginBottom", "marginRight", "lineHeight"];
  function docsClean(html) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    doc.body.querySelectorAll("p,h1,h2,h3,h4,h5,h6,li,ul,ol,blockquote").forEach(function (el) {
      DECOR.forEach(function (p) { el.style[p] = ""; });               // line metrics
      if (/^H[1-6]$/.test(el.tagName)) {                               // heading look is the theme's
        el.style.fontSize = ""; el.style.fontWeight = "";
      }
      if (el.tagName === "BLOCKQUOTE") {                               // quote bar/padding is the theme's
        ["borderLeft", "borderInlineStart", "paddingLeft", "paddingInlineStart", "marginLeft", "marginInlineStart"].forEach(function (p) { el.style[p] = ""; });
      }
      if (!el.style.length) el.removeAttribute("style");
    });
    // Tabs: the editor shows one panel at a time via an is-active class and may hide the
    // rest; stored markup is the canonical all-panels-visible shape (wui/tabs.js re-derives
    // which to show from aria-current). The ＋/× controls are <button>s already dropped upstream.
    doc.body.querySelectorAll(".wui-tabs .wui-tab-panel").forEach(function (p) {
      p.classList.remove("is-active");
      p.hidden = false;
      if (!p.className) p.removeAttribute("class");
    });
    return doc.body.innerHTML;
  }

  // The save path (edit.js) reads this. Falls back to innerHTML if absent.
  window.serializeDocBody = function () { return docsClean(window.serializeComposeBody(ed)); };
})();
