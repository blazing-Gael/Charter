// TOC gliding blanket. wui.scrollspy (data-spy-multi) marks every in-view heading's link
// .is-active; those links are contiguous, so a single element — .toc__glide — is sized and
// slid to cover the whole run. It transitions transform + height, so the band glides from
// one section group to the next instead of each link's background popping in and out.
// Reading page only; no-ops when there's no TOC.
(function () {
  "use strict";
  var nav = document.querySelector(".toc__inner[data-scrollspy]");
  if (!nav) return;
  var body = nav.querySelector(".toc__body");
  var glide = nav.querySelector(".toc__glide");
  if (!body || !glide) return;

  var raf = 0;
  function update() {
    raf = 0;
    var active = nav.querySelectorAll(".toc__link.is-active");
    if (!active.length) { glide.style.opacity = "0"; return; }
    var base = body.getBoundingClientRect();
    var first = active[0].getBoundingClientRect();           // contiguous + in document order
    var last = active[active.length - 1].getBoundingClientRect();
    glide.style.transform = "translateY(" + (first.top - base.top) + "px)";
    glide.style.height = (last.bottom - first.top) + "px";
    glide.style.opacity = "1";
  }
  function schedule() { if (!raf) raf = requestAnimationFrame(update); }

  // scrollspy fires these on the nav as sections enter/leave the viewport.
  ["wui-spy-enter", "wui-spy-leave", "wui-spy-change"].forEach(function (ev) {
    nav.addEventListener(ev, schedule);
  });
  window.addEventListener("resize", schedule);
  schedule();
})();
