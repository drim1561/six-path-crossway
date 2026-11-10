// All time on the Grind tab: every Lemon and Meat eaten since you started tracking, and three more all time numbers, in one window that
// steps through five views with one Next button (2026-11-09, always opens on the Orchard).
// The Orchard: a tree for every 100 Lemons and a ghost Ribbon Pig for every 50 Meat, and ten little ones turn into one big one (a run
// eats about 440 Lemons an hour, so a regular outgrows any stage of little trees within weeks). The Tab: a shop receipt of what was
// bought, eaten and spent, and a stamp card that gets you nothing. Bought is only what a run saw, so Eaten can pass it: a run that
// starts with a full bag buys nothing. Then Monsters felled (an estimate), Potions per level and Maps visited, small cards of numbers
// from lifetime(). First the words and sums, as pure functions; then build, which draws it.
// window.GrindAllTime = { SWAP_MS, tiers, treeWords, pigWords, stampsOf, stampKinds, build }
(function () {
'use strict';

const TREE = 100, GHOST = 50, STAMP = 200, CARD = 10;
const SWAP_MS = 15000;
// past what the stage can hold the art stops growing, and the number on the sign carries on
const BIG_TREES_MAX = 35, BIG_GHOSTS_MAX = 12;
// Ribbon Pig's first walking frame (data/mob-sprites.json)
const PIG = 'sprites/mobs/10.png', PIG_W = 68, PIG_H = 50;
const FRUIT = 14, FRUIT_BIG = 34;

const fmt = n => Math.round(n).toLocaleString('en-US');
const day = ms => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

// how a count is drawn: big ones (ten little), little ones, and how far along the next one is
function tiers(n, one) {
  return { big: Math.floor(n / (one * 10)), little: Math.floor((n % (one * 10)) / one), part: (n % one) / one };
}
function treeWords(n) {
  if (!n) return 'No trees yet';
  const t = tiers(n, TREE), bit = t.part < 0.25 ? 'a bit' : t.part < 0.5 ? 'some' : t.part < 0.75 ? 'half' : 'most';
  if (!t.big && !t.little) return bit[0].toUpperCase() + bit.slice(1) + ' of your first tree';
  const says = [];
  if (t.big) says.push(t.big + (t.big === 1 ? ' big tree' : ' big trees'));
  if (t.little) says.push(t.big ? t.little + ' little' : t.little + (t.little === 1 ? ' tree' : ' trees'));
  if (t.part) says.push(bit + ' of another');
  return says.join(', ');
}
function pigWords(n) {
  const t = tiers(n, GHOST);
  if (!t.big && !t.little) return 'No pigs gone yet. One is watching';
  if (!t.big) return t.little + (t.little === 1 ? ' Ribbon Pig' : ' Ribbon Pigs') + ' gone. One left';
  return t.big + (t.big === 1 ? ' big ghost' : ' big ghosts') + (t.little ? ', ' + t.little + ' little' : '') + '. One pig left';
}
// the stamp card: how many on this card, how many cards are full, how far to the next stamp
function stampsOf(eaten) {
  const got = Math.floor(eaten / STAMP);
  return { on: got % CARD, cards: Math.floor(got / CARD), next: (got + 1) * STAMP - eaten, first: got === 0 };
}
// which picture each stamp gets: Meat as often as Meat is eaten, the same stamps every time
function stampKinds(lemon, meat, n) {
  const share = meat / (lemon + meat || 1), steps = i => Math.floor(i * share + 1e-9);
  return Array.from({ length: n }, (_, i) => steps(i + 1) > steps(i) ? 'meat' : 'lemon');
}

/* ---------- the art: small pictures, drawn once and kept ---------- */

const seeded = seed => () => {
  seed = (seed + 0x6D2B79F5) | 0;
  let z = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  z ^= z + Math.imul(z ^ (z >>> 7), 61 | z);
  return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
};
const drawn = new Map();
function picture(key, w, h, paint) {
  if (drawn.has(key)) return drawn.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  paint((a, b, ww, hh, col) => { x.fillStyle = col; x.fillRect(a, b, ww, hh); });
  const url = c.toDataURL();
  drawn.set(key, url);
  return url;
}
const LIT = { tr: '#5a4630', tr2: '#3a2c1a', a: '#25502f', b: '#2f6339', c: '#44804a', l: '#ffd84d', l2: '#c99a1e' };
const DIM = { tr: '#2c2115', tr2: '#1f170e', a: '#17331f', b: '#1f4228', c: '#2b5433', l: '#c9a436', l2: '#8f7220' };
// a tree: a crown of four blobs on a trunk, with spots lemons on it
function treeUrl(t) {
  const S = t.big ? 1.65 : 1, W = Math.round(28 * S), H = Math.round(35 * S), sc = v => Math.round(v * S), P = t.dim ? DIM : LIT;
  return picture(['t', t.seed, t.spots, t.dim, t.big].join(), W, H, px => {
    const r = seeded(t.seed), blobs = [[14, 11, 11], [8, 14, 7], [20, 14, 7], [14, 6, 7]].map(b => b.map(v => v * S));
    const inCrown = (a, b) => blobs.some(([cx, cy, rad]) => (a - cx) ** 2 + (b - cy) ** 2 <= rad * rad);
    px(sc(12), sc(21), sc(4), H - sc(21), P.tr); px(sc(14), sc(21), sc(2), H - sc(21), P.tr2);
    for (let b = 0; b < sc(26); b++) for (let a = 0; a < W; a++) {
      if (inCrown(a, b)) px(a, b, 1, 1, (a - 10 * S) ** 2 + (b - 7 * S) ** 2 < 30 * S * S ? P.c : b > 15 * S ? P.a : P.b);
    }
    const spots = [], want = t.big ? FRUIT_BIG : FRUIT;
    for (let i = 0; i < 900 && spots.length < want; i++) {
      const a = 3 + Math.floor(r() * (W - 6)), b = 3 + Math.floor(r() * (sc(26) - 6));
      if (inCrown(a, b) && inCrown(a + 1, b + 1) && spots.every(s => Math.abs(s[0] - a) + Math.abs(s[1] - b) > 4)) spots.push([a, b]);
    }
    spots.slice(0, t.spots).forEach(([a, b]) => { px(a, b, 2, 2, P.l); px(a + 1, b + 1, 1, 1, P.l2); });
  });
}
const fenceUrl = () => picture('fence', 16, 16, px => {
  px(0, 4, 16, 2, '#7a5c38'); px(0, 10, 16, 2, '#7a5c38'); px(0, 6, 16, 1, '#3a2c1a'); px(0, 12, 16, 1, '#3a2c1a'); px(2, 0, 3, 16, '#8d6c44'); px(4, 0, 1, 16, '#3a2c1a');
});
const haloUrl = () => picture('halo', 14, 4, px => {
  px(2, 0, 10, 1, '#ffd84d'); px(2, 3, 10, 1, '#ffd84d'); px(0, 1, 2, 2, '#ffd84d'); px(12, 1, 2, 2, '#ffd84d');
});

// where the trees go, back to front. x runs 0 to 1 across the room a tree has, so a narrow window packs them closer
function groveOf(n) {
  const T = tiers(n, TREE), bigs = Math.min(T.big, BIG_TREES_MAX), littles = T.little + (T.part ? 1 : 0), trees = [];
  // big trees at the back in rows of seven, a later row further back
  for (let i = bigs - 1; i >= 0; i--) {
    const row = Math.floor(i / 7);
    trees.push({ big: true, x: Math.min(1, (i % 7 * 45 + row % 2 * 22) / 280), bottom: 16 + row * 16, dim: row > 0, seed: 300 + i, spots: FRUIT_BIG });
  }
  // little trees in front, beside the big ones when there are only a couple. The last one is the one growing
  const room = T.big && T.big <= 2 ? T.big * 124 : 0, step = littles > 1 ? Math.min(60, (334 - room) / (littles - 1)) : 60;
  for (let i = 0; i < littles; i++) {
    const growing = i === littles - 1 && T.part;
    trees.push({ big: false, x: (room + i * step) / 334, bottom: 10, dim: false, seed: 71 + i, spots: growing ? Math.max(1, Math.round(T.part * FRUIT)) : FRUIT });
  }
  return trees;
}
// where the ghosts go: big ones beside the sign, little ones low over the pen when a big one has taken their place
function penOf(n) {
  const G = tiers(n, GHOST), bigs = Math.min(G.big, BIG_GHOSTS_MAX), r = seeded(5), high = [], low = [];
  if (!G.big) {
    const h = G.little > 6 ? 38 : PIG_H;
    [[0, 16], [0.73, 34], [0.17, 70], [0.95, 92], [-0.1, 114], [0.55, 108], [0.95, 150], [-0.03, 160], [0.49, 170]].slice(0, G.little).forEach(([x, top], i) => high.push({ x, top, h, big: false, flip: i % 2 }));
    return { high, low };
  }
  const cols = bigs <= 4 ? 2 : bigs <= 9 ? 3 : 4, rows = Math.ceil(bigs / cols), ch = 122 / rows, h = bigs <= 4 ? 56 : bigs <= 9 ? 42 : 32;
  for (let i = 0; i < bigs; i++) {
    const at = i % cols, row = Math.floor(i / cols);
    high.push({ x: (at + 0.5) / cols + (r() - 0.5) * 0.04, top: 12 + row * ch + (ch - h) / 2 + (r() - 0.5) * 4, h, big: true, flip: i % 2, mid: true });
  }
  for (let i = 0; i < G.little; i++) low.push({ x: (i % 5 + Math.floor(i / 5) % 2 * 0.4) / 5 + (r() - 0.5) * 0.02, top: Math.floor(i / 5) * 34 + (r() - 0.5) * 4, h: 30, big: false, flip: i % 2 });
  return { high, low };
}

/* ---------- the window ---------- */

// the receipt's torn foot
const TORN = (() => {
  const teeth = [];
  for (let i = 60; i >= 0; i--) teeth.push((i / 60 * 100).toFixed(2) + '% calc(100% - ' + (i % 2 ? 0 : 8) + 'px)');
  return 'polygon(0 0, 100% 0, ' + teeth.join(', ') + ')';
})();

// build({ el, store, pics: { lemon, meat }, mapName }): the window, hidden until something has been eaten. update(L, { since }): L is
// lifetime()'s, since the bar's small line. Called every few seconds through a run, so each part draws again only when it changes
function build({ el, pics, mapName, mobName }) {
  const put = (node, text) => { if (node.textContent !== text) node.textContent = text; };

  const FACES = ['orchard', 'tab', 'kills', 'potions', 'maps'];
  const dots = el('span', { class: 'g-at-dots', 'aria-hidden': 'true' }, FACES.map(() => el('i', {})));
  const nextBtn = el('button', { type: 'button', class: 'g-at-go' }, 'Next');
  const note = el('small', {});
  const bar = el('div', { class: 'k-bar' }, el('h2', {}, 'All time'), note, el('div', { class: 'push g-at-sw', role: 'group', 'aria-label': 'What All time shows' }, dots, nextBtn));

  // The Orchard: a sign and its picture for each, the picture left out of what a screen reader says since the sign says it all
  const sign = (kind, label, key) => {
    const s = { n: el('div', { class: 'g-tn' }, '0'), words: el('div', { class: 'g-ts' }) };
    s.el = el('div', { class: 'k-card ' + kind + ' g-at-sign g-t-' + kind }, el('div', { class: 'g-tl' }, label), s.n, s.words, el('div', { class: 'g-at-key' }, key));
    return s;
  };
  const lemonSign = sign('lemon', 'Lemons eaten', 'A tree is 100, a big tree 1,000');
  const meatSign = sign('meat', 'Meat eaten', 'A ghost is 50, a big ghost 500');
  const trees = el('div', { class: 'g-at-trees', 'aria-hidden': 'true' });
  const high = el('div', { class: 'g-at-high' }), low = el('div', { class: 'g-at-low' });
  const pen = el('div', { class: 'g-at-penart', 'aria-hidden': 'true' },
    el('div', { class: 'g-at-fence', style: 'background-image:url(' + fenceUrl() + ')' }), high, low,
    el('div', { class: 'g-at-pig', style: 'background-image:url(' + PIG + ')' }), el('span', { class: 'g-at-bang' }, '!'));
  const stage = el('div', { class: 'g-at-stage' },
    el('div', { class: 'g-at-half g-at-grove' }, lemonSign.el, trees),
    el('div', { class: 'g-at-half g-at-pen' }, meatSign.el, pen));

  // The Tab: the receipt and the stamp card
  const bill = el('tbody', {});
  const since = el('small', {});
  const li = label => { const v = el('b', {}); return { v, el: el('div', { class: 'g-at-li' }, el('span', {}, label), v) }; };
  const spot = li('Thirstiest spot'), sitting = li('Biggest sitting');
  const receipt = el('div', { class: 'g-at-rec', style: 'clip-path:' + TORN },
    el('div', { class: 'g-at-rech' }, el('h3', {}, 'The Potion Shop'), since),
    el('table', { class: 'g-at-bill' },
      el('thead', {}, el('tr', {}, el('th', { scope: 'col', 'aria-label': 'Potion' }), el('th', { scope: 'col' }, 'Bought'), el('th', { scope: 'col' }, 'Eaten'), el('th', { scope: 'col' }, 'Mesos'))), bill),
    spot.el, sitting.el);
  const cardName = el('h3', {}), stamps = el('div', { class: 'g-at-stamps' }), toGo = el('span', { class: 'g-at-togo' }), toWhat = el('span', {}), joke = el('small', {});
  const card = el('div', { class: 'k-card g-at-card' }, cardName, stamps, el('div', { class: 'g-at-next' }, toGo, toWhat), joke);

  // Monsters felled, Potions per level and Maps visited: a label, a big number and two small lines each
  const statFace = kind => {
    const s = { label: el('div', { class: 'g-tl' }), n: el('div', { class: 'g-tn' }), a: el('div', { class: 'g-ts' }), b: el('div', { class: 'g-ts' }) };
    s.el = el('div', { class: 'g-at-face', 'data-face': kind }, el('div', { class: 'k-pad g-at-stat' }, s.label, s.n, s.a, s.b));
    return s;
  };
  const killsFace = statFace('kills'), potionsFace = statFace('potions'), mapsFace = statFace('maps');
  const faces = [
    el('div', { class: 'g-at-face', 'data-face': 'orchard' }, stage),
    el('div', { class: 'g-at-face', 'data-face': 'tab' }, el('div', { class: 'k-pad g-at-tab' }, el('div', { class: 'g-at-recw' }, receipt), card)),
    killsFace.el, potionsFace.el, mapsFace.el,
  ];
  const root = el('section', { class: 'k-win', id: 'g-alltime', hidden: '' }, bar, el('div', { class: 'g-at-faces' }, faces));

  // the swap: always opens on the Orchard, then steps on every SWAP_MS while it's there to be seen. It holds under the mouse or the keyboard,
  // stops for good once you press Next, and never swaps by itself for someone who asked for less motion. All five views share a grid cell,
  // so nothing below moves
  let at = 0, held = false, picked = false;
  const show = i => {
    at = i;
    faces.forEach((f, n) => { f.classList.toggle('on', n === i); f.inert = n !== i; });
    [...dots.children].forEach((d, n) => d.classList.toggle('on', n === i));
  };
  show(0);
  nextBtn.addEventListener('click', () => { picked = true; show((at + 1) % faces.length); });
  for (const [on, off] of [['mouseenter', 'mouseleave'], ['focusin', 'focusout']]) {
    root.addEventListener(on, () => { held = true; });
    root.addEventListener(off, () => { held = false; });
  }
  setInterval(() => {
    if (picked || held || document.hidden || !root.getClientRects().length) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    show((at + 1) % faces.length);
  }, SWAP_MS);

  let groveDrew = null, penDrew = null, tabDrew = null;
  function drawGrove(n) {
    const G = groveOf(n), key = JSON.stringify(G);
    if (key === groveDrew) return;
    groveDrew = key;
    trees.replaceChildren(...G.map(t => {
      const w = t.big ? 138 : 84;
      return el('img', { class: 'g-at-tree' + (t.big ? ' big' : ''), alt: '', src: treeUrl(t), style: 'left:calc((100% - ' + w + 'px) * ' + t.x.toFixed(3) + ');bottom:' + t.bottom + 'px' });
    }));
  }
  const ghost = g => {
    const w = Math.round(g.h * PIG_W / PIG_H), halo = Math.round(w * 0.42), left = g.mid ? 'calc(100% * ' + g.x.toFixed(3) + ' - ' + (w / 2) + 'px)' : 'calc((100% - ' + w + 'px) * ' + g.x.toFixed(3) + ')';
    return [el('div', { class: 'g-at-ghost' + (g.big ? ' big' : '') + (g.flip ? ' flip' : ''), style: 'background-image:url(' + PIG + ');background-size:auto ' + g.h + 'px;width:' + w + 'px;height:' + g.h + 'px;left:' + left + ';top:' + Math.round(g.top) + 'px' }),
      el('img', { class: 'g-at-halo', alt: '', src: haloUrl(), style: 'width:' + halo + 'px;height:' + Math.round(halo * 2 / 7) + 'px;left:calc(' + left + ' + ' + Math.round((w - halo) / 2) + 'px);top:' + Math.round(g.top - 4) + 'px' })];
  };
  function drawPen(n) {
    const G = penOf(n), key = JSON.stringify(G);
    if (key === penDrew) return;
    penDrew = key;
    high.replaceChildren(...G.high.flatMap(ghost));
    low.replaceChildren(...G.low.flatMap(ghost));
  }
  function drawTab(L) {
    const lemon = L.lemon, meat = L.meat, eaten = lemon.used + meat.used, S = stampsOf(eaten), thirst = L.thirst, best = L.best && L.best.lemons;
    const key = JSON.stringify([lemon.used, lemon.bought, lemon.spent, meat.used, meat.bought, meat.spent, L.first, thirst, best && best.v]);
    if (key === tabDrew) return;
    tabDrew = key;
    since.textContent = (L.first != null ? 'since ' + day(L.first) + ' · ' : '') + 'only what your runs saw';
    const row = (pic, name, g) => el('tr', {}, el('td', {}, pic ? el('img', { src: pic, alt: '' }) : null, name), el('td', {}, fmt(g.bought)), el('td', {}, fmt(g.used)), el('td', {}, fmt(g.spent)));
    const spent = lemon.spent + meat.spent;
    bill.replaceChildren(row(pics.lemon, 'Lemons', lemon), row(pics.meat, 'Meat', meat),
      el('tr', { class: 'tot' }, el('td', {}, 'Total'), el('td', {}, fmt(lemon.bought + meat.bought)), el('td', {}, fmt(eaten)), el('td', {}, spent ? fmt(spent) : 'On the house')));
    spot.el.hidden = !thirst;
    if (thirst) spot.v.textContent = mapName(thirst.id) + ' · ' + fmt(thirst.n) + (thirst.n === 1 ? ' Lemon' : ' Lemons');
    sitting.el.hidden = !best;
    if (best) sitting.v.textContent = fmt(best.v) + (best.v === 1 ? ' Lemon' : ' Lemons') + ' · ' + day(Date.parse(best.row.started_at));
    cardName.textContent = 'Frequent Eater card' + (S.cards ? ' no. ' + (S.cards + 1) : '');
    const kinds = stampKinds(lemon.used, meat.used, S.on);
    stamps.replaceChildren(...Array.from({ length: CARD }, (_, i) => {
      const pic = i < S.on ? pics[kinds[i]] : null;
      return el('span', { class: 'k-ring g-at-stamp' + (i < S.on ? '' : ' off') }, pic ? el('img', { src: pic, alt: '' }) : null);
    }));
    toGo.textContent = fmt(S.next);
    toWhat.textContent = ' more to your ' + (S.first ? 'first' : 'next') + ' stamp';
    joke.textContent = S.cards ? 'You filled ' + S.cards + (S.cards === 1 ? ' card' : ' cards') + '. That got you absolutely nothing.' : 'One stamp for every ' + STAMP + ' Lemons or Meat. Ten stamps gets you absolutely nothing.';
  }
  const first = n => 'about ' + fmt(n >= 1000 ? Math.round(n / 100) * 100 : Math.max(10, Math.round(n / 10) * 10));
  function drawStats(L) {
    const K = L.kills, P = L.potionsPer, V = L.visited, put2 = (f, label, n, a, b) => { put(f.label, label); put(f.n, n); put(f.a, a); put(f.b, b); };
    if (K && K.n > 0) put2(killsFace, 'Monsters felled', first(K.n), K.top ? 'Mostly ' + mobName(K.top.id) + ', ' + first(K.top.n) : '', K.skipped ? K.skipped + (K.skipped === 1 ? ' run' : ' runs') + ' with no map left out' : 'An estimate from your EXP');
    else put2(killsFace, 'Monsters felled', '·', 'Shows up after a run on a map the game can name', K && K.skipped ? K.skipped + (K.skipped === 1 ? ' run' : ' runs') + ' with no map left out' : '');
    if (P) put2(potionsFace, 'Potions per level', fmt(P.n), 'on average, every kind of potion', 'Best run ' + fmt(P.best.v) + ' at ' + mapName(P.best.row.map_id) + '. Worst run ' + fmt(P.worst.v) + ' at ' + mapName(P.worst.row.map_id) + '.');
    else put2(potionsFace, 'Potions per level', '·', 'Shows up after runs of 10 minutes or more', '');
    if (V && V.n) put2(mapsFace, 'Maps visited', fmt(V.n), 'Favorite: ' + mapName(V.fav.id) + ' (' + Math.round(V.fav.share * 100) + '% of your hours)', V.newest ? 'Newest: ' + mapName(V.newest.id) : '');
    else put2(mapsFace, 'Maps visited', '·', 'Shows up after a run on a map the game can name', '');
  }
  function update(L, o) {
    put(note, (o && o.since) || '');
    put(lemonSign.n, fmt(L.lemon.used)); put(lemonSign.words, treeWords(L.lemon.used));
    put(meatSign.n, fmt(L.meat.used)); put(meatSign.words, pigWords(L.meat.used));
    drawGrove(L.lemon.used); drawPen(L.meat.used); drawTab(L); drawStats(L);
  }
  return { el: root, update };
}

window.GrindAllTime = { SWAP_MS, tiers, treeWords, pigWords, stampsOf, stampKinds, build };
})();
