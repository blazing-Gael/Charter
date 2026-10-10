// Editor comments panel (edit mode, right column). Lists reader feedback for the
// current page; each can be hidden (soft) or deleted. Reads via the admin/editor
// REST API. Loaded in edit mode only.
(function () {
  "use strict";
  var el = document.querySelector("[data-comments]");
  if (!el) return;
  var page = el.getAttribute("data-page");
  var list = el.querySelector(".comments__list");
  var empty = el.querySelector(".comments__empty");
  var count = el.querySelector(".comments__count");
  if (!page) { empty.hidden = false; return; }

  function api(method, url, body) {
    return fetch(url, {
      method: method, headers: body ? { "Content-Type": "application/json" } : {},
      credentials: "same-origin", body: body ? JSON.stringify(body) : undefined
    }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.status === 204 ? null : r.json().catch(function () { return null; }); });
  }
  function esc(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : s; return d.innerHTML; }
  function fmt(ts) { try { return new Date(ts).toLocaleDateString(); } catch (e) { return ""; } }

  var cache = [];
  function render() {
    empty.hidden = cache.length > 0;
    count.hidden = !cache.length;
    count.textContent = cache.length;
    list.innerHTML = cache.map(function (f) {
      var good = f.rating === "good";
      return '<li class="comment' + (f.hidden ? " is-hidden" : "") + '" data-id="' + f.id + '">' +
        '<div class="comment__head">' +
          '<span class="comment__rating comment__rating--' + f.rating + '"><i class="ph ' + (good ? "ph-thumbs-up" : "ph-thumbs-down") + '"></i></span>' +
          '<span class="comment__date">' + fmt(f.created_at) + "</span>" +
          '<span class="comment__actions">' +
            '<button type="button" class="comment__act" data-act="hide" title="' + (f.hidden ? "Show" : "Hide") + '"><i class="ph ' + (f.hidden ? "ph-eye" : "ph-eye-slash") + '"></i></button>' +
            '<button type="button" class="comment__act" data-act="delete" title="Delete"><i class="ph ph-trash"></i></button>' +
          "</span>" +
        "</div>" +
        (f.comment ? '<p class="comment__text">' + esc(f.comment) + "</p>" : "") +
        (f.email ? '<a class="comment__email" href="mailto:' + esc(f.email) + '">' + esc(f.email) + "</a>" : "") +
        "</li>";
    }).join("");
  }

  // filter[field]=value is the API's filter syntax; a bare ?page= is ignored (which
  // is why unfiltered feedback showed on every page before).
  api("GET", "/api/v1/feedback?filter[page]=" + encodeURIComponent(page) + "&limit=100&sort=-created_at")
    .then(function (d) { cache = (d && (d.data || d)) || []; render(); })
    .catch(function () { empty.textContent = "Couldn't load comments."; empty.hidden = false; });

  // Collapse/expand the whole list from the header button.
  var toggle = el.querySelector("[data-comments-toggle]");
  if (toggle) toggle.addEventListener("click", function () {
    var collapsed = el.classList.toggle("is-collapsed");
    toggle.setAttribute("aria-label", collapsed ? "Show comments" : "Hide comments");
  });

  list.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-act]");
    if (!btn) return;
    var li = btn.closest("[data-id]"), id = li.getAttribute("data-id");
    var f = cache.filter(function (x) { return x.id === id; })[0];
    if (!f) return;
    if (btn.getAttribute("data-act") === "hide") {
      api("PATCH", "/api/v1/feedback/" + id, { hidden: !f.hidden }).then(function () { f.hidden = !f.hidden; render(); });
    } else {
      api("DELETE", "/api/v1/feedback/" + id).then(function () { cache = cache.filter(function (x) { return x.id !== id; }); render(); });
    }
  });
})();
