// Page-header actions: "Copy page" (as Markdown) plus a dropdown to view the raw
// Markdown or hand the page to an LLM (ChatGPT / Claude). The Markdown lives at
// data-md-url; AI links reference its absolute URL so the model can fetch it. The
// menu floats with wui.float and matches the editor chrome's popovers. Reading-page
// only; no-ops cleanly if the header or wui is absent.
(function () {
  "use strict";
  var host = document.querySelector("[data-page-actions]");
  if (!host) return;

  var mdUrl = host.getAttribute("data-md-url");
  var title = host.getAttribute("data-title") || document.title;
  // Absolute Markdown URL — what an external LLM needs to fetch the page.
  var absMd = mdUrl ? new URL(mdUrl, location.href).href : "";
  var copyBtn = host.querySelector("[data-copy-page]");
  var menuBtn = host.querySelector("[data-page-menu]");

  function flash(btn, label, icon) {
    var lbl = btn.querySelector(".doc-action__label");
    var ic = btn.querySelector(".ph");
    var oldL = lbl ? lbl.textContent : "", oldI = ic ? ic.className : "";
    if (lbl) lbl.textContent = label;
    if (ic) ic.className = "ph " + icon;
    clearTimeout(btn._t);
    btn._t = setTimeout(function () {
      if (lbl) lbl.textContent = oldL;
      if (ic) ic.className = oldI;
    }, 1400);
  }

  function copyMarkdown(btn) {
    if (!mdUrl) return;
    fetch(mdUrl, { credentials: "same-origin" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
      .then(function (md) { return navigator.clipboard.writeText(md); })
      .then(function () { flash(btn || copyBtn, "Copied", "ph-check"); })
      .catch(function () { flash(btn || copyBtn, "Failed", "ph-warning"); });
  }

  if (copyBtn) copyBtn.addEventListener("click", function () { copyMarkdown(copyBtn); });

  // ── dropdown ──────────────────────────────────────────────────────────────
  // Prompt the model gets; it fetches the Markdown URL for the full content.
  var prompt = "Read " + absMd + " — the documentation page \"" + title +
    "\" — so I can ask you questions about it.";

  var items = [
    { icon: "ph-copy", label: "Copy Markdown", act: function () { copyMarkdown(copyBtn); } },
    { icon: "ph-file-md", label: "View as Markdown", act: function () { window.open(mdUrl, "_blank", "noopener"); } },
    { sep: true },
    { icon: "ph-openai-logo", label: "Open in ChatGPT", act: function () { window.open("https://chatgpt.com/?q=" + encodeURIComponent(prompt), "_blank", "noopener"); } },
    { icon: "ph-sparkle", label: "Open in Claude", act: function () { window.open("https://claude.ai/new?q=" + encodeURIComponent(prompt), "_blank", "noopener"); } }
  ];

  var menu = null;
  function buildMenu() {
    var m = document.createElement("div");
    m.className = "doc-menu";
    m.hidden = true;
    m.setAttribute("role", "menu");
    items.forEach(function (it) {
      if (it.sep) { var s = document.createElement("div"); s.className = "doc-menu__sep"; m.appendChild(s); return; }
      var b = document.createElement("button");
      b.type = "button";
      b.className = "doc-menu__item";
      b.setAttribute("role", "menuitem");
      b.innerHTML = '<i class="ph ' + it.icon + '"></i><span>' + it.label + "</span>";
      b.addEventListener("click", function () { close(); it.act(); });
      m.appendChild(b);
    });
    document.body.appendChild(m);
    return m;
  }

  function place() {
    if (window.wui && window.wui.float) {
      window.wui.float.place(menu, menuBtn, { side: "bottom", align: "end", gap: 6, flip: true });
    } else {
      var r = menuBtn.getBoundingClientRect();
      menu.style.position = "fixed";
      menu.style.top = Math.round(r.bottom + 6) + "px";
      menu.style.left = Math.round(r.right - menu.offsetWidth) + "px";
    }
  }
  function open() {
    if (!menu) menu = buildMenu();
    menu.hidden = false;
    place();
    menuBtn.setAttribute("aria-expanded", "true");
    setTimeout(function () {
      document.addEventListener("click", onDoc, true);
      document.addEventListener("keydown", onKey, true);
    }, 0);
  }
  function close() {
    if (!menu) return;
    menu.hidden = true;
    menuBtn.setAttribute("aria-expanded", "false");
    document.removeEventListener("click", onDoc, true);
    document.removeEventListener("keydown", onKey, true);
  }
  function onDoc(e) { if (!menu.contains(e.target) && e.target !== menuBtn && !menuBtn.contains(e.target)) close(); }
  function onKey(e) { if (e.key === "Escape") close(); }

  if (menuBtn) menuBtn.addEventListener("click", function () {
    if (menu && !menu.hidden) close(); else open();
  });
})();
