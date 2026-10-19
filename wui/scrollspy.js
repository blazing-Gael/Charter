// wui scrollspy — reports which target(s) are in view as you scroll, via a native
// IntersectionObserver (no scroll handlers). Highlights a TOC link, or just fires
// enter/leave/change events you hook for reveals, analytics, step indicators, etc.
// Works vertical or horizontal, over the viewport or a nested scroll container.
// Scans once on load; call wui.scrollspy(scope) for nodes added later.
//
//   TOC / nav mode — active link gets .is-active + aria-current:
//     <nav data-scrollspy>
//       <a href="#intro">Intro</a> <a href="#setup">Setup</a>
//     </nav>
//     <section id="intro">…</section> <section id="setup">…</section>
//
//   Event mode — no nav; hook the events:
//     <div data-scrollspy><section data-spy>…</section></div>
//     el.addEventListener('wui-spy-enter', e => e.detail.target.classList.add('seen'));
//
//   Options (data-attr → arg): data-spy-root="sel" · data-spy-axis="x|y" ·
//     data-spy-offset="<rootMargin>" · data-spy-multi (highlight ALL visible, not one) ·
//     data-spy-active="class" · data-spy-follow (scroll active link into view) ·
//     data-spy-noscroll (don't smooth-scroll on link click) · data-spy-targets="sel"
//
//   wui.scrollspy(root, opts) → { active, refresh(), destroy() }.  Bubbling events on root:
//     wui-spy-enter / -leave / -change  → detail { id, target, link, previous? }

(function () {
"use strict";

const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function setup(root, override) {
  const d = root.dataset;
  const o = Object.assign({
    rootSel: d.spyRoot, axis: d.spyAxis || 'y', offset: d.spyOffset,
    single: d.spyMulti == null, activeClass: d.spyActive || 'is-active',
    follow: d.spyFollow != null, scroll: d.spyNoscroll == null, targets: d.spyTargets,
  }, override || {});

  const rootEl = (o.root instanceof Element) ? o.root : (o.rootSel ? document.querySelector(o.rootSel) : null);

  // resolve targets + the nav link for each (href="#id")
  let targets = [], linkFor = new Map(), io = null, ac = null;
  const visible = new Set();
  let activeId = null;

  function resolve() {
    const links = [...root.querySelectorAll('a[href^="#"]')];
    if (o.targets) targets = [...document.querySelectorAll(o.targets)];
    else if (links.length) targets = links.map((a) => document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1)))).filter(Boolean);
    else targets = [...root.querySelectorAll('[data-spy]')];
    linkFor = new Map();
    links.forEach((a) => { const t = document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1))); if (t) linkFor.set(t, a); });
  }

  const emit = (kind, t, extra) => {
    root.dispatchEvent(new CustomEvent('wui-spy-' + kind, { bubbles: true, detail: Object.assign({ id: t && t.id, target: t, link: t && linkFor.get(t) }, extra) }));
    const cb = o['on' + kind[0].toUpperCase() + kind.slice(1)];
    if (cb) cb(t, linkFor.get(t));
  };

  const mark = (t, on) => {
    if (!t) return;
    t.classList.toggle(o.activeClass, on);
    const l = linkFor.get(t);
    if (l) { l.classList.toggle(o.activeClass, on); on ? l.setAttribute('aria-current', 'true') : l.removeAttribute('aria-current'); }
  };

  function apply() {
    if (!o.single) {                                   // multi: every visible target is active
      targets.forEach((t) => mark(t, visible.has(t)));
      const first = targets.find((t) => visible.has(t));
      activeId = first ? first.id : activeId;
      return;
    }
    // single: the visible target nearest the top (or left) wins; keep the last if none visible
    let best = null, bestEdge = Infinity;
    visible.forEach((t) => { const r = t.getBoundingClientRect(); const edge = o.axis === 'x' ? r.left : r.top; if (edge < bestEdge) { bestEdge = edge; best = t; } });
    const id = best ? best.id : activeId;
    if (id === activeId) return;
    const prevT = targets.find((t) => t.id === activeId);
    mark(prevT, false); mark(best, true);
    const previous = activeId; activeId = id;
    if (best) { emit('change', best, { previous }); if (o.follow) linkFor.get(best)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduce() ? 'auto' : 'smooth' }); }
  }

  function connect() {
    ac = new AbortController();
    // default band: a thin slice near the top/left for a TOC (so one link is active at a time),
    // but the full viewport in event mode, so reveals fire as a target enters from the edge.
    const rootMargin = o.offset || (linkFor.size ? (o.axis === 'x' ? '0px -75% 0px 0px' : '0px 0px -75% 0px') : '0px');
    io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting && !visible.has(e.target)) { visible.add(e.target); emit('enter', e.target); }
        else if (!e.isIntersecting && visible.has(e.target)) { visible.delete(e.target); emit('leave', e.target); }
      }
      apply();
    }, { root: rootEl, rootMargin, threshold: o.threshold ?? 0 });
    targets.forEach((t) => io.observe(t));

    if (o.scroll) linkFor.forEach((a, t) => a.addEventListener('click', (ev) => {
      ev.preventDefault();
      t.scrollIntoView({ behavior: reduce() ? 'auto' : 'smooth', block: 'start', inline: 'start' });
    }, { signal: ac.signal }));
  }

  resolve(); connect();

  return {
    get active() { return activeId; },
    refresh() { io.disconnect(); ac.abort(); visible.clear(); resolve(); connect(); apply(); },
    destroy() { io.disconnect(); ac.abort(); targets.forEach((t) => mark(t, false)); },
  };
}

function scrollspy(scopeOrEl, opts) {
  if (scopeOrEl instanceof Element && scopeOrEl.hasAttribute('data-scrollspy')) return setup(scopeOrEl, opts);
  const scope = scopeOrEl || document;
  scope.querySelectorAll?.('[data-scrollspy]').forEach((el) => { if (!el.dataset.wuiSpy) { el.dataset.wuiSpy = '1'; setup(el); } });
}

window.wui = window.wui || {};
window.wui.scrollspy = scrollspy;

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => scrollspy());
else scrollspy();

})();
