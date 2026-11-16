// All time on the Grind tab: every Lemon and Meat eaten since you started tracking, and three more all time numbers, in one window that
// steps through three views (the Potion Shop, Your grind, the Orchard) with one Next button (2026-11-09; since 2026-11-15 it opens on the Potion Shop, the Orchard comes last).
// The Orchard: a tree for every 100 Lemons and a ghost Ribbon Pig for every 50 Meat, and ten little ones turn into one big one (a run
// eats about 440 Lemons an hour, so a regular outgrows any stage of little trees within weeks). The Tab: a shop receipt of what was
// bought, eaten and spent, and the Frequent Eater card: a stamp for every 1,000 eaten, and a full card of ten can be claimed for a
// stack of potions from REWARD_FROM in game while claims are on (the beta). Bought is only what a run saw, so Eaten can pass it: a run that
// starts with a full bag buys nothing. Then Monsters felled (an estimate, with a podium of the top three), Potions per level (with one
// level's shopping list) and Maps visited (with a trail of signs), numbers from lifetime(). First the words and sums, as pure functions; then build, which draws it.
// window.GrindAllTime = { SWAP_MS, tiers, treeWords, pigWords, stampKinds, cardOf, trailOf, podiumOf, checkedEaten, looksOff, build }
(function () {
'use strict';

const TREE = 100, GHOST = 50, STAMP = 1000, CARD = 10, CARD_EATS = STAMP * CARD;
// A claim's count (supabase/eater-claims.sql mirrors checkedEaten): a run's Lemons and Meat count up to CLAIM_CAP a minute. The fastest real
// drinking on record is 41 Lemons in 5.55 minutes (7.4 a minute, the 2026-10-31 Tomb replay) and All time's usual is about 440 an hour
// (7.3 a minute), so 20 leaves room for two potions on the go and then some. CLAIM_SLACK_MIN: how late a run's first save can be
const CLAIM_CAP = 20, CLAIM_SLACK_MIN = 5;
const SWAP_MS = 15000;
// who hands over a claimed card's potions, and how many
const REWARD_FROM = 'Rimmah', REWARD_N = 100;
// the podium: how tall each place's step is, and the most room a monster's picture gets
const STEP_H = { 1: 56, 2: 40, 3: 28 }, MOB_H = 72, MOB_W = 104;
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
// the Frequent Eater card: a stamp for every 1,000 eaten, ten to a card. claimed: how many cards this player has claimed. A full card
// that isn't claimed is 'full'; otherwise it's the next card filling, 'claimed' once there's a claim to show. When the total falls under
// what was claimed (only so many runs load), no stamp shows and the way to go grows: never a negative, never a second claim
function cardOf(eaten, claimed) {
  claimed = claimed || 0;
  const no = claimed + 1;
  if (Math.floor(eaten / CARD_EATS) > claimed) return { state: 'full', no, on: CARD, toGo: 0 };
  return { state: claimed ? 'claimed' : 'filling', no, on: Math.max(0, Math.min(CARD - 1, Math.floor((eaten - claimed * CARD_EATS) / STAMP))), toGo: no * CARD_EATS - eaten };
}
// Maps visited's trail: at most max signs (the favorite, the newest, then the most trained), in the order they were first trained.
// maps: lifetime()'s, each { id, mins, first }. A favorite that is also the newest is the favorite
function trailOf(maps, favId, newestId, max) {
  max = max || 8;
  const tot = maps.reduce((a, m) => a + m.mins, 0), rank = m => m.id === favId ? 0 : m.id === newestId ? 1 : 2;
  const keep = maps.slice().sort((a, b) => rank(a) - rank(b) || b.mins - a.mins).slice(0, max).sort((a, b) => a.first - b.first);
  return { signs: keep.map(m => ({ id: m.id, share: tot ? m.mins / tot : 0, fav: m.id === favId, newest: m.id === newestId && m.id !== favId })), more: maps.length - keep.length };
}
// the podium's steps left to right: second, first in the middle, third. Fewer monsters, fewer steps
function podiumOf(tops) {
  return [[1, 2], [0, 1], [2, 3]].filter(([i]) => tops && tops[i]).map(([i, place]) => ({ id: tops[i].id, n: tops[i].n, place }));
}
// what a claim may count, from saved runs as the database holds them (created_at is the database's own clock, at a run's first save).
// A run counts when it gained EXP and has active minutes. Its time runs from its start, but never from before the run before it ended
// (runs can't overlap) nor from more than slackMin before it was first saved (a run saved while it happened was saved in its first
// minutes; one pasted in afterwards gets the slack and no more), up to its end or now. Lemons and Meat count up to cap a minute of that.
// o: { lemon, meat, cap, slackMin, now }. Returns { eaten, hours, runs, perHour, top3 } (top3: what the three biggest runs added)
function checkedEaten(rows, o) {
  const slack = o.slackMin * 60000, ids = o.lemon.concat(o.meat), each = [];
  const runs = rows.map(r => ({ r, a: Date.parse(r.started_at), b: Math.min(Date.parse(r.ended_at), o.now), c: Date.parse(r.created_at) }))
    .filter(x => x.r.exp > 0 && x.r.active_min > 0 && isFinite(x.a) && isFinite(x.b) && isFinite(x.c))
    .sort((p, q) => p.a - q.a || p.c - q.c);
  let end = -Infinity, eaten = 0, mins = 0;
  for (const x of runs) {
    const m = Math.min(x.r.active_min, (x.b - Math.max(x.a, end, x.c - slack)) / 60000);
    end = Math.max(end, x.b);
    if (!(m > 0)) continue;
    let ate = 0;
    for (const p of x.r.potions || []) if (ids.includes(+p.id) && p.used > 0) ate += +p.used;
    const n = Math.min(Math.floor(ate), Math.floor(o.cap * m));
    eaten += n; mins += m; each.push(n);
  }
  each.sort((p, q) => q - p);
  return { eaten, hours: mins / 60, runs: each.length, perHour: mins ? eaten / (mins / 60) : 0, top3: each.slice(0, 3).reduce((a, n) => a + n, 0) };
}
// worth a second look before handing anything over: drinking within 20% of the cap, or most of the total from three runs
const looksOff = (c, cap) => c.perHour >= 0.8 * cap * 60 || c.top3 > c.eaten / 2;
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

// build({ el, pics: { lemon, meat }, mapName, mobName, sprites, mesos, claims }): the window, hidden until something has been eaten.
// sprites(): data/mob-sprites.json's { id: [w, h, frames] } once it has loaded. mesos: a number in few characters. claims: { on,
// signedIn(), ign(), setIgn(name), claim({ card_no, reward, ign }) -> Promise } (left out, the card only counts).
// update(L, { since, claims }): L is lifetime()'s, since the bar's small line, claims the player's claim rows [{ card_no, reward,
// created_at }]. Called every few seconds through a run, so each part draws again only when it changes
function build({ el, pics, mapName, mobName, sprites, mesos, claims }) {
  const put = (node, text) => { if (node.textContent !== text) node.textContent = text; };
  const short = mesos || fmt, C = claims || { on: false };

  const FACES = ['tab', 'kills', 'potions', 'maps', 'orchard'];
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
  // the card's parts are made once and shown or hidden, so a name being typed stays through a redraw
  const cardName = el('h3', {}), stamps = el('div', { class: 'g-at-stamps' }), toGo = el('span', { class: 'g-at-togo' }), toWhat = el('span', {}), joke = el('small', {});
  const line = el('div', { class: 'g-at-next' }, toGo, toWhat);
  const pickBtn = kind => el('button', { type: 'button', class: 'g-at-opt', 'data-reward': kind, 'aria-pressed': 'false' }, pics[kind] ? el('img', { src: pics[kind], alt: '' }) : null, REWARD_N + (kind === 'lemon' ? ' Lemons' : ' Meat'));
  const picks = { lemon: pickBtn('lemon'), meat: pickBtn('meat') };
  const pickRow = el('div', { class: 'g-at-pick', role: 'group', 'aria-label': 'Your reward', hidden: '' }, picks.lemon, picks.meat);
  const nameIn = el('input', { type: 'text', class: 'g-at-ign', maxlength: '12', autocomplete: 'off', 'aria-label': 'Your character name', placeholder: 'Your character name' });   // joins the card only while it asks: Grind has nothing to type otherwise
  const claimBtn = el('button', { type: 'button', class: 'k-btn key sm g-at-claim', hidden: '' }, 'Claim it');
  const card = el('div', { class: 'g-at-card' }, cardName, stamps, line, pickRow, claimBtn, joke);

  // Monsters felled, Potions per level and Maps visited are one view, Your grind: three rows in the pop-out's row pattern
  // (a picture, a name with one quiet line under it, the number on the right), one faint line between them
  const statRow = () => {
    const s = { ico: el('span', { class: 'g-at-sico' }), label: el('div', { class: 'g-tl' }), a: el('div', { class: 'g-ts' }), b: el('div', { class: 'g-ts' }), n: el('div', { class: 'g-tn' }) };
    s.el = el('div', { class: 'g-at-srow' }, s.ico, el('div', { class: 'g-at-words' }, s.label, s.a, s.b), s.n);
    return s;
  };
  const killsFace = statRow(), potionsFace = statRow(), mapsFace = statRow();
  const statsFace = el('div', { class: 'g-at-face', 'data-face': 'stats' }, el('div', { class: 'k-pad g-at-stat' }, killsFace.el, potionsFace.el, mapsFace.el));
  const faces = [
    el('div', { class: 'g-at-face', 'data-face': 'tab' }, el('div', { class: 'k-pad g-at-tab' }, el('div', { class: 'g-at-recw' }, receipt), card)),
    statsFace,
    el('div', { class: 'g-at-face', 'data-face': 'orchard' }, stage),
  ];
  const root = el('section', { class: 'g-stop', id: 'g-alltime', hidden: '' }, bar, el('div', { class: 'g-at-faces' }, faces));

  // the swap: always opens on the Potion Shop, then steps on every SWAP_MS while it's there to be seen. It holds under the mouse or the keyboard,
  // stops for good once you press Next, and never swaps by itself for someone who asked for less motion. All three views share a grid cell,
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

  let groveDrew = null, penDrew = null, tabDrew = null, cardDrew = null, icoDrew = null;
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
    return [el('div', { class: 'g-at-ghost' + (g.big ? ' big' : '') + (g.flip ? ' flip' : ''), style: '-webkit-mask-image:url(' + PIG + ');mask-image:url(' + PIG + ');-webkit-mask-size:auto ' + g.h + 'px;mask-size:auto ' + g.h + 'px;width:' + w + 'px;height:' + g.h + 'px;left:' + left + ';top:' + Math.round(g.top) + 'px' }),
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
    const lemon = L.lemon, meat = L.meat, eaten = lemon.used + meat.used, thirst = L.thirst, best = L.best && L.best.lemons;
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
  }
  // The Frequent Eater card. With claims off it only counts: every 10,000 is a card filled, for nothing. With claims on a full card
  // waits to be claimed, one at a time, and the count of claims (the database's) says which card this is
  const PER = 'One stamp for every ' + fmt(STAMP) + ' Lemons or Meat. ';
  const prize = kind => REWARD_N + (kind === 'meat' ? ' Meat' : ' Lemons');
  let pick = 'lemon', busy = false, oops = '', asking = false, lastL = null, lastRows = [];
  function drawCard(L, rows) {
    lastL = L; lastRows = rows || [];
    const lemon = L.lemon.used, meat = L.meat.used, eaten = lemon + meat, signed = !!(C.on && C.signedIn());
    const key = JSON.stringify([lemon, meat, C.on, signed, lastRows.map(r => [r.card_no, r.reward, r.created_at]), pick, busy, oops, asking]);
    if (key === cardDrew) return;
    cardDrew = key;
    const filled = C.on ? lastRows.length : Math.floor(eaten / CARD_EATS), S = cardOf(eaten, filled);
    const last = C.on && lastRows.length ? lastRows.reduce((a, r) => r.card_no > a.card_no ? r : a) : null;
    // the claimed card stays up until the next one has a stamp. A total that fell under its claim (only the newest runs load) shows the next card, empty
    const justClaimed = S.state === 'claimed' && S.on === 0 && S.toGo <= CARD_EATS;
    const no = justClaimed ? S.no - 1 : S.no, on = justClaimed ? CARD : S.on, full = S.state === 'full';
    cardName.textContent = 'Frequent Eater card' + (no > 1 ? ' no. ' + no : '') + (full ? ' · full!' : justClaimed ? ' · claimed' : '');
    const kinds = stampKinds(lemon, meat, on);
    stamps.replaceChildren(...Array.from({ length: CARD }, (_, i) => {
      const pic = i < on ? pics[kinds[i]] : null;
      return el('span', { class: 'k-ring g-at-stamp' + (i < on ? '' : ' off') }, pic ? el('img', { src: pic, alt: '' }) : null);
    }));
    const found = last ? 'Find ' + REWARD_FROM + ' in game for your ' + prize(last.reward) : '', when = last ? 'Claimed on ' + day(Date.parse(last.created_at)) + '.' : '';
    const can = full && signed;
    line.hidden = full;
    toGo.textContent = justClaimed ? '' : fmt(S.toGo);
    toWhat.textContent = justClaimed ? found : ' more to a full card';
    pickRow.hidden = !can || asking;
    if (can && asking) { if (!nameIn.parentNode) card.insertBefore(nameIn, claimBtn); } else if (nameIn.parentNode) nameIn.remove();
    claimBtn.hidden = !can;
    claimBtn.disabled = busy;
    claimBtn.textContent = busy ? 'Claiming' : 'Claim it';
    for (const k in picks) { picks[k].setAttribute('aria-pressed', String(k === pick)); picks[k].disabled = busy; }
    joke.classList.toggle('bad', can && !!oops);
    joke.textContent = !C.on ? (filled ? 'You filled ' + filled + (filled === 1 ? ' card' : ' cards') + '. That got you absolutely nothing.' : PER + 'Ten stamps gets you absolutely nothing.')
      : can ? oops      // the name box says what it wants, so asking adds no line and the card keeps its height
      : full ? 'Sign in with Discord to claim.'
      : justClaimed ? when
      : S.state === 'claimed' ? found + '. ' + when
      : PER + 'A full card gets you ' + REWARD_N + ' Lemons or Meat from ' + REWARD_FROM + ', in game. Beta only.';
    joke.hidden = !joke.textContent;
  }
  const redraw = () => { if (lastL) drawCard(lastL, lastRows); };
  for (const k in picks) picks[k].addEventListener('click', () => { pick = k; redraw(); });
  function claimNow() {
    if (busy || !lastL) return;
    let ign = (C.ign() || '').trim();
    if (!ign) {
      ign = nameIn.value.trim().slice(0, 12);
      if (!ign) { asking = true; oops = ''; redraw(); nameIn.focus(); return; }
      C.setIgn(ign);
    }
    busy = true; oops = ''; asking = false; redraw();
    // the claim's own row comes back through update's claims; a no from the database is said in its own words
    Promise.resolve().then(() => C.claim({ card_no: lastRows.length + 1, reward: pick, ign }))
      .then(() => { busy = false; }, e => { busy = false; oops = e && e.db && e.message ? e.message : 'Couldn\'t claim it. Try again in a minute.'; })
      .then(redraw);
  }
  claimBtn.addEventListener('click', claimNow);
  nameIn.addEventListener('keydown', e => { if (e.key === 'Enter') claimNow(); });

  const first = n => 'about ' + fmt(n >= 1000 ? Math.round(n / 100) * 100 : Math.max(10, Math.round(n / 10) * 10));
  // the row pictures: the monster killed most (its first walk frame), and a Lemon for the potions
  function drawIcons(L) {
    const K = L.kills, top = K && K.n > 0 && K.top ? K.top.id : null, S = (sprites && sprites()) || {}, sp = top != null ? S[top] : null;
    const key = JSON.stringify([top, sp]);
    if (key === icoDrew) return;
    icoDrew = key;
    const k = sp ? Math.min(1, MOB_H / sp[1], MOB_W / sp[0]) : 0;
    killsFace.ico.replaceChildren(...(sp ? [el('div', { class: 'g-at-mob', 'aria-hidden': 'true', style: 'width:' + Math.round(sp[0] * k) + 'px;height:' + Math.round(sp[1] * k) + 'px;background-image:url(sprites/mobs/' + top + '.png);background-size:' + Math.round(sp[0] * k) * sp[2] + 'px ' + Math.round(sp[1] * k) + 'px' })] : []));
    potionsFace.ico.replaceChildren(...(pics.lemon ? [el('img', { src: pics.lemon, alt: '' })] : []));
  }
  function drawStats(L) {
    const K = L.kills, P = L.potionsPer, V = L.visited, put2 = (f, label, n, a, b) => { put(f.label, label); put(f.n, n); put(f.a, a); put(f.b, b); };
    if (K && K.n > 0) put2(killsFace, 'Monsters felled', first(K.n), K.top ? 'Mostly ' + mobName(K.top.id) + ', ' + first(K.top.n) : '', K.skipped ? K.skipped + (K.skipped === 1 ? ' run' : ' runs') + ' with no map left out' : 'An estimate from your EXP');
    else put2(killsFace, 'Monsters felled', '·', 'Shows up after a run on a map the game can name', K && K.skipped ? K.skipped + (K.skipped === 1 ? ' run' : ' runs') + ' with no map left out' : '');
    if (P) put2(potionsFace, 'Potions per level', fmt(P.n), 'on average, every kind of potion' + (P.list && P.list.mesos ? ', about ' + short(P.list.mesos) + ' mesos a level' : ''), 'Best run ' + fmt(P.best.v) + ' at ' + mapName(P.best.row.map_id) + '. Worst run ' + fmt(P.worst.v) + ' at ' + mapName(P.worst.row.map_id) + '.');
    else put2(potionsFace, 'Potions per level', '·', 'Shows up after runs of 10 minutes or more', '');
    if (V && V.n) put2(mapsFace, 'Maps visited', fmt(V.n), 'Favorite: ' + mapName(V.fav.id) + ' (' + Math.round(V.fav.share * 100) + '% of your hours)', V.newest ? 'Newest: ' + mapName(V.newest.id) : '');
    else put2(mapsFace, 'Maps visited', '·', 'Shows up after a run on a map the game can name', '');
  }
  function update(L, o) {
    put(note, (o && o.since) || '');
    put(lemonSign.n, fmt(L.lemon.used)); put(lemonSign.words, treeWords(L.lemon.used));
    put(meatSign.n, fmt(L.meat.used)); put(meatSign.words, pigWords(L.meat.used));
    drawGrove(L.lemon.used); drawPen(L.meat.used); drawTab(L); drawCard(L, o && o.claims); drawStats(L);
    drawIcons(L);
  }
  return { el: root, update };
}

window.GrindAllTime = { SWAP_MS, REWARD_FROM, STAMP, CARD, CARD_EATS, CLAIM_CAP, CLAIM_SLACK_MIN, tiers, treeWords, pigWords, stampKinds, cardOf, trailOf, podiumOf, checkedEaten, looksOff, build };
})();
