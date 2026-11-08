// Grind tab session engine: readings from the shared game window in, per minute buckets and numbers out. No DOM.
// The EXP rules are Repot Run Live's (exp-tracker/live/index.html takeExp): an implausible jump waits for a second read,
// a wrap from 80%+ to 20%- is a level up, a confirmed drop is a death. Potion counts change only when two reads agree;
// down is used, up is bought.
// window.GrindSession = { wholeRows, create, add, stats, countdown, minuteOf, toRow, fromRow }
(function () {
'use strict';

const CFG = { jumpFrac: 0.04, sizeTol: 0.06, maxGapMs: 30000, rateWindow: 600000, minUse: 120000, low: 300 };

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  const h = '0123456789abcdef', r = () => h[Math.floor(Math.random() * 16)];
  let s = ''; for (let i = 0; i < 32; i++) s += i === 12 ? '4' : i === 16 ? h[8 + Math.floor(Math.random() * 4)] : r();
  return s.slice(0, 8) + '-' + s.slice(8, 12) + '-' + s.slice(12, 16) + '-' + s.slice(16, 20) + '-' + s.slice(20);
}

// prices: { [itemId]: price } corrections the player made; they win over a reading's default price. eat: { lemon,
// meat: item ids, meatHp } for the session's Lemon and Meat tiles. mode: 'track' (mesos only) or 'loot' (Count my
// loot, set by grind.js)
function create({ mapId, t, prices, eat } = {}) {
  return { id: uuid(), mapId: mapId || null, t0: t, tLast: t, prices: prices || {}, eat: eat || null, mode: 'track', dated: true,
    level: null, levelStart: null, levels: 0, sizes: {}, last: null, pend: null,
    gainExp: 0, gainPct: 0, deaths: 0, lostExp: 0, lostPct: 0, activeMs: 0, lastValidT: null, expFrom: null, expTo: null,
    slots: {}, retired: [], minutes: [], party: [], meso: null, boughtCost: 0 };
}

const minuteOf = (s, t) => Math.max(0, Math.floor((t - s.t0) / 60000));
function bucket(s, t) {
  const m = minuteOf(s, t);
  while (s.minutes.length <= m) s.minutes.push({ m: s.minutes.length, exp: 0, pct: 0, used: {}, party: null, idle: true });
  return s.minutes[m];
}

/* ---------- EXP ---------- */

function learnSize(s, exp, pct) {
  if (pct >= 5 && exp > 0 && s.level) { const sz = exp / (pct / 100); s.sizes[s.level] = s.sizes[s.level] ? (s.sizes[s.level] * 3 + sz) / 4 : sz; }
}
// does the EXP number agree with the percent? (catches misread digits)
function consistent(s, exp, pct) {
  const sz = s.sizes[s.level];
  return !sz || Math.abs(exp / sz * 100 - pct) <= CFG.sizeTol + (pct < 5 ? 0.02 : 0);
}
// returns { ok, dExp, dPct }
function takeExp(s, t, exp, pct) {
  const prev = s.last;
  if (!prev) {
    if (!consistent(s, exp, pct)) return { ok: false };
    s.last = { t, exp, pct }; learnSize(s, exp, pct); return { ok: true, dExp: 0, dPct: 0 };
  }
  if (prev.exp === exp && prev.pct === pct) { prev.t = t; s.pend = null; return { ok: true, dExp: 0, dPct: 0 }; }
  const dExp = exp - prev.exp, size = s.sizes[s.level] || prev.exp / Math.max(prev.pct, 0.5) * 100;
  const wrap = prev.pct >= 80 && pct <= 20 && exp < prev.exp;
  const plausible = (dExp >= 0 && dExp <= size * CFG.jumpFrac) || wrap;
  const confirmed = s.pend && s.pend.exp === exp && s.pend.pct === pct;
  if (!plausible && !confirmed) { s.pend = { exp, pct }; return { ok: false }; }
  s.pend = null;
  let gExp, gPct;
  if (wrap) {
    const oldSize = s.sizes[s.level] || (prev.pct >= 5 ? prev.exp / (prev.pct / 100) : null);
    gPct = (100 - prev.pct) + pct; gExp = oldSize ? (oldSize - prev.exp) + exp : 0;
    s.level = s.level ? s.level + 1 : s.level; s.levels++;
  } else {
    if (!consistent(s, exp, pct)) return { ok: false };
    gExp = dExp; gPct = pct - prev.pct;
    // a death still counts against the session (the rates include it), and what it cost is kept to show
    if (dExp < 0) { s.deaths++; s.lostExp = (s.lostExp || 0) - gExp; s.lostPct = (s.lostPct || 0) - gPct; }
  }
  s.gainExp += gExp; s.gainPct += gPct;
  s.last = { t, exp, pct }; learnSize(s, exp, pct);
  return { ok: true, dExp: gExp, dPct: gPct };
}

/* ---------- potions ---------- */

// BIG: a change of more than this between two reads holds HOLD_MS before it counts. PICKUP: a rise this small is a
// potion picked up off the ground, not bought (a mob drops one at a time; a shop trip buys dozens). AWAY_MS: potions
// moved out (a drop over BIG) that come back within this are moved back, not bought
const BIG = 30, HOLD_MS = 15000, PICKUP = 5, AWAY_MS = 5 * 60000;
// every slot starts over from its next read (grind.js calls this when the HUD changed size)
function rebase(s) { for (const sl of Object.values(s.slots)) { sl.rebase = true; sl.pend = null; sl.big = null; sl.away = null; } }
function takeCounts(s, t, counts) {
  const seen = {};
  for (const c of counts || []) {
    if (!c || !c.key || c.value == null) continue;
    seen[c.key] = true;
    let sl = s.slots[c.key];
    // a new slot, or another potion moved into it: start over without counting anything
    if (!sl || (c.id && sl.id !== c.id)) {
      // what was already drunk from a slot whose potion changed still counts
      if (sl && (sl.used || sl.bought)) (s.retired = s.retired || []).push(sl);
      s.slots[c.key] = { key: c.key, id: c.id || null, name: c.name || 'Unknown item', price: s.prices[c.id] != null ? s.prices[c.id] : (c.price || 0),
        count: c.value, full: c.value, pend: null, used: 0, bought: 0, missing: 0, uses: [], firstUse: null };
      continue;
    }
    sl.missing = 0;
    // after the HUD changed size: start over from what the slot shows, counting nothing for the switch
    if (sl.rebase) { sl.count = c.value; sl.rebase = false; sl.pend = null; sl.big = null; continue; }
    // after a pause: what was drunk while the clock was off isn't counted; a refill bought meanwhile still is
    if (sl.paused) { sl.paused = false; if (c.value < sl.count) { sl.count = c.value; sl.pend = null; sl.big = null; continue; } }
    if (c.value === sl.count) { sl.pend = null; sl.big = null; continue; }
    const d = c.value - sl.count;
    // a drop no one could drink between two reads (684 read as 84 for a moment), or a rise as big (84 read as 684), is a
    // misread until it holds for 15 seconds; otherwise it reads as hundreds drunk, or hundreds bought
    if (Math.abs(d) > BIG) {
      if (!sl.big || sl.big.v !== c.value) { sl.big = { v: c.value, t }; continue; }
      if (t - sl.big.t < HOLD_MS) continue;
      const t0 = sl.big.t; sl.big = null; sl.pend = null; moved(s, sl, t, d, t0); continue;
    }
    sl.big = null;
    if (sl.pend !== c.value) { sl.pend = c.value; continue; }   // wait for a second read
    sl.pend = null;
    change(s, sl, t, d);
  }
  // a slot not read: covered (a tooltip, the cursor) keeps its count; one that showed 3 or less and stays gone ran out
  for (const sl of Object.values(s.slots)) {
    if (seen[sl.key]) continue;
    sl.missing++;
    if (sl.missing >= 2 && sl.count > 0 && sl.count <= 3) change(s, sl, t, -sl.count);
  }
}
// a big change that held (Rimmah, 2026-11-04: a store setup read as 34 Orange Potions and 59 Meat drunk, then bought): a
// drop is potions moved out (a store, storage, a trade, dropped, sold), never drunk, since no one drinks 30 between two
// reads; a rise first brings back what went out in the last AWAY_MS, and only the rest is a refill (or a pickup)
function moved(s, sl, t, d, t0) {
  if (sl.away && t - sl.away.t > AWAY_MS) sl.away = null;
  if (d < 0) { sl.away = { n: (sl.away ? sl.away.n : 0) - d, t }; sl.count += d; return; }
  const back = sl.away ? Math.min(d, sl.away.n) : 0;
  if (back) {
    sl.away.n -= back; if (!sl.away.n) sl.away = null;
    sl.count += back; sl.full = Math.max(sl.full || 0, sl.count);
  }
  if (d > back) change(s, sl, t, d - back, t0);
}
// t0: when the change first showed (a big one books 15 s later), so a refill is dated when it was bought
function change(s, sl, t, d, t0) {
  if (d < 0) {
    sl.used += -d;
    if (sl.firstUse == null) sl.firstUse = t;
    sl.uses.push([t, -d]);
    while (sl.uses.length && sl.uses[0][0] < t - CFG.rateWindow) sl.uses.shift();
    const b = bucket(s, t); b.used[sl.id] = (b.used[sl.id] || 0) + -d;
  } else if (d <= PICKUP) sl.found = (sl.found || 0) + d;   // picked up: stock that cost nothing
  else {   // a refill: back from town (or bought from a player)
    sl.bought += d; s.boughtCost = (s.boughtCost || 0) + d * (sl.price || 0); s.lastRefill = t;
    if (sl.id) {
      const y = { t: t0 || t, tBook: t, id: sl.id, n: d };
      (s.refills = s.refills || []).push(y);
      refillAtShop(s, t, sl.id, d, y);
      undoTrades(s, t);
    }
  }
  sl.count += d;
  // how full the slot was since the last refill (the pop-out drains a glass from it): a refill fills it, a pickup tops it up
  sl.full = d > PICKUP ? sl.count : Math.max(sl.full || 0, sl.count);
}

/* ---------- mesos: totals read off the inventory window now and then ---------- */

// how many of each potion had been bought so far, by item id
function boughtNow(s) {
  const by = {};
  for (const sl of Object.values(s.slots).concat(s.retired || [])) if (sl.id && sl.bought) by[sl.id] = (by[sl.id] || 0) + sl.bought;
  return by;
}
// the mesos spent on potions bought between two looks, at the prices as they are now (a corrected price fixes refills
// already made); a saved session keeps the spend itself as a number. A live session dates each refill by when its count
// changed, so a look taken while a big refill still holds (shop closed right after buying) still counts it
function spentBetween(s, a, b) {
  if (typeof a.bought === 'number' || typeof b.bought === 'number') return (+b.bought || 0) - (+a.bought || 0);
  if (s.dated && a.t != null && b.t != null) return (s.refills || []).filter(y => y.t > a.t && y.t <= b.t).reduce((x, y) => x + y.n * priceOf(s, y.id), 0);
  const price = {};
  for (const sl of (s.retired || []).concat(Object.values(s.slots))) if (sl.id) price[sl.id] = sl.price || 0;
  let spent = 0;
  for (const id of new Set(Object.keys(a.bought).concat(Object.keys(b.bought)))) spent += ((b.bought[id] || 0) - (a.bought[id] || 0)) * (price[id] || 0);
  return spent;
}
// a total counts once two reads agree; the same total seen again later moves the latest look's time on. The money
// spent on potions bought between looks is kept with each look, so a refill isn't counted as mesos lost.
// A change of 30,000 or more between two looks that potions bought don't explain is asked about: a trade or a big buy
// isn't grinding, and the player can leave it out.
const JUMP = 30000, RATE_MIN = 10;
// quiet: a step inside a shop visit (buying and selling at the shop is never asked about). Returns the total it moved
// from when a new total counted, else undefined
function takeMesos(s, t, v, quiet) {
  const m = s.meso || (s.meso = { looks: 0, first: null, last: null, pend: null });
  // each look keeps where the session stood (EXP, active time, potions drunk), so the session result can cut costs and
  // time to the window the looks cover
  if (m.last && v === m.last.v) { m.pend = null; m.last.t = t; m.last.bought = boughtNow(s); m.last.at = snap(s, t); return; }
  if (m.pend !== v) { m.pend = v; return; }
  m.pend = null;
  const look = { t, v, bought: boughtNow(s), at: snap(s, t) }, from = m.last ? m.last.v : null;
  if (m.last && !quiet) {
    const jump = (v - m.last.v) + spentBetween(s, m.last, look);
    // a quickslot change still holding (200 Lemons from a friend book 15 s after the count jumps) may explain it: wait
    if (Math.abs(jump) >= JUMP) {
      if (Object.values(s.slots).some(sl => sl.big)) m.jumpPend = { t, v, a: { t: m.last.t, v: m.last.v, bought: Object.assign({}, m.last.bought) } };
      else m.jump = { t, amount: jump, seen: (s.refills || []).length };
    }
  }
  if (!m.first) m.first = look;
  m.last = look; m.looks++;
  return from;
}
// a jump that waited for held quickslot changes: asked about only if what they booked doesn't explain it
function settleJump(s) {
  const m = s.meso, p = m && m.jumpPend;
  if (!p || Object.values(s.slots).some(sl => sl.big)) return;
  m.jumpPend = null;
  const jump = (p.v - p.a.v) + spentBetween(s, p.a, { t: p.t, bought: boughtNow(s) });
  if (Math.abs(jump) >= JUMP) m.jump = { t: p.t, amount: jump, seen: (s.refills || []).length };
}
// A trade left out (paid) and a potion refill within a minute of each other, at a believable price for that potion
// (half to double), are one thing: potions bought from a player. The refill already counts what they cost, so the trade
// is taken back out, and what was paid sets the potion's price so the refill is counted at what it really cost. Not
// a refill the trade's question already took off (it asked only about the rest), nor one bought at the shop
const UNDO_MS = 60000;
function undoTrades(s, t) {
  const m = s.meso;
  if (!m || !m.trades || !s.refills) return;
  for (const x of m.trades.slice()) {
    if (x.amount >= 0) continue;
    const y = s.refills.find((y, i) => i >= (x.seen || 0) && !y.used && !y.shop && Math.abs(y.t - x.t) <= UNDO_MS && y.n > 0 && -x.amount / y.n >= 0.5 * priceOf(s, y.id) && -x.amount / y.n <= 2 * priceOf(s, y.id));
    if (!y) continue;
    y.used = true;
    m.trades.splice(m.trades.indexOf(x), 1);
    const price = Math.round(-x.amount / y.n);
    learnPrice(s, y.id, price, t);
    (s.events = s.events || []).push({ t, kind: 'trade-undone', amount: x.amount, id: y.id, price });
  }
}

/* ---------- shop visits: the NPC shop window's meso box while you buy and sell ---------- */

// A visit opens with the first shop total read and closes when the shop is gone (or 30 s without a read). Its steps
// are the totals as they change in it: up is sold, down is bought. Potion refills booked in it, or up to 20 s after it
// closes (a big count change holds 15 s before it books), join it, so a drop can be matched to what it bought.
const SHOP_GONE_MS = 30000, SHOP_LATE_MS = 20000;
const priceOf = (s, id) => { const sl = Object.values(s.slots).concat(s.retired || []).find(x => x.id === id); return sl ? sl.price || 0 : (s.prices[id] || 0); };
function takeShop(s, t, r) {
  const S = s.shop || (s.shop = { visits: [], open: false, seen: null });
  const cur = S.open ? S.visits[S.visits.length - 1] : null;
  if (r.shop == null) { if (r.shopOpen === false && cur) closeVisit(s, cur); return; }
  let v = cur;
  if (!v) { v = { t0: t, t1: t, steps: [], refills: [], looked: false }; S.visits.push(v); S.open = true; }
  S.seen = t; v.t1 = t;
  // a step only between two totals both read in this visit; the step into it (from the last inventory look) is ordinary
  const inside = v.looked, from = takeMesos(s, t, r.shop, inside);
  if (from !== undefined && s.meso.last.t === t) { if (inside && from != null) v.steps.push({ t, d: r.shop - from }); v.looked = true; }
  else if (s.meso && s.meso.last && s.meso.last.v === r.shop) v.looked = true;
}
function closeVisit(s, v) { s.shop.open = false; v.t1 = Math.max(v.t1, s.shop.seen || v.t1); }
// y: the refill's entry in s.refills, marked as bought at the shop so it never undoes a trade
function refillAtShop(s, t, id, n, y) {
  const v = s.shop && s.shop.visits.find(x => t >= x.t0 && t <= x.t1 + SHOP_LATE_MS);
  if (v && id) { v.refills.push({ t, id, n }); if (y) y.shop = true; }
}
// a visit settles once it's closed and a late refill can't join it any more; only then is a price learned from it (a
// second potion's refill booking late would otherwise leave the first one priced off both)
function settleShop(s, t) {
  for (const v of (s.shop && s.shop.visits) || []) {
    if (v.settled || (s.shop.open && v === s.shop.visits[s.shop.visits.length - 1]) || t <= v.t1 + SHOP_LATE_MS) continue;
    v.settled = true; learnVisit(s, v);
  }
}
// one potion bought in a visit and one drop of the total that fits it (half to double its price each): that drop is
// what it really cost, so the price follows it
function learnVisit(s, v) {
  const ids = [...new Set(v.refills.map(x => x.id))];
  if (ids.length !== 1) return;
  const id = ids[0], n = v.refills.reduce((a, x) => a + x.n, 0), price = priceOf(s, id);
  if (!price || !n) return;
  // one potion bought in two purchases (a stack holds 100) is two drops: a run of drops in a row fits a price when its sum
  // is n times a whole price in the band and each drop in it is whole potions at that price (a scroll bought alongside
  // isn't). Every drop together comes first: Rimmah buys 100 at a time, and two of three stacks would fit a price too
  // (3 x 14,100 for 300: 94 as well as 141). Else only one price may fit (100 + 50 Lemons: 15,000 alone fits 100)
  const drops = v.steps.filter(x => x.d < 0), fit = new Map();
  const fits = (i, j) => {
    const run = drops.slice(i, j + 1), p = run.reduce((a, x) => a - x.d, 0) / n;
    return Number.isInteger(p) && p >= 0.5 * price && p <= 2 * price && run.every(x => -x.d % p === 0) ? p : null;
  };
  const all = drops.length ? fits(0, drops.length - 1) : null;
  if (all != null) { learnPrice(s, id, all, drops[drops.length - 1].t); return; }
  for (let i = 0; i < drops.length; i++) for (let j = i; j < drops.length; j++) { const p = fits(i, j); if (p != null) fit.set(p, drops[j].t); }
  if (fit.size !== 1) return;
  const [[p, at]] = fit;
  learnPrice(s, id, p, at);
}
// a potion's price as if the player had tapped it: the session's price and every slot of it; a change is kept in
// s.learned for grind.js to say and save. Returns { id, price, was }
function learnPrice(s, id, price, t) {
  const was = priceOf(s, id);
  s.prices[id] = price;
  for (const sl of Object.values(s.slots).concat(s.retired || [])) if (sl.id === id) sl.price = price;
  const x = { t: t || s.tLast, id, price, was };
  if (was !== price) (s.learned = s.learned || []).push(x);
  return x;
}
// what the shop saw after from and up to to: sold, bought, the potions bought at their prices, and the rest. By each
// step's own time, so a visit running across either end counts only its part inside (from and to are the times of the
// meso totals the window is cut by, which every step up to them is already in)
function shopOf(s, from, to) {
  const o = { sold: 0, bought: 0, potions: 0, other: 0 }, inside = x => x.t > from && x.t <= to;
  for (const v of (s.shop && s.shop.visits) || []) {
    for (const x of v.steps) if (inside(x)) { if (x.d > 0) o.sold += x.d; else o.bought -= x.d; }
    for (const x of v.refills) if (inside(x)) o.potions += x.n * priceOf(s, x.id);
  }
  o.other = Math.max(0, o.bought - o.potions);
  return o;
}
// leave a trade out of mesos earned: amount is what it did to the total (paid 165k = -165000); answers the question
// answering the jump question dates the trade at the jump (not at the click, which can be after the window's last look)
// and keeps which refills that jump already counted
function trade(s, amount, t) {
  const m = s.meso || (s.meso = { looks: 0, first: null, last: null, pend: null }), j = m.jump && m.jump.amount === amount ? m.jump : null;
  (m.trades = m.trades || []).push(j ? { t: j.t, amount, seen: j.seen || 0 } : { t, amount });
  m.jump = null;
  undoTrades(s, t);
}
// the jump was grinding (or selling to the shop) after all: keep it
function keepMesos(s) { if (s.meso) s.meso.jump = null; }
const tradedOf = m => (m && m.trades || []).reduce((a, x) => a + x.amount, 0);

// etc items from an Etc tab look: [{ id, name, price, count }]; a look counts once two reads agree
function takeEtc(s, t, list) {
  const items = {};
  for (const e of list) { if (!e.id) continue; const it = items[e.id] || (items[e.id] = { n: 0, price: e.price || 0, name: e.name }); it.n += e.count; }
  const key = Object.keys(items).sort().map(id => id + ':' + items[id].n).join(',');
  const m = s.etcs || (s.etcs = { looks: 0, first: null, last: null, pend: null });
  if (m.last && key === m.last.key) { m.pend = null; m.last.t = t; return; }
  if (m.pend !== key) { m.pend = key; return; }
  m.pend = null;
  const look = { t, key, items };
  if (!m.first) m.first = look;
  m.last = look; m.looks++;
}
// what the etc items picked up between the first and latest Etc look would sell to an NPC for (selling them moves
// that value into mesos, so it doesn't count twice)
function etcOf(s) {
  const m = s.etcs;
  if (!m || !m.first || !m.last || m.last.t - m.first.t < 60000) return { value: null, min: null };
  let v = 0;
  for (const id of new Set(Object.keys(m.first.items).concat(Object.keys(m.last.items)))) {
    const a = m.first.items[id], b = m.last.items[id], price = (b || a).price;
    v += ((b ? b.n : 0) - (a ? a.n : 0)) * price;
  }
  return { value: v, min: Math.round((m.last.t - m.first.t) / 60) / 1000 };
}

/* ---------- the bag (Count my loot): pages of Equip, Use and Etc lined up into full looks ---------- */

// A tab is read a page (6 rows of 5 slots) at a time while the player scrolls. Its scrollbar only says whether a page is
// the top or the bottom (the thumb is a fixed size), so pages are lined up by the rows they share. A page counts once
// two reads of it agree, and never with an unsure slot in it. A tab is a full look once one run of lined up pages holds
// both its top and its bottom, all in one opening of the bag (closing it starts over; gone for CLOSE_MS or less is the
// same opening, since an item's tooltip over the meso box hides the inventory for a look or two while it stays open).
// Once Equip, Use and Etc are each full since the last set they make a set; the first set and the latest are the ends
// loot is counted between.
// Slots come from grind.js as { r, c, n, key, name, price, kind, rank, pot } (pot: the potion ids sharing the picture).
const BAG_TABS = ['Equip', 'Use', 'Etc'], PAGE_ROWS = 6, PAGE_COLS = 5, EMPTY_ROW = '||||', CLOSE_MS = 5000, BAG_TICKS_MS = 8000;
function pageOf(bag) {
  const rows = Array.from({ length: PAGE_ROWS }, () => Array(PAGE_COLS).fill('')), items = {};
  const unsure = new Set();
  for (const q of bag.slots || []) {
    if (q.r >= PAGE_ROWS || q.c >= PAGE_COLS) continue;
    if (q.key == null || q.n == null) { unsure.add(q.r); continue; }
    rows[q.r][q.c] = q.key + ':' + q.n;
    items[q.key] = { name: q.name, price: q.price || 0, kind: q.kind, rank: q.rank || 0 };
    if (q.pot && q.pot.length) items[q.key].pot = q.pot;
  }
  // a row with a slot it can't read (the mouse cursor over it, a tooltip) is unknown: null, filled in by another page
  return { rows: rows.map((r, i) => unsure.has(i) ? null : r.join('|')), items, top: !!(bag.scroll && bag.scroll.top), bottom: !!(bag.scroll && bag.scroll.bottom) };
}
// where b's first row sits among a's rows, or null unless there's exactly one place: every shared row the same, at least
// one of them with something in it (or both pinned to the same end), and never past a known top or bottom
function fit(a, b) {
  let found = null, n = 0, loose = null;
  for (let k = 1 - b.rows.length; k <= a.rows.length - 1; k++) {
    const aEnd = a.rows.length, bEnd = k + b.rows.length;
    if ((a.top && k < 0) || (b.top && k > 0) || (a.bottom && bEnd > aEnd) || (b.bottom && bEnd < aEnd)) continue;
    let same = true, solid = false;
    for (let i = Math.max(0, k); i < Math.min(aEnd, bEnd); i++) {
      const x = a.rows[i], y = b.rows[i - k];
      if (x == null || y == null) continue;
      if (x !== y) { same = false; break; }
      if (x !== EMPTY_ROW) solid = true;
    }
    if (same && (solid || (a.top && b.top) || (a.bottom && b.bottom))) { found = k; n++; }
    else if (same) (loose = loose || []).push(k);
  }
  if (n === 1) return found;
  // no one place, but every place left gives the same items (a page of empty rows under a sparse tab): any will do
  if (n === 0 && loose && loose.length && loose.every(k => itemsKey(join(a, b, k)) === itemsKey(join(a, b, loose[0])))) return loose[0];
  return null;
}
const itemsKey = x => x.rows.filter(r => r != null && r !== EMPTY_ROW).join('|').split('|').filter(Boolean).sort().join(',') + (x.rows.includes(null) ? '?' : '');
function join(a, b, k) {
  const rows = [];
  for (let i = Math.min(0, k); i < Math.max(a.rows.length, k + b.rows.length); i++) {
    const x = i >= 0 && i < a.rows.length ? a.rows[i] : null, y = i - k >= 0 && i - k < b.rows.length ? b.rows[i - k] : null;
    rows.push(x != null ? x : y);
  }
  return { rows, top: a.top || b.top, bottom: a.bottom || b.bottom, items: Object.assign({}, a.items, b.items) };
}
function takeBag(s, t, r) {
  const B = s.bag || (s.bag = { acc: {}, done: {}, first: null, last: null, sets: 0 });
  // closing the bag ends the flip: what it saw of each tab, and tabs it finished, don't carry into the next opening
  if (r.bagOpen === false) { if (B.open) B.closedT = t; B.open = false; return; }
  if (!B.open) {
    if (B.closedT == null || t - B.closedT > CLOSE_MS) { B.acc = {}; B.done = {}; B.openT = t; }
    B.open = true;
  }
  const bag = r.bag;
  if (!bag || !BAG_TABS.includes(bag.tab)) return;
  const A = B.acc[bag.tab] || (B.acc[bag.tab] = { pend: null, strips: [] });
  const pg = pageOf(bag);
  const sig = pg.rows.join('/') + (pg.top ? 'T' : '') + (pg.bottom ? 'B' : '');
  if (A.pend !== sig) { A.pend = sig; return; }
  // agreed: line it up with every run of pages this opening has seen of the tab, joining runs it bridges
  let cur = pg;
  const strips = A.strips.slice();
  for (let i = 0; i < strips.length;) {
    const k = fit(strips[i], cur), k2 = k == null ? fit(cur, strips[i]) : null;
    if (k == null && k2 == null) { i++; continue; }
    cur = k != null ? join(strips[i], cur, k) : join(cur, strips[i], k2);
    strips.splice(i, 1); i = 0;
  }
  strips.push(cur); A.strips = strips.slice(-8);   // a bag left open while looting: each count change is a new run
  if (!(cur.top && cur.bottom) || cur.rows.includes(null)) return;   // every row known, top to bottom
  const items = {};
  for (const row of cur.rows) for (const x of row.split('|')) {
    if (!x) continue;
    const i = x.lastIndexOf(':'), k = x.slice(0, i), it = items[k] || (items[k] = Object.assign({ n: 0 }, cur.items[k]));
    it.n += +x.slice(i + 1);
  }
  B.done[bag.tab] = { t, items };
  if (!BAG_TABS.every(tab => B.done[tab])) return;
  const fresh = s.meso && s.meso.last && s.meso.last.t >= B.openT ? s.meso.last : null;
  if (!fresh) return;   // waits in this opening for the meso box to read
  const all = {}; let tSet = 0;
  for (const tab of BAG_TABS) {
    const d = B.done[tab]; tSet = Math.max(tSet, d.t);
    for (const [k, it] of Object.entries(d.items)) { const x = all[k] || (all[k] = Object.assign({}, it, { n: 0 })); x.n += it.n; }
  }
  // the set keeps where the session stood then (for the counted window) and the meso total last agreed
  const set = { t: tSet, items: all, at: snap(s, tSet), meso: { v: fresh.v, t: fresh.t }, bought: boughtNow(s) };
  if (!B.first) B.first = set;
  B.last = set; B.sets++; B.done = {};
}
// loot between the first set and the latest, at the NPC price: { value, items (best drop first, then by value), best,
// from, to }, or null until two sets a minute apart. Pictures shared with a quickslot potion are left out (the
// quickslots count those). Best drop: scrolls by grade, then equips, then other Use items, by price; never Etc
const BEST_KIND = { scroll: 3, equip: 2, use: 1 };
function lootOf(s) {
  const B = s.bag;
  if (!B || !B.first || !B.last || B.last.t - B.first.t < 60000) return null;
  const pots = new Set();
  for (const sl of Object.values(s.slots).concat(s.retired || [])) if (sl.id) pots.add(+sl.id);
  const items = [];
  for (const k of new Set(Object.keys(B.first.items).concat(Object.keys(B.last.items)))) {
    const a = B.first.items[k], b = B.last.items[k], it = b || a;
    if ((it.pot || []).some(id => pots.has(+id))) continue;
    const n = (b ? b.n : 0) - (a ? a.n : 0);
    if (n) items.push({ key: k, name: it.name, n, price: it.price || 0, value: n * (it.price || 0), kind: it.kind, rank: it.rank || 0 });
  }
  const best = items.filter(i => i.n > 0 && BEST_KIND[i.kind])
    .sort((x, y) => BEST_KIND[y.kind] - BEST_KIND[x.kind] || (x.kind === 'scroll' ? y.rank - x.rank : 0) || y.price - x.price)[0] || null;
  items.sort((x, y) => (x === best ? -1 : y === best ? 1 : y.value - x.value));
  return { value: items.reduce((a, i) => a + i.value, 0), items, best, from: B.first.t, to: B.last.t };
}

/* ---------- pace: the last 5 and 10 minutes, and since a reset (live only, a saved row leaves them out) ---------- */

const TRAIL_MS = 10000, TRAIL_KEEP = 11 * 60000;
function usedById(s) {
  const by = {};
  for (const sl of Object.values(s.slots).concat(s.retired || [])) if (sl.id && sl.used) by[sl.id] = (by[sl.id] || 0) + sl.used;
  return by;
}
// where the session stood at t: EXP and percent gained, active time, and each potion drunk so far (costed later, at the
// prices as they are then, so a corrected price counts for the windows too)
const snap = (s, t) => ({ t, exp: s.gainExp, pct: s.gainPct, active: s.activeMs, used: usedById(s) });
// a snapshot every 10 seconds, kept back to one older than the longest window
function keepTrail(s, t) {
  const tr = s.trail || (s.trail = []);
  if (tr.length && t - tr[tr.length - 1].t < TRAIL_MS) return;
  tr.push(snap(s, t));
  while (tr.length > 2 && tr[1].t <= t - TRAIL_KEEP) tr.shift();
}
// Reset average: a fresh average from now on, the session's own numbers untouched
function mark(s, t) { s.mark = snap(s, t); }
// rates from an earlier snapshot to now, over the active time between them; null under a minute of it
function between(s, a, now) {
  const act = now.active - a.active;
  if (act < 60000) return null;
  const hrs = act / 3600000, price = {};
  for (const sl of (s.retired || []).concat(Object.values(s.slots))) if (sl.id) price[sl.id] = sl.price || 0;
  let cost = 0;
  for (const id of Object.keys(now.used)) cost += ((now.used[id] || 0) - (a.used[id] || 0)) * (price[id] || 0);
  const pct = now.pct - a.pct;
  return { t: a.t, mins: act / 60000, expHr: (now.exp - a.exp) / hrs, costHr: cost / hrs, per1: pct >= 0.3 && cost > 0 ? cost / pct : null };
}

/* ---------- which map a run belongs to ---------- */

function creditMap(s, exp) {
  const M = s.mapExp || (s.mapExp = {});
  M[s.mapNow] = (M[s.mapNow] || 0) + exp;
  s.mapId = +Object.keys(M).reduce((a, b) => (M[b] > M[a] ? b : a));
}
// a pick by hand: the map the reader had was wrong, so what it earned there goes with the pick
function pickMap(s, id) {
  const M = s.mapExp;
  if (M && s.mapNow != null && s.mapNow !== id && M[s.mapNow]) { M[id] = (M[id] || 0) + M[s.mapNow]; delete M[s.mapNow]; }
  s.mapNow = id; s.mapId = id;
}

/* ---------- one reading ---------- */

// reading: { t, exp, pct, level, counts: [{ key, id, name, price, value }], party }; any part null when unread
/* ---------- Pickup lines (display only) ----------
   What the game's pickup lines said, kept beside the session and never used for money: result() and lootOf() do not read it.
   s.pick is live only (not in toRow), the end bag look replaces it. */
function takePickup(s, t, p) {
  const K = s.pick || (s.pick = { items: {}, unnamed: { Equip: 0, Use: 0, Etc: 0 }, equips: 0, mesos: { sum: 0, unsure: 0 }, lines: 0, lastLineT: null, cum: [], counted: 0 });
  for (const it of p.items || []) {
    const n = it.qty == null ? 1 : it.qty, tab = it.tab;
    if (tab === 'Equip') { K.equips += n; continue; }
    if (it.name == null) { if (K.unnamed[tab] != null) { K.unnamed[tab] += n; K.counted += n; } continue; }
    K.counted += n;
    const k = tab + '|' + it.name, x = K.items[k] || (K.items[k] = { name: it.name, tab, count: 0 });
    x.count += n;
  }
  for (const m of p.mesos || []) { if (m == null) K.mesos.unsure++; else K.mesos.sum += m; }
  if (p.lines > 0) { K.lines += p.lines; K.lastLineT = t; }
  K.cum.push([t, K.counted]);
}
// items the lines counted by time t (equips left out)
function countedBy(s, t) {
  const c = (s.pick && s.pick.cum) || [];
  let n = 0;
  for (const e of c) { if (e[0] <= t) n = e[1]; else break; }
  return n;
}
function pickups(s) {
  const K = s.pick || { items: {}, unnamed: { Equip: 0, Use: 0, Etc: 0 }, equips: 0, mesos: { sum: 0, unsure: 0 }, lines: 0, lastLineT: null };
  return { items: Object.values(K.items).map(x => Object.assign({}, x)), unnamed: Object.assign({}, K.unnamed), equips: K.equips, mesos: Object.assign({}, K.mesos), lines: K.lines, lastLineT: K.lastLineT };
}
// lines against the bag: items (not equips, not quickslot potions) gained between the first bag look and the latest
function pickupCompare(s) {
  const B = s.bag;
  if (!B || !B.first || !B.last || B.first === B.last) return null;
  const pots = new Set();
  for (const sl of Object.values(s.slots).concat(s.retired || [])) if (sl.id) pots.add(+sl.id);
  let inBag = 0;
  for (const k of new Set(Object.keys(B.first.items).concat(Object.keys(B.last.items)))) {
    const a = B.first.items[k], b = B.last.items[k], it = b || a;
    if (it.kind === 'equip' || (it.pot || []).some(id => pots.has(+id))) continue;
    inBag += Math.max(0, (b ? b.n : 0) - (a ? a.n : 0));
  }
  // sales at an NPC shop between the two looks leave the bag without a line to show for it, so the two can't be compared
  if (((s.shop && s.shop.visits) || []).some(v => v.t1 >= B.first.t && v.t0 <= B.last.t)) return null;
  const fromLines = countedBy(s, B.last.t) - countedBy(s, B.first.t);
  const gap = Math.abs(inBag - fromLines);
  return { fromLines, inBag, differs: gap > 0, unreliable: gap > 3 && gap > inBag / 4 };
}
// Does the bag need a look? Yes with no start look, when the lines can't be trusted (they differ from the bag by more than a
// quarter and 3, and the last look is over 2 minutes old), or when EXP or mesos moved since the last line and the last look
// but no line has been seen for 2 minutes (the strip may be covered). o: { sinceT: when a line (of any kind) was last seen,
// or tracking began; movedT: when EXP or mesos last moved, or null }
const PICK_QUIET_MS = 120000;
function pickNeedsFlip(s, t, o) {
  const B = s.bag;
  if (!B || !B.sets || !B.last) return true;
  // a strip that never read a line (covered, or a setup it doesn't fit) can't be told from quiet lines: no nagging
  // the end look: with only a start look, a trip to town is the usual end of a run, so ask once there
  if (o && o.inTown && B.sets < 2) return true;
  const c = pickupCompare(s);
  if (c && c.unreliable && s.pick && s.pick.lines && t - B.last.t > PICK_QUIET_MS) return true;
  if (!(o && o.sinceT)) return false;
  const since = Math.max(o.sinceT, B.last.t);
  // EXP is stamped a tick or two after the line that came with the kill, so only movement well after the last line counts
  return !!(o && o.movedT) && o.movedT > since + 5000 && t - since > PICK_QUIET_MS;
}

function add(s, r) {
  const t = r.t;
  if (r.pickup) { takePickup(s, t, r.pickup); if (Object.keys(r).every(k => k === 't' || k === 'pickup')) return s; }
  // a running session kept from before the EXP clock (no expFrom at all): the clock covers all of it, as its EXP does
  if (!('expFrom' in s)) { s.expFrom = s.gainExp || s.gainPct ? 0 : null; s.expTo = s.expFrom == null ? null : s.activeMs; }
  if (r.level && (!s.level || r.level > s.level)) s.level = r.level;   // a stale level read never undoes a level up
  if (s.levelStart == null && s.level) s.levelStart = s.level;
  // the map the game shows: with no EXP yet the run follows it, after that the run is the map with the most EXP (creditMap)
  if (r.map != null) { s.mapNow = r.map; if (!s.mapExp) s.mapId = r.map; }
  const b = bucket(s, t);
  if (r.exp != null && r.pct != null) {
    // over 30 seconds since the last EXP read (the share stopped, the page reloaded, the bar out of sight) is a pause:
    // its time isn't counted, so the EXP gained and potions drunk across it aren't either (counting one without the
    // other inflates the rates)
    if (s.last && s.lastValidT != null && t - s.lastValidT > CFG.maxGapMs) {
      s.last = null; s.pend = null; s.pausedMs = (s.pausedMs || 0) + (t - s.lastValidT);
      for (const sl of Object.values(s.slots)) sl.paused = true;
    }
    const e = takeExp(s, t, r.exp, r.pct);
    if (e.ok) {
      if (s.lastValidT != null) { const dt = t - s.lastValidT; if (dt > 0 && dt <= CFG.maxGapMs) s.activeMs += dt; }
      s.lastValidT = t;
      // the EXP clock: where the active clock stood at the first kill and at the latest (a death isn't a kill)
      if (e.dExp > 0 || e.dPct > 0) { if (s.expFrom == null) s.expFrom = s.activeMs; s.expTo = s.activeMs; s.lastKillT = t; }
      if (e.dExp) { b.exp += e.dExp; b.pct += e.dPct; b.idle = false; }
      if (e.dExp > 0 && s.mapNow != null) creditMap(s, e.dExp);
      if (e.dExp < 0) b.died = true;
    }
  }
  if (r.counts) takeCounts(s, t, r.counts);   // a reading without counts (mesos only) leaves the slots alone
  if (r.mesos != null) takeMesos(s, t, r.mesos);
  if (r.shop != null || r.shopOpen === false) takeShop(s, t, r);
  else if (s.shop && s.shop.open && t - s.shop.seen > SHOP_GONE_MS) closeVisit(s, s.shop.visits[s.shop.visits.length - 1]);
  if (s.shop) settleShop(s, t);
  if (s.meso && s.meso.jumpPend) settleJump(s);
  if (r.etc) takeEtc(s, t, r.etc);
  if ('bagOpen' in r) takeBag(s, t, r);
  // the party size changes only when two party readings in a row agree (a tooltip over the list for one read
  // changes nothing); readings without a party read in between don't count
  if (r.party) {
    if (s.partyNow == null) { s.partyNow = r.party; s.party.push([t, r.party]); }
    else if (r.party === s.partyNow) s.partyPend = null;
    else if (s.partyPend === r.party) { s.partyNow = r.party; s.partyPend = null; s.party.push([t, r.party]); }
    else s.partyPend = r.party;
  }
  if (s.partyNow) b.party = s.partyNow;
  s.tLast = Math.max(s.tLast, t);
  keepTrail(s, t);
  return s;
}

/* ---------- numbers ---------- */

// EXP an hour runs from the first kill to the latest (Rimmah, 2026-11-02): town before the first and after the last isn't
// grinding, a repot trip in between still is. Pauses stay out, since they never reach the active clock
const expMsOf = s => s.expFrom != null ? s.expTo - s.expFrom : 0;
// avgExpPerKill: the map's average EXP a kill, for kills a minute (an estimate; a party shares EXP)
function stats(s, t, avgExpPerKill) {
  const mins = s.activeMs / 60000, hrs = mins / 60, o = { exp: s.gainExp, pct: s.gainPct, mins, pausedMins: (s.pausedMs || 0) / 60000, deaths: s.deaths, levels: s.levels };
  const expMins = o.expMins = expMsOf(s) / 60000, rated = expMins >= 2;
  o.expHr = rated ? s.gainExp / (expMins / 60) : null;
  o.expMin = rated ? s.gainExp / expMins : null;
  o.pctHr = rated ? s.gainPct / (expMins / 60) : null;
  const size = s.sizes[s.level] || (s.last && s.last.pct >= 5 ? s.last.exp / (s.last.pct / 100) : null);
  o.expToLevel = size && s.last ? Math.max(0, size - s.last.exp) : null;
  o.hrsToLevel = size && s.last && o.expHr > 0 ? (size - s.last.exp) / o.expHr : null;   // never a time below zero
  // what deaths cost; a session from before this was kept estimates it from the minutes that went backwards
  const back = k => s.minutes.reduce((a, m) => a + (m[k] < 0 ? -m[k] : 0), 0);
  o.lostExp = s.lostExp != null ? s.lostExp : s.deaths ? back('exp') : 0;
  o.lostPct = s.lostPct != null ? s.lostPct : s.deaths ? back('pct') : 0;
  o.earnedPct = o.pct + o.lostPct;
  o.kpm = o.expMin && avgExpPerKill ? o.expMin / avgExpPerKill : null;
  o.potUsed = 0; o.potCost = 0;
  const usedBy = {};
  for (const sl of Object.values(s.slots).concat(s.retired || [])) {
    o.potUsed += sl.used; o.potCost += sl.used * (sl.price || 0);
    if (sl.id && sl.used) usedBy[sl.id] = (usedBy[sl.id] || 0) + sl.used;
  }
  // each potion drunk for every 1% of EXP (Lemons per 1%), once there's a little EXP to divide by
  o.perPct = {};
  if (s.gainPct >= 0.3) for (const id of Object.keys(usedBy)) o.perPct[id] = usedBy[id] / s.gainPct;
  o.costHr = mins >= 2 ? o.potCost / hrs : null;   // potions an hour stay on the session clock: town Lemons cost too
  o.per1 = s.gainPct >= 0.3 && o.potCost > 0 ? o.potCost / s.gainPct : null;
  // mesos: the change between the first and latest inventory look, potions bought in between added back
  const m = s.meso;
  o.mesoLooks = m ? m.looks : 0;
  o.mesoJump = m && m.jump || null;
  o.mesosEarned = null; o.mesosHr = null; o.netHr = null; o.mesoMin = 0; o.mesoFrom = null; o.mesoTo = null; o.refills = null;
  if (m && m.first && m.last && m.last.t - m.first.t >= 60000) {
    o.refills = spentBetween(s, m.first, m.last);
    o.traded = tradedOf(m);
    o.mesosEarned = (m.last.v - m.first.v) + o.refills - o.traded;
    // the totals as read, to check against the game (a saved session only kept the difference)
    if (!m.saved) { o.mesoFrom = m.first.v; o.mesoTo = m.last.v; }
    o.mesoMin = (m.last.t - m.first.t) / 60000;
    // an hourly rate needs 10 minutes between the first and latest peek: over 2 minutes one lucky drop reads as 100K an hour
    if (o.mesoMin >= RATE_MIN) o.mesosHr = o.mesosEarned / (o.mesoMin / 60);
  }
  const e = etcOf(s);
  o.etcLooks = s.etcs ? s.etcs.looks : 0; o.etcValue = e.value; o.etcHr = e.value != null && e.min >= RATE_MIN ? e.value / (e.min / 60) : null;
  // profit: mesos earned + etc picked up (at NPC prices) - potions drunk
  // profit needs the mesos counted: etc minus potions alone reads as a big loss that is really just income not counted yet
  o.profitHr = o.mesosHr != null ? o.mesosHr + (o.etcHr || 0) - (o.costHr || 0) : null;
  o.netHr = o.profitHr;
  o.profit = o.mesosEarned != null ? o.mesosEarned + (o.etcValue || 0) - o.potCost : null;
  // pace: the last 5 and 10 minutes once the session reaches back that far, and since Reset average
  const at = snap(s, t);
  o.pace = {};
  for (const w of [5, 10]) {
    let a = null;
    for (const x of s.trail || []) { if (x.t <= t - w * 60000) a = x; else break; }
    o.pace[w] = a ? between(s, a, at) : null;
  }
  o.markT = s.mark ? s.mark.t : null;
  o.since = s.mark ? between(s, s.mark, at) : null;
  // the last 10 whole minutes against the session, after 12 minutes
  const now = minuteOf(s, t);
  if (o.expHr && now >= 12) {
    const last10 = s.minutes.slice(Math.max(0, now - 10), now).reduce((a, m) => a + m.exp, 0);
    o.trend = (last10 * 6) / o.expHr - 1;
  }
  return o;
}

/* ---------- the session result: was it positive or negative in mesos ---------- */

// Income is only known between looks, so every number is cut to one counted window: Just track runs from the first
// meso look to the latest, Count my loot from the first full bag set to the latest (each set carries the meso total and
// where the session stood). Picked up is what's left of mesos earned once the shop is taken out, so the tiles add up:
// picked up + sold at the shop - other shop buys + loot kept - potions drunk = the session's total. The Lemon and Meat
// tiles use the window too, or the whole session until there is one. A saved session returns the card it saved.
function result(s, t) {
  if (s.savedCard) return s.savedCard;
  const mode = s.mode === 'loot' ? 'loot' : 'track', m = s.meso, B = s.bag;
  let a = null, b = null;
  const sets = mode === 'loot' && B && B.first && B.last && B.last.t - B.first.t >= 60000 && B.first.meso && B.last.meso;
  if (sets) {
    a = { t: B.first.t, at: B.first.at, v: B.first.meso.v, mt: B.first.meso.t, bought: B.first.bought };
    b = { t: B.last.t, at: B.last.at, v: B.last.meso.v, mt: B.last.meso.t, bought: B.last.bought };
  // the meso looks' window: Just track's, and Count my loot's until its bag has two sets (Rimmah: the mesos already seen
  // count meanwhile, loot left out)
  } else if (m && m.first && m.last && m.last.t - m.first.t >= 60000 && m.first.at && m.last.at) { a = m.first; b = m.last; }
  const A = a ? a.at : { active: 0, pct: 0, used: {} }, Z = b ? b.at : snap(s, t);
  const secs = (Z.active - A.active) / 1000, pct = Z.pct - A.pct;
  const drunk = id => Math.max(0, ((Z.used || {})[id] || 0) - ((A.used || {})[id] || 0));
  const eatOf = ids => { const n = ids.reduce((x, id) => x + drunk(id), 0); return { n, cost: ids.reduce((x, id) => x + drunk(id) * priceOf(s, +id), 0), everySec: n ? secs / n : null, perPct: n && pct >= 0.3 ? n / pct : null }; };
  const E = s.eat || { lemon: [], meat: [], meatHp: 0 }, ids = Object.keys(Z.used || {}), others = ids.filter(id => !E.lemon.includes(+id) && !E.meat.includes(+id));
  const o = { mode, window: null, pickedUp: null, sold: null, otherBuys: null, potions: null, loot: null, total: null, perHr: null, verdict: null,
    mesosOnly: null, flipped: false, perPct: null, eat: { lemon: eatOf(E.lemon), meat: Object.assign(eatOf(E.meat), { hp: 0 }) }, other: eatOf(others) };
  o.eat.meat.hp = o.eat.meat.n * (E.meatHp || 0);
  if (!a) return o;
  o.window = { from: a.t, to: b.t, mins: secs / 60, sessionMins: s.activeMs / 60000 };
  const traded = ((m && m.trades) || []).filter(x => x.t > a.t && x.t <= b.t).reduce((x, y) => x + y.amount, 0);
  // the shop cut by when each end's meso total was read (a set's total is read before its flip ends)
  const earned = (b.v - a.v) + spentBetween(s, a, b) - traded, sh = shopOf(s, a.mt != null ? a.mt : a.t, b.mt != null ? b.mt : b.t);
  o.sold = sh.sold; o.otherBuys = sh.other;
  o.pickedUp = earned - sh.sold + sh.other;
  o.potions = ids.reduce((x, id) => x + drunk(id) * priceOf(s, +id), 0);
  if (sets) o.loot = lootOf(s);
  o.mesosOnly = o.pickedUp + o.sold - o.otherBuys - o.potions;
  o.total = o.mesosOnly + (o.loot ? o.loot.value : 0);
  o.perHr = o.window.mins >= RATE_MIN ? o.total / (o.window.mins / 60) : null;
  o.verdict = o.total >= 0 ? 'Profitable' : 'Losing';
  o.flipped = !!o.loot && o.mesosOnly < 0 && o.total >= 0;
  o.perPct = pct >= 1 ? o.total / pct : null;
  return o;
}
// Count my loot's "In town? Flip through your bag": a refill since the latest bag set, and no kill since the refill (back
// to killing, the player has left town; asking all the way to the end flip never went away)
function inTown(s) {
  return !!s.lastRefill && (!s.bag || !s.bag.last || s.lastRefill > s.bag.last.t) && !(s.lastKillT > s.lastRefill);
}
// Count my loot's Equip, Use and Etc list: a to do until the first full flip, three ticks for a moment after a flip, and back
// only while a later flip is under way (the bag open, or gone for CLOSE_MS or less, with pages read and no set yet this opening)
function bagListShows(s, t) {
  const B = s && s.bag;
  if (!B || !B.sets) return true;
  if (t - B.last.t < BAG_TICKS_MS) return true;
  if (B.last.t >= B.openT) return false;
  if (!B.open && !(B.closedT != null && t - B.closedT <= CLOSE_MS)) return false;
  return BAG_TABS.some(tab => B.done[tab] || (B.acc[tab] && B.acc[tab].strips.length));
}
// the player's usual mesos an hour on a map: earlier saved sessions there, counted the same way, 10 minutes or longer;
// none until there are 3
function usualOf(rows, { mapId, mode, exceptId }) {
  return standing(rows, { mapId, exceptId, metric: 'mesosHr', mode }).usual;
}
// one saved run's number for a metric, or null when it doesn't count (too short, no result, no potions)
function rowValue(r, q) {
  if (q.metric === 'mesosHr') return (r.loot_mode || 'track') === q.mode && r.result != null && r.result_min >= BEST_MIN_RESULT ? r.result / (r.result_min / 60) : null;
  if (q.metric === 'expHr') { const min = r.exp_min != null ? r.exp_min : r.active_min; return min >= BEST_MIN_RESULT ? r.exp / (min / 60) : null; }
  if (q.metric === 'potPer1') {
    if (!(r.active_min >= BEST_MIN_RESULT) || !(r.pct >= 1) || !Array.isArray(r.potions)) return null;
    const used = r.potions.reduce((a, p) => a + ((q.potIds || []).includes(+p.id) ? p.used || 0 : 0), 0);
    return used > 0 ? used / r.pct : null;
  }
  return null;
}
// this run against the player's other runs on the same map: its rank, the best of the others (and when), and their plain
// average once there are 3. Potions per 1% is better the lower it is
function standing(rows, q) {
  const lowerBetter = q.metric === 'potPer1';
  const others = [];
  for (const r of rows || []) {
    if (r.id === q.exceptId || +r.map_id !== +q.mapId) continue;
    const v = rowValue(r, q);
    if (v != null && isFinite(v)) others.push({ v, t: Date.parse(r.started_at) });
  }
  const has = q.value != null;
  const better = has ? others.filter(o => lowerBetter ? o.v < q.value : o.v > q.value).length : 0;
  const best = others.reduce((b, o) => !b || (lowerBetter ? o.v < b.v : o.v > b.v) ? o : b, null);
  return { value: has ? q.value : null, rank: has ? better + 1 : null, of: others.length + (has ? 1 : 0), best: best && { v: best.v, t: best.t },
    usual: others.length >= 3 ? others.reduce((a, o) => a + o.v, 0) / others.length : null };
}
const BEST_MIN_RESULT = 10;

// a clock for every potion used in the last 10 minutes, at its rate over that window, the one running out first leading
// (Lemons for MP and Meat for HP both run at once); measuring: one is still in its first 2 minutes of use
function clocks(s, t) {
  const list = []; let measuring = false;
  for (const sl of Object.values(s.slots)) {
    if (sl.firstUse == null || sl.firstUse > t || !sl.uses.some(u => u[0] > t - CFG.rateWindow)) continue;
    if (t - sl.firstUse < CFG.minUse) { measuring = true; continue; }
    const from = Math.max(t - CFG.rateWindow, sl.firstUse), used = sl.uses.filter(u => u[0] > from && u[0] <= t).reduce((a, u) => a + u[1], 0);
    const perMin = used / ((t - from) / 60000);
    if (!perMin) continue;
    // a big change still in its 15 second check is shown at once (Rimmah, 2026-11-04: a refill took 15 s to show);
    // only drunk, bought and cost wait for it
    const left = sl.big ? sl.big.v : sl.count, secs = Math.round(left / perMin * 60);
    list.push({ id: sl.id, name: sl.name, key: sl.key, left, full: Math.max(sl.full || 0, left), perMin, secs, doneAt: t + secs * 1000, low: secs < CFG.low });
  }
  return { list: list.sort((a, b) => a.secs - b.secs), measuring };
}
const countdowns = (s, t) => clocks(s, t).list;
// the potion that runs out first
function countdown(s, t) {
  const c = clocks(s, t);
  return c.list[0] || (c.measuring ? { measuring: true } : null);
}

/* ---------- saving: one grind_sessions row (supabase/grind.sql) ---------- */

const iso = ms => new Date(ms).toISOString();
const r2 = v => Math.round(v * 100) / 100;
function mesosOf(s) {
  const m = s.meso;
  if (!m || !m.first || !m.last || m.last.t - m.first.t < 60000) return { earned: null, min: null };
  return { earned: (m.last.v - m.first.v) + spentBetween(s, m.first, m.last) - tradedOf(m), min: Math.round((m.last.t - m.first.t) / 60) / 1000 };
}
function toRow(s) {
  const byId = {};
  for (const sl of (s.retired || []).concat(Object.values(s.slots))) {
    if (!sl.id) continue;
    const p = byId[sl.id] || (byId[sl.id] = { id: sl.id, name: sl.name, used: 0, bought: 0, price: sl.price });
    p.used += sl.used; p.bought += sl.bought; p.price = sl.price;
  }
  const potions = Object.values(byId).sort((a, b) => a.id - b.id);
  // the result card as shown (its loot list capped at 40 rows to fit its column), and how it was counted
  const card = result(s, s.tLast);
  if (card.loot && card.loot.items.length > 40) card.loot = Object.assign({}, card.loot, { items: card.loot.items.slice(0, 40) });
  return { id: s.id, map_id: s.mapId, started_at: iso(s.t0), ended_at: iso(s.tLast), level_start: s.levelStart, level_end: s.level,
    // counted with loot only once the bag had two sets; before that the Just track way (the usual compares like with like)
    loot_mode: card.mode === 'loot' && !card.loot ? 'track' : card.mode, result: card.total, result_min: card.window ? Math.round(card.window.mins * 1000) / 1000 : null, card,
    // active minutes to 0.001 (a coarser cut shifts the rates of a short session)
    exp: Math.round(s.gainExp), pct: r2(s.gainPct), active_min: Math.round(s.activeMs / 60) / 1000, exp_min: Math.round(expMsOf(s) / 60) / 1000, deaths: s.deaths, potions,
    mesos_earned: mesosOf(s).earned, meso_min: mesosOf(s).min, etc_value: etcOf(s).value, etc_min: etcOf(s).min,
    // [minute, EXP, percent, party, { itemId: used }]
    minutes: s.minutes.map(m => [m.m, Math.round(m.exp), r2(m.pct), m.party, m.used]) };
}
// a saved session, for its charts and numbers (it can't take more readings). eat: as create's, for its Lemon and Meat
function fromRow(row, eat) {
  const s = create({ mapId: row.map_id, t: Date.parse(row.started_at), eat });
  s.id = row.id; s.tLast = Date.parse(row.ended_at); s.levelStart = row.level_start; s.level = row.level_end;
  s.levels = (row.level_end || 0) - (row.level_start || 0);
  s.gainExp = row.exp; s.gainPct = row.pct; s.activeMs = row.active_min * 60000; s.deaths = row.deaths;
  s.expFrom = 0; s.expTo = (row.exp_min != null ? row.exp_min : row.active_min) * 60000;   // saved before the EXP clock: all of it
  s.lostExp = s.lostPct = null;   // not saved: estimated from the minutes
  for (const p of row.potions || []) s.slots['p' + p.id] = { key: 'p' + p.id, id: p.id, name: p.name, price: p.price, count: 0, pend: null, used: p.used, bought: p.bought, missing: 0, uses: [], firstUse: null };
  if (row.mesos_earned != null) s.meso = { saved: true, looks: 2, pend: null, first: { t: s.t0, v: 0, bought: 0 }, last: { t: s.t0 + row.meso_min * 60000, v: row.mesos_earned, bought: 0 } };
  // a saved session keeps only the etc value and its minutes: stand them in as one item worth 1 a piece
  if (row.etc_value != null) s.etcs = { looks: 2, pend: null, first: { t: s.t0, key: '', items: { v: { n: 0, price: 1 } } }, last: { t: s.t0 + row.etc_min * 60000, key: 'v', items: { v: { n: row.etc_value, price: 1 } } } };
  s.minutes = (row.minutes || []).map(([m, exp, pct, party, used]) => ({ m, exp, pct, party, used: used || {}, idle: !exp }));
  s.mode = row.loot_mode || 'track';
  if (row.card && row.card.mode) s.savedCard = row.card;   // it opens to the card it showed
  else if (row.mesos_earned != null) s.savedCard = olderCard(s, row);
  return s;
}
// a session saved before the result card: its card from the numbers it kept (mesos earned over its peeks, the etc it
// picked up as loot, every potion it drank), the same sum it showed then as its profit
function olderCard(s, row) {
  const o = stats(s, s.tLast), live = result(Object.assign({}, s, { savedCard: null, meso: null }), s.tLast);
  const loot = o.etcValue != null ? { value: o.etcValue, items: [], best: null } : null, total = o.profit;
  return { mode: loot ? 'loot' : 'track', window: { from: s.t0, to: s.t0 + (row.meso_min || 0) * 60000, mins: row.meso_min || 0, sessionMins: row.active_min || 0 },
    pickedUp: o.mesosEarned, sold: 0, otherBuys: 0, potions: o.potCost, loot, total, perHr: o.profitHr, verdict: total >= 0 ? 'Profitable' : 'Losing',
    mesosOnly: o.mesosEarned - o.potCost, flipped: !!loot && o.mesosEarned - o.potCost < 0 && total >= 0, perPct: row.pct >= 1 ? total / row.pct : null, eat: live.eat, other: live.other };
}

// The whole session as rows of 60 minutes, one row an hour (the strip in This run): each cell is that minute's EXP, a minute
// with none (or a gap) is 0. Takes the session's minutes (objects with exp) or plain numbers; an empty list is no rows.
function wholeRows(minutes) {
  const xs = (minutes || []).map(m => typeof m === 'number' ? m : (m && m.exp > 0 ? m.exp : 0)), rows = [];
  for (let i = 0; i < xs.length; i += 60) rows.push(xs.slice(i, i + 60));
  return rows;
}
window.GrindSession = { CFG, wholeRows, create, add, stats, countdown, countdowns, minuteOf, toRow, fromRow, mark, trade, keepMesos, rebase, lootOf, shopOf, learnPrice, result, usualOf, standing, inTown, bagListShows, pickMap, pickups, pickupCompare, pickNeedsFlip };
})();
