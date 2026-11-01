// Grind tab session engine: readings from the shared game window in, per minute buckets and numbers out. No DOM.
// The EXP rules are Repot Run Live's (exp-tracker/live/index.html takeExp): an implausible jump waits for a second read,
// a wrap from 80%+ to 20%- is a level up, a confirmed drop is a death. Potion counts change only when two reads agree;
// down is used, up is bought.
// window.GrindSession = { create, add, stats, countdown, minuteOf, toRow, fromRow }
(function () {
'use strict';

const CFG = { jumpFrac: 0.04, sizeTol: 0.06, maxGapMs: 30000, rateWindow: 600000, minUse: 120000, low: 300 };

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  const h = '0123456789abcdef', r = () => h[Math.floor(Math.random() * 16)];
  let s = ''; for (let i = 0; i < 32; i++) s += i === 12 ? '4' : i === 16 ? h[8 + Math.floor(Math.random() * 4)] : r();
  return s.slice(0, 8) + '-' + s.slice(8, 12) + '-' + s.slice(12, 16) + '-' + s.slice(16, 20) + '-' + s.slice(20);
}

// prices: { [itemId]: price } corrections the player made; they win over a reading's default price
function create({ mapId, t, prices } = {}) {
  return { id: uuid(), mapId: mapId || null, t0: t, tLast: t, prices: prices || {},
    level: null, levelStart: null, levels: 0, sizes: {}, last: null, pend: null,
    gainExp: 0, gainPct: 0, deaths: 0, lostExp: 0, lostPct: 0, activeMs: 0, lastValidT: null,
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
// potion picked up off the ground, not bought (a mob drops one at a time; a shop trip buys dozens)
const BIG = 30, HOLD_MS = 15000, PICKUP = 5;
// every slot starts over from its next read (grind.js calls this when the HUD changed size)
function rebase(s) { for (const sl of Object.values(s.slots)) { sl.rebase = true; sl.pend = null; sl.big = null; } }
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
        count: c.value, pend: null, used: 0, bought: 0, missing: 0, uses: [], firstUse: null };
      continue;
    }
    sl.missing = 0;
    // after the HUD changed size: start over from what the slot shows, counting nothing for the switch
    if (sl.rebase) { sl.count = c.value; sl.rebase = false; sl.pend = null; sl.big = null; continue; }
    if (c.value === sl.count) { sl.pend = null; sl.big = null; continue; }
    const d = c.value - sl.count;
    // a drop no one could drink between two reads (684 read as 84 for a moment), or a rise as big (84 read as 684), is a
    // misread until it holds for 15 seconds; otherwise it reads as hundreds drunk, or hundreds bought
    if (Math.abs(d) > BIG) {
      if (!sl.big || sl.big.v !== c.value) { sl.big = { v: c.value, t }; continue; }
      if (t - sl.big.t < HOLD_MS) continue;
      sl.big = null; sl.pend = null; change(s, sl, t, d); continue;
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
function change(s, sl, t, d) {
  if (d < 0) {
    sl.used += -d;
    if (sl.firstUse == null) sl.firstUse = t;
    sl.uses.push([t, -d]);
    while (sl.uses.length && sl.uses[0][0] < t - CFG.rateWindow) sl.uses.shift();
    const b = bucket(s, t); b.used[sl.id] = (b.used[sl.id] || 0) + -d;
  } else if (d <= PICKUP) sl.found = (sl.found || 0) + d;   // picked up: stock that cost nothing
  else { sl.bought += d; s.boughtCost = (s.boughtCost || 0) + d * (sl.price || 0); s.lastRefill = t; }   // a refill: back from town
  sl.count += d;
}

/* ---------- mesos: totals read off the inventory window now and then ---------- */

// how many of each potion had been bought so far, by item id
function boughtNow(s) {
  const by = {};
  for (const sl of Object.values(s.slots).concat(s.retired || [])) if (sl.id && sl.bought) by[sl.id] = (by[sl.id] || 0) + sl.bought;
  return by;
}
// the mesos spent on potions bought between two looks, at the prices as they are now (a corrected price fixes refills
// already made); a saved session keeps the spend itself as a number
function spentBetween(s, a, b) {
  if (typeof a.bought === 'number' || typeof b.bought === 'number') return (+b.bought || 0) - (+a.bought || 0);
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
function takeMesos(s, t, v) {
  const m = s.meso || (s.meso = { looks: 0, first: null, last: null, pend: null });
  if (m.last && v === m.last.v) { m.pend = null; m.last.t = t; m.last.bought = boughtNow(s); return; }
  if (m.pend !== v) { m.pend = v; return; }
  m.pend = null;
  const look = { t, v, bought: boughtNow(s) };
  if (m.last) {
    const jump = (v - m.last.v) + spentBetween(s, m.last, look);
    if (Math.abs(jump) >= JUMP) m.jump = { t, amount: jump };
  }
  if (!m.first) m.first = look;
  m.last = look; m.looks++;
}
// leave a trade out of mesos earned: amount is what it did to the total (paid 165k = -165000); answers the question
function trade(s, amount, t) {
  const m = s.meso || (s.meso = { looks: 0, first: null, last: null, pend: null });
  (m.trades = m.trades || []).push({ t, amount });
  m.jump = null;
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

/* ---------- one reading ---------- */

// reading: { t, exp, pct, level, counts: [{ key, id, name, price, value }], party }; any part null when unread
function add(s, r) {
  const t = r.t;
  if (r.level && (!s.level || r.level > s.level)) s.level = r.level;   // a stale level read never undoes a level up
  if (s.levelStart == null && s.level) s.levelStart = s.level;
  const b = bucket(s, t);
  if (r.exp != null && r.pct != null) {
    const e = takeExp(s, t, r.exp, r.pct);
    if (e.ok) {
      if (s.lastValidT != null) { const dt = t - s.lastValidT; if (dt > 0 && dt <= CFG.maxGapMs) s.activeMs += dt; }
      s.lastValidT = t;
      if (e.dExp) { b.exp += e.dExp; b.pct += e.dPct; b.idle = false; }
      if (e.dExp < 0) b.died = true;
    }
  }
  if (r.counts) takeCounts(s, t, r.counts);   // a reading without counts (mesos only) leaves the slots alone
  if (r.mesos != null) takeMesos(s, t, r.mesos);
  if (r.etc) takeEtc(s, t, r.etc);
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

// avgExpPerKill: the map's average EXP a kill, for kills a minute (an estimate; a party shares EXP)
function stats(s, t, avgExpPerKill) {
  const mins = s.activeMs / 60000, hrs = mins / 60, o = { exp: s.gainExp, pct: s.gainPct, mins, deaths: s.deaths, levels: s.levels };
  const rated = mins >= 2;
  o.expHr = rated ? s.gainExp / hrs : null;
  o.expMin = rated ? s.gainExp / mins : null;
  o.pctHr = rated ? s.gainPct / hrs : null;
  const size = s.sizes[s.level] || (s.last && s.last.pct >= 5 ? s.last.exp / (s.last.pct / 100) : null);
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
  o.costHr = rated ? o.potCost / hrs : null;
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
    const secs = Math.round(sl.count / perMin * 60);
    list.push({ id: sl.id, name: sl.name, key: sl.key, left: sl.count, perMin, secs, doneAt: t + secs * 1000, low: secs < CFG.low });
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
  return { id: s.id, map_id: s.mapId, started_at: iso(s.t0), ended_at: iso(s.tLast), level_start: s.levelStart, level_end: s.level,
    // active minutes to 0.001 (a coarser cut shifts the rates of a short session)
    exp: Math.round(s.gainExp), pct: r2(s.gainPct), active_min: Math.round(s.activeMs / 60) / 1000, deaths: s.deaths, potions,
    mesos_earned: mesosOf(s).earned, meso_min: mesosOf(s).min, etc_value: etcOf(s).value, etc_min: etcOf(s).min,
    // [minute, EXP, percent, party, { itemId: used }]
    minutes: s.minutes.map(m => [m.m, Math.round(m.exp), r2(m.pct), m.party, m.used]) };
}
// a saved session, for its charts and numbers (it can't take more readings)
function fromRow(row) {
  const s = create({ mapId: row.map_id, t: Date.parse(row.started_at) });
  s.id = row.id; s.tLast = Date.parse(row.ended_at); s.levelStart = row.level_start; s.level = row.level_end;
  s.levels = (row.level_end || 0) - (row.level_start || 0);
  s.gainExp = row.exp; s.gainPct = row.pct; s.activeMs = row.active_min * 60000; s.deaths = row.deaths;
  s.lostExp = s.lostPct = null;   // not saved: estimated from the minutes
  for (const p of row.potions || []) s.slots['p' + p.id] = { key: 'p' + p.id, id: p.id, name: p.name, price: p.price, count: 0, pend: null, used: p.used, bought: p.bought, missing: 0, uses: [], firstUse: null };
  if (row.mesos_earned != null) s.meso = { saved: true, looks: 2, pend: null, first: { t: s.t0, v: 0, bought: 0 }, last: { t: s.t0 + row.meso_min * 60000, v: row.mesos_earned, bought: 0 } };
  // a saved session keeps only the etc value and its minutes: stand them in as one item worth 1 a piece
  if (row.etc_value != null) s.etcs = { looks: 2, pend: null, first: { t: s.t0, key: '', items: { v: { n: 0, price: 1 } } }, last: { t: s.t0 + row.etc_min * 60000, key: 'v', items: { v: { n: row.etc_value, price: 1 } } } };
  s.minutes = (row.minutes || []).map(([m, exp, pct, party, used]) => ({ m, exp, pct, party, used: used || {}, idle: !exp }));
  return s;
}

window.GrindSession = { CFG, create, add, stats, countdown, countdowns, minuteOf, toRow, fromRow, mark, trade, keepMesos, rebase };
})();
