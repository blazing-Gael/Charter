// wui tooltip — text tooltips (.wui-tip) + hover/click popovers (.wui-pop). Both
// render in the TOP LAYER via the Popover API (never clipped, no z-index) and are
// positioned here in JS, because CSS anchor positioning isn't cross-browser yet.
// Styles: tooltip.css (same folder). REQUIRES float.js loaded first (shared placement).
//
// TOOLTIP — add data-tip="…" to any element. Shows on hover AND keyboard focus,
// hides on blur / mouse-leave / Esc / scroll. No init: it's delegated, so it also
// covers elements added later.
//     data-tip-pos="top|right|bottom|left"     (default top; flips if it would clip)
//     data-tip-align="start|center|end"        (default center)
//     data-tip-tone="danger|success|warn|info" (default: dark)
//     data-tip-gap="16"                        (px from the anchor, default 8)
//     <button data-tip="Archive" data-tip-pos="right">…</button>
//   Content comes from data-tip; for an icon button you already have aria-label, so
//   the tip is a visible echo of it. (Disabled controls don't emit hover events —
//   wrap them if they need a tip. Touch has no hover; rely on aria-label there.)
//
// POPOVER — data-popover="#content" on a trigger shows that element as a popover.
//     data-popover-on="click|hover"   (default click — click gets native light-dismiss)
//     reuses data-tip-pos / data-tip-align.
//   Keep INTERACTIVE popovers on click (hover-to-interact is a keyboard/touch trap);
//   use hover only for non-interactive previews.
//
// window.wui.tip.show(el) / .hide();  window.wui.popover(trigger) binds one.

(function () {
"use strict";
if (window.wui && window.wui.tip) return;   // already loaded (two includes would show two tips)

const SHOW_DELAY = 120, GAP = 8, PAD = 6;
const hasPopover = 'popover' in HTMLElement.prototype;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
const isOpen = (el) => hasPopover ? el.matches(':popover-open') : el.classList.contains('wui-open');
const showEl = (el) => { if (hasPopover) { try { el.showPopover(); } catch (_) {} } else { el.style.display = 'block'; el.classList.add('wui-open'); } };
const hideEl = (el) => { if (hasPopover) { try { el.hidePopover(); } catch (_) {} } else { el.style.display = 'none'; el.classList.remove('wui-open'); } };

// Placement is shared (wui.float); here we just add the arrow offset that points at the anchor.
function place(el, anchor, pos, align) {
  const gap = parseFloat(anchor.getAttribute('data-tip-gap')) || GAP;
  const r = window.wui.float.place(el, anchor, { side: pos, align, gap, pad: PAD });
  const a = anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
  const arrow = (r.side === 'top' || r.side === 'bottom')
    ? clamp(a.left + a.width / 2 - r.x, 10, w - 10)
    : clamp(a.top + a.height / 2 - r.y, 10, h - 10);
  el.style.setProperty('--tip-arrow', arrow + 'px');
}

// ── text tooltip: one shared element, moved + refilled per anchor ──
let tipEl, tipAnchor, showTimer;
function tipNode() {
  if (tipEl) return tipEl;
  tipEl = document.createElement('div');
  tipEl.className = 'wui-tip';
  tipEl.id = 'wui-tip';
  tipEl.setAttribute('role', 'tooltip');
  if (hasPopover) tipEl.popover = 'manual';
  document.body.appendChild(tipEl);
  return tipEl;
}
function showTip(anchor) {
  const text = anchor.getAttribute('data-tip'); if (!text) return;
  const el = tipNode();
  el.textContent = text;
  const tone = anchor.getAttribute('data-tip-tone');
  if (tone) el.dataset.tipTone = tone; else delete el.dataset.tipTone;
  tipAnchor = anchor;
  anchor.setAttribute('aria-describedby', 'wui-tip');
  showEl(el);
  place(el, anchor, anchor.getAttribute('data-tip-pos') || 'top', anchor.getAttribute('data-tip-align') || 'center');
}
function hideTip() {
  clearTimeout(showTimer);
  if (tipAnchor) { tipAnchor.removeAttribute('aria-describedby'); tipAnchor = null; }
  if (!tipEl) return;
  hideEl(tipEl);
}

// Delegated — hover has a small intent delay; focus shows at once (keyboard users).
document.addEventListener('mouseover', (e) => {
  const a = e.target.closest?.('[data-tip]'); if (!a || a === tipAnchor) return;
  clearTimeout(showTimer); showTimer = setTimeout(() => showTip(a), SHOW_DELAY);
});
document.addEventListener('mouseout', (e) => {
  const a = e.target.closest?.('[data-tip]'); if (!a) return;
  if (e.relatedTarget && a.contains(e.relatedTarget)) return;   // still inside the same trigger
  hideTip();
});
document.addEventListener('focusin',  (e) => { const a = e.target.closest?.('[data-tip]'); if (a) showTip(a); });
document.addEventListener('focusout', (e) => { const a = e.target.closest?.('[data-tip]'); if (a) hideTip(); });
document.addEventListener('keydown',  (e) => { if (e.key === 'Escape') hideTip(); });
window.addEventListener('scroll', hideTip, true);

// ── popover: bind a trigger to its content element ──
function bindPopover(trigger) {
  const content = document.querySelector(trigger.getAttribute('data-popover') || '');
  if (!content) return;
  content.classList.add('wui-pop');
  const on = trigger.getAttribute('data-popover-on') || 'click';
  if (hasPopover && !content.hasAttribute('popover')) content.popover = on === 'hover' ? 'manual' : 'auto';

  const pos = () => place(content, trigger, trigger.getAttribute('data-tip-pos') || 'bottom', trigger.getAttribute('data-tip-align') || 'center');
  const open = () => { showEl(content); pos(); };
  const close = () => hideEl(content);

  if (on === 'hover') {
    let t;
    const enter = () => { clearTimeout(t); open(); };
    const leave = () => { t = setTimeout(close, 140); };                 // grace so you can cross into the popover
    trigger.addEventListener('pointerenter', enter);
    trigger.addEventListener('pointerleave', leave);
    content.addEventListener('pointerenter', () => clearTimeout(t));
    content.addEventListener('pointerleave', leave);
    trigger.addEventListener('focusin', enter);
    trigger.addEventListener('focusout', (e) => { if (!content.contains(e.relatedTarget)) leave(); });
  } else {
    trigger.addEventListener('click', () => isOpen(content) ? close() : open());
    content.addEventListener('toggle', (e) => { if (e.newState === 'open') pos(); }); // reposition on any open (incl. light-dismiss reopen)
  }
  const reflow = () => { if (isOpen(content)) pos(); };
  window.addEventListener('scroll', reflow, true);
  window.addEventListener('resize', reflow);
  trigger.dataset.wuiPopoverBound = '1';
}

function popover(trigger) {
  if (typeof trigger === 'string') trigger = document.querySelector(trigger);
  if (trigger && !trigger.dataset.wuiPopoverBound) bindPopover(trigger);
  return trigger;
}
popover.init = (root = document) => root.querySelectorAll('[data-popover]:not([data-wui-popover-bound])').forEach(bindPopover);

window.wui = window.wui || {};
window.wui.tip = { show: showTip, hide: hideTip };
window.wui.popover = popover;

// ── init — delete if your app dispatches/init's itself ──
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => popover.init());
else popover.init();

})();
