// wui menu — one component for dropdown (action) menus AND context menus. Renders in the
// TOP LAYER via the Popover API (no z-index, native light-dismiss + focus return), falls
// back to a fixed panel + outside-click when Popover isn't supported. Positioned with the
// shared placer (wui.float). Styles: menu.css. Needs float/float.js loaded first.
//
// DROPDOWN — a trigger points at a menu by id:
//     <button data-menu="#file">File</button>
//     <div class="wui-menu" id="file" role="menu">
//       <button class="wui-menu-item">New <span class="wui-menu-key">Ctrl N</span></button>
//       <a class="wui-menu-item" href="/open">Open…</a>
//       <hr class="wui-menu-sep">
//       <div class="wui-menu-label">Danger</div>
//       <button class="wui-menu-item wui-menu-item--danger">Delete</button>
//     </div>
//
// CONTEXT — same menu markup, bound to right-click; opens at the pointer:
//     <div data-menu-context="#row-menu"> … </div>
//
// SUBMENU — a .wui-menu-sub immediately AFTER its trigger item opens to the side:
//     <button class="wui-menu-item">Move to</button>
//     <div class="wui-menu wui-menu-sub" role="menu"> …items… </div>
//
// CHECKABLE — role="menuitemcheckbox|menuitemradio" + aria-checked; these stay open on click.
//
// Keyboard: ↑/↓ move (skip disabled, wrap), Home/End, →/← open/close submenu, Enter/Space
// activate, type-ahead, Esc closes a level, Tab closes all.
//
// JS: wui.menu()                init all [data-menu] / [data-menu-context] in the page
//     wui.menu.from(items)      build a .wui-menu element from a JSON array (see bottom)
//     wui.menu.attach(trigger, menuOrItems, {context})   bind one trigger
//     wui.menu.open(menu, anchorEl | {x,y})              open programmatically
//     wui.menu.close()          close everything

(function () {
"use strict";
if (window.wui && window.wui.menu) return;   // already loaded (a second copy would run every click twice)

const hasPopover = 'popover' in HTMLElement.prototype;
let uid = 0, chain = [], buf = '', bufT, subT;

const items = m => [...m.children].filter(c => c.classList.contains('wui-menu-item'));
const on = it => !it.hasAttribute('disabled') && it.getAttribute('aria-disabled') !== 'true';
const subOf = it => { const n = it.nextElementSibling; return n && n.classList.contains('wui-menu-sub') ? n : null; };
const topOf = m => { while (m.classList.contains('wui-menu-sub')) m = m.parentElement.closest('.wui-menu'); return m; };
const isOpen = m => hasPopover ? m.matches(':popover-open') : m.classList.contains('wui-open');
const subOpen = s => s.classList.contains('wui-open');

function show(m) { if (m.classList.contains('wui-menu-sub')) m.classList.add('wui-open'); else if (hasPopover) { try { m.showPopover(); } catch (_) {} } else m.classList.add('wui-open'); }
function hide(m) { if (m.classList.contains('wui-menu-sub')) m.classList.remove('wui-open'); else if (hasPopover) { try { m.hidePopover(); } catch (_) {} } else m.classList.remove('wui-open'); }

// ── prep: roles + ids + the one toggle listener, done once per menu ──
function prep(menu) {
  if (menu.dataset.wuiMenu) return;
  menu.dataset.wuiMenu = '1';
  if (!menu.getAttribute('role')) menu.setAttribute('role', 'menu');
  menu.querySelectorAll('.wui-menu-item').forEach(it => { if (!it.getAttribute('role')) it.setAttribute('role', 'menuitem'); it.tabIndex = -1; });
  menu.querySelectorAll('.wui-menu-sub').forEach(sub => {
    sub.setAttribute('role', 'menu');
    const t = sub.previousElementSibling;
    if (t && t.classList.contains('wui-menu-item')) { t.setAttribute('aria-haspopup', 'menu'); t.setAttribute('aria-expanded', 'false'); }
  });
  if (hasPopover) {                                        // only the root is a popover; subs ride along in its top layer
    if (!menu.id) menu.id = 'wui-menu-' + (++uid);
    if (!menu.hasAttribute('popover')) menu.popover = 'auto';
    menu.addEventListener('toggle', e => { if (e.newState === 'open') { positionNow(menu); afterOpen(menu); } else cleanup(menu); });
  }
}

// ── positioning ──
function positionNow(menu) {
  if (menu._pos) {                                         // context menu: at the pointer, clamped
    const w = menu.offsetWidth, h = menu.offsetHeight;
    menu.style.left = Math.max(8, Math.min(menu._pos.x, innerWidth - w - 8)) + 'px';
    menu.style.top  = Math.max(8, Math.min(menu._pos.y, innerHeight - h - 8)) + 'px';
    menu._pos = null;
  } else {
    if (menu.hasAttribute('data-menu-match')) menu.style.minWidth = menu._anchor.offsetWidth + 'px';  // as wide as its trigger (select-style)
    window.wui.float.place(menu, menu._anchor, { side: 'bottom', align: 'start', gap: 4, pad: 8 });
  }
}
function afterOpen(menu) { chain = [menu]; focusFirst(menu); }

// ── open / close ──
function openTop(menu, pos) {
  prep(menu);
  menu._pos = pos.x != null ? { x: pos.x, y: pos.y } : null;
  if (!menu._pos) menu._anchor = pos.anchor;
  show(menu);
  if (!hasPopover) { positionNow(menu); afterOpen(menu); }  // no toggle event in the fallback
}
function openSub(trig) {
  const sub = subOf(trig); if (!sub) return;
  hideSiblings(trig.parentElement, trig);
  if (subOpen(sub)) return focusFirst(sub);
  show(sub);
  window.wui.float.place(sub, trig, { side: 'right', align: 'start', gap: 2, pad: 8 });
  trig.setAttribute('aria-expanded', 'true');
  chain.push(sub);
  focusFirst(sub);
}
function hideSubTree(sub) {                                 // close sub + any deeper subs, no focus move
  sub.querySelectorAll('.wui-menu-sub.wui-open').forEach(s => { hide(s); s.previousElementSibling?.setAttribute('aria-expanded', 'false'); });
  hide(sub);
  sub.previousElementSibling?.setAttribute('aria-expanded', 'false');
  chain = chain.filter(m => m !== sub && !sub.contains(m));
}
function closeSub(sub) { const t = sub.previousElementSibling; hideSubTree(sub); t?.focus(); }
function hideSiblings(menu, keep) { [...menu.children].forEach(c => { if (c.classList.contains('wui-menu-sub') && c.previousElementSibling !== keep && subOpen(c)) hideSubTree(c); }); }
function cleanup(menu) {                                    // after the root closes (native light-dismiss or hide)
  menu.querySelectorAll('.wui-menu-sub.wui-open').forEach(s => { hide(s); s.previousElementSibling?.setAttribute('aria-expanded', 'false'); });
  menu._trigger?.setAttribute('aria-expanded', 'false');
  chain = [];
}
function closeAll() {
  if (!chain.length) return;
  const root = chain[0], trig = root._trigger;
  cleanup(root); hide(root);
  trig?.focus();
}

// ── focus + keyboard ──
function focusFirst(menu) { const e = items(menu).filter(on); if (e[0]) e[0].focus(); }
function move(menu, from, dir) {
  const e = items(menu).filter(on); if (!e.length) return;
  let i = e.indexOf(from);
  i = dir === 'first' ? 0 : dir === 'last' ? e.length - 1 : (i + (dir === 'next' ? 1 : -1) + e.length) % e.length;
  e[i].focus();
}
function typeahead(menu, key) {
  buf += key.toLowerCase(); clearTimeout(bufT); bufT = setTimeout(() => buf = '', 500);
  const e = items(menu).filter(on), start = e.indexOf(document.activeElement) + 1;
  for (let i = 0; i < e.length; i++) { const it = e[(start + i) % e.length]; if (it.textContent.trim().toLowerCase().startsWith(buf)) return it.focus(); }
}
function toggleCheck(it) {
  if (it.getAttribute('role') === 'menuitemradio') { items(it.parentElement).forEach(s => { if (s.getAttribute('role') === 'menuitemradio') s.setAttribute('aria-checked', 'false'); }); it.setAttribute('aria-checked', 'true'); }
  else it.setAttribute('aria-checked', it.getAttribute('aria-checked') === 'true' ? 'false' : 'true');
}
function activate(it, e) {
  if (!on(it)) { e.preventDefault(); return; }
  if (subOf(it)) { e.preventDefault(); openSub(it); return; }
  const role = it.getAttribute('role');
  if (role === 'menuitemcheckbox' || role === 'menuitemradio') { e.preventDefault(); toggleCheck(it); it._onSelect?.(it.getAttribute('aria-checked') === 'true'); return; }  // checkables stay open
  it._onSelect?.();
  closeAll();                                              // a plain item closes the menu
}

document.addEventListener('click', e => { const it = e.target.closest?.('.wui-menu-item'); if (it) activate(it, e); });
document.addEventListener('pointerover', e => {
  const it = e.target.closest?.('.wui-menu-item'); if (!it || !it.closest('.wui-menu')) return;
  it.focus();
  hideSiblings(it.parentElement, it);
  if (subOf(it) && on(it)) { clearTimeout(subT); subT = setTimeout(() => openSub(it), 90); }  // hover-intent
});
document.addEventListener('keydown', e => {
  const menu = e.target.closest?.('.wui-menu'); if (!menu || !isOpen(topOf(menu))) return;
  const it = e.target.closest('.wui-menu-item'), isSub = menu.classList.contains('wui-menu-sub');
  switch (e.key) {
    case 'ArrowDown': e.preventDefault(); move(menu, it, 'next'); break;
    case 'ArrowUp':   e.preventDefault(); move(menu, it, 'prev'); break;
    case 'Home':      e.preventDefault(); move(menu, null, 'first'); break;
    case 'End':       e.preventDefault(); move(menu, null, 'last'); break;
    case 'ArrowRight': if (it && subOf(it)) { e.preventDefault(); openSub(it); } break;
    case 'ArrowLeft':  if (isSub) { e.preventDefault(); closeSub(menu); } break;
    case 'Enter': case ' ': if (it) { e.preventDefault(); activate(it, e); } break;
    case 'Tab': closeAll(); break;
    case 'Escape':
      if (isSub) { e.preventDefault(); e.stopPropagation(); closeSub(menu); }   // close just this level, keep parent
      else if (!hasPopover) closeAll();                                          // (popover: let native light-dismiss close + cleanup)
      break;
    default: if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) typeahead(menu, e.key);
  }
}, true);                                                  // capture so Esc on a submenu beats the popover's own close

// ── binding ──
function attach(trigger, menu, opts = {}) {
  if (typeof trigger === 'string') trigger = document.querySelector(trigger);
  if (Array.isArray(menu)) { menu = from(menu); document.body.appendChild(menu); }
  else if (typeof menu === 'string') menu = document.querySelector(menu);
  if (!trigger || !menu) return;
  prep(menu);
  menu._trigger = trigger;
  if (opts.context) {
    trigger.addEventListener('contextmenu', e => { e.preventDefault(); closeAll(); openTop(menu, { x: e.clientX, y: e.clientY }); });
  } else {
    trigger.setAttribute('aria-haspopup', 'menu');
    menu._anchor = trigger;
    if (hasPopover) { trigger.setAttribute('popovertarget', menu.id); }    // let the UA own click-toggle + light-dismiss
    else trigger.addEventListener('click', e => { e.preventDefault(); isOpen(menu) ? closeAll() : openTop(menu, { anchor: trigger }); });
  }
  return menu;
}
function open(menu, target, opts = {}) {
  if (typeof menu === 'string') menu = document.querySelector(menu);
  if (!menu) return;
  closeAll();
  openTop(menu, target && target.x != null ? target : { anchor: target, ...opts });
}

// ── JSON builder ──
//   [ {label, icon, key, href, danger, disabled, onSelect},
//     {sep:true}, {heading:true, label},
//     {label, checkbox:true, checked, onSelect(on)}, {label, radio:true, checked},
//     {label, children:[ …nested items… ]} ]
function build(menu, it) {
  if (it.sep) return menu.appendChild(Object.assign(document.createElement('hr'), { className: 'wui-menu-sep' }));
  if (it.heading) { const d = document.createElement('div'); d.className = 'wui-menu-label'; d.textContent = it.label || ''; return menu.appendChild(d); }
  const el = document.createElement(it.href ? 'a' : 'button');
  el.className = 'wui-menu-item' + (it.danger ? ' wui-menu-item--danger' : '');
  if (it.href) el.href = it.href; else el.type = 'button';
  if (it.disabled) el.setAttribute('disabled', '');
  el.setAttribute('role', it.checkbox ? 'menuitemcheckbox' : it.radio ? 'menuitemradio' : 'menuitem');
  if (it.checkbox || it.radio) el.setAttribute('aria-checked', it.checked ? 'true' : 'false');
  if (it.icon) { const i = document.createElement('span'); i.className = 'wui-menu-ico'; i.innerHTML = it.icon; el.appendChild(i); }
  el.appendChild(document.createTextNode(it.label || ''));
  if (it.key) { const k = document.createElement('span'); k.className = 'wui-menu-key'; k.textContent = it.key; el.appendChild(k); }
  if (it.onSelect) el._onSelect = it.onSelect;
  menu.appendChild(el);
  if (it.children?.length) { el.setAttribute('aria-haspopup', 'menu'); const sub = from(it.children); sub.classList.add('wui-menu-sub'); menu.appendChild(sub); }
}
function from(list) {
  const menu = document.createElement('div');
  menu.className = 'wui-menu'; menu.setAttribute('role', 'menu');
  list.forEach(it => build(menu, it));
  return menu;
}

function init(scope = document) {
  scope.querySelectorAll('[data-menu]:not([data-wui-menu-bound])').forEach(t => { t.dataset.wuiMenuBound = '1'; attach(t, t.getAttribute('data-menu')); });
  scope.querySelectorAll('[data-menu-context]:not([data-wui-menu-bound])').forEach(t => { t.dataset.wuiMenuBound = '1'; attach(t, t.getAttribute('data-menu-context'), { context: true }); });
}

window.wui = window.wui || {};
window.wui.menu = Object.assign(init, { from, attach, open, close: closeAll });

// ── auto-init — delete if your app init's itself ──
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init());
else init();

})();
