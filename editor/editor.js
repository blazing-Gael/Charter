// Private to this IIFE: index.html loads several plain <script> files sharing one global scope.
(function () {

const BLOCK_TAG = 'p';

/* Block decoration is written INLINE, never left to the stylesheet: the clipboard
   carries the live DOM with no stylesheet attached. LINE_METRICS overrides the
   source, BLOCK_DECORATION yields to what is already declared. */

// '0px', not '0': the DOM echoes '0' back differently, which counts as a change
// and jumps the property to the end of the style attribute.
const LINE_METRICS = { marginTop: '0px', marginBottom: '0px' };

/* SIDES ARE LOGICAL. A quote's bar and an indent's step belong on the side the
   text STARTS at, and stated physically both sat on the left of an Arabic message.
   `*-inline-start` follows the box's own direction — which the box has to be TOLD,
   see settleBoxDirection — and is resolved back to a physical side on the wire by
   _wireDirections, Word's engine having no inline-start any more than it has a
   dir="auto". Each logical side with the pair it resolves to, LTR first. */
const SIDES = {
  marginInlineStart: ['marginLeft', 'marginRight'],
  marginInlineEnd: ['marginRight', 'marginLeft'],
  paddingInlineStart: ['paddingLeft', 'paddingRight'],
  borderInlineStart: ['borderLeft', 'borderRight'],
  borderInlineStartStyle: ['borderLeftStyle', 'borderRightStyle'],
};
const LOGICAL_SIDES = Object.keys(SIDES);
/* BOTH physical spellings of every one, because a document arrives stating either
   and decorate clears the whole set before restating its own. The two spellings
   are separate declarations in the CSSOM — a `border-left` is invisible to a
   `borderInlineStart` read — so a Gmail quote left unswept would wear our bar
   ALONGSIDE its own, on the other side of the text under RTL. */
const PHYSICAL_SIDES = [...new Set(Object.values(SIDES).flat())];

// Gmail's exact quote metrics. Longhands: the paste sweep works in longhands.
const QUOTE_DEFAULTS = {
  marginTop: '0px', marginInlineEnd: '0px', marginBottom: '0px', marginInlineStart: '0.8ex',
  borderInlineStart: '1px solid #ccc', paddingInlineStart: '1ex',
};

/* Gmail's exact indent metrics — measured, `margin: 0 0 0 40px; border: none;
   padding: 0px`. INDENTATION IS A CONTAINER and not a margin on the line, which
   is the whole reason a quote bar slides right when you indent a quoted line:
   the new level goes OUTSIDE the quote, so the bar travels with it.

   The STYLE longhand, never the border shorthand: a shorthand set to `none`
   serializes as `medium`, and the `none` that names this thing what it is would
   not survive its own wire format. */
const INDENT_DEFAULTS = {
  marginTop: '0px', marginInlineEnd: '0px', marginBottom: '0px', marginInlineStart: '40px',
  borderInlineStartStyle: 'none', paddingInlineStart: '0px',
};

/* A blockquote that STATES it has no bar. Written before isQuote is, because
   decorate is the first thing that has to know: a blockquote with no border of
   its own is one we are meant to draw ours onto, and an indent would come back
   from every normalize wearing a quote bar. Gmail's own indents answer this too
   — `border: none` expands to a stated `none` — so a pasted Gmail indent stays
   an indent here rather than turning into a quote.

   EVERY spelling, and this is the one predicate that has to read them all: ours
   says it logically, everything that arrives says it physically — and BOTH
   physical sides, because the arriving document is often our own. An RTL level
   goes out as `border-right-style: none`, so a reply trail read back through the
   left side alone came home unrecognised and was handed a quote bar. An arriving
   indent is answered where it lands rather than rewritten into our shape. */
const isIndentBox = el => el.tagName === 'BLOCKQUOTE'
  && ['borderInlineStartStyle', ...SIDES.borderInlineStartStyle]
    .some(prop => el.style[prop] === 'none');

/* The heading scale, resolved at the editor's 14px base. px, not em — em would
   resolve against the READING client's base.

   ALL SIX, because all six can be in the document: paste keeps H1-H3 and promotes
   the rest, but adopt keeps whatever a draft or a quoted reply arrived with, and
   ADOPT_DROP_TAGS names no heading. A level missing from this table is a heading
   with no metrics anywhere — it renders from the UA's stylesheet in compose, ships
   bare, and renders from the RECIPIENT's, which is the one thing egress may not
   do. The same rows are what _stateTagMarks hands to a line or an item a heading
   becomes, so a gap here also un-bolds a bulleted subhead. */
const HEADING_TAG = /^H[1-6]$/;
const HEADING_DEFAULTS = {
  H1: { fontSize: '21px', fontWeight: '700', marginTop: '0.5em', marginBottom: '0.5em' },
  H2: { fontSize: '18px', fontWeight: '600', marginTop: '0.5em', marginBottom: '0.5em' },
  H3: { fontSize: '15px', fontWeight: '600', marginTop: '0.5em', marginBottom: '0.5em' },
  H4: { fontSize: '14px', fontWeight: '600', marginTop: '0.5em', marginBottom: '0.5em' },
  H5: { fontSize: '13px', fontWeight: '600', marginTop: '0.5em', marginBottom: '0.5em' },
  H6: { fontSize: '12px', fontWeight: '600', marginTop: '0.5em', marginBottom: '0.5em' },
};

// Spread rather than listed, so a level is added to the scale above and nowhere
// else — DECORATED_SELECTOR is built from these keys and follows for free.
const BLOCK_DECORATION = {
  BLOCKQUOTE: { owns: 'borderInlineStart', decls: QUOTE_DEFAULTS },
  ...Object.fromEntries(Object.entries(HEADING_DEFAULTS).map(([tag, decls]) => [tag, { decls }])),
};

const DECORATED_SELECTOR = [BLOCK_TAG, ...Object.keys(BLOCK_DECORATION)].join(',');

// A declaration as the DOM writes it back: '#ccc' returns 'rgb(204, 204, 204)'.
function _asWritten(prop, value) {
  const probe = document.createElement(BLOCK_TAG);
  probe.style[prop] = value;
  return probe.style[prop];
}

// Writes only what isn't already there: re-stating a property moves it to the
// END of the style attribute, and the wire format would never settle.
function _stateStyle(el, decls) {
  Object.entries(decls).forEach(([prop, value]) => {
    if (el.style[prop] !== value) el.style[prop] = value;
  });
}

function decorate(el) {
  if (el.tagName === BLOCK_TAG.toUpperCase()) _stateStyle(el, LINE_METRICS);
  if (isIndentBox(el)) return el;   // borderless BY DESIGN — our bar is not its decoration
  const d = BLOCK_DECORATION[el.tagName];
  if (!d) return el;
  if (!d.owns) { _fillStyle(el, d.decls); return el; }
  /* The question is whether the bar is OURS, not merely that one is there: our
     own quote comes back from a copy/paste carrying a bar too. Asked in all
     three spellings — the logical one we write, and BOTH physical ones, since
     the same bar reads back identically under each and the document stating a
     physical one is as often ours (an RTL quote off our own wire, barred on the
     right) as it is another client's. Missing one does not lose the bar, it
     DOUBLES it: the block goes down the unowned path and has our declaration
     added beside the one already there. */
  /* Our bar as EACH spelling writes it down, not as one of them does: the value
     is the same declaration, but an engine is free to serialize the logical
     shorthand and the physical one differently, and jsdom does — comparing a
     `border-right` against what `border-inline-start` echoed back called our own
     quote a stranger's. */
  d.mine = d.mine
    || new Set([d.owns, ...SIDES[d.owns]].map(prop => _asWritten(prop, d.decls[d.owns])));
  const declared = [d.owns, ...SIDES[d.owns]].map(prop => el.style[prop]).find(Boolean) || '';
  if (declared && !d.mine.has(declared)) return el;   // someone else's message
  // Cleared before rewriting, so the block always states its decoration in the
  // table's order — and in ONE spelling, the physical sides of the bar we just
  // recognised going with it rather than staying to draw a second one.
  if (!declared) { _stateStyle(el, d.decls); return el; }
  [...Object.keys(d.decls), ...PHYSICAL_SIDES].forEach(prop => { el.style[prop] = ''; });
  _stateStyle(el, d.decls);
  return el;
}

const newEl = tag => decorate(document.createElement(tag));

// Keywords come from us and from UA stylesheets, numbers from computed values.
const isBoldWeight = w => w === 'bold' || w === 'bolder' || parseInt(w, 10) >= 600;

function _fillStyle(el, decls) {
  Object.entries(decls).forEach(([prop, value]) => { if (!el.style[prop]) el.style[prop] = value; });
}

const newBlock = () => newEl(BLOCK_TAG);

// A blank line is a <br>, not an empty block: a <p> with no children has zero
// height and holds no caret.
const blankLine = () => {
  const block = newBlock();
  block.appendChild(document.createElement('br'));
  return block;
};

// Inline tags the engine RENDERS: a mark can live on one, so paste keeps them.
const INLINE_MARK_TAGS = ['SPAN', 'A', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'FONT', 'BR', 'IMG'];

// Everything that lives INSIDE a line rather than being one.
const INLINE_TAGS = new Set([...INLINE_MARK_TAGS,
  'CODE', 'SMALL', 'SUP', 'SUB', 'ABBR', 'MARK', 'TIME', 'CITE', 'Q',
  'BIG', 'TT', 'NOBR', 'WBR', 'LABEL', 'INS', 'DEL', 'DFN', 'VAR', 'SAMP', 'KBD',
  // Named because a DOMParser document has no rendering, so asking what these
  // LOOK like answers "block".
  'BDI', 'BDO',
]);

// Whitespace BETWEEN blocks is source formatting, not content. ASCII only, so a
// deliberate &nbsp; survives.
const COLLAPSIBLE_WS = /^[ \t\r\n]*$/;
function dropFormattingWhitespace(container) {
  const kids = [...container.childNodes];
  if (!kids.some(n => n.nodeType === 1 && !INLINE_TAGS.has(n.tagName))) return;
  kids.forEach(n => { if (n.nodeType === 3 && COLLAPSIBLE_WS.test(n.data)) n.remove(); });
}

function _dropFormattingWhitespaceDeep(root) {
  dropFormattingWhitespace(root);
  [...root.children].forEach(_dropFormattingWhitespaceDeep);
}

function _isBareNode(n) {
  if (n.nodeType === 3) return true;
  if (n.nodeType !== 1) return false;
  if (n.tagName === BLOCK_TAG.toUpperCase()) return false;   // already a line block
  return INLINE_TAGS.has(n.tagName);
}

// Wraps each contiguous run of bare direct children in `tag` — a line block
// normally, <li> inside a list.
function _normalizeChildren(container, tag = BLOCK_TAG) {
  // Only a line container gets an empty child to hold a caret; an empty list
  // shouldn't grow a blank bullet. blankLine(), because an empty <p> has no height.
  if (!container.firstChild) { if (tag === BLOCK_TAG) container.appendChild(blankLine()); return; }
  dropFormattingWhitespace(container);   // before wrapping, or the indentation becomes lines
  const kids = [...container.childNodes];
  let i = 0;
  while (i < kids.length) {
    if (!_isBareNode(kids[i])) { i++; continue; }
    let j = i;
    while (j + 1 < kids.length && _isBareNode(kids[j + 1])) j++;
    const wrap = tag === BLOCK_TAG ? newBlock() : document.createElement(tag);
    container.insertBefore(wrap, kids[i]);
    for (let k = i; k <= j; k++) wrap.appendChild(kids[k]);
    i = j + 1;
  }
}

/* Does this line render ANYTHING, including the <br> that holds a blank one open?
   Not `!el.firstChild`: extractContents leaves an empty TEXT NODE behind when it
   splits a line at its end. A rule and an image render nothing but themselves, so
   both are named — the selector only sees one INSIDE the element. */
const _lineRenders = el => isRule(el) || el.tagName === 'IMG'
  || !!(el.textContent.length || el.querySelector('br, img, hr'));

// `keep` holds the pending selection's nodes; the caret's own block must stay.
function _pruneEmptyChildren(container, keep) {
  [...container.children].forEach(el => {
    if (isDrillable(el)) return;                       // a container's emptiness is its content's business
    if (_lineRenders(el)) return;
    if (keep.some(n => n && (n === el || el.contains(n)))) return;
    el.remove();
  });
}

// Editing format in, wire format out: a sub-list is the item's SIBLING here so a
// line stays a leaf, and serialize moves it INSIDE the item above on the way out.
function _unnestSubLists(root) {
  root.querySelectorAll('li > ul, li > ol').forEach(sub => sub.parentElement.after(sub));
}

/* A PASTED <br> is a line boundary, not content: nothing in the block model can
   address the far side of one, and every line carries margin 0 so splitting looks
   identical. PASTE ONLY — a <br> the USER typed is a soft break that is theirs to
   keep, and run over the live document this rule fights the caret.

   Two <br>s are never boundaries, even in a paste: the one a source parks at the
   END of a block, and the one that IS an empty line. Hence the three-way branch,
   split / drop / keep. */
const _lineHolding = (br, root) => {
  for (let el = br.parentElement; el && el !== root && !isDrillable(el); el = el.parentElement) {
    if (el.parentElement === root || isDrillable(el.parentElement)) return el;
  }
  return null;   // loose in a container; _normalizeChildren gives it a line first
};

// Anything a reader would see on one SIDE of a break, within its line. A <br>
// doesn't count: it is a boundary too, and this pass will reach it.
const _showsContent = n => (n.nodeType === 3
  ? !!stripZwsp(n.data).trim()
  : n.nodeType === 1 && (n.tagName === 'IMG' || !!n.querySelector('img') || !!stripZwsp(n.textContent).trim()));

function _hasContentBeside(br, line, forward) {
  for (let n = br; n && n !== line; n = n.parentNode) {
    for (let s = forward ? n.nextSibling : n.previousSibling; s; s = forward ? s.nextSibling : s.previousSibling) {
      if (_showsContent(s)) return true;
    }
  }
  return false;
}

// One pass over the line's children, no Ranges: setStartAfter finds a node's
// index by walking its previous siblings, which is O(n²) over a long line.
function _splitAtOwnBreaks(line, doc) {
  const segments = [[]];
  const breaks = [];
  for (const n of [...line.childNodes]) {
    if (n.nodeType === 1 && n.tagName === 'BR') { breaks.push(n); segments.push([]); }
    else segments[segments.length - 1].push(n);
  }
  if (!breaks.length) return;

  const shows = segments.map(seg => seg.some(_showsContent));
  // Suffix scan: "is anything visible after break k", for every k at once.
  const after = new Array(segments.length).fill(false);
  for (let i = segments.length - 2; i >= 0; i--) after[i] = after[i + 1] || shows[i + 1];

  const out = [segments[0]];
  let before = shows[0];
  breaks.forEach((br, k) => {
    const tail = out[out.length - 1];
    if (after[k]) out.push(segments[k + 1]);                 // split
    else if (before) tail.push(...segments[k + 1]);          // trailing: the break goes
    else tail.push(br, ...segments[k + 1]);                  // this break IS the empty line
    before = before || shows[k + 1];
  });

  const settle = el => { el.replaceChildren(...out.shift()); if (!el.firstChild) el.appendChild(doc.createElement('br')); };
  let prev = line;
  const rest = out.length - 1;
  settle(line);
  for (let i = 0; i < rest; i++) {
    const el = line.cloneNode(false);   // same tag, style and indent on every half
    settle(el);
    prev.after(el);
    prev = el;
  }
}

function _splitLinesAtBreaks(root) {
  // ownerDocument, not `document`: paste runs this over a DOMParser tree, and a
  // node or Range from the wrong document throws.
  const doc = root.ownerDocument;
  const lines = new Set();
  root.querySelectorAll('br').forEach(br => {
    const line = _lineHolding(br, root);
    if (line) lines.add(line);
  });

  lines.forEach(line => {
    // Fast path: breaks that are the line's own children, which is every line of
    // pasted code, prose or a mail body. A break buried in a mark span needs the
    // wrapper rebuilt on both halves, and only a Range does that.
    if ([...line.querySelectorAll('br')].every(br => br.parentNode === line)) {
      _splitAtOwnBreaks(line, doc);
      return;
    }
    const breaks = [...line.querySelectorAll('br')];
    // Decided on the INTACT line (in "a<br><br>b" the second break has content
    // after it only until the first is cut), applied last-first (first-first
    // moves the same tail once per break).
    const splits = breaks.map(br => _hasContentBeside(br, line, true));
    for (let i = breaks.length - 1; i >= 0; i--) {
      const br = breaks[i];
      if (!br.isConnected) continue;
      if (!splits[i]) {
        if (!_hasContentBeside(br, line, false)) continue;   // this <br> IS the empty line
        br.remove();                                         // trailing: renders as nothing
        continue;
      }
      const after = doc.createRange();
      after.setStartAfter(br);
      after.setEndAfter(line.lastChild);        // see _splitLineAt: childNodes.length is O(n) here
      const tail = _splitLineAt(line, after);   // keeps the tag, style and indent on both halves
      br.remove();
      // Either half can come out empty, and a blank line is still a line.
      if (tail && !tail.firstChild) tail.appendChild(doc.createElement('br'));
      if (!line.firstChild) line.appendChild(doc.createElement('br'));
    }
  });
}

// The ONE place block structure is fixed up, so blockContaining() stays a pure
// query. Prune before wrapping, so an emptied container still gets a caret home.
function normalizeBlocks(root, keep = []) {
  // FIRST, and over the whole tree, before anything asks what shape an element
  // is: isBox() answers "does this <div> hold only blocks", and one text node of
  // indentation makes it answer no.
  _dropFormattingWhitespaceDeep(root);
  _unnestSubLists(root);
  _pruneEmptyChildren(root, keep);
  _normalizeChildren(root);
  root.querySelectorAll('blockquote').forEach(bq => {
    _pruneEmptyChildren(bq, keep);
    _normalizeChildren(bq);
  });
  // A container that holds ITEMS holds nothing else: a list holds <li>, a row
  // holds cells.
  root.querySelectorAll('ul, ol').forEach(list => {
    _normalizeChildren(list, 'li');
    _adoptStrangers(list, 'li', LIST_ITEM_TAGS);
    // Two of the same kind side by side are one list — see _absorbAdjacentLists.
    // Here as well as at the commands, because a draft written before that was
    // true, or a message pasted from anywhere, arrives already split.
    if (list.isConnected) _absorbAdjacentLists(list);
  });
  root.querySelectorAll('tr').forEach(row => {
    _normalizeChildren(row, 'td');
    _adoptStrangers(row, 'td', ROW_ITEM_TAGS);
  });
  // A CELL always holds lines, never bare text: otherwise the cell IS the line,
  // and every line-level operation rewrites the cell itself.
  _cellsIn(root).forEach(cell => {
    _pruneEmptyChildren(cell, keep);
    _normalizeChildren(cell);
  });
  _boxesIn(root).forEach(box => {
    _pruneEmptyChildren(box, keep);
    _normalizeChildren(box);
  });
  // Last, once every block that is going to exist does. The ingress half of
  // decoration: a block the editor did not make. See BLOCK_DECORATION.
  root.querySelectorAll(DECORATED_SELECTOR).forEach(decorate);
}

const _boxesIn = root => [...root.querySelectorAll(BOX_TAG)].filter(isBox);
// ROW_ITEM_TAGS stays TD|TH on purpose: a caption holds lines like a cell, but a
// <tr> may not contain one.
const _cellsIn = root => [...root.querySelectorAll([...CELL_TAGS].join())];

// _normalizeChildren gathers loose text and inline runs, but a stray BLOCK is not
// bare — a <p> between two <li> sits there untouched, unreachable by every item
// command. Converted rather than dropped, since an item IS a line.
const LIST_ITEM_TAGS = /^(LI|UL|OL)$/;
const ROW_ITEM_TAGS = /^(TD|TH)$/;
function _adoptStrangers(container, itemTag, allowed) {
  [...container.children].forEach(el => {
    if (allowed.test(el.tagName)) return;
    container.replaceChild(_moveLineInto(document.createElement(itemTag), el), el);
  });
}

const LIST_TAGS = new Set(['UL', 'OL']);
const QUOTE_TAGS = new Set(['BLOCKQUOTE']);
const isList = el => LIST_TAGS.has(el.tagName);
const isQuote = el => QUOTE_TAGS.has(el.tagName);
const isOwnedContainer = el => isList(el) || isQuote(el);

// A BOX is foreign block structure the editor KEEPS rather than flattens, and it
// is recognised by SHAPE, not by a marker of ours: a <div> holding blocks is a
// container, a <div> holding text is a line.
const BOX_TAG = 'DIV';
const isBox = el => el.tagName === BOX_TAG
  && el.childNodes.length > 0
  && ![...el.childNodes].some(_isBareNode);

// The one place shape is the wrong question: a <td> is never a line whatever it
// holds, so cells go by TAG. CAPTION sits with the cells because it holds lines
// exactly as one does.
const TABLE_TAGS = new Set(['TABLE', 'TBODY', 'THEAD', 'TFOOT', 'TR', 'COLGROUP', 'COL']);
const CELL_TAGS = new Set(['TD', 'TH', 'CAPTION']);
const isCell = el => CELL_TAGS.has(el.tagName);
const isTablePart = el => TABLE_TAGS.has(el.tagName);

// A RULE is the THIRD kind of block node: not a line, not a container. NOT in the
// foreign set, which is also `isDrillable` — there is nothing here to walk into,
// so it is named at the three places that ask instead.
const isRule = el => el.tagName === 'HR';

// Foreign block structure the editor KEEPS but does not OWN. isOwnedContainer is
// a permission to restructure; foreign structure never earns it.
const isForeign = el => isBox(el) || isTablePart(el) || isCell(el);

// What the LINE-finding primitives walk through; the commands use
// isOwnedContainer instead.
const isDrillable = el => isOwnedContainer(el) || isForeign(el);

// Never converted, unwrapped, or given layout of its own — the container owns
// all three.
const isStructural = el => isDrillable(el) || el.tagName === 'LI';

// A block the caret goes AROUND rather than into: you paste a signature and carry
// on below it, not inside its last cell.
const isUnit = el => isForeign(el) || isRule(el);

// A rule must be excluded by name: it is not drillable, so without this it reads
// as a line and renderInto would put runs inside an <hr>.
const isLineEl = n => !!n && n.nodeType === 1 && n.isConnected
  && !isDrillable(n) && !isRule(n);

// The LINE containing `node` — the primitive everything else is built on. Pure;
// assumes normalizeBlocks() already ran.
function blockContaining(root, node) {
  let el = node.nodeType === 3 ? node.parentElement : node;
  if (el === root) return _firstLineIn(root);   // caret at container level, not inside a child
  while (el && el !== root) {
    if (isDrillable(el)) return blockContaining(el, node);
    if (el.parentElement === root) return el;
    el = el.parentElement;
  }
  return _firstLineIn(root);
}

// NOT root.firstElementChild when that child is a container: the first line of
// <ul><li>a</li></ul> is the <li>. Every caller here is promised a line.
const _firstLineIn = root => _linesInOrder(root)[0] || null;

// Elements, not text, so an empty line is still a line a selection can cover.
function _linesInOrder(root) {
  const out = [];
  (function visit(container) {
    for (const el of container.children) {
      if (isDrillable(el)) visit(el);
      // Not `else` alone: a rule is neither, and collected as a line it would be
      // handed to renderInto, whose first act is clearBlockMarks.
      else if (!isRule(el)) out.push(el);
    }
  })(root);
  return out;
}

// Just lines — the list and quote toggles find their own container, since only
// they know whether they are wrapping or unwrapping.
function resolveBlocks(selection) {
  if (!selection) return [];
  const editable = selection.root, snap = selection.snap;

  const startLine = blockContaining(editable, snap.startNode);
  const endLine = blockContaining(editable, snap.endNode);
  if (!startLine || !endLine) return [];

  // Sliced in DOCUMENT order, never walked with nextElementSibling: a selection
  // can start inside a list and end after it, and those two aren't siblings.
  const lines = _linesInOrder(editable);
  const i = lines.indexOf(startLine), j = lines.indexOf(endLine);
  if (i < 0 || j < 0) return [startLine];   // an end that isn't a line — act on the start alone rather than guess
  return lines.slice(Math.min(i, j), Math.max(i, j) + 1);
}

function _containerOf(editable, el, match) {
  for (let n = el; n && n !== editable; n = n.parentElement) {
    if (match(n)) return n;
    if (isForeign(n)) return null;   // the wall: a command never restructures past one
  }
  return null;
}

// The thing that actually moves: for a list nested in a quote that is the whole
// list, so unquoting leaves the list intact.
function _childOfContainer(container, line) {
  let n = line;
  while (n && n.parentElement !== container) n = n.parentElement;
  return n;
}

function alignBlock(block, value) {
  block.style.textAlign = value;
}

// Only for a line carrying a margin from somewhere else — a paste, an adopted
// draft. Our own indent is a container; this is the way back out of theirs.
const INDENT_STEP = parseInt(INDENT_DEFAULTS.marginInlineStart, 10);

// Inside a list, indent means DEPTH, not margin. Returns the item as it now
// stands — lifting out of a list REPLACES an <li> with a block.
function nudgeItemDepth(editable, item, dir) {
  const list = item.parentElement;
  if (!list || !isList(list)) { nudgeIndent(item, dir); return item; }
  if (dir > 0) {
    // The FIRST item can indent too, giving a sub-list with no item above it —
    // what Gmail does; the serializer adds a bullet-less placeholder on the way out.
    const prev = item.previousElementSibling;
    // Consecutive indents join the sub-list already there rather than each
    // making its own, which would render as several one-item lists.
    if (prev && isList(prev)) { prev.appendChild(item); _absorbAdjacentLists(prev); return item; }
    const sub = document.createElement(list.tagName);   // same kind, so bullets stay bullets
    item.before(sub);
    sub.appendChild(item);
    // An item BETWEEN two sub-lists has just left the gap it was holding open:
    // without this the two stay two, and the second one restarts at 1.
    _absorbAdjacentLists(sub);
    return item;
  }
  // Out of the sub-list if there is one, out of the list entirely if not — the
  // same lift the block commands use, which splits the list around the item.
  if (list.parentElement && isList(list.parentElement)) return liftOutOf(list, [item])[0];
  return liftFrom(editable, [item], isList)[0];
}

/* Only px can be read off the declaration. `margin-left: 3em` is a real shape —
   adopt is the one door that produces it — and parseInt reads it as 3, so a step
   from it landed at 43px and threw the 42 the reader could see away. The COMPUTED
   value is always px and is what the user is looking at, so ask the element when
   its own declaration cannot answer. */
const PX_MARGIN = /^-?[\d.]+px$/;
function _indentPx(block) {
  const declared = block.style.marginLeft;
  if (!declared) return 0;
  if (PX_MARGIN.test(declared)) return parseFloat(declared);
  return parseFloat(getComputedStyle(block).marginLeft) || 0;
}

function nudgeIndent(block, dir) {
  const next = Math.max(0, Math.round(_indentPx(block) + dir * INDENT_STEP));
  block.style.marginLeft = next ? `${next}px` : '';
}

function _dropEmptyStyle(el) {
  if (!el.getAttribute('style')) el.removeAttribute('style');   // never leave style="" behind
}

// Layout the block owns, as opposed to the marks its runs carry — renderInto
// wipes marks on every render and must leave alignment alone.
function clearBlockLayout(block) {
  block.style.textAlign = '';
  block.style.marginLeft = '';
  _dropEmptyStyle(block);
}

// A heading is bold BY TAG, so a run inside one declares `font-weight: normal` to
// say that it isn't. Carried into a line that is not bold, that declaration is
// dead weight — but on a line that TOOK a heading's weight over, it is a real mark.
function _shedStatedWeight(el) {
  if (HEADING_TAG.test(el.tagName) || isBoldWeight(el.style.fontWeight)) return;
  let unwrapped = false;
  [...el.querySelectorAll('*')].forEach(n => {
    if (n.style.fontWeight !== 'normal') return;
    n.style.fontWeight = '';
    _dropEmptyStyle(n);
    // Left bare it would be a span carrying no marks, which is debris of its own.
    if (n.tagName === 'SPAN' && !n.hasAttribute('style')) { unwrapEl(n); unwrapped = true; }
  });
  if (unwrapped) el.normalize();   // the unwrap leaves the text in pieces
  if (el.style.fontWeight === 'normal') { el.style.fontWeight = ''; _dropEmptyStyle(el); }
}

// The other half: a heading's size and weight come from its TAG, so bulleting an
// <h1> would silently drop both. Marks only — the margins belong to the heading.
function _stateTagMarks(fresh, source) {
  if (HEADING_TAG.test(fresh.tagName)) return;   // still a heading: still bold by tag
  const d = HEADING_DEFAULTS[source.tagName];
  if (d) _fillStyle(fresh, { fontSize: d.fontSize, fontWeight: d.fontWeight });
}

// Carried across a rebuild where `class` is not: these change what the message
// MEANS. Without `dir`, bulleting an Arabic paragraph gave an <li> that rendered
// left to right for the recipient.
const LINE_ATTRS = ['dir', 'lang'];

function _moveLineInto(fresh, source) {
  const style = source.getAttribute('style');
  if (style) fresh.setAttribute('style', style);   // wholesale, so re-decorate after
  LINE_ATTRS.forEach(attr => {
    const value = source.getAttribute(attr);
    if (value !== null) fresh.setAttribute(attr, value);
  });
  // An <li> is the exception: the margin-0 a LINE carries for mail clients is not
  // an item's to keep, and an item's indent is its nesting depth.
  if (fresh.tagName === 'LI') { fresh.style.margin = ''; _dropEmptyStyle(fresh); }
  else decorate(fresh);
  _stateTagMarks(fresh, source);
  while (source.firstChild) fresh.appendChild(source.firstChild);
  _shedStatedWeight(fresh);
  return fresh;
}

/* The line's marks belong INSIDE the item: ::marker inherits from the <li>, so a
   weight or a size left on it would restyle the bullet as well. renderInto reads
   them back off the block and settles them onto the runs — the same door that
   keeps a mark COMMAND from hoisting onto an item.

   CALLED ONLY ON A CONNECTED ITEM, which is why it does not live in _moveLineInto
   with the rest of the conversion: every caller there builds the <li> before
   putting it anywhere, and getComputedStyle answers NOTHING for an element outside
   the document. Asked there, flattenRuns heard silence and read it as "no mark",
   and what it lost was any mark that differs only from an ANCESTOR — green text
   inside a red link came out red the moment it was bulleted, and an 11px word in a
   24px line came out 24px. jsdom answers for a detached element, so no unit test
   could see it; it took a browser.

   The paste paths need no call of their own: they build their items detached and
   then render every landed line once the fragment is in the document.

   Takes the whole batch, and reads before it writes, for _settleLanded's reason:
   flattenRuns asks getComputedStyle and renderInto mutates, so settling items one
   at a time makes each read force a fresh style recalculation of everything the
   previous write dirtied. Filtered first, so a list of unmarked items — which is
   nearly every list — reads nothing at all. */
function _settleItemMarks(items) {
  const marked = items.filter(li => MARK_PROPS.some(p => li.style[p]));
  const read = marked.map(li => [li, flattenRuns(li)]);
  read.forEach(([li, runs]) => renderInto(li, runs));
}

/* The picked ones AND whatever lies between them. They are not always
   neighbours — a sub-list sits between two selected items whenever the selection
   reaches over it — and leaving it behind reorders the message, which is the one
   thing no command may do. It travels along unconverted: it is not a line, it is
   a level, and it lands wherever the lines around it land. */
const _between = (all, picked) =>
  all.slice(all.indexOf(picked[0]), all.indexOf(picked[picked.length - 1]) + 1);

// Splits `container` so anything before or after stays wrapped:
//   <ul>1 2 3 4 5</ul> lift 2-3 -> <ul>1</ul> + 2 3 + <ul>4 5</ul>
function liftOutOf(container, lines, convert = el => el) {
  const all = [...container.children];
  const first = all.indexOf(lines[0]);
  const span = _between(all, lines);
  const after = all.slice(first + span.length);
  if (after.length) {
    const tail = container.cloneNode(false);
    after.forEach(el => tail.appendChild(el));
    container.after(tail);
  }
  const lifted = [];
  const moved = span.map(el => {
    if (!lines.includes(el)) return el;
    const out = convert(el);
    // convert() builds a REPLACEMENT and only moves the children across, so the
    // emptied original must go or the content appears twice.
    if (out !== el) el.remove();
    lifted.push(out);
    return out;
  });
  let anchor = container;
  moved.forEach(el => { anchor.after(el); anchor = el; });   // between container and tail, in order
  // Emptied, not "started at the top": with the span above, a container can be
  // left holding the lines that were NOT selected, and removing it then would
  // take them out of the message with it.
  if (!container.children.length) container.remove();
  return lifted;
}

// Grouped per container first, because a split must be computed from all of them
// at once — lifting one at a time would shred one list into several.
function liftFrom(editable, lines, match) {
  const byContainer = new Map();
  lines.forEach(line => {
    const container = _containerOf(editable, line, match);
    if (!container) return;
    const child = _childOfContainer(container, line);
    if (!byContainer.has(container)) byContainer.set(container, []);
    if (!byContainer.get(container).includes(child)) byContainer.get(container).push(child);
  });
  const replaced = new Map();
  byContainer.forEach((kids, container) => {
    const convert = isList(container) ? (li => _moveLineInto(newBlock(), li)) : undefined;
    liftOutOf(container, kids, convert).forEach((el, i) => replaced.set(kids[i], el));
  });
  return lines.map(line => replaced.get(line) || line);
}

function _nestingDepth(root, node, match) {
  let n = 0;
  for (let el = node.parentElement; el && el !== root; el = el.parentElement) {
    if (match(el)) n++;
  }
  return n;
}

// One nesting level per pass, counted up front rather than capped at a guess:
// each pass removes exactly one level, so it can't be short and can't loop.
function flattenOut(editable, blocks, match = isOwnedContainer) {
  let passes = blocks.reduce((max, b) => Math.max(max, _nestingDepth(editable, b, match)), 0);
  let current = blocks;
  while (passes-- > 0 && current.some(b => _containerOf(editable, b, match))) {
    current = liftFrom(editable, current, match);
  }
  return current;
}

/* Two adjacent lists of the same kind are ONE list, wherever they sit. At the
   top of the message they look like one and restart the numbering at 1; INSIDE
   another list they are two sub-lists at the same depth under the same parent,
   which is that same lie told one level down — and the one an indent leaves
   behind every time an item between two sub-lists joins the first of them. */
// No items of its own means no markers: pure indentation, and nothing else.
function _itemlessList(el) {
  return !!el && isList(el) && ![...el.children].some(c => c.tagName === 'LI');
}

/* Such a wrapper standing right after a list is redundant — that list already
   opens the one level the wrapper was holding open — so its content belongs
   inside it. Depth-neutral by construction, one level given up for one gained,
   and it is what brings two lists that RENDER side by side under a single
   parent, where the merge below can finally see them as siblings. A wrapper
   with no list before it is the shape Gmail keeps when the top item leaves a
   list, and it is left exactly where it stands. */
function _drainWrapper(host, wrapper) {
  const moved = [...wrapper.children];
  while (wrapper.firstChild) host.appendChild(wrapper.firstChild);
  wrapper.remove();
  moved.forEach(el => { if (isList(el) && el.isConnected) _absorbAdjacentLists(el); });
  return host;
}

/* Same tag is not the whole of "the same list". The merge DISCARDS the second
   element, and its styling goes with it — two pasted <ul>s whose list-style-type
   differs are two kinds of bullet, and merging them silently turned the squares
   into discs. Compared whole and by string, in wrappersEqual's spirit: our own
   lists are built bare, so the ordinary merge is unaffected. */
const _sameListing = (a, b) => a.tagName === b.tagName
  && (a.getAttribute('style') || '') === (b.getAttribute('style') || '');

function _absorbAdjacentLists(list) {
  let prev = list.previousElementSibling;
  // Both orientations of the same relation, because the caller hands us whichever
  // list it just touched — sometimes the wrapper, sometimes the list before it.
  if (_itemlessList(list) && prev && isList(prev)) return _drainWrapper(prev, list);
  if (prev && _sameListing(prev, list)) {
    while (list.firstChild) prev.appendChild(list.firstChild);
    list.remove();
    list = prev;
  }
  const next = list.nextElementSibling;
  if (next && _sameListing(next, list)) {
    while (next.firstChild) list.appendChild(next.firstChild);
    next.remove();
  }
  const after = list.nextElementSibling;
  if (_itemlessList(after)) _drainWrapper(list, after);
  return list;
}

// Items grouped by the list they sit in: every list-shaped edit is a split, and a
// split has to be computed from all of that list's selected items at once.
function _itemsByList(lines) {
  const byList = new Map();
  lines.forEach(l => {
    if (l.tagName !== 'LI' || !isList(l.parentElement)) return;
    if (!byList.has(l.parentElement)) byList.set(l.parentElement, []);
    byList.get(l.parentElement).push(l);
  });
  return byList;
}

// The selected items PLUS whatever sits between them — a sub-list between two
// selected items is not selected itself, but leaving it behind would reorder the
// message and strand it at the wrong depth.
function _spanOf(list, items) {
  const kids = [...list.children];
  return kids.slice(kids.indexOf(items[0]), kids.indexOf(items[items.length - 1]) + 1);
}

// The list element, retagged where it stands. Its children MOVE, so every item
// and every sub-list keeps the depth it had — which is the whole point.
function _retagList(list, tag) {
  const fresh = document.createElement(tag);
  [...list.attributes].forEach(a => fresh.setAttribute(a.name, a.value));
  while (list.firstChild) fresh.appendChild(list.firstChild);
  list.replaceWith(fresh);
  return fresh;
}

function toggleListBlocks(editable, lines, listTag) {
  if (!lines.length) return;
  const TAG = listTag.toUpperCase();
  const already = lines.every(l => {
    const c = _containerOf(editable, l, isList);
    return c && c.tagName === TAG;
  });

  /* Pressing the kind it already is takes it up ONE level — a nested item
     rejoins its parent list, a top-level item leaves the list. Gmail's step, and
     the same step outdent takes, so the two can never disagree. */
  if (already) {
    const was = new Map(lines.map(l => [l, _nestingDepth(editable, l, isList)]));
    // The outermost level goes first, and it carries whole sub-lists up with it.
    const top = lines.filter(l => was.get(l) === 1);
    if (top.length) liftFrom(editable, top, isList);
    lines.forEach(l => {
      // A line the split already carried up has had its one level and must not
      // have a second, or a selection reaching over a sub-list would strip two.
      if (was.get(l) === 1 || _nestingDepth(editable, l, isList) < was.get(l)) return;
      nudgeItemDepth(editable, l, -1);
    });
    return;
  }

  /* Switching kinds RETAGS the list where it stands rather than lifting the
     items out and re-wrapping them: the items never move, so a sub-list keeps
     its depth for free. A list only part of which is selected is split out
     first, so the numbering of the half that was asked for is its own. */
  const converted = new Set();
  _itemsByList(lines).forEach((items, list) => {
    items.forEach(li => converted.add(li));
    // Already the kind that was asked for — untouched, so a selection running
    // off the end of a list still EXTENDS that list instead of splitting it.
    if (list.tagName === TAG) return;
    const all = [...list.children].filter(c => c.tagName === 'LI');
    _absorbAdjacentLists(_retagList(items.length === all.length ? list : _splitListOut(list, _spanOf(list, items)), TAG));
  });

  // What is left is not in a list at all — those lines become one.
  const freed = lines.filter(l => !converted.has(l));
  if (!freed.length) return;
  /* A list per CONSECUTIVE run, not one for all of them: a selection can reach
     over a list that is already the right kind (A / list / B), and gathering
     both loose lines into a single list would move B up next to A. Runs that
     end up touching are merged below, so the ordinary case is still one list. */
  const made = [];
  const items = [];
  let list = null;
  freed.forEach(b => {
    if (!list || list !== b.previousElementSibling) { list = document.createElement(listTag); b.before(list); made.push(list); }
    const item = _moveLineInto(document.createElement('li'), b);
    // Depth inside a list is NESTING, so a margin-left carried in from the
    // paragraph would be unreachable: outdent nests, it doesn't read margins.
    item.style.marginLeft = '';
    _dropEmptyStyle(item);
    list.appendChild(item);
    b.remove();
    items.push(item);
  });
  _settleItemMarks(items);   // in the document by now, which is the whole point
  made.forEach(l => { if (l.isConnected) _absorbAdjacentLists(l); });
}

// The given items become a list of their OWN, so a command that can only act on a
// whole container can still act on part of one.
function _splitListOut(list, items) {
  const fresh = list.cloneNode(false);
  const lifted = liftOutOf(list, items);   // splits `list`, leaving the items between the halves
  lifted[0].before(fresh);
  lifted.forEach(item => fresh.appendChild(item));
  return fresh;
}

// An <li> can't be wrapped where it stands — <ol><blockquote><li> renders over
// the bullets — so an item's unit is a LIST, split first when only part of one is
// selected. Units stay in document order, or the caller reorders the message.
// The list left behind is cut in two around the quote and renumbers from 1: a
// blockquote cannot be a child of a list, so there is nowhere else for it to go.
function _quoteUnits(lines) {
  const byList = new Map();
  const order = [], seen = new Set();
  lines.forEach(l => {
    const unit = l.tagName === 'LI' ? l.parentElement : l;
    if (!unit) return;
    if (l.tagName === 'LI') {
      if (!byList.has(unit)) byList.set(unit, []);
      byList.get(unit).push(l);
    }
    if (!seen.has(unit)) { seen.add(unit); order.push(unit); }
  });

  /* DEEPEST FIRST, because a selection can cross levels: the inner list is split
     while it still SITS INSIDE the outer one, so the outer split carries what is
     left of it along and the two keep the relation the selection crossed. Split
     the other way round and they arrive in the quote side by side, one level of
     nesting gone for good. */
  const depth = l => {
    let n = 0;
    for (let e = l.parentElement; e; e = e.parentElement) if (isList(e)) n++;
    return n;
  };
  const claimed = new Set(lines);
  const split = new Map();
  [...byList.keys()].sort((a, b) => depth(b) - depth(a)).forEach(list => {
    const kids = [...list.children];
    // The selected items AND any sub-list a deeper pass already claimed, plus
    // whatever lies between them: leaving that behind would reorder the message.
    const mine = kids.filter(k => claimed.has(k));
    const span = kids.slice(kids.indexOf(mine[0]), kids.indexOf(mine[mine.length - 1]) + 1);
    const unit = span.length === kids.length ? list : _splitListOut(list, span);
    claimed.add(unit);
    split.set(list, unit);
  });

  // Only the OUTERMOST units are quoted — the others are already inside one, and
  // lifting them out again is exactly the flattening this ordering just avoided.
  const units = order.map(u => split.get(u) || u);
  return units.filter(u => !units.some(o => o !== u && o.contains(u))).map(_liftForQuote);
}

// A <blockquote> can't live inside a list, so a SUB-list has to come out of its
// parent before it can be quoted — once per level it sits deep.
function _liftForQuote(unit) {
  let current = unit;
  while (current.parentElement && isList(current.parentElement)) {
    current = liftOutOf(current.parentElement, [current])[0];
  }
  return current;
}

/* A wrapping command builds ONE container and moves every line into it, which
   across a boundary would empty the thing they came from. CONTIGUOUS runs:
   A / BOX / B is three groups, not two.

   Which boundaries count is the caller's question. A box or a cell always does —
   a command may not carry a line out of one. For QUOTING, a quote counts as well:
   quoting a selection that runs from a loose line into an existing quote used to
   sweep the quoted lines into the new wrapper, which left them at the same depth
   they started at in a quote that was not theirs, and left the old one standing
   empty. Grouped by owner they each go ONE level deeper than where they were,
   which is the only thing the quote button has ever promised. */
function _perOwner(editable, lines, match) {
  const groups = [];
  let owner;
  lines.forEach((line, i) => {
    const next = _containerOf(editable, line, match);
    if (i === 0 || next !== owner) groups.push([]);
    owner = next;
    groups[groups.length - 1].push(line);
  });
  return groups;
}
const _perBox = (editable, lines) => _perOwner(editable, lines, isForeign);
const _perQuote = (editable, lines) =>
  _perOwner(editable, lines, el => isForeign(el) || isQuote(el));

/* ONE level deeper, every time: a quote is depth, and pressing quote asks for
   more of it. Gmail's rule, and it is why there is no unwrap branch here —
   outdent is the way back out, the same single step Enter on an empty line
   takes. Quoting a subset of a quote therefore NESTS rather than releasing. */
function quoteBlocks(lines) {
  if (!lines.length) return;
  _wrapUnits(_quoteUnits(lines), newEl('blockquote'));
}

/* Where the first unit STANDS, so a quote inside a quote lands inside it rather
   than splitting it in half around the lines that were asked for.

   Everything BETWEEN the first and last comes too — liftOutOf's rule, and for
   liftOutOf's reason. A list sitting between two selected paragraphs is no unit
   of ours when its items are nesting instead, and taking only the paragraphs
   would close the gap it was standing in: A / list / B came out A / B / list,
   which is the one thing no command may do. */
function _wrapUnits(units, box) {
  if (!units.length) return;
  const parent = units[0].parentElement;
  const span = units.every(u => u.parentElement === parent)
    ? _between([...parent.children], units)
    : units;
  span[0].before(box);
  span.forEach(u => box.appendChild(u));
}

function newIndent() {
  const el = document.createElement('blockquote');
  _stateStyle(el, INDENT_DEFAULTS);
  return el;
}

/* What an indent WRAPS: the line, or the OUTERMOST container around it that the
   selection covers end to end. That climb is the whole point of the container
   model — indent a quoted line and the new level lands outside the quote, so the
   bar moves right with the text instead of staying at the margin. Measured in
   Gmail: indenting inside a quote adds a blockquote OUTSIDE the gmail_quote.

   Coverage is the same test clearFormat uses to decide whether a quote is the
   selection's to unwrap, and for the same reason: one line of a three-line quote
   is not the quote, so indenting it may only move the line. */
function _indentUnit(editable, line, covered) {
  let unit = line;
  for (let el = line.parentElement; el && el !== editable; el = el.parentElement) {
    if (isForeign(el)) break;   // the wall a command never restructures past
    if (!isQuote(el)) continue;
    if (!_linesInOrder(el).every(l => covered.has(l))) break;
    unit = el;
  }
  return unit;
}

function indentBlocks(editable, lines, covered) {
  const units = [...new Set(lines.map(l => _indentUnit(editable, l, covered)))];
  // A unit already inside another is coming along anyway; wrapping it too would
  // spend a level on nothing.
  _wrapUnits(units.filter(u => !units.some(o => o !== u && o.contains(u))), newIndent());
}

// CaretFormat parks a zero-width space to hold a not-yet-typed-into format. OUR
// artifact: invisible to every offset and every run.
const ZWSP = '​';
// The test first: this runs over the whole document on every snapshot and commit,
// and a marker is present only while a caret-format session is armed.
const stripZwsp = s => (s.includes(ZWSP) ? s.split(ZWSP).join('') : s);

/* THE counting rule: what one node contributes to the coordinate system, in one
   place. There are two systems here — RUNS are a rendering model, OFFSETS are a
   selection model that exists because runs destroy the nodes a Range points at.
   A selection resolves through offsets and is then applied to runs, so the day
   the two count differently, a command edits the wrong characters.

   A <br> occupies a position exactly when SOMETHING FOLLOWS IT in its line:

     <p><br></p>          0 — an empty line, one address, its own
     <p><br><br></p>      1 — two empty lines: the first break opened the second
     <p>a<br>b</p>        3 — a, the break, b
     <p>a<br></p>         1 — the trailing <br> renders as nothing */
// Climbs out of the inline wrappers a break can be buried in and stops at the
// line. NOT isLineEl, which a <br> itself passes.
// "Something follows", not "a next sibling exists": the DOM manufactures empty
// text nodes constantly, and Shift+Enter at the end of a line leaves one.
const _isNothing = n => n.nodeType === 3 && !stripZwsp(n.data);
function _breakOccupies(br) {
  for (let n = br; n; n = n.parentNode) {
    for (let next = n.nextSibling; next; next = next.nextSibling) {
      if (!_isNothing(next)) return true;
    }
    if (!n.parentNode || !INLINE_MARK_TAGS.includes(n.parentNode.tagName)) return false;
  }
  return false;
}

// An IMAGE always occupies one: counting characters alone gave it no address, so
// nothing could select it, or say which side of it a caret was on.
const nodeLength = (n) => {
  if (n.nodeType === 3) return stripZwsp(n.data).length;
  if (n.tagName === 'IMG') return 1;
  return n.tagName === 'BR' && _breakOccupies(n) ? 1 : 0;
};

// Accept what counts, SKIP the rest — skip, not reject, or the walk would never
// reach the text inside a <span>.
const COUNTED_TAGS = new Set(['BR', 'IMG']);
const COUNTED_NODES = NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT;
const COUNTED_FILTER = {
  acceptNode: n => (n.nodeType === 3 || COUNTED_TAGS.has(n.tagName)
    ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
};

// Everything inside `root`, in positions. `root` may be an element or a document
// fragment, which is what lets offsetInBlock hand it part of a line.
function contentLength(root) {
  const walker = document.createTreeWalker(root, COUNTED_NODES, COUNTED_FILTER);
  let len = 0, n;
  while ((n = walker.nextNode())) len += nodeLength(n);
  return len;
}

const _childIndex = n => Array.prototype.indexOf.call(n.parentNode.childNodes, n);

// A position BEFORE an element, which is how an atomic is addressed: it has no
// inside for a caret to be in.
const _beforeNode = n => ({ node: n.parentNode, offset: _childIndex(n) });

/* Offset of (node, offset) from `block`'s start. The walk is over the LIVE tree,
   not a clone of the range: whether a <br> occupies a position depends on what
   follows it, and cloneContents cuts exactly at the boundary, so the break before
   the caret always looked trailing.

   The Range stays for the one thing it is best at — comparing positions. It is
   the only thing that resolves both kinds of DOM boundary. */
function offsetInBlock(block, node, nodeOffset) {
  const r = document.createRange();
  r.setStart(block, 0);
  // Clamp: an offset snapshotted before a mutation can outrun a node that shrank.
  const max = node.nodeType === 3 ? node.length : node.childNodes.length;
  r.setEnd(node, Math.min(nodeOffset, max));

  const walker = document.createTreeWalker(block, COUNTED_NODES, COUNTED_FILTER);
  let count = 0, n;
  while ((n = walker.nextNode())) {
    if (n === r.endContainer && n.nodeType === 3) {   // the boundary is inside this text node
      count += stripZwsp(n.data.slice(0, r.endOffset)).length;
      break;
    }
    // Past the boundary — comparePoint returns 1 for a point after the range.
    const after = n.nodeType === 3
      ? r.comparePoint(n, n.length) > 0
      : r.comparePoint(n.parentNode, _childIndex(n) + 1) > 0;
    if (after) break;
    count += nodeLength(n);
  }
  return count;
}

// Position within the whole editable, counted as plain text WITH one newline per
// line boundary. The newline is what gives an empty line an address of its own —
// without it a caret there has the same offset as the end of the line above.
function absOffsetOf(root, node, nodeOffset) {
  let pos = 0;
  for (const line of _linesInOrder(root)) {
    if (line === node || line.contains(node)) return pos + offsetInBlock(line, node, nodeOffset);
    pos += contentLength(line) + 1;
  }
  return pos;   // not inside any line (caret at container level) — end of content
}

// Inverse of absOffsetOf.
function absNodeAt(root, target) {
  const lines = _linesInOrder(root);
  let pos = 0;
  for (const line of lines) {
    const len = contentLength(line);
    if (target <= pos + len) return nodeAtOffset(line, target - pos);
    pos += len + 1;
  }
  const last = lines[lines.length - 1];
  return last ? nodeAtOffset(last, contentLength(last)) : { node: root, offset: 0 };
}

// Inverse — counts real characters but returns a RAW offset, usable directly
// against the live text node (markers and all).
function nodeAtOffset(block, targetOffset) {
  const walker = document.createTreeWalker(block, COUNTED_NODES, COUNTED_FILTER);   // what contentLength counts
  let counted = 0, n;
  while ((n = walker.nextNode())) {
    if (n.nodeType !== 3) {
      const len = nodeLength(n);
      if (len && counted === targetOffset) return _beforeNode(n);
      counted += len;
      continue;
    }
    const text = n.textContent;
    for (let raw = 0; raw < text.length; raw++) {
      if (counted === targetOffset) return { node: n, offset: raw };
      if (text[raw] !== ZWSP) counted++;
    }
    if (counted === targetOffset) return { node: n, offset: text.length };
  }
  return { node: block, offset: block.childNodes.length };
}

// Selection as character offsets, never raw node refs — a mark rebuild replaces a
// block's children and a block command can replace the block itself.
const Selection = {
  // THE one read of the live browser Selection, so it must run before any
  // mutation: the browser adjusts its Selection as a side effect of DOM edits.
  snapshot() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    return {
      startNode: range.startContainer, startOffset: range.startOffset,
      endNode: range.endContainer, endOffset: range.endOffset,
      collapsed: sel.isCollapsed,
    };
  },

  // Snapshot -> block + offsets. Normalizes first (the one mutation point), then
  // resolves against the settled tree; node identity survives reparenting.
  resolve(snap, root) {
    if (!snap) return null;
    /* The snapshot has to point INTO the document being edited. The live selection
       is often somewhere else entirely — a signature picker, a dialog, the address
       field — and blockContaining answers _firstLineIn for a node it cannot place,
       which reads as "the caret is at the top of the message" when the truth is
       "the caret is not in the message at all". A command then works from a block
       in the body against a range still anchored in the picker, and writes into
       whatever that range touches: a signature inserted with the dropdown focused
       landed inside the dropdown's own button, splitting its label in half.

       Rejected rather than clamped, and asked of BOTH ends, because fromRange has
       always asked exactly this — resolve was the one door into the pipeline that
       did not. A command with nowhere to work does nothing; a caller that has a
       sensible answer without a caret provides its own (see insertBlocks). */
    if (!root.contains(snap.startNode) || !root.contains(snap.endNode)) return null;
    normalizeBlocks(root, [snap.startNode, snap.endNode]);   // never prune the blocks this snapshot points into
    const block = blockContaining(root, snap.startNode);
    if (!block) return null;
    // Each offset is measured in ITS OWN block: measuring the end in the START
    // block gives a number that runs past the end of it.
    const endBlock = blockContaining(root, snap.endNode) || block;
    return {
      root,
      // Raw nodes, so block commands resolve from these instead of re-reading the
      // live Selection that normalizeBlocks just disturbed.
      snap,
      // Block-local: WHERE A COMMAND WORKS. Means what it looks like only when
      // block === endBlock; a caller spanning blocks wants segments.
      block,
      endBlock,
      startOffset: offsetInBlock(block, snap.startNode, snap.startOffset),
      endOffset: offsetInBlock(endBlock, snap.endNode, snap.endOffset),
      // Editable-absolute: WHERE THE SELECTION GOES AFTERWARDS. Block-local can't
      // express it — a three-line selection has no single block to be measured in.
      startAbs: absOffsetOf(root, snap.startNode, snap.startOffset),
      endAbs: absOffsetOf(root, snap.endNode, snap.endOffset),
      collapsed: snap.collapsed,
    };
  },

  // For read-only callers outside a transaction, where nothing mutates between
  // the two halves.
  capture(root) {
    return this.resolve(this.snapshot(), root);
  },

  // A caller holding a SAVED range is telling us the live selection has moved on
  // — opening the link modal steals focus — so reading the live one answers a
  // question nobody asked.
  fromRange(range, root) {
    if (!range || !root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
    // Node identity, not offsets: resolve() normalizes first, and a snapshot has
    // to survive the reparenting that causes.
    return this.resolve({
      startNode: range.startContainer, startOffset: range.startOffset,
      endNode: range.endContainer, endOffset: range.endOffset,
      collapsed: range.collapsed,
    }, root);
  },

  // Against the editable, never a saved block — see startAbs.
  restore(saved) {
    if (!saved || !saved.root || !saved.root.isConnected) return;
    const start = absNodeAt(saved.root, saved.startAbs);
    const end = saved.collapsed ? start : absNodeAt(saved.root, saved.endAbs);
    const r = document.createRange();
    r.setStart(start.node, start.offset);
    try { r.setEnd(end.node, end.offset); } catch (_) { r.collapse(true); }   // content shrank — degrade to a caret
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  },
};

// The blocks a selection covers, each with the range inside that block, so mark
// commands have no separate single-block path. Nothing new is resolved: it is the
// overlap of [startAbs, endAbs] with each block's span.
function selectionSegments(selection) {
  if (!selection || selection.collapsed) return [];   // a caret covers nothing; where it IS lives on selection.block
  const { root, startAbs, endAbs } = selection;
  const wanted = new Set(resolveBlocks(selection));
  const out = [];
  let base = 0;   // the same walk absOffsetOf uses, so the bases agree
  for (const line of _linesInOrder(root)) {
    const len = contentLength(line);
    if (wanted.has(line)) {
      const startOffset = Math.max(startAbs - base, 0);
      const endOffset = Math.min(endAbs - base, len);
      // `full` lets clear-formatting tell "unquote this line" from "strip its marks".
      if (endOffset > startOffset) out.push({ block: line, startOffset, endOffset, full: startOffset === 0 && endOffset === len });
    }
    base += len + 1;
  }
  return out;
}

/* ONE table for what a mark IS: everything below is derived from it, and anything
   not on it is discarded the first time a line re-renders. `read` is where
   activeMarksAt gets the value, and it is not a style choice:

   computed — several shapes mean the same thing (<b>, <font color>, a class, an
     inline style) and the browser has folded them into one answer. Safe because
     these do not inherit, or inherit UNCHANGED, so a bare run reports nothing.
   declared — these inherit PROPORTIONALLY: a unitless line-height resolves
     against each element's OWN font-size, so a 32px run computes 54.4px inside a
     14px line, and read as a mark it is written back as an absolute that no
     longer tracks the size. */
const MARK_SPEC = {
  bold:          { prop: 'fontWeight',     read: 'computed' },
  italic:        { prop: 'fontStyle',      read: 'computed' },
  underline:     { prop: 'textDecoration', read: 'computed', link: true },
  strike:        { prop: 'textDecoration', read: 'computed', link: true },
  fontSize:      { prop: 'fontSize',       read: 'computed', value: true },
  lineHeight:    { prop: 'lineHeight',     read: 'declared', value: true, text: true },
  letterSpacing: { prop: 'letterSpacing',  read: 'declared', value: true, text: true },
  color:         { prop: 'color',          read: 'computed', value: true, link: true },
  bgColor:       { prop: 'backgroundColor', read: 'computed', value: true, runOnly: true },
  fontFamily:    { prop: 'fontFamily',     read: 'computed', value: true },
  /* `with` is the pair direction cannot be written without: `direction: rtl`
     alone reorders the run but does not ISOLATE it, so the space, comma or
     bracket at its edges resolve against the surrounding text and land on the
     wrong side. The dir ATTRIBUTE implies that isolation; the bare declaration
     does not. Stated here so clearBlockMarks clears both. */
  direction:     { prop: 'direction',      read: 'computed', value: true,
                   with: { unicodeBidi: 'isolate' } },
};
const MARK_KEYS = Object.keys(MARK_SPEC);
const _marksWhere = flag => MARK_KEYS.filter(key => MARK_SPEC[key][flag]);

// A VALUE mark is turned off by DROPPING it; a flag is turned off by storing
// `false`, which inside a heading is the whole declaration (see setMark).
const VALUE_MARKS = new Set(_marksWhere('value'));
const TRANSPARENT = new Set(['transparent', 'rgba(0, 0, 0, 0)']);              // "no highlight", however spelled

// runOnly: never hoisted onto the block, because moving it CHANGES how it looks —
// a background paints the element's BOX, and a block is full-width, so hoisting
// floods the whole line past the text.
const RUN_ONLY_MARKS = new Set(_marksWhere('runOnly'));

/* link: the marks an ANCHOR can answer for itself. Every mail client styles `a`
   directly, so one of these written on the BLOCK loses to `a { color: … }` at the
   link. Keeping them on the runs instead puts them in a span inside the anchor,
   where they win — which is right when the colour is the link's, and wrong when it
   is only the page's.

   Asked PER ANCHOR for that reason. It HOLDS where the <a> says nothing about the
   property: a campaign that colours its link text has nowhere else to put it, and
   hoisting there loses it to the reader's own rule. It YIELDS where the <a>
   answers for itself: there the block's value is the page's ambient state and not
   a choice about the link, and burying the anchor's own answer under it is what
   turned a red link black on a page whose body text is black — which Chrome dumps
   onto every block it copies.

   A mark COMMAND deliberately does NOT follow Gmail here. Measured: colouring a
   line blue there turns the words blue, strips the colour the anchor declared and
   leaves the link at the reader's own — Gmail never writes inside an <a>, from any
   door. Copying that would mean a selection inside a link could not be coloured at
   all, which the engine has always allowed and which is the more useful answer. So
   a command still reaches in; only the block's ambient value is kept out. */
const LINK_INTERCEPTED_MARKS = new Set(_marksWhere('link'));

/* Which of them THIS anchor declares for itself. Probed rather than read out of
   the string: `text-decoration` arrives as often in shorthand as in longhand, and
   the CSSOM is the only thing that resolves both. A run outside a link answers
   nothing and costs nothing, which is nearly every run. */
function _linkAnswers(wrapper) {
  const out = new Set();
  if (!wrapper || wrapper.tag !== 'A' || !wrapper.attrs.style) return out;
  const probe = document.createElement('a');
  probe.setAttribute('style', wrapper.attrs.style);
  LINK_INTERCEPTED_MARKS.forEach(key => {
    if (probe.style[MARK_SPEC[key].prop]) out.add(key);
  });
  return out;
}

// The marks activeMarksAt reads from el.style instead of getComputedStyle.
const DECLARED_MARKS = MARK_KEYS.filter(key => MARK_SPEC[key].read === 'declared');

// text: how TEXT is set, which is nothing at all on a run that is a picture.
// Every email template writes `line-height` on its images, aimed at the cell —
// read as a mark it earns the image a <span> carrying a declaration that styles
// nothing. Only the declared pair: a computed mark reports absent there already.
const TEXT_MARKS = _marksWhere('text');

// The only place a semantic mark becomes CSS. underline/strike share the
// decoration, so they are combined rather than overwriting. The SHORTHAND, not
// text-decoration-line: Outlook's Word engine drops the CSS3 longhand silently.
function marksToDecls(marks) {
  const d = {};
  if (marks.bold) d.fontWeight = 'bold';
  else if (marks.bold === false) d.fontWeight = 'normal';   // stated OFF — see statedRuns
  if (marks.italic) d.fontStyle = 'italic';
  const lines = [marks.underline && 'underline', marks.strike && 'line-through'].filter(Boolean);
  if (lines.length) d.textDecoration = lines.join(' ');
  if (marks.fontSize) d.fontSize = marks.fontSize;
  if (marks.lineHeight) d.lineHeight = marks.lineHeight;
  if (marks.letterSpacing) d.letterSpacing = marks.letterSpacing;
  if (marks.color) d.color = marks.color;
  if (marks.bgColor) d.backgroundColor = marks.bgColor;
  // Not canonicalised, and it cannot be from here: WebKit serializes a multi-word
  // family bare where Chromium and Firefox quote it, and every write goes through
  // the CSSOM, which re-serializes to its own form and has the last word.
  if (marks.fontFamily) d.fontFamily = marks.fontFamily;
  if (marks.direction) Object.assign(d, { direction: marks.direction }, MARK_SPEC.direction.with);
  return d;
}

// Every property marks can occupy — a mark's own, plus anything its `with` writes
// alongside it. Not textAlign/marginLeft, which are block state.
const MARK_PROPS = [...new Set(MARK_KEYS.flatMap(key =>
  [MARK_SPEC[key].prop, ...Object.keys(MARK_SPEC[key].with || {})]))];

// marksToDecls writes the SHORTHAND and the CSSOM is expected to expand it, so
// read the longhand first and fall back. `none` is a value, not an absence.
function decoOf(style) {
  const line = style.textDecorationLine;
  if (line && line !== 'none') return line;
  return style.textDecoration || '';
}

// Reads back the marks WE hoisted onto a block. el.style, not computed: the
// question is what we put there.
function styleToMarks(style) {
  const marks = {};
  const deco = decoOf(style);
  if (isBoldWeight(style.fontWeight)) marks.bold = true;
  if (style.fontStyle === 'italic') marks.italic = true;
  if (deco.includes('underline')) marks.underline = true;
  if (deco.includes('line-through')) marks.strike = true;
  if (style.fontSize) marks.fontSize = style.fontSize;
  if (style.lineHeight && style.lineHeight !== 'normal') marks.lineHeight = style.lineHeight;
  if (style.letterSpacing && style.letterSpacing !== 'normal') marks.letterSpacing = style.letterSpacing;
  if (style.color) marks.color = style.color;
  if (style.backgroundColor) marks.bgColor = style.backgroundColor;
  if (style.fontFamily) marks.fontFamily = style.fontFamily;
  // What a BLOCK's own declarations contribute to its runs. Without it,
  // `direction: rtl` on a line belongs to no run, is cleared by clearBlockMarks
  // and never hoisted back — bolding one word turns the paragraph left-to-right.
  if (style.direction) marks.direction = style.direction;
  return marks;
}

// An <a> the SOURCE rendered as a box: a CTA button, whose fill and radius belong
// to the button and not the words — read as marks, the green pill becomes a green
// highlight behind "Donate". Both halves of the test matter: `display` alone
// catches the social icons, a fill alone catches a highlighted ordinary link.
const BUTTON_DISPLAY = /^(inline-block|inline-flex|block|flex)$/;
// A FILL, not BOX_SIGNALS: that list counts padding and width, which is what every
// web page gives a block-level nav link. What reads as a button is a background or
// a frame.
const BUTTON_FILL = ['background', 'backgroundColor', 'backgroundImage',
  'border', 'borderTop', 'borderRight', 'borderBottom', 'borderLeft', 'borderRadius'];
const _isButtonBox = (el, display) => el.tagName === 'A'
  && BUTTON_DISPLAY.test(display || el.style.display)
  && BUTTON_FILL.some(prop => el.style[prop]);

// What an anchor may say about ITSELF. A button keeps everything the paste sweep
// allowed; an ordinary link is TEXT, and padding or a width on one is a web page's
// layout, which means nothing in a mail body.
const LINK_STYLE_KEPT = /^(color|text-decoration|font-|background-color)/;
function _anchorStyle(el) {
  const style = el.getAttribute('style');
  if (!style || _isButtonBox(el)) return style;
  const probe = document.createElement('a');
  probe.setAttribute('style', style);
  [...probe.style].forEach(prop => { if (!LINK_STYLE_KEPT.test(prop)) probe.style.removeProperty(prop); });
  return probe.getAttribute('style') || null;
}

// Marks active on `node`, innermost first. Reads what the browser RESOLVED, not
// the shape that produced it, so there is no registry of tags to keep in sync. An
// ancestor walk because text-decoration and background-color don't inherit;
// `base` is the block's style, the baseline a run inherits carrying no mark.
function activeMarksAt(root, node, base) {
  const marks = {};
  const blockBase = base || getComputedStyle(root);
  let el = node.nodeType === 3 ? node.parentElement : node;
  // Inside a link, the anchor is the baseline: a mark span within one INHERITS
  // the link colour, so measuring it against the block would report that colour
  // as a mark of its own. Above the anchor the block is the baseline again.
  const linkEl = _linkAncestor(root, el);
  const linkBase = linkEl && getComputedStyle(linkEl);
  const baselineFor = e => (linkEl && e !== linkEl && linkEl.contains(e) ? linkBase : blockBase);
  // font-weight and font-style INHERIT, so the INNERMOST computed value is already
  // the whole answer; the walk below is only for marks that do NOT inherit. Off is
  // a VALUE: a normal-weight run inside a bold block is a mark that says not-bold,
  // and read as silence the block's weight wins the merge in flattenRuns.
  if (el && el !== root) {
    const cs = getComputedStyle(el);
    const baseline = baselineFor(el);
    if (isBoldWeight(cs.fontWeight)) marks.bold = true;
    else if (isBoldWeight(baseline.fontWeight)) marks.bold = false;
    if (_isItalic(cs.fontStyle)) marks.italic = true;
    else if (_isItalic(baseline.fontStyle)) marks.italic = false;
  }
  while (el && el !== root) {
    const baseline = baselineFor(el);
    // An <a> contributes NO marks: what it declares is the link's own appearance
    // and wrapperAt preserves it on the element, so reading it here would state it
    // twice. Marks on ancestors ABOVE the anchor still apply.
    if (el.tagName === 'A') { el = el.parentElement; continue; }
    const cs = getComputedStyle(el);
    const deco = decoOf(cs);
    if (marks.underline === undefined && deco.includes('underline')) marks.underline = true;
    if (marks.strike === undefined && deco.includes('line-through')) marks.strike = true;
    if (marks.fontSize === undefined && cs.fontSize !== baseline.fontSize) marks.fontSize = cs.fontSize;
    // Straight from MARK_SPEC, so a CSS-only mark added there gets the safe
    // reading by existing. See the table for why these read the declaration.
    DECLARED_MARKS.forEach(key => {
      const prop = MARK_SPEC[key].prop;
      if (marks[key] === undefined && el.style[prop]) marks[key] = el.style[prop];
    });
    if (marks.color === undefined && cs.color !== baseline.color) marks.color = cs.color;
    if (marks.bgColor === undefined && cs.backgroundColor !== baseline.backgroundColor && !TRANSPARENT.has(cs.backgroundColor)) marks.bgColor = cs.backgroundColor;
    if (marks.fontFamily === undefined && cs.fontFamily !== baseline.fontFamily) marks.fontFamily = cs.fontFamily;
    // Measured against the LINE, which is what keeps a whole RTL paragraph from
    // stamping a direction onto each of its own runs.
    if (marks.direction === undefined && cs.direction !== baseline.direction) marks.direction = cs.direction;
    el = el.parentElement;
  }
  return marks;
}

function _linkAncestor(root, node) {
  for (let el = node; el && el !== root; el = el.parentElement) {
    if (el.tagName === 'A') return el;
  }
  return null;
}

/* What an anchor carries beyond the two the engine READS. Paste never lets these
   in — PASTE_ATTRS allows an <a> its href and nothing else — but ADOPT does, and a
   draft or a reply is full of them. Without this list a render is the moment they
   vanish: the document holds a target the next Bold silently drops, which is the
   editor disagreeing with itself about what the message says. */
const ANCHOR_ATTRS = ['target', 'rel', 'title', 'aria-label'];

// The nearest foreign (non-mark) wrapper a run sits inside — today just links,
// kept generic so anything else gets preserved instead of silently discarded.
function wrapperAt(root, node) {
  let el = node.parentElement;
  while (el && el !== root) {
    // No href key at all when there is no href — writing one back as href=""
    // would turn the refusal to write an unsafe URL into an empty live link.
    if (el.tagName === 'A') {
      const href = el.getAttribute('href');
      const attrs = href ? { href } : {};
      // Whatever the anchor DECLARES travels with it — for text-decoration that
      // is the only thing that can work, since a decoration cannot be removed by
      // a descendant. Declarations only, never resolved style: a link's default
      // blue comes from a stylesheet and must leave with the anchor.
      const style = _anchorStyle(el);
      if (style) attrs.style = style;
      ANCHOR_ATTRS.forEach(name => {
        const value = el.getAttribute(name);
        if (value !== null) attrs[name] = value;
      });
      return { tag: 'A', attrs };
    }
    el = el.parentElement;
  }
  return null;
}

function marksEqual(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if (a[k] !== b[k]) return false;
  return true;
}
// Over EVERY attribute rather than the two it used to name: a wrapper's attrs are
// now whatever the anchor carried, and a named list here would go on calling two
// links equal because it had never heard of what tells them apart.
function wrappersEqual(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.tag !== b.tag) return false;
  return marksEqual(a.attrs, b.attrs);   // the same key-by-key comparison, on attributes
}

// Inline things the engine carries but never looks inside: it re-emits a copy
// as-is. Adding one (a merge field, a signature chip) is one entry here.
const ATOMIC_TAGS = new Set(['BR', 'IMG']);

// Collapses consecutive same-mark-and-wrapper runs into one. An atomic never
// merges — it stands alone by definition.
function mergeRuns(runs) {
  const out = [];
  for (const r of runs) {
    const prev = out[out.length - 1];
    if (r.node) { out.push({ node: r.node, marks: r.marks || {}, wrapper: r.wrapper || null }); continue; }
    if (prev && !prev.node && marksEqual(prev.marks, r.marks) && wrappersEqual(prev.wrapper, r.wrapper)) prev.text += r.text;
    else out.push({ text: r.text, marks: r.marks, wrapper: r.wrapper || null });
  }
  return out;
}

// Recursion rather than a TreeWalker: a filter can say "skip this node but visit
// its children", never "take this node and DON'T descend".
function _collectRuns(root, node, marksOf, out) {
  for (const n of node.childNodes) {
    if (n.nodeType === 3) {
      const text = stripZwsp(n.textContent);   // our marker is not user text
      if (text) out.push({ text, marks: marksOf(n), wrapper: wrapperAt(root, n) });
      continue;
    }
    if (n.nodeType !== 1) continue;
    if (ATOMIC_TAGS.has(n.tagName)) { out.push({ node: n, marks: marksOf(n), wrapper: wrapperAt(root, n) }); continue; }
    _collectRuns(root, n, marksOf, out);   // a mark wrapper's marks are read off its leaves
  }
}

// DOM -> flat runs: {text, marks, wrapper} or {node, marks, wrapper}. Atomics
// carry marks too, so an empty bold line reads back as bold rather than
// "nothing here".
function flattenRuns(root) {
  const base = getComputedStyle(root);   // resolved once, not per run
  // Marks hoisted onto the block apply to every run, and activeMarksAt measures
  // runs AGAINST the block — so without folding these back in, a hoisted mark
  // reads as absent and the next render drops it.
  const hoisted = styleToMarks(root.style);
  // COMPUTED, not declared: a heading's bold is given by its tag and never
  // written down, so text directly inside an <h1> would carry no weight mark and
  // the Bold button would read it as off.
  hoisted.bold = isBoldWeight(base.fontWeight);
  // An ELEMENT run is an atomic and never text — see TEXT_MARKS, or a line that
  // states a line-height stamps a span onto the picture in it.
  const marksOf = (node) => {
    const marks = { ...hoisted, ...activeMarksAt(root, node, base) };
    if (node.nodeType === 1) TEXT_MARKS.forEach(key => delete marks[key]);
    return marks;
  };
  const raw = [];
  _collectRuns(root, root, marksOf, raw);
  return mergeRuns(raw);
}

// Marks shared by EVERY run, which can live once on the block instead of on
// every span.
function commonMarks(runs) {
  const first = runs.find(r => !r.node);
  if (!first) return {};
  const shared = { ...first.marks };
  runs.forEach(r => {
    if (r.node) return;
    Object.keys(shared).forEach(k => { if (r.marks[k] !== shared[k]) delete shared[k]; });
  });
  return shared;
}

// Cleared before every render: a mark that USED to be shared has to come off the
// block when it stops being, or it keeps applying to runs that dropped it.
function clearBlockMarks(block) {
  MARK_PROPS.forEach(p => { block.style[p] = ''; });
  _dropEmptyStyle(block);
}

// A run declares only what differs from its block, so for a flag mark ON is a
// declaration and OFF is an absence — except inside a heading, which is bold
// already, and there NOT BOLD is the half that has to be said. Settled here once
// so nothing downstream needs a special case.
const FLAG_MARKS = MARK_KEYS.filter(key => !VALUE_MARKS.has(key));

function settledRuns(block, runs) {
  const boldByTag = HEADING_TAG.test(block.tagName);
  return runs.map(r => {
    const marks = { ...r.marks };
    FLAG_MARKS.forEach(key => { if (marks[key] === false) delete marks[key]; });
    if (boldByTag) { if (r.marks.bold === false) marks.bold = false; else delete marks.bold; }
    return { ...r, marks };
  });
}
// The same settling for one mark-set, which is what a caret-format marker is.
const settledMarks = (block, marks) => settledRuns(block, [{ marks }])[0].marks;

// Renders runs into `block`, lifting what they all share onto it — a run left
// with nothing of its own needs no span, so uniform text collapses to plain text.
function renderInto(block, rawRuns) {
  const runs = settledRuns(block, rawRuns);
  const shared = commonMarks(runs);
  RUN_ONLY_MARKS.forEach(key => delete shared[key]);   // shared, but not safe to move onto the block
  // Never onto an <li>: ::marker inherits from the item, so a mark hoisted here
  // restyles the bullet or number too. Gmail keeps every mark inside the item.
  if (block.tagName === 'LI') Object.keys(shared).forEach(key => delete shared[key]);
  /* The link rule, both halves, asked of the RUNS — the block still holds its old
     children here. A mark stays OFF the block where an anchor cannot answer for it
     (hoisted there it would lose to the reader's `a {}`), and off the RUN where the
     anchor can AND the value is only the block's own.

     That second condition is the whole of it. flattenRuns merges the block's
     declarations into every run, so a run inside an anchor carries the line's
     colour whether or not anything chose it FOR the link — and written back inside
     the <a> it buries the anchor's own, which is how a page whose body text is
     black turned a red link black.

     A value is the LINE's if the block declares it, or if a run outside every
     anchor carries it too. Both, because neither alone is enough: joining a
     coloured line onto an uncoloured one leaves the colour on the runs with no
     declaration left to match, and a line that is nothing but a link has no run
     outside one to compare against. Anything else is a choice about this text —
     green words inside a red link — and it stays where it was put. */
  const ambient = styleToMarks(block.style);
  const outsideLinks = runs.filter(r => !r.wrapper || r.wrapper.tag !== 'A');
  const isTheLines = (key, value) => value !== undefined
    && (value === ambient[key] || outsideLinks.some(r => r.marks && r.marks[key] === value));

  const answers = runs.map(r => _linkAnswers(r.wrapper));
  runs.forEach((r, i) => {
    if (!r.wrapper || r.wrapper.tag !== 'A') return;
    LINK_INTERCEPTED_MARKS.forEach(key => { if (!answers[i].has(key)) delete shared[key]; });
  });
  clearBlockMarks(block);
  Object.assign(block.style, marksToDecls(shared));
  const rest = runs.map((r, i) => {
    const marks = { ...r.marks };
    Object.keys(shared).forEach(k => delete marks[k]);
    answers[i].forEach(k => { if (isTheLines(k, marks[k])) delete marks[k]; });
    return { ...r, marks };
  });
  block.replaceChildren(renderRuns(rest));
}

// At most ONE <span> per run, skipped entirely when the run has no marks.
function markNode(leaf, marks) {
  const decls = marksToDecls(marks);
  if (!Object.keys(decls).length) return leaf;
  const span = document.createElement('span');
  Object.assign(span.style, decls);
  span.appendChild(leaf);
  return span;
}

function wrapperEl(wrapper) {
  const el = document.createElement(wrapper.tag.toLowerCase());
  Object.entries(wrapper.attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}

// Run -> DOM: the marks span inside the foreign wrapper, if there is one.
function wrapNode(leaf, marks, wrapper) {
  const node = markNode(leaf, marks);
  if (!wrapper) return node;
  const el = wrapperEl(wrapper);
  el.appendChild(node);
  return el;
}
function wrapText(text, marks, wrapper) {
  return wrapNode(document.createTextNode(text), marks, wrapper);
}
function renderRuns(runs) {
  const frag = document.createDocumentFragment();
  let host = null, hostWrapper = null;
  runs.forEach(r => {
    // Cloned, so a run stays a template: the same runs can be rendered into a
    // different block (list conversion, quoting) without moving live nodes.
    const marked = markNode(r.node ? r.node.cloneNode(true) : document.createTextNode(r.text), r.marks || {});
    const wrapper = r.wrapper || null;
    if (!wrapper) { frag.appendChild(marked); host = hostWrapper = null; return; }
    // Consecutive runs inside the SAME link share one <a>. One per run turned a
    // single link with a bold word in it into three separate links on the wire.
    if (!host || !wrappersEqual(hostWrapper, wrapper)) {
      host = wrapperEl(wrapper);
      hostWrapper = wrapper;
      frag.appendChild(host);
    }
    host.appendChild(marked);
  });
  return frag;
}

// nodeLength, not a second opinion: the runs side of the SAME rule the offset
// primitives count by. See "THE counting rule".
const runLen = r => (r.node ? nodeLength(r.node) : r.text.length);

// Offsets are UTF-16 code units and an emoji is two, so cutting between the
// halves leaves a lone surrogate in each run. There is no cursor position there,
// so rounding down to the start of the pair loses nothing.
const _isHighSurrogate = c => c >= 0xd800 && c <= 0xdbff;
const _isLowSurrogate = c => c >= 0xdc00 && c <= 0xdfff;
const _wholeChars = (text, cut) =>
  (cut > 0 && _isHighSurrogate(text.charCodeAt(cut - 1)) && _isLowSurrogate(text.charCodeAt(cut))
    ? cut - 1 : cut);

// Ensures a run boundary exists at `offset`. Plain array — nothing can go stale.
function splitRunsAt(runs, offset) {
  const out = [];
  let pos = 0;
  for (const r of runs) {
    if (r.node) { out.push(r); pos += runLen(r); continue; }
    const len = r.text.length;
    if (offset > pos && offset < pos + len) {
      const cut = _wholeChars(r.text, offset - pos);
      if (cut === 0) out.push(r);   // snapped to this run's start — the boundary is already there
      else {
        out.push({ text: r.text.slice(0, cut), marks: r.marks, wrapper: r.wrapper });
        out.push({ text: r.text.slice(cut), marks: r.marks, wrapper: r.wrapper });
      }
    } else {
      out.push(r);
    }
    pos += len;
  }
  return out;
}

// Marks that would apply if you typed at this collapsed offset — the run ending
// there (continue what was typed), else the run starting there.
function marksAtOffset(runs, offset) {
  const split = splitRunsAt(runs, offset);
  let pos = 0;
  for (const r of split) {
    const len = runLen(r);
    if (pos + len === offset) return r.marks || {};
    pos += len;
  }
  pos = 0;
  for (const r of split) {
    if (pos === offset) return r.marks || {};
    pos += runLen(r);
  }
  return {};
}

// Per mark: { state: 'all'|'mixed'|'none', value }. The single source of truth
// for both command decisions and toolbar highlighting.
function analyze(runs, startOffset, endOffset) {
  const result = {};
  if (startOffset === endOffset) {
    const marks = marksAtOffset(runs, startOffset);
    MARK_KEYS.forEach(key => {
      const v = marks[key] || null;
      result[key] = { state: v ? 'all' : 'none', value: v };
    });
    return result;
  }
  const split = splitRunsAt(splitRunsAt(runs, startOffset), endOffset);
  const touched = [];
  let pos = 0;
  for (const r of split) {
    const len = runLen(r);
    if (!r.node && len > 0 && pos >= startOffset && pos < endOffset) touched.push(r);
    pos += len;
  }
  MARK_KEYS.forEach(key => {
    if (!touched.length) { result[key] = { state: 'none', value: null }; return; }
    let value, mixed = false;
    touched.forEach(r => {
      const v = r.marks[key] || null;
      if (value === undefined) value = v;
      else if (value !== v) mixed = true;
    });
    result[key] = mixed ? { state: 'mixed', value: null } : { state: value ? 'all' : 'none', value };
  });
  return result;
}

// Several analyze() results as one answer, so a toggle decides ONCE for a
// multi-line selection instead of each line flipping independently.
function combineStates(parts) {
  const out = {};
  MARK_KEYS.forEach(key => {
    let merged = null;
    for (const part of parts) {
      const cur = part[key];
      if (merged === null) { merged = cur; continue; }
      if (merged.state !== cur.state || merged.value !== cur.value) { merged = { state: 'mixed', value: null }; break; }
    }
    out[key] = merged || { state: 'none', value: null };
  });
  return out;
}

// A style value round-trips through CSS normalized ("#0000ff" -> "rgb(0, 0,
// 255)"), so canonicalize before comparing. Flag marks have no value to convert.
function canonicalMarkValue(key, value) {
  if (value == null || !VALUE_MARKS.has(key)) return value;
  const prop = { fontSize: 'fontSize', color: 'color', bgColor: 'backgroundColor', fontFamily: 'fontFamily' }[key];
  const probe = document.createElement('span');
  probe.style[prop] = value;
  return probe.style[prop] || value;
}

// setMark on the run's foreign wrapper instead of its marks. Atomics ARE
// included, unlike with marks: an image can't be bold, but it can be a link.
function setWrapper(runs, startOffset, endOffset, wrapper) {
  const split = splitRunsAt(splitRunsAt(runs, startOffset), endOffset);
  const out = [];
  let pos = 0;
  for (const r of split) {
    const inRange = pos >= startOffset && pos < endOffset;
    out.push({ ...r, wrapper: inRange ? wrapper : r.wrapper || null });
    pos += runLen(r);
  }
  return out;
}

function setMark(runs, startOffset, endOffset, key, value) {
  const canonical = canonicalMarkValue(key, value);
  const split = splitRunsAt(splitRunsAt(runs, startOffset), endOffset);
  const out = [];
  let pos = 0;
  for (const r of split) {
    const len = runLen(r);
    const inRange = !r.node && len > 0 && pos >= startOffset && pos < endOffset;
    if (inRange) {
      const marks = { ...r.marks };
      // A flag turned off is stored as `false`, not dropped. Inside a heading that
      // is the whole declaration; settledRuns drops it everywhere it says nothing.
      if (canonical) marks[key] = canonical;
      else if (VALUE_MARKS.has(key)) delete marks[key];
      else marks[key] = false;
      // An ABSOLUTE line-height was measured for a size that no longer applies,
      // so changing the size drops it. A ratio already tracks.
      if (key === 'fontSize' && /px$/.test(marks.lineHeight || '')) delete marks.lineHeight;
      out.push({ text: r.text, marks, wrapper: r.wrapper });
    } else {
      out.push(r);
    }
    pos += len;
  }
  return mergeRuns(out);
}

// Clearing every mark is NOT turning each one off: off is a value, cleared is the
// absence that lets the block's own styling through again. The wrapper stays —
// clearing formatting does not remove a link.
function clearMarks(runs, startOffset, endOffset) {
  const split = splitRunsAt(splitRunsAt(runs, startOffset), endOffset);
  const out = [];
  let pos = 0;
  for (const r of split) {
    const len = runLen(r);
    const inRange = !r.node && len > 0 && pos >= startOffset && pos < endOffset;
    out.push(inRange ? { text: r.text, marks: {}, wrapper: r.wrapper } : r);
    pos += len;
  }
  return mergeRuns(out);
}

// The whole toggle decision: only re-picking the value that's ALREADY fully
// applied clears it — a different value (red -> blue) always turns ON.
function nextMarkValue(state, canonicalOn) {
  return (state.state === 'all' && state.value === canonicalOn) ? null : canonicalOn;
}

// Per-editable undo/redo; innerHTML is reassigned wholesale, so nothing may hold
// a node reference across a step.
const HISTORY_LIMIT = 100;
/* A DEPTH limit bounds the number of steps and nothing about their size, and a
   step is the whole innerHTML. One pasted `data:image/...` photo is megabytes of
   base64 that every later snapshot copies again — a hundred steps of a document
   holding a 5MB image is half a gigabyte of duplicated base64, and the tab dies.
   Neither the depth nor the image is wrong on its own; the product is. Counted in
   CHARACTERS, which for base64 is one per byte of the encoded picture and about
   two bytes of memory apiece. */
const HISTORY_CHAR_LIMIT = 16 * 1024 * 1024;

/* Oldest first, and never down to nothing: a single edit larger than the whole
   ceiling still leaves the one step that undoes it. A stack already inside both
   limits walks its own length and stops, which is the common case and why this
   sums rather than keeping a running total nothing else could invalidate. */
function _trimHistory(stack) {
  let chars = stack.reduce((n, step) => n + step.html.length, 0);
  while (stack.length > 1 && (stack.length > HISTORY_LIMIT || chars > HISTORY_CHAR_LIMIT)) {
    chars -= stack.shift().html.length;
  }
}
const _historyStacks = new WeakMap();
function _stacksFor(editable) {
  let s = _historyStacks.get(editable);
  if (!s) { s = { undo: [], redo: [] }; _historyStacks.set(editable, s); }
  return s;
}

// Absolute character offsets, the same terms as everything else in the engine —
// and they count stripZwsp text, so they agree with the html stored beside them
// by construction. An index path would be invalidated by any merge or split.
function _selectionOffsets(root) {
  const snap = Selection.snapshot();
  if (!snap || !root.contains(snap.startNode) || !root.contains(snap.endNode)) return null;
  return {
    root,
    startAbs: absOffsetOf(root, snap.startNode, snap.startOffset),
    endAbs: absOffsetOf(root, snap.endNode, snap.endOffset),
    collapsed: snap.collapsed,
  };
}

// Stores CONTENT, never editing artifacts, so undo can't resurrect a caret marker
// into a document with no session to own it.
const History = {
  snapshot(root) {
    return { html: stripZwsp(root.innerHTML), selection: _selectionOffsets(root) };
  },
  /* Any typing burst still on its timer is OLDER than what is being committed, so
     it goes on the stack first — here rather than at each caller, because here it
     cannot be forgotten. Not recursive: flushTypingHistory deletes its entry
     before calling back in. Before the no-change test, too: the burst is a real
     edit whether or not THIS commit turns out to be one. */
  commit(editable, entry) {
    if (!entry) return;
    flushTypingHistory(editable);
    if (stripZwsp(editable.innerHTML) === entry.html) return;   // nothing changed — not a real undo step
    const s = _stacksFor(editable);
    s.undo.push(entry);
    _trimHistory(s.undo);
    s.redo.length = 0;
  },
};

// Clicking a mark with just a caret arms it for what you type NEXT, via one
// placeholder at the caret that native typing fills in. `s.format` is the trusted
// state once armed, never re-derived from a DOM holding our own artifacts.
const CaretFormat = {
  _state: new WeakMap(),   // editable -> session { editable, format, placeholder }

  // State is per editable (a dock of sheets each keeps its own), but LIVENESS is
  // singular: the document has one selection, so arming a second editable ends
  // the first rather than leaving a marker nothing is watching.
  _live: null,

  _for(editable) {
    let s = this._state.get(editable);
    if (!s) { s = { editable, format: null, placeholder: null }; this._state.set(editable, s); }
    return s;
  },

  // format/placeholder are always both null or both set — a toggle that ends up
  // empty still needs a placeholder, since typing must escape the ambient mark.
  toggle(editable, block, offset, key, value = true) {
    const s = this._for(editable);
    // Arming needs the caret, and the caret is in one place: any other live
    // session is over by definition. End it here, or its marker outlives it.
    if (this._live && this._live !== s) this.end(this._live);
    this._live = s;
    const canonicalValue = canonicalMarkValue(key, value);

    // The session's own state is kept UNSETTLED: settled, a redundant `bold`
    // inside a heading would be dropped and the next click would turn it on
    // again. Only what gets RENDERED is settled, hence the block.
    s.block = block;

    if (!s.format) {
      const runs = flattenRuns(block);
      s.format = { ...marksAtOffset(runs, offset) };
      this._toggleKey(s.format, key, canonicalValue);
      this._insertFirst(block, runs, offset, s);
      return;
    }

    this._toggleKey(s.format, key, canonicalValue);
    this._insertNext(s);
  },

  _toggleKey(format, key, canonicalValue) {
    if (format[key] !== canonicalValue) { format[key] = canonicalValue; return; }
    if (VALUE_MARKS.has(key)) delete format[key]; else format[key] = false;   // as setMark
  },

  // Rebuilds the block through the same render pipeline every mark op uses, so
  // the marker can't land nested inside a wrapper it is meant to escape.
  _insertFirst(block, runs, offset, s) {
    const split = splitRunsAt(runs, offset);
    let pos = 0, insertIdx = split.length;
    for (let i = 0; i < split.length; i++) {
      if (pos === offset) { insertIdx = i; break; }
      pos += runLen(split[i]);
    }
    // Inside the wrapper the caret is in, so arming a mark mid-link and typing
    // continues THE LINK instead of splitting it in three.
    const before = split[insertIdx - 1];
    split.splice(insertIdx, 0, { text: ZWSP, marks: { ...s.format }, wrapper: (before && before.wrapper) || null });
    // NOT renderInto: no hoisting while a session is armed. A marker must express
    // its format absolutely, since _insertNext replaces it by direct DOM surgery
    // and never re-hoists. Runs already carry hoisted marks, so this renders the
    // same. settledRuns for the same reason, inside a heading.
    clearBlockMarks(block);
    block.replaceChildren(renderRuns(settledRuns(block, split)));
    s.placeholder = this._stabilize(_markerNodeIn(block));
    this._placeCaretAtEnd(s.placeholder);
  },

  // Later toggles in the same session: local only. Settles the current
  // placeholder (not retroactively) and starts a fresh one as a known sibling.
  _insertNext(s) {
    const old = s.placeholder;
    const parent = old.parentNode, nextSibling = old.nextSibling;
    this._settle(old);

    const marker = this._stabilize(wrapText(ZWSP, settledMarks(s.block, s.format)));
    if (old.isConnected) old.after(marker); else parent.insertBefore(marker, nextSibling);
    this._placeCaretAtEnd(marker);
    s.placeholder = marker;
  },

  // An empty mark-set renders as a bare text node, which the browser may split on
  // the next keystroke — so give it a stable <span> to track instead.
  _stabilize(node) {
    if (node.nodeType !== 3) return node;
    const wrap = document.createElement('span');
    node.replaceWith(wrap);
    wrap.appendChild(node);
    return wrap;
  },

  _placeCaretAtEnd(markerNode) {
    let textNode = markerNode;
    while (textNode.firstChild) textNode = textNode.firstChild;
    const r = document.createRange();
    r.setStart(textNode, textNode.length);
    r.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  },

  // deleteData, never `textContent = ...`: CharacterData methods are specified to
  // ADJUST live ranges, the Selection among them, while assigning textContent
  // replaces the data and collapses the selection.
  _settle(placeholderEl) {
    if (!placeholderEl.isConnected) return;   // already discarded by an unrelated rebuild
    let textNode = placeholderEl;
    while (textNode.firstChild) textNode = textNode.firstChild;
    if (textNode.nodeType === 3 && textNode.data.startsWith(ZWSP)) textNode.deleteData(0, ZWSP.length);
    if (!placeholderEl.textContent) { placeholderEl.remove(); return; }   // never typed into — pure artifact
    if (placeholderEl.nodeType === 1 && placeholderEl.tagName === 'SPAN' && !placeholderEl.getAttribute('style')) {
      while (placeholderEl.firstChild) placeholderEl.parentNode.insertBefore(placeholderEl.firstChild, placeholderEl);
      placeholderEl.remove();
    }
  },

  // A session lives only while the caret is inside its own marker. Driven by
  // selectionchange rather than key/mouse events, which are input DEVICES and
  // cannot see the caret LEAVE the editable — the case that matters most, since a
  // session left armed keeps a zero-width marker in what gets sent.
  syncToSelection() {
    const s = this._live;
    if (!s || !s.placeholder) return;
    const sel = window.getSelection();
    const node = sel && sel.rangeCount ? sel.getRangeAt(0).startContainer : null;
    if (node && (node === s.placeholder || s.placeholder.contains(node))) return;
    this.end(s);
  },

  // _live is cleared FIRST: _settle edits the DOM, which queues another
  // selectionchange, and clearing up front makes that re-entry a no-op.
  end(s) {
    if (!s) return;
    if (this._live === s) this._live = null;
    if (s.placeholder) this._settle(s.placeholder);
    s.placeholder = null;
    s.format = null;
  },
};

// ONE listener for the whole engine. selectionchange is a DOCUMENT event, so
// scoping is done by asking the live session whether the caret is still inside
// ITS marker, not by choosing where to listen.
let _caretWatched = false;
function watchCaretSelection() {
  if (_caretWatched) return;
  _caretWatched = true;
  document.addEventListener('selectionchange', () => CaretFormat.syncToSelection());
}

/* COMPOSITION. While an IME composition is open the BROWSER holds a claim on a
   range of the document and will replace it when the user picks a candidate, so
   anything that rewrites the DOM underneath — renderInto, an undo's innerHTML
   assignment, a history snapshot — leaves the IME re-inserting into a document
   that no longer matches what it measured. One answer, asked by both callers.

   Japanese and Korean are the obvious cases; Android is the important one, since
   its keyboards compose ordinary English in order to autocorrect it. */
const _composing = new WeakSet();
const _deferredCommand = new WeakMap();
const isComposing = editable => _composing.has(editable);

let _compositionWatched = false;
function watchComposition() {
  if (_compositionWatched) return;
  _compositionWatched = true;
  // Delegated on the document, like the caret watcher: composition events bubble.
  document.addEventListener('compositionstart', (e) => {
    const editable = _editableOf(e.target);
    if (!editable) return;
    _composing.add(editable);
    _openLineForComposition(editable);
  });
  document.addEventListener('compositionend', (e) => {
    const editable = _editableOf(e.target);
    if (!editable) return;
    _composing.delete(editable);
    // AFTER the commit, not during: a command clicked mid-composition applies to
    // a settled document, which is the only moment it can apply at all.
    const pending = _deferredCommand.get(editable);
    _deferredCommand.delete(editable);
    if (pending) editorFor(editable).exec(pending.name, pending.args);
    // The composed word is the text the line's direction depends on, and the
    // input handler skipped every event that carried it.
    settleTypedLine(editable);
    scheduleTypingFlush(editable);   // the burst held open across the word can close now
  });
}

/* An empty line holds a <br> and no text node, so a composition beginning there
   has nothing to compose INTO: the IME writes alongside the holder, and the first
   character is not part of what the candidate replaces — Korean typed into a new
   message came out "ㅎ한".

   An insertion BEFORE the holder, not a swap, so the line keeps a holder
   throughout and its address count is unchanged (an empty text node counts
   nothing, and the <br> is now trailing). */
function _openLineForComposition(editable) {
  const snap = Selection.snapshot();
  if (!snap || !snap.collapsed) return;
  // Already in a text node: nothing to do. This also covers an armed
  // caret-format marker, which IS a text node while the line looks empty.
  if (snap.startNode.nodeType === 3) return;
  const line = blockContaining(editable, snap.startNode);
  if (!line || _lineHasVisible(line) || _brCount(line) !== 1) return;
  const holder = line.querySelector('br');
  const text = document.createTextNode('');
  holder.parentNode.insertBefore(text, holder);
  const range = document.createRange();
  range.setStart(text, 0);
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

// The editable an event happened inside, or null. Node, not Element: a
// composition's target can be a text node.
function _editableOf(node) {
  const el = node && (node.nodeType === 1 ? node : node.parentElement);
  return el ? el.closest('[contenteditable]') : null;
}

// The engine's listeners, from ONE place, idempotent per editable. Every entry
// point that can CHANGE the document calls this first, so there is no setup call
// to forget; read-only ones do not.
function wireComposeEditor(editable) {
  wireComposeHistory(editable);   // beforeinput / input / blur
  watchCaretSelection();
  watchComposition();             // is the browser mid-edit?
  return editable;
}

// Located by the zero-width space that IS the marker. Returns its marks span, or
// the bare text node when it has none.
function _markerNodeIn(block) {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    if (n.data.includes(ZWSP)) return n.parentElement === block ? n : n.parentElement;
  }
  return block.lastChild;
}

// Anything reading the editable's HTML from outside (saving, sending) must call
// this first, or a session armed and never typed into leaves a stray marker.
function flushCaretFormat(editable) {
  CaretFormat.end(CaretFormat._state.get(editable));
}

// A session is over exactly when its placeholder didn't survive the command — so
// ASK afterwards rather than keeping a registry of which commands are destructive.
function reconcileCaretFormat(editable) {
  const s = CaretFormat._state.get(editable);
  if (s && s.placeholder && !s.placeholder.isConnected) CaretFormat.end(s);   // _settle no-ops on a detached marker
}

/* INLINE IMAGES are addressed by the SELECTION, never by a node the host passes
   in: an image occupies exactly one position, so "the selected image" is a range
   one wide. Undo then restores it still selected, and a resize sits on the stack
   beside every other edit.

   The atomic occupying `offset` — NOT via nodeAtOffset, which answers "where does
   a caret go": the end of `a` and the start of the image in <p>a<img>b</p> are
   both offset 1, and a caret there belongs in the text. */
function atomicAt(block, offset) {
  const walker = document.createTreeWalker(block, COUNTED_NODES, COUNTED_FILTER);
  let counted = 0, n;
  while ((n = walker.nextNode())) {
    const len = nodeLength(n);
    if (len && counted === offset) return n.nodeType === 3 ? null : n;
    counted += len;
    if (counted > offset) return null;
  }
  return null;
}

function selectedImage(selection) {
  if (!selection || selection.collapsed) return null;
  // One position wide, within one block: anything else is a selection that
  // happens to contain an image, not a selection OF one.
  if (selection.block !== selection.endBlock) return null;
  if (selection.endOffset - selection.startOffset !== 1) return null;
  const n = atomicAt(selection.block, selection.startOffset);
  return n && n.tagName === 'IMG' ? n : null;
}

// Gmail's presets and the pixel width a drag commits all resolve to one number.
// null means "state no width at all", which IS Original size.
const IMAGE_SMALL_PX = 200;

// Asked of the image's OWN LINE, not the editable: they differ wherever a line is
// indented or nested, above all in a table cell. Zero where there is no layout
// (jsdom, a compose not yet shown), and the caller falls back.
function _availableWidth(editable, img) {
  const host = blockContaining(editable, img) || editable;
  const cs = getComputedStyle(host);
  const inner = host.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
  return inner > 0 ? Math.round(inner) : 0;
}

function _imageWidth(editable, img, value) {
  if (value === 'original') return null;
  if (value === 'small') return IMAGE_SMALL_PX;
  if (value === 'fit') {
    const room = _availableWidth(editable, img);
    // NOT READY is not a value: naturalWidth reads 0 while the image is still
    // decoding, and sizing from that enlarged a 120px logo to fill the column.
    const known = img.complete && img.naturalWidth > 0;
    if (!known) return null;
    const natural = img.naturalWidth;
    // Never UPSCALE — the natural width is a ceiling, not just a fallback.
    return room ? Math.min(room, natural) : natural;
  }
  const px = Math.round(parseFloat(value));
  return px > 0 ? px : null;
}

// Width in BOTH places: Outlook reads the attribute and ignores the style, every
// other client prefers the style. Never a height — an explicit one alongside a
// width the reader's own max-width has clamped is exactly how a resized image
// arrives stretched. Omitted, the aspect ratio holds by itself.
function _sizeImage(editable, img, value) {
  const px = _imageWidth(editable, img, value);
  img.removeAttribute('height');
  img.style.height = '';
  if (px === null) { img.removeAttribute('width'); img.style.width = ''; }
  else { img.setAttribute('width', String(px)); img.style.width = `${px}px`; }
  _dropEmptyStyle(img);
}

const Commands = {
  // ONE command for every mark in MARK_KEYS. args = { key, value }.
  mark(ctx, { key, value = true }) {
    const { selection } = ctx;
    if (!selection) return;
    if (selection.collapsed) {
      watchCaretSelection();
      CaretFormat.toggle(ctx.editable, selection.block, selection.startOffset, key, value);
      ctx.skipRestore = true;   // CaretFormat placed the caret itself
      return;
    }
    // Decide from the WHOLE selection, then apply per block — toggling each block
    // on its own would make a mixed selection alternate line by line.
    const segments = selectionSegments(selection);
    if (!segments.length) return;
    const runsFor = segments.map(seg => flattenRuns(seg.block));
    const state = combineStates(segments.map((seg, i) => analyze(runsFor[i], seg.startOffset, seg.endOffset)))[key];
    const next = nextMarkValue(state, canonicalMarkValue(key, value));
    segments.forEach((seg, i) => {
      renderInto(seg.block, setMark(runsFor[i], seg.startOffset, seg.endOffset, key, next));
    });
  },

  // args = { value } — CSS text-align value.
  align(ctx, { value }) {
    resolveBlocks(ctx.selection).forEach(b => alignBlock(b, value));
  },
  /* args = { value } — 'rtl', 'ltr', or anything else to clear it.

     The ATTRIBUTE, not a declaration and not the `direction` mark: dir is what a
     mail client and a screen reader read, it isolates so a line's direction
     cannot leak into its neighbour, and LINE_ATTRS already carries it through
     every command that rebuilds a line. Alignment follows for free. */
  direction(ctx, { value }) {
    // Anything else CLEARS to auto rather than removing the attribute, which
    // would make the line inherit. It is also the only way back from a stated
    // direction.
    const dir = DIR_STATED.test(value || '') ? value : 'auto';
    resolveBlocks(ctx.selection).forEach(b => b.setAttribute('dir', dir));
  },

  /* args = { dir } — 1 (indent) or -1 (outdent). DEPTH IS STRUCTURE: indenting
     wraps a level, outdenting lifts out of the innermost one, and a quote is
     simply a level that draws a bar. Inside a list depth is nesting instead, so
     items take the other road.

     A margin is nobody's level — it arrives on a pasted or adopted line and has
     no container to leave — so outdent still walks one back for a line that has
     one and nothing to lift out of. */
  indent(ctx, { dir }) {
    const lines = resolveBlocks(ctx.selection);
    const items = lines.filter(b => b.tagName === 'LI');
    const blocks = lines.filter(b => b.tagName !== 'LI');
    items.forEach(b => nudgeItemDepth(ctx.editable, b, dir));
    if (!blocks.length) return;
    if (dir > 0) {
      // Coverage is asked of the WHOLE selection, items included: a quote holding
      // a list is covered when its items are, whichever road they took.
      const covered = new Set(lines);
      _perBox(ctx.editable, blocks).forEach(g => indentBlocks(ctx.editable, g, covered));
      return;
    }
    /* One liftFrom for all of them, because it splits each container around the
       lines that are leaving it; line by line would shred one quote into a quote
       per line. */
    const leaving = blocks.filter(b => _containerOf(ctx.editable, b, isQuote));
    if (leaving.length) liftFrom(ctx.editable, leaving, isQuote);
    const left = new Set(leaving);
    blocks.forEach(b => { if (!left.has(b)) nudgeIndent(b, dir); });
  },
  // args = { tag } — 'ul' or 'ol'. Takes LINES and finds its own container, so it
  // acts on the items the selection covers: un-listing two of five leaves three.
  list(ctx, { tag }) {
    _perBox(ctx.editable, resolveBlocks(ctx.selection))
      .forEach(group => toggleListBlocks(ctx.editable, group, tag));
  },
  blockquote(ctx) {
    _perQuote(ctx.editable, resolveBlocks(ctx.selection))
      .forEach(group => quoteBlocks(group));
  },

  /* Inline marks go everywhere the selection touches; DEPTH — the indent and the
     containers holding it — goes only for lines covered END TO END, so half a
     quoted line loses its marks without being unquoted. That rule is also what
     makes "clear the last few list items" work.

     ALIGNMENT is the exception, and sides with the marks: half a line cannot be
     centred, so there is no half-answer to give. Reach into a line at all and its
     alignment goes with it — measured in Gmail, which un-centres a whole line
     from a two-character selection inside it. */
  clearFormat(ctx) {
    const segments = selectionSegments(ctx.selection);
    segments.forEach(seg => {
      /* The LINK goes too, and it takes two calls because a link is not a mark:
         it is the run's wrapper, which clearMarks carries through untouched.
         setWrapper on the INSIDE for both of its differences — it reaches atomics
         (an image cannot be bold but can certainly be a link), and it does not
         merge, so nesting it this way puts clearMarks' mergeRuns last and the
         freed text collapses into one run. Deliberately NOT Gmail, which leaves
         links alone here. */
      const unlinked = setWrapper(flattenRuns(seg.block), seg.startOffset, seg.endOffset, null);
      renderInto(seg.block, clearMarks(unlinked, seg.startOffset, seg.endOffset));
    });
    segments.forEach(seg => { seg.block.style.textAlign = ''; _dropEmptyStyle(seg.block); });
    const whole = segments.filter(seg => seg.full).map(seg => seg.block);
    whole.forEach(clearBlockLayout);
    /* The LIST goes unconditionally: BEING an item is the line's own formatting,
       worn on the line itself, so a covered line stops being one whether or not
       the items around it are going too.

       An INDENT goes unconditionally too, for the same reason the list does:
       clearing formatting clears indentation, and a level with no bar says
       nothing about the lines it does not hold.

       A QUOTE is not the line's — it is one piece of formatting shared by every
       line inside it, and one line has no standing to answer for the rest. So it
       comes off only when the selection covers the whole of it. Gmail's rule:
       clear a single quoted list item there and it is un-listed but still quoted.

       Two passes and not one predicate, because the list pass REPLACES each <li>
       with a block — coverage asked before it would be asked of lines that no
       longer exist. Unwrapping replaces nothing, so this set stays good. */
    const lines = flattenOut(ctx.editable, whole, isList);
    const covered = new Set(lines);
    flattenOut(ctx.editable, lines, el => isIndentBox(el)
      || (isQuote(el) && _linesInOrder(el).every(line => covered.has(line))));
  },

  /* args = { action: 'size' | 'alt' | 'remove', value }.
       size   — 'small' | 'fit' | 'original', or a pixel number (a drag's commit)
       alt    — the alt text; '' is a real answer (a decorative image) and is kept
       remove — deletes it and leaves the caret where it stood

     ONE command for all three so each is one undo step. A drag must therefore
     preview live and call this ONCE on release — a call per mousemove would put
     sixty entries on the stack for one gesture. */
  image(ctx, { action, value }) {
    const img = selectedImage(ctx.selection);
    if (!img) return;
    if (action === 'size') { _sizeImage(ctx.editable, img, value); return; }
    if (action === 'alt') { img.setAttribute('alt', value == null ? '' : String(value)); return; }
    if (action !== 'remove') return;

    const line = blockContaining(ctx.editable, img);
    img.remove();
    // Through the normal render, so the <span> or <a> the image sat in goes with
    // it instead of being left behind empty.
    if (line) {
      renderInto(line, flattenRuns(line));
      if (!line.firstChild) line.appendChild(document.createElement('br'));   // a blank line is still a line
    }
    // The image's own position, now collapsed: the transaction would otherwise
    // restore a one-wide selection over content that is one shorter.
    ctx.skipRestore = true;
    Selection.restore({ ...ctx.selection, endAbs: ctx.selection.startAbs, collapsed: true });
  },

  // args = { html, text } — straight off the clipboard. See sanitizePaste.
  paste(ctx, { html, text }) {
    if (!ctx.selection) return;
    // An empty clipboard is not an empty LINE: _textToFragment turns '' into one
    // block holding a <br>, which would land in the document as a stray break.
    if (!html && !text) return;
    _insertFragment(ctx, html ? sanitizePaste(html) : _textToFragment(text));
  },

  /* args = { html, replace } — the app's OWN markup: a signature, a template, a
     picture chosen from a dialog. A clipboard is hostile and a signature is not,
     so this arrives through the door adoptComposeBody uses rather than the paste
     sweep, and keeps the class, id and data-* a signature has to be FINDABLE by
     afterwards — all three of which paste strips, correctly, by design.

     `replace` is a selector, and what it matches is WHERE the new markup goes.
     That is what makes changing a signature a change, rather than a second one
     appearing wherever the caret happened to be. Being a command rather than a
     host writing into the DOM, it is also one undo step — a swap done by hand is
     on no stack at all, and the next undo silently takes it away. */
  /* The one command with a sensible answer when there is NO caret in the body,
     and the one most likely to be asked without one: the user picks a signature
     from a dropdown, so the live selection is in the dropdown. Both branches below
     stand on their own — a swap needs no caret at all, and an insertion with
     nowhere to land goes where a signature goes, at the end of the message. */
  insertBlocks(ctx, { html, replace }) {
    if (!html) return;
    const editable = ctx.editable;
    const frag = _trustedFragment(editable, html);
    const old = replace ? editable.querySelector(replace) : null;
    if (!old) {
      if (ctx.selection) _insertFragment(ctx, frag);
      else _appendBlocks(editable, frag);
      return;
    }

    /* A SWAP is a block operation and not a caret one: the new markup goes exactly
       where the old markup stood, and no line is split to make room. Routed
       through the caret path it would need a line to stand on, and BOTH halves of
       that line survive a unit landing between them — the empty head above and the
       empty tail below — so the message grew by a blank line every time the
       signature changed. The two share the settling and nothing else. */
    const first = frag.firstChild, last = frag.lastChild;
    if (!last) return;
    old.replaceWith(frag);
    _settleLanded(editable, first, last);
  },

  undo(ctx) { _travelHistory(ctx, 'undo', 'redo'); },
  redo(ctx) { _travelHistory(ctx, 'redo', 'undo'); },
};

/* WHERE CONTENT LANDS, for every door that brings some in. Paste and insertBlocks
   differ in exactly one thing — how far the source is trusted, and therefore how
   it was cleaned — and neither has any business also knowing how content is
   placed. Split the caret's line, drop the new lines between the halves, rejoin
   the ends: a single word needs no special case, it splits and rejoins into one
   line again. */
function _insertFragment(ctx, frag) {
  const editable = ctx.selection.root;
  const first = frag.firstChild, last = frag.lastChild;   // insertion empties the fragment
  if (!last) return;

  const range = _rangeFrom(ctx.selection.snap);
  _deleteRange(editable, range);

  const head = blockContaining(editable, range.startContainer);
  if (!head) return;
  if (head.tagName === 'LI') _asListItems(frag);   // else they land as invalid non-<li> children

  const tail = _splitLineAt(head, range);
  head.after(frag);
  /* The new content's first line CONTINUES the head and its last absorbs the tail
     — but only when there IS something to continue. Joining an empty head turns
     the arriving line into the caret's line and discards its block identity: its
     tag and its block-level styling both.

     Kept, not removed, when what arrives STARTS with a unit. A table flush against
     the top of the document is a wall: nothing can make a line above it, so a
     signature pasted into an empty message would own the top of it. An empty line
     there is what Gmail leaves, and it is free — this branch only runs when the
     caret was on a blank line to begin with. */
  if (_lineHasContent(head)) _joinLines(head, first);
  else if (first.nodeType === 1 && isUnit(first)) {
    if (!_lineRenders(head)) head.appendChild(document.createElement('br'));
  } else head.remove();
  const end = last.isConnected ? last : head;

  /* As an absolute offset, since the re-render below detaches these nodes, and
     via the edge LINE — when the content ends in a list, `end` is the <ul>, which
     has no offset of its own.

     Inside the last LINE of what arrived, which is right for a list. WRONG for a
     unit: you paste a signature and carry on below it, not inside its last cell.
     `tail` is the remainder of the caret's own line and already sits after the
     new content, so it is the landing. */
  let caretAt;
  if (isUnit(end) && isLineEl(tail)) {
    if (!_lineRenders(tail)) tail.appendChild(document.createElement('br'));
    caretAt = { node: tail, offset: 0 };
  } else {
    caretAt = _endOf(_edgeLine(editable, end, true) || end);
  }
  const caretAbs = absOffsetOf(editable, caretAt.node, caretAt.offset);
  _joinLines(end, tail);   // no-ops when `end` is not a line — see there

  _settleLanded(editable, head, end);
  ctx.skipRestore = true;   // the transaction's offsets predate the insertion
  Selection.restore({ root: editable, startAbs: caretAbs, endAbs: caretAbs, collapsed: true });
}

// What has to be made true again once new content is in the document, however it
// got there — at a caret, or in place of a node it replaced.
/* Where content goes when there is no caret to put it at. The end of the message
   and not the start: a signature is the one thing inserted without one, and that
   is where a signature belongs. No line is split, so this needs no range — which
   is the whole reason it can run when the selection is somewhere else. */
function _appendBlocks(editable, frag) {
  const first = frag.firstChild, last = frag.lastChild;
  if (!last) return;
  editable.appendChild(frag);
  _settleLanded(editable, first, last);
}

function _settleLanded(editable, from, to) {
  normalizeBlocks(editable);
  const landed = _linesTouching(editable, from, to);
  settleDirection(editable, landed);
  shedNaturalAlign(landed);
  // Every READ first, then every WRITE. flattenRuns asks getComputedStyle and
  // renderInto mutates, so alternating them makes each read force a fresh style
  // recalculation of everything the previous write dirtied — n lines costing n
  // recalcs of an n-line document. Runs are plain values and cannot go stale.
  const touched = landed.map(b => [b, flattenRuns(b)]);
  touched.forEach(([b, runs]) => renderInto(b, runs));
}

/* PASTE needs no converter: activeMarksAt reads COMPUTED style, so <b>, <font
   color>, a Word class and an inline style all resolve to the same marks once the
   content is IN the document. Paste is sanitize -> insert ->
   renderInto(flattenRuns()), and that last step is what every mark command does. */

// The tags that survive paste as themselves; everything else keeps its CONTENT
// and loses only the tag. No DIV — a pasted <div> is a LINE, and keeping the tag
// would leave the document with two kinds of line. HR is here because a void
// element unwrapped is a void element deleted.
const PASTE_BLOCK_TAGS = new Set(['P', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'HR',
  ...TABLE_TAGS, ...CELL_TAGS]);
const PASTE_TAGS = new Set([...PASTE_BLOCK_TAGS, ...INLINE_MARK_TAGS]);
// Tags that exist ONLY to carry style — <b> means bold by itself, <span> means
// nothing by itself.
const MARKLESS_TAGS = new Set(['SPAN', 'FONT']);
const PASTE_BLOCK_SELECTOR = [...PASTE_BLOCK_TAGS].join(',');

/* How the source laid the element out — nothing at the far end can re-derive any
   of it. ONE set, subtracted per role below rather than a list per kind of
   element, which works because a declaration stays on the element that carried
   it. Longhands only: a shorthand emitted alongside its longhands states both,
   and `margin` would smuggle a margin-left past the indent command's guard.

   The keep-list and the VALUE test are one table, because being kept earns a
   property nothing — clipboard HTML is a computed style dump, so most of what
   arrives is a page writing out the default it was already getting. Two lists
   would drift silently both ways. */
// The physical four only. `start` stays off on purpose even though
// shedNaturalAlign writes it: arriving from OUTSIDE it is the initial value and
// says what silence says; written from inside it is this engine's own spelling of
// a value it just read, and is never offered to the sweep.
const ALIGN_VALUES_KEPT = /^(left|center|right|justify)$/;
const CSS_LENGTH = /^-?[\d.]+(px|em|rem|ex|pt|%)$/;
const FLOW_DISPLAY = /^(flex|grid)$/;
// Transparent never says anything. White depends on WHAT is wearing it: on a run
// it is the page's body colour riding in on a computed-style dump, a solid slab
// in a dark-themed reader; on a CONTAINER a white card on a grey page is white on
// purpose. Hence two tests.
const TRANSPARENT_BG = /^(transparent|rgba\(0, 0, 0, 0\))$/i;
const WHITE_BG = /^(white|#fff(fff)?|rgba?\(255, 255, 255(, 1)?\))$/i;
// Container-shaped: a cell or table part by tag (never a line), or a wrapper that
// holds only blocks. Asked of the source's shape, before the sweep has decided
// anything, which is the same question _looksLikeBox asks a moment later.
const _wearsItsOwnBackground = el => isCell(el) || isTablePart(el) || _holdsOnlyBlocks(el);

const _hasWidth = el => CSS_LENGTH.test(el.style.width) || CSS_LENGTH.test(el.style.maxWidth);
// border-box changes nothing unless there is padding or a border for the width to
// absorb. Asked through the same table, so an edge that renders as nothing
// (`padding: 0px`, `medium none currentcolor`) doesn't count as one.
const EDGE_PROPS = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTop', 'borderRight', 'borderBottom', 'borderLeft'];
const _hasEdge = el => EDGE_PROPS.some(p => el.style[p] && _usableStyleValue(el, p, el.style[p]));

// A real length and nothing else. `auto` is the initial value and a zero is what
// the element does anyway — `min-width: 0` and `margin-top: 0px` are the two most
// common declarations in a computed-style dump and neither says anything.
const _size = v => CSS_LENGTH.test(v) && parseFloat(v) !== 0;

/* ...except on a RULE, the one element whose UA style is not nothing: the sheet
   gives an <hr> `margin-inline: auto` and a 1px inset border, so `border: 0` and
   `margin: 0` are instructions there and not silence. Dropped for saying nothing,
   they put back a groove box around the 1px line a template drew, and re-centred
   a rule the source had pushed to one side. Same rule as _pad's cell exception,
   and the same reason: what a zero MEANS depends on what it is overriding.

   This is also the shape jsdom cannot show. `border: 0` resolves to `0px` there
   and to `0px none rgb(0, 0, 0)` in every real engine, so without this the suite
   would stay green while all three browsers dropped the declaration — the exact
   failure _sanitizeAttrs documents. */
const _edgeSize = (v, el) => isRule(el) || _size(v);

// Zero padding is noise on most elements — a computed-style dump states it on
// everything — but on a CELL it is a statement: cellpadding="0" is on every
// table an email contains, and without it the UA's own 1px comes back at each of
// the dozen-odd levels a campaign nests.
const _pad = (v, el) => (parseFloat(v) === 0 ? isCell(el) && CSS_LENGTH.test(v) : _size(v));

/* Vertical padding on a box of ZERO HEIGHT is never spacing — it is the
   aspect-ratio placeholder every news CMS wraps a lazy-loaded image in:

     <div style="position:relative;padding-bottom:62.5%;height:0">
       <img style="position:absolute;top:0;left:0;width:100%">

   Neither the position nor the height survives the paste, so the padding alone
   lands as a column of blank space under the picture. `height: 0` is the tell and
   the UNIT is not — a CMS that knows its aspect ratio writes the reserve in
   pixels. Horizontal padding is left alone: a gutter is a real gutter. */
const _reservesSpace = el => parseFloat(el.style.height) === 0;
const _padSide = side => (v, el) =>
  (/^[tb]/.test(side) && (v.trim().endsWith('%') || _reservesSpace(el)) ? false : _pad(v, el));

// A single url(), nothing else, held to SAFE_IMG_SRC like an <img src>. The
// character class does the real work: barring quotes, parens, commas and
// whitespace means a second layer cannot hide behind the first — a looser match
// reads `url("https://ok"), url("javascript:…")` as starting with https.
const BG_URL = /^url\(\s*["']?([^"'(),\s]+)["']?\s*\)$/i;
function _safeBackgroundImage(value) {
  const m = BG_URL.exec(String(value).trim());
  return !!m && SAFE_IMG_SRC.test(m[1]);
}
// Centring — the whole of it, since text-align cannot centre a block. It needs
// something to centre AGAINST, or it renders as nothing and leaves an `auto` in
// the indent state that the indent command cannot parse. A <div> needs a declared
// width; a TABLE and an IMG are shrink-to-fit and already have one.
const _centresItself = el => el.tagName === 'TABLE' || el.tagName === 'IMG' || _hasWidth(el);
const _sideMargin = (v, el) => (v === 'auto' ? _centresItself(el) : _edgeSize(v, el));
// `medium none currentcolor` is how a page writes "no border" — which is silence
// everywhere but on a rule. See _edgeSize, and _noBar for the one exception.
const _border = (v, el) => isRule(el) || !/\bnone\b/.test(v);

/* The exception. Silence is not neutral on a BLOCKQUOTE: decorate draws our
   quote bar onto one that declares no border of its own, so dropping `none` as
   a no-op turns the sender's INDENTATION into a quote. Gmail writes every indent
   level as `border: none`, which makes this the common case and not a corner.

   By its LONGHAND name because the shorthand does not answer: measured in
   Chrome, `border: none` leaves `style.borderLeft` empty — a shorthand only
   reconstructs when every part of it is set — while `style.borderLeftStyle`
   reads `none`. jsdom answers the shorthand, so a unit suite cannot see this. */
const _noBar = (v, el) => v === 'none' && isQuote(el);
// How a flex container lays its children out, which is nothing at all anywhere
// else — a `gap` kept on a <span> is a declaration that can never apply.
const _flexProp = (v, el) => GEOMETRY_POLICY.display(el.style.display, el);

const GEOMETRY_POLICY = {
  // Only over block children: on a line, `display: flex` makes a flex item of
  // every span. An IMAGE has no children, and `display: block` is in every
  // template written — an inline image sits on the BASELINE, descender gap and all.
  display: (v, el) => (el.tagName === 'IMG'
    ? v === 'block'
    : (FLOW_DISPLAY.test(v) && _holdsOnlyBlocks(el)) || _isButtonBox(el, v)),
  float: v => /^(left|right)$/.test(v),
  // Modern pages set border-box on everything, so unguarded this lands on every
  // element that arrives. Where a width and an edge make it MEAN something it is
  // worth the bytes: a 566px card renders 36px wider without it.
  boxSizing: (v, el) => v === 'border-box' && _hasWidth(el) && _hasEdge(el),
  width: _size, maxWidth: _size, minWidth: _size, height: _size,
  // A campaign's hero is an IMAGE behind a coloured cell; dropping it left the
  // fallback bgcolor showing alone, a black rectangle. Gradients are not included.
  backgroundImage: _safeBackgroundImage,
  // Inert on their own — without an image there is nothing to size or place.
  backgroundSize: v => v !== 'auto', backgroundPosition: v => !!v, backgroundRepeat: v => !!v,
  // How a cell aligns its content in the row. `baseline` is the initial value.
  verticalAlign: v => v !== 'baseline',
  marginTop: _edgeSize, marginRight: _sideMargin, marginBottom: _edgeSize, marginLeft: _sideMargin,
  paddingTop: _padSide('top'), paddingRight: _pad,
  paddingBottom: _padSide('bottom'), paddingLeft: _pad,
  borderTop: _border, borderRight: _border, borderBottom: _border, borderLeft: _border,
  borderLeftStyle: _noBar,
  /* The logical spellings of the four sides above, judged by the same tests. Not
     for anything arriving from outside — nothing out there writes these — but for
     what leaves by the CLIPBOARD, which carries the live DOM and so still speaks
     logically: unlisted, a quote copied out of this editor would be swept of the
     bar it was copied for, and an indent of the `none` that names it one. */
  marginInlineStart: _sideMargin, marginInlineEnd: _sideMargin,
  paddingInlineStart: _pad, borderInlineStart: _border,
  borderInlineStartStyle: _noBar,
  // Every table in every campaign sets these, against the UA's own spacing at each
  // of the dozen-odd levels a template nests. Zero is meaningful, hence not _size.
  borderCollapse: v => v === 'collapse',
  borderSpacing: v => CSS_LENGTH.test(v),
  flexDirection: _flexProp, flexWrap: _flexProp, alignItems: _flexProp,
  justifyContent: _flexProp, gap: _flexProp,
};
const GEOMETRY_PROPS = Object.keys(GEOMETRY_POLICY);

/* PAINT changes how a box LOOKS and can move, resize or reflow nothing — the
   whole of the rule, and what earns this group its permissive default. GEOMETRY
   can shove the caret's own box around, so every entry there carries a reason;
   TYPOGRAPHY reflows text, which is why line-height is not here.

   NOT here deliberately: `outline`, which templates write as `outline: none` on
   images, and the text-decoration longhands, which would fight the shorthand the
   mark model owns. */
// Any corner rounded at all. `_border` cannot ask this — it tests for the word
// `none`, where a radius spells nothing `0`. Not CSS_LENGTH either: `8px 8px 0 0`
// is a header cell with two rounded corners.
const _rounded = v => /[1-9]/.test(v);
const PAINT_POLICY = {
  borderRadius: _rounded,
  // A card's lift and a button's depth. `none` is the initial value.
  boxShadow: v => v !== 'none', textShadow: v => v !== 'none',
  // A computed-style dump writes `opacity: 1` on everything, and it means nothing.
  opacity: v => parseFloat(v) < 1,
  // Only nowrap, which decides where a line MAY break and nothing else.
  // `pre`/`pre-wrap` change what the source whitespace MEANS, and
  // _hardenLineBreaks has already turned those newlines into real <br>s.
  whiteSpace: v => v === 'nowrap',
};
const PAINT_PROPS = Object.keys(PAINT_POLICY);

// Typography the engine has no control for but a design depends on: a 60px
// headline set on a 57px line is TIGHTER than the 1.2 a browser assumes, and
// `line-height: 1px` on a cell is how a template kills the descender gap under an
// image. `normal` says exactly what silence says.
const TYPOGRAPHY_POLICY = {
  lineHeight: v => v !== 'normal',
  letterSpacing: v => v !== 'normal',
  // The one kind of styling whose loss changes the WORDS: a template writes its
  // button labels in ordinary case and sets them in caps from the style sheet.
  textTransform: v => v !== 'none',
  fontVariant: v => v !== 'normal',
  // BOTH directions, not rtl alone: once paste GUESSES a direction for lines that
  // state none, `ltr` stops being silence and becomes the author saying "do not
  // guess". The noise that used to justify dropping it is handled downstream by
  // _wireDirections, which states a direction only where it differs.
  direction: v => DIR_STATED.test(v),
};
const TYPOGRAPHY_PROPS = Object.keys(TYPOGRAPHY_POLICY);

/* The MARKER, which only a list has: without it a footer link column written as
   `list-style-type: none` arrives wearing bullets nobody asked for.

   The value to drop is the DEFAULT, and which value that is depends on the LIST
   rather than the property: `disc` says nothing on a <ul> and something on an
   <ol>. list-style-image is not here — it is a url() and would need the same gate
   _safeBackgroundImage is. */
const _defaultMarker = el => (el.tagName === 'OL' || el.closest('ol') ? 'decimal' : 'disc');
const LIST_POLICY = {
  listStyleType: (v, el) => v !== _defaultMarker(el),
  // `outside` is the initial value and says exactly what silence says.
  listStylePosition: v => v === 'inside',
};
const LIST_PROPS = Object.keys(LIST_POLICY);

// `normal` states what an element already does — unless something above it says
// otherwise. It arrives constantly because the `font` shorthand RESETS both and
// CSSOM expands it faithfully. The element's own TAG counts and has to:
// <b style="font-weight: normal"> is how Docs wraps an entire copied document.
const STATED_NORMAL_WEIGHT = /^(normal|400)$/;
// TH for the same reason a heading is here: bold by the UA stylesheet, and
// campaigns write `font-weight: normal` on button cells precisely to undo that.
const BOLD_TAGS = /^(B|STRONG|H[1-6]|TH)$/;
const ITALIC_TAGS = /^(I|EM)$/;
const _isItalic = v => v === 'italic' || v === 'oblique';
// Its own tag, then every ancestor's tag and declaration — the element's OWN
// declaration is the one being judged, so it is not consulted.
const _renderedAround = (el, tags, prop, says) => {
  if (tags.test(el.tagName)) return true;
  for (let up = el.parentElement; up; up = up.parentElement) {
    if (tags.test(up.tagName) || says(up.style[prop])) return true;
  }
  return false;
};

// The same table over the non-geometry properties that need a value test:
// alignment, and the MARK_PROPS a computed-style dump ruins.
const STYLE_POLICY = {
  fontWeight: (v, el) => !STATED_NORMAL_WEIGHT.test(v)
    || _renderedAround(el, BOLD_TAGS, 'fontWeight', isBoldWeight),
  fontStyle: (v, el) => v !== 'normal' || _renderedAround(el, ITALIC_TAGS, 'fontStyle', _isItalic),
  // start/end is the INITIAL value, so it says exactly what no declaration says,
  // in both directions; Word-engine clients ignore it anyway.
  textAlign: v => ALIGN_VALUES_KEPT.test(v),
  // Transparent always goes; white goes only off a run or a line, where nobody
  // meant white-on-white. See TRANSPARENT_BG/WHITE_BG.
  backgroundColor: (v, el) => !TRANSPARENT_BG.test(v)
    && (!WHITE_BG.test(v) || _wearsItsOwnBackground(el)),
  ...PAINT_POLICY,
  ...GEOMETRY_POLICY,
  ...TYPOGRAPHY_POLICY,
  ...LIST_POLICY,
};

// A mark with no entry above is kept as-is: the mark model owns its values, and
// paste is not the place to second-guess a colour or a font.
function _usableStyleValue(el, prop, value) {
  const policy = STYLE_POLICY[prop];
  return policy ? policy(value, el) : true;
}

// The only style properties that survive A PASTE — the mark model, alignment and
// the three groups above. Derived, so a new mark extends paste for free and
// nothing the engine can't express can ride in. The OTHER door, adoptComposeBody,
// has its own narrower policy: it never runs this.
const PASTE_STYLE_PROPS = [...MARK_PROPS, 'textAlign',
  ...PAINT_PROPS, ...GEOMETRY_PROPS, ...TYPOGRAPHY_PROPS];

// A list's own indent is the LIST's job (our stylesheet's padding-left), so a
// margin-left on the <ul> would stack on ours and indent twice. The marker
// properties come through HERE and nowhere else.
const PASTE_LIST_STYLE_PROPS = [...PASTE_STYLE_PROPS.filter(p => p !== 'marginLeft'),
  ...LIST_PROPS];
const _isListPart = el => isList(el) || el.tagName === 'LI';

// An image's size is part of its CONTENT: dropping it renders a CSS-sized image
// at its natural pixel size, which is how a 1.2em emoji arrives as a 72px one.
const PASTE_IMG_STYLE_PROPS = PASTE_STYLE_PROPS;

// What makes a wrapper worth keeping: it CARRIES something. A page nests a dozen
// layout divs around one paragraph, and keeping those would fill the document
// with containers that render as nothing and wall off every command.
const BOX_SIGNALS = ['border', 'borderTop', 'borderRight', 'borderBottom', 'borderLeft',
  'borderRadius', 'background', 'backgroundColor', 'padding', 'paddingTop', 'paddingRight',
  'paddingBottom', 'paddingLeft', 'maxWidth', 'width'];

// Whether the SOURCE rendered this as a block; a page styles a <span> as one
// routinely. Never an <img>: `display: block` there means "sits on its own line",
// not "is a line", and promoting it moves the image out of the <a> wrapping it.
const _rendersAsBlock = el =>
  el.nodeType === 1 && el.tagName !== 'IMG'
  && (BLOCK_DISPLAY.test(el.style.display) || !INLINE_TAGS.has(el.tagName));

// Blocks and nothing else. Layout whitespace between them doesn't count — it is
// stripped later, and a newline in the source markup must not decide this.
function _holdsOnlyBlocks(el) {
  const kids = [...el.childNodes].filter(n => !(n.nodeType === 3 && !n.textContent.trim()));
  return kids.length > 0 && kids.every(_rendersAsBlock);
}

// A foreign wrapper kept as a container instead of flattened into lines. A flow
// display is a signal in its own right, and cannot sit in BOX_SIGNALS (tested for
// presence): `display: flex` is the only thing holding the children side by side,
// and no child can express it.
const _looksLikeBox = el => !PASTE_BLOCK_TAGS.has(el.tagName)
  && _holdsOnlyBlocks(el)
  && (BOX_SIGNALS.some(prop => el.style[prop]) || FLOW_DISPLAY.test(el.style.display));

// Which of the three lists an element is swept against. ITERATED, not queried —
// see _sanitizeAttrs — so these stay arrays, and their order is the order a swept
// element states its style in.
function _styleProps(el) {
  if (el.tagName === 'IMG') return PASTE_IMG_STYLE_PROPS;
  return _isListPart(el) ? PASTE_LIST_STYLE_PROPS : PASTE_STYLE_PROPS;
}
// style is filtered separately; all else goes. A cell's span is layout no style
// can express.
const SPAN_ATTRS = ['colspan', 'rowspan'];
/* A RULE keeps its own five, and is the one element whose presentational
   attributes are NOT translated to CSS. Measured in all three engines: each is
   honoured natively and resolves to exactly the declarations a translation would
   have written, so translating says the same thing twice in more bytes.

   Safe HERE and nowhere else because the engine never rebuilds a rule — the usual
   reason to convert an attribute is that a rebuild loses it. Our own
   `* { margin: 0 }` reset does kill the UA margins `align` works through, so
   style.css restores them for compose. */
const RULE_ATTRS = ['size', 'color', 'noshade', 'width', 'align'];
const PASTE_ATTRS = {
  A: ['href'], IMG: ['src', 'alt', 'width', 'height'],
  TD: SPAN_ATTRS, TH: SPAN_ATTRS, HR: RULE_ATTRS,
};

// Kept only when it says something: 1 is the default, and anything absurd is a
// worse guess than letting the row lay itself out.
const SPAN_LIMIT = { colspan: 1000, rowspan: 65534 };   // the HTML parser's own caps
function _clampSpan(el, attr) {
  const n = parseInt(el.getAttribute(attr), 10);
  if (n > 1) el.setAttribute(attr, String(Math.min(n, SPAN_LIMIT[attr])));
  else el.removeAttribute(attr);
}

// http: is refused alongside the dangerous schemes — not for privacy (the sender
// chose to paste it) but because a plain-http image is blocked as mixed content
// by most webmail clients, so it would arrive broken anyway. cid: is the
// message's own attachment and data: carries its bytes inline.
const SAFE_IMG_SRC = /^(https:|cid:|data:image\/)/i;

/* UPGRADED, not refused: `//cdn/logo.png` is the same file as the https one,
   addressed the way the page hosting it happened to be. Nearly every signature
   generator writes one, so the https rule alone deleted the photo and all six
   social icons out of a pasted signature.

   NOT done for background-image: the style guards are boolean gates over a value
   the caller keeps verbatim, so there is nowhere to put a rewritten URL. */
/* A CEILING on an INLINED one. A `data:` src carries the whole picture inside the
   document, so it is copied again by every history snapshot, every draft save and
   every clipboard export — and past a certain size no mail server would carry the
   message anyway. Only data:, because an https: src is an address whose length
   says nothing about the picture behind it. Generous on purpose: a screenshot is
   the ordinary case and dropping one would be the worse bug. */
const MAX_INLINE_IMG = 8 * 1024 * 1024;   // base64 characters, ~6MB of picture

/* Over the ceiling it is the ADDRESS that fails, which the caller already knows
   what to do with: the <img> keeps its alt and its size and paints as a
   placeholder, so an image too big to send is visible and removable rather than
   silently gone. */
function safeSrc(url) {
  const upgraded = (url || '').trim().replace(/^(http:)?\/\//i, 'https://');
  if (!SAFE_IMG_SRC.test(upgraded)) return null;
  return /^data:/i.test(upgraded) && upgraded.length > MAX_INLINE_IMG ? null : upgraded;
}

// Removed outright, content and all — unwrapping <style> would paste its CSS as
// visible text, and none of these carry anything a message body wants.
const PASTE_DROP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'TITLE', 'META', 'LINK', 'HEAD', 'TEMPLATE',
  'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'CANVAS', 'INPUT', 'SELECT', 'TEXTAREA', 'BUTTON',
]);

function unwrapEl(el) {
  while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
  el.remove();
}

function _sanitizeAttrs(el) {
  const allowed = PASTE_ATTRS[el.tagName] || [];
  [...el.attributes].forEach(a => {
    if (a.name !== 'style' && !allowed.includes(a.name)) el.removeAttribute(a.name);
  });
  if (el.tagName === 'A') {
    const href = safeHref(el.getAttribute('href'));
    if (href) el.setAttribute('href', href); else el.removeAttribute('href');
  }
  if (isCell(el)) SPAN_ATTRS.forEach(attr => _clampSpan(el, attr));
  if (el.tagName === 'IMG') {
    const src = safeSrc(el.getAttribute('src'));
    /* An unusable src loses the ADDRESS, not the image — as long as the image
       says what it WAS. A src-less <img> with alt is what the browser paints a
       placeholder for, and it stays selectable and removable through the image
       bar. Without alt the same element paints at zero size, and an invisible
       node is worse than no node, so those are dropped.

       The SIZE is kept, which is what holds a signature's shape. Chrome grows
       that box to fit the alt words, so style.css pins a src-less image down with
       `overflow: hidden` — a rule, not an inline style: how a MISSING picture is
       drawn is the editor's business, not the mail's. */
    if (!src) {
      if (!el.getAttribute('alt')) { el.remove(); return; }
      el.removeAttribute('src');
    } else {
      el.setAttribute('src', src);
    }
  }
  if (!el.hasAttribute('style')) return;
  /* Iterate the ALLOW-LIST and ask the element, never the other way round.
     Iterating the style attribute yields the longhands a CSSOM expanded it into,
     and half this list is spelled in shorthands — `border-bottom: 2px solid` comes
     back as border-bottom-width/style/color — so a membership test on the declared
     name matches none of them and drops every border in every paste. (jsdom
     expands almost no shorthands, so a unit suite cannot see that.)

     Reading `el.style[prop]` is not a lookup, it is the CSSOM RESOLVING the
     shorthand, which is the whole reason this asks the element. It costs 81ms
     against 19ms on the worst paste in the suite. */
  const keep = {};
  _styleProps(el).forEach(prop => {
    const value = el.style[prop];
    if (value && _usableStyleValue(el, prop, value)) keep[prop] = value;
  });
  el.removeAttribute('style');
  Object.assign(el.style, keep);
  _dropEmptyStyle(el);
}

// Child NODES that render nothing, which the sweep above cannot reach because
// querySelectorAll only sees elements. Word/Outlook HTML is largely conditional
// comments, so that half is the common case, not an edge one.
function _stripNonContent(el) {
  [...el.childNodes].forEach(n => { if (n.nodeType === 8) n.remove(); });   // comments
  dropFormattingWhitespace(el);
  [...el.children].forEach(_stripNonContent);
}

// What the source RENDERED as, not the tag it reached for: blogs routinely style
// a <span> or an <a> as a block, and reading the tag alone runs those lines
// together. inline-block and inline-flex sit in the text and stay inline.
const BLOCK_DISPLAY = /^(block|list-item|flow-root|flex|grid|table|table-row|table-cell)$/;

// Unwrapping these loses the content itself — an <a> carries its href in the tag
// and an <img> IS the content — so a promoted one is WRAPPED in a line instead.
const KEEP_WHOLE = new Set(['A', 'IMG', 'BR']);

// One tag for every box, whatever the source called it: <section>, <center> and a
// dozen framework wrappers all render the same once their box styling is inlined,
// and meeting exactly one foreign container tag keeps `isBox` a one-line test.
function _keepAsBox(el) {
  if (el.tagName === BOX_TAG) return el;
  const box = _moveLineInto(document.createElement(BOX_TAG), el);
  el.replaceWith(box);
  return box;
}

function _promoteToLine(el) {
  const block = newBlock();
  el.before(block);
  if (KEEP_WHOLE.has(el.tagName)) block.appendChild(el);
  else { _moveLineInto(block, el); el.remove(); }   // carries the surviving style across
  return block;
}

// A line is a LEAF, and a line holding another line is the one shape the block
// model cannot address. Splitting the parent around the inner block makes the
// pieces siblings; loops, because each pass lifts one level and can expose more.
function _splitNestedBlocks(root) {
  const isLine = el => el.tagName === 'LI' || (PASTE_BLOCK_TAGS.has(el.tagName) && !isStructural(el));
  // A block may not sit inside a line OR inside an inline wrapper:
  // <p><span><center>x</center></span></p> is the same illegal shape one level
  // deeper, and splitting the wrapper too lifts it one level per pass.
  const holdsNoBlock = el => !!el && (isLine(el) || INLINE_TAGS.has(el.tagName));
  // A BOX is liftable and has to be named: it is a <div>, which PASTE_BLOCK_TAGS
  // excludes because a pasted <div> is normally a line.
  const liftable = el => PASTE_BLOCK_TAGS.has(el.tagName) || isBox(el);
  // A worklist over ONE snapshot, not a fresh querySelectorAll per lift: a lift
  // changes things LOCALLY, so only the block and its tail clone go back on the
  // queue. Restarting the scan each time put 60% of a 4000-line paste in
  // querySelectorAll. The guard is for a cycle, not for depth.
  const queue = [...root.querySelectorAll(`${PASTE_BLOCK_SELECTOR},${BOX_TAG}`)];
  let guard = queue.length * 8 + 64;
  while (queue.length && guard-- > 0) {
    const inner = queue.shift();
    if (!inner.isConnected || !liftable(inner) || !holdsNoBlock(inner.parentElement)) continue;
    const host = inner.parentElement;

    // A host holding NOTHING BUT liftable blocks is a wrapper: unwrapping it is
    // one move per child where the general path below is n²/2. Not for an <li>,
    // whose children take the item/eviction rules.
    if (host.tagName !== 'LI'
        && host.childNodes.length > 1
        && [...host.childNodes].every(n => n.nodeType === 1 && liftable(n))) {
      const kids = [...host.children];
      host.replaceWith(...kids);
      kids.forEach(k => queue.push(k));
      continue;
    }
    const tail = host.cloneNode(false);                       // same tag and style for the remainder
    while (inner.nextSibling) tail.appendChild(inner.nextSibling);
    // A list holds nothing but items, so a LINE split out of one has to become
    // an item itself. A container (a sub-list) moves across as it stands.
    const moved = host.tagName === 'LI' && !isStructural(inner)
      ? _moveLineInto(document.createElement('li'), inner)
      : inner;
    // ...but a list holds items and SUB-LISTS and nothing else, so a quote split
    // out of an item leaves the list altogether — the OUTERMOST one, or evicting
    // it from a nested list moves it nowhere it is allowed to be.
    let list = null;
    if (host.tagName === 'LI') for (let n = host; n && n !== root; n = n.parentElement) if (isList(n)) list = n;
    const evicted = !!list && moved.tagName !== 'LI' && !isList(moved);
    inner.remove();
    if (evicted) {
      if (tail.childNodes.length) host.after(tail);
      list.after(moved);
    } else {
      host.after(moved);
      if (tail.childNodes.length) moved.after(tail);
    }
    if (!host.childNodes.length) host.remove();               // nothing came before it
    queue.push(moved);   // one level up, so it may still be somewhere it may not be
    if (tail.isConnected) queue.push(tail);
  }
}

// The clipboard document's OWN formatting whitespace — the newline after <body>.
// _stripNonContent leaves whitespace alone in an inline-only parent, where it is
// a real space, and a copied fragment usually is one. At the EDGES it never is.
function _trimEdgeWhitespace(root) {
  [() => root.firstChild, () => root.lastChild].forEach(edge => {
    let n;
    while ((n = edge()) && n.nodeType === 3 && !n.textContent.trim()) n.remove();
  });
}

// Sources that keep their line breaks as real newlines rather than <br>: chat
// apps, code editors, anything inside a <pre>. A newline is only whitespace in
// ordinary HTML, and white-space is dropped with every other non-mark property,
// so this must convert while the declaration is still there to say they mattered.
const PRE_WHITESPACE = /^(pre|pre-wrap|pre-line|break-spaces)$/;

function _hardenLineBreaks(root) {
  root.querySelectorAll('pre, [style*="white-space"]').forEach(el => {
    if (el.tagName === 'PRE' || PRE_WHITESPACE.test(el.style.whiteSpace)) _newlinesToBreaks(el);
  });
}

/* Indentation, kept as CHARACTERS. Pasted code arrives with its leading spaces
   intact and renders flush left, because HTML collapses a run of whitespace and
   drops it at the start of a line — the indentation was never lost, it was never
   displayed. Keeping `white-space: pre-wrap` instead is wrong twice: white-space
   is not a mark, so the first re-render drops it, and Outlook ignores it anyway.
   A non-breaking space is CONTENT, and survives all three.

   Inside a line only runs of two or more are touched, and the last is left an
   ordinary space so the line can still wrap. A tab is four, which is a guess, but
   a tab that renders as one collapsed space is not a better one. */
const _nbsp = n => ' '.repeat(n);
function preserveSpacing(text) {
  return text
    // A leading run is INDENTATION only if it is more than one character, or a
    // tab: pasting " world" after "hello" must not give "hello&nbsp;world".
    .replace(/^[ \t]+/, run => (run.length > 1 || run.includes('\t')
      ? _nbsp([...run].reduce((n, c) => n + (c === '\t' ? 4 : 1), 0)) : run))
    .replace(/ {2,}/g, run => _nbsp(run.length - 1) + ' ')
    .replace(/\t/g, _nbsp(4));
}

function _newlinesToBreaks(el) {
  const doc = el.ownerDocument;
  [...el.childNodes].forEach(n => {
    if (n.nodeType === 1) { _newlinesToBreaks(n); return; }
    if (n.nodeType !== 3 || !n.textContent.includes('\n')) return;
    const frag = doc.createDocumentFragment();
    n.textContent.split('\n').forEach((part, i) => {
      if (i) frag.appendChild(doc.createElement('br'));
      if (part) frag.appendChild(doc.createTextNode(preserveSpacing(part)));
    });
    n.replaceWith(frag);
  });
}

// A block whose children are all blocks holds no content of its own. Gmail wraps
// an entire copy in one <div dir="ltr">, and left in place that reads as a single
// LINE. One pass suffices: the list is in document order.
function _unwrapNestedBlocks(root) {
  root.querySelectorAll(PASTE_BLOCK_SELECTOR).forEach(el => {
    if (!el.parentNode || isStructural(el)) return;
    const kids = [...el.childNodes];   // layout whitespace is already gone
    if (kids.length && kids.every(n => n.nodeType === 1 && PASTE_BLOCK_TAGS.has(n.tagName))) unwrapEl(el);
  });
}

// Legacy presentational markup says in a tag or an attribute what the engine
// expresses as style, and mail is full of it. Rewritten before anything else
// looks, so the rest of the pipeline sees one representation of alignment.
// Inline elements are excluded on purpose: <img align="left"> means FLOAT.
const ALIGN_VALUES = /^(left|center|right|justify)$/;

/* An image's own two, MEASURED rather than read off HTML 4 — in chromium, `align`
   on an <img> computes to:

     left/right  float: left / right          (the text wraps around the picture)
     top         vertical-align: top          texttop    text-top
     absmiddle   vertical-align: middle       middle     -webkit-baseline-middle
     absbottom   vertical-align: bottom       bottom     baseline

   `middle` is written as CSS `middle`, the portable spelling of what the engine
   answers with an internal keyword. Anything else is left alone, `center`
   included: it is not one of the attribute's values. */
const IMG_ALIGN_FLOAT = /^(left|right)$/;
const IMG_ALIGN_VERTICAL = {
  top: 'top', texttop: 'text-top',
  middle: 'middle', absmiddle: 'middle',
  bottom: 'baseline', baseline: 'baseline', absbottom: 'bottom',
};

// The rest of the same family, and it matters: email templates are written in
// HTML 4 attributes, not CSS. Rewritten into style rather than added to the
// keep-list, so the value policy still gets its say.
const _htmlLength = v => (/^\d+$/.test(v) ? `${v}px` : v);   // bare number = HTML 4 px
// `bgcolor="ffffff"` is legal and everywhere in old mail, and CSSOM refuses it
// silently — the assignment does nothing and the attribute is then stripped.
const _htmlColor = v => (/^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(v) ? `#${v}` : v);
// [properties, toCss]. A LIST even where there is one property, because two
// entries carry a pair and a table with two shapes is read twice.
const PRESENTATIONAL_ATTRS = {
  bgcolor: [['backgroundColor'], _htmlColor],
  width: [['width'], _htmlLength],
  height: [['height'], _htmlLength],
  valign: [['verticalAlign'], v => v],
  // <td background="..."> is how a hero image is written for Outlook, which
  // ignores the CSS. Safe to convert blind: it lands as a declaration and the
  // style policy still has to accept the URL (this runs before _sanitizeAttrs).
  background: [['backgroundImage'], v => `url("${v}")`],
  // The attribute form is the commoner one, and the style policy still decides:
  // only rtl survives, so Gmail's <div dir="ltr"> wrapper stamps nothing.
  dir: [['direction'], v => v.toLowerCase()],
  // BOOLEAN: `<td nowrap>` parses to the empty string, which is why the loop
  // below tests for a MISSING attribute rather than a falsy one.
  nowrap: [['whiteSpace'], () => 'nowrap'],
  /* The image spacing pair — hspace both sides, vspace above and below. Every
     engine does map these to a margin, but as a PRESENTATIONAL HINT, which loses
     to any author rule, and style.css line 11 is `* { margin: 0 }`. Measured in
     chromium: 6px/10px in a bare document, 0 inside the app, 6px/10px again once
     written as a declaration. TRANSLATED, therefore, where a RULE's five are kept
     verbatim (see RULE_ATTRS) — the difference is our own stylesheet, not the
     engines. */
  hspace: [['marginLeft', 'marginRight'], _htmlLength],
  vspace: [['marginTop', 'marginBottom'], _htmlLength],
};

// Derived, so an entry added above cannot be skipped for want of a selector.
const PRESENTATIONAL_SELECTOR = Object.keys(PRESENTATIONAL_ATTRS).map(a => `[${a}]`).join(',');

// An IMAGE translates its SPACING and nothing else on the list: the rest is text
// layout an image cannot obey, and its width and height are the picture's CONTENT
// size, kept as attributes in their own right.
const IMG_TRANSLATED_ATTRS = ['hspace', 'vspace'];

/* <font> is HTML 4's <span>, and its three attributes are marks this engine has
   buttons for. The whole job is turning them into declarations before
   _sanitizeAttrs strips them. Its own family, not PRESENTATIONAL_ATTRS: that
   sweep skips inline elements because everything in it is layout, and these three
   are only meaningful ON a run.

   `size` is a rank from 1 to 7, not a length, and a leading sign counts from 3. */
const FONT_SIZES = ['x-small', 'small', 'medium', 'large', 'x-large', 'xx-large', 'xxx-large'];
const _fontRank = v => {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return '';
  const rank = /^[+-]/.test(v) ? 3 + n : n;
  return FONT_SIZES[Math.min(FONT_SIZES.length, Math.max(1, rank)) - 1];
};
const FONT_ATTRS = {
  color: ['color', _htmlColor],
  face: ['fontFamily', v => v],
  size: ['fontSize', _fontRank],
};

function _normalizeFontTags(root) {
  root.querySelectorAll('font').forEach(el => {
    Object.entries(FONT_ATTRS).forEach(([attr, [prop, toCss]]) => {
      const value = (el.getAttribute(attr) || '').trim();
      if (!value || el.style[prop]) return;   // a declaration outranks an attribute
      const css = toCss(value);
      if (css) el.style[prop] = css;
    });
  });
}

// cellspacing/cellpadding say on the TABLE what CSS says on the table and on each
// cell. EVERY side: a spacer cell states only padding-left/right, so a guard
// asking `padding`/`paddingTop` alone overwrites it with `cellpadding="0"`.
const PADDING_PROPS = ['padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'];
const _statesPadding = el => PADDING_PROPS.some(prop => el.style[prop]);

function _normalizeTableSpacing(root) {
  root.querySelectorAll('table[cellspacing], table[cellpadding]').forEach(table => {
    const spacing = (table.getAttribute('cellspacing') || '').trim();
    if (spacing && !table.style.borderSpacing) table.style.borderSpacing = _htmlLength(spacing);
    const padding = (table.getAttribute('cellpadding') || '').trim();
    if (!padding) return;
    // Its OWN cells: a nested table states its own cellpadding, and reaching
    // through would overwrite it with the outer table's.
    [...table.querySelectorAll('td, th')]
      .filter(cell => cell.closest('table') === table)
      .forEach(cell => { if (!_statesPadding(cell)) cell.style.padding = _htmlLength(padding); });
  });
}

// Where a block BOX sits in its container, which is what the align attribute says
// and text-align cannot. `left` is what a block box already does; a source that
// stated a side margin has said where the box goes and is left alone.
function _positionBox(el, value) {
  if (el.style.marginLeft || el.style.marginRight) return;
  if (value === 'center') { el.style.marginLeft = 'auto'; el.style.marginRight = 'auto'; }
  else if (value === 'right') { el.style.marginLeft = 'auto'; el.style.marginRight = '0'; }
}

// A box auto margins can actually move: one that is block-level and knows its own
// width, which is the question _centresItself already answers. An <img> is block
// only if it says so — inline is the default, and text-align reaches that already.
const _centrableBox = el => _centresItself(el)
  && (el.tagName === 'IMG' ? el.style.display === 'block' : _rendersAsBlock(el));

/* The other half of `align="center"` and `<center>`: a browser maps both to
   `text-align: -webkit-center`, which positions BLOCK children as well as inline
   content and INHERITS down to a logo or a 600px column however deep. The plain
   `center` we translate to positions the inline half only.

   Only the ATTRIBUTE forms, never a CSS `text-align: center`, which really does
   leave a block child where it was — hence the set. The nearest STATED alignment
   decides, so a centred header holding one align="left" cell leaves that cell
   alone. Runs BEFORE _pushDownBlockStyles, while the value still lives only where
   it was written. */
function _positionAttributeAligned(root, aligned) {
  if (!aligned.size) return;
  root.querySelectorAll('*').forEach(el => {
    if (!_centrableBox(el)) return;
    for (let up = el.parentElement; up && up !== root; up = up.parentElement) {
      if (!up.style.textAlign) continue;
      if (aligned.has(up)) _positionBox(el, up.style.textAlign);
      return;
    }
  });
}

function _normalizePresentational(root) {
  _normalizeTableSpacing(root);
  _normalizeFontTags(root);
  // The elements whose alignment we WROTE from the attribute — see
  // _positionAttributeAligned, which needs to tell those from a CSS text-align.
  const aligned = new Set();
  root.querySelectorAll('center, [align]').forEach(el => {
    if (INLINE_TAGS.has(el.tagName)) return;
    const value = el.tagName === 'CENTER' ? 'center' : el.getAttribute('align');
    if (!ALIGN_VALUES.test(value)) return;
    // A RULE keeps the attribute itself (RULE_ATTRS) — every engine turns it into
    // the same margin pair. Skipped rather than left to fall through: read as
    // text-align it writes a declaration that renders nothing.
    if (isRule(el)) return;
    if (el.tagName === 'TABLE') {
      // On a TABLE the attribute positions the BOX, not the text: read as
      // text-align the push-down centres every cell in the email. AUTO MARGINS
      // for all three, not float for left/right — a float in a mail body breaks
      // more layouts than it fixes, and a block table takes the same position.
      _positionBox(el, value);
      return;
    }
    if (!el.style.textAlign) { el.style.textAlign = value; aligned.add(el); }
  });
  _positionAttributeAligned(root, aligned);
  // On an IMAGE the attribute means float or vertical-align, never text-align.
  root.querySelectorAll('img[align]').forEach(img => {
    const value = img.getAttribute('align').trim().toLowerCase();
    if (IMG_ALIGN_FLOAT.test(value)) {
      if (!img.style.float) img.style.float = value;
      return;
    }
    const vertical = IMG_ALIGN_VERTICAL[value];
    if (vertical && !img.style.verticalAlign) img.style.verticalAlign = vertical;
  });
  // BDI/BDO are unwrapped by the sweep, taking the dir declaration below with
  // them — renamed first to the one inline element that IS a mark carrier.
  root.querySelectorAll('bdi, bdo').forEach(el => {
    const span = el.ownerDocument.createElement('span');
    [...el.attributes].forEach(a => span.setAttribute(a.name, a.value));
    while (el.firstChild) span.appendChild(el.firstChild);
    el.replaceWith(span);
  });

  // dir on an INLINE element is not layout, it is what the run says.
  root.querySelectorAll('[dir]').forEach(el => {
    if (!INLINE_TAGS.has(el.tagName) || el.tagName === 'IMG') return;
    const value = el.getAttribute('dir').trim().toLowerCase();
    if ((value === 'rtl' || value === 'ltr') && !el.style.direction) el.style.direction = value;
  });

  root.querySelectorAll(PRESENTATIONAL_SELECTOR).forEach(el => {
    // A rule keeps its own (RULE_ATTRS); an image is the one inline with a box.
    if (isRule(el) || (INLINE_TAGS.has(el.tagName) && el.tagName !== 'IMG')) return;
    const only = el.tagName === 'IMG' ? IMG_TRANSLATED_ATTRS : null;
    Object.entries(PRESENTATIONAL_ATTRS).forEach(([attr, [props, toCss]]) => {
      if (only && !only.includes(attr)) return;
      const value = el.getAttribute(attr);
      if (value === null) return;   // MISSING, not falsy: `nowrap` parses to ''
      props.forEach(prop => {
        if (el.style[prop]) return;   // a declaration outranks an attribute
        el.style[prop] = toCss(value.trim());
      });
    });
  });
}

// These all INHERIT, so a wrapper about to be unwrapped is the only place they
// live: hand them down first. Only inherited ones — margin-left would indent twice.
const INHERITED_BLOCK_PROPS = ['textAlign', 'lineHeight', 'letterSpacing', 'direction',
  'textTransform', 'fontVariant'];
function _pushDownBlockStyles(root) {
  root.querySelectorAll('*').forEach(el => {
    // Never onto a RULE: every property here is inherited TEXT state.
    const blocks = [...el.children].filter(c => !INLINE_TAGS.has(c.tagName) && !isRule(c));
    if (!blocks.length) return;
    INHERITED_BLOCK_PROPS.forEach(prop => {
      const value = el.style[prop];
      if (value) blocks.forEach(b => { if (!b.style[prop]) b.style[prop] = value; });
    });
  });
  // Reaching a table's cells writes these onto <tbody> and <tr> on the way past,
  // where they then say nothing. Except `direction`, which also decides which side
  // the FIRST COLUMN is on.
  const REDUNDANT_ON_TABLE = INHERITED_BLOCK_PROPS.filter(p => p !== 'direction');
  root.querySelectorAll('table, tbody, thead, tfoot, tr').forEach(el => {
    REDUNDANT_ON_TABLE.forEach(prop => { el.style[prop] = ''; });
    _dropEmptyStyle(el);
  });
}

/* Chrome's image TAB, whose styling is the VIEWER's and not an author's: dragging
   a picture out of one serializes the <img>'s outerHTML, and `margin: auto` then
   centres it while the mat behind a transparent PNG reads as a highlight.

   `cursor: zoom-in` is NOT the tell — Chrome writes it only when the picture can
   be zoomed. These two are on every image tab. Neither is a declaration this
   engine keeps, so the test can only ever throw styling out; both are required,
   and what goes is the whole attribute. Firefox styles its image document through
   a stylesheet, so its drag carries no style attribute at all. */
const IMAGE_DOCUMENT_MARKS = [/-webkit-user-select:\s*none/i, /transition:\s*background-color/i];
function _stripImageViewerStyle(root) {
  root.querySelectorAll('img[style]').forEach(img => {
    const style = img.getAttribute('style');
    if (IMAGE_DOCUMENT_MARKS.every(mark => mark.test(style))) img.removeAttribute('style');
  });
}

/* HIDDEN BY THE SOURCE, and so not part of what was copied. Every campaign opens
   with a preheader — the sentence a mail client shows beside the subject — written
   as a block the message itself never renders. Swept for style like anything else
   it keeps its words and loses only the hiding, and lands as a visible first line
   the sender cannot see they are sending. Removed with its subtree, since
   unwrapping would keep exactly the text that was hidden.

   THESE THREE ONLY, because each is unambiguous. `font-size: 0` is not: it is how
   a template kills the whitespace between inline-blocks, and every child restates
   a size of its own. Nor is `height: 0` with `overflow: hidden`, which is the
   aspect-ratio box _reservesSpace already knows about — it holds a real picture. */
const _sourceHid = el => el.style.display === 'none'
  || el.style.visibility === 'hidden'
  || parseFloat(el.style.opacity) === 0;

/* THE APP'S OWN MARKUP, cleaned the way adoptComposeBody cleans a whole body: the
   executable tags and attributes go and nothing else does. Deliberately NOT the
   paste sweep, which exists for a hostile clipboard and drops every attribute it
   has no use of its own for — class, id and data-* among them, which is precisely
   what a signature must keep to be found again. Structure is left to the
   normalizeBlocks at the end of the insertion, for the same reason adopt leaves it
   there: the two doors should differ in trust and in nothing else.

   _normalizeChildren so loose inline content becomes a line, as it does on the
   paste path — an <img> chosen from a dialog arrives bare, and a fragment whose
   first child is not a line has nothing _joinLines can merge into the caret's. */
function _trustedFragment(editable, html) {
  const parsed = new DOMParser().parseFromString(html || '', 'text/html').body;
  sanitizeAdopted(parsed);
  _normalizeChildren(parsed);
  const doc = editable.ownerDocument;
  const frag = doc.createDocumentFragment();
  [...parsed.childNodes].forEach(n => frag.appendChild(doc.importNode(n, true)));
  return frag;
}

// DOMParser, not innerHTML on a detached div: the parsed document is inert, so
// nothing loads or runs while we clean it.
function sanitizePaste(html) {
  const body = new DOMParser().parseFromString(html, 'text/html').body;
  _stripImageViewerStyle(body);   // a viewer's chrome is not a document — see above
  _hardenLineBreaks(body);   // before the sweep below strips the white-space that marks them
  _normalizePresentational(body);   // ...so the push-down sees them as style
  _pushDownBlockStyles(body);   // before the sweep unwraps the elements carrying them
  // Static list, so children lifted out of a dropped parent are still visited.
  body.querySelectorAll('*').forEach(el => {
    if (!el.parentNode) return;                                    // already removed with an ancestor
    if (PASTE_DROP_TAGS.has(el.tagName)) { el.remove(); return; }
    if (_sourceHid(el)) { el.remove(); return; }   // before the sweep takes the hiding off
    // Both read BEFORE _sanitizeAttrs, which keeps only the display values a box
    // can use: what the SOURCE rendered decides this, whatever the tag says.
    const isBlock = _rendersAsBlock(el);
    const box = isBlock && _looksLikeBox(el);
    _sanitizeAttrs(el);                                            // so a converted line inherits a CLEAN style
    // Inline and known: keep the tag. Inline and unknown: keep the text. A
    // <span>/<font> left with no style carries no mark and is debris. A BLOCK must
    // leave a LINE behind, or a <td>'s text runs into the next cell's.
    if (!isBlock) {
      if (!PASTE_TAGS.has(el.tagName) || (MARKLESS_TAGS.has(el.tagName) && !el.hasAttribute('style'))) unwrapEl(el);
      return;
    }
    if (box) { _keepAsBox(el); return; }                           // foreign structure worth keeping
    if (PASTE_BLOCK_TAGS.has(el.tagName)) return;                  // already a block we keep
    _promoteToLine(el);
  });
  _stripNonContent(body);   // before anything counts children, since it changes the count
  _trimEdgeWhitespace(body);
  _splitNestedBlocks(body);   // a line may not contain a line; the promotion above makes some
  _unwrapNestedBlocks(body);
  _normalizeChildren(body);   // loose inline content becomes a line, like everywhere else
  // Cells BEFORE the break-split: the split works on lines, and a cell holding
  // bare text has none, so its <br>s would be swallowed when the text was wrapped.
  _cellsIn(body).forEach(cell => _normalizeChildren(cell));
  _splitLinesAtBreaks(body);  // ...and every <br> in it is someone else's line boundary
  const frag = document.createDocumentFragment();
  while (body.firstChild) frag.appendChild(body.firstChild);
  return frag;
}

/* DIRECTION is either STATED (dir="rtl"/"ltr") or UNSTATED (dir="auto", where the
   browser decides per line from the first strong character and keeps deciding).

   It STAYS auto while the document is edited: resolving it at the end of a paste
   is right for the line pasted and wrong for every line made after, because Enter
   CLONES the line it splits. So direction is held LOGICALLY while editing and
   stated PHYSICALLY on the wire (`text-align: start` is the other half), both
   resolved by _wireDirections. `auto` is never sent — Word's engine has no such
   value. Held as the ATTRIBUTE, which is what a client and a screen reader read,
   which isolates, and which is the only spelling that HAS an auto. */
const DIR_STATED = /^(rtl|ltr)$/;

/* Whether a line's direction is its OWN business rather than its container's —
   not "is this text right-to-left", which is the mistake this is named against.
   LOOSE on purpose: everything below U+0590 is never strongly RTL, and the
   scripts above it that are LTR (Bengali, CJK, Devanagari, emoji) cost nothing to
   mark, because `dir="auto"` then resolves them left-to-right anyway and
   _wireDirections states nothing that matches what is inherited.

   Over-marking costs an attribute; UNDER-marking is a language rendering
   backwards, silently. So the loose test decides who gets ASKED and the layout
   engine decides the answer — a tight table of RTL ranges would make a list of
   ours the answer, and Adlam, Thaana, N'Ko and Syriac are what falls off one. Not
   `[^\x00-\x7F]`: browsers swap a typed space for U+00A0. */
const RTL_FLOOR = 0x0590;   // Hebrew, the first right-to-left block there is
function decidesOwnDirection(text) {
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) >= RTL_FLOOR) return true;
  return false;
}

function settleDirection(editable, lines) {
  lines.forEach(line => {
    const declared = line.style.direction;
    if (declared) { line.style.direction = ''; _dropEmptyStyle(line); }
    const stated = DIR_STATED.test(declared) ? declared : line.getAttribute('dir') || '';
    const next = stated || (decidesOwnDirection(line.textContent) ? 'auto' : '');
    // Only when it CHANGES, and never removed: a marked line goes on deciding for
    // itself even once the text that raised the question is deleted.
    if (next && line.getAttribute('dir') !== next) line.setAttribute('dir', next);
  });
  // Here and not at each of the four doors that settle lines: a quote whose bar
  // stayed on the left of Arabic text is the same fact left unsettled.
  settleBoxDirection(editable, lines);
}

/* Which way a CONTAINER faces, which is the whole of what its logical sides
   resolve against. It cannot work this out for itself: `dir="auto"` looks for the
   first strong character but skips any subtree stating a dir of its own, and every
   line settled above now states one — so a box left on auto reads LTR over Arabic
   and puts its bar on the wrong side. It is TOLD instead, by its first line — the
   same question auto would have answered, asked of the one element that can answer
   it without asking the box back.

   Decoration ONLY. A line's own dir="auto" outranks its container, so an English
   paragraph inside an Arabic quote still reads left to right — measured in all
   three engines. Stated only where it DIFFERS from what would be inherited, the
   rule _wireDirections states a direction by. Outermost box first, so a nested one
   reads a parent that has already settled. */
function settleBoxDirection(editable, lines) {
  const boxes = new Set();
  lines.forEach(line => {
    const nesting = [];
    for (let el = line.parentElement; el && el !== editable; el = el.parentElement) {
      if (isForeign(el)) break;
      if (isQuote(el)) nesting.push(el);
    }
    nesting.reverse().forEach(box => boxes.add(box));
  });
  boxes.forEach(box => {
    const inside = _linesInOrder(box);
    if (!inside.length) return;
    /* The FIRST line, and only what it says of its own accord — the same question
       `dir="auto"` would answer for the box if it could see past a child that
       states one. A line saying nothing is a line following whatever the box
       inherits, so it has no direction to give and the box states none either:
       that is also what stops this reading its own answer back out of a line it
       is deciding for. An `auto` line is immune to its container, so asking one
       is always safe. */
    const stated = inside[0].getAttribute('dir');
    const dir = stated === 'auto' ? getComputedStyle(inside[0]).direction : stated;
    if (!dir || dir === getComputedStyle(box.parentElement).direction) {
      box.removeAttribute('dir');
      return;
    }
    box.setAttribute('dir', dir);
    /* Said out loud, the box now hands a direction DOWN to every line that never
       asked for one — reading an English paragraph inside an Arabic quote
       backwards. Marked so each goes on deciding for itself, which is the trade
       this file already makes everywhere: over-marking costs an attribute, and
       under-marking is a language rendered the wrong way round, silently. Only
       here, where a direction is actually stated, so an ordinary indent leaves
       nothing behind for outdent to have to clean up — and none of it reaches the
       wire, where _wireDirections drops every mark that agrees with its parent. */
    inside.forEach(line => { if (!line.getAttribute('dir')) line.setAttribute('dir', 'auto'); });
  });
}

/* Alignment that only REPEATS the direction, said in terms of the direction. An
   RTL site copies as `text-align: right` with no direction at all (dir="rtl" sits
   on its <html>, above the fragment), and kept physical that `right` outlives the
   direction it came from — Enter clones it onto the English paragraph typed
   underneath. `start` follows the line instead. Written only where the physical
   value already AGREED with the direction, so an explicitly right-aligned LTR line
   keeps `right`. Every read, then every write: a getComputedStyle between two
   mutations forces a recalculation of everything the last one dirtied. */
const NATURAL_SIDE = { rtl: 'right', ltr: 'left' };
function shedNaturalAlign(lines) {
  const sides = lines.map(l => NATURAL_SIDE[getComputedStyle(l).direction]);
  lines.forEach((line, i) => {
    if (sides[i] && line.style.textAlign === sides[i]) line.style.textAlign = 'start';
  });
}

/* The wire half of both: `auto` and `start` resolved to what they came out as.
   Walks the live document and its clone IN LOCKSTEP, so both visit the same
   elements in the same order by construction. Reads come from the LIVE element (a
   detached clone has no computed style), writes go to the CLONE (the user is still
   typing in the original) — and writing into a detached tree dirties no style, so
   it is one recalculation for the message rather than one per line. A resolved
   direction is stated only where it DIFFERS from what would be inherited. */
function _wireDirections(editable, out) {
  const live = document.createTreeWalker(editable, NodeFilter.SHOW_ELEMENT);
  const copy = document.createTreeWalker(out, NodeFilter.SHOW_ELEMENT);
  let l, c;
  while ((l = live.nextNode()) && (c = copy.nextNode())) {
    const auto = c.getAttribute('dir') === 'auto';
    const align = c.style.textAlign;
    const logical = align === 'start' || align === 'end';
    const sides = LOGICAL_SIDES.some(prop => c.style[prop]);
    if (!auto && !logical && !sides) continue;
    const dir = getComputedStyle(l).direction;
    if (sides) _wireSides(c, dir);
    if (auto) {
      const base = l.parentElement ? getComputedStyle(l.parentElement).direction : '';
      if (dir && dir !== base) c.setAttribute('dir', dir);
      else c.removeAttribute('dir');
    }
    // start under rtl is right, start under ltr is left, and end is the other
    // one of the pair — which is the whole of the mapping, both ways.
    if (logical) c.style.textAlign = NATURAL_SIDE[(align === 'start') === (dir === 'rtl') ? 'rtl' : 'ltr'];
  }
}

// The other half of the same resolution: a quote's bar and an indent's step said
// as the side they came out on. Cleared before the physical one is written, so
// the block leaves stating each side once.
function _wireSides(el, dir) {
  LOGICAL_SIDES.forEach(prop => {
    const value = el.style[prop];
    if (!value) return;
    el.style[prop] = '';
    el.style[SIDES[prop][dir === 'rtl' ? 1 : 0]] = value;
  });
}

function _textToFragment(text) {
  const frag = document.createDocumentFragment();
  String(text || '').split(/\r\n|\r|\n/).forEach(t => {
    const block = newBlock();
    // The other door indentation comes through: nothing collapsed it on the way.
    block.appendChild(t ? document.createTextNode(preserveSpacing(t)) : document.createElement('br'));
    frag.appendChild(block);
  });
  return frag;
}

const _endOf = el => {
  const r = document.createRange();
  r.selectNodeContents(el);
  r.collapse(false);
  return { node: r.startContainer, offset: r.startOffset };
};

// A line needs exactly one <br> to hold itself open, and only while it holds
// nothing else — so in a line with no text and no image, the FIRST <br> is the
// holder and any beyond it are soft breaks the user asked for.
const _brCount = line => line.querySelectorAll('br').length;
const _lineHasVisible = line => !!(stripZwsp(line.textContent).trim() || line.querySelector('img'));
const _softBreaksIn = line =>
  (_lineHasVisible(line) ? _brCount(line) : Math.max(_brCount(line) - 1, 0));

// Something a user would see on this line — or asked for, which a soft break is.
const _lineHasContent = line => _lineHasVisible(line) || _softBreaksIn(line) > 0;

// `b`'s content appended to `a`, in RUN space, so marks on both sides survive.
function _joinLines(a, b) {
  // Both sides: callers pass raw fragment children, and flattenRuns reads
  // computed style, which throws on anything but an element.
  if (a === b || !isLineEl(a) || !isLineEl(b)) return;
  renderInto(a, [...flattenRuns(a), ...flattenRuns(b)]);
  b.remove();
}

// Everything from `range` onward, moved into a new line after it; the clone keeps
// the line's alignment, indent and hoisted marks on both halves.
// setEndAfter(lastChild), never setEnd(line, childNodes.length): `childNodes` is
// LIVE, and re-reading its length per split is the last quadratic in a long paste.
function _splitLineAt(line, range) {
  const tailRange = range.cloneRange();
  if (line.lastChild) tailRange.setEndAfter(line.lastChild);
  else tailRange.setEnd(line, 0);
  const tail = line.cloneNode(false);
  tail.appendChild(tailRange.extractContents());
  line.after(tail);
  return tail;
}

// Pasting into a list: the pasted lines have to become items too.
function _asListItems(frag) {
  // Foreign structure cannot come along: an <li> is a LINE and a line is a leaf.
  // Repeated, because a table is three containers deep; bounded, one per pass.
  for (let depth = 0; depth < 8; depth++) {
    const foreign = [...frag.children].filter(isForeign);
    if (!foreign.length) break;
    foreign.forEach(unwrapEl);
  }
  [...frag.children].forEach(el => {
    if (!isStructural(el)) frag.replaceChild(_moveLineInto(document.createElement('li'), el), el);
  });
}

function _rangeFrom(snap) {
  const r = document.createRange();
  r.setStart(snap.startNode, snap.startOffset);
  try { r.setEnd(snap.endNode, snap.endOffset); } catch (_) { r.collapse(true); }
  return r;
}

/* Range.deleteContents removes what lies BETWEEN two lines and merges nothing, so
   a selection that crossed a boundary leaves both halves standing — the tail as a
   line of its own, which is one line more than the document had before. Native
   deletion joins them, and every caller here is standing in for one.

   Through the RUNS, so the tail's marks survive, and the caret put back from the
   HEAD's own length rather than from the range: deleteContents leaves a range
   spanning two blocks pointing at their common ancestor, which is no line at all,
   and an offset measured from there is not a position in the document. What is
   left of the head IS where the caret belongs, and the join only adds after it. */
function _deleteRange(editable, range) {
  const head = blockContaining(editable, range.startContainer);
  const tail = blockContaining(editable, range.endContainer);
  range.deleteContents();
  if (!head || !tail || head === tail || !tail.isConnected) return;
  if (!isLineEl(head) || !isLineEl(tail)) return;
  /* Both halves must live behind the SAME wall. Joining across one carries the
     content out of it — a selection running from a paragraph into a cell pulled
     the cell's first line out of the table, which is the restructuring the wall
     in _containerOf exists to forbid and which no native engine does. Leaving
     both halves standing is what a browser does at a cell boundary. */
  if (_containerOf(editable, head, isForeign) !== _containerOf(editable, tail, isForeign)) return;
  const at = contentLength(head);
  _joinLines(head, tail);
  const back = nodeAtOffset(head, at);
  range.setStart(back.node, back.offset);
  range.collapse(true);
}

// A pasted node can BE a container — a whole <ul> — and blockContaining resolves
// any container to its FIRST line, which would leave every item after the first
// out of the re-render below. Take the container's own edge line instead.
function _edgeLine(root, node, last) {
  if (node.nodeType === 1 && isDrillable(node)) {
    const inner = _linesInOrder(node);
    if (inner.length) return last ? inner[inner.length - 1] : inner[0];
  }
  return blockContaining(root, node);
}

// The lines spanned by two nodes, in document order — the same slice
// resolveBlocks does, for a pair of nodes instead of a selection.
function _linesTouching(root, from, to) {
  const lines = _linesInOrder(root);
  const i = lines.indexOf(_edgeLine(root, from, false));
  const j = lines.indexOf(_edgeLine(root, to, true));
  if (i < 0 || j < 0) return lines;   // couldn't place an end — re-render everything rather than miss some
  return lines.slice(Math.min(i, j), Math.max(i, j) + 1);
}

// Manages history/caret itself, since undoing must not become a new undo step.
function _travelHistory(ctx, fromKey, toKey) {
  const s = _stacksFor(ctx.editable);
  if (!s[fromKey].length) return;
  // Held to the same ceiling as the undo stack: redo grows a snapshot per step
  // travelled, out of the same document and carrying the same inlined pictures.
  s[toKey].push(History.snapshot(ctx.editable));
  _trimHistory(s[toKey]);
  const target = s[fromKey].pop();
  ctx.editable.innerHTML = target.html;
  if (target.selection) Selection.restore(target.selection); else ctx.editable.focus();
  ctx.skipRestore = true;
  ctx.skipHistory = true;
}

class Editor {
  constructor(editable) {
    this.editable = editable;
  }

  exec(name, args) {
    if (!Commands[name]) { console.warn(`[Editor.exec] no command named "${name}"`); return; }
    // Deferred, not dropped, while the IME holds a range: running now rewrites the
    // line the composition is measured against. Only the LAST is kept — a second
    // click before the commit replaces the intent rather than queueing an edit.
    if (isComposing(this.editable)) { _deferredCommand.set(this.editable, { name, args }); return; }
    // The live Selection is read HERE and nowhere else in this pipeline.
    this.transaction(Selection.snapshot(), ctx => Commands[name](ctx, args));
  }

  // Resolve -> command -> restore -> commit, every time, so no command has to
  // remember these steps itself.
  transaction(snap, fn) {
    // Not the duplicate of History.commit's flush it looks like: undo and redo set
    // skipHistory, so commit never runs for them, and this is their only flush.
    flushTypingHistory(this.editable);

    const selection = Selection.resolve(snap, this.editable);
    const history = History.snapshot(this.editable);

    const ctx = { editable: this.editable, selection };
    fn(ctx);

    // Decoration is an INVARIANT, not a stamp applied once at the door: a command
    // can undo it, and a wrapping command builds blocks that went through neither.
    // _stateStyle writes only what is missing, so a pass with nothing to do costs
    // nothing.
    this.editable.querySelectorAll(DECORATED_SELECTOR).forEach(decorate);
    // Which way a container FACES is the same kind of invariant, and no command
    // is in a position to know: quoting wraps a box around a line, outdenting
    // empties the one it leaves, and either can change the side the text inside
    // a box starts at. Settled here, so a bar is on the right of Arabic the
    // moment it is drawn rather than at the moment it is sent.
    settleBoxDirection(this.editable, _linesInOrder(this.editable));

    reconcileCaretFormat(this.editable);   // did an armed marker survive what just ran?
    if (!ctx.skipRestore) Selection.restore(selection);
    if (!ctx.skipHistory) History.commit(this.editable, history);
  }
}

const _editors = new WeakMap();
function editorFor(editable) {
  let ed = _editors.get(editable);
  if (!ed) { ed = new Editor(editable); _editors.set(editable, ed); }
  return ed;
}

// Translates a toolbar element's data-* into a mark command, per
// toolbar.README.md's documented contract.
function markFromElmDataset(ds) {
  const MARK_ACTIONS = { bold: 'bold', italic: 'italic', underline: 'underline', strikeThrough: 'strike' };
  if (MARK_ACTIONS[ds.action]) return { key: MARK_ACTIONS[ds.action], value: true };
  if (ds.size) return { key: 'fontSize', value: `${ds.size}px` };   // raw px number, Gmail's Small/Normal/Large/Huge
  if (ds.textColor) return { key: 'color', value: ds.textColor };
  if (ds.bgColor) return { key: 'bgColor', value: ds.bgColor };
  if (ds.fontFamily) return { key: 'fontFamily', value: ds.fontFamily };
  return null;
}

// Shared with the commands, so a highlighted button and what clicking it does can
// never disagree. An armed CaretFormat session wins: it describes the NEXT
// keystroke, and its marker is invisible to flattenRuns.
function _markState(editable) {
  const s = CaretFormat._state.get(editable);
  if (s && s.format) return Object.fromEntries(MARK_KEYS.map(k =>
    [k, { state: s.format[k] ? 'all' : 'none', value: s.format[k] || null }]));
  const sel = Selection.capture(editable);
  if (!sel) return null;
  const segments = sel.collapsed
    ? [{ block: sel.block, startOffset: sel.startOffset, endOffset: sel.startOffset }]
    : selectionSegments(sel);
  if (!segments.length) return null;
  return combineStates(segments.map(seg => analyze(flattenRuns(seg.block), seg.startOffset, seg.endOffset)));
}

// Pass a dropdown menu for its items, or the whole toolbar for its buttons. Each
// control keeps the active-class its own markup already uses.
function syncToolbarDropdown(editable, containerEl) {
  const state = _markState(editable);
  if (!state) return;
  containerEl.querySelectorAll('.compose-toolbar-dd-item, .compose-toolbar-btn').forEach(item => {
    const mark = markFromElmDataset(item.dataset);
    if (!mark) return;   // undo/list/blockquote carry no mark — not ours to touch
    const st = state[mark.key];
    const on = st.state === 'all' && st.value === canonicalMarkValue(mark.key, mark.value);
    item.classList.toggle(item.classList.contains('compose-toolbar-btn') ? 'active' : 'is-active', on);
  });
}

// The menu may already be floated to <body>, so read it off the cached _menu.
function syncFontTriggerLabel(toolbar, editable) {
  const trigger = toolbar.querySelector('.compose-font-trigger');
  const label = trigger && trigger.querySelector('.compose-font-trigger-label');
  const menu = trigger && (trigger._menu || trigger.nextElementSibling);
  if (!label || !menu) return;
  const all = _markState(editable);
  if (!all) return;
  const state = all.fontFamily;
  let matched = null;
  menu.querySelectorAll('[data-font-family]').forEach(item => {
    if (matched) return;
    if (state.state === 'all' && state.value === canonicalMarkValue('fontFamily', item.dataset.fontFamily)) matched = item.textContent.trim();
  });
  label.textContent = matched || menu.querySelector('[data-font-family]')?.textContent.trim() || 'Sans Serif';
}

// Both syncs in one call, in the order they must run and with each one's own
// argument order handled here — the two differ, which is a trap worth removing
// from the host. `container` defaults to the toolbar; pass a single menu instead
// when that menu has been floated out of it.
function syncToolbar(editable, toolbar, container) {
  syncToolbarDropdown(editable, container || toolbar);
  syncFontTriggerLabel(toolbar, editable);
}

// The fixed-signature public entry point (see toolbar.README.md): pass the
// clicked toolbar element, get back .compose-body's updated innerHTML.
function composeEditorWrapper(elm) {
  const wrap = elm.closest('.compose-editor-wrap') || elm.closest('.compose-toolbar-dd-menu')?._home?.parentElement?.closest('.compose-editor-wrap');
  const editable = wrap && wrap.querySelector('.compose-body');
  // A menu portaled to <body> reaches neither branch above; say so rather than
  // throwing on a null wrap.
  if (!editable) { console.warn('[composeEditorWrapper] no .compose-body found for', elm); return ''; }
  wireComposeEditor(editable);   // idempotent fallback for anyone who skips the explicit setup call
  const editor = editorFor(editable);

  const mark = markFromElmDataset(elm.dataset);
  if (mark) { editor.exec('mark', mark); return editable.innerHTML; }

  if (elm.dataset.align) {
    const value = { justifyLeft: 'left', justifyCenter: 'center', justifyRight: 'right', justifyFull: 'justify' }[elm.dataset.align] || '';
    editor.exec('align', { value });
    return editable.innerHTML;
  }
  // data-image="size|alt|remove" plus data-value — the floating bar over an image.
  if (elm.dataset.image) { editor.exec('image', { action: elm.dataset.image, value: elm.dataset.value }); return editable.innerHTML; }
  // data-direction="rtl|ltr" — the pair of buttons Gmail shows once RTL is on.
  if (elm.dataset.direction) { editor.exec('direction', { value: elm.dataset.direction }); return editable.innerHTML; }
  if (elm.dataset.action === 'blockquote') { editor.exec('blockquote', {}); return editable.innerHTML; }
  if (elm.dataset.action === 'insertUnorderedList') { editor.exec('list', { tag: 'ul' }); return editable.innerHTML; }
  if (elm.dataset.action === 'insertOrderedList') { editor.exec('list', { tag: 'ol' }); return editable.innerHTML; }
  if (elm.dataset.action === 'indent') { editor.exec('indent', { dir: 1 }); return editable.innerHTML; }
  if (elm.dataset.action === 'outdent') { editor.exec('indent', { dir: -1 }); return editable.innerHTML; }
  if (elm.dataset.action === 'removeFormat') { editor.exec('clearFormat', {}); return editable.innerHTML; }
  if (elm.dataset.action === 'undo') { editor.exec('undo', {}); return editable.innerHTML; }
  if (elm.dataset.action === 'redo') { editor.exec('redo', {}); return editable.innerHTML; }

  return editable.innerHTML;   // no matching attribute — documented no-op
}

// ONE nesting level out: from a sub-list the line lands in the parent list and a
// second Enter leaves that one, which is what Gmail does. Every owned container,
// not quotes alone — a line that is not an <li> can still be sitting in a list.
function _stepOutOne(editable, line) {
  if (line.tagName === 'LI') return nudgeItemDepth(editable, line, -1);
  return liftFrom(editable, [line], isOwnedContainer)[0];
}

// Enter on an EMPTY line inside a quote/list steps out instead of stacking up
// more empty lines. Returns the updated HTML if it acted, else null.
function exitContainerOnEnter(editable) {
  const snap = Selection.snapshot();
  if (!snap || !snap.collapsed || !editable.contains(snap.startNode)) return null;

  const line = blockContaining(editable, snap.startNode);   // the LINE, not the container
  // _lineHasContent, never a second copy of it: an image is content and carries
  // no text, and a line holding only a picture must not read as empty here.
  if (!line || _lineHasContent(line)) return null;
  if (!_containerOf(editable, line, isOwnedContainer)) return null;   // not in a quote/list — ordinary Enter

  const history = History.snapshot(editable);
  // The lift removes a container it empties and splits one it doesn't, so items
  // below the caret keep the depth they had.
  const landed = _stepOutOne(editable, line);
  if (!landed.firstChild) landed.appendChild(document.createElement('br'));

  const r = document.createRange();
  r.selectNodeContents(landed);
  r.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(r);

  History.commit(editable, history);
  return editable.innerHTML;
}

/* Shift+Enter is OURS: left native, the engines disagree — Chromium and Firefox
   insert a <br> where WebKit splits the block — and that difference then reaches
   the engine's own rules, since a line with no <br> reads as empty and Enter on an
   empty line inside a container is DEFINED to leave it.

   TWO breaks when the line ends here, one otherwise, which is exactly what
   _breakOccupies says: a <br> with nothing after it holds no position. */
function insertSoftBreak(editable) {
  const snap = Selection.snapshot();
  if (!snap || !editable.contains(snap.startNode)) return null;
  const history = History.snapshot(editable);
  const range = _rangeFrom(snap);
  _deleteRange(editable, range);   // a break replacing a selection that crossed lines joins them first
  const br = document.createElement('br');
  range.insertNode(br);
  if (!_breakOccupies(br)) br.after(document.createElement('br'));

  const after = document.createRange();
  after.setStartAfter(br);
  after.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(after);

  History.commit(editable, history);
  return editable.innerHTML;
}

// Same (elm) => html shape as composeEditorWrapper, for a keyboard event — no
// listener attached here. Returns the updated innerHTML if it handled the key
// (having called preventDefault itself), else null.
function composeKeyboardWrapper(editable, e) {
  wireComposeEditor(editable);
  if (e.key === 'Enter' && e.shiftKey) {
    const html = insertSoftBreak(editable);
    if (html !== null) { e.preventDefault(); return html; }
    return null;
  }
  // Enter carries no modifier, so it must be handled before the ctrl/meta gate.
  if (e.key === 'Enter' && !e.shiftKey) {
    const html = exitContainerOnEnter(editable);
    if (html !== null) { e.preventDefault(); return html; }
    return null;
  }
  if (!(e.ctrlKey || e.metaKey)) return null;
  const key = e.key.toLowerCase();
  const editor = editorFor(editable);

  const SHORTCUT_MARKS = { b: 'bold', i: 'italic', u: 'underline' };
  if (SHORTCUT_MARKS[key]) { e.preventDefault(); editor.exec('mark', { key: SHORTCUT_MARKS[key] }); return editable.innerHTML; }

  // preventDefault matters: contenteditable has its own native undo stack.
  if (key === 'z' && !e.shiftKey) { e.preventDefault(); editor.exec('undo', {}); return editable.innerHTML; }
  if ((key === 'z' && e.shiftKey) || key === 'y') { e.preventDefault(); editor.exec('redo', {}); return editable.innerHTML; }

  return null;   // not a bound shortcut — caller's handler keeps going
}
window.composeKeyboardWrapper = composeKeyboardWrapper;

// Same (editable, event) => html shape, for a paste event. No listener attached
// here — call it from your own paste handler. Going through exec() is what puts
// a paste on the same undo stack as everything else.
/* The door for the app's own content — a signature, a template, a picture from a
   dialog. Called directly rather than through a data-* attribute, like the link
   functions, because what goes in is free-form markup and not a button.

   THROUGH exec, which is the whole point: one undo step, the caret put back, the
   decoration invariant reapplied and any armed caret-format session reconciled.
   A host writing the same markup into .compose-body by hand gets none of those,
   and its change is not on the undo stack — so the user's next undo restores a
   document from before it and the new signature disappears with it. */
function insertBlocks(editable, args) {
  wireComposeEditor(editable);
  editorFor(editable).exec('insertBlocks', args);
  return editable.innerHTML;
}

function composePasteWrapper(editable, e) {
  wireComposeEditor(editable);
  const cd = e.clipboardData || window.clipboardData;
  if (!cd) return null;
  e.preventDefault();
  editorFor(editable).exec('paste', { html: cd.getData('text/html'), text: cd.getData('text/plain') });
  return editable.innerHTML;
}
window.composePasteWrapper = composePasteWrapper;

/* DROP is a paste that skipped the checkpoint, so it goes through the SAME door —
   the `paste` command itself, not a second sanitizer to keep in agreement.

   INTERNAL drags are left alone: dragging text within the message is a MOVE, and
   routing it through paste would insert without deleting. FILES are stopped and
   then left alone — stopped because the browser inserts <img src="file:///…">,
   left alone because an attachment is not a document edit, and preventDefault
   does not stop propagation, so the host's handler still sees the files.

   FOUR event types, ONE function, no listener attached here. A host that binds
   drop but forgets dragstart turns an internal move into a copy. */
let _dragFrom = null;

/* WILL THE DROP BELOW INSERT THIS? — the only thing a dragover handler is allowed
   to ask, and it has to be asked the way drop asks it: drop takes the payload when
   `text/html` or `text/plain` has something in it, and leaves it alone when it has
   not. getData is empty until drop, by design, but `types` says which keys exist,
   and that is the same question one step earlier.

   NOT "does it carry Files". Chrome puts `Files` on an image dragged out of a WEB
   PAGE — measured, the payload is [text/uri-list, text/html, chromium/x-drag-id,
   Files] — so asking that hid the bar for the commonest drag there is, while drop
   went on inserting the picture. A file off the desktop carries no text key and
   still gets no bar, which is what the test was reaching for. */
const _DROPPABLE_TYPES = ['text/html', 'text/plain'];
const _carriesContent = dt => !!dt
  && _DROPPABLE_TYPES.some(t => Array.prototype.includes.call(dt.types || [], t));

// Two spellings of one question: Chromium and WebKit answer caretRangeFromPoint,
// Firefox answers caretPositionFromPoint.
function _rangeAtPoint(editable, x, y) {
  let range = null;
  if (document.caretRangeFromPoint) {
    range = document.caretRangeFromPoint(x, y);
  } else if (document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(x, y);
    if (pos) { range = document.createRange(); range.setStart(pos.offsetNode, pos.offset); }
  }
  if (!range || !editable.contains(range.startContainer)) return null;
  range.collapse(true);
  return range;
}

function _caretAtPoint(editable, x, y) {
  const range = _rangeAtPoint(editable, x, y);
  if (!range) return;   // dropped on the padding — keep the caret where it was
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

/* The insertion point, shown while the drag is in the air. DRAWN rather than
   borrowed: the browser's own drag caret does not appear once dragover is
   canceled, and it must be canceled or no drop follows — while moving the REAL
   selection pulls focus out of whatever the user was typing in. Positioned from
   the same range the drop will use, which is what makes the preview honest. */
/* A collapsed Range has a box of its own only while it sits INSIDE a text node.
   Point at an EMPTY line and it lands on the element instead, whose collapsed box
   is 0x0 at 0,0 — so the bar was drawn in the corner of the window with no height,
   which is to say not drawn at all. That is the case that matters most: a message
   opens as a single empty line, so dropping into a blank one showed nothing.

   The LINE's own box is the answer there, at whichever edge its direction starts
   from — asked of the line and not the editable, so a blank line inside an RTL
   quote puts the bar on the right, where its text would begin. */
function _dropCaretRect(editable, range) {
  const rect = range.getBoundingClientRect();
  if (rect.height) return rect;
  const line = blockContaining(editable, range.startContainer) || editable;
  const box = line.getBoundingClientRect();
  return { left: getComputedStyle(line).direction === 'rtl' ? box.right : box.left,
    top: box.top, height: box.height };
}

let _dropCaret = null;
function _showDropCaret(editable, range) {
  const rect = _dropCaretRect(editable, range);
  if (!_dropCaret) {
    _dropCaret = document.createElement('div');
    _dropCaret.setAttribute('aria-hidden', 'true');
    // Outside the editable: inside it, the next serialize would send a stray div.
    _dropCaret.style.cssText = 'position:fixed;width:2px;pointer-events:none;z-index:2147483647';
    document.body.appendChild(_dropCaret);
  }
  _dropCaret.style.background = getComputedStyle(editable).color;
  _dropCaret.style.left = `${rect.left}px`;
  _dropCaret.style.top = `${rect.top}px`;
  _dropCaret.style.height = `${rect.height}px`;
  _dropCaret.style.display = '';
}
function _hideDropCaret() { if (_dropCaret) _dropCaret.style.display = 'none'; }

function composeDropWrapper(editable, e) {
  // Remembered rather than acted on: where a drag lands may be a different
  // editable than it left.
  if (e.type === 'dragstart') { _dragFrom = editable; return null; }
  if (e.type === 'dragend') { _dragFrom = null; _hideDropCaret(); return null; }
  // dragover fires continuously, so a leave between child elements puts the caret
  // straight back before a frame is painted.
  if (e.type === 'dragleave') { _hideDropCaret(); return null; }
  wireComposeEditor(editable);
  if (e.defaultPrevented) return null;   // someone got here first
  if (e.type === 'dragover') {
    e.preventDefault();   // or the drop event never fires in some configurations
    // An internal move draws its own caret; anything the drop will not insert has
    // no landing to promise. See _carriesContent for why that is not "no Files".
    if (!_dragFrom && _carriesContent(e.dataTransfer)) {
      const range = _rangeAtPoint(editable, e.clientX, e.clientY);
      if (range) _showDropCaret(editable, range); else _hideDropCaret();
    }
    return null;
  }
  _hideDropCaret();
  if (_dragFrom) return null;   // an internal move — the browser's to finish
  const dt = e.dataTransfer;
  if (!dt) return null;
  const html = dt.getData('text/html');
  const text = dt.getData('text/plain');
  if (!html && !text) { e.preventDefault(); return null; }   // files: see above
  e.preventDefault();
  _caretAtPoint(editable, e.clientX, e.clientY);
  editorFor(editable).exec('paste', { html, text });
  return editable.innerHTML;
}
window.composeDropWrapper = composeDropWrapper;

// cloneContents copies the CONTENTS of the common ancestor, so a selection
// spanning list items comes out as bare <li>s. An INLINE ancestor always comes
// along; a CONTAINER only while a bare <li> is still exposed.
function _reparentForClipboard(range, root) {
  let out = range.cloneContents();
  let el = range.commonAncestorContainer;
  if (el.nodeType === 3) el = el.parentElement;
  for (; el && el !== root; el = el.parentElement) {
    const carriesFormat = INLINE_TAGS.has(el.tagName);
    if (!carriesFormat && ![...out.children].some(child => child.tagName === 'LI')) break;
    const shell = el.cloneNode(false);
    shell.appendChild(out);
    out = shell;
  }
  return out;
}

// The clipboard is an egress point exactly like sending, so it gets the same list
// transform. Copy only, not cut: writing to the clipboard requires
// preventDefault, which would also cancel cut's deletion.
function composeCopyWrapper(editable, e) {
  const cd = e.clipboardData;
  const sel = window.getSelection();
  if (!cd || !sel.rangeCount || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  const holder = document.createElement('div');
  holder.appendChild(_reparentForClipboard(range, editable));
  _nestListsForOutput(holder);
  e.preventDefault();
  cd.setData('text/html', stripZwsp(holder.innerHTML));
  cd.setData('text/plain', sel.toString());
  return holder.innerHTML;
}
window.composeCopyWrapper = composeCopyWrapper;

// Plain typing never goes through Editor.exec, so it needs its own path into
// History: snapshot on the first beforeinput of a burst, commit once typing
// stops, so one burst becomes one undo step.
const TYPING_DEBOUNCE_MS = 500;
const _typingWired = new WeakSet();
const _pendingTypingSnapshot = new WeakMap();

// Ends the burst NOW, for anything that would otherwise read or write the stacks
// while it is uncommitted. Deleting the entry makes the pending timer a no-op.
function flushTypingHistory(editable) {
  const entry = _pendingTypingSnapshot.get(editable);
  if (!entry) return;
  _pendingTypingSnapshot.delete(editable);
  History.commit(editable, entry);
}

/* Typing is not a command, so nothing repairs what it leaves behind: text typed
   at the editable's own level lands as a bare top-level node, addressable by
   nothing, and Send is not a command either.

   THE CARET HAS TO BE PUT BACK. Every engine has it inside the text node while
   this runs; only Blink keeps it there when the node MOVES into a line. Dropped,
   it collapses onto the editable, so the next keystroke lands loose again and is
   wrapped again — one letter per paragraph. Captured before the move and
   re-applied after: the node is MOVED, not copied, so the position is still its own.

   THE EMPTY LINE it was typed BESIDE is the second half. A body opens as one
   `<p><br></p>`, so wrapping the stray text leaves the document with the typed
   line AND the empty one it was meant to fill. Moved in, not wrapped.

   Never mid-composition: the IME is holding a range into these very nodes. */
const _isBlankLine = n => !!n && n.nodeType === 1 && isLineEl(n)
  && n.childNodes.length === 1 && n.firstChild.nodeName === 'BR';

function adoptLooseText(editable) {
  if (isComposing(editable)) return;
  const loose = [...editable.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
  if (!loose) return;
  // FIRST, before anything below moves a node: read afterwards, this reads what
  // the browser collapsed to, and "Hello world" comes out "ello worldH".
  const sel = window.getSelection();
  const at = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
  const node = at && at.collapsed && editable.contains(at.startContainer)
    ? at.startContainer : null;
  const offset = at ? at.startOffset : 0;
  [...editable.childNodes].forEach(n => {
    if (n.nodeType !== 3 || !n.textContent.trim()) return;
    const line = _isBlankLine(n.previousElementSibling) ? n.previousElementSibling
      : _isBlankLine(n.nextElementSibling) ? n.nextElementSibling : null;
    if (line) line.replaceChildren(n);
  });
  _normalizeChildren(editable);
  if (!node || !node.isConnected) return;
  const back = document.createRange();
  const limit = node.nodeType === 3 ? node.length : node.childNodes.length;
  back.setStart(node, Math.min(offset, limit));
  back.collapse(true);
  sel.removeAllRanges();
  sel.addRange(back);
}

// The line being TYPED into decides its own direction, exactly as a pasted one
// does — and most Arabic in most messages is written, not pasted. One line, the
// caret's: for a line outside a quote this is an attribute write at most, and a
// line inside one costs a read per level of nesting to turn the bar around with
// it. Never mid-composition: `dir` changes how the line is laid out.
function settleTypedLine(editable) {
  if (isComposing(editable)) return;
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  const node = sel.getRangeAt(0).startContainer;
  if (!editable.contains(node)) return;
  const line = blockContaining(editable, node);
  if (line) settleDirection(editable, [line]);
}

// The timer lives here rather than in a closure so the composition watcher can
// re-arm it: a burst held open across a composition has to close afterwards.
const _typingTimer = new WeakMap();
function scheduleTypingFlush(editable) {
  clearTimeout(_typingTimer.get(editable));
  _typingTimer.set(editable, setTimeout(() => {
    // A burst BOUNDARY may not land inside a composition, or the next beforeinput
    // snapshots a half-composed DOM and undo restores a word never finished.
    // compositionend re-arms this. Not a CJK edge case — Android composes English.
    if (isComposing(editable)) return;
    flushTypingHistory(editable);
  }, TYPING_DEBOUNCE_MS));
}

function wireComposeHistory(editable) {
  if (_typingWired.has(editable)) return;
  _typingWired.add(editable);
  editable.addEventListener('beforeinput', () => {
    if (!_pendingTypingSnapshot.has(editable)) {
      _pendingTypingSnapshot.set(editable, History.snapshot(editable));
    }
  });
  editable.addEventListener('input', () => {
    adoptLooseText(editable);
    settleTypedLine(editable);
    scheduleTypingFlush(editable);
  });
  // Leaving the field ends the burst: otherwise typing then clicking away
  // inside the debounce window produces no undo step for it at all.
  editable.addEventListener('blur', () => flushTypingHistory(editable));
}

// An ALLOW-LIST, so a scheme is here because someone asked what it does. Each of
// these hands the URL to something that dials, composes or navigates; none can
// execute, and none carries a payload the way data: does.
const SAFE_URL = /^(https?:|mailto:|tel:)/i;
function safeHref(url) {
  const trimmed = (url || '').trim();
  return SAFE_URL.test(trimmed) ? trimmed : null;
}

/* "Did the user leave the selected text alone?", so it must forgive exactly the
   differences the two SOURCES cause and nothing else. Line breaks go: a break
   across a block boundary is punctuation the STRUCTURE adds (Selection.toString
   inserts one, Range.toString does not) and the dialog's <input> cannot hold one.
   Spaces stay — erasing all whitespace makes "hello world" and "helloworld" equal,
   so closing that gap in the dialog would read as "unchanged". */
const _linkText = s => stripZwsp(s).replace(/[\r\n]+/g, '').replace(/\s+/g, ' ').trim();
const _sameText = (a, b) => _linkText(a) === _linkText(b);

// A link whose content is a PICTURE: the dialog's text field is empty because
// there was nothing to put in it, not because the user asked for the image to be
// replaced by the address.
const _wordless = node => !_linkText(node.textContent) && !!node.querySelector('img');

// Called directly by the link modal/popover, which need free-text text/url and so
// do not fit (elm) => html. `range` is the selection saved before the modal
// opened, since opening one steals focus.
function insertLink(editable, range, { text, url }) {
  const history = History.snapshot(editable);
  const href = safeHref(url);   // an unsafe one leaves the <a> with no href at all
  const wrapper = { tag: 'A', attrs: href ? { href } : {} };
  const next = text || url;

  // Keeping the selected text means LINKING IT IN PLACE through the same runs
  // every mark command uses, so marks survive and a multi-line selection links
  // each line. "Unchanged text" cannot be the only gate: a selection of just an
  // image carries none, and `next` then falls back to a URL matching nothing.
  const wordless = _wordless(range.cloneContents());
  const selection = !range.collapsed && (wordless || _sameText(next, range.toString()))
    ? Selection.fromRange(range, editable) : null;
  const segments = selection ? selectionSegments(selection) : [];
  if (segments.length) {
    segments.forEach(seg =>
      renderInto(seg.block, setWrapper(flattenRuns(seg.block), seg.startOffset, seg.endOffset, wrapper)));
    Selection.restore(selection);
    History.commit(editable, history);
    return editable.innerHTML;
  }

  // Retyped text (or no selection at all) replaces content, and a replacement is
  // one line's worth by definition — so it goes in at the caret.
  const a = wrapperEl(wrapper);
  a.textContent = next;
  _deleteRange(editable, range);   // replaced text that spanned lines leaves one line, not two
  range.insertNode(a);
  const after = document.createRange();
  after.setStartAfter(a);
  after.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(after);
  normalizeBlocks(editable, [a]);   // a replacement at a block boundary lands outside any line
  History.commit(editable, history);
  return editable.innerHTML;
}

// `linkEl` is the <a> the popover opened on.
function updateLink(editable, linkEl, { text, url }) {
  const history = History.snapshot(editable);
  const href = safeHref(url);
  if (href) linkEl.href = href; else linkEl.removeAttribute('href');
  // Falling back to the URL is right when the user CLEARED a field that had
  // something in it, and wrong when it was empty because the link has no text.
  const next = text || (_wordless(linkEl) ? '' : url);
  // Only touch the CONTENT when the text actually changed: editing just the
  // address is the common case, and rewriting there flattens every mark inside the
  // link. Through _sameText, not ===, because the <input> trims what it returns.
  if (next && !_sameText(next, linkEl.textContent)) {
    // New text cannot be mapped onto the old runs position by position, so it
    // keeps the marks the whole link shared — measured against the <a>, so the
    // link's own colour and underline are correctly not marks.
    linkEl.replaceChildren(wrapText(next, settledMarks(linkEl, commonMarks(flattenRuns(linkEl)))));
  }
  History.commit(editable, history);
  return editable.innerHTML;
}

/* MENTIONS. A mention is a link whose text the user did not type, so insertLink
   already IS the insertion:

     const m = mentionQueryAt(editable);
     if (m) insertLink(editable, m.range, { text: name, url: 'mailto:' + email });

   That leaves the engine one question — is the caret inside an @token, and where
   does it start — which belongs here because the host's obvious answer (scan back
   through textContent) is wrong for the three reasons this file's coordinate
   system exists: an armed marker inside the token, a mark boundary splitting it
   across two spans, and an atomic that no textContent index accounts for. */

// The block's content in OFFSET space, so an index into this string IS an offset.
// An atomic becomes a newline — whitespace, so \S stops at it, which is the whole
// rule for free: a name cannot have a picture in the middle of it.
function _blockText(block) {
  const walker = document.createTreeWalker(block, COUNTED_NODES, COUNTED_FILTER);
  let out = '', n;
  while ((n = walker.nextNode())) {
    out += n.nodeType === 3 ? stripZwsp(n.data) : (nodeLength(n) ? '\n' : '');
  }
  return out;
}

// nodeAtOffset returns raw offsets against the live text nodes, markers and all,
// which is exactly what a Range needs.
function _rangeOverBlock(block, start, end) {
  const a = nodeAtOffset(block, start), b = nodeAtOffset(block, end);
  const range = document.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  return range;
}

// The '@' must START a word, or "ask bob@corp.com" pops a contact list and then
// replaces what the user wrote. \S ends the token at the first space, without
// which the query grows for the rest of the paragraph.
const MENTION_QUERY = /(?:^|\s)@(\S*)$/;

// { query, range } for the @token the caret is in, else null. The range covers
// the '@' too, so the token the user was typing is what the link replaces.
function mentionQueryAt(editable) {
  const snap = Selection.snapshot();
  if (!snap || !snap.collapsed || !editable.contains(snap.startNode)) return null;
  const block = blockContaining(editable, snap.startNode);
  if (!block) return null;

  const caret = offsetInBlock(block, snap.startNode, snap.startOffset);
  const m = MENTION_QUERY.exec(_blockText(block).slice(0, caret));
  if (!m) return null;
  const query = m[1];
  return { query, range: _rangeOverBlock(block, caret - query.length - 1, caret) };
}

// The image bar's direct entry point, for the one thing a data-value cannot hold:
// the pixel width a drag commits. No saved-range parameter, unlike insertLink —
// the bar always has the image, since it is drawing an outline around it.
function editImage(editable, args) {
  editorFor(editable).exec('image', args);
  return editable.innerHTML;
}

function removeLink(editable, linkEl) {
  const history = History.snapshot(editable);
  unwrapEl(linkEl);
  History.commit(editable, history);
  return editable.innerHTML;
}

/* THE INGRESS POLICY, which is deliberately NOT the paste policy. Paste is an
   allow-list because a paste is foreign markup entering a document the user is
   authoring. What arrives HERE is the editor's own draft or a message being
   replied to, and the host puts its own UI inside that tree — the quote's
   collapse control is a <button contenteditable="false" class="wmail_quote">, all
   three of which the paste sweep drops, so running it here would eat the document
   it was meant to protect.

   So this door asks the smaller question: refuse what must not be true of ANY
   document — execution, and layout that escapes the mail body — and keep
   everything that renders. That matters because the same door is handed a REMOTE
   message: assigned to innerHTML, an `<img onerror>` RUNS and a campaign's <style>
   applies to the whole application. */

// Nothing here renders mail content: they execute, fetch a foreign document, or
// configure a page we are not. BUTTON, INPUT and SVG are the difference from
// PASTE_DROP_TAGS. <style> is knowingly poorer than Gmail, which SCOPES it.
const ADOPT_DROP_TAGS = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'BASE', 'TITLE',
  'HEAD', 'NOSCRIPT', 'TEMPLATE', 'IFRAME', 'OBJECT', 'EMBED', 'FRAME', 'FRAMESET']);

// Every attribute dereferenced as a URL, the SVG spelling included: an inline icon
// survives this door even though paste drops <svg> whole.
const URL_ATTRS = /^(href|src|srcset|action|formaction|data|poster|background|xlink:href)$/i;
// A DENY-list, where paste's SAFE_URL is an allow-list: a quoted message is full
// of relative links, and refusing those would strip working hrefs out of the mail
// being answered. Whitespace and control characters go first, because a parser
// ignores them inside a scheme — `java&#10;script:` navigates.
const EXECUTABLE_URL = /^(?:javascript|vbscript):|^data:text\/html/i;
const _executableUrl = url => EXECUTABLE_URL.test((url || '').replace(/[\s\u0000-\u001F]/g, ''));

// `position` and nothing else, because it is the one declaration whose effect is
// not confined to the box it is written on: fixed and absolute take an element out
// of the mail body's flow, where it can cover the editor's own furniture.
function sanitizeAdopted(root) {
  root.querySelectorAll('*').forEach(el => {
    if (!el.parentNode) return;                       // already removed with an ancestor
    if (ADOPT_DROP_TAGS.has(el.tagName)) { el.remove(); return; }
    [...el.attributes].forEach(a => {
      if (/^on/i.test(a.name) || (URL_ATTRS.test(a.name) && _executableUrl(a.value))) {
        el.removeAttribute(a.name);
      }
    });
    if (el.style.position) { el.style.position = ''; _dropEmptyStyle(el); }
  });
  return root;
}

// DOMParser, not `editable.innerHTML = html`: the parsed document is inert.
// Cleaning AFTER the assignment does not work — the onerror has already fired.
function _adoptHtml(editable, html) {
  const parsed = new DOMParser().parseFromString(html || '', 'text/html').body;
  sanitizeAdopted(parsed);
  const doc = editable.ownerDocument;
  editable.innerHTML = '';
  [...parsed.childNodes].forEach(n => editable.appendChild(doc.importNode(n, true)));
}

/* ADOPT is the way content ENTERS the editor, and the mirror of
   serializeComposeBody: assign through it and the document is in editing shape
   and fully decorated before anyone can look at it. A `.compose-body.innerHTML =`
   at the call site instead means the engine can guarantee invariants about
   documents it has TOUCHED and none about the document it HOLDS.

   Two shapes: pass HTML to replace the body with it, or pass nothing to adopt
   whatever was just put there by hand — a reply builds its quoted original as
   nodes, which is the same event as far as the engine is concerned. */
function adoptComposeBody(editable, html) {
  wireComposeEditor(editable);
  // Both shapes are swept, because both carry foreign markup. See sanitizeAdopted
  // for what "swept" means here, and why it is not what paste means by it.
  if (html !== undefined) _adoptHtml(editable, html); else sanitizeAdopted(editable);
  normalizeBlocks(editable);
  /* A mark on an <li> restyles the ::marker, which inherits from the item — the
     rule renderInto states and every command obeys. An ARRIVING document obeys
     nothing: a draft written before that rule existed, or any other client's
     list, can carry a size on the item and render a bullet to match. Settled at
     the door, so an old draft is repaired rather than merely prevented from
     getting worse. Paste needs no call — it renders every landed line. */
  _settleItemMarks([...editable.querySelectorAll('li')]);
  // The other door RTL arrives through, with the same Enter problem a paste has.
  // Idempotent, so a draft carrying what it left with costs nothing.
  settleDirection(editable, _linesInOrder(editable));
  return editable;
}

/* SERIALIZE FOR SENDING. The editing DOM and the wire format differ in STRUCTURE
   only, and this is the one place they are allowed to differ at all — nothing here
   styles anything, because a document also leaves by the CLIPBOARD, which never
   comes through here.

   Not for drafts: a draft is reloaded straight back into the editor and has to
   stay in editing shape, where the nesting below would put a container INSIDE a
   line. Drafts save innerHTML as-is and come back through adoptComposeBody. */
function serializeComposeBody(editable) {
  /* Egress is a MOMENT the document must be well-formed at, and typing is not a
     command, so nothing else guarantees it. On the LIVE tree and BEFORE the clone,
     both because the lockstep walk below is only sound while the two trees match
     and because a line normalizing CREATES has a direction of its own to settle —
     normalizing the clone afterwards left exactly those lines unwired, shipping
     the `auto` that Word's engine has no value for. Idempotent, so a document
     already in shape pays an attribute write at most. */
  normalizeBlocks(editable);
  settleDirection(editable, _linesInOrder(editable));
  const out = editable.cloneNode(true);   // the user is still typing in the original
  _wireDirections(editable, out);
  _nestListsForOutput(out);
  _unwrapNestedBlocks(out);               // a wrapper holding only blocks carries nothing
  out.querySelectorAll(PASTE_BLOCK_SELECTOR).forEach(_dropEmptyStyle);
  _dropEmptyMarks(out);                   // ...and so is the span one was parked in
  _unwrapMarklessSpans(out);              // ...and so is one the user typed into
  _dropNonContent(out);                   // ...and so is the host's own UI
  // normalizeBlocks above put the document back in EDITING shape, dir="auto" and
  // all. Nothing unresolved leaves: removing it means "inherit", which is what a
  // line nobody stated a direction for does anyway.
  out.querySelectorAll('[dir="auto"]').forEach(el => el.removeAttribute('dir'));
  return stripZwsp(out.innerHTML);        // caret-format markers are an editing artifact
}

// Nothing that cannot be CONTENT leaves the building. These arrive from INSIDE,
// not from a paste: the host builds its own controls into the message body, and
// the quote's "···" toggle is a real <button> in the content tree.
// contenteditable is stripped from everything, since it describes the EDITOR.
const NEVER_CONTENT = 'button, input, select, textarea, script, style, iframe, object, embed, form, link, meta, base';
function _dropNonContent(root) {
  root.querySelectorAll(NEVER_CONTENT).forEach(el => el.remove());
  root.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
}

// A <span> with no style is not a mark and the run model cannot produce one, so
// one that exists is a caret-format placeholder that has been typed into —
// scaffolding live, nothing on the wire, and not empty enough for _dropEmptyMarks.
function _unwrapMarklessSpans(root) {
  [...root.querySelectorAll('span')].reverse()
    .forEach(el => { if (!el.getAttribute('style')) unwrapEl(el); });
}

// An armed session's marker: stripZwsp empties the text, but the styled <span>
// around it would still ship. Deepest first; a <br> or an <img> is not empty.
function _dropEmptyMarks(root) {
  [...root.querySelectorAll(INLINE_MARK_TAGS.join(','))].reverse().forEach(el => {
    if (ATOMIC_TAGS.has(el.tagName)) return;
    if (!stripZwsp(el.textContent) && !el.querySelector('br, img')) el.remove();
  });
}

// <ul><ul> -> <li><ul>. The editor nests lists as SIBLINGS, which keeps a line a
// leaf, but a list may only contain <li> and assistive tech reads depth off the
// tree. Deepest-first, so an inner list is correct when its parent moves.
function _nestListsForOutput(root) {
  const nested = [...root.querySelectorAll('ul > ul, ul > ol, ol > ul, ol > ol')].reverse();
  nested.forEach(list => {
    let host = list.previousElementSibling;
    if (!host || host.tagName !== 'LI') {
      host = document.createElement('li');
      // Bullet-less: it exists only for the sub-list to hang off, and a marker
      // would be a bullet the sender never typed.
      host.style.listStyle = 'none';
      list.before(host);
    }
    host.appendChild(list);
  });
}

window.adoptComposeBody = adoptComposeBody;         // in  — see the pair above
window.serializeComposeBody = serializeComposeBody; // out
window.composeEditorWrapper = composeEditorWrapper;
window.wireComposeEditor = wireComposeEditor;       // the one setup call — history + caret watcher
window.wireComposeHistory = wireComposeHistory;     // still exported: wireComposeEditor is additive
window.syncToolbar = syncToolbar;                   // both of the next two at once — call this one
window.syncToolbarDropdown = syncToolbarDropdown;
window.syncFontTriggerLabel = syncFontTriggerLabel;
window.flushCaretFormat = flushCaretFormat;
window.editImage = editImage;
window.insertBlocks = insertBlocks;       // the app's own markup — signature, template, image
window.mentionQueryAt = mentionQueryAt;   // pair its .range with insertLink — see there
window.insertLink = insertLink;
window.updateLink = updateLink;
window.removeLink = removeLink;

})();


// small font makes the list number small too
// turning a ol into ul loses nesting
// toggling a list in gmail puts it back one layer
// indenting back doesn put the two lists together
// quotes nesting
// remove formatting should reset block alignment and indentation