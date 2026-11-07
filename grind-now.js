// The Now grinding card on top of the Grind page. First its "what is worth catching here" logic, pure functions on the data
// files: each monster's drops in a column, the gear that is for you, and which of your picked-up items were the ones to catch.
// Then build, which draws the card from them.
// window.GrindNow = { shortName, dropColumns, wantedOf, forYou, pickedRows, build }
//   D = data/grind-drops.json, L = data/loot-icons.json, mobName(id) -> a monster's name
(function () {
'use strict';

const ODDS = { Lesser: 100, Intermediate: 60, Greater: 10 };

// "Cape Accuracy Scroll: Intermediate" -> "Cape Accuracy 60%"; Chaos and plain gear keep their words.
function shortName(name) {
  const m = /^(.*) Scroll: (\w+)$/.exec(name || '');
  if (!m) return name || '';
  return m[1] + ' ' + (ODDS[m[2]] ? ODDS[m[2]] + '%' : m[2]);
}

// What each monster on the map drops, one column a monster: the three most numerous (the same ones the stage draws), each
// with its own FM priced drops, priciest first, up to 3 rows (4 for a lone monster, which flows in two columns). Fewer than
// that and NPC gear fills in, labeled NPC and never gold. The priciest FM item among all the rows is gold, on every row it
// appears; with no FM price anywhere, nothing is. The For you piece (forYou, over the columns' monsters) is marked on its
// row, or joins the column of the first monster that drops it as one extra row. Monsters past the third are only named in
// also. mobIds is most numerous first. Returns { columns: [{ mob, rows: [{ id, name, short, price, cozy, npc, gold, you,
// about }] }], also: ids, any: a row anywhere, anyCozy: an FM price anywhere, anyGearCozy: an FM price on a piece of gear }
const COLUMNS = 3;
function dropColumns(mobIds, D, mobName, clsId, level) {
  const ids = mobIds || [], shown = ids.slice(0, COLUMNS), cap = shown.length === 1 ? 4 : 3;
  const item = id => D.items[id] || {};
  const row = (id, npc) => ({ id: +id, name: item(id).n, short: shortName(item(id).n), price: npc ? item(id).npc : item(id).p, cozy: npc ? undefined : item(id).c, npc, gold: false, you: false, about: undefined });
  const columns = shown.map(m => {
    const have = [...new Set(D.mobs[m] || [])];
    const fm = have.filter(id => item(id).p).sort((a, b) => item(b).p - item(a).p).slice(0, cap).map(id => row(id, false));
    const gear = fm.length >= cap ? [] : have.filter(id => !fm.some(r => r.id === +id) && item(id).lv && item(id).npc)
      .sort((a, b) => item(b).npc - item(a).npc).slice(0, cap - fm.length).map(id => row(id, true));
    return { mob: m, rows: fm.concat(gear) };
  });
  const fy = forYou(shown, D, clsId, level);
  if (fy) {
    const about = ['Lv ' + fy.level, fy.stat].filter(Boolean).join(' · ');
    let had = false;
    for (const c of columns) for (const r of c.rows) if (r.id === fy.id) { r.you = true; r.about = about; had = true; }
    if (!had) {
      const home = columns.find(c => fy.mobs.includes(c.mob));
      if (home) { const p = item(fy.id).p; home.rows.push({ id: fy.id, name: fy.name, short: fy.short, price: p || fy.npcPrice, cozy: p ? item(fy.id).c : undefined, npc: !p, gold: false, you: true, about }); }
    }
  }
  const all = columns.flatMap(c => c.rows), top = all.filter(r => r.cozy).reduce((b, r) => !b || r.price > b.price ? r : b, null);
  if (top) for (const r of all) if (r.id === top.id && r.cozy) r.gold = true;
  return { columns, also: ids.slice(COLUMNS), any: all.length > 0, anyCozy: all.some(r => r.cozy), anyGearCozy: all.some(r => r.cozy && item(r.id).lv) };
}

// the flat list pickedRows takes (what a bag pickup could be): every row's item once
function wantedOf(cols) {
  const seen = new Set(), out = [];
  for (const c of cols.columns) for (const r of c.rows) if (!seen.has(r.id)) { seen.add(r.id); out.push({ id: r.id, short: r.short, price: r.price, cozy: r.cozy }); }
  return out;
}

// The best piece for this class and level among the monsters' drops: the same rule as Builds.dropGroups (wearable by the
// class, within 10 levels either way, weapons only of its types), wearable now before soon, then the highest level.
function forYou(mobIds, D, clsId, level) {
  const cls = D.classes.find(c => c.id === clsId);
  if (!cls || level == null || !isFinite(level)) return null;
  const weapons = new Set(D.weaponSlots), mine = [];
  for (const m of mobIds || []) for (const id of (D.mobs[m] || [])) {
    const it = D.items[id];
    if (!it || !it.lv) continue;
    if (!(it.job === 0 || (it.job & cls.mask))) continue;
    if (it.lv < level - 10 || it.lv > level + 10) continue;
    if (weapons.has(it.slot) && !cls.weapons.includes(it.slot)) continue;
    const had = mine.find(e => e.id === +id);
    if (had) { if (!had.mobs.includes(m)) had.mobs.push(m); continue; }
    mine.push({ id: +id, name: it.n, short: shortName(it.n), mobs: [m], level: it.lv, stat: it.stat, npcPrice: it.npc, soon: it.lv > level });
  }
  mine.sort((a, b) => a.soon - b.soon || b.level - a.level);
  if (!mine.length) return null;
  const { soon, ...best } = mine[0];
  return best;
}

// The rows of "what you picked up": loot.items by picture. A picture shared by many ids (every scroll of a grade) is a
// maybe, naming the priciest wanted scroll it could be; a picture that is one id and wanted is a sure catch. Items that
// went down (n <= 0) are never a catch. A picture that is one id with an FM price (D = data/grind-drops.json, or else the wanted
// list's own price) carries fm and fmCozy, the rough FM worth shown beside the NPC value; a shared picture never does, because the
// bag can't tell which scroll it is. The totals stay NPC (value). Catches first, then by value; five rows by default, the rest counted.
function pickedRows(loot, wanted, L, limit = 5, D = null) {
  const rows = (loot.items || []).map(it => {
    const cell = String(it.key).slice(1), ids = (L.cells[cell] && L.cells[cell].ids) || [];
    const hits = it.n > 0 ? wanted.filter(w => ids.includes(w.id)) : [];
    const r = { key: it.key, cell: +cell, name: it.name, n: it.n, each: it.price, value: it.value, got: null, might: undefined, cozy: undefined, price: undefined };
    if (hits.length) {
      const top = hits.reduce((b, w) => (w.price || 0) > (b.price || 0) ? w : b);
      r.got = ids.length === 1 ? 'sure' : 'maybe';
      if (r.got === 'maybe') r.might = top.short;
      r.cozy = top.cozy; r.price = top.price;
    }
    if (it.n > 0 && ids.length === 1) {
      const d = D && D.items && D.items[ids[0]], w = hits[0];
      if (d && d.p && d.c) { r.fm = d.p; r.fmCozy = d.c; }
      else if (!D && w && w.cozy && w.price) { r.fm = w.price; r.fmCozy = w.cozy; }
    }
    return r;
  });
  const rank = r => r.got === 'sure' ? 0 : r.got === 'maybe' ? 1 : 2;
  rows.sort((a, b) => rank(a) - rank(b) || b.value - a.value);
  return { rows: rows.slice(0, limit), more: Math.max(0, rows.length - limit), value: loot.value };
}

/* ---------- the card ---------- */

const COZY = 'https://cozy.markets/items/';
const fmt = n => Math.round(n).toLocaleString('en-US');
// the stage: at least this tall (the art's own height, in CSS pixels), and taller for a tall monster, with this much room over it.
// A monster taller than the most it may be is drawn smaller, so one giant can't push the page down
const GROUND_H = 96, GROUND_ROOM = 27, MOB_MAX_H = 110;
// where the walkers stand, in percent of the columns' width: the centers of the columns under them (the stage itself runs 12px past
// the columns on each side, edge to edge, so a spot is moved in by that much). Each paces left of its spot
const WALK_SPOTS = { 1: [50], 2: [25, 75], 3: [16.67, 50, 83.33] };

// build({ el, band, tools, lamp, mapPick, classPick, steps, lines, pics, mobName }): a Window. Its title bar holds the label (Now
// grinding or This map), the map's pick and the lantern; under it the numbers line (band, grind.js draws it), the button row
// (tools), the steps, the lines that need you (lines: the problem line, the one thing to do, a trade, the bag's checks), the
// stage with a column under each monster (its head and its own drops), and at the foot the other monsters, the credit and the
// class pick. pics = { item(id) }, a data URL or null.
// update(state), state = { fold, nums, sharing, session, label, mobs (the map's monsters, most numerous first: { id, name, level,
// exp, undead, count }), mobIds, D, sprites, L, cls, level }: fold is a saved run being open (the title bar and the button row
// only), nums whether the numbers line has anything to say, session whether one exists; each part keeps what it last drew and
// draws again only when that changes, so a frame restarts no walker.
function build({ el, band, tools, lamp, mapPick, classPick, steps, lines, pics, mobName }) {
  const K = n => window.Grind.fmtK(n);
  const label = el('h2', { class: 'g-nowl' });
  const stage = el('div', { class: 'g-ground', 'aria-hidden': 'true', hidden: '' });
  const cols = el('div', { class: 'g-mobcols' });
  const nums = el('div', { class: 'k-card g-nums', id: 'g-now', hidden: '' }, band);
  const deep = el('div', { class: 'g-nowin' }, stage, cols);
  const notes = el('div', { class: 'g-nnotes' });
  const foot = el('div', { class: 'k-foot g-nowfoot', hidden: '' }, notes, classPick);
  const card = el('section', { class: 'k-win g-nowcard', id: 'g-nowcard' },
    el('div', { class: 'k-bar k-grass' }, label, mapPick, el('span', { class: 'push' }, lamp)),
    el('div', { class: 'k-pad g-nowpad' }, nums, tools, steps, ...(lines || []), deep, foot),
    el('span', { class: 'g-orn g-shroom', 'aria-hidden': 'true' }));

  // a drop's picture in its ring: one that isn't in yet is filled in when the sheet arrives, so the row isn't drawn again for it
  const ring = r => { const e = el('span', { class: 'k-ring' + (r.gold ? ' gold' : ''), 'data-item': r.id }), src = pics.item(r.id); if (src) e.append(el('img', { src, alt: '' })); return e; };
  const fillIcons = () => { for (const e of cols.querySelectorAll('.k-ring[data-item]:empty')) { const src = pics.item(+e.dataset.item); if (src) e.append(el('img', { src, alt: '' })); } };
  const line = text => el('p', { class: 'g-nline' }, text);
  const cozyLink = (n, text, name) => el('a', { href: COZY + n, target: '_blank', rel: 'noopener', 'aria-label': name + ' on Cozy Market, ' + text }, text);
  const num = v => el('span', { class: 'g-mn' }, String(v));

  // a monster's head: its name, how strong and how many, and the undead tag
  const headOf = m => el('h3', { class: 'g-mobh' }, el('b', {}, m.name),
    el('span', { class: 'g-mobs' }, 'Lv ', num(m.level), ' · ', num(fmt(m.exp)), ' EXP · ', num(m.count), ' here'),
    m.undead ? el('span', { class: 'k-tag' }, 'undead · Heal hits it') : null);
  // a drop: the ring, the name with its For you tag and small line, and the price (an FM price links to its Cozy page, an NPC one is quiet)
  const rowOf = r => el('div', { class: 'k-row' + (r.gold ? ' gold' : '') }, ring(r),
    el('span', { class: 'g-nnm' }, el('span', { class: 'g-nn' }, r.short), r.you ? el('span', { class: 'k-tag y' }, 'For you') : null, r.about ? el('small', {}, r.about) : null),
    r.cozy ? el('span', { class: 'g-np' }, cozyLink(r.cozy, K(r.price), r.short)) : el('span', { class: 'g-np npc' }, r.price ? 'NPC ' + K(r.price) : ''));

  function drawStage(ids, sprites) {
    const spots = WALK_SPOTS[ids.length] || [];
    // a monster with no picture keeps its column, so the others keep their spots
    const top = ids.map((id, i) => ({ id, i })).filter(o => sprites && sprites[o.id]).map(({ id, i }) => {
      const [w, h, n] = sprites[id], k = Math.min(1, MOB_MAX_H / h);
      return { id, i, w: Math.round(w * k), h: Math.round(h * k), n };
    });
    stage.hidden = !top.length;
    stage.style.setProperty('--g-gh', Math.max(GROUND_H, ...top.map(m => m.h + GROUND_ROOM)) + 'px');
    stage.replaceChildren(...top.map(m => {
      const src = 'sprites/mobs/' + m.id + '.png';
      const walker = el('div', { class: 'g-walker', 'data-mob': m.id, style: 'left:calc(' + spots[m.i] + '% + ' + (12 - 0.24 * spots[m.i]).toFixed(2) + 'px + min(75px, 9cqw));margin-left:' + (-Math.round(m.w / 2)) + 'px' },
        el('div', { class: 'g-mob', style: '--w:' + m.w + 'px;--h:' + m.h + 'px;--n:' + m.n + ';--src:url(' + src + ')' }));
      // a strip that won't load takes its walker with it, and the last one takes the stage
      const probe = new Image();
      probe.onerror = () => { walker.remove(); stage.hidden = !stage.children.length; };
      probe.src = src;
      return walker;
    }));
  }

  // the columns and the foot's notes: each monster over its own drops
  function drawCols(x) {
    const mobs = (x.mobs || []).slice(0, 3), C = x.D ? dropColumns(x.mobIds, x.D, mobName, x.cls, x.level) : null;
    cols.classList.toggle('one', mobs.length === 1);
    cols.style.setProperty('--n', String(mobs.length || 1));
    cols.replaceChildren(...mobs.map((m, i) => {
      const c = C && C.columns[i], list = (c ? c.rows : []).map(rowOf);
      if (mobs.length === 1) { const first = 2 * Math.floor((list.length - 1) / 2); list.forEach((r, j) => { if (j >= first) r.classList.add('last'); }); }
      return el('section', { class: 'g-mobcol', 'data-mob': m.id }, headOf(m),
        list.length ? el('div', { class: 'k-rows g-drops' }, list) : C && C.any ? line('No drops logged for this one yet.') : null);
    }).concat(C && !C.any && mobs.length ? [el('p', { class: 'g-nline g-nomob' }, 'No drops logged for these monsters yet.')] : []));
    const also = (x.mobIds || []).slice(3).map(mobName), date = x.D && new Date(x.D.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    notes.replaceChildren(...[
      also.length ? el('p', { class: 'g-nfoot' }, 'Also here: ' + also.join(', ') + '.') : null,
      C && C.any ? el('p', { class: 'g-nfoot' }, 'Seen dropping here, no drop rates yet.' + (C.anyCozy ? ' ' : ''), C.anyCozy ? ['Prices from ', el('a', { href: 'https://cozy.markets/', target: '_blank', rel: 'noopener' }, 'Cozy Market'), ', ' + date + '.' + (C.anyGearCozy ? ' Gear varies by stats.' : '')] : null) : null,
    ].filter(Boolean));
  }

  const drawn = {};
  const changed = (part, ...now) => { const k = JSON.stringify(now); if (drawn[part] === k) return false; drawn[part] = k; return true; };
  function update(x) {
    if (label.textContent !== x.label) label.textContent = x.label;
    card.classList.toggle('fold', !!x.fold);   // the CSS keeps only the title bar and the button row
    nums.hidden = !x.nums;
    steps.hidden = !!x.sharing || !!x.session;   // the first time steps: before sharing, and never under a stopped session's nudge
    const ids = (x.mobIds || []).slice(0, 3);
    if (changed('stage', ids, !!x.sprites)) drawStage(ids, x.sprites);
    if (changed('cols', x.mobs, x.mobIds, !!x.D, x.cls, x.level)) drawCols(x);
    if (x.L) fillIcons();
    foot.hidden = !notes.children.length && classPick.hidden;
  }
  return { el: card, update };
}

window.GrindNow = { shortName, dropColumns, wantedOf, forYou, pickedRows, build };
})();
