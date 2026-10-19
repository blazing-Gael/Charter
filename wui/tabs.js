// wui tabs — the ARIA tabs pattern over server-rendered markup. Styles: tabs.css
//
// Write links to the panels and leave every panel visible. Without JS that's a list
// of jump links over the whole content; this adds the roles and hides all but one.
//   <div class="wui-tab-list" aria-label="Step">
//     <a class="wui-tab" href="#p-params">Parameters</a>
//     <a class="wui-tab" href="#p-settings" aria-current="true">Settings</a>   (selected; default: first)
//   </div>
//   <section class="wui-tab-panel" id="p-params">…</section>
//   <section class="wui-tab-panel" id="p-settings">…</section>
// A #hash naming a panel selects it on load.
//
// Or write the full ARIA pattern yourself (roles, aria-selected, the other panels
// `hidden`) — only for a page that always ships JS and must not show every panel
// for a moment before it runs: without JS the hidden panels can't be reached.
//
// Then:
//   - click or arrow keys select a tab (Home/End jump; aria-orientation="vertical" uses ↑/↓)
//   - the selected tab's panel is shown, the others get `hidden`
//   - one tab stop per list (roving tabindex)
//   - a shared ink that slides to the selected tab, kept in place on resize
// A selection fires a bubbling `wui-tab` event on the tab: event.detail.panel.
//
//   wui.tabs(root)            set up lists added later — root is a list or anything containing
//                             lists. Plain lists need it to become tabs; full-ARIA ones only
//                             need it for the ink + tab stops (their clicks work without it)
//   wui.tabs.select(tab)      select a tab from code
//
// Delegated listeners — any number of tab lists cost one listener each.

(function () {
"use strict";
if (window.wui && window.wui.tabs) return;

const tabsIn = (list) => [...list.querySelectorAll('[role="tab"]')].filter((t) => t.closest('[role="tablist"]') === list);
const panelOf = (tab) => document.getElementById(tab.getAttribute('aria-controls'));
const isOn = (tab) => tab.getAttribute('aria-selected') === 'true';

// Place the ink under the selected tab. Skipped while the list is hidden (no size yet);
// the resize observer calls this again once it shows.
function ink(list) {
  const tab = tabsIn(list).find(isOn);
  if (!tab || !list.offsetWidth) return;
  list.style.setProperty('--wui-tab-x', tab.offsetLeft + 'px');
  list.style.setProperty('--wui-tab-w', tab.offsetWidth + 'px');
  list.setAttribute('data-wui-ink', '');
}

// Plain markup → the ARIA pattern. Links to #panel become tabs, their panels get the
// roles and all but the selected one are hidden. Selected = the panel in the URL hash,
// else the link with aria-current, else the first.
function upgrade(list) {
  const pairs = [...list.querySelectorAll('a.wui-tab[href^="#"]')]
    .map((a) => [a, document.getElementById(decodeURIComponent(a.hash.slice(1)))])
    .filter(([, panel]) => panel);
  if (!pairs.length) return;
  list.setAttribute('role', 'tablist');
  const on = pairs.find(([, p]) => location.hash === '#' + p.id) || pairs.find(([a]) => a.hasAttribute('aria-current')) || pairs[0];
  pairs.forEach(([a, panel]) => {
    if (!a.id) a.id = panel.id + '-tab';
    a.setAttribute('role', 'tab');
    a.setAttribute('aria-controls', panel.id);
    a.setAttribute('aria-selected', String(a === on[0]));
    a.removeAttribute('aria-current');
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', a.id);
    if (!panel.hasAttribute('tabindex')) panel.tabIndex = 0;
    panel.hidden = panel !== on[1];
  });
}

function select(tab, focus) {
  if (tab.disabled) return;
  const list = tab.closest('[role="tablist"]'), tabs = tabsIn(list);
  const from = tabs.findIndex(isOn), to = tabs.indexOf(tab);
  if (focus) tab.focus();
  if (from === to) return;
  tabs.forEach((t) => {
    const on = t === tab, panel = panelOf(t);
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    if (!panel) return;
    if (on) panel.dataset.wuiFrom = to > from ? 'next' : 'prev';   // tabs.css slides it in from that side
    panel.hidden = !on;
  });
  tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  ink(list);
  tab.dispatchEvent(new CustomEvent('wui-tab', { bubbles: true, detail: { panel: panelOf(tab) } }));
}

// ── Handlers (return true when handled — host-dispatcher friendly) ──
const tabAt = (e) => e.target.closest?.('.wui-tab-list [role="tab"]');

function tabsClick(e) {
  const tab = tabAt(e); if (!tab) return false;
  e.preventDefault();                                 // a link tab: switch, don't jump
  select(tab); return true;
}

function tabsKey(e) {
  const tab = tabAt(e); if (!tab) return false;
  const list = tab.closest('[role="tablist"]');
  const tabs = tabsIn(list).filter((t) => !t.disabled);
  const vertical = list.getAttribute('aria-orientation') === 'vertical';
  const step = { [vertical ? 'ArrowDown' : 'ArrowRight']: 1, [vertical ? 'ArrowUp' : 'ArrowLeft']: -1 }[e.key];
  let i = tabs.indexOf(tab);
  if (step) i = (i + step + tabs.length) % tabs.length;
  else if (e.key === 'Home') i = 0;
  else if (e.key === 'End') i = tabs.length - 1;
  else if (e.key === ' ' && tab.tagName === 'A') { e.preventDefault(); select(tab); return true; }   // buttons do this natively
  else return false;
  e.preventDefault(); select(tabs[i], true); return true;
}

// Tab widths change with fonts, badges and container size; a hidden list (a closed
// dialog) gets its size when it opens. Either way, move the ink.
const resized = 'ResizeObserver' in window
  ? new ResizeObserver((entries) => entries.forEach((en) => {
      const list = en.target.closest('.wui-tab-list');
      if (!list) return resized.unobserve(en.target);   // a tab removed from its list
      ink(list);
    }))
  : null;

function tabs(root = document) {
  const lists = root.matches?.('.wui-tab-list') ? [root] : root.querySelectorAll('.wui-tab-list');   // a list itself, or lists inside root
  lists.forEach((list) => {
    if (!list.hasAttribute('role')) upgrade(list);
    const all = tabsIn(list), on = all.find(isOn) || all[0];
    if (!on) return;
    all.forEach((t) => { t.tabIndex = t === on ? 0 : -1; resized?.observe(t); });
    resized?.observe(list);
    ink(list);
  });
}
tabs.select = (tab) => select(tab);

window.wui = window.wui || {};
window.wui.tabs = tabs;

// ── Registration — delete this block if your app dispatches events itself ──
document.addEventListener('click', tabsClick);
document.addEventListener('keydown', tabsKey);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => tabs());
else tabs();

})();
