// Link dialog for #doc-editor. Toolbar link button or Cmd/Ctrl+K. Opening steals
// focus, so the selection range is saved first and passed to insertLink. If the
// caret sits in an existing <a>, the dialog edits it (Update / Remove). Loaded
// after editor-boot.js, edit mode only.
(function () {
  "use strict";
  var ed = document.getElementById("doc-editor");
  if (!ed || typeof window.insertLink !== "function") return;
  var wrap = ed.closest(".compose-editor-wrap");
  var toolbar = wrap && wrap.querySelector(".rte-toolbar");

  var dlg = document.createElement("div");
  dlg.className = "rte-link";
  dlg.hidden = true;
  dlg.innerHTML =
    '<input class="rte-link__text" type="text" placeholder="Link text" autocomplete="off">' +
    '<input class="rte-link__url" type="url" placeholder="https://…  ·  mailto:  ·  tel:" autocomplete="off">' +
    '<div class="rte-link__row">' +
    '<button type="button" class="btn btn-ghost btn--sm rte-link__remove" hidden>Remove</button>' +
    '<button type="button" class="btn btn-ghost btn--sm rte-link__cancel">Cancel</button>' +
    '<button type="button" class="btn btn--sm rte-link__ok">Add link</button>' +
    "</div>";
  document.body.appendChild(dlg);
  var textI = dlg.querySelector(".rte-link__text");
  var urlI = dlg.querySelector(".rte-link__url");
  var okB = dlg.querySelector(".rte-link__ok");
  var cancelB = dlg.querySelector(".rte-link__cancel");
  var removeB = dlg.querySelector(".rte-link__remove");

  var savedRange = null, editingLink = null;

  function linkAtCaret() {
    var s = window.getSelection();
    if (!s.rangeCount) return null;
    var n = s.getRangeAt(0).startContainer;
    n = n.nodeType === 1 ? n : n.parentNode;
    var a = n && n.closest ? n.closest("a") : null;
    return a && ed.contains(a) ? a : null;
  }

  function openDlg() {
    var s = window.getSelection();
    savedRange = s.rangeCount && ed.contains(s.getRangeAt(0).startContainer) ? s.getRangeAt(0).cloneRange() : null;
    editingLink = linkAtCaret();
    dlg.hidden = false;   // must be measurable before wui.float reads its size
    var anchor = savedRange || ed;
    if (window.wui && window.wui.float) {
      window.wui.float.place(dlg, anchor, { side: "bottom", align: "start", gap: 6 });
    } else {
      var rect = anchor.getBoundingClientRect();
      dlg.style.left = Math.round(rect.left) + "px";
      dlg.style.top = Math.round(rect.bottom + 6) + "px";
    }
    if (editingLink) {
      textI.value = editingLink.textContent;
      urlI.value = editingLink.getAttribute("href") || "";
      removeB.hidden = false; okB.textContent = "Update";
    } else {
      textI.value = savedRange && !savedRange.collapsed ? savedRange.toString() : "";
      urlI.value = ""; removeB.hidden = true; okB.textContent = "Add link";
    }
    dlg.hidden = false;
    urlI.focus();
  }
  function closeDlg() { dlg.hidden = true; savedRange = null; editingLink = null; }

  function apply() {
    var text = textI.value.trim(), url = urlI.value.trim();
    if (!url) { closeDlg(); ed.focus(); return; }
    if (editingLink) window.updateLink(ed, editingLink, { text: text, url: url });
    else if (savedRange) window.insertLink(ed, savedRange, { text: text, url: url });
    closeDlg(); ed.focus();
  }

  if (toolbar) toolbar.addEventListener("mousedown", function (e) {
    var b = e.target.closest('[data-rte="link"]');
    if (!b) return;
    e.preventDefault();
    openDlg();
  });
  okB.addEventListener("click", apply);
  cancelB.addEventListener("click", function () { closeDlg(); ed.focus(); });
  removeB.addEventListener("click", function () { if (editingLink) window.removeLink(ed, editingLink); closeDlg(); ed.focus(); });
  dlg.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); apply(); }
    else if (e.key === "Escape") { e.preventDefault(); closeDlg(); ed.focus(); }
  });
  ed.addEventListener("keydown", function (e) {
    if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.stopPropagation(); openDlg(); }
  }, true);

  // Let other chrome (the selection bubble) open the same dialog.
  window.rteOpenLink = openDlg;
})();
