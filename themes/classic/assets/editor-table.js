// editor-table.js — visual table authoring for #doc-editor, edit mode only.
//
// The stored table stays plain semantic <table><thead><tbody> (ELEMENT_CONTRACT); this
// adds floating controls so you never hand-write rows/cells:
//   - a ＋ strip on the right edge adds a column; a ＋ strip on the bottom adds a row
//   - with the caret in a cell, a × appears at the start of its row and the top of its
//     column to delete that row / column (kept to a minimum of one each)
//
// The controls live in one overlay layer positioned over the active table by its
// bounding rect — they are never inserted into the table, so nothing touches the saved
// markup. They are also <button>s, which the engine's serialize drops anyway.
(function () {
  "use strict";
  var ed = document.getElementById("doc-editor");
  if (!ed) return;

  // ── overlay layer + its buttons ──────────────────────────────────────────
  var layer = document.createElement("div");
  layer.className = "doc-table-tools";
  layer.hidden = true;
  function btn(cls, tip) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = cls;
    b.setAttribute("contenteditable", "false");
    b.setAttribute("aria-label", tip);
    b.setAttribute("data-tip", tip);
    b.setAttribute("data-tip-pos", "top");
    // The ＋/× marks are drawn in CSS (pseudo-elements) so they stay pixel-centered in a
    // thin strip — an icon-font glyph's advance box doesn't center reliably there.
    layer.appendChild(b);
    return b;
  }
  var addCol = btn("doc-tt doc-tt--addcol", "Add column");
  var addRow = btn("doc-tt doc-tt--addrow", "Add row");
  var delCol = btn("doc-tt doc-tt--delcol", "Delete column");
  var delRow = btn("doc-tt doc-tt--delrow", "Delete row");
  document.body.appendChild(layer);

  var table = null;       // table the controls currently target
  var cell = null;        // cell the caret is in (drives the × controls), or null

  // ── table helpers ──────────────────────────────────────────────────────────
  function rowsOf(t) { return [].slice.call(t.rows); }
  function colCount(t) { return t.rows[0] ? t.rows[0].cells.length : 0; }
  function colIndex(c) { return c ? c.cellIndex : -1; }

  function newCell(tagName) {
    var c = document.createElement(tagName);
    c.innerHTML = "<br>";
    return c;
  }

  function addColumn(t) {
    rowsOf(t).forEach(function (tr) {
      var head = tr.parentNode && tr.parentNode.tagName === "THEAD";
      tr.appendChild(newCell(head ? "th" : "td"));
    });
    position();
  }

  function addRowTo(t) {
    var body = t.tBodies[0] || t.appendChild(document.createElement("tbody"));
    var n = colCount(t) || 1;
    var tr = document.createElement("tr");
    for (var i = 0; i < n; i++) tr.appendChild(newCell("td"));
    body.appendChild(tr);
    position();
  }

  function deleteRow(tr) {
    var t = tr.closest("table");
    if (t.rows.length <= 1) return;                 // keep at least one row
    tr.remove();
    cell = null;
    position();
  }

  function deleteColumn(t, idx) {
    if (colCount(t) <= 1 || idx < 0) return;        // keep at least one column
    rowsOf(t).forEach(function (tr) {
      if (tr.cells[idx]) tr.cells[idx].remove();
    });
    cell = null;
    position();
  }

  // ── positioning ─────────────────────────────────────────────────────────────
  function place(el, x, y, w, h) {
    el.hidden = false;
    el.style.left = Math.round(x) + "px";
    el.style.top = Math.round(y) + "px";
    if (w != null) el.style.width = Math.round(w) + "px"; else el.style.width = "";
    if (h != null) el.style.height = Math.round(h) + "px"; else el.style.height = "";
  }

  function position() {
    if (!table || !ed.contains(table)) { hide(); return; }
    var r = table.getBoundingClientRect();
    layer.hidden = false;
    place(addCol, r.right + 4, r.top, null, r.height);        // full-height strip, right edge
    place(addRow, r.left, r.bottom + 4, r.width, null);       // full-width strip, bottom edge
    // The × controls only make sense with a cell selected.
    if (cell && table.contains(cell)) {
      var tr = cell.parentNode, rr = tr.getBoundingClientRect(), cr = cell.getBoundingClientRect();
      place(delRow, r.left - 24, rr.top + rr.height / 2 - 11);
      place(delCol, cr.left + cr.width / 2 - 11, r.top - 24);
    } else {
      delRow.hidden = true;
      delCol.hidden = true;
    }
  }

  function hide() { layer.hidden = true; table = null; cell = null; }

  var hideTimer = null;
  function setTable(t) {
    if (t === table && !layer.hidden) return;
    table = t;
    position();
  }
  function scheduleHide() { clearTimeout(hideTimer); hideTimer = setTimeout(function () { if (!cell) hide(); }, 200); }

  // ── wiring ────────────────────────────────────────────────────────────────
  addCol.addEventListener("mousedown", function (e) { e.preventDefault(); if (table) addColumn(table); });
  addRow.addEventListener("mousedown", function (e) { e.preventDefault(); if (table) addRowTo(table); });
  delRow.addEventListener("mousedown", function (e) { e.preventDefault(); if (cell) deleteRow(cell.parentNode); });
  delCol.addEventListener("mousedown", function (e) { e.preventDefault(); if (table && cell) deleteColumn(table, colIndex(cell)); });

  document.addEventListener("selectionchange", function () {
    var s = window.getSelection();
    if (!s.rangeCount) return;
    var n = s.getRangeAt(0).startContainer;
    var el = n.nodeType === 1 ? n : n.parentElement;
    var c = el && el.closest ? el.closest("td,th") : null;
    if (c && ed.contains(c)) { cell = c; setTable(c.closest("table")); position(); }
    else { cell = null; position(); }
  });

  // Keep the overlay glued to the table as the page moves; drop it if the pointer
  // leaves both the editor and the controls and no cell is selected.
  window.addEventListener("scroll", position, true);
  window.addEventListener("resize", position);
  ed.addEventListener("input", position);

  // Hovering anywhere on a table shows its controls; moving onto the controls keeps them;
  // moving off both hides them after a short grace (unless a cell is focused), so you can
  // cross the gap from the table to a ＋ strip without them vanishing.
  document.addEventListener("mousemove", function (e) {
    var overTable = e.target.closest && e.target.closest("#doc-editor table");
    if (overTable) { clearTimeout(hideTimer); setTable(overTable); return; }
    if (e.target.closest && e.target.closest(".doc-table-tools")) { clearTimeout(hideTimer); return; }
    if (!cell) scheduleHide();
  });
})();
