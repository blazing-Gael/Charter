// "How is this guide?" widget. Good/Bad reveals the comment form (animated); Submit
// posts to the rate-limited /__feedback route, then the form animates out to a
// thank-you. No framework. Loaded on reading pages.
(function () {
  "use strict";
  var el = document.querySelector("[data-feedback]");
  if (!el) return;
  var page = el.getAttribute("data-page");
  var ask = el.querySelector(".feedback__ask");
  var form = el.querySelector(".feedback__form");
  var done = el.querySelector(".feedback__done");
  var text = el.querySelector(".feedback__text");
  var email = el.querySelector(".feedback__email");
  var submit = el.querySelector("[data-submit]");
  var rating = null;

  el.querySelectorAll("[data-rating]").forEach(function (b) {
    b.addEventListener("click", function () {
      rating = b.getAttribute("data-rating");
      el.querySelectorAll("[data-rating]").forEach(function (x) { x.classList.toggle("is-on", x === b); });
      el.classList.add("is-open");
      setTimeout(function () { text.focus(); }, 160);
    });
  });

  if (submit) submit.addEventListener("click", function () {
    if (!rating) return;
    if (email && email.required && !email.value.trim()) { email.focus(); return; }
    submit.disabled = true;
    fetch("/__feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ page: page, rating: rating, comment: text.value, email: email ? email.value : "" })
    }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      // animate out: fade the prompt, collapse the form, reveal the thanks
      ask.style.transition = "opacity .2s ease"; ask.style.opacity = "0";
      el.classList.remove("is-open");
      setTimeout(function () { ask.hidden = true; form.hidden = true; done.hidden = false; }, 260);
    }).catch(function () {
      submit.disabled = false;
      submit.textContent = "Try again";
    });
  });
})();
