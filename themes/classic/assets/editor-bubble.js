// Selection (bubble) toolbar for #doc-editor. Appears above a text selection with
// inline marks, link, text color, highlight, and font size. Portaled to <body>, so
// it dispatches via composeCommand (composeEditorWrapper's wrap-lookup can't reach a
// portaled node) and positions via wui.float. Loaded after editor-link.js, edit only.
(function () {
  "use strict";
  var ed = document.getElementById("doc-editor");
  if (!ed || typeof window.composeCommand !== "function") return;

  function cmd(name, args) { window.composeCommand(ed, name, args); }

  // The selection the bubble acts on. Clicking a button can collapse the live
  // selection before the command reads it (a mark then no-ops on the empty caret),
  // so we cache the range while the bubble is up and restore it before dispatching.
  var savedRange = null;
  function restoreSelection() {
    if (!savedRange) return;
    var s = window.getSelection();
    s.removeAllRanges();
    s.addRange(savedRange);
  }

  // "" = clear the mark. Absolute colors (author's choice, baked into a span); the
  // theme styles everything else.
  var TEXT = ["", "#dc2626", "#d97706", "#16a34a", "#2563eb", "#7c3aed", "#111827"];
  var HL = ["", "#fde68a", "#bbf7d0", "#bfdbfe", "#f5d0fe", "#e5e7eb"];
  function swatches(kind, vals) {
    return vals.map(function (v) {
      var clear = v === "";
      return '<button type="button" class="rte-sw' + (clear ? " rte-sw--clear" : "") + '" data-' + kind + '="' + v + '"' +
        (clear ? ' aria-label="None"' : ' style="background:' + v + '"') + "></button>";
    }).join("");
  }

  var bubble = document.createElement("div");
  bubble.className = "rte-bubble";
  bubble.hidden = true;
  bubble.innerHTML =
    '<div class="rte-bubble__row">' +
      '<button type="button" class="rte-btn compose-toolbar-btn" data-action="bold" aria-label="Bold" data-tip="Bold"><i class="ph ph-text-b"></i></button>' +
      '<button type="button" class="rte-btn compose-toolbar-btn" data-action="italic" aria-label="Italic" data-tip="Italic"><i class="ph ph-text-italic"></i></button>' +
      '<button type="button" class="rte-btn compose-toolbar-btn" data-action="strikeThrough" aria-label="Strikethrough" data-tip="Strikethrough"><i class="ph ph-text-strikethrough"></i></button>' +
      '<span class="rte-sep"></span>' +
      '<button type="button" class="rte-btn" data-rte="link" aria-label="Link" data-tip="Link"><i class="ph ph-link"></i></button>' +
      '<button type="button" class="rte-btn" data-pop="color" aria-label="Text color" data-tip="Text color"><i class="ph ph-text-aa"></i></button>' +
      '<button type="button" class="rte-btn" data-pop="hl" aria-label="Highlight" data-tip="Highlight"><i class="ph ph-highlighter"></i></button>' +
      '<span class="rte-sep"></span>' +
      '<button type="button" class="rte-btn" data-size="13" aria-label="Smaller text" data-tip="Smaller"><i class="ph ph-text-t" style="font-size:12px"></i></button>' +
      '<button type="button" class="rte-btn" data-size="20" aria-label="Larger text" data-tip="Larger"><i class="ph ph-text-t" style="font-size:19px"></i></button>' +
    "</div>" +
    '<div class="rte-bubble__pop" data-pop-for="color" hidden>' + swatches("text-color", TEXT) + "</div>" +
    '<div class="rte-bubble__pop" data-pop-for="hl" hidden>' + swatches("bg-color", HL) + "</div>";
  document.body.appendChild(bubble);

  function closePops() { bubble.querySelectorAll(".rte-bubble__pop").forEach(function (p) { p.hidden = true; }); }

  function dispatch(btn) {
    var ds = btn.dataset;
    if (ds.rte === "link") { hide(); if (window.rteOpenLink) window.rteOpenLink(); return; }
    if (ds.pop) {   // toggle a swatch pop; no command, keep the selection
      var p = bubble.querySelector('[data-pop-for="' + ds.pop + '"]');
      var open = !p.hidden;
      closePops();
      p.hidden = open;
      return;
    }
    restoreSelection();   // every remaining action needs the live selection
    if (ds.action === "bold" || ds.action === "italic" || ds.action === "underline") cmd("mark", { key: ds.action });
    else if (ds.action === "strikeThrough") cmd("mark", { key: "strike" });
    else if (ds.textColor !== undefined) { cmd("mark", { key: "color", value: ds.textColor }); closePops(); }
    else if (ds.bgColor !== undefined) { cmd("mark", { key: "bgColor", value: ds.bgColor }); closePops(); }
    else if (ds.size !== undefined) cmd("mark", { key: "fontSize", value: ds.size ? ds.size + "px" : "" });
    sync(); place();
  }

  bubble.addEventListener("mousedown", function (e) {
    var btn = e.target.closest("button");
    if (!btn) return;
    e.preventDefault();   // keep the selection in the editor
    dispatch(btn);
  });

  function sync() { if (window.syncToolbar) window.syncToolbar(ed, bubble, bubble); }

  function selRect() {
    var s = window.getSelection();
    if (!s.rangeCount) return null;
    var r = s.getRangeAt(0);
    if (r.collapsed || !ed.contains(r.startContainer) || !ed.contains(r.endContainer)) return null;
    var rect = r.getBoundingClientRect();
    return rect.width || rect.height ? rect : null;
  }

  function place() {
    if (!selRect()) { hide(); return; }
    // The selection Range is the anchor (it exposes getBoundingClientRect, which is
    // all wui.float needs): placed above, centered, flipping below near the top edge.
    var range = window.getSelection().getRangeAt(0);
    if (window.wui && window.wui.float) {
      window.wui.float.place(bubble, range, { side: "top", align: "center", gap: 8 });
    } else {
      var rect = range.getBoundingClientRect();
      bubble.style.left = Math.round(rect.left + rect.width / 2 - bubble.offsetWidth / 2) + "px";
      var top = rect.top - bubble.offsetHeight - 8;
      bubble.style.top = Math.round(top < 60 ? rect.bottom + 8 : top) + "px";
    }
  }

  function show() { bubble.hidden = false; sync(); place(); }
  function hide() { if (!bubble.hidden) { bubble.hidden = true; closePops(); } }

  var t;
  document.addEventListener("selectionchange", function () {
    clearTimeout(t);
    t = setTimeout(function () {
      if (selRect()) { savedRange = window.getSelection().getRangeAt(0).cloneRange(); show(); }
      else hide();
    }, 10);
  });
  ed.addEventListener("blur", function () { setTimeout(hide, 150); });
  window.addEventListener("scroll", function () { if (!bubble.hidden) place(); }, true);
  window.addEventListener("resize", function () { if (!bubble.hidden) place(); });
  ed.addEventListener("keydown", function (e) { if (e.key === "Escape") hide(); });
})();
