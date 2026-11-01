// Grind tab (#grind): one click EXP and potion tracker. Share the game window and everything reads itself (screen.js):
// the EXP line, the game's stretch, the level, every quickslot potion and the mesos when the inventory opens (the party
// and etc items are left out for now, until they read right). grind-session.js turns the readings
// into minutes and numbers; this file draws the page (big buttons and the reading checks down the left, this session in
// one slim line with its card, potions and charts folded away, and all time from every saved session), the pop out over
// the game, and saves to the player's private grind_sessions rows or this device.
// Design: docs/superpowers/specs/2026-10-31-grind-tab-design.md
(function () {
'use strict';

const MS = () => window.MapleScreen, GS = () => window.GrindSession;
const KEY_OPEN = 'grind.open', KEY_LOCAL = 'grind.local', KEY_PRICES = 'grind.prices', KEY_MAP = 'grind.map', KEY_HOME = 'grind.mesoHome';
const KEY_LAYOUT = 'grind.layout', KEY_SIZES = 'grind.layoutSizes', KEY_DETAIL = 'grind.detail';
// sessions kept on this device for all time: up to 200, the newest 20 with their minutes (the charts), older ones without
const LOCAL_MAX = 200, LOCAL_MINUTES = 20;
const RESUME_MS = 30 * 60000, SAVE_MS = 60000, LEVEL_EVERY = 20, ICON_EVERY = 40, MESO_SEARCH_EVERY = 40;

/* ---------- formatting ---------- */

const fmt = n => Math.round(n).toLocaleString('en-US');
function fmtK(n) {
  const a = Math.abs(n), s = n < 0 ? '−' : '';
  return s + (a >= 1e6 ? (a / 1e6).toFixed(2) + 'M' : a >= 1e3 ? (a / 1e3).toFixed(1) + 'K' : String(Math.round(a)));
}
// the breakdown under the card: mesos earned with the totals it came from, so it can be checked against the game
function mesoLine(o) {
  const sign = n => (n >= 0 ? '+' : '−') + fmtK(Math.abs(n));
  const math = o.mesoFrom != null ? ' (' + fmt(o.mesoFrom) + ' to ' + fmt(o.mesoTo) + (o.refills ? ', plus ' + fmt(o.refills) + ' spent on potions' : '') +
    (o.traded ? ', leaving out ' + signed(o.traded) + ' traded' : '') + ')' : '';
  return [o.mesosEarned != null ? 'Mesos ' + sign(o.mesosEarned) + math : null, o.etcValue != null ? 'Etc ' + sign(o.etcValue) : null, 'Potions ' + sign(-o.potCost)].filter(Boolean).join(' · ');
}
const perFmt = n => n >= 10 ? String(Math.round(n)) : n.toFixed(1);   // potions per 1%
const signed = n => (n >= 0 ? '+' : '−') + fmt(Math.abs(n));
// deaths count against the session; this says what they cost: "1 death (−2.88%)"
const deathText = o => o.deaths + ' death' + (o.deaths > 1 ? 's' : '') + (o.lostPct ? ' (−' + o.lostPct.toFixed(2) + '%)' : '');
// mesos typed by hand: 165k, 1.5m, 2b, commas (the same rule as the Appraiser and the ledger)
function parseMesos(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase().replace(/[, ]/g, '');
  const m = s.match(/^(\d*\.?\d+)([kmb])?$/);
  return m ? parseFloat(m[1]) * ({ k: 1e3, m: 1e6, b: 1e9 }[m[2]] || 1) : NaN;
}
const fmtDur = mins => { const m = Math.round(mins); return m < 60 ? m + ' min' : Math.floor(m / 60) + 'h ' + (m % 60) + 'm'; };
function clock(secs) {
  secs = Math.max(0, Math.round(secs));
  const h = Math.floor(secs / 3600), m = Math.floor(secs % 3600 / 60), s = String(secs % 60).padStart(2, '0');
  return h ? h + ':' + String(m).padStart(2, '0') + ':' + s : m + ':' + s;
}
const timeOfDay = ms => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const dateOf = ms => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + timeOfDay(ms);
const plural = name => /s$/.test(name) ? name : name + 's';

/* ---------- is it reading everything ---------- */

// f: what the readers have seen. exp, level, size and counts are { ok, fail }: when the reader last worked, and when its
// current run of misses began (null while it works). meso: { at, unclear }: the last inventory look.
// Returns four checks (ok green, wait amber, bad red), the one thing to do (most important first) and stuck, which lights
// up Find my game again. Red is kept for what breaks the core numbers; mesos only ever ask.
const STUCK_MS = 30000, STALE_MS = 15 * 60000;
function health(f) {
  const t = f.t, ago = at => { const m = Math.floor((t - at) / 60000); return m < 1 ? 'just now' : m + ' min ago'; };
  const stuckOn = r => !!(r && r.fail != null && t - r.fail >= STUCK_MS);
  const C = {};
  C.exp = stuckOn(f.exp) ? { state: 'bad', text: "can't see the bar" } : f.exp.ok != null && f.exp.fail == null ? { state: 'ok', text: 'reading' } : { state: 'wait', text: 'looking' };
  // the level is read once a minute, and one read is enough for the session
  C.level = f.level.ok != null ? { state: 'ok', text: f.levelNow ? String(f.levelNow) : 'read' } : stuckOn(f.level) ? { state: 'bad', text: "can't read it" } : { state: 'wait', text: 'looking' };
  C.potions = stuckOn(f.size) ? { state: 'bad', text: "can't measure the game" } : stuckOn(f.counts) ? { state: 'bad', text: "can't read the numbers" }
    : f.counts.ok == null ? { state: 'wait', text: 'looking' } : f.potNone ? { state: 'wait', text: 'none on quickslots' } : { state: 'ok', text: f.potCount ? String(f.potCount) : 'reading' };
  const mesoStale = f.meso.at != null && t - f.meso.at > STALE_MS;
  C.mesos = f.meso.unclear ? { state: 'wait', text: "can't read clearly" } : f.meso.at == null ? { state: 'wait', text: 'open inventory' } : { state: mesoStale ? 'wait' : 'ok', text: ago(f.meso.at) };

  const stuck = ['exp', 'potions', 'level'].some(k => C[k].state === 'bad');
  const say = (state, text) => ({ checks: C, nudge: { state, text }, stuck });
  if (!f.sharing) return say('idle', f.hasSession ? 'Share stopped. Share the game window again to carry on' : 'Share the game window to start');
  if (C.exp.state === 'bad') return say('bad', "Can't see your EXP bar, paused. Is the game still shared, with the bar showing?");
  if (stuckOn(f.size)) return say('bad', "Can't measure the game. Share the game window itself, at full size");
  if (C.potions.state === 'bad') return say('bad', "Can't read your quickslot numbers. Make the game window bigger, or share it again");
  if (C.level.state === 'bad') return say('bad', "Can't read your level. Try Find my game again");
  if (f.exp.ok == null || f.size.ok == null) return say('wait', 'Looking for your game…');
  if (f.potNone) return say('wait', 'Put the potions you drink on your quickslots so they count');
  if (f.meso.unclear) return say('wait', "Can't read your meso total clearly yet. Move the mouse off it");
  if (f.meso.at == null) return say('wait', 'Open your inventory for a moment so mesos count');
  if (mesoStale) return say('wait', 'Mesos last seen ' + ago(f.meso.at) + '. Open your inventory for a moment');
  return say('ok', 'Reading everything');
}

// the pop-out's Lemon tile from the clock of the potion running out first (GrindSession.countdowns): the clock, what's
// left and when, a caption (Lemons get the lemonade jokes), how full the glass is (0 to 100, against how full the slot
// was since the last refill) and low under 5 minutes
function lemonTile(c, t) {
  if (!c) return { clock: '··:··', left: '', cap: 'starts once you drink', juice: 0, low: false };
  const lemon = /lemon/i.test(c.name || '');
  return { clock: clock((c.doneAt - t) / 1000), left: fmt(c.left) + ' left · ' + timeOfDay(c.doneAt),
    cap: c.low ? (lemon ? 'Squeeze time! Refill soon' : 'Almost out! Refill soon') : (lemon ? 'till the juice runs out' : 'till they run out'),
    juice: Math.round(100 * Math.min(1, c.left / (c.full || c.left || 1))), low: !!c.low };
}

// all time on the page, from every saved session (rows as GrindSession.toRow writes them): totals, Lemons and Meat (o.lemon
// and o.meat: the client ids with those names, since two items are named Lemon), the most trained maps, personal bests
// and the last 30 days. Only what was tracked counts, so it's "since you started tracking", never the whole game
const BEST_MIN = 10;   // a session shorter than this can't be a best (3 lucky minutes aren't an EXP an hour)
const dayKey = ms => { const d = new Date(ms); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
function lifetime(rows, o) {
  const L = { sessions: rows.length, mins: 0, exp: 0, deaths: 0, levelFrom: null, levelTo: null, mesos: null, profit: null,
    lemon: { used: 0, cost: 0, pct: 0 }, meat: { used: 0, cost: 0, pct: 0 }, other: { used: 0, cost: 0 }, maps: [],
    best: { expHr: null, longest: null, lemons: null, cheap1: null }, days: 0, streak: 0, daysList: [] };
  const maps = {}, byDay = {}, top = (k, v, row, low) => { const b = L.best[k]; if (!b || (low ? v < b.v : v > b.v)) L.best[k] = { v, row }; };
  for (const r of rows) {
    const mins = r.active_min || 0, exp = r.exp || 0, pct = r.pct || 0;
    L.mins += mins; L.exp += exp; L.deaths += r.deaths || 0;
    if (r.level_start != null) L.levelFrom = L.levelFrom == null ? r.level_start : Math.min(L.levelFrom, r.level_start);
    if (r.level_end != null) L.levelTo = L.levelTo == null ? r.level_end : Math.max(L.levelTo, r.level_end);
    let cost = 0, lemons = 0, meat = 0;
    for (const p of r.potions || []) {
      const c = p.used * (p.price || 0), g = o.lemon.includes(p.id) ? L.lemon : o.meat.includes(p.id) ? L.meat : L.other;
      g.used += p.used; g.cost += c; cost += c;
      if (g === L.lemon) lemons += p.used; else if (g === L.meat) meat += p.used;
    }
    // per 1% only over the sessions that drank them, so a session on other potions doesn't thin it out
    if (lemons && pct > 0) L.lemon.pct += pct;
    if (meat && pct > 0) L.meat.pct += pct;
    if (r.mesos_earned != null) { L.mesos = (L.mesos || 0) + r.mesos_earned; L.profit = (L.profit || 0) + r.mesos_earned - cost; }
    const m = maps[r.map_id] || (maps[r.map_id] = { id: r.map_id, mins: 0, exp: 0 });
    m.mins += mins; m.exp += exp;
    if (mins >= BEST_MIN) top('expHr', exp / (mins / 60), r);
    if (mins > 0) top('longest', mins, r);
    if (lemons) top('lemons', lemons, r);
    if (pct >= 0.3 && cost > 0) top('cheap1', cost / pct, r, true);   // the same 0.3% floor as the sessions list
    const k = dayKey(Date.parse(r.started_at));
    byDay[k] = (byDay[k] || 0) + mins;
  }
  for (const g of [L.lemon, L.meat]) { g.per1 = g.pct ? g.used / g.pct : null; delete g.pct; }
  L.maps = Object.values(maps).map(m => Object.assign(m, { expHr: m.mins ? m.exp / (m.mins / 60) : null })).sort((a, b) => b.mins - a.mins);
  const keys = Object.keys(byDay).sort();
  L.days = keys.length;
  for (let i = 0, run = 0; i < keys.length; i++) {
    const prev = i && dayKey(Date.parse(keys[i] + 'T12:00:00') - 864e5) === keys[i - 1];
    run = prev ? run + 1 : 1; L.streak = Math.max(L.streak, run);
  }
  const noon = new Date(o.now); noon.setHours(12, 0, 0, 0);
  for (let i = 29; i >= 0; i--) { const k = dayKey(noon.getTime() - i * 864e5); L.daysList.push({ date: k, mins: byDay[k] || 0 }); }
  return L;
}

/* ---------- the tab ---------- */

function mount(root, deps) {
  const { el, store, api, data, pictures } = deps;
  const jget = (k, d) => { try { const v = store.get(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const jset = (k, v) => store.set(k, JSON.stringify(v));
  const prices = jget(KEY_PRICES, {});
  let mapId = +store.get(KEY_MAP) || 10004134;
  let session = null, viewing = null, editing = false, picturesReady = false;
  let lastHealth = null, lastRows = [], lifeAt = 0;   // the checks as last drawn, the saved sessions as last listed, when all time was drawn
  const open = jget(KEY_OPEN, null);
  if (open && open.tLast && Date.now() - open.tLast < RESUME_MS) session = open;   // carry on after a reload or a dropped share
  // per share: where the EXP line is, the measured stretch, and what each reader last saw
  const st = { line: null, m: null, fw: 0, fh: 0, reads: 0, ticks: 0, expMiss: 0, measureAt: 0, levelAt: 0, level: null, party: null, slots: {}, lastSave: 0,
    sharing: false, potNone: false, potCount: 0, h: null };
  // when each reader last worked and when its current run of misses began, for the checks on the card
  const fresh = () => ({ exp: { ok: null, fail: null }, level: { ok: null, fail: null }, size: { ok: null, fail: null }, counts: { ok: null, fail: null } });
  st.h = fresh();
  const mark = (k, good) => { const r = st.h[k], now = Date.now(); if (good) { r.ok = now; r.fail = null; } else if (r.fail == null) r.fail = now; };
  MS().load(pictures).then(() => { picturesReady = true; });

  const mobsOf = id => { const m = data.maps[id]; return m ? m.s.map(([mob, count]) => { const x = data.mobs[mob]; return { name: x[0], level: x[1], exp: x[2], hp: x[3], undead: x[4], count }; }) : []; };
  const avgExp = id => { let n = 0, e = 0; for (const m of mobsOf(id)) { n += m.count; e += m.count * m.exp; } return n ? e / n : null; };
  const mapName = id => (data.maps[id] && data.maps[id].n) || 'Unknown map';

  /* ----- layout: big buttons down the left with what reads the game and the map under them; on the right this session
     in one slim line (its card, potions and charts fold away under Session details, since the pop out is the live view)
     and all time, every saved session added up, filling the rest ----- */
  const status = el('p', { class: 'g-status', id: 'g-status' });
  const shareArea = el('div', { id: 'g-sharearea' });
  const btn = (id, icon, label, onclick) => el('button', { type: 'button', id, class: 'g-btn', onclick }, el('i', { 'aria-hidden': 'true' }, icon), label);
  const popBtn = btn('g-pop', '⧉', 'Pop out over the game', () => popOut());
  // a fresh average from now on, to try another way of grinding; the session average keeps going
  const markBtn = btn('g-mark', '↺', 'Reset average', () => resetAverage());
  // the quick reset: look for the bars, measure and name the potions again, keeping the session
  const refindBtn = btn('g-refind', '⌖', 'Find my game again', () => refind());
  const newBtn = btn('g-new', '＋', 'New session', () => newSession());
  // the next frame from the share comes down as a picture, to send when something reads wrong
  const snapBtn = btn('g-snap', '◉', 'Save a frame', () => { st.wantSnap = true; setStatus('Saving the next frame from your game…'); });
  const HEALTH = [['exp', 'EXP'], ['level', 'Level'], ['potions', 'Potions'], ['mesos', 'Mesos']];
  const SIGN = { ok: '✓', wait: '!', bad: '✕', idle: '·' };
  const CHECKS = [['exp', 'EXP line'], ['size', 'Game size'], ['level', 'Level'], ['potions', 'Potions'], ['mesos', 'Mesos']];
  const NEEDED = ['exp', 'size', 'level', 'potions'];   // mesos only come when the inventory opens
  const check = el('ul', { class: 'g-check', id: 'g-check' }, CHECKS.map(([k, label]) => el('li', { 'data-k': k }, el('b', {}, label), el('span', {}, 'Looking…'))));
  const V = {};
  const row = (k, label, strong) => el('div', { class: 'g-row' }, strong ? el('b', {}, label) : el('span', {}, label), V[k] = el(strong ? 'b' : 'span', {}, '·'));
  V.pill = el('div', { class: 'g-pill idle', id: 'g-pill' }, el('i', { class: 'g-pdot' }), V.pillText = el('span', {}, 'Not sharing yet'));
  const steps = el('ol', { class: 'g-steps' }, ['Pick the MapleStory window', 'Grind, nothing to type', 'Open your inventory now and then for mesos'].map(t => el('li', {}, t)));
  V.health = el('div', { class: 'g-health', id: 'g-health' }, HEALTH.map(([k]) => el('span', { class: 'g-hc wait', 'data-k': k })));
  // the one thing to do, only when something needs you
  V.nudge = el('div', { class: 'g-nudge idle', id: 'g-nudge', hidden: '' }, 'Share the game window to start');
  // a big jump between peeks: a trade or a big buy isn't grinding, so it asks
  V.trade = el('div', { class: 'g-nudge wait', id: 'g-trade', hidden: '' }, V.tradeQ = el('span', {}), ' ',
    el('button', { type: 'button', id: 'g-tradeyes', onclick: () => answerJump(true) }, 'Leave it out'), ' ',
    el('button', { type: 'button', id: 'g-tradeno', onclick: () => answerJump(false) }, 'Keep it'));
  const card = el('div', { class: 'g-card', id: 'g-card' },
    el('div', { class: 'g-kpis' },
      el('div', {}, el('div', { class: 'g-lbl' }, 'EXP per hour'), V.expHr = el('div', { class: 'g-big', id: 'g-exphr' }, '·')),
      el('div', { id: 'g-mesokpi' }, el('div', { class: 'g-lbl' }, 'Mesos earned'), V.mesoBig = el('div', { class: 'g-big' }, '·'),
        V.mesoSub = el('div', { class: 'g-sub' }, 'Open your inventory now and then to start counting'))),
    V.sub = el('div', { class: 'g-sub' }, 'Share the game window to start'), V.pace = el('div', { class: 'g-sub', id: 'g-pace' }), V.next = el('div', { class: 'g-sub' }),
    V.verdict = el('div', { class: 'g-verdict', id: 'g-verdict', hidden: '' }), V.mesos = el('div', { class: 'g-sub', id: 'g-mesos' }, 'Mesos: open your inventory now and then to count them'),
    V.tradeBox = el('div', { class: 'g-tradebox', id: 'g-tradebox' }, el('button', { type: 'button', class: 'linkish', id: 'g-tradebtn', onclick: () => openTrade() }, 'Leave out a trade')),
    row('gain', 'EXP gained'), row('time', 'Time'), row('kpm', 'Kills a minute'), row('pots', 'Potions used'),
    row('costHr', 'Potions an hour', true), row('per1', 'Cost per 1%', true),
    el('div', { class: 'g-row' }, V.perPotL = el('span', {}, 'Potions per 1%'), V.perPot = el('span', {}, '·')),
    V.perPot2Row = el('div', { class: 'g-row', hidden: '' }, V.perPot2L = el('span', {}), V.perPot2 = el('span', {}, '·')), row('level', 'Level'));
  // the pop out over the game: one dark panel built here and moved into the pop out window, in one of four layouts that
  // ⇆ Layout flips (kept on the device, each at its own window size): Hero (the Lemon tile beside three big numbers, the
  // rest in one small line), Bar (one slim row), Column (stacked down the side) and Corner (two by two). A dot per check
  // (one that isn't green says its name), and the one thing to do on its own line, only when it needs you
  const SP = {};
  const LAYOUTS = { hero: [660, 236], bar: [800, 92], column: [250, 640], corner: [430, 330] }, ORDER = Object.keys(LAYOUTS);
  let layout = ORDER.includes(store.get(KEY_LAYOUT)) ? store.get(KEY_LAYOUT) : 'hero', pipWin = null, sizeTimer = null;
  const kTile = (k, label) => el('div', { class: 'g-k g-k-' + k }, el('div', { class: 'g-kl' }, label), SP[k] = el('div', { class: 'g-kn' }, '·'), SP[k + 'Sub'] = el('div', { class: 'g-ks' }));
  const strip = el('div', { class: 'g-strip', id: 'g-strip', 'data-layout': layout, hidden: '' },
    el('div', { class: 'g-grid' },
      SP.lemon = el('div', { class: 'g-lemon' }, SP.juice = el('div', { class: 'g-juice' }), SP.lIcon = el('img', { alt: '', hidden: '' }),
        SP.lClock = el('div', { class: 'g-lclock' }, '··:··'), SP.lCap = el('div', { class: 'g-lcap' }), SP.lLeft = el('div', { class: 'g-lleft' })),
      kTile('exp', 'EXP an hour'), kTile('meso', 'Mesos earned'), kTile('gain', 'EXP gained'),
      SP.mini = el('div', { class: 'g-mini' })),
    el('div', { class: 'g-foot' },
      SP.dots = el('span', { class: 'g-dots' }, ['exp', 'level', 'potions', 'mesos'].map(k => el('span', { class: 'g-dw', 'data-k': k }, el('i', { class: 'g-dot' }), el('small', {})))),
      el('button', { type: 'button', class: 'g-lay', title: 'Layout', onclick: () => nextLayout() }, '⇆', el('span', { class: 'g-bl' }, ' Layout')),
      el('button', { type: 'button', class: 'g-reset', title: 'Reset average', onclick: () => resetAverage() }, '↺', el('span', { class: 'g-bl' }, ' Reset average'))),
    SP.l3 = el('div', { class: 'g-l3', hidden: '' }));
  const viewBar = el('div', { class: 'g-viewing', hidden: '' }, V.viewing = el('span', {}), el('button', { type: 'button', onclick: () => { viewing = null; render(); } }, 'Back to live'),
    V.del = el('span', {}));
  // a saved session with bad numbers can go: Delete, then Yes (from the account, and from this device)
  const delButton = () => el('button', { type: 'button', id: 'g-del', onclick: () => V.del.replaceChildren('Delete this session for good? ',
    el('button', { type: 'button', id: 'g-delyes', onclick: () => deleteViewed() }, 'Yes, delete'), ' ', el('button', { type: 'button', onclick: () => V.del.replaceChildren(delButton()) }, 'No')) }, 'Delete');
  V.del.append(delButton());
  function deleteViewed() {
    const id = viewing && viewing.id;
    if (!id) return;
    const gone = () => { jset(KEY_LOCAL, jget(KEY_LOCAL, []).filter(r => r.id !== id)); viewing = null; V.del.replaceChildren(delButton()); render(); listSessions(); setStatus('Deleted that session.'); };
    (signedIn() ? api.deleteGrind(id) : Promise.resolve()).then(gone, e => setStatus("Couldn't delete it (" + e.message + ').'));
  }
  const pots = el('table', { class: 'b-table', id: 'g-pots' },
    el('thead', {}, el('tr', {}, ['Key', 'Potion', 'Left', 'Used', 'Price', 'Cost'].map((h, i) => el('th', i > 1 ? { class: 'n' } : {}, h)))), el('tbody', {}));
  const mapSel = el('select', { id: 'g-map', 'aria-label': 'Map', onchange: () => { mapId = +mapSel.value; store.set(KEY_MAP, String(mapId)); if (session) session.mapId = mapId; showMap(); render(); } },
    Object.keys(data.maps).sort((a, b) => mapName(a).localeCompare(mapName(b))).map(id => el('option', { value: id }, mapName(id))));
  mapSel.value = String(mapId);
  const mobs = el('ul', { class: 'g-mobs' }), mapNote = el('p', { class: 'g-note' });
  card.append(mapNote);   // it explains Kills a minute, a row on the card
  const sessions = el('div', { class: 'g-sess', id: 'g-sessions' });
  const chartA = el('div', { id: 'g-chart-a', class: 'g-chart' }), chartB = el('div', { id: 'g-chart-b', class: 'g-chart' }), heat = el('div', { id: 'g-heat', class: 'g-chart' });
  const tip = el('div', { id: 'g-tip', class: 'g-tip', hidden: '' });
  const table = el('table', { class: 'b-table', id: 'g-table', hidden: '' },
    el('thead', {}, el('tr', {}, ['Minute', 'Time', 'EXP', 'Potions', 'Party'].map((h, i) => el('th', i > 1 ? { class: 'n' } : {}, h)))), el('tbody', {}));
  const tableBtn = el('button', { type: 'button', id: 'g-showtable', class: 'linkish', onclick: () => { table.hidden = !table.hidden; tableBtn.textContent = table.hidden ? 'Show as table' : 'Hide the table'; render(); } }, 'Show as table');
  const partyCompare = el('p', { class: 'g-note', id: 'g-party-compare' });
  const charts = el('div', { class: 'g-charts', id: 'g-charts' },
    el('h3', {}, 'EXP every minute'), chartA,
    el('h3', {}, 'Potions every minute'), chartB,
    el('h3', {}, 'The whole session'), heat, tableBtn, el('div', { class: 'g-scroll' }, table), partyCompare, tip);
  charts.addEventListener('pointerover', e => showTip(e));
  charts.addEventListener('pointermove', e => showTip(e));
  charts.addEventListener('pointerleave', () => { tip.hidden = true; });
  // once everything is found, the checklist folds into one line; Details opens it again
  let checkOpen = false, namedCount = 0;
  const readyText = el('span', {});
  const ready = el('div', { class: 'g-ready', id: 'g-ready', hidden: '' }, readyText,
    el('button', { type: 'button', class: 'linkish', onclick: () => { checkOpen = !checkOpen; updateReady(); } }, 'Details'));
  function updateReady() {
    const all = NEEDED.every(k => check.querySelector('[data-k="' + k + '"]').classList.contains('done'));
    ready.hidden = !all; check.hidden = all && !checkOpen;
    readyText.textContent = '✓ Reading your game · Level ' + st.level + ' · ' + namedCount + ' potion' + (namedCount === 1 ? '' : 's') + ' · ' + (st.mesos != null ? fmt(st.mesos) + ' mesos' : st.mesoUnclear ? 'mesos unclear' : 'open your inventory for mesos');
  }
  // this session: one slim line, and its details (the card, the potions with their prices, the charts) folded away until
  // asked for (kept on the device); a saved session opened from the list always shows them
  V.now = el('div', { class: 'g-nowv' });
  let detailOpen = store.get(KEY_DETAIL) === '1';
  const moreBtn = el('button', { type: 'button', id: 'g-more', class: 'g-more', 'aria-controls': 'g-detail', onclick: () => { detailOpen = !detailOpen; store.set(KEY_DETAIL, detailOpen ? '1' : ''); showDetail(); } }, 'Session details');
  const detail = el('div', { class: 'g-detail', id: 'g-detail', hidden: '' }, viewBar,
    el('div', { class: 'g-dgrid' }, card, el('div', { class: 'g-dpots' }, el('h3', {}, 'Potions'), el('div', { class: 'g-scroll' }, pots),
      el('p', { class: 'g-note' }, 'Keep every potion you drink on a quickslot (the hotkey grid at the bottom right): a count going down is a potion drunk, a count jumping up is a refill. Each one is matched to the game\'s own potion picture. Prices start at 10 times what the NPC pays (a Lemon is 150); tap a price to set what you really paid, and refills you already made follow it.'))),
    charts);
  function showDetail() {
    const open = detailOpen || !!viewing;
    detail.hidden = !open;
    moreBtn.setAttribute('aria-expanded', String(open)); moreBtn.textContent = open ? 'Hide details' : 'Session details';
  }
  // all time: Lemons and Meat first (by the client's own pictures), then the totals, the maps, personal bests and the days
  const LEMON_IDS = Object.keys(data.potions).filter(id => data.potions[id][0] === 'Lemon').map(Number);
  const MEAT_IDS = Object.keys(data.potions).filter(id => data.potions[id][0] === 'Meat').map(Number);
  const picOf = ids => pictures.Icons[ids.find(id => pictures.Icons[id])];
  const LF = {};
  const trophy = (k, label, ids) => {
    const t = { pic: picOf(ids) };
    t.el = el('div', { class: 'g-trophy g-t-' + k }, t.pic ? el('img', { class: 'g-tico', src: t.pic, alt: '' }) : null,
      el('div', { class: 'g-tbody' }, el('div', { class: 'g-tl' }, label), t.n = el('div', { class: 'g-tn' }, '0'), t.sub = el('div', { class: 'g-ts' }), t.row = el('div', { class: 'g-trow' })));
    return t;
  };
  LF.lemon = trophy('lemon', 'Lemons eaten', LEMON_IDS); LF.meat = trophy('meat', 'Meat eaten', MEAT_IDS);
  const life = el('section', { class: 'g-life', id: 'g-life' },
    el('div', { class: 'g-lhead' }, el('h3', {}, 'All time'), LF.since = el('span', {})),
    el('div', { class: 'g-trophies' }, LF.lemon.el, LF.meat.el),
    LF.other = el('p', { class: 'g-note' }),
    LF.tots = el('div', { class: 'g-tots' }),
    el('div', { class: 'g-lgrid' },
      el('div', { class: 'g-lcard' }, el('h4', {}, 'Most trained maps'), LF.maps = el('div', { id: 'g-maps' })),
      el('div', { class: 'g-lcard' }, el('h4', {}, 'Personal bests'), LF.bests = el('div', { class: 'g-bests', id: 'g-bests' }))),
    el('div', { class: 'g-lgrid g-lgrid2' },
      el('div', { class: 'g-lcard' }, el('h4', {}, 'Days you grinded'), LF.days = el('div', { class: 'g-days', id: 'g-days' }), LF.daysNote = el('p', { class: 'g-note' })),
      el('div', { class: 'g-lcard' }, el('h4', {}, 'Your sessions'), sessions)));
  root.replaceChildren(
    el('h2', {}, 'Grind'),
    el('p', { class: 'g-lead' }, 'Share the game window and grind: your EXP, level and potions read themselves, nothing to type. Pop it out over the game for the live numbers; this page keeps your record.'),
    el('div', { class: 'g-page' },
      el('aside', { class: 'g-rail', id: 'g-rail' }, el('div', { class: 'g-railin' },
        el('div', { class: 'g-box g-acts' }, V.pill, shareArea, steps, popBtn, markBtn, refindBtn, newBtn, snapBtn),
        el('div', { class: 'g-box' }, el('div', { class: 'g-boxh' }, 'Reading'), V.health, ready, check),
        el('div', { class: 'g-box' }, el('div', { class: 'g-boxh' }, 'This map'), mapSel, mobs))),
      el('div', { class: 'g-main' }, status, V.nudge, V.trade, el('div', { class: 'g-now', id: 'g-now' }, V.now, moreBtn), detail, life)),
    el('p', { class: 'g-note' }, 'Item and UI pictures are from MapleStory, which belongs to Nexon.'), strip);

  const setStatus = msg => { status.textContent = msg; };
  function setCheck(k, state, text) {
    const li = check.querySelector('[data-k="' + k + '"]');
    li.className = state === 'done' ? 'done' : state === 'fix' ? 'fix' : '';
    li.lastChild.textContent = text;
  }

  /* ----- one frame from the share ----- */
  function frame(src, info) {
    if (!picturesReady) return;
    if (st.wantSnap) { st.wantSnap = false; saveFrame(src, info); }
    st.ticks++; st.sharing = true;
    const S = MS(), w = info.w, h = info.h;
    if (w !== st.fw || h !== st.fh) { st.fw = w; st.fh = h; st.line = null; S.mesoHome(null); st.homeTried = false; }   // the window changed size
    // the inventory's meso box: checked every tick where it last opened (a few ms, kept on this device for next time);
    // the whole frame is searched every third tick until it's been seen, then once a minute in case it moved (a search
    // takes a quarter second on a big window)
    if (!st.homeTried) { st.homeTried = true; const hm = jget(KEY_HOME, null); if (hm && hm.w === w && hm.h === h && hm.box && !S.mesoHome()) S.mesoHome(hm.box); }
    let mesos = null;
    const home = S.mesoHome(), search = st.ticks % (home ? MESO_SEARCH_EVERY : 3) === 1;
    if (home || search) {
      const mr = S.readMesos(src, { search });
      st.mesoOpen = mr.reason !== 'no inventory';
      st.mesoUnclear = !mr.ok && st.mesoOpen;
      if (mr.ok) {
        mesos = mr.value; st.mesos = mr.value; setCheck('mesos', 'done', fmt(mr.value) + ' at ' + timeOfDay(Date.now()));
        if (!home || Math.abs(home.x - mr.box.x) > 3 || Math.abs(home.y - mr.box.y) > 3) jset(KEY_HOME, { w, h, box: mr.box });
      }
      else if (st.mesoOpen) setCheck('mesos', 'fix', "Can't read your mesos clearly (a tooltip over them, or a digit it hasn't learned yet)");
      else if (st.mesos == null) setCheck('mesos', '', 'Open your inventory now and then');
    }
    if (mesos != null && session) GS().add(session, { t: Date.now(), mesos });
    if (!st.line) {
      st.line = S.findExpLine(src, w, h); st.m = null; st.measureAt = 0;
      if (!st.line) { mark('exp', false); setCheck('exp', 'fix', 'Make sure the bar at the bottom of the game is showing'); updateReady(); render(); return; }
    }
    const exp = S.readExp(src, st.line);
    mark('exp', exp.ok);
    if (exp.ok) { st.expMiss = 0; setCheck('exp', 'done', fmt(exp.exp) + ' [' + exp.pct.toFixed(2) + '%]'); }
    else {
      setCheck('exp', 'fix', "Can't read the EXP line right now");
      // 30 seconds of misses: look for it again next frame. The size was measured from the bar, so it goes too, and this
      // frame stops here (reading the quickslots without a bar threw, which stopped the share)
      if (++st.expMiss >= 20) { st.line = null; st.m = null; st.expMiss = 0; updateReady(); render(); return; }
    }
    // the level box not where it was on two reads running (every 30 seconds, a few milliseconds each): UI Size in the
    // game's options changed the HUD without changing the window, and reading at the old size invents counts, so measure
    // again (here, before anything below reads with the old measurement)
    if (st.m && st.levelMiss >= 2) { st.m = null; st.levelMiss = 0; }
    if (!st.m && st.ticks >= st.measureAt) {
      const m = S.measure(src, st.line, h);
      mark('size', m.score >= 0.8);
      if (m.score >= 0.8) {
        // measured again (the HUD changed size, or the game was found again): every slot starts over from what it shows
        // and its potion is named again, so the switch isn't read as potions drunk
        if (st.measured && session) { GS().rebase(session); setStatus('Measured your game again. Potion counts carry on from here, nothing was counted for the switch.'); }
        st.measured = true; st.slots = {};
        st.m = m; st.levelAt = st.ticks; st.levelMiss = 0; setCheck('size', 'done', 'Stretched ' + m.s.toFixed(2) + ' times');
      }
      else { st.measureAt = st.ticks + 10; setCheck('size', 'fix', "Couldn't measure the game size (best match " + m.score.toFixed(2) + ' on a ' + w + '×' + h + ' share)'); }
    }
    const reading = { t: Date.now(), exp: exp.ok ? exp.exp : null, pct: exp.ok ? exp.pct : null, level: null, counts: [], party: null };
    if (st.m) {
      if (st.ticks >= st.levelAt) {
        st.levelAt = st.ticks + LEVEL_EVERY;
        const lv = S.readLevel(src, st.line, st.m);
        mark('level', lv.ok);
        if (lv.ok) { st.levelMiss = 0; st.level = lv.level; reading.level = lv.level; setCheck('level', 'done', 'Level ' + lv.level); }
        else { st.levelMiss = (st.levelMiss || 0) + 1; if (!st.level) setCheck('level', 'fix', "Can't read your level yet"); }
      }
      mark('counts', st.m.countScore >= 0.8);
      if (st.m.countScore < 0.8) setCheck('potions', 'fix', "Can't read the quickslot numbers at this share size (match " + st.m.countScore.toFixed(2) + ')');
      else {
        let nth = 0;
        for (const c of S.readCounts(src, st.line, st.m)) {
          let known = st.slots[c.key];
          nth++;
          // which potion: once per slot, then now and then in case it was swapped (spread over ticks, ~35 ms each)
          if (!known || st.ticks >= known.at) {
            const ic = S.readIcon(src, c, st.m);
            known = st.slots[c.key] = { id: ic.diff < 75 && data.potions[ic.id] ? +ic.id : null, at: st.ticks + ICON_EVERY + nth * 3 };
          }
          const pot = known.id ? data.potions[known.id] : null;
          reading.counts.push({ key: c.key, id: known.id, name: pot ? pot[0] : 'Unknown item', price: known.id && prices[known.id] != null ? prices[known.id] : (pot ? pot[1] : 0), value: c.value });
        }
        const named = reading.counts.filter(c => c.id);
        namedCount = named.length; st.potNone = !named.length; st.potCount = named.length;
        if (named.length) setCheck('potions', 'done', named.length + ' potion' + (named.length > 1 ? 's' : '') + ': ' + named.map(c => c.name).join(', '));
        else setCheck('potions', '', 'No potions in your quickslots yet');
      }
    }
    if (reading.exp != null || reading.counts.length) {
      if (!session) session = GS().create({ mapId, t: reading.t, prices });
      GS().add(session, reading); st.reads++;
    }
    updateReady();
    render(); save(false);
  }

  function saveFrame(src, info) {
    const c = document.createElement('canvas'); c.width = info.w; c.height = info.h; c.getContext('2d').drawImage(src, 0, 0);
    c.toBlob(b => {
      const a = document.createElement('a'); a.href = URL.createObjectURL(b);
      a.download = 'grind-frame-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.png'; a.click();
      setStatus('Saved a frame to your Downloads. Send it over if something reads wrong.');
    }, 'image/png');
  }

  /* ----- saving ----- */
  const signedIn = () => !!(deps.session && deps.session());
  const keepLocal = r => jset(KEY_LOCAL, [r].concat(jget(KEY_LOCAL, []).filter(x => x.id !== r.id)).slice(0, LOCAL_MAX)
    .map((x, i) => i < LOCAL_MINUTES || !x.minutes ? x : Object.assign({}, x, { minutes: undefined })));
  function save(force) {
    if (!session) return Promise.resolve();
    const now = Date.now();
    if (!force && now - st.lastSave < SAVE_MS) return Promise.resolve();
    st.lastSave = now;
    jset(KEY_OPEN, session);
    const row = GS().toRow(session);
    if (!signedIn()) {
      keepLocal(row);
      listSessions();
      return Promise.resolve();
    }
    // a row the account didn't take is kept on the device too, so starting a new session can't lose it
    return api.saveGrind(row).then(() => { jset(KEY_LOCAL, jget(KEY_LOCAL, []).filter(x => x.id !== row.id)); listSessions(); },
      e => { keepLocal(row); listSessions(); setStatus('Saved on this device only, your account didn\'t take it (' + e.message + '). It tries again in a minute.'); });
  }
  // the quick reset: forget where the game was (bars, size, which potion sits on each key, the inventory) and look again;
  // the session and every number in it stay
  function refind() {
    Object.assign(st, { line: null, m: null, measureAt: 0, levelAt: 0, expMiss: 0, slots: {}, mesoOpen: false, homeTried: true, h: fresh() });
    MS().mesoHome(null); store.set(KEY_HOME, '');
    setStatus('Looking for your game again. Your session and its numbers are kept.');
    render();
  }
  function resetAverage() {
    if (!session) { setStatus('Start grinding first, then reset the average.'); return; }
    const now = Date.now();
    GS().mark(session, now);
    setStatus('New average from ' + timeOfDay(now) + '. The session average keeps going.');
    render();
  }
  // the jump question: Leave it out (a trade) or Keep it (grinding, or selling to the shop)
  function answerJump(isTrade) {
    const j = session && session.meso && session.meso.jump;
    if (!j) return;
    if (isTrade) { GS().trade(session, j.amount, Date.now()); setStatus('Left out ' + signed(j.amount) + '. Mesos earned is just your grinding now.'); }
    else { GS().keepMesos(session); setStatus('Kept ' + signed(j.amount) + ' in mesos earned.'); }
    render();
  }
  // Leave out a trade by hand: which way and how much (165k, 1.5m); the boxes only exist while it's open
  function openTrade() {
    if (!session) { setStatus('Start grinding first, then leave out a trade.'); return; }
    const dir = el('select', { id: 'g-tradedir', 'aria-label': 'Which way' }, el('option', { value: 'paid' }, 'I paid'), el('option', { value: 'got' }, 'I was paid'));
    const amt = el('input', { id: 'g-tradeamt', type: 'text', inputmode: 'decimal', placeholder: '165k', 'aria-label': 'How much' });
    const close = () => V.tradeBox.replaceChildren(el('button', { type: 'button', class: 'linkish', id: 'g-tradebtn', onclick: () => openTrade() }, 'Leave out a trade'));
    const go = () => {
      const v = parseMesos(amt.value);
      if (!(v > 0)) { setStatus('Type how much, like 165k or 1.5m.'); amt.focus(); return; }
      const amount = dir.value === 'paid' ? -Math.round(v) : Math.round(v);
      GS().trade(session, amount, Date.now());
      setStatus('Left out a trade of ' + signed(amount) + '. Mesos earned is just your grinding now.');
      close(); render();
    };
    amt.addEventListener('keydown', e => { if (e.key === 'Enter') go(); if (e.key === 'Escape') close(); });
    V.tradeBox.replaceChildren(dir, amt, el('button', { type: 'button', id: 'g-tradego', onclick: go }, 'Leave it out'),
      el('button', { type: 'button', class: 'linkish', onclick: close }, 'Cancel'));
    amt.focus();
  }
  function newSession() {
    save(true).then(() => { session = null; viewing = null; store.set(KEY_OPEN, ''); render(); setStatus('New session. It starts with your next EXP.'); });
  }

  /* ----- the share ----- */
  const capture = window.Reader.capture(shareArea, { el, prefix: 'g-', raw: true, limit: 0, keepWhenHidden: true, full: true, drop: false, every: 1500,
    copy: { share: 'Share game window', stop: 'Stop sharing' },
    onImage: frame, say: setStatus,
    onState: (state, why) => {
      st.sharing = state === 'sharing'; render();
      if (state === 'sharing') { setStatus('Watching. Pick the Window tab and MapleStory if you haven\'t.'); return; }
      setStatus(why === 'denied' ? 'Sharing was turned down. Press Share game window to try again.' : 'Stopped. This session is kept, share again to carry on.');
      save(true);
    } });
  // before sharing, Share game window is the one to press; Stop sits at the bottom of the buttons
  for (const b of shareArea.querySelectorAll('button')) b.classList.add('g-btn');
  const shareBtn = shareArea.querySelector('#g-share');
  if (shareBtn) shareBtn.classList.add('go');

  /* ----- drawing ----- */
  function render() {
    const s = viewing || session;
    viewBar.hidden = !viewing;
    if (viewing) V.viewing.textContent = 'Looking at ' + mapName(viewing.mapId) + ', ' + dateOf(viewing.t0);
    if (!editing) renderPots(s);
    renderHealth();
    showDetail();
    // while sharing, Pop out is the one to press, and the three steps under Share game window go
    popBtn.classList.toggle('go', st.sharing); steps.hidden = st.sharing;
    charts.hidden = !s;
    if (!s) { renderNow(null); fitStrip(); return; }
    const t = viewing ? s.tLast : Date.now(), o = GS().stats(s, t, avgExp(s.mapId || mapId));
    V.expHr.textContent = o.expHr != null ? fmtK(o.expHr) : '·';
    V.sub.textContent = o.expMin != null ? fmt(o.expMin) + ' a minute · ' + o.pctHr.toFixed(2) + '% an hour' : 'Needs 2 minutes of EXP first';
    V.pace.hidden = !!viewing;
    V.pace.textContent = paceParts(o, true).map(p => p.label + ' ' + p.value + (p.vs ? ' ' + p.vs : '') + (p.extra ? ' · ' + p.extra : '')).join(' · ');
    V.next.textContent = o.hrsToLevel != null ? 'Level ' + ((s.level || 0) + 1) + ' at ' + timeOfDay(t + o.hrsToLevel * 3600000) + ', in ' + fmtDur(o.hrsToLevel * 60) : '';
    V.gain.textContent = fmt(o.exp) + ' · ' + o.pct.toFixed(2) + '%' + (o.deaths ? ' · ' + deathText(o) : '');
    // the clock runs only while the EXP bar is read; time left out for a pause says so, to square with a stopwatch
    V.time.textContent = fmtDur(o.mins) + (o.pausedMins >= 1 ? ' · ' + fmtDur(o.pausedMins) + ' paused, not counted' : '');
    V.kpm.textContent = o.kpm != null ? 'about ' + o.kpm.toFixed(1) : '·';
    V.pots.textContent = o.potUsed ? fmt(o.potUsed) + ' · ' + fmtK(o.potCost) : '·';
    V.costHr.textContent = o.costHr != null ? fmtK(o.costHr) : '·';
    V.per1.textContent = o.per1 != null ? fmtK(o.per1) : '·';
    V.level.textContent = s.level ? s.level + (s.last ? ' · ' + s.last.pct.toFixed(2) + '%' : '') : '·';
    const mains = mainPotions(s, o), main = mains[0] || null, second = mains[1] || null;
    V.perPotL.textContent = (main ? plural(main.name) : 'Potions') + ' per 1%';
    V.perPot.textContent = main && o.perPct[main.id] != null ? perFmt(o.perPct[main.id]) : '·';
    V.perPot2Row.hidden = !second;
    if (second) { V.perPot2L.textContent = plural(second.name) + ' per 1%'; V.perPot2.textContent = o.perPct[second.id] != null ? perFmt(o.perPct[second.id]) : '·'; }
    renderMesos(s, o);
    renderNow(s, o, mains);
    // all time follows the running session, so its Lemons never trail this session's line by a minute of saves
    if (!viewing && Date.now() - lifeAt > 5000) renderLife();
    renderStrip(s, o, mains);
    fitStrip();
    renderCharts(s, t, o);
  }
  // the pace: EXP an hour over the last 5 and 10 minutes and since Reset average, each against the session's average
  // (differences under 2% get no arrow); long labels for the card, short for the strip
  function paceParts(o, long) {
    const vs = r => {
      if (!r || !o.expHr) return null;
      const d = r.expHr / o.expHr - 1;
      return Math.abs(d) < 0.02 ? null : { up: d > 0, text: (d > 0 ? '▲' : '▼') + Math.round(Math.abs(d) * 100) + '%' };
    };
    const part = (label, r) => { const v = vs(r); return { label, value: r ? fmtK(r.expHr) : '·', vs: v && v.text, up: v && v.up }; };
    const parts = [part(long ? 'Last 5 min' : '5m', o.pace && o.pace[5]), part(long ? 'last 10 min' : '10m', o.pace && o.pace[10])];
    if (o.markT) {
      const p = part('since ' + timeOfDay(o.markT), o.since);
      if (o.since && o.since.per1 != null) p.extra = '1% costs ' + fmtK(o.since.per1);
      parts.push(p);
    }
    return parts;
  }
  // the two potions that matter most (Lemons for MP and Meat for HP): live, the ones whose clocks run out first; then, or
  // on a saved session, the ones drunk most for each 1%
  function mainPotions(s, o) {
    const ids = viewing ? [] : GS().countdowns(s, Date.now()).map(c => String(c.id));
    for (const id of Object.keys(o.perPct).sort((a, b) => o.perPct[b] - o.perPct[a])) if (!ids.includes(id)) ids.push(id);
    return ids.slice(0, 2).map(id => {
      const sl = Object.values(s.slots).concat(s.retired || []).find(x => String(x.id) === id);
      return { id, name: sl ? sl.name : data.potions[id] ? data.potions[id][0] : 'Potion' };
    });
  }

  /* ----- is it reading everything: the pill and checks down the left, the one thing to do, and the strip's dots ----- */
  function renderHealth() {
    const s = session;
    const h = lastHealth = health({ t: Date.now(), sharing: st.sharing, hasSession: !!s, exp: st.h.exp, level: st.h.level, levelNow: st.level,
      size: st.h.size, counts: st.h.counts, potNone: st.potNone, potCount: st.potCount,
      meso: { at: s && s.meso && s.meso.last ? s.meso.last.t : null, unclear: !!(st.mesoOpen && st.mesoUnclear) } });
    // the pill over the buttons goes by what the core numbers need (mesos only ever ask)
    const core = ['exp', 'level', 'potions'].map(k => h.checks[k].state);
    const ps = !st.sharing ? 'idle' : core.includes('bad') ? 'bad' : core.every(x => x === 'ok') ? 'ok' : 'wait';
    V.pill.className = 'g-pill ' + ps;
    // the chips only mean something once the game is shared; before that the pill says so
    V.health.hidden = !st.sharing;
    V.pillText.textContent = ps === 'idle' ? (s ? 'Share stopped' : 'Not sharing yet') : ps === 'bad' ? "Can't read your game" : ps === 'ok' ? 'Reading · Lv ' + (st.level || '·') : 'Looking for your game…';
    // the one thing to do, only when there is one (a saved session being looked at isn't live)
    V.nudge.hidden = !!viewing || h.nudge.state === 'ok' || (h.nudge.state === 'idle' && !s);
    for (const [k, label] of HEALTH) {
      const c = h.checks[k], e = V.health.querySelector('[data-k="' + k + '"]');
      e.className = 'g-hc ' + c.state; e.textContent = SIGN[c.state] + ' ' + label + ' ' + c.text;
    }
    V.nudge.className = 'g-nudge ' + h.nudge.state; V.nudge.textContent = SIGN[h.nudge.state] + ' ' + h.nudge.text;
    refindBtn.classList.toggle('hi', h.stuck);
    for (const w of SP.dots.children) {
      const c = h.checks[w.dataset.k], name = HEALTH.find(x => x[0] === w.dataset.k)[1];
      w.className = 'g-dw ' + c.state; w.title = name + ': ' + c.text;
      w.lastChild.textContent = c.state === 'ok' ? '' : name;
    }
    // line 3: the one thing to do, live only; a mesos jump to answer comes before anything amber
    const jump = s && s.meso && s.meso.jump;
    if (jump && !viewing && h.nudge.state !== 'bad') {
      SP.l3.hidden = false; SP.l3.className = 'g-l3 wait';
      SP.l3.replaceChildren('! Mesos changed by ' + signed(jump.amount) + '. A trade?',
        el('button', { type: 'button', onclick: () => answerJump(true) }, 'Leave it out'), el('button', { type: 'button', class: 'g-keep', onclick: () => answerJump(false) }, 'Keep it'));
      return;
    }
    SP.l3.hidden = !!viewing || h.nudge.state === 'ok';
    SP.l3.className = 'g-l3 ' + h.nudge.state;
    SP.l3.replaceChildren(SIGN[h.nudge.state] + ' ' + h.nudge.text, h.stuck ? el('button', { type: 'button', onclick: () => refind() }, '↻ Find my game again') : '');
  }

  /* ----- the pop out panel: the Lemon tile, three big numbers, one small line, the dots ----- */
  function renderStrip(s, o, mains) {
    const now = Date.now(), cds = viewing ? [] : GS().countdowns(s, now);
    SP.ticks = cds.slice(0, 2);   // the two potions running out first (Lemons, then Meat)
    SP.mainIcon = mains[0] ? pictures.Icons[mains[0].id] : null;
    renderLemon(now);
    SP.exp.textContent = o.expHr != null ? fmtK(o.expHr) : '·';
    SP.expSub.textContent = o.pctHr != null ? o.pctHr.toFixed(2) + '% an hour' : 'after 2 minutes';
    SP.meso.textContent = o.mesosEarned != null ? (o.mesosEarned >= 0 ? '+' : '−') + fmtK(Math.abs(o.mesosEarned)) : '·';
    SP.mesoSub.textContent = o.mesosHr != null ? fmtK(o.mesosHr) + ' an hour' : o.mesosEarned != null ? 'this session' : o.mesoLooks ? 'peek again later' : 'no peek yet';
    SP.gain.textContent = fmtK(o.exp);
    SP.gainSub.textContent = (o.pct >= 0 ? '+' : '−') + Math.abs(o.pct).toFixed(2) + '% · ' + fmtDur(o.mins) + (o.deaths ? ' · ' + deathText(o) : '');
    // the small line: the second clock (Meat), the next level, Lemons per 1%, what 1% costs, the pace and profit
    const bits = [], c2 = SP.ticks[1], main = mains[0], icon = (id, name) => pictures.Icons[id] ? el('img', { src: pictures.Icons[id], alt: name }) : name + ' ';
    if (c2) bits.push(el('span', { class: 'g-c2' }, icon(c2.id, c2.name), el('b', {}, clock((c2.doneAt - now) / 1000))));
    if (o.hrsToLevel != null) bits.push(el('span', { class: 'g-eta' }, 'Lv ' + ((s.level || 0) + 1) + ' in ', el('b', {}, fmtDur(o.hrsToLevel * 60))));
    if (main && o.perPct[main.id] != null) bits.push(el('span', {}, icon(main.id, main.name), el('b', {}, perFmt(o.perPct[main.id])), ' per 1%'));
    if (o.per1 != null) bits.push(el('span', {}, '1% costs ', el('b', {}, fmtK(o.per1))));
    const pace = viewing ? null : paceParts(o, false)[o.markT ? 2 : 0];
    if (pace && pace.value !== '·') bits.push(el('span', {}, pace.label + ' ', el('b', {}, pace.value), pace.vs ? el('span', { class: pace.up ? 'up' : 'down' }, ' ' + pace.vs) : ''));
    if (o.profitHr != null) bits.push(el('span', { class: o.profitHr >= 0 ? 'up' : 'down' }, 'profit ', el('b', {}, (o.profitHr >= 0 ? '+' : '−') + fmtK(Math.abs(o.profitHr))), '/hr'));
    SP.mini.replaceChildren(...bits);
    SP.mini.hidden = !bits.length;
  }
  // the Lemon tile, every frame and every second between: the potion running out first as a glass that drains
  function renderLemon(now) {
    const c = (SP.ticks || [])[0], x = lemonTile(c, now), icon = c ? pictures.Icons[c.id] : SP.mainIcon;
    SP.lemon.classList.toggle('low', x.low);
    SP.juice.style.height = x.juice + '%';
    if (icon && SP.lIcon.getAttribute('src') !== icon) SP.lIcon.src = icon;
    SP.lIcon.hidden = !icon; SP.lIcon.alt = c ? c.name : '';
    SP.lClock.textContent = x.clock; SP.lCap.textContent = viewing ? 'a saved session' : x.cap; SP.lLeft.textContent = x.left;
  }
  // ⇆ Layout: the next layout, at its own window size (a click lets the pop out resize itself; the frame around the page
  // is added on), kept for next time
  function nextLayout() {
    layout = ORDER[(ORDER.indexOf(layout) + 1) % ORDER.length];
    strip.dataset.layout = layout; store.set(KEY_LAYOUT, layout);
    if (pipWin) {
      const [w, h] = layoutSize(layout), fw = Math.max(0, Math.min(40, pipWin.outerWidth - pipWin.innerWidth)), fh = Math.max(0, Math.min(80, pipWin.outerHeight - pipWin.innerHeight));
      try { pipWin.resizeTo(w + fw, h + fh); } catch (e) { /* this browser won't: it can be dragged to size */ }
    }
    fitStrip();
  }
  // each layout's window size: where it was last dragged to, or its own
  function layoutSize(l) {
    const s = jget(KEY_SIZES, {})[l];
    return s && s[0] >= 120 && s[1] >= 50 ? s : LAYOUTS[l];
  }
  // the panel fits its pop out window: as big as its natural size (each tile's text on one line) allows across and
  // down; the one thing to do may wrap, so the height is checked again at the new size
  function fitStrip() {
    const w = strip.ownerDocument.defaultView;
    if (strip.hidden || !w || w === window) return;
    strip.style.fontSize = '16px'; strip.style.width = 'max-content'; SP.l3.style.display = 'none';
    const nat = strip.getBoundingClientRect();
    strip.style.width = ''; SP.l3.style.display = '';
    let f = Math.max(8, Math.min(48, 16 * Math.min(w.innerWidth / nat.width, w.innerHeight / nat.height)));
    strip.style.fontSize = f + 'px';
    const tall = strip.scrollHeight;
    if (tall > w.innerHeight) strip.style.fontSize = Math.max(8, f * w.innerHeight / tall) + 'px';
  }

  /* ----- charts: A EXP every minute, B potions every minute, D the minute heatmap ----- */
  const NS = 'http://www.w3.org/2000/svg', W = 640, X0 = 44, X1 = 632;
  function svg(tag, attrs, ...kids) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
    for (const k of kids.flat()) if (k != null) e.append(k);
    return e;
  }
  // a bar with rounded top corners, anchored on the baseline
  function barPath(x, y, w, h) {
    const r = Math.min(4, w / 2, h);
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }
  const niceTop = v => { const step = v > 2000 ? 1000 : v > 400 ? 200 : 20; return Math.max(step, Math.ceil(v * 1.1 / step) * step); };
  // potions in the order they were drunk most, the first three get colours (orange, aqua, yellow), the rest fold into Other
  function potionSeries(s) {
    const tot = {};
    for (const m of s.minutes) for (const [id, n] of Object.entries(m.used || {})) tot[id] = (tot[id] || 0) + n;
    const ids = Object.keys(tot).filter(id => tot[id] > 0).sort((a, b) => tot[b] - tot[a]);
    const nameOf = id => { const sl = Object.values(s.slots).find(x => String(x.id) === id); return sl ? sl.name : (data.potions[id] ? data.potions[id][0] : 'Item ' + id); };
    const series = ids.slice(0, 3).map((id, i) => ({ ids: [id], name: nameOf(id), color: 'var(--g-p' + (i + 1) + ')' }));
    if (ids.length > 3) series.push({ ids: ids.slice(3), name: 'Other', color: 'var(--g-other)' });
    return series;
  }
  const usedIn = (m, ids) => ids.reduce((a, id) => a + ((m.used || {})[id] || 0), 0);
  function axis(g, H, top, y) {
    for (const v of [0, top / 2, top]) {
      g.append(svg('line', { x1: X0, x2: X1, y1: y(v), y2: y(v), class: 'g-grid' }));
      g.append(svg('text', { x: X0 - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'g-axis' }, fmtK(v)));
    }
  }
  function xLabels(g, H, n, bw) {
    const step = n > 120 ? 60 : n > 40 ? 20 : 10;
    for (let m = 0; m <= n; m += step) g.append(svg('text', { x: X0 + m * bw, y: H - 4, 'text-anchor': 'middle', class: 'g-axis' }, m < 60 ? m + 'm' : Math.floor(m / 60) + 'h' + (m % 60 ? m % 60 : '')));
  }
  function renderCharts(s, t, o) {
    const ms = s.minutes, n = Math.max(ms.length, 10), bw = (X1 - X0) / n;
    // A
    const HA = 180, maxA = Math.max(1, ...ms.map(m => m.exp)), topA = niceTop(maxA), yA = v => 16 + (1 - v / topA) * (HA - 38);
    const a = svg('svg', { viewBox: `0 0 ${W} ${HA}`, role: 'img', 'aria-label': 'EXP every minute' });
    axis(a, HA, topA, yA);
    for (let i = 0; i < ms.length; i++) {   // party bands
      if (!(ms[i].party >= 2) || (i && ms[i - 1].party === ms[i].party)) continue;
      let j = i; while (j + 1 < ms.length && ms[j + 1].party === ms[i].party) j++;
      const x = X0 + i * bw, w = (j - i + 1) * bw;
      a.append(svg('rect', { x, y: 6, width: w, height: HA - 26, class: 'g-band' }));
      a.append(svg('text', { x: x + 6, y: 18, class: 'g-axis' }, w > 150 ? 'party of ' + ms[i].party + ' from ' + timeOfDay(s.t0 + i * 60000) : 'party of ' + ms[i].party));
    }
    for (const m of ms) if (m.exp > 0) a.append(svg('path', { d: barPath(X0 + m.m * bw + 1, yA(m.exp), Math.max(1, bw - 2), yA(0) - yA(m.exp)), class: 'g-bar' }));
    const avg = o.expMin != null ? o.expMin : ms.reduce((x, m) => x + m.exp, 0) / Math.max(1, ms.filter(m => m.exp > 0).length);
    a.append(svg('line', { x1: X0, x2: X1, y1: yA(avg), y2: yA(avg), class: 'g-avg' }));
    a.append(svg('text', { x: X1, y: yA(avg) - 5, 'text-anchor': 'end', class: 'g-avgl' }, 'session average ' + fmt(avg)));
    // a red mark over any minute with a death in it
    for (const m of ms) if (m.died) a.append(svg('text', { x: X0 + (m.m + 0.5) * bw, y: 14, 'text-anchor': 'middle', class: 'g-died' }, '✕'));
    // where Reset average was pressed
    if (s.mark && !viewing) {
      const x = X0 + (s.mark.t - s.t0) / 60000 * bw;
      a.append(svg('line', { x1: x, x2: x, y1: 6, y2: HA - 20, class: 'g-markl' }), svg('text', { x: x + 4, y: 30, class: 'g-axis' }, 'reset ' + timeOfDay(s.mark.t)));
    }
    xLabels(a, HA, n, bw);
    for (const m of ms) a.append(svg('rect', { x: X0 + m.m * bw, y: 0, width: bw, height: HA - 20, class: 'g-hit', 'data-m': m.m }));
    chartA.replaceChildren(a);
    // B
    const series = potionSeries(s), HB = 120;
    const maxB = Math.max(1, ...ms.map(m => series.reduce((x, se) => x + usedIn(m, se.ids), 0))), topB = Math.max(4, Math.ceil(maxB * 1.2 / 2) * 2), yB = v => 8 + (1 - v / topB) * (HB - 28);
    const b = svg('svg', { viewBox: `0 0 ${W} ${HB}`, role: 'img', 'aria-label': 'Potions every minute' });
    for (const v of [0, topB / 2, topB]) { b.append(svg('line', { x1: X0, x2: X1, y1: yB(v), y2: yB(v), class: 'g-grid' })); b.append(svg('text', { x: X0 - 6, y: yB(v) + 4, 'text-anchor': 'end', class: 'g-axis' }, String(v))); }
    for (const m of ms) {
      let base = 0;
      series.forEach((se, i) => {
        const v = usedIn(m, se.ids); if (!v) return;
        const y0 = yB(base + v), h = yB(base) - y0 - (base ? 2 : 0);   // a 2px gap between stacked parts
        b.append(i === series.length - 1 || !series.slice(i + 1).some(x => usedIn(m, x.ids))
          ? svg('path', { d: barPath(X0 + m.m * bw + 1, y0, Math.max(1, bw - 2), Math.max(1, h)), style: 'fill:' + se.color })
          : svg('rect', { x: X0 + m.m * bw + 1, y: y0, width: Math.max(1, bw - 2), height: Math.max(1, h), style: 'fill:' + se.color }));
        base += v;
      });
    }
    xLabels(b, HB, n, bw);
    for (const m of ms) b.append(svg('rect', { x: X0 + m.m * bw, y: 0, width: bw, height: HB - 20, class: 'g-hit', 'data-m': m.m }));
    const legend = series.length >= 2 ? el('div', { class: 'g-legend' }, series.map(se => el('span', {}, el('i', { style: 'background:' + se.color }), se.name))) : null;
    chartB.replaceChildren(b, legend || el('p', { class: 'g-note' }, series.length ? series[0].name : 'No potions drunk yet.'));
    // D
    const CELL = 22, GAP = 3, rows = Math.max(1, Math.ceil(ms.length / 10)), maxD = Math.max(1, ...ms.map(m => m.exp));
    const d = svg('svg', { viewBox: `0 0 ${76 + 10 * (CELL + GAP)} ${rows * (CELL + GAP) + 4}`, role: 'img', 'aria-label': 'EXP by minute', style: 'max-width:340px' });
    for (let r = 0; r < rows; r++) d.append(svg('text', { x: 0, y: r * (CELL + GAP) + 15, class: 'g-axis' }, (r * 10) + '–' + (r * 10 + 9) + 'm'));
    for (const m of ms) {
      const idle = !(m.exp > 0), k = idle ? 0 : Math.min(5, Math.floor(m.exp / maxD * 5.999));
      d.append(svg('rect', { x: 70 + (m.m % 10) * (CELL + GAP), y: Math.floor(m.m / 10) * (CELL + GAP), width: CELL, height: CELL, rx: 4,
        style: 'fill:' + (idle ? 'var(--line)' : 'var(--g-h' + k + ')'), 'data-m': m.m, 'data-idle': idle ? '1' : '0' }));
    }
    heat.replaceChildren(d, el('p', { class: 'g-note' }, 'Ten minutes to a row. A stronger blue is more EXP that minute, grey is idle.'));
    // the table view, and solo against party on this map
    if (!table.hidden) table.tBodies[0].replaceChildren(...ms.map(m => el('tr', {}, el('td', {}, String(m.m + 1)), el('td', {}, timeOfDay(s.t0 + m.m * 60000)),
      el('td', { class: 'n' }, fmt(m.exp)), el('td', { class: 'n' }, String(usedIn(m, Object.keys(m.used || {})))), el('td', { class: 'n' }, m.party ? (m.party === 1 ? 'solo' : String(m.party)) : '·'))));
    partyCompare.textContent = compareParty(s);
  }
  // average EXP a minute solo against partied on this map, from this session and the sessions kept on this device
  function compareParty(s) {
    const map = s.mapId || mapId, pools = { 1: [], more: {} };
    const minutesOf = [s.minutes].concat(jget(KEY_LOCAL, []).filter(r => r.map_id === map && r.id !== s.id && r.minutes).map(r => GS().fromRow(r).minutes));
    for (const list of minutesOf) for (const m of list) {
      if (!(m.exp > 0) || !m.party) continue;
      if (m.party === 1) pools[1].push(m.exp); else (pools.more[m.party] = pools.more[m.party] || []).push(m.exp);
    }
    const avgOf = xs => fmt(xs.reduce((a, x) => a + x, 0) / xs.length);
    const parts = [];
    if (pools[1].length) parts.push('solo ' + avgOf(pools[1]) + ' a minute');
    for (const [k, xs] of Object.entries(pools.more)) parts.push('party of ' + k + ' ' + avgOf(xs) + ' a minute');
    if (!parts.length) return '';
    const total = pools[1].length + Object.values(pools.more).reduce((a, x) => a + x.length, 0);
    return 'On ' + mapName(map) + ': ' + parts.join(', ') + ' (from ' + total + ' minutes)' + (parts.length === 1 ? '. Grind the other way too to compare.' : '.');
  }
  function showTip(e) {
    const hit = e.target.closest && e.target.closest('[data-m]'), s = viewing || session;
    if (!hit || !s) { tip.hidden = true; return; }
    const m = s.minutes[+hit.getAttribute('data-m')]; if (!m) return;
    const drank = Object.entries(m.used || {}).filter(([, n]) => n > 0).map(([id, n]) => n + ' ' + (n === 1 ? (data.potions[id] || ['item'])[0] : plural((data.potions[id] || ['item'])[0])));
    tip.textContent = 'Minute ' + (m.m + 1) + ' · ' + timeOfDay(s.t0 + m.m * 60000) + ' · ' + fmt(m.exp) + ' EXP' + (drank.length ? ' · ' + drank.join(', ') : '') + (m.party ? ' · ' + (m.party === 1 ? 'solo' : 'party of ' + m.party) : '');
    const box = charts.getBoundingClientRect();
    tip.style.left = Math.min(box.width - 220, Math.max(0, e.clientX - box.left + 12)) + 'px';
    tip.style.top = (e.clientY - box.top + 14) + 'px';
    tip.hidden = false;
  }

  /* ----- the pop out over the game: the slim strip moves into a small window that stays on top; the card stays here ----- */
  function popOut() {
    if (!window.documentPictureInPicture) { setStatus("Your browser can't pop out a window. Use Edge or Chrome on a computer."); return; }
    const [w0, h0] = layoutSize(layout);
    documentPictureInPicture.requestWindow({ width: w0, height: h0 }).then(pip => {
      pipWin = pip;
      const d = pip.document;
      for (const ss of document.styleSheets) {
        try { const s = d.createElement('style'); s.textContent = Array.from(ss.cssRules).map(r => r.cssText).join('\n'); d.head.append(s); } catch (e) { /* a stylesheet from another site */ }
      }
      if (document.documentElement.dataset.theme) d.documentElement.dataset.theme = document.documentElement.dataset.theme;
      d.title = 'Grind';
      d.body.className = 'g-pip';
      strip.hidden = false;
      const wrap = d.createElement('div'); wrap.id = 'view-grind'; wrap.append(strip); d.body.append(wrap);
      pip.addEventListener('pagehide', () => { pipWin = null; strip.hidden = true; strip.style.fontSize = ''; root.append(strip); });
      // dragged to a new size: fit to it, and keep it as this layout's size
      pip.addEventListener('resize', () => {
        fitStrip();
        clearTimeout(sizeTimer);
        sizeTimer = setTimeout(() => { if (pipWin === pip) { const all = jget(KEY_SIZES, {}); all[layout] = [pip.innerWidth, pip.innerHeight]; jset(KEY_SIZES, all); } }, 400);
      });
      fitStrip();
    }).catch(e => setStatus("Couldn't pop out: " + e.message));
  }
  // mesos from inventory looks, and the verdict: mesos earned an hour less potions drunk an hour
  function renderMesos(s, o) {
    V.trade.hidden = !(o.mesoJump && !viewing);
    if (o.mesoJump) V.tradeQ.textContent = 'Your mesos changed by ' + signed(o.mesoJump.amount) + ' since your last peek. A trade or a big buy?';
    V.tradeBox.hidden = !!viewing;
    if (o.mesosEarned != null || o.etcValue != null) V.mesos.textContent = mesoLine(o);
    else if (o.mesoLooks >= 1) V.mesos.textContent = 'Counting mesos from ' + fmt(s.meso.first.v) + '. Open your inventory again in a few minutes to see what you earned';
    else V.mesos.textContent = 'Mesos: open your inventory now and then to count them';
    if (o.mesosEarned != null) { V.mesoBig.textContent = (o.mesosEarned >= 0 ? '+' : '−') + fmt(Math.abs(o.mesosEarned)); V.mesoSub.textContent = o.mesosHr != null ? fmtK(o.mesosHr) + ' an hour' : 'this session'; }
    // one look is only where the count starts, not +0 earned: earnings show once a later look is a minute or more after it
    else if (o.mesoLooks >= 1) { V.mesoBig.textContent = '·'; V.mesoSub.textContent = 'Counting from ' + fmt(s.meso.first.v) + '. Open your inventory again in a few minutes'; }
    else { V.mesoBig.textContent = '·'; V.mesoSub.textContent = st.mesoUnclear ? "Can't read your mesos clearly yet" : 'Open your inventory now and then to start counting'; }
    // profit: mesos earned + etc picked up - potions drunk
    V.verdict.hidden = o.profit == null;
    if (o.profit != null) {
      const up = (o.profitHr != null ? o.profitHr : o.profit) >= 0;
      V.verdict.className = 'g-verdict ' + (up ? 'up' : 'down');
      V.verdict.textContent = (up ? '▲ Profit +' : '▼ Loss −') + fmt(Math.abs(o.profit)) + (o.profitHr != null ? ' · ' + fmtK(Math.abs(o.profitHr)) + ' an hour' : '');
    }
  }
  // the pop out's clocks tick every second between frames
  const ticker = setInterval(() => {
    if (!root.isConnected) { clearInterval(ticker); return; }
    if (!strip.hidden) {
      renderLemon(Date.now());
      const b2 = SP.mini.querySelector('.g-c2 b'), c2 = (SP.ticks || [])[1];
      if (b2 && c2) b2.textContent = clock((c2.doneAt - Date.now()) / 1000);
    }
  }, 1000);

  function renderPots(s) {
    const body = pots.tBodies[0];
    const list = s ? Object.values(s.slots).filter(sl => sl.id || sl.used).sort((a, b) => a.key.localeCompare(b.key)) : [];
    body.replaceChildren(...list.map(sl => el('tr', {},
      el('td', {}, sl.key.replace(/^p\d+$/, '·')),
      el('td', {}, pictures.Icons[sl.id] ? el('img', { class: 'g-ico', src: pictures.Icons[sl.id], alt: '' }) : null, sl.name),
      el('td', { class: 'n' }, viewing ? '·' : fmt(sl.count)), el('td', { class: 'n' }, fmt(sl.used)),
      el('td', { class: 'n' }, sl.id && !viewing ? el('button', { type: 'button', class: 'g-price', onclick: e => editPrice(e.currentTarget, sl) }, fmt(sl.price)) : fmt(sl.price || 0)),
      el('td', { class: 'n' }, fmtK(sl.used * (sl.price || 0))))));
    if (!list.length) body.append(el('tr', {}, el('td', { colspan: '6' }, 'Your quickslot potions show up here once the game is shared.')));
  }
  function editPrice(btn, sl) {
    editing = true;
    const box = el('input', { type: 'number', min: '0', value: String(sl.price), 'aria-label': sl.name + ' price' });
    const done = keep => {
      if (!editing) return;
      editing = false;
      const v = Math.round(+box.value);
      if (keep && v >= 0 && isFinite(v)) {
        prices[sl.id] = v; jset(KEY_PRICES, prices);
        if (session) { session.prices[sl.id] = v; for (const x of Object.values(session.slots).concat(session.retired || [])) if (x.id === sl.id) x.price = v; }
      }
      render();
    };
    box.addEventListener('keydown', e => { if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); });
    box.addEventListener('blur', () => done(true));
    btn.replaceWith(box); box.focus(); box.select();
  }

  function showMap() {
    mobs.replaceChildren(...mobsOf(mapId).map(m => el('li', {}, el('b', {}, m.name), ' Lv ' + m.level + ' · ' + fmt(m.exp) + ' EXP · ' + fmt(m.hp) + ' HP · ' + m.count + ' here',
      m.undead ? el('span', { class: 'g-chip' }, 'undead · Heal hits it') : null)));
    const a = avgExp(mapId);
    mapNote.textContent = a ? 'From the game\'s own data. Kills a minute is your EXP a minute ÷ ' + Math.round(a) + ', the average EXP a kill here, so it reads low while a party member shares your EXP.' : '';
  }

  /* ----- this session in one slim line: EXP an hour, EXP gained, the main potion drunk, mesos and the time ----- */
  const iconOf = (id, name) => pictures.Icons[id] ? el('img', { src: pictures.Icons[id], alt: name }) : null;
  const usedOf = (s, id) => Object.values(s.slots).concat(s.retired || []).filter(x => String(x.id) === String(id)).reduce((a, x) => a + x.used, 0);
  const shortMap = id => mapName(id).replace(/^.*? : /, '');
  function renderNow(s, o, mains) {
    const k = (cls, v, label) => el('span', { class: 'g-nk ' + cls }, el('b', {}, v), label ? ' ' + label : '');
    if (!s) {
      V.now.replaceChildren(el('span', { class: 'g-nl' }, 'This session'), el('span', { class: 'g-nm' }, st.sharing ? 'It starts with your next EXP' : 'Share the game window to start one'));
      moreBtn.hidden = true; return;
    }
    const main = mains[0];
    V.now.replaceChildren(...[el('span', { class: 'g-nl' }, viewing ? 'Looking at ' + shortMap(viewing.mapId) + ', ' + dateOf(viewing.t0) : 'This session'),
      k('y', o.expHr != null ? fmtK(o.expHr) : '·', 'EXP an hour'), k('b', fmt(o.exp), 'EXP'),
      main ? el('span', { class: 'g-nk l' }, iconOf(main.id, main.name), el('b', {}, fmt(usedOf(s, main.id))), ' ' + plural(main.name)) : null,
      o.mesosEarned != null ? k('g', (o.mesosEarned >= 0 ? '+' : '−') + fmtK(Math.abs(o.mesosEarned)), 'mesos') : null,
      k('t', fmtDur(o.mins))].filter(Boolean));
    moreBtn.hidden = !!viewing;
  }

  /* ----- saved sessions, and all time from them ----- */
  function listSessions() {
    // signed in: the account's sessions plus any the account didn't take yet, which are kept on this device
    const local = jget(KEY_LOCAL, []);
    const got = signedIn() ? api.listGrind().catch(() => []).then(rows => rows.concat(local.filter(l => !rows.some(r => r.id === l.id)))) : Promise.resolve(local);
    return got.then(rows => {
      lastRows = rows;
      renderLife();
      if (!rows.length) { sessions.replaceChildren(el('p', { class: 'g-note' }, signedIn() ? 'No saved sessions yet.' : 'No sessions yet. Signed out, they stay on this device.')); return; }
      const byMap = {};
      for (const r of rows) (byMap[r.map_id] = byMap[r.map_id] || []).push(r);
      sessions.replaceChildren(...Object.entries(byMap).map(([id, rs]) => el('div', { class: 'g-sess' }, el('b', {}, mapName(id)), rs.map(r => {
        const hrs = (r.active_min || 0) / 60, cost = (r.potions || []).reduce((a, p) => a + p.used * (p.price || 0), 0);
        return el('button', { type: 'button', onclick: () => openSession(r) }, el('span', {}, dateOf(Date.parse(r.started_at))),
          el('span', { class: 'n' }, fmtDur(r.active_min || 0) + ' · ' + (hrs ? fmtK(r.exp / hrs) + ' EXP an hour · ' + fmt(r.exp / (hrs * 60)) + ' a minute' : '·') +
            (hrs && cost ? ' · potions ' + fmtK(cost / hrs) + ' an hour' : '') + (r.pct >= 0.3 && cost ? ' · ' + fmtK(cost / r.pct) + ' per 1%' : '') +
            (r.mesos_earned != null && r.meso_min >= 2 ? ' · mesos ' + fmtK(r.mesos_earned / (r.meso_min / 60)) + ' an hour' : '')));
      }))));
    });
  }
  function openSession(r) {
    // older sessions kept on this device have no minutes any more: they open without charts
    const full = r.minutes || jget(KEY_LOCAL, []).some(x => x.id === r.id) ? Promise.resolve(r) : api.getGrind(r.id);
    return full.then(row => { viewing = GS().fromRow(row); render(); detail.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, e => setStatus("Couldn't open that session (" + e.message + ').'));
  }
  // all time: the listed sessions with the running one as it is now (its last save swapped for the live numbers)
  function renderLife() {
    lifeAt = Date.now();
    let rows = lastRows;
    if (session) {
      try { const r = GS().toRow(session); rows = rows.filter(x => x.id !== r.id).concat(r.active_min > 0 ? [r] : []); } catch (e) { /* not started yet */ }
    }
    const L = lifetime(rows, { now: Date.now(), lemon: LEMON_IDS, meat: MEAT_IDS });
    LF.since.textContent = 'since you started tracking' + (signedIn() ? '' : ', on this device') + ' · ' + L.sessions + ' session' + (L.sessions === 1 ? '' : 's');
    const fill = (t, g, name, glass) => {
      t.n.textContent = fmt(g.used);
      t.sub.textContent = g.used ? fmtK(g.cost) + ' mesos of ' + glass + (g.per1 != null ? ' · about ' + perFmt(g.per1) + ' for every 1%' : '') : 'None yet. Every one you drink counts here';
      // a little picture for every 1,000, the way the game would stack them
      const k = Math.floor(g.used / 1000);
      t.row.replaceChildren(...(k && t.pic ? Array.from({ length: Math.min(k, 20) }, () => el('img', { src: t.pic, alt: '' })) : []),
        k ? (k > 20 ? ' +' + (k - 20) + ' · ' : ' ') + 'one for every 1,000' : fmt(1000 - g.used) + ' more to your first 1,000');
    };
    fill(LF.lemon, L.lemon, 'Lemon', 'lemonade'); fill(LF.meat, L.meat, 'Meat', 'Meat');
    LF.other.textContent = L.other.used ? 'Plus ' + fmt(L.other.used) + ' other potions, ' + fmtK(L.other.cost) + ' mesos of them.' : '';
    const tot = (label, v, sub, cls) => el('div', { class: 'g-tot' }, el('div', { class: 'g-lbl' }, label), el('div', { class: 'g-tv ' + (cls || '') }, v), el('div', { class: 'g-tsub' }, sub));
    const hrs = L.mins / 60, levels = L.levelFrom != null && L.levelTo != null;
    LF.tots.replaceChildren(
      tot('Hours grinded', fmtDur(L.mins), L.days ? 'over ' + L.days + ' day' + (L.days === 1 ? '' : 's') : 'none yet'),
      tot('EXP gained', fmtK(L.exp), hrs ? fmtK(L.exp / hrs) + ' an hour on average' : '·', 'b'),
      tot('Levels gained', levels ? String(L.levelTo - L.levelFrom) : '·', levels ? L.levelFrom + ' → ' + L.levelTo : '·', 'y'),
      tot('Mesos earned', L.mesos != null ? (L.mesos >= 0 ? '+' : '−') + fmtK(Math.abs(L.mesos)) : '·',
        L.profit != null ? (L.profit >= 0 ? '+' : '−') + fmtK(Math.abs(L.profit)) + ' after potions' : 'open your inventory while you grind', 'g'),
      tot('Deaths', String(L.deaths), L.deaths ? 'one every ' + fmtDur(L.mins / L.deaths) : L.sessions ? 'none yet' : '·'));
    const top = L.maps.slice(0, 5), most = top.length ? top[0].mins || 1 : 1;
    LF.maps.replaceChildren(...(top.length ? top.map((m, i) => el('div', { class: 'g-mrow' }, el('span', { class: 'g-rk' }, String(i + 1)),
      el('div', {}, el('b', {}, shortMap(m.id)), el('div', { class: 'g-barw' }, el('i', { style: 'width:' + Math.max(2, Math.round(100 * m.mins / most)) + '%' }))),
      el('div', { class: 'g-mr' }, fmtDur(m.mins), el('small', {}, m.expHr != null ? fmtK(m.expHr) + ' an hour' : '·'))))
      : [el('p', { class: 'g-note' }, 'Your maps show up after your first session. They go by the map picked under This map.')]));
    const when = r => shortMap(r.map_id) + ' · ' + new Date(Date.parse(r.started_at)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const best = (label, b, v) => b ? el('div', { class: 'g-bi' }, el('span', {}, label, el('small', {}, when(b.row))), el('b', {}, v(b.v))) : null;
    const bests = [best('Best EXP an hour', L.best.expHr, fmtK), best('Longest session', L.best.longest, fmtDur),
      best('Most Lemons in one go', L.best.lemons, fmt), best('Cheapest 1%', L.best.cheap1, fmtK)].filter(Boolean);
    LF.bests.replaceChildren(...(bests.length ? bests : [el('p', { class: 'g-note' }, 'Your bests show up after a session of 10 minutes or more.')]));
    const shade = m => !m ? 0 : m < 60 ? 1 : m < 150 ? 2 : 3;
    LF.days.replaceChildren(...L.daysList.map(d => el('i', { class: 'g-d' + shade(d.mins), 'data-day': d.date,
      title: new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + (d.mins ? ' · ' + fmtDur(d.mins) : ' · no grinding') })));
    LF.daysNote.textContent = 'The last 30 days, darker is more time.' + (L.streak > 1 ? ' Best streak: ' + L.streak + ' days in a row.' : '');
  }

  showMap(); render(); listSessions();
  if (session) setStatus('Carrying on your session from ' + timeOfDay(session.t0) + '. Share the game window to keep going.');
  window.Grind.debug = { session: () => session, state: () => ({ reads: st.reads, ticks: st.ticks, line: st.line, m: st.m, level: st.level }),
    save: () => save(true), load: row => { viewing = GS().fromRow(row); render(); }, capture: () => capture, mesoLine };
}

window.Grind = { mount, fmtK, clock, health, lemonTile, lifetime };
})();
