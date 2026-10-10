// edit mode — wires the topbar actions to the generated REST API. No framework.
// Your DOM editor replaces/enhances #doc-editor; this file only reads its innerHTML
// on save, so it stays compatible whatever editor you mount.
(function () {
  "use strict";
  var bar = document.querySelector("[data-edit-id]");
  if (!bar) return;
  var id = bar.getAttribute("data-edit-id");
  var editor = document.getElementById("doc-editor");
  var titleEl = document.getElementById("edit-title");
  var descEl = document.getElementById("edit-description");
  var authorEl = document.getElementById("edit-author");
  var badgesEl = document.getElementById("edit-badges");
  var badge = document.getElementById("status-badge");
  var toastEl = document.getElementById("toast");
  var published = bar.getAttribute("data-published") === "true";

  function toast(msg, ok) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.className = "toast" + (ok === false ? " toast--err" : "");
    toastEl.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toastEl.hidden = true; }, 2200);
  }

  // The session cookie authenticates these same-origin calls (admin/editor role).
  function api(method, url, body) {
    return fetch(url, {
      method: method,
      headers: body ? { "Content-Type": "application/json" } : {},
      credentials: "same-origin",
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.status === 204 ? null : r.json().catch(function () { return null; });
    });
  }

  // The engine's docs-clean serialize when it's mounted; raw innerHTML otherwise
  // (e.g. the editor script failed to load) so saving still works.
  function bodyHTML() {
    return typeof window.serializeDocBody === "function" ? window.serializeDocBody() : editor.innerHTML;
  }

  function save() {
    var data = { title: titleEl.value, body: bodyHTML() };
    if (descEl) data.description = descEl.value;
    if (authorEl) data.author = authorEl.value;
    if (badgesEl) data.badges = badgesEl.value;
    return api("PATCH", "/api/v1/pages/" + id, data)
      .then(function () { toast("Saved"); })
      .catch(function (e) { toast("Save failed: " + e.message, false); throw e; });
  }

  function setStatus(pub) {
    published = pub;
    if (badge) {
      badge.textContent = pub ? "Published" : "Draft";
      badge.className = "badge " + (pub ? "badge--live" : "badge--draft");
    }
    var btn = document.querySelector('[data-action="publish"]');
    if (btn) btn.textContent = pub ? "Unpublish" : "Publish";
  }

  function publish() {
    // Save first so what goes live is the latest content.
    save().then(function () {
      return api("POST", "/api/v1/pages/" + id + "/" + (published ? "unpublish" : "publish"), null);
    }).then(function () {
      setStatus(!published);
      toast(published ? "Published" : "Unpublished");
    }).catch(function (e) { toast("Failed: " + e.message, false); });
  }

  function exportSite() {
    toast("Exporting…");
    api("POST", "/__export", null)
      .then(function () { toast("Exported to ./public"); })
      .catch(function (e) { toast("Export failed: " + e.message, false); });
  }

  document.querySelectorAll("[data-action]").forEach(function (b) {
    b.addEventListener("click", function () {
      var a = b.getAttribute("data-action");
      if (a === "save") save();
      else if (a === "publish") publish();
      else if (a === "export") exportSite();
    });
  });

  // Ctrl/Cmd+S to save.
  document.addEventListener("keydown", function (e) {
    if ((e.key === "s" || e.key === "S") && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
  });
})();
