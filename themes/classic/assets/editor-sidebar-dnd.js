// Edit-mode sidebar: navigate to a page's editor, reorder/nest/unnest by the drag
// handle, and create a new page. The rendered nav carries data-id on every item; the
// full tree (incl. drafts) comes from /__nav. A drop computes the moved page's new
// parent + order, renumbers the affected sibling groups, PATCHes (sequentially —
// SQLite is single-writer), then reloads. Loaded in edit mode only.
(function () {
  "use strict";
  var nav = document.querySelector(".sidebar .nav");
  if (!nav) return;

  function api(method, url, body) {
    return fetch(url, {
      method: method,
      headers: body ? { "Content-Type": "application/json" } : {},
      credentials: "same-origin",
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.status === 204 ? null : r.json().catch(function () { return null; }); });
  }

  // 1 ── clicking a nav link goes to THAT page's editor, not the live view.
  document.querySelectorAll('.sidebar a.nav-link[href^="/p/"]').forEach(function (a) {
    a.setAttribute("href", "/__edit/" + a.getAttribute("href").slice(3));
  });

  // 2 ── create a new page. The button becomes an input; the slug is derived from
  // the title you type (de-duplicated), then the new page opens in the editor.
  function slugify(s) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }
  var newBtn = document.querySelector("[data-new-page]");
  if (newBtn) newBtn.addEventListener("click", function () {
    var input = document.createElement("input");
    input.className = "sidebar__new-input";
    input.placeholder = "Page title…";
    input.autocomplete = "off";
    newBtn.replaceWith(input);
    input.focus();

    function cancel() { if (input.parentNode) input.replaceWith(newBtn); }
    function create() {
      var title = input.value.trim();
      if (!title) { cancel(); return; }
      input.disabled = true;
      Promise.all([api("GET", "/api/v1/sites?limit=1"), api("GET", "/__nav")]).then(function (res) {
        var sites = res[0].data || res[0], tree = res[1] || [];
        var taken = {}; tree.forEach(function (n) { if (n.slug) taken[n.slug] = 1; });
        var base = slugify(title) || "page", slug = base, i = 2;
        while (taken[slug]) slug = base + "-" + i++;
        var rootOrders = tree.filter(function (n) { return !n.parent; }).map(function (n) { return n.order; });
        var order = (rootOrders.length ? Math.max.apply(null, rootOrders) : 0) + 1;
        var data = { title: title, slug: slug, kind: "page", body: "", order: order };
        if (sites[0] && sites[0].id) data.site = sites[0].id;
        return api("POST", "/api/v1/pages", data).then(function () { location.href = "/__edit/" + slug; });
      }).catch(function (e) { console.warn("[sidebar] create failed", e); cancel(); });
    }
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); create(); }
      else if (e.key === "Escape") { e.preventDefault(); cancel(); }
    });
    input.addEventListener("blur", function () { setTimeout(cancel, 120); });
  });

  // 3 ── drag-and-drop reorder / nest / unnest, driven off /__nav.
  var items = [];
  api("GET", "/__nav").then(function (rows) { items = rows || []; wire(); });

  function byId(id) { for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i]; return null; }
  function childrenOf(pid) {
    return items.filter(function (n) { return n.parent === pid; }).sort(function (a, b) { return a.order - b.order; });
  }
  function isSelfOrDescendant(id, maybe) {
    for (var n = byId(maybe); n; n = byId(n.parent)) if (n.id === id) return true;
    return false;
  }

  var dragId = null, overEl = null;
  function clearOver() { if (overEl) overEl.classList.remove("dnd-before", "dnd-after", "dnd-inside"); overEl = null; }
  function zone(el, y) {
    var r = el.getBoundingClientRect(), t = (y - r.top) / r.height;
    return t < 0.28 ? "before" : t > 0.72 ? "after" : "inside";
  }

  function wire() {
    // The HANDLE is the drag source; the item is the drop target. The item itself
    // isn't draggable, so a plain click still navigates.
    nav.querySelectorAll("[data-nav-item]").forEach(function (el) {
      el.setAttribute("draggable", "false");
      var handle = el.querySelector("[data-drag-handle]");
      if (handle) {
        handle.setAttribute("draggable", "true");
        handle.addEventListener("dragstart", function (e) {
          dragId = el.getAttribute("data-id");
          e.dataTransfer.effectAllowed = "move";
          try { e.dataTransfer.setData("text/plain", dragId); } catch (_) {}
          setTimeout(function () { el.classList.add("dnd-dragging"); }, 0);
        });
        handle.addEventListener("dragend", function () { el.classList.remove("dnd-dragging"); clearOver(); dragId = null; });
      }
      el.addEventListener("dragover", function (e) {
        if (!dragId || el.getAttribute("data-id") === dragId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (overEl !== el) { clearOver(); overEl = el; }
        var z = zone(el, e.clientY);
        el.classList.toggle("dnd-before", z === "before");
        el.classList.toggle("dnd-after", z === "after");
        el.classList.toggle("dnd-inside", z === "inside");
      });
      el.addEventListener("drop", function (e) {
        e.preventDefault();
        var targetId = el.getAttribute("data-id"), moved = dragId, z = zone(el, e.clientY);
        clearOver(); dragId = null;
        if (moved && moved !== targetId) applyMove(moved, targetId, z);
      });
    });
  }

  function applyMove(moved, targetId, z) {
    var target = byId(targetId);
    if (!target) return;
    var newParent = z === "inside" ? targetId : target.parent;
    if (z === "inside" && isSelfOrDescendant(moved, targetId)) return;   // no nesting into own subtree
    if (newParent && isSelfOrDescendant(moved, newParent)) return;

    var movedNode = byId(moved), oldParent = movedNode.parent;
    var dest = childrenOf(newParent).filter(function (n) { return n.id !== moved; });
    if (z === "inside") {
      dest.push(movedNode);
    } else {
      var ti = dest.map(function (n) { return n.id; }).indexOf(targetId);
      dest.splice(z === "after" ? ti + 1 : ti, 0, movedNode);
    }

    var patches = [];
    movedNode.parent = newParent;
    dest.forEach(function (n, i) {
      var changed = n.order !== i || (n.id === moved && oldParent !== newParent);
      n.order = i;
      if (changed) patches.push({ id: n.id, data: { order: i, parent: n.parent || null } });
    });
    if (oldParent !== newParent) {
      childrenOf(oldParent).forEach(function (n, i) {
        if (n.order !== i) { n.order = i; patches.push({ id: n.id, data: { order: i } }); }
      });
    }

    // Sequentially — concurrent writes race to a "database is locked" (SQLITE_BUSY).
    patches.reduce(function (chain, p) {
      return chain.then(function () { return api("PATCH", "/api/v1/pages/" + p.id, p.data); });
    }, Promise.resolve())
      .then(function () { location.reload(); })
      .catch(function (err) { console.warn("[sidebar-dnd] save failed", err); location.reload(); });
  }
})();
