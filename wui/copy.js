// wui copy — copy to the clipboard from a button. Styles: copy.css
//
// The source, on the button:
//   data-copy="#id"        an input/textarea/select's value, or any element's text (highlighting
//                          markup in a <pre> drops out). A <template> or <script type="text/plain">
//                          holds a big value the page never renders.
//   data-copy-text="…"     this exact text
//   data-copy-url="…"      fetched on click (too big for the page: a whole run's output)
// After copying the button gets data-copied for a moment (copy.css animates it), or
// data-copy-failed if the browser refused — then a visible source is selected so Ctrl+C works.
// The result is announced to screen readers; .wui-copy--tip also pops a tooltip (data-copy-tip,
// default "Copied") when tooltip.js is loaded. A bubbling `wui-copy` event carries { text }.
//
//   wui.copy(text)   copy from code; resolves true / false

(function () {
"use strict";
if (window.wui && window.wui.copy) return;

const SHOW_MS = 1600;
const timers = new WeakMap();

// ── where the text comes from ──
function sourceOf(btn) { return btn.dataset.copy ? document.querySelector(btn.dataset.copy) : null; }

function textOf(btn) {
  if (btn.dataset.copyText != null) return btn.dataset.copyText;
  const el = sourceOf(btn);
  if (!el) return '';
  if (el instanceof HTMLTemplateElement) return el.content.textContent.replace(/^\n|\n\s*$/g, '');
  if (el.matches('script')) return el.textContent.replace(/^\n|\n\s*$/g, '');
  if (el.matches('input, textarea, select')) return el.value;
  return el.textContent;
}

// ── writing ──
// Old browsers and plain-HTTP pages (no Clipboard API): a throwaway textarea + the copy command.
function legacyCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
  document.body.append(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (_) {}
  ta.remove();
  return ok;
}

// true / false when the promise settles, null if it hasn't within `ms`
const settle = (p, ms) => Promise.race([p.then(() => true, () => false), new Promise((r) => setTimeout(() => r(null), ms))]);

// The Clipboard API can sit unanswered (a page in the background, a blocked permission
// prompt), so it gets a deadline before falling back — the button always answers.
async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    if (await settle(navigator.clipboard.writeText(text), 1000)) return true;
  }
  return legacyCopy(text);
}

// A URL source is fetched inside the clipboard write, so the click still counts as the
// user's gesture (Safari drops it once you await something first).
async function copyUrl(url) {
  const body = () => fetch(url).then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); });
  if (window.ClipboardItem && navigator.clipboard?.write && window.isSecureContext) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': body().then((t) => new Blob([t], { type: 'text/plain' })) })]);
      return true;
    } catch (_) {}
  }
  try { return await copyText(await body()); } catch (_) { return false; }
}

// ── feedback ──
let live;
function announce(msg) {
  if (!live) {
    live = document.createElement('div');
    live.setAttribute('role', 'status');
    live.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap';
    document.body.append(live);
  }
  live.textContent = '';
  requestAnimationFrame(() => { live.textContent = msg; });
}

function show(btn, ok) {
  const state = ok ? 'data-copied' : 'data-copy-failed';
  clearTimeout(timers.get(btn));
  btn.removeAttribute('data-copied'); btn.removeAttribute('data-copy-failed');
  void btn.offsetWidth;                                   // restart the animation on a quick second click
  btn.setAttribute(state, '');

  const done = btn.querySelector('[data-copy-done]')?.textContent.trim() || btn.dataset.copyTip || 'Copied';
  const msg = ok ? done : 'Couldn’t copy. Press Ctrl+C';
  announce(msg);

  const tipped = btn.classList.contains('wui-copy--tip') && window.wui?.tip;
  const tipWas = btn.getAttribute('data-tip');
  if (tipped) { btn.setAttribute('data-tip', msg); window.wui.tip.show(btn); }

  timers.set(btn, setTimeout(() => {
    btn.removeAttribute(state);
    if (tipped) { window.wui.tip.hide(); tipWas == null ? btn.removeAttribute('data-tip') : btn.setAttribute('data-tip', tipWas); }
  }, SHOW_MS));
}

// if the browser refused, select what's on screen so the user can copy it themselves
function selectSource(btn) {
  const el = sourceOf(btn);
  if (!el || el instanceof HTMLTemplateElement || el.matches('script')) return;
  if (el.matches('input, textarea')) { el.focus(); el.select(); return; }
  const range = document.createRange(); range.selectNodeContents(el);
  const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
}

// ── Handler (returns true when handled — host-dispatcher friendly) ──
function copyClick(e) {
  const btn = e.target.closest?.('[data-copy], [data-copy-text], [data-copy-url]');
  if (!btn || btn.disabled) return false;
  e.preventDefault();
  const text = btn.dataset.copyUrl ? null : textOf(btn);
  (btn.dataset.copyUrl ? copyUrl(btn.dataset.copyUrl) : copyText(text)).then((ok) => {
    show(btn, ok);
    if (ok) btn.dispatchEvent(new CustomEvent('wui-copy', { bubbles: true, detail: { text } }));
    else selectSource(btn);
  });
  return true;
}

window.wui = window.wui || {};
window.wui.copy = copyText;

// ── Registration — delete this block if your app dispatches events itself ──
document.addEventListener('click', copyClick);

})();
