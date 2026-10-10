// wui float — the shared top-layer placer. Positions a floating element (tooltip, popover,
// calendar, pick-list) against an anchor: tries a side, flips to the opposite if it would
// clip, then clamps on-screen. No show/hide here — each component owns its own open/close
// and dismiss (they differ); this is just the geometry they all repeated.
//
//   wui.float.place(el, anchor, {
//     side  : 'bottom' (default) | 'top' | 'left' | 'right',   // preferred side
//     align : 'start'  (default) | 'center' | 'end',           // along the cross axis
//     flip  : true (default),                                  // flip to the opposite side if it clips
//     gap   : 6,                                               // px between anchor and element
//     pad   : 8,                                               // min px from the viewport edge
//   }) → { side, x, y }   // resolved side (for arrows) + the committed position
//
// `el` must already be visible/measurable (in the top layer) so offsetWidth/Height are real.
// Sets el.dataset.side to the resolved side, so CSS can point an arrow the right way.

(function () {
"use strict";

const OPP = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));

function coords(side, align, a, w, h, gap) {
  let x, y;
  if (side === 'top' || side === 'bottom') {
    y = side === 'top' ? a.top - gap - h : a.bottom + gap;
    x = align === 'start' ? a.left : align === 'end' ? a.right - w : a.left + (a.width - w) / 2;
  } else {
    x = side === 'left' ? a.left - gap - w : a.right + gap;
    y = align === 'start' ? a.top : align === 'end' ? a.bottom - h : a.top + (a.height - h) / 2;
  }
  return { x, y };
}
function fits(side, c, w, h, pad) {
  return side === 'top'    ? c.y >= pad
       : side === 'bottom' ? c.y + h <= innerHeight - pad
       : side === 'left'   ? c.x >= pad
       :                     c.x + w <= innerWidth - pad;
}
function place(el, anchor, opts = {}) {
  const { side = 'bottom', align = 'start', flip = true, gap = 6, pad = 8 } = opts;
  const a = anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
  let s = side, c = coords(s, align, a, w, h, gap);
  if (flip && !fits(s, c, w, h, pad)) {                         // doesn't fit → try the opposite side
    const alt = coords(OPP[s], align, a, w, h, gap);
    if (fits(OPP[s], alt, w, h, pad)) { s = OPP[s]; c = alt; }
  }
  c.x = clamp(c.x, pad, innerWidth - w - pad);                  // never hang off-screen
  c.y = clamp(c.y, pad, innerHeight - h - pad);
  el.style.left = c.x + 'px'; el.style.top = c.y + 'px';
  el.dataset.side = s;
  return { side: s, x: c.x, y: c.y };
}

window.wui = window.wui || {};
window.wui.float = { place };

})();
