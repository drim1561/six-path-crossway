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
const KEY_LAYOUT = 'grind.layout', KEY_SIZES = 'grind.layoutSizes', KEY_DETAIL = 'grind.detail', KEY_LOOT = 'grind.loot';
// the app's overlay: See-through (25 to 100%, in fives) and Size (60 to 160%, in tens), kept on this device
const KEY_SEE = 'grind.seeThrough', KEY_SCALE = 'grind.overlayScale';
// the shop window is looked for over the whole frame this often (ticks) until it's been seen, then where it was each tick
const SHOP_SEARCH_EVERY = 6;
// sessions kept on this device for all time: up to 200, the newest 20 with their minutes (the charts), older ones without
const LOCAL_MAX = 200, LOCAL_MINUTES = 20;
const RESUME_MS = 30 * 60000, SAVE_MS = 60000, LEVEL_EVERY = 20, ICON_EVERY = 40, MESO_SEARCH_EVERY = 40, LOST_MS = 15000, BAG_NEAR_MS = 5000;
// the Windows app's bridge (window.sixPathApp, deps.app) this page needs; an older app is asked to update. RELEASES is
// where the app downloads from until CONFIG.appDownload is set
const NEED_BRIDGE = 1, RELEASES = 'https://github.com/drim1561/six-path-crossway/releases/latest';
// quitting the app waits this long at most for saves still on their way to the account
const LET_GO_MS = 3000;

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
// the jump question on the card: a rise is most likely loot sold to someone, a drop something bought from someone
const jumpQuestion = n => 'Your mesos went ' + (n > 0 ? 'up' : 'down') + ' by ' + fmt(Math.abs(n)) + ' since your last peek. ' +
  (n > 0 ? 'Sold loot to someone?' : 'Bought something from someone?');
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
  // "Mesos waiting": the one line (the nudge) is the only place that asks for the inventory
  C.mesos = f.meso.unclear ? { state: 'wait', text: "can't read clearly" } : f.meso.at == null ? { state: 'wait', text: 'waiting' } : { state: mesoStale ? 'wait' : 'ok', text: ago(f.meso.at) };

  const stuck = ['exp', 'potions', 'level'].some(k => C[k].state === 'bad');
  const say = (state, text) => ({ checks: C, nudge: { state, text }, stuck });
  const app = !!f.app;   // the Windows app has no share step: Start picks the game
  // f.stopped: the player pressed Stop, so in the app the game wasn't lost
  if (!f.sharing) return say('idle', app ? (!f.hasSession ? 'Press Start to begin' : f.stopped ? 'Stopped. Press Start to carry on' : 'Lost the game window. Press Start to carry on')
    : f.hasSession ? 'Share stopped. Share the game window again to carry on' : 'Share the game window to start');
  if (C.exp.state === 'bad') return say('bad', app ? "Can't see your EXP bar, paused. Is the game open, with the bar showing?" : "Can't see your EXP bar, paused. Is the game still shared, with the bar showing?");
  if (stuckOn(f.size)) return say('bad', app ? "Can't measure the game. Is it minimized, or very small?" : "Can't measure the game. Share the game window itself, at full size");
  if (C.potions.state === 'bad') return say('bad', app ? "Can't read your quickslot numbers. Make the game window bigger, or press Find my game again" : "Can't read your quickslot numbers. Make the game window bigger, or share it again");
  if (C.level.state === 'bad') return say('bad', "Can't read your level. Try Find my game again");
  if (f.exp.ok == null || f.size.ok == null) return say('wait', 'Looking for your game…');
  if (f.potNone) return say('wait', 'Put the potions you drink on your quickslots so they count');
  // Count my loot (f.loot: { on, pictures, sets, refillAfter }): a flip through the bag also reads the mesos, so it comes
  // first, once the item pictures are in (a flip before then reads nothing)
  if (f.loot && f.loot.on && f.loot.pictures === false) return say('wait', 'Loading the item pictures for Count my loot');
  if (f.loot && f.loot.on && !f.loot.sets) return say('wait', 'Open your bag and flip through Equip, Use and Etc, scrolling to the bottom of each');
  if (f.loot && f.loot.on && f.loot.refillAfter) return say('wait', 'In town? Flip through your bag so your loot counts');
  if (f.meso.unclear) return say('wait', "Can't read your meso total clearly yet. Move the mouse off it");
  if (f.meso.at == null) return say('wait', 'Open your inventory for a moment so mesos count');
  if (mesoStale) return say('wait', 'Mesos last seen ' + ago(f.meso.at) + '. Open your inventory for a moment');
  return say('ok', 'Reading everything');
}

// the panel's potion tiles. slots: Object.values(s.slots).concat(s.retired || []), where a retired slot is flagged
// retired: true so its stale count is never shown (the caller adds the flag); cds: GrindSession.countdowns (sorted).
// One tile per kind being drunk (both Lemon ids are one kind), at most 2: the kinds with a clock by what runs out first,
// then the ones without by how much was drunk. [null] while nothing has been drunk.
const potionKind = name => /lemon/i.test(name || '') ? 'lemon' : /meat/i.test(name || '') ? 'meat' : 'other';
function potionTiles(slots, cds) {
  const kinds = {};
  for (const sl of slots) {
    if (!(sl.used > 0) || sl.id == null) continue;
    const k = potionKind(sl.name), g = kinds[k] || (kinds[k] = { kind: k, id: sl.id, name: sl.name, used: 0, count: undefined, cd: null });
    g.used += sl.used;
    // a big change still in its 15 second check shows at once (GrindSession books it once it holds)
    const n = sl.big ? sl.big.v : sl.count;
    if (!sl.retired && n != null && (g.count === undefined || n > g.count)) g.count = n;
  }
  for (const cd of cds || []) { const g = kinds[potionKind(cd.name)]; if (g && !g.cd) { g.cd = cd; g.id = cd.id; g.name = cd.name; } }
  const list = Object.values(kinds).sort((a, b) => a.cd && b.cd ? a.cd.secs - b.cd.secs : a.cd ? -1 : b.cd ? 1 : b.used - a.used).slice(0, 2);
  return list.length ? list.map(g => ({ kind: g.kind, id: g.id, name: g.name, count: g.cd ? g.cd.left : g.count, cd: g.cd })) : [null];
}
// one tile's text: the clock, what's left, a caption (Lemons get the lemonade jokes, Meat the plate), how full the glass is
// (0 to 100, against how full the slot was since the last refill) and low under 5 minutes
const POTION_CAPS = { lemon: ['till the juice runs out', 'Squeeze time! Refill soon'], meat: ["till the plate's empty", 'Almost out! Refill soon'], other: ['till they run out', 'Almost out! Refill soon'] };
function potionTile(tile, t, viewing) {
  if (!tile) return { kind: 'none', clock: '··:··', left: '', cap: 'starts once you drink', juice: 0, low: false };
  const c = tile.cd, left = tile.count != null ? fmt(tile.count) + ' left' : '';
  if (!c) return { kind: tile.kind, clock: '··:··', left, cap: viewing ? 'a saved session' : 'counting how fast you drink', juice: 0, low: false };
  return { kind: tile.kind, clock: clock((c.doneAt - t) / 1000), left: fmt(c.left) + ' left', cap: POTION_CAPS[tile.kind][c.low ? 1 : 0],
    juice: Math.round(100 * Math.min(1, c.left / (c.full || c.left || 1))), low: !!c.low };
}
// the session clock: active time, ticking between reads, still in a pause (GrindSession's maxGapMs)
function elapsedSecs(s, now, live) {
  const gap = now - s.tLast;
  return s.activeMs / 1000 + (live && gap >= 0 && gap < (GS() ? GS().CFG.maxGapMs : 30000) ? gap / 1000 : 0);
}

// Count my loot: what a loot picture is, for the engine. L is data/loot-icons.json and potions grind.json's potions.
// Every scroll of a grade shares one picture, so a scroll is named by its grade; items sharing a picture are worth the
// lowest NPC price among them; pot is the potion ids in it (the quickslots count those)
const GRADES = { Lesser: 1, Intermediate: 2, Greater: 3, Chaos: 4 };
function lootItem(L, cell, tab, potions) {
  const ids = L.cells[cell].ids, first = L.items[ids[0]], scroll = ids.every(id => Math.floor(id / 10000) === 204);
  const grade = scroll ? String(first[1]).split(': ')[1] || '' : '';
  const pot = ids.filter(id => potions && potions[id]);
  return { key: tab[0] + cell, name: scroll && GRADES[grade] ? grade + ' scroll' : first[1], price: Math.min(...ids.map(id => L.items[id][2] || 0)),
    kind: scroll ? 'scroll' : tab === 'Equip' ? 'equip' : tab === 'Etc' ? 'etc' : 'use', rank: scroll ? GRADES[grade] || 1 : 0, pot: pot.length ? pot : undefined };
}
// the session's Lemon and Meat tiles: how often, what it cost (or the HP it gave back), how many for every 1%, and a
// line by how many went down (Lemons fill a glass, Meat comes off a pig)
const QUIPS = { lemon: [[50, 'Barely a sip'], [200, 'A tall glass'], [500, 'A whole pitcher'], [Infinity, 'Enough to open a lemonade stand']],
  meat: [[10, 'Just a snack'], [50, 'A hearty lunch'], [150, 'A whole barbecue'], [Infinity, 'Somewhere a Ribbon Pig is nervous']] };
function eatLines(kind, g) {
  const lemon = kind === 'lemon';
  if (!g || !g.n) return ['No ' + (lemon ? 'Lemons' : 'Meat') + ' this session'];
  const sec = g.everySec == null ? null : Math.round(g.everySec);   // whole seconds first, so never "1m 60s"
  const every = sec == null ? null : sec < 90 ? sec + ' seconds' : Math.floor(sec / 60) + 'm' + (sec % 60 ? ' ' + sec % 60 + 's' : '');
  return [every && (lemon ? 'A Lemon every ' : 'A bite every ') + every, lemon ? g.cost != null && fmt(g.cost) + ' mesos of lemonade' : g.hp != null && fmt(g.hp) + ' HP chewed',
    g.perPct != null && perFmt(g.perPct) + ' for every 1%', QUIPS[lemon ? 'lemon' : 'meat'].find(([max]) => g.n < max)[1]].filter(Boolean);
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
    // EXP an hour on the EXP clock (first kill to latest), hours on the session clock; a row from before it: all of it
    const mins = r.active_min || 0, expMins = r.exp_min != null ? r.exp_min : mins, exp = r.exp || 0, pct = r.pct || 0;
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
    if (r.mesos_earned != null) L.mesos = (L.mesos || 0) + r.mesos_earned;
    // a session with a result (its counted window, loot and all) adds that; an older one, mesos earned less its potions
    if (r.result != null) L.profit = (L.profit || 0) + r.result;
    else if (r.mesos_earned != null) L.profit = (L.profit || 0) + r.mesos_earned - cost;
    const m = maps[r.map_id] || (maps[r.map_id] = { id: r.map_id, mins: 0, exp: 0, expMins: 0 });
    m.mins += mins; m.exp += exp; m.expMins += expMins;
    if (expMins >= BEST_MIN) top('expHr', exp / (expMins / 60), r);
    if (mins > 0) top('longest', mins, r);
    if (lemons) top('lemons', lemons, r);
    if (pct >= 0.3 && cost > 0) top('cheap1', cost / pct, r, true);   // the same 0.3% floor as the sessions list
    const k = dayKey(Date.parse(r.started_at));
    byDay[k] = (byDay[k] || 0) + mins;
  }
  for (const g of [L.lemon, L.meat]) { g.per1 = g.pct ? g.used / g.pct : null; delete g.pct; }
  L.maps = Object.values(maps).map(m => Object.assign(m, { expHr: m.expMins ? m.exp / (m.expMins / 60) : null })).sort((a, b) => b.mins - a.mins);
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
  // in the Windows app: Start finds the game itself (no browser picker), the overlay is a window of its own that opens with
  // the share, and quitting lets the last save go first. appOld: an app older than this page, which can't start
  const app = deps.app || null, appOld = !!app && !(app.v >= NEED_BRIDGE);
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
    sharing: false, stopped: false, potNone: false, potCount: 0, h: null, recent: [] };
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
  // the status line and the pill are polite live regions: what they say reaches a screen reader without looking for it
  const status = el('p', { class: 'g-status', id: 'g-status', role: 'status' });
  const shareArea = el('div', { id: 'g-sharearea' });
  const btn = (id, icon, label, onclick) => el('button', { type: 'button', id, class: 'g-btn', onclick }, el('i', { 'aria-hidden': 'true' }, icon), label);
  // in the app the overlay opens with the share, so this only shows while it's closed during a session (showPop)
  const popBtn = btn('g-pop', '⧉', app ? 'Show the overlay' : 'Pop out over the game', () => popOut());
  // a fresh average from now on, to try another way of grinding; the session average keeps going
  const markBtn = btn('g-mark', '↺', 'Reset average', () => resetAverage());
  // the quick reset: look for the bars, measure and name the potions again, keeping the session
  const refindBtn = btn('g-refind', '⌖', 'Find my game again', () => refind());
  const newBtn = btn('g-new', '＋', 'New session', () => newSession());
  // the next frame from the share comes down as a picture, to send when something reads wrong
  const snapBtn = btn('g-snap', '◉', 'Save a frame', () => { st.wantSnap = true; setStatus('Saving the next frame from your game…'); });
  // the app's power button (an app built before its bridge had quit shows none); the shell saves first, as the tray's Quit does
  const quitBtn = app && typeof app.quit === 'function' ? btn('g-quit', '⏻', 'Quit the app', () => Promise.resolve().then(() => app.quit()).catch(() => {})) : null;
  // the app's Settings window from the main window too (Rimmah, 2026-11-04: with clicks passing through, the way back to
  // the overlay's ⚙ was Alt+Tab), the overlay open or not; the site keeps Settings in its pop-out
  const setBtn = app ? btn('g-settings', '⚙', 'Settings', () => openSettings()) : null;
  // the app's version and what its own update check found (it checks each time it starts; the answer is kept a minute),
  // in small print under the buttons (Rimmah, 2026-11-04: not in the pop-out's Settings)
  const verLine = app ? el('p', { id: 'g-ver', class: 'g-note g-ver' }, 'Version ' + (app.version || '')) : null;
  if (verLine) new Promise(res => res(app.checkUpdate())).then(window.GrindSettings.updateLine, () => window.GrindSettings.updateLine(null))
    .then(t => { verLine.textContent = 'Version ' + (app.version || '') + ' · ' + t; });
  const HEALTH = [['exp', 'EXP'], ['level', 'Level'], ['potions', 'Potions'], ['mesos', 'Mesos']];
  const SIGN = { ok: '✓', wait: '!', bad: '✕', idle: '·' };
  const CHECKS = [['exp', 'EXP line'], ['size', 'Game size'], ['level', 'Level'], ['potions', 'Potions'], ['mesos', 'Mesos']];
  const NEEDED = ['exp', 'size', 'level', 'potions'];   // mesos only come when the inventory opens
  // before a share the checks only list what will be read; Looking… starts with the share (startChecks)
  const check = el('ul', { class: 'g-check', id: 'g-check' }, CHECKS.map(([k, label]) => el('li', { 'data-k': k, class: 'idle' }, el('b', {}, label), el('span', {}))));
  const V = {};
  const row = (k, label, strong) => el('div', { class: 'g-row' }, strong ? el('b', {}, label) : el('span', {}, label), V[k] = el(strong ? 'b' : 'span', {}, '·'));
  V.pill = el('div', { class: 'g-pill idle', id: 'g-pill', role: 'status' }, el('i', { class: 'g-pdot' }), V.pillText = el('span', {}, 'Not sharing yet'));
  const steps = el('ol', { class: 'g-steps' }, (app ? ['Open MapleStory', 'Press Start, it finds the game by itself', 'Open your inventory now and then for mesos']
    : ['Pick the MapleStory window', 'Grind, nothing to type', 'Open your inventory now and then for mesos']).map(t => el('li', {}, t)));
  V.health = el('div', { class: 'g-health', id: 'g-health' }, HEALTH.map(([k]) => el('span', { class: 'g-hc wait', 'data-k': k })));
  // the one thing to do, only when something needs you
  const toStart = app ? 'Press Start to begin' : 'Share the game window to start';
  V.nudge = el('div', { class: 'g-nudge idle', id: 'g-nudge', hidden: '' }, toStart);
  // a big jump between peeks: a trade or a big buy isn't grinding, so it asks (a rise is likely loot sold to someone,
  // so Keep it comes first; a drop, something bought, so Leave it out does)
  V.tradeQ = el('span', {});
  V.tradeYes = el('button', { type: 'button', id: 'g-tradeyes', onclick: () => answerJump(true) }, 'Leave it out');
  V.tradeNo = el('button', { type: 'button', id: 'g-tradeno', onclick: () => answerJump(false) }, 'Keep it');
  V.trade = el('div', { class: 'g-nudge wait', id: 'g-trade', hidden: '' }, V.tradeQ, ' ', V.tradeYes, ' ', V.tradeNo);
  const card = el('div', { class: 'g-card', id: 'g-card' },
    el('div', { class: 'g-kpis' },
      el('div', {}, el('div', { class: 'g-lbl' }, 'EXP per hour'), V.expHr = el('div', { class: 'g-big', id: 'g-exphr' }, '·')),
      el('div', { id: 'g-mesokpi' }, el('div', { class: 'g-lbl' }, 'Mesos earned'), V.mesoBig = el('div', { class: 'g-big' }, '·'),
        V.mesoSub = el('div', { class: 'g-sub' }, 'Not counted yet'))),
    V.sub = el('div', { class: 'g-sub' }, toStart), V.pace = el('div', { class: 'g-sub', id: 'g-pace' }), V.next = el('div', { class: 'g-sub' }),
    V.mesos = el('div', { class: 'g-sub', id: 'g-mesos' }, 'Mesos: not counted yet'),
    V.tradeBox = el('div', { class: 'g-tradebox', id: 'g-tradebox' }, el('button', { type: 'button', class: 'linkish', id: 'g-tradebtn', onclick: () => openTrade() }, 'Leave out a trade')),
    row('gain', 'EXP gained'), row('time', 'Time'), row('kpm', 'Kills a minute'), row('pots', 'Potions used'),
    row('costHr', 'Potions an hour', true), row('per1', 'Cost per 1%', true),
    el('div', { class: 'g-row' }, V.perPotL = el('span', {}, 'Potions per 1%'), V.perPot = el('span', {}, '·')),
    V.perPot2Row = el('div', { class: 'g-row', hidden: '' }, V.perPot2L = el('span', {}), V.perPot2 = el('span', {}, '·')), row('level', 'Level'));
  // the pop out over the game: one dark panel built here and moved into the pop out window, in one of four layouts that
  // ⇆ Layout flips (kept on the device): a top strip (Lv in, Elapsed and the buttons), three big numbers and a tile for
  // each potion being drunk (one or two), and the one thing to do under them, only when it needs you. Hero (one row),
  // Bar (one slim row), Column (stacked down the side) and Corner (two columns). Each layout has its own window size for
  // one potion tile and for two
  const SP = {};
  const LAYOUTS = { hero: { 1: [560, 170], 2: [720, 170] }, bar: { 1: [860, 70], 2: [980, 70] }, column: { 1: [240, 560], 2: [240, 680] }, corner: { 1: [420, 250], 2: [420, 340] } };
  const ORDER = Object.keys(LAYOUTS);
  let layout = ORDER.includes(store.get(KEY_LAYOUT)) ? store.get(KEY_LAYOUT) : 'hero';
  // the app's own (the site's pop-out can't be see-through, so there both stay at 100%): See-through fades the panel's
  // background, never its text, pictures or buttons; Size scales the overlay window. Always on top and Clicks pass through
  // are the app's, read from it at the start and each time Settings opens (its tray can change Clicks pass through)
  const kept = (k, lo, hi, step, d) => { const v = Math.round(+store.get(k) / step) * step; return v >= lo && v <= hi ? v : d; };
  let see = app ? kept(KEY_SEE, 25, 100, 5, 100) : 100, scale = app ? kept(KEY_SCALE, 60, 160, 10, 100) : 100;
  const prefs = { onTop: true, pass: false };
  let prefsAt = 0;   // when the app was last asked for them
  const kTile = (k, label) => el('div', { class: 'g-k g-k-' + k }, el('div', { class: 'g-kl' }, label), SP[k] = el('div', { class: 'g-kn' }, '·'), SP[k + 'Sub'] = el('div', { class: 'g-ks' }));
  // a potion tile: a glass that drains (the potion's picture beside its clock), what's left and a caption under them
  const potTile = () => {
    const P = {};
    P.box = el('div', { class: 'g-pot none' }, P.juice = el('div', { class: 'g-juice' }),
      el('div', { class: 'g-ph' }, P.img = el('img', { alt: '', hidden: '' }), P.clock = el('span', { class: 'g-pclock' }, '··:··')),
      P.left = el('div', { class: 'g-pleft' }), P.cap = el('div', { class: 'g-pcap' }));
    return P;
  };
  SP.pots = [potTile(), potTile()];
  // ⇆ Layout (Rimmah, 2026-11-04: pick one, not flip through): hovering it shows the four layouts as pictures with their
  // names, the one showing lit; a click on ⇆ shows them too (touch, keys). It opens a moment after the mouse arrives, so
  // passing over ⇆ on the way to ⚙ doesn't flash it, and shuts a moment after the mouse leaves, so the way over to the
  // pictures keeps it. While clicks pass through to the game it stays out of sight until the mouse on ⇆ holds them (the
  // CSS, g-pass and g-hold)
  const layName = l => l.charAt(0).toUpperCase() + l.slice(1);
  SP.lay = el('button', { type: 'button', class: 'g-lay', 'aria-label': 'Layout', 'aria-haspopup': 'true', 'aria-expanded': 'false', onclick: () => layRow(true) }, '⇆', el('span', { class: 'g-bl' }, ' Layout'));
  SP.layRow = el('span', { class: 'g-laypick', hidden: '' }, ORDER.map(l => el('button', { type: 'button', class: 'g-laypic', 'data-l': l, 'aria-pressed': 'false', title: layName(l),
    onclick: () => { layRow(false); setLayout(l); } }, window.GrindSettings.picture(l), el('span', {}, layName(l)))));
  let layT = null;
  function layRow(on, wait) {
    clearTimeout(layT);
    if (wait) { layT = setTimeout(() => layRow(on), wait); return; }
    SP.layRow.hidden = !on;
    SP.lay.setAttribute('aria-expanded', String(on));
    if (on) litRow();
  }
  const litRow = () => { for (const b of SP.layRow.children) b.setAttribute('aria-pressed', String(b.dataset.l === layout)); };
  const layWrap = el('span', { class: 'g-layw', onpointerenter: () => layRow(true, 120), onpointerleave: () => layRow(false, 300),
    onkeydown: e => { if (e.key === 'Escape' && !SP.layRow.hidden) { layRow(false); SP.lay.focus(); } },
    onfocusout: e => { if (!layWrap.contains(e.relatedTarget)) layRow(false, 300); } }, SP.lay, SP.layRow);
  const strip = el('div', { class: 'g-strip', id: 'g-strip', 'data-layout': layout, 'data-pots': '1', hidden: '' },
    el('div', { class: 'g-top' },
      SP.lvin = el('span', { class: 'g-lvin', hidden: '' }),
      el('span', { class: 'g-el' }, 'Elapsed ', SP.elapsed = el('b', {}, '0:00')),
      el('span', { class: 'g-btns' },
        layWrap,
        el('button', { type: 'button', class: 'g-reset', title: 'Reset average', onclick: () => resetAverage() }, '↺', el('span', { class: 'g-bl' }, ' Reset average')),
        SP.gear = el('button', { type: 'button', class: 'g-gear', title: 'Settings', 'aria-pressed': 'false', onclick: () => toggleSettings() }, '⚙', el('span', { class: 'g-bl' }, ' Settings')),
        // the app's overlay has no frame: ✕ closes just it and brings the main window up, the session goes on (Show the
        // overlay brings it back). The site's pop-out has the browser's own ✕
        app ? el('button', { type: 'button', class: 'g-close', title: 'Back to the main window', onclick: () => backToMain() }, '✕', el('span', { class: 'g-bl' }, ' Close')) : null)),
    SP.grid = el('div', { class: 'g-grid' }, kTile('exp', 'EXP an hour'), kTile('meso', 'Mesos earned'), kTile('gain', 'EXP gained'), SP.pots[0].box),
    SP.l3 = el('div', { class: 'g-l3 g-alert', hidden: '' }));
  const potCount = () => +strip.dataset.pots || 1;
  // the window the panel lives in; on the site a window dragged to a new size keeps that size for the layout and tile
  // count it showed when it was dragged (the app's overlay can't be dragged: the page alone sizes it). The app's overlay
  // and Settings are windows of their own, titled as the app's windows are
  const overlay = window.GrindOverlay.create({ strip, home: root, app, title: app ? 'Six Path EXP Tracker overlay' : 'Grind', setTitle: 'Six Path EXP Tracker settings', hide: () => [SP.l3],
    sizeKey: () => strip.dataset.layout + potCount(),
    onResize: (w, h, key) => { const all = jget(KEY_SIZES, {}); all[key] = [Math.round(w), Math.round(h)]; jset(KEY_SIZES, all); },
    // the window closed (Settings with it, if it was open); the share and the session go on
    onClose: () => { SP.gear.setAttribute('aria-pressed', 'false'); showPop(); },
    // the app's Settings window closed by itself, as its × does
    onSettingsClose: () => SP.gear.setAttribute('aria-pressed', 'false'),
    // a button takes the click from the game only while clicks pass through. Asked only while the mouse is on a button: if
    // the page has them off, the app is asked again (at most every 2 seconds), since its tray may have turned them on
    passing: () => { if (!prefs.pass && Date.now() - prefsAt > 2000) readPrefs(); return prefs.pass; } });
  // See-through on the panel (the app only): its backgrounds take the alpha, and at 60% or less its words and numbers get
  // a dark shadow so they read over a bright map
  function applySee() {
    if (!app) return;
    strip.style.setProperty('--g-see', String(see / 100));
    strip.classList.toggle('g-faint', see <= 60);
  }
  applySee();
  function setSee(v) {
    see = Math.max(25, Math.min(100, Math.round(+v / 5) * 5 || 100));
    store.set(KEY_SEE, String(see)); applySee(); syncSettings();
  }
  // Size: the overlay window at its layout's size times the scale; the panel grows with its window (fit())
  function setScale(v) {
    scale = Math.max(60, Math.min(160, Math.round(+v / 10) * 10 || 100));
    store.set(KEY_SCALE, String(scale)); syncSettings();
    overlay.resize(...layoutSize(layout, potCount()));
    overlay.fit();
  }
  // a call to the app's bridge as a promise: a method this app doesn't have, or one that throws, is a rejection
  const bridge = (name, ...a) => new Promise(res => res(app[name](...a)));
  // the app's two switches as it has them; a read that fails keeps what the page had
  function readPrefs() {
    if (!app || appOld) return;
    prefsAt = Date.now();
    bridge('getSettings').then(s => { if (!s) return; prefs.onTop = s.onTop !== false; prefs.pass = !!s.clickThrough; syncSettings(); }, () => {});
  }
  readPrefs();
  // a switch flips at once, and goes back if the app says no
  function setPref(k, method, on) {
    const was = prefs[k];
    prefs[k] = on; syncSettings();
    bridge(method, on).catch(() => { if (prefs[k] === on) { prefs[k] = was; syncSettings(); } });
  }
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
  // Count my loot: one switch (remembered on this device), the bag's three tabs as checks under it while it's on, and
  // the session's result card at the top of Session details in both modes (the loot list only when it's on)
  let lootOn = store.get(KEY_LOOT) === '1', lootIdx = null, lootImg = null, lootLoad = null;
  const lootBtn = el('button', { type: 'button', id: 'g-loot', class: 'g-loot', 'aria-pressed': String(lootOn), onclick: () => setLoot(!lootOn) }, 'Count my loot');
  const bagCheck = el('ul', { class: 'g-check g-bagcheck', id: 'g-bagcheck', hidden: '' }, ['Equip', 'Use', 'Etc'].map(t => el('li', { 'data-k': 'bag-' + t }, el('b', {}, t), el('span', {}, 'Open it in your bag'))));
  V.res = el('section', { class: 'g-res', id: 'g-res', hidden: '' },
    el('div', { class: 'g-lbl' }, 'Mesos an hour'),
    el('div', { class: 'g-res-top' }, V.resHr = el('span', { class: 'g-res-hr', id: 'g-res-hr' }, '·'), V.resPill = el('span', { class: 'g-res-pill' })),
    V.resSub = el('div', { class: 'g-res-sub', id: 'g-res-sub' }),
    V.resTiles = el('div', { class: 'g-res-tiles' }),
    V.resEats = el('div', { class: 'g-res-eats' }), V.resOther = el('p', { class: 'g-note' }),
    V.resLootH = el('div', { class: 'g-lbl g-res-h' }, 'What you picked up'), V.resLoot = el('div', { class: 'g-res-loot', id: 'g-res-loot' }),
    V.resLines = el('div', { class: 'g-res-lines', id: 'g-res-lines' }),
    V.resNudge = el('div', { class: 'g-res-nudge', id: 'g-res-nudge' }, el('span', {}, "Your loot isn't counted, so this only shows mesos."),
      el('button', { type: 'button', class: 'g-btn go', onclick: () => setLoot(true) }, 'Count my loot next time')),
    el('p', { class: 'g-note' }, 'Count my loot reads your bag when you flip through Equip, Use and Etc: the first full look and the latest one, at what an NPC pays (the market may pay more later). ' +
      'Without it, selling loot from an earlier session counts as earned. Items you use, wear, drop or hand over count as loot going down.'));
  function setLoot(on) {
    lootOn = on; store.set(KEY_LOOT, on ? '1' : '');
    lootBtn.setAttribute('aria-pressed', String(on)); bagCheck.hidden = !on;
    if (session) session.mode = on ? 'loot' : 'track';
    if (on) loadLoot();
    render();
  }
  // the item pictures load once, the first time the switch is on (about 900 KB)
  function loadLoot() {
    if (lootLoad) return lootLoad;
    const pic = new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'data/loot-icons.png'; });
    lootLoad = Promise.all([fetch('data/loot-icons.json').then(r => r.json()), pic]).then(([L, im]) => { MS().loadLoot(im, L); lootIdx = L; lootImg = im; render(); },
      () => { lootLoad = null; setStatus("Couldn't load the item pictures for Count my loot. Turn it off and on to try again."); });
    return lootLoad;
  }
  // a loot picture as an image for the card's list (its cell cut from the sheet, kept)
  const cellPics = {};
  function cellPic(cell) {
    if (!lootIdx || !lootImg || cellPics[cell]) return cellPics[cell] || null;
    const c = lootIdx.cells[cell];
    if (!c) return null;   // an item it can't name has no picture
    const cv = document.createElement('canvas'); cv.width = c.w; cv.height = c.h;
    cv.getContext('2d').drawImage(lootImg, (cell % lootIdx.cols) * lootIdx.cell, Math.floor(cell / lootIdx.cols) * lootIdx.cell, c.w, c.h, 0, 0, c.w, c.h);
    return (cellPics[cell] = cv.toDataURL());
  }
  const pots = el('table', { class: 'b-table', id: 'g-pots' },
    el('thead', {}, el('tr', {}, ['Key', 'Potion', 'Left', 'Used', 'Price', 'Cost'].map((h, i) => el('th', i > 1 ? { class: 'n' } : {}, h)))), el('tbody', {}));
  const mapSel = el('select', { id: 'g-map', 'aria-label': 'Map', onchange: () => setMap(mapSel.value) },
    Object.keys(data.maps).sort((a, b) => mapName(a).localeCompare(mapName(b))).map(id => el('option', { value: id }, mapName(id))));
  mapSel.value = String(mapId);
  // This map, picked here (Settings has none since 2026-11-04): one pick, kept on the device and given to the running session
  function setMap(id) {
    mapId = +id; mapSel.value = String(mapId); store.set(KEY_MAP, String(mapId));
    if (session) session.mapId = mapId;
    showMap(); render();
  }
  // ⚙ Settings (grind-settings.js): one panel under the strip inside the pop-out (in the app, a window of its own beside
  // the overlay, with the app's rows), built the first time it opens. Its Count my loot is the left column's own
  // (setLoot), and render() hands it the state while it's open, so the two places always agree
  let settings = null;
  const userNow = () => { const s = deps.session && deps.session(); return s ? { name: s.user_name, avatar: s.avatar || null } : null; };
  const settingsState = () => ({ layout, loot: lootOn, mapId, user: userNow(), see, scale, onTop: prefs.onTop, pass: prefs.pass });
  // (g-pass on the panel: the app passes clicks through to the game, so ⇆'s row of layouts waits for the mouse on ⇆)
  const syncSettings = () => { strip.classList.toggle('g-pass', !!app && prefs.pass); if (settings && overlay.settingsOpen()) settings.update(settingsState()); };
  const siteLink = hash => location.origin + location.pathname + hash;
  // the site's Settings sits under the panel in the pop-out, so it needs one; the app's is a window of its own (opened
  // again, it comes to the front)
  function openSettings() {
    if (!overlay.win() && !app) return;
    if (!settings) settings = window.GrindSettings.build({ el, app, layouts: ORDER,
      onLayout: l => setLayout(l), onLoot: on => setLoot(on), onSignIn: () => signIn(), onSignOut: () => signOut(),
      onProfile: () => openProfile(), links: { builds: siteLink('#builds'), appraiser: siteLink('#appraiser') }, onClose: () => closeSettings(),
      onSee: v => setSee(v), onSize: v => setScale(v), onTop: on => setPref('onTop', 'setOnTop', on), onPass: on => setPref('pass', 'setClickThrough', on) });
    readPrefs();   // the app's tray may have changed Clicks pass through since
    settings.update(settingsState());   // before it's measured: who is signed in changes its height
    if (overlay.showSettings(settings.el)) SP.gear.setAttribute('aria-pressed', 'true');
  }
  function closeSettings() { overlay.hideSettings(); SP.gear.setAttribute('aria-pressed', 'false'); }
  function toggleSettings() { if (overlay.settingsOpen()) closeSettings(); else openSettings(); }
  // Sign out from Settings: this device's sessions take over from the account's
  function signOut() { return deps.signOut().then(() => { listSessions(); render(); }); }
  // in the app Settings is a window of its own, and Sign in and Open my profile act on the main window: it comes to the
  // front first (it may be minimized)
  const toMain = () => { if (app) bridge('showMain').catch(() => { /* an app without it: the page carries on */ }); };
  // Sign in from Settings; one that fails says why on the page, as the top bar does
  function signIn() {
    toMain();
    return new Promise(res => res(deps.signIn())).catch(e => setStatus(e && e.message ? e.message : "Couldn't sign in. Try again."));
  }
  // Open my profile: this page, at All time
  function openProfile() {
    toMain();
    try { window.focus(); } catch (e) { /* the browser keeps the focus where it is */ }
    life.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
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
  // once everything is found the checklist folds away: the pill says it's reading, a check that isn't OK keeps its chip,
  // and Details beside the Reading heading opens the list again
  let checkOpen = false;
  const checkBtn = el('button', { type: 'button', class: 'linkish', id: 'g-checkbtn', 'aria-controls': 'g-check', 'aria-expanded': 'true', hidden: '',
    onclick: () => { checkOpen = !checkOpen; foldChecks(); } }, 'Details');
  function foldChecks() {
    const all = NEEDED.every(k => check.querySelector('[data-k="' + k + '"]').classList.contains('done'));
    checkBtn.hidden = !all; check.hidden = all && !checkOpen;
    checkBtn.setAttribute('aria-expanded', String(!check.hidden)); checkBtn.textContent = check.hidden ? 'Details' : 'Hide details';
  }
  // the share started: every check not read yet is looked for now (one already read keeps what it read)
  function startChecks() {
    for (const [k] of CHECKS) if (check.querySelector('[data-k="' + k + '"]').classList.contains('idle')) setCheck(k, '', 'Looking…');
  }
  // this session: one slim line, and its details (the card, the potions with their prices, the charts) folded away until
  // asked for (kept on the device); a saved session opened from the list always shows them
  V.now = el('div', { class: 'g-nowv' });
  let detailOpen = store.get(KEY_DETAIL) === '1';
  const moreBtn = el('button', { type: 'button', id: 'g-more', class: 'g-more', 'aria-controls': 'g-detail', onclick: () => { detailOpen = !detailOpen; store.set(KEY_DETAIL, detailOpen ? '1' : ''); showDetail(); } }, 'Session details');
  const detail = el('div', { class: 'g-detail', id: 'g-detail', hidden: '' }, viewBar, V.res,
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
  // the session's Lemon and Meat tiles count both Lemon ids, and Meat's HP comes from the game's data
  const eatCfg = () => ({ lemon: LEMON_IDS, meat: MEAT_IDS, meatHp: (data.potions[MEAT_IDS[0]] || [])[2] || 0 });
  // a session carried on after a reload follows the switch as it is now
  if (session) { if (!session.eat) session.eat = eatCfg(); session.mode = lootOn ? 'loot' : 'track'; }
  bagCheck.hidden = !lootOn;
  if (lootOn) loadLoot();
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
    el('p', { class: 'g-lead' }, app ? 'Press Start and grind: your EXP, level and potions read themselves, nothing to type. The overlay sits over the game; this page keeps your record.'
      : 'Share the game window and grind: your EXP, level and potions read themselves, nothing to type. Pop it out over the game for the live numbers; this page keeps your record.'),
    el('div', { class: 'g-page' },
      el('aside', { class: 'g-rail', id: 'g-rail' }, el('div', { class: 'g-railin' },
        el('div', { class: 'g-box g-acts' }, V.pill, shareArea, steps, popBtn, markBtn, refindBtn, newBtn, snapBtn, setBtn, quitBtn, verLine),
        el('div', { class: 'g-box g-read' }, el('div', { class: 'g-boxh' }, el('span', {}, 'Reading'), checkBtn), V.health, check, lootBtn, bagCheck),
        el('div', { class: 'g-box' }, el('div', { class: 'g-boxh' }, 'This map'), mapSel, mobs))),
      el('div', { class: 'g-main' }, status, V.nudge, V.trade, el('div', { class: 'g-now', id: 'g-now' }, V.now, moreBtn), detail, life)),
    el('p', { class: 'g-note' }, 'Item and UI pictures are from MapleStory, which belongs to Nexon.'), strip);

  const setStatus = msg => { status.textContent = msg; };
  function setCheck(k, state, text) {
    const li = check.querySelector('[data-k="' + k + '"]');
    li.className = state === 'done' || state === 'fix' || state === 'idle' ? state : '';
    li.lastChild.textContent = text;
  }

  /* ----- one frame from the share ----- */
  // The share ticks every 0.5 s. A full read (EXP, level, potions, mesos) runs when 1.4 s have passed since the last one;
  // the ticks between only look at the bag and the shop while they're open, at the spots they were seen, so a page of the
  // bag shown for a second (Rimmah flips that fast) still reads twice and counts
  function frame(src, info) {
    if (!picturesReady) return;
    const since = st.lastFull ? Date.now() - st.lastFull : Infinity;   // a clock set back (a replay) reads in full
    if (since >= 0 && since < 1400) {
      // a bag missed a moment ago (a tooltip over its mesos) is still looked for at every tick: a page shown for a
      // second right after can come and go between two full reads
      const bagNear = st.mesoOpen || Date.now() - (st.mesoSeen || -Infinity) < BAG_NEAR_MS;
      if (session && info.w === st.fw && info.h === st.fh && ((lootOn && lootIdx && bagNear) || st.shopOpen)) quick(src);
      return;
    }
    st.lastFull = Date.now();
    if (st.wantSnap) { st.wantSnap = false; saveFrame(src, info); }
    st.ticks++; st.sharing = true;
    const S = MS(), w = info.w, h = info.h;
    if (w !== st.fw || h !== st.fh) { st.fw = w; st.fh = h; st.line = null; S.mesoHome(null); st.homeTried = false; }   // the window changed size
    // the inventory's meso box: checked every tick where it last opened (a few ms, kept on this device for next time);
    // the whole frame is searched every third tick until it's been seen, then once a minute in case it moved (a search
    // takes a quarter second on a big window). With Count my loot, gone from its spot moments after it was there
    // (dragged mid flip, or put beside a shop's window), it's searched for every third tick again; a peek just closed
    // costs a few searches, not a minute of them
    if (!st.homeTried) { st.homeTried = true; const hm = jget(KEY_HOME, null); if (hm && hm.w === w && hm.h === h && hm.box && !S.mesoHome()) S.mesoHome(hm.box); }
    let mesos = null;
    const home = S.mesoHome(), lost = lootOn && home && !st.mesoOpen && Date.now() - (st.mesoSeen || -Infinity) < LOST_MS,
      search = st.ticks % (home && !lost ? MESO_SEARCH_EVERY : 3) === 1;
    if (home || search) {
      const mr = S.readMesos(src, { search });
      st.mesoOpen = mr.reason !== 'no inventory';
      if (st.mesoOpen) st.mesoSeen = Date.now();
      st.mesoUnclear = !mr.ok && st.mesoOpen;
      if (mr.ok) {
        mesos = mr.value; st.mesos = mr.value; setCheck('mesos', 'done', fmt(mr.value) + ' at ' + timeOfDay(Date.now()));
        if (!home || Math.abs(home.x - mr.box.x) > 3 || Math.abs(home.y - mr.box.y) > 3) jset(KEY_HOME, { w, h, box: mr.box });
      }
      else if (st.mesoOpen) setCheck('mesos', 'fix', "Can't read your mesos clearly (a tooltip over them, or a digit it hasn't learned yet)");
      else if (st.mesos == null) setCheck('mesos', '', 'Not seen yet');   // the nudge is the one place that asks for them
    }
    if (mesos != null && session) GS().add(session, { t: Date.now(), mesos });
    readLoot(src, S, false);
    if (!st.line) {
      st.line = S.findExpLine(src, w, h); st.m = null; st.measureAt = 0;
      if (!st.line) { mark('exp', false); setCheck('exp', 'fix', 'Make sure the bar at the bottom of the game is showing'); foldChecks(); render(); return; }
    }
    const exp = S.readExp(src, st.line);
    mark('exp', exp.ok);
    if (exp.ok) {
      st.expMiss = 0; setCheck('exp', 'done', fmt(exp.exp) + ' [' + exp.pct.toFixed(2) + '%]');
      // the game is found: the line telling the player to pick it has done its job
      if (status.textContent === WATCHING) setStatus('');
    }
    else {
      setCheck('exp', 'fix', "Can't read the EXP line right now");
      // 30 seconds of misses: look for it again next frame. The size was measured from the bar, so it goes too, and this
      // frame stops here (reading the quickslots without a bar threw, which stopped the share)
      if (++st.expMiss >= 20) { st.line = null; st.m = null; st.expMiss = 0; foldChecks(); render(); return; }
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
          // which potion: once per slot, again on any read its count changed (Rimmah, 2026-11-04: Pure Water put on a key
          // was 2 White Potions drunk until the next look a minute later; a swap always shows as a new count), and now and
          // then anyway (spread over ticks, ~35 ms each). A new count under a picture it can't make out (the item being
          // dragged, the cursor, the inventory over the quickslots) might be another item: the key is left out of this read,
          // as covered, rather than counted against the potion it held
          const changed = !!known && known.v !== c.value;
          if (!known || changed || st.ticks >= known.at) {
            const ic = S.readIcon(src, c, st.m), id = ic.diff < 75 && data.potions[ic.id] ? +ic.id : null;
            if (changed && known.id && !id) continue;
            known = st.slots[c.key] = { id, at: changed && known.id === id ? known.at : st.ticks + ICON_EVERY + nth * 3 };
          }
          known.v = c.value;
          const pot = known.id ? data.potions[known.id] : null;
          reading.counts.push({ key: c.key, id: known.id, name: pot ? pot[0] : 'Unknown item', price: known.id && prices[known.id] != null ? prices[known.id] : (pot ? pot[1] : 0), value: c.value });
        }
        const named = reading.counts.filter(c => c.id);
        st.potNone = !named.length; st.potCount = named.length;
        if (named.length) setCheck('potions', 'done', named.length + ' potion' + (named.length > 1 ? 's' : '') + ': ' + named.map(c => c.name).join(', '));
        else setCheck('potions', '', 'No potions in your quickslots yet');
      }
    }
    if (reading.exp != null || reading.counts.length) {
      if (!session) { session = GS().create({ mapId, t: reading.t, prices, eat: eatCfg() }); session.mode = lootOn ? 'loot' : 'track'; }
      GS().add(session, reading); st.reads++;
    }
    // the last 10 readings, for a Something off? report (an 84 read as 684 shows up here)
    st.recent.push({ t: reading.t, exp: reading.exp, pct: reading.pct, level: reading.level, mesos,
      counts: reading.counts.map(c => ({ key: c.key, id: c.id, value: c.value })) });
    if (st.recent.length > 10) st.recent.shift();
    foldChecks();
    render(); save(false);
  }

  // a tick between full reads: the meso box and the bag where the inventory is, the shop where it was seen
  function quick(src) {
    const S = MS();
    if (S.mesoHome()) {
      const mr = S.readMesos(src, { search: false });
      st.mesoOpen = mr.reason !== 'no inventory';
      if (st.mesoOpen) st.mesoSeen = Date.now();
      if (mr.ok) { st.mesos = mr.value; GS().add(session, { t: Date.now(), mesos: mr.value }); }
    }
    readLoot(src, S, true);   // the next full read draws it
  }
  // Count my loot's bag, a page at a time while the inventory is open (closing it ends the flip), and the shop's meso box
  // in both modes. quick: only where the shop already is
  function readLoot(src, S, quick) {
    if (session && lootOn && lootIdx) {
      if (st.mesoOpen) {
        const bag = S.readBag(src);
        if (bag.ok) {
          // a slot it can't read (the cursor over it, a tooltip) holds its row back; an item it can't name (an event or cash
          // item) still counts as there, worth 0, so the tab can finish
          const slots = bag.slots.map(q => q.value == null || (q.cell == null && !q.unknown) ? { r: q.r, c: q.c, n: q.value, key: null }
            : q.cell == null ? { r: q.r, c: q.c, n: q.value, key: bag.tab + '?', name: "An item it can't name", price: 0, kind: 'unknown', rank: 0 }
              : Object.assign({ r: q.r, c: q.c, n: q.value }, lootItem(lootIdx, q.cell, bag.tab, data.potions)));
          GS().add(session, { t: Date.now(), bagOpen: true, bag: { tab: bag.tab, scroll: bag.scroll, slots } });
          st.bagWas = true;
        }
      } else if (st.bagWas) { st.bagWas = false; GS().add(session, { t: Date.now(), bagOpen: false }); }
    }
    if (session) {
      const shome = S.shopHome();
      if (quick ? shome && st.shopOpen : shome || st.ticks % SHOP_SEARCH_EVERY === 2) {
        const sr = S.readShop(src, { search: !quick && (!shome || st.ticks % MESO_SEARCH_EVERY === 2) });
        if (sr.ok) { GS().add(session, { t: Date.now(), shop: sr.value, shopOpen: true }); st.shopOpen = true; }
        else if (st.shopOpen && sr.reason === 'no shop') { st.shopOpen = false; GS().add(session, { t: Date.now(), shopOpen: false }); }
      }
    }
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
  // The account takes one save every 20 seconds (grind.sql), so a save that comes sooner (the one when the share stops,
  // just after a minute save, or New session straight after that) waits its turn instead of being refused. A row the
  // account didn't take stays on the device, so starting a new session can't lose it, and goes again in a minute
  const SAVE_GAP = 21000, waiting = new Map();
  // sending: the row on its way to the account; settled: told each time a send finishes (quitting the app listens)
  let lastOk = -Infinity, busy = false, nextT = null, failNote = null, sending = null, settled = null;
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
    // the newest row of a session takes the place of one still waiting; a row that has to wait is kept on the device
    // meanwhile, so a reload can't lose it
    waiting.set(row.id, row);
    if (busy || nextT || now < lastOk + SAVE_GAP) { keepLocal(row); listSessions(); }
    if (failNote) setStatus(failNote);   // still not in the account: it keeps saying so
    if (!nextT) send();
    return Promise.resolve();
  }
  function send() {
    nextT = null;
    if (busy || !waiting.size) return;
    const wait = Math.min(SAVE_GAP, lastOk + SAVE_GAP - Date.now());
    if (wait > 0) { nextT = setTimeout(send, wait); return; }
    const [id, row] = waiting.entries().next().value;
    waiting.delete(id); busy = true; sending = row;
    api.saveGrind(row).then(() => {
      busy = false; sending = null; lastOk = Date.now(); failNote = null;
      if (!waiting.has(id)) jset(KEY_LOCAL, jget(KEY_LOCAL, []).filter(x => x.id !== id));
      listSessions(); send();
      if (settled) settled();
    }, e => {
      busy = false; sending = null; keepLocal(row); listSessions();
      if (!waiting.has(id)) waiting.set(id, row);
      failNote = 'Saved on this device only, your account didn\'t take it (' + e.message + '). It tries again in a minute.';
      setStatus(failNote);
      nextT = setTimeout(send, 60000);
      if (settled) settled();
    });
  }
  // quitting the app: the share stops (which saves, as Stop does), and the app is let go once nothing is waiting to reach
  // the account, or after LET_GO_MS; anything still on its way by then is kept on this device, so it isn't lost
  const nothingWaiting = () => !busy && !nextT && !waiting.size;
  function letGo() {
    capture.stop();
    return new Promise(res => {
      const done = () => {
        clearTimeout(timer); settled = null;
        if (!nothingWaiting()) { for (const r of waiting.values()) keepLocal(r); if (sending) keepLocal(sending); }
        res();
      };
      const timer = setTimeout(done, LET_GO_MS);
      settled = () => { if (nothingWaiting()) done(); };
      settled();
    });
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

  /* ----- the share. In the app it's Start: the app finds the game window itself (beforeStart), and the overlay opens with
     the share ----- */
  const LOST = 'Lost the game window. Press Start to try again.';
  // the site's line while a share starts; the first EXP line read clears it (frame)
  const WATCHING = 'Watching. Pick the Window tab and MapleStory if you haven\'t.';
  const capture = window.Reader.capture(shareArea, { el, prefix: 'g-', raw: true, limit: 0, keepWhenHidden: true, full: true, drop: false, every: 500,
    // failed: the reader's own note when a share won't start would talk about pasting a screenshot, which the app hasn't
    copy: app ? { share: 'Start', stop: 'Stop', failed: LOST } : { share: 'Share game window', stop: 'Stop sharing' },
    beforeStart: app ? findGame : null,
    onImage: frame, say: setStatus,
    onState: (state, why) => {
      // stopped: the player pressed Stop (not the game going away), which the one line says
      st.sharing = state === 'sharing'; st.stopped = !st.sharing && why === 'stop';
      if (st.sharing) startChecks();
      render();
      if (state === 'sharing') {
        if (app) { setStatus('Found MapleStory. Grind away, nothing to type.'); if (!overlay.win()) popOut(); return; }
        setStatus(WATCHING); return;
      }
      if (app) setStatus(why === 'denied' || why === 'failed' ? LOST : 'Stopped. This session is kept, press Start to carry on.');
      else setStatus(why === 'denied' ? 'Sharing was turned down. Press Share game window to try again.' : 'Stopped. This session is kept, share again to carry on.');
      save(true);
    } });
  // before sharing, Share game window is the one to press; Stop sits at the bottom of the buttons
  for (const b of shareArea.querySelectorAll('button')) b.classList.add('g-btn');
  const shareBtn = shareArea.querySelector('#g-share');
  if (shareBtn) shareBtn.classList.add('go');
  // an app older than this page can't start: the one line says to update it (renderHealth)
  if (appOld && shareBtn) shareBtn.disabled = true;
  if (app && typeof app.onClosing === 'function') app.onClosing(letGo);
  // Start in the app: the game window, found by the app. None: say so, and Start becomes Try again. One: that one. Several:
  // the player picks (Cancel starts nothing). The share starts once the app has it
  async function findGame() {
    if (appOld) return false;
    const notFound = () => { setStatus("Can't find MapleStory. Open the game, then press Try again."); if (shareBtn) shareBtn.textContent = 'Try again'; return false; };
    let wins = [];
    try { wins = (await app.findGame()) || []; } catch (e) { /* the same as none */ }
    if (!wins.length) return notFound();
    if (shareBtn) shareBtn.textContent = 'Start';
    setStatus('');
    const id = wins.length > 1 ? await choose(wins) : wins[0].id;
    if (id == null) return false;
    try { await app.pickGame(id); } catch (e) { return notFound(); }
    return true;
  }
  // which MapleStory window: a button for each (its picture and title) and Cancel, under Start until one is pressed
  function choose(wins) {
    return new Promise(res => {
      const pick = id => { box.remove(); res(id); };
      const box = el('div', { class: 'g-choose', id: 'g-choose' }, el('p', {}, 'Which MapleStory window?'),
        wins.map(w => el('button', { type: 'button', class: 'g-btn g-pick', onclick: () => pick(w.id) }, w.thumb ? el('img', { src: w.thumb, alt: '' }) : null, el('span', {}, w.title))),
        el('button', { type: 'button', class: 'g-btn', onclick: () => pick(null) }, 'Cancel'));
      shareArea.append(box);
    });
  }

  /* ----- drawing ----- */
  function render() {
    const s = viewing || session;
    // what the session worked out on its own since the last draw: a trade left out that was really potions
    if (session) {
      if (st.eventsFor !== session.id) { st.eventsFor = session.id; st.eventsSeen = (session.events || []).length; }
      for (const e of (session.events || []).slice(st.eventsSeen)) {
        const pot = data.potions[e.id] ? plural(data.potions[e.id][0]) : 'potions';
        if (e.kind === 'trade-undone') setStatus('Those ' + fmt(-e.amount) + ' mesos were your ' + pot + ', so they count as potions now, at ' + fmt(e.price) + ' each.');
      }
      st.eventsSeen = (session.events || []).length;
      // a price the session learned (from the shop's meso box, or a trade that was potions) is kept as if it were tapped
      if (st.learnedFor !== session.id) { st.learnedFor = session.id; st.learnedSeen = (session.learned || []).length; }
      for (const x of (session.learned || []).slice(st.learnedSeen)) {
        prices[x.id] = x.price; jset(KEY_PRICES, prices);
        const pot = data.potions[x.id] ? data.potions[x.id][0] : 'Potion';
        if (!(session.events || []).some(e => e.kind === 'trade-undone' && e.id === x.id && e.price === x.price)) setStatus(pot + ' price set to ' + fmt(x.price) + ' from what you paid.');
      }
      st.learnedSeen = (session.learned || []).length;
    }
    syncSettings();
    viewBar.hidden = !viewing;
    if (viewing) V.viewing.textContent = 'Looking at ' + mapName(viewing.mapId) + ', ' + dateOf(viewing.t0);
    if (!editing) renderPots(s);
    renderHealth();
    showDetail();
    // while sharing, Pop out is the one to press, and the three steps under Share game window go
    popBtn.classList.toggle('go', st.sharing); steps.hidden = st.sharing; showPop();
    charts.hidden = !s;
    renderBag();
    if (!s) { V.res.hidden = true; renderNow(null); overlay.fit(); return; }
    const t = viewing ? s.tLast : Date.now(), o = GS().stats(s, t, avgExp(s.mapId || mapId)), R = GS().result(s, t);
    renderResult(s, R);
    V.expHr.textContent = o.expHr != null ? fmtK(o.expHr) : '·';
    V.sub.textContent = o.expMin != null ? fmt(o.expMin) + ' a minute · ' + o.pctHr.toFixed(2) + '% an hour' : 'Needs 2 minutes of EXP first';
    V.pace.hidden = !!viewing;
    V.pace.textContent = paceParts(o, true).map(p => p.label + ' ' + p.value + (p.vs ? ' ' + p.vs : '') + (p.extra ? ' · ' + p.extra : '')).join(' · ');
    V.next.textContent = o.hrsToLevel != null ? 'Level ' + ((s.level || 0) + 1) + ' at ' + timeOfDay(t + o.hrsToLevel * 3600000) + ', in ' + fmtDur(o.hrsToLevel * 60) : '';
    V.gain.textContent = fmt(o.exp) + ' · ' + o.pct.toFixed(2) + '%' + (o.deaths ? ' · ' + deathText(o) : '');
    // the clock runs only while the EXP bar is read; time left out for a pause says so, to square with a stopwatch, and
    // so do the minutes EXP an hour ran on when town before the first kill or after the last left some out
    V.time.textContent = fmtDur(o.mins) + (o.pausedMins >= 1 ? ' · ' + fmtDur(o.pausedMins) + ' paused, not counted' : '')
      + (o.expHr != null && o.mins - o.expMins >= 1 ? ' · EXP an hour over ' + fmtDur(o.expMins) + ', first kill to last' : '');
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
    renderNow(s, o, mains, R);
    // all time follows the running session, so its Lemons never trail this session's line by a minute of saves
    if (!viewing && Date.now() - lifeAt > 5000) renderLife();
    renderStrip(s, o, mains);
    overlay.fit();
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

  /* ----- is it reading everything: the pill and checks down the left, and the one thing to do (on the card, and under
     the pop out's tiles) ----- */
  function renderHealth() {
    const s = session;
    const h = lastHealth = health({ t: Date.now(), app: !!app, sharing: st.sharing, stopped: !!st.stopped, hasSession: !!s, exp: st.h.exp, level: st.h.level, levelNow: st.level,
      size: st.h.size, counts: st.h.counts, potNone: st.potNone, potCount: st.potCount,
      meso: { at: s && s.meso && s.meso.last ? s.meso.last.t : null, unclear: !!(st.mesoOpen && st.mesoUnclear) },
      loot: { on: lootOn, pictures: !!lootIdx, sets: s && s.bag ? s.bag.sets : 0, refillAfter: !!s && GS().inTown(s) } });
    // the pill over the buttons goes by what the core numbers need (mesos only ever ask)
    const core = ['exp', 'level', 'potions'].map(k => h.checks[k].state);
    const ps = !st.sharing ? 'idle' : core.includes('bad') ? 'bad' : core.every(x => x === 'ok') ? 'ok' : 'wait';
    V.pill.className = 'g-pill ' + ps;
    // the pill is the one health line; a chip shows only for a check that isn't OK, and only once the game is shared
    // (before that the pill says so)
    V.health.hidden = !st.sharing || HEALTH.every(([k]) => h.checks[k].state === 'ok');
    const pillText = ps === 'idle' ? (app ? (s ? 'Stopped' : 'Not started') : s ? 'Share stopped' : 'Not sharing yet') : ps === 'bad' ? "Can't read your game" : ps === 'ok' ? 'Reading · Lv ' + (st.level || '·') : 'Looking for your game…';
    // written only when it changes: the pill is a live region, and this runs on every frame
    if (V.pillText.textContent !== pillText) V.pillText.textContent = pillText;
    // the one thing to do, only when there is one (a saved session being looked at isn't live)
    V.nudge.hidden = !!viewing || h.nudge.state === 'ok' || (h.nudge.state === 'idle' && !s);
    for (const [k, label] of HEALTH) {
      const c = h.checks[k], e = V.health.querySelector('[data-k="' + k + '"]');
      e.className = 'g-hc ' + c.state; e.textContent = SIGN[c.state] + ' ' + label + ' ' + c.text; e.hidden = c.state === 'ok';
    }
    V.nudge.className = 'g-nudge ' + h.nudge.state; V.nudge.textContent = SIGN[h.nudge.state] + ' ' + h.nudge.text;
    // an app older than this page: that comes first, with where to get the new one
    if (appOld) {
      V.nudge.hidden = false; V.nudge.className = 'g-nudge bad';
      V.nudge.replaceChildren(SIGN.bad + ' This page needs a newer app. ', el('a', { href: deps.appDownload || RELEASES, target: '_blank', rel: 'noopener' }, 'Update the app'));
    }
    refindBtn.classList.toggle('hi', h.stuck);
    // the pop out's alert under the tiles: the one thing to do, live only; a mesos jump to answer comes before anything amber
    const jump = s && s.meso && s.meso.jump;
    if (jump && !viewing && h.nudge.state !== 'bad') {
      SP.l3.hidden = false; SP.l3.className = 'g-l3 g-alert wait';
      const out = el('button', { type: 'button', onclick: () => answerJump(true) }, 'Leave it out'), keep = el('button', { type: 'button', class: 'g-keep', onclick: () => answerJump(false) }, 'Keep it');
      SP.l3.replaceChildren('! Mesos ' + signed(jump.amount) + '. ' + (jump.amount > 0 ? 'Sold loot to someone?' : 'Bought something from someone?'),
        ...(jump.amount > 0 ? [keep, out] : [out, keep]));
      return;
    }
    SP.l3.hidden = !!viewing || h.nudge.state === 'ok';
    SP.l3.className = 'g-l3 g-alert ' + h.nudge.state;
    SP.l3.replaceChildren(SIGN[h.nudge.state] + ' ' + h.nudge.text, h.stuck ? el('button', { type: 'button', onclick: () => refind() }, '↻ Find my game again') : '');
  }

  /* ----- the pop out panel: Lv in and Elapsed along the top, three big numbers, the potion tiles ----- */
  function renderStrip(s, o, mains) {
    const now = Date.now();
    // a saved session has no live clock, and its counts are where it stopped: no countdowns and no counts for it; retired
    // slots are marked so a stale count never shows
    const slots = Object.values(s.slots).map(sl => viewing ? Object.assign({}, sl, { count: null }) : sl)
      .concat((s.retired || []).map(r => Object.assign({}, r, { retired: true })));
    SP.tiles = potionTiles(slots, viewing ? [] : GS().countdowns(s, now));
    SP.main = mains[0] || null;   // the waiting tile shows the main potion's picture
    // one potion tile or two: the window takes that count's size when it can, and the panel fits it either way
    const n = SP.tiles.length;
    if (potCount() !== n) {
      strip.dataset.pots = String(n);
      if (n === 2) SP.grid.append(SP.pots[1].box); else SP.pots[1].box.remove();
      overlay.resize(...layoutSize(layout, n));
      overlay.fit();
    }
    // the next level, live only, once there's a pace to go by
    const lvin = !viewing && o.hrsToLevel != null;
    SP.lvin.hidden = !lvin;
    if (lvin) SP.lvin.replaceChildren('Lv ' + ((s.level || 0) + 1) + ' in ', el('b', {}, fmtDur(o.hrsToLevel * 60)));
    renderClocks(now);
    SP.exp.textContent = o.expHr != null ? fmtK(o.expHr) : '·';
    SP.expSub.replaceChildren(...expPace(o));
    const minus = v => v < 0 ? '−' : '';
    SP.meso.textContent = o.mesosEarned != null ? minus(o.mesosEarned) + fmt(Math.abs(o.mesosEarned)) : '·';
    SP.mesoSub.textContent = o.profit != null ? minus(o.profit) + fmt(Math.abs(o.profit)) + ' after potions' : o.mesoLooks ? 'peek again later' : 'no peek yet';
    SP.gain.textContent = fmtK(o.exp);
    SP.gainSub.textContent = minus(o.pct) + Math.abs(o.pct).toFixed(2) + '%' + (s.level ? ' of Lv ' + s.level : '') + (o.deaths ? ' · ' + deathText(o) : '');
  }
  // the EXP tile's small line: the pace against the session's average, since Reset average or over the last 5 minutes
  // (an arrow only past 2%); a saved session says how long EXP an hour ran over
  function expPace(o) {
    if (o.expHr == null) return ['after 2 minutes'];
    if (viewing) return ['over ' + fmtDur(o.expMins)];
    const arrow = p => el('span', { class: p.up ? 'up' : 'down' }, p.vs);
    if (o.markT) {
      const p = paceParts(o, false)[2], at = timeOfDay(o.markT);
      return p.value === '·' ? ['counting since ' + at] : p.vs ? [arrow(p), ' since ' + at] : ['steady since ' + at];
    }
    const p = paceParts(o, false)[0];
    return p.value === '·' ? ['pace after 5 minutes'] : p.vs ? [arrow(p), ' last 5 min'] : ['steady, last 5 min'];
  }
  // every frame and every second between: the potion tiles (each a glass that drains) and Elapsed
  function renderClocks(now) {
    const s = viewing || session;
    if (!s) return;
    (SP.tiles || [null]).forEach((tile, i) => {
      const P = SP.pots[i], x = potionTile(tile, now, viewing), pic = tile ? pictures.Icons[tile.id] : SP.main && pictures.Icons[SP.main.id];
      P.box.className = 'g-pot ' + x.kind + (x.low ? ' low' : '');
      P.juice.style.height = x.juice + '%';
      if (pic && P.img.getAttribute('src') !== pic) P.img.src = pic;
      P.img.hidden = !pic; P.img.alt = tile ? tile.name : SP.main ? SP.main.name : '';
      P.clock.textContent = x.clock; P.left.textContent = x.left; P.cap.textContent = x.cap;
    });
    SP.elapsed.textContent = clock(elapsedSecs(s, now, !viewing && st.sharing));
  }
  // a layout picked (from ⇆ Layout's row, or its picture in Settings): the panel fades out, takes the new layout at its
  // own window size for the tiles shown (the overlay resizes its window when the browser lets it), fades back in, and is
  // kept for next time. The pick counts at once, so a second pick straight after wins
  let swapT = null;
  function setLayout(l) {
    if (!LAYOUTS[l]) return;
    layout = l; syncSettings(); litRow();
    strip.classList.add('g-swap');
    clearTimeout(swapT);
    swapT = setTimeout(() => {
      strip.dataset.layout = layout; strip.classList.remove('g-swap'); store.set(KEY_LAYOUT, layout);
      overlay.resize(...layoutSize(layout, potCount()));
      overlay.fit();
    }, 150);
  }
  // a layout's window size with n potion tiles: on the site where it was last dragged to, or its own (sizes kept before
  // the panel had potion tiles, under the layout's name alone, are left behind); in the app always its own, as its
  // overlay can't be dragged (a size an older page kept there is left behind). Times the app's Size (100% on the site)
  function layoutSize(l, n) {
    const s = app ? null : jget(KEY_SIZES, {})[l + n], base = s && s[0] >= 120 && s[1] >= 50 ? s : LAYOUTS[l][n], k = scale / 100;
    return [Math.round(base[0] * k), Math.round(base[1] * k)];
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
  // in the app the overlay opens by itself when the share starts (and from Show the overlay), in the last layout
  function popOut() {
    const [w0, h0] = layoutSize(layout, potCount());
    return overlay.open(w0, h0).then(() => showPop(),
      e => setStatus(e.message !== 'no-window' ? "Couldn't pop out: " + e.message
        : app ? "Couldn't open the overlay. Restart the app and try again." : "Your browser can't pop out a window. Use Edge or Chrome on a computer."));
  }
  // the overlay's ✕ in the app: close it, then the main window comes up (Show the overlay waits there)
  function backToMain() {
    overlay.close();
    Promise.resolve().then(() => app && app.showMain()).catch(() => {});
  }
  // the app's Pop out reads Show the overlay, and shows only while the overlay is closed during a session
  function showPop() { if (app) popBtn.hidden = appOld || !!overlay.win() || !(st.sharing || session); }
  // mesos from inventory looks, and the verdict: mesos earned an hour less potions drunk an hour
  function renderMesos(s, o) {
    V.trade.hidden = !(o.mesoJump && !viewing);
    if (o.mesoJump) {
      const up = o.mesoJump.amount > 0;
      V.tradeQ.textContent = jumpQuestion(o.mesoJump.amount);
      V.trade.replaceChildren(V.tradeQ, ' ', up ? V.tradeNo : V.tradeYes, ' ', up ? V.tradeYes : V.tradeNo);
    }
    V.tradeBox.hidden = !!viewing;
    if (o.mesosEarned != null || o.etcValue != null) V.mesos.textContent = mesoLine(o);
    // what isn't counted yet says so; asking for the inventory is the nudge's job alone
    else if (o.mesoLooks >= 1) V.mesos.textContent = 'Counting mesos from ' + fmt(s.meso.first.v) + '. What you earned shows after your next look';
    else V.mesos.textContent = 'Mesos: not counted yet';
    if (o.mesosEarned != null) { V.mesoBig.textContent = (o.mesosEarned >= 0 ? '+' : '−') + fmt(Math.abs(o.mesosEarned)); V.mesoSub.textContent = o.mesosHr != null ? fmtK(o.mesosHr) + ' an hour' : 'this session'; }
    // one look is only where the count starts, not +0 earned: earnings show once a later look is a minute or more after it
    else if (o.mesoLooks >= 1) { V.mesoBig.textContent = '·'; V.mesoSub.textContent = 'Counting from ' + fmt(s.meso.first.v); }
    else { V.mesoBig.textContent = '·'; V.mesoSub.textContent = st.mesoUnclear ? "Can't read your mesos clearly yet" : 'Not counted yet'; }
  }
  // the result card (GrindSession.result): mesos an hour and the verdict, four even tiles that add up to the session's
  // total, the session's Lemons and Meat, what was picked up (Count my loot), and a line or two that ties it together
  const money = n => n == null ? '·' : (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(Math.round(n)));
  const tone = n => n == null || n === 0 ? '' : n > 0 ? 'pos' : 'neg';
  function renderResult(s, R) {
    V.res.hidden = false;
    const has = !!R.window, loot = R.mode === 'loot';
    V.resHr.textContent = money(R.perHr); V.resHr.className = 'g-res-hr ' + tone(R.perHr);
    V.resPill.textContent = R.verdict || 'Counting'; V.resPill.className = 'g-res-pill ' + (R.verdict === 'Profitable' ? 'up' : R.verdict === 'Losing' ? 'down' : '');
    const usual = has && R.perHr != null ? GS().usualOf(lastRows, { mapId: s.mapId, mode: R.mode, exceptId: s.id }) : null;
    const bits = has ? [money(R.total) + ' this session', fmtDur(R.window.mins)]
      // a saved session can't take another look: it says why it has no total instead of asking for one
      : [viewing ? (loot ? 'Its bag was never looked through twice, so it has no total' : 'Its inventory was never opened twice, so it has no total')
        : loot ? 'No total yet, it counts from two flips through your bag' : 'No total yet, it counts from two looks at your inventory'];
    if (usual != null) bits.push(fmtK(Math.abs(R.perHr - usual)) + ' an hour ' + (R.perHr >= usual ? 'better' : 'worse') + ' than your usual ' + shortMap(s.mapId));
    const short = has && R.window.mins < R.window.sessionMins - 1;
    V.resSub.replaceChildren(bits.join(' · '), short ? el('span', { class: 'g-res-win' }, 'Counted over ' + Math.round(R.window.mins) + ' of your ' + Math.round(R.window.sessionMins) + ' minutes. ' +
      (loot ? 'Flip through your bag before you stop to count it all.' : 'Open your inventory before you stop to count it all.')) : '');
    const tile = (label, v, sub, off) => el('div', { class: 'g-res-tile' + (off ? ' off' : '') }, el('div', { class: 'g-lbl' }, label),
      el('div', { class: 'g-res-tv ' + (off ? '' : tone(v)) }, off ? 'Not counted' : money(v)), el('div', { class: 'g-res-ts' }, sub || ''));
    V.resTiles.replaceChildren(tile('Picked up', R.pickedUp), tile('Sold at shop', R.sold, R.otherBuys ? 'bought ' + fmt(R.otherBuys) + ' besides potions' : ''),
      // with one flip so far the mesos seen are counted, and the loot waits for the next flip
      tile('Loot kept', R.loot ? R.loot.value : null, loot && !R.loot && has ? (viewing ? 'its bag was looked through once' : 'counts at your next flip') : '', !loot),
      tile('Potions', R.potions == null ? null : -R.potions));
    const eat = (k, ids, label) => {
      const g = R.eat[k], pic = picOf(ids);
      return el('div', { class: 'g-res-eat' }, pic ? el('img', { src: pic, alt: '' }) : el('span', {}),
        el('div', {}, el('div', { class: 'g-res-en' }, fmt(g.n), el('span', {}, ' ' + label)), ...eatLines(k, g).map(x => el('p', {}, x))));
    };
    V.resEats.replaceChildren(eat('lemon', LEMON_IDS, 'Lemons'), eat('meat', MEAT_IDS, 'Meat'));
    V.resOther.textContent = R.other && R.other.n ? 'Plus ' + fmt(R.other.n) + ' other potions, ' + fmt(R.other.cost) + ' mesos of them.' : '';
    // what you picked up: the best drop first, every row the same height, the NPC total under them
    V.resLootH.hidden = V.resLoot.hidden = !loot;
    if (loot) {
      const L = R.loot, best = L && L.best;
      const row = i => el('div', { class: 'g-res-li' + (best && i.key === best.key ? ' best' : '') },
        el('span', { class: 'g-res-ic' }, cellPic(+i.key.slice(1)) ? el('img', { src: cellPic(+i.key.slice(1)), alt: '' }) : ''),
        el('span', {}, i.name + (i.n !== 1 ? ' ×' + fmt(i.n) : ''), best && i.key === best.key ? el('small', {}, '★ Best drop. Sell it on the market') : ''),
        el('b', {}, (i.value < 0 ? '−' : '') + fmt(Math.abs(i.value))));
      V.resLoot.replaceChildren(...(!L ? [el('p', { class: 'g-note' }, 'Your loot shows once your bag has been looked through twice, a minute or more apart.')]
        : L.items.length ? L.items.map(row).concat([el('div', { class: 'g-res-li sum' }, el('span', {}), el('span', {}, 'Worth at the NPC'), el('b', {}, (L.value < 0 ? '−' : '') + fmt(Math.abs(L.value))))])
          : [el('p', { class: 'g-note' }, 'Nothing new in your bag yet.')]));
    }
    const lines = [];
    if (R.flipped) lines.push(el('div', {}, 'Mesos alone: ', el('b', { class: 'neg' }, money(R.mesosOnly)), '. Your loot turned it around.'));
    if (R.perPct != null) lines.push(el('div', {}, 'Each 1% EXP ' + (R.perPct >= 0 ? 'made you ' : 'cost you '), el('b', { class: tone(R.perPct) }, money(R.perPct)), ' mesos.'));
    V.resLines.replaceChildren(...lines);
    V.resNudge.hidden = loot || !!viewing;
  }
  // the bag's three tabs under the switch: seen in full (when), part of it (scroll on), or not yet
  function renderBag() {
    bagCheck.hidden = !lootOn;
    if (!lootOn) return;
    const B = session && session.bag;
    for (const tab of ['Equip', 'Use', 'Etc']) {
      const li = bagCheck.querySelector('[data-k="bag-' + tab + '"]'), A = B && B.acc[tab], full = B && B.done[tab] ? B.done[tab].t : B && B.last ? B.last.t : null;
      // pages of a tab not finished in this opening, unless this opening already made a set (they're left from it)
      const part = !!(A && A.strips.length) && !(B.done[tab]) && !(B.last && B.last.t >= B.openT);
      li.className = part ? 'fix' : full ? 'done' : '';
      li.lastChild.textContent = part ? 'Scroll to its top and bottom, slowly' : full ? 'Seen at ' + timeOfDay(full) : 'Open it in your bag';
    }
  }
  // the pop out's potion clocks and Elapsed tick every second between frames
  const ticker = setInterval(() => {
    if (!root.isConnected) { clearInterval(ticker); return; }
    if (!strip.hidden) renderClocks(Date.now());
  }, 1000);

  function renderPots(s) {
    const body = pots.tBodies[0];
    const list = s ? Object.values(s.slots).filter(sl => sl.id || sl.used).sort((a, b) => a.key.localeCompare(b.key)) : [];
    body.replaceChildren(...list.map(sl => el('tr', {},
      el('td', {}, sl.key.replace(/^p\d+$/, '·')),
      el('td', {}, pictures.Icons[sl.id] ? el('img', { class: 'g-ico', src: pictures.Icons[sl.id], alt: '' }) : null, sl.name),
      el('td', { class: 'n' }, viewing ? '·' : fmt(sl.big ? sl.big.v : sl.count)), el('td', { class: 'n' }, fmt(sl.used)),
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
  function renderNow(s, o, mains, R) {
    const k = (cls, v, label) => el('span', { class: 'g-nk ' + cls }, el('b', {}, v), label ? ' ' + label : '');
    if (!s) {
      V.now.replaceChildren(el('span', { class: 'g-nl' }, 'This session'), el('span', { class: 'g-nm' }, st.sharing ? 'It starts with your next EXP' : app ? toStart : 'Share the game window to start one'));
      moreBtn.hidden = true; return;
    }
    const main = mains[0];
    V.now.replaceChildren(...[el('span', { class: 'g-nl' }, viewing ? 'Looking at ' + shortMap(viewing.mapId) + ', ' + dateOf(viewing.t0) : 'This session'),
      k('y', o.expHr != null ? fmtK(o.expHr) : '·', 'EXP an hour'), k('b', fmt(o.exp), 'EXP'),
      main ? el('span', { class: 'g-nk l' }, iconOf(main.id, main.name), el('b', {}, fmt(usedOf(s, main.id))), ' ' + plural(main.name)) : null,
      // the session's result: mesos an hour and the verdict once there is one, else what the mesos did so far
      R && R.perHr != null ? k('g', money(R.perHr), 'mesos an hour') : R && R.total != null ? k('g', money(R.total), 'mesos') : null,
      R && R.verdict ? el('span', { class: 'g-nk v ' + (R.verdict === 'Profitable' ? 'up' : 'down') }, R.verdict) : null,
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
        const eh = (r.exp_min != null ? r.exp_min : r.active_min || 0) / 60;   // EXP an hour on the EXP clock
        return el('button', { type: 'button', onclick: () => openSession(r) }, el('span', {}, dateOf(Date.parse(r.started_at))),
          el('span', { class: 'n' }, fmtDur(r.active_min || 0) + ' · ' + (eh ? fmtK(r.exp / eh) + ' EXP an hour · ' + fmt(r.exp / (eh * 60)) + ' a minute' : '·') +
            (hrs && cost ? ' · potions ' + fmtK(cost / hrs) + ' an hour' : '') + (r.pct >= 0.3 && cost ? ' · ' + fmtK(cost / r.pct) + ' per 1%' : '') +
            (r.mesos_earned != null && r.meso_min >= 2 ? ' · mesos ' + fmtK(r.mesos_earned / (r.meso_min / 60)) + ' an hour' : '')));
      }))));
    });
  }
  function openSession(r) {
    // older sessions kept on this device have no minutes any more: they open without charts
    const full = r.minutes || jget(KEY_LOCAL, []).some(x => x.id === r.id) ? Promise.resolve(r) : api.getGrind(r.id);
    return full.then(row => { viewing = GS().fromRow(row, eatCfg()); render(); detail.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, e => setStatus("Couldn't open that session (" + e.message + ').'));
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
        L.profit != null ? (L.profit >= 0 ? '+' : '−') + fmtK(Math.abs(L.profit)) + ' after potions' : 'not counted yet', 'g'),
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
  if (session) setStatus('Carrying on your session from ' + timeOfDay(session.t0) + (app ? '. Press Start to carry on.' : '. Share the game window to keep going.'));
  window.Grind.debug = { session: () => session, state: () => ({ reads: st.reads, ticks: st.ticks, line: st.line, m: st.m, level: st.level }),
    // the overlay, opened as Start opens it (the app's own test); resolves to whether it's open
    overlay: () => (overlay.win() ? Promise.resolve() : popOut()).then(() => !!overlay.win()),
    save: () => save(true), load: row => { viewing = GS().fromRow(row, eatCfg()); render(); }, capture: () => capture, mesoLine,
    // a session carried in whole (the page tests' mockup session), as if it had been read here
    use: x => { session = x; viewing = null; if (!session.eat) session.eat = eatCfg(); session.mode = lootOn ? 'loot' : 'track'; render(); } };
  // what a Something off? report carries from this tab (index.html keeps it), and the pop out to draw beside the page
  return {
    report: () => ({ sharing: st.sharing, ticks: st.ticks, reads: st.reads, frame: [st.fw, st.fh],
      stretch: st.m ? { s: st.m.s, score: st.m.score, countScore: st.m.countScore } : null, line: st.line, level: st.level,
      slots: st.slots, mesos: st.mesos == null ? null : st.mesos, mesoHome: MS().mesoHome(), checks: lastHealth, recent: st.recent.slice(),
      map: mapId, session: session ? GS().stats(session, Date.now(), avgExp(session.mapId || mapId)) : null, popout: overlay.win() ? { layout } : null,
      // Count my loot: the switch, how far each tab's flip got, the bag sets, shop visits and prices learned
      loot: { on: lootOn, mode: session ? session.mode : null, pictures: !!lootIdx, sets: session && session.bag ? session.bag.sets : 0,
        acc: session && session.bag ? Object.fromEntries(Object.entries(session.bag.acc).map(([k, a]) => [k, a.strips.map(x => ({ rows: x.rows.length, top: x.top, bottom: x.bottom }))])) : null,
        shop: session && session.shop ? { open: session.shop.open, visits: session.shop.visits.length } : null, learned: session ? session.learned || [] : [] } }),
    popout: () => overlay.win() ? overlay.win().document.body : null,
  };
}

window.Grind = { mount, fmtK, clock, health, potionTile, potionTiles, elapsedSecs, lifetime, lootItem, eatLines };
})();
