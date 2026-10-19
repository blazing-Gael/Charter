// editor-tabs.js — WYSIWYG authoring for .wui-tabs blocks, edit mode only.
//
// Reading pages enhance the same markup with wui/tabs.js; this file is loaded only in
// the editor (and never referenced by the static export). It drives the stored
// anchor-link + section markup in place, so saving still just serializes it:
//   - one panel is shown at a time (the active tab), like the published view
//   - click a tab to switch to it; its name is the anchor text, editable right there
//   - a ＋ at the end of the bar adds a tab; a × removes the active one (min one)
//
// Nothing here leaks into stored HTML: the ＋/× are <button>s and the list/tab
// contenteditable flags are stripped by the engine's serialize, and editor-boot's
// docsClean clears the is-active class. The canonical saved shape stays all-panels-
// visible with one aria-current tab (wui/tabs.js re-derives the shown panel from it).
(function () {
  "use strict";
  var ed = document.getElementById("doc-editor");
  if (!ed) return;

  function tabList(box) { return box.querySelector(".wui-tab-list"); }
  function tabsOf(box) {
    var l = tabList(box);
    return l ? [].slice.call(l.querySelectorAll("a.wui-tab")) : [];
  }
  function panelsOf(box) { return [].slice.call(box.querySelectorAll(".wui-tab-panel")); }
  function panelFor(tab) {
    var h = tab.getAttribute("href") || "";
    return h.charAt(0) === "#" ? document.getElementById(h.slice(1)) : null;
  }
  function rid() { return "t-" + Math.random().toString(36).slice(2, 8); }

  function selectText(el) {
    var r = document.createRange();
    r.selectNodeContents(el);
    var s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }
  function caretStart(el) {
    if (!el) return;
    var r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(true);
    var s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }

  // Show one tab's panel, mark its chip current, hide the rest.
  function activate(box, tab) {
    tabsOf(box).forEach(function (t) {
      var on = t === tab;
      if (on) t.setAttribute("aria-current", "true");
      else t.removeAttribute("aria-current");
      var p = panelFor(t);
      if (p) p.classList.toggle("is-active", on);
    });
  }

  function initBox(box) {
    if (box.__tabsInit) return;
    box.__tabsInit = true;
    var list = tabList(box);
    if (!list) return;
    list.setAttribute("contenteditable", "false");       // the bar is chrome, not text
    tabsOf(box).forEach(function (t) { t.setAttribute("contenteditable", "true"); });
    if (!list.querySelector(".wui-tab-add")) {
      var add = document.createElement("button");
      add.type = "button";
      add.className = "wui-tab-add";
      add.setAttribute("contenteditable", "false");
      add.setAttribute("aria-label", "Add tab");
      add.textContent = "＋";
      var del = document.createElement("button");
      del.type = "button";
      del.className = "wui-tab-del";
      del.setAttribute("contenteditable", "false");
      del.setAttribute("aria-label", "Remove current tab");
      del.textContent = "×";
      list.appendChild(add);
      list.appendChild(del);
    }
    var tabs = tabsOf(box);
    var cur = tabs.filter(function (t) { return t.getAttribute("aria-current") === "true"; })[0] || tabs[0];
    if (cur) activate(box, cur);
  }

  function addTab(box) {
    var list = tabList(box);
    if (!list) return;
    var id = rid();
    var a = document.createElement("a");
    a.className = "wui-tab";
    a.setAttribute("href", "#" + id);
    a.setAttribute("contenteditable", "true");
    a.textContent = "New tab";
    list.insertBefore(a, list.querySelector(".wui-tab-add"));
    var sec = document.createElement("section");
    sec.className = "wui-tab-panel";
    sec.id = id;
    sec.innerHTML = "<p><br></p>";
    box.appendChild(sec);
    activate(box, a);
    selectText(a);                                        // name selected, ready to type over
  }

  function removeActive(box) {
    var tabs = tabsOf(box);
    if (tabs.length <= 1) return;                         // keep at least one tab
    var cur = tabs.filter(function (t) { return t.getAttribute("aria-current") === "true"; })[0] || tabs[0];
    var i = tabs.indexOf(cur);
    var next = tabs[i + 1] || tabs[i - 1];
    var p = panelFor(cur);
    if (p) p.remove();
    cur.remove();
    if (next) activate(box, next);
  }

  // Click: ＋ adds, × removes, a tab switches (and native caret placement lets you rename).
  ed.addEventListener("click", function (e) {
    var add = e.target.closest(".wui-tab-add");
    if (add) { e.preventDefault(); addTab(add.closest(".wui-tabs")); return; }
    var del = e.target.closest(".wui-tab-del");
    if (del) { e.preventDefault(); removeActive(del.closest(".wui-tabs")); return; }
    var tab = e.target.closest("a.wui-tab");
    if (tab && ed.contains(tab)) { e.preventDefault(); activate(tab.closest(".wui-tabs"), tab); }
  });

  // Enter inside a tab name commits it and drops the caret into that tab's panel,
  // instead of the engine splitting the label into two lines. Capture beats the engine.
  ed.addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;
    var s = window.getSelection();
    if (!s.rangeCount) return;
    var n = s.getRangeAt(0).startContainer;
    var el = n.nodeType === 1 ? n : n.parentElement;
    var tab = el && el.closest ? el.closest("a.wui-tab") : null;
    if (tab && ed.contains(tab)) {
      e.preventDefault();
      e.stopPropagation();
      caretStart(panelFor(tab));
    }
  }, true);

  function initAll() { [].forEach.call(ed.querySelectorAll(".wui-tabs"), initBox); }

  // editor-boot adopts the server HTML synchronously before this deferred script runs,
  // so the markup is in place. Re-scan after inserts (slash menu) via a light observer.
  initAll();
  if (window.MutationObserver) {
    var mo = new MutationObserver(function () { initAll(); });
    mo.observe(ed, { childList: true, subtree: true });
  }
})();
