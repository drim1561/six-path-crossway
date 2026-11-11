// Grind tab (#grind): one click EXP and potion tracker. Share the game window and everything reads itself (screen.js):
// the EXP line, the game's stretch, the level, every quickslot potion and the mesos when the inventory opens (the party
// and etc items are left out for now, until they read right). grind-session.js turns the readings
// into minutes and numbers; this file draws the page (one column of Windows: All time, the Now grinding
// card with this session on its band, grind-now.js, Session details with the session's card and potions, then Your runs and
// Your record from every saved session), the pop out over the game, and saves to the player's private grind_sessions rows or this device.
// Design: docs/superpowers/specs/2026-10-31-grind-tab-design.md
(function () {
'use strict';

const MS = () => window.MapleScreen, GS = () => window.GrindSession;
const MAP_SEARCH_MS = 5000;
const KEY_OPEN = 'grind.open', KEY_LOCAL = 'grind.local', KEY_PRICES = 'grind.prices', KEY_HOME = 'grind.mesoHome';
// (layoutSizes3: the Trail Signs panel is bigger (frame, bar and bigger numbers), so window sizes dragged before it start over)
const KEY_LAYOUT = 'grind.layout', KEY_SIZES = 'grind.layoutSizes3', KEY_DETAIL = 'grind.detail', KEY_LOOT = 'grind.loot', KEY_WINDOW = 'grind.expWindow', KEY_CLASS = 'grind.class';
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
// a number in few characters, the one rule for the whole page (Rimmah's ledger): under 1,000 as is, 88.2K, then 126K (100K to under 1M has no
// decimal), then 1.23M
function fmtK(n) {
  const a = Math.abs(n), s = n < 0 ? '−' : '';
  return s + (a >= 999500 ? (a / 1e6).toFixed(2) + 'M' : a >= 99950 ? Math.round(a / 1e3) + 'K' : a >= 1e3 ? (a / 1e3).toFixed(1) + 'K' : String(Math.round(a)));
}
// the breakdown under the card: mesos earned with the totals it came from, so it can be checked against the game
function mesoLine(o) {
  const sign = n => (n >= 0 ? '+' : '−') + fmtK(Math.abs(n));
  const math = o.mesoFrom != null ? ' (' + fmt(o.mesoFrom) + ' to ' + fmt(o.mesoTo) + (o.refills ? ', plus ' + fmt(o.refills) + ' spent on potions' : '') +
    (o.traded ? ', leaving out ' + signed(o.traded) + ' traded' : '') + ')' : '';
  return [o.mesosEarned != null ? 'Mesos ' + sign(o.mesosEarned) + math : null, o.etcValue != null ? 'Etc ' + sign(o.etcValue) : null, 'Potions ' + sign(-o.potCost)].filter(Boolean).join(' · ');
}
// potions per 1%, whole (Rimmah, 2026-11-05: 11 and 2 read faster than 11.4 and 1.6); a real value under a half is "under 1"
const perFmt = n => n >= 0.5 ? String(Math.round(n)) : 'under 1';
// the same as a line: "25 for every 1%", with "about" in front of a real number and never in front of "under 1" ("about under 1" reads wrong)
const perLine = (n, about) => (about && n >= 0.5 ? 'about ' : '') + perFmt(n) + ' for every 1%';
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
const plural = name => /s$|^meat$/i.test(name) ? name : name + 's';

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
  // short: the two or three words the light says (the pop out's, and the page's lantern); text: the whole sentence
  const say = (state, short, text, extra) => ({ checks: C, nudge: Object.assign({ state, short, text }, extra), stuck });
  const app = !!f.app;   // the Windows app has no share step: Start picks the game
  // f.stopped: the player pressed Stop, so in the app the game wasn't lost
  if (!f.sharing) return app ? (!f.hasSession ? say('idle', 'Press Start', 'Press Start to begin') : f.stopped ? say('idle', 'Stopped', 'Stopped. Press Start to carry on') : say('idle', 'Lost the game', 'Lost the game window. Press Start to carry on'))
    : f.hasSession ? say('idle', 'Share stopped', 'Share stopped. Share the game window again to carry on') : say('idle', 'Not sharing yet', 'Share the game window to start');
  if (C.exp.state === 'bad') return say('bad', "Can't see EXP bar", app ? "Can't see your EXP bar, paused. Is the game open, with the bar showing?" : "Can't see your EXP bar, paused. Is the game still shared, with the bar showing?");
  if (stuckOn(f.size)) return say('bad', "Can't measure game", app ? "Can't measure the game. Is it minimized, or very small?" : "Can't measure the game. Share the game window itself, at full size");
  if (C.potions.state === 'bad') return say('bad', "Can't read quickslots", app ? "Can't read your quickslot numbers. Make the game window bigger, or press Find my game again" : "Can't read your quickslot numbers. Make the game window bigger, or share it again");
  if (C.level.state === 'bad') return say('bad', "Can't read level", "Can't read your level. Try Find my game again");
  if (f.exp.ok == null || f.size.ok == null) return say('wait', 'Looking for game', 'Looking for your game…');
  if (f.potNone) return say('wait', 'No quickslot potions', 'Put the potions you drink on your quickslots so they count');
  // Count my loot (f.loot: { on, pictures, sets, refillAfter }): a flip through the bag also reads the mesos, so it comes
  // first, once the item pictures are in (a flip before then reads nothing)
  if (f.loot && f.loot.on && f.loot.pictures === false) return say('wait', 'Loading pictures', 'Loading the item pictures for Count my loot');
  // flip: the pop out's light shows the three tabs' own checkmarks beside its words (bagTabStates in renderHealth)
  if (f.loot && f.loot.on && !f.loot.sets) return say('wait', 'Flip your bag', 'Open your bag and flip through Equip, Use and Etc, scrolling to the bottom of each', { flip: true });
  if (f.loot && f.loot.on && f.loot.refillAfter) return say('wait', 'Flip your bag', 'In town? Flip through your bag so your loot counts', { flip: true });
  // with the pickup lines on, the bag is only asked for again when they can't be trusted (loot.needsFlip)
  if (f.loot && f.loot.on && f.loot.needsFlip) return say('wait', 'Flip your bag', "Flip through your bag again, the pickup lines can't be trusted for now", { flip: true });
  if (f.meso.unclear) return say('wait', 'Mouse off mesos', "Can't read your meso total clearly yet. Move the mouse off it");
  if (f.meso.at == null) return say('wait', 'Open your bag', 'Open your inventory for a moment so mesos count');
  if (mesoStale) return say('wait', 'Open your bag', 'Mesos last seen ' + ago(f.meso.at) + '. Open your inventory for a moment');
  // green: everything is read. f.killed: the session has gained EXP
  return say('ok', f.killed ? 'Grinding' : 'Ready to grind', 'Reading everything');
}

// the panel's potion tiles. slots: Object.values(s.slots).concat(s.retired || []), where a retired slot is flagged
// retired: true so its stale count is never shown (the caller adds the flag); cds: GrindSession.countdowns (sorted).
// One tile per potion being drunk (both Lemon ids are one, Red and Blue each have their own), at most 2: the ones with a
// clock by what runs out first, then the ones without by how much was drunk. prevKeys is the keys shown last time, so two
// close clocks keep their order instead of flipping. [null] while nothing has been drunk.
const potionKind = name => /lemon/i.test(name || '') ? 'lemon' : /meat/i.test(name || '') ? 'meat' : 'other';
const potionKey = (id, name) => { const k = potionKind(name); return k === 'other' ? 'id' + id : k; };
const SWAP_GAP = 60;   // seconds of clock between two tiles before they trade places
function potionTiles(slots, cds, prevKeys = [], t) {
  const kinds = {}, fresh = GS() ? GS().CFG.minUse : 120000;
  for (const sl of slots) {
    if (!(sl.used > 0) || sl.id == null) continue;
    const key = potionKey(sl.id, sl.name), g = kinds[key] || (kinds[key] = { key, kind: potionKind(sl.name), id: sl.id, name: sl.name, used: 0, count: undefined, full: 0, fresh: false, cd: null });
    g.used += sl.used;
    // a big change still in its 15 second check shows at once (GrindSession books it once it holds)
    const n = sl.big ? sl.big.v : sl.count;
    if (!sl.retired && n != null && (g.count === undefined || n > g.count)) g.count = n;
    if (!sl.retired) {
      g.full = Math.max(g.full, sl.full || 0, n || 0);
      if (sl.firstUse != null && t != null && t - sl.firstUse < fresh) g.fresh = true;
    }
  }
  for (const cd of cds || []) { const g = kinds[potionKey(cd.id, cd.name)]; if (g && !g.cd) { g.cd = cd; g.id = cd.id; g.name = cd.name; } }
  let top = Object.values(kinds).sort((a, b) => a.cd && b.cd ? a.cd.secs - b.cd.secs : a.cd ? -1 : b.cd ? 1 : b.used - a.used).slice(0, 2);
  const [a, b] = top;
  if (a && b && a.cd && b.cd && !a.cd.low && !b.cd.low && b.cd.secs - a.cd.secs < SWAP_GAP && prevKeys[0] === b.key) top = [b, a];
  return top.length ? top.map(g => ({ key: g.key, kind: g.kind, id: g.id, name: g.name, used: g.used, count: g.cd ? g.cd.left : g.count, full: g.full, cd: g.cd, fresh: g.fresh })) : [null];
}
// one tile's text: the clock, how many went down, what's left, a caption (Lemons get the lemonade jokes, Meat the plate),
// how full the glass is (0 to 100, against how full the slot was since the last refill) and low under 5 minutes. With no
// clock yet the glass is as full as the stack is, so it is never empty
const POTION_CAPS = { lemon: ['till the juice runs out', 'Squeeze time! Refill soon'], meat: ["till the plate's empty", 'Almost out! Refill soon'], other: ['till they run out', 'Almost out! Refill soon'] };
function potionTile(tile, t, viewing) {
  if (!tile) return { kind: 'none', clock: '··:··', n: '', verb: '', left: '', cap: 'starts once you drink', juice: 0, low: false };
  const c = tile.cd, n = fmt(tile.used || 0), verb = tile.kind === 'meat' ? 'eaten' : 'drunk', left = tile.count != null ? fmt(tile.count) + ' left' : '';
  // no count: every slot it was on has gone (it ran out, or left the bar), so the glass is empty and it says why
  if (!c) return { kind: tile.kind, clock: '··:··', n, verb, left, cap: viewing ? 'a saved session' : tile.count == null ? 'off your quickslots' : tile.fresh ? 'counting how fast you drink' : 'hardly touching it',
    juice: viewing ? 0 : Math.round(100 * Math.min(1, (tile.count || 0) / Math.max(tile.full || 0, tile.count || 1))), low: false };
  return { kind: tile.kind, clock: clock((c.doneAt - t) / 1000), n, verb, left: fmt(c.left) + ' left', cap: POTION_CAPS[tile.kind][c.low ? 1 : 0],
    juice: Math.round(100 * Math.min(1, c.left / (c.full || c.left || 1))), low: !!c.low };
}
// EXP an hour's switch in the pop-out. win: the window asked for ('5', '10', 'run' or 'since'); usual: this map's usual or null.
// What it shows: the window's pace (a window with no pace yet is off, and the run shows instead) and the arrow against your
// usual, or with no usual a window against the run's own average. Under 2% there's no arrow
function expPick(o, win, usual) {
  const pace = { 5: o.pace && o.pace[5], 10: o.pace && o.pace[10], since: o.markT ? o.since : null };
  const has = k => !!pace[k] && pace[k].expHr != null;
  const key = has(win) ? win : 'run', value = key === 'run' ? o.expHr : pace[key].expHr;
  const against = usual != null ? usual : key === 'run' ? null : o.expHr;
  let vs = null;
  if (value != null && against) {
    const d = value / against - 1;
    if (Math.abs(d) >= 0.02) vs = { up: d > 0, text: (d > 0 ? '▲ ' : '▼ ') + Math.round(Math.abs(d) * 100) + '%' };
  }
  const labels = [['5', '5m'], ['10', '10m'], ['run', 'run']].concat(o.markT ? [['since', 'since ' + timeOfDay(o.markT).replace(/\s*[AP]M$/i, '')]] : []);
  return { win: key, value, vs, windows: labels.map(([k, label]) => ({ key: k, label, on: k === key, off: k !== 'run' && !has(k) })) };
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
  const lemon = kind === 'lemon', other = kind === 'other';
  if (!g || !g.n) return ['No ' + (lemon ? 'Lemons' : 'Meat') + ' this session'];
  const sec = g.everySec == null ? null : Math.round(g.everySec);   // whole seconds first, so never "1m 60s"
  const every = sec == null ? null : sec < 90 ? sec + ' seconds' : Math.floor(sec / 60) + 'm' + (sec % 60 ? ' ' + sec % 60 + 's' : '');
  return [every && (other ? (/^[aeiou]/i.test(g.name) ? 'An ' : 'A ') + g.name + ' every ' : lemon ? 'A Lemon every ' : 'A bite every ') + every, lemon ? g.cost != null && fmt(g.cost) + ' mesos of lemonade' : g.hp != null && fmt(g.hp) + ' HP chewed',
    g.perPct != null && perLine(g.perPct), QUIPS[kind === 'meat' ? 'meat' : 'lemon'].find(([max]) => g.n < max)[1]].filter(Boolean);
}

// all time on the page, from every saved session (rows as GrindSession.toRow writes them): totals, Lemons and Meat (o.lemon
// and o.meat: the client ids with those names, since two items are named Lemon), the most trained maps, personal bests
// and the last 30 days. Only what was tracked counts, so it's "since you started tracking", never the whole game
const BEST_MIN = 10;   // a session shorter than this can't be a best (3 lucky minutes aren't an EXP an hour)
const dayKey = ms => { const d = new Date(ms); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
function lifetime(rows, o) {
  const L = { sessions: rows.length, mins: 0, exp: 0, deaths: 0, levelFrom: null, levelTo: null, mesos: null, profit: null,
    lemon: { used: 0, cost: 0, pct: 0, bought: 0, spent: 0 }, meat: { used: 0, cost: 0, pct: 0, bought: 0, spent: 0 }, other: { used: 0, cost: 0, bought: 0, spent: 0 }, maps: [], thirst: null, first: null,
    best: { expHr: null, longest: null, lemons: null, cheap1: null }, days: 0, streak: 0, daysList: [] };
  // Monsters felled (an estimate: a run's EXP over what one monster on its map gives on average, weighted by spawn count), Potions per
  // level (potions drunk over the levels' worth of EXP, runs of BEST_MIN or more) and Maps visited
  const kill = { n: 0, skipped: 0, by: {} }, per = { used: 0, pct: 0 };
  let perBest = null, perWorst = null;
  const maps = {}, byDay = {}, drank = {}, top = (k, v, row, low) => { const b = L.best[k]; if (!b || (low ? v < b.v : v > b.v)) L.best[k] = { v, row }; };
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
      g.bought += p.bought || 0; g.spent += (p.bought || 0) * (p.price || 0);   // only what a run saw bought: the All time tab's receipt
      if (g === L.lemon) lemons += p.used; else if (g === L.meat) meat += p.used;
    }
    // per 1% only over the sessions that drank them, so a session on other potions doesn't thin it out
    if (lemons && pct > 0) L.lemon.pct += pct;
    if (meat && pct > 0) L.meat.pct += pct;
    if (r.mesos_earned != null) L.mesos = (L.mesos || 0) + r.mesos_earned;
    // a session with a result (its counted window, loot and all) adds that; an older one, mesos earned less its potions
    if (r.result != null) L.profit = (L.profit || 0) + r.result;
    else if (r.mesos_earned != null) L.profit = (L.profit || 0) + r.mesos_earned - cost;
    // a run saved with no map counts everywhere else, but it isn't a map
    if (r.map_id != null) { const m = maps[r.map_id] || (maps[r.map_id] = { id: r.map_id, mins: 0, exp: 0, expMins: 0 }); m.mins += mins; m.exp += exp; m.expMins += expMins; }
    if (expMins >= BEST_MIN) top('expHr', exp / (expMins / 60), r);
    if (mins > 0) top('longest', mins, r);
    if (lemons) top('lemons', lemons, r);
    if (lemons && r.map_id != null) drank[r.map_id] = (drank[r.map_id] || 0) + lemons;
    if (pct >= 0.3 && cost > 0) top('cheap1', cost / pct, r, true);   // the same 0.3% floor as the sessions list
    if (exp > 0) {
      const ms = r.map_id != null && o.maps && o.maps[r.map_id], spawns = ms ? ms.s : [];
      let cnt = 0, tot = 0;
      for (const [mob, c] of spawns) { const x = o.mobs && o.mobs[mob]; if (x && x[2] > 0) { cnt += c; tot += c * x[2]; } }
      if (cnt && tot) { const per1 = exp / (tot / cnt); kill.n += per1; for (const [mob, c] of spawns) { const x = o.mobs[mob]; if (x && x[2] > 0) kill.by[mob] = (kill.by[mob] || 0) + per1 * c / cnt; } }
      else kill.skipped++;
    }
    let used = 0; for (const p of r.potions || []) used += p.used || 0;
    if (mins >= BEST_MIN && pct > 0) {
      per.used += used; per.pct += pct;
      if (pct >= 0.3 && used > 0) { const v = used / (pct / 100); if (!perBest || v < perBest.v) perBest = { v, row: r }; if (!perWorst || v > perWorst.v) perWorst = { v, row: r }; }
    }
    const began = Date.parse(r.started_at), k = dayKey(began);
    if (L.first == null || began < L.first) L.first = began;
    byDay[k] = (byDay[k] || 0) + mins;
  }
  for (const g of [L.lemon, L.meat]) { g.per1 = g.pct ? g.used / g.pct : null; delete g.pct; }
  for (const id of Object.keys(drank)) if (!L.thirst || drank[id] > L.thirst.n) L.thirst = { id: +id, n: drank[id] };
  L.maps = Object.values(maps).map(m => Object.assign(m, { expHr: m.expMins ? m.exp / (m.expMins / 60) : null })).sort((a, b) => b.mins - a.mins);
  const killTop = Object.keys(kill.by).sort((a, b) => kill.by[b] - kill.by[a])[0];
  L.kills = { n: kill.n, skipped: kill.skipped, top: killTop != null ? { id: +killTop, n: kill.by[killTop] } : null };
  L.potionsPer = per.pct > 0 && perBest ? { n: per.used / (per.pct / 100), best: perBest, worst: perWorst } : null;
  const totMins = L.maps.reduce((a, m) => a + m.mins, 0);
  let newest = null;
  for (const r of rows) if (r.map_id != null) { const t = Date.parse(r.started_at); if (!newest || t > newest.t) newest = { id: r.map_id, t }; }
  L.visited = { n: L.maps.length, fav: L.maps[0] ? { id: L.maps[0].id, share: totMins ? L.maps[0].mins / totMins : 0 } : null, newest };
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

// one saved run as a row in Your runs: where and when, EXP an hour with its arrow against your usual at that map, Lemons and
// Meat (both Lemon ids count), mesos earned. edge: 'top' your best at the map, 'up' above your usual, 'down' below it, '' when
// there's no usual yet (3 other runs of 10 minutes or more), the run is too short, or it sits within 2% of the usual.
// o: { lemon, meat, fmtK, shortMap?, mapName? }
function runRow(r, rows, o) {
  const min = r.exp_min != null ? r.exp_min : r.active_min || 0;
  const expHr = min > 0 && r.exp > 0 ? r.exp / (min / 60) : null;
  const count = ids => (r.potions || []).reduce((a, p) => a + (ids.includes(+p.id) ? p.used || 0 : 0), 0);
  const stand = window.GrindSession.standing(rows, { mapId: r.map_id, exceptId: r.id, metric: 'expHr', value: min >= 10 ? expHr : null });
  const diff = stand.usual && stand.value != null ? stand.value / stand.usual - 1 : null;
  const vs = diff != null && Math.abs(diff) >= 0.02 ? { sign: diff > 0 ? '▲' : '▼', pct: Math.round(Math.abs(diff) * 100), text: (diff > 0 ? '▲ ' : '▼ ') + Math.round(Math.abs(diff) * 100) + '%' } : null;
  const edge = stand.usual == null || stand.value == null ? '' : stand.rank === 1 ? 'top' : vs ? (diff > 0 ? 'up' : 'down') : '';
  const ms = r.mesos_earned;
  return { edge, map: o.shortMap ? o.shortMap(r.map_id) : String(r.map_id), best: edge === 'top',
    when: dateOf(Date.parse(r.started_at)) + ' · ' + fmtDur(r.active_min || 0), expHr, vs,
    lemons: count(o.lemon), meat: count(o.meat), mesos: ms == null ? null : (ms >= 0 ? '+' : '−') + o.fmtK(Math.abs(ms)) };
}

// pixel icons are shared with the page (pixel-icons.js, loaded by index.html)
const { pixelSvg, RAIL_ICONS, railIcon, arrowed } = window.PixelIcons;

/* ---------- the tab ---------- */

function mount(root, deps) {
  const { el, store, api, data, pictures } = deps;
  // in the Windows app: Start finds the game itself (no browser picker), the overlay is a window of its own that opens with
  // the share, and quitting lets the last save go first. appOld: an app older than this page, which can't start
  const app = deps.app || null, appOld = !!app && !(app.v >= NEED_BRIDGE);
  const jget = (k, d) => { try { const v = store.get(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const jset = (k, v) => store.set(k, JSON.stringify(v));
  const prices = jget(KEY_PRICES, {});
  // This map: none until the game shows it or one is picked (Rimmah, 2026-11-09: it used to start on the last map, or Remains <Tomb> I).
  // A run carried on after a reload keeps its own
  let mapId = null;
  let session = null, viewing = null, editing = false, picturesReady = false;
  let lastHealth = null, lastRows = [], lifeAt = 0;   // the checks as last drawn, the saved sessions as last listed, when all time was drawn
  const open = jget(KEY_OPEN, null);
  if (open && open.tLast && Date.now() - open.tLast < RESUME_MS) { session = open; mapId = open.mapId || null; }   // carry on after a reload or a dropped share
  // per share: where the EXP line is, the measured stretch, and what each reader last saw
  const st = { line: null, m: null, fw: 0, fh: 0, reads: 0, ticks: 0, expMiss: 0, measureAt: 0, levelAt: 0, level: null, party: null, slots: {}, lastSave: 0,
    sharing: false, stopped: false, potNone: false, potCount: 0, h: null, recent: [] };
  // when each reader last worked and when its current run of misses began, for the checks on the card
  const fresh = () => ({ exp: { ok: null, fail: null }, level: { ok: null, fail: null }, size: { ok: null, fail: null }, counts: { ok: null, fail: null } });
  st.h = fresh();
  const mark = (k, good) => { const r = st.h[k], now = Date.now(); if (good) { r.ok = now; r.fail = null; } else if (r.fail == null) r.fail = now; };
  MS().load(pictures).then(() => { picturesReady = true; });

  const mobsOf = id => { const m = data.maps[id]; return m ? m.s.map(([mob, count]) => { const x = data.mobs[mob]; return { id: mob, name: x[0], level: x[1], exp: x[2], hp: x[3], undead: x[4], count }; }) : []; };
  const avgExp = id => { let n = 0, e = 0; for (const m of mobsOf(id)) { n += m.count; e += m.count * m.exp; } return n ? e / n : null; };
  const mapName = id => (data.maps[id] && data.maps[id].n) || 'Unknown map';
  const shortMap = id => mapName(id).replace(/^.*? : /, '');

  /* ----- layout: one column of Windows, the kit's: the status line, All time, the Now grinding card (the map's picker, the lantern, the
     buttons, the steps and this session on its band), Session details (folded away, since the pop out is the live view), then Your
     runs and Your record, every saved session added up ----- */
  // the status line and the pill are polite live regions: what they say reaches a screen reader without looking for it
  const status = el('p', { class: 'g-status', id: 'g-status', role: 'status' });
  const shareArea = el('div', { id: 'g-sharearea' });
  // the button row's wood signs: a pixel icon and the words
  const btn = (id, icon, label, onclick) => el('button', { type: 'button', id, class: 'k-btn', onclick }, el('i', { 'aria-hidden': 'true' }, railIcon(icon)), el('span', {}, label));
  // in the app the overlay opens with the share, so this only shows while it's closed during a session (showPop)
  const popBtn = btn('g-pop', 'pop', app ? 'Show the overlay' : 'Pop out over the game', () => popOut());
  // a fresh average from now on, to try another way of grinding; the session average keeps going
  const markBtn = btn('g-mark', 'reset', 'Reset average', () => resetAverage());
  // the quick reset: look for the bars, measure and name the potions again, keeping the session
  const refindBtn = btn('g-refind', 'find', 'Find my game again', () => refind());
  refindBtn.classList.add('sm');
  const newBtn = btn('g-new', 'plus', 'New session', () => newSession());
  // the next frame from the share comes down as a picture, to send when something reads wrong
  const snapBtn = btn('g-snap', 'frame', 'Save a frame', () => { st.wantSnap = true; setStatus('Saving the next frame from your game…'); });
  // the app's power button (an app built before its bridge had quit shows none); the shell saves first, as the tray's Quit does
  const quitBtn = app && typeof app.quit === 'function' ? btn('g-quit', 'power', 'Quit the app', () => Promise.resolve().then(() => app.quit()).catch(() => {})) : null;
  // the app's Settings window from the main window too (Rimmah, 2026-11-04: with clicks passing through, the way back to
  // the overlay's ⚙ was Alt+Tab), the overlay open or not; the site keeps Settings in its pop-out
  const setBtn = app ? btn('g-settings', 'gear', 'Settings', () => openSettings()) : null;
  // the app's version and what its own update check found (it checks each time it starts; the answer is kept a minute),
  // in small print under the buttons (Rimmah, 2026-11-04: not in the pop-out's Settings)
  const verLine = app ? el('p', { id: 'g-ver', class: 'g-note g-ver' }, 'Version ' + (app.version || '')) : null;
  if (verLine) new Promise(res => res(app.checkUpdate())).then(window.GrindSettings.updateLine, () => window.GrindSettings.updateLine(null))
    .then(t => { verLine.textContent = 'Version ' + (app.version || '') + ' · ' + t; });
  const CHECKS = [['exp', 'EXP line'], ['size', 'Game size'], ['level', 'Level'], ['potions', 'Potions'], ['mesos', 'Mesos']];
  // before a share the checks only list what will be read; Looking… starts with the share (startChecks)
  const check = el('ul', { class: 'g-check k-sr', id: 'g-check' }, CHECKS.map(([k, label]) => el('li', { 'data-k': k, class: 'idle' }, el('b', {}, label), el('span', {}))));
  const V = {};
  // a row of The numbers: the label with its small line, and the number on the right (a row's number keeps its V name)
  const row = (k, label, sub, attrs) => el('div', Object.assign({ class: 'k-row' }, attrs || {}), el('span', { class: 'g-nl' }, label, sub ? V[sub] = el('small', {}) : null), V[k] = el('span', { class: 'g-nv' }, '·'));
  // the lantern in Now grinding's title bar, with its words (a polite live region): lit while it reads, red when something's wrong, grey when not sharing
  V.pill = el('div', { class: 'k-lamp g-pill off idle', id: 'g-pill', role: 'status' }, V.pillText = el('span', {}, 'Not sharing yet'));
  const steps = el('ol', { class: 'g-steps' }, (app ? ['Open MapleStory', 'Press Start, it finds the game by itself', 'Open your inventory now and then for mesos']
    : ['Open MapleStory', 'Press Share and pick the MapleStory window', 'Grind. Open your inventory now and then for mesos']).map(t => el('li', {}, t)));
  // the one thing to do, only when something needs you
  const toStart = app ? 'Press Start to begin' : 'Share the game window to start';
  V.nudge = el('div', { class: 'g-nudge idle', id: 'g-nudge', hidden: '' }, toStart);
  // a check that matters is failing: its words and Find my game again at the end, in place of the old chips (the lantern goes red with it)
  V.problemText = el('span', {});
  V.problem = el('div', { class: 'g-problem', id: 'g-problem', hidden: '' }, V.problemText, refindBtn);
  // a big jump between peeks: a trade or a big buy isn't grinding, so it asks (a rise is likely loot sold to someone,
  // so Keep it comes first; a drop, something bought, so Leave it out does)
  V.tradeQ = el('span', {});
  V.tradeYes = el('button', { type: 'button', id: 'g-tradeyes', onclick: () => answerJump(true) }, 'Leave it out');
  V.tradeNo = el('button', { type: 'button', id: 'g-tradeno', onclick: () => answerJump(false) }, 'Keep it');
  V.trade = el('div', { class: 'g-nudge wait', id: 'g-trade', hidden: '' }, V.tradeQ, ' ', V.tradeYes, ' ', V.tradeNo);
  // The numbers: plain rows in two columns, in the order Rimmah reads them. The card keeps its id and its rows' V names, so the
  // numbers that move here are the same ones the card always drew
  V.tradeBox = el('div', { class: 'g-tradebox', id: 'g-tradebox' }, el('button', { type: 'button', class: 'linkish', id: 'g-tradebtn', onclick: () => openTrade() }, 'Leave out a trade'));
  V.mesos = el('p', { class: 'g-note', id: 'g-mesos' }, 'Mesos: not counted yet');
  V.perPotRow = row('perPot', 'Potions per 1%'); V.perPotL = V.perPotRow.firstChild;
  V.perPot2Row = row('perPot2', ''); V.perPot2Row.hidden = true; V.perPot2L = V.perPot2Row.firstChild;
  V.mesoRow = row('mesoBig', 'Mesos earned', 'mesoSub', { id: 'g-mesokpi' }); V.mesoBig.className = 'g-nv g-big';
  const card = el('div', { class: 'g-card', id: 'g-card' },
    row('expHr', 'EXP an hour', 'sub'), V.mesoRow,
    row('time', 'Time', 'timeSub'), row('gain', 'EXP gained'), row('kpm', 'Kills a minute'), row('pots', 'Potions used'),
    row('costHr', 'Potions an hour'), row('per1', 'Cost per 1%'), V.perPotRow, V.perPot2Row,
    row('paceV', 'Pace', 'pace'), row('level', 'Level', 'next'));
  V.expHr.id = 'g-exphr'; V.pace.id = 'g-pace'; V.sub.textContent = toStart;
  // the pop out over the game: one panel (in the site's theme) built here and moved into the pop out window, in one of four layouts that
  // ⇆ Layout flips (kept on the device). EXP an hour leads every one, with four little columns (Mesos, EXP gained, Per 1%, Lv
  // in), a small timer tile for each potion being drunk (one or two), a top strip, and the one thing to do under them, only
  // when it needs you. Hero (timers stacked on the right), Bar (one slim row), Column (down the side) and Corner (timers side
  // by side). Each layout has its own window size for one potion tile and for two
  const SP = {};
  const LAYOUTS = { hero: { 1: [720, 242], 2: [720, 242] }, bar: { 1: [1020, 80], 2: [1140, 80] }, column: { 1: [312, 504], 2: [312, 596] }, corner: { 1: [516, 313], 2: [516, 313] } };
  const ORDER = Object.keys(LAYOUTS);
  let layout = ORDER.includes(store.get(KEY_LAYOUT)) ? store.get(KEY_LAYOUT) : 'hero';
  // the app's own (the site's pop-out can't be see-through, so there both stay at 100%): See-through fades the panel's
  // background, never its text, pictures or buttons; Size scales the overlay window. Always on top and Clicks pass through
  // are the app's, read from it at the start and each time Settings opens (its tray can change Clicks pass through)
  const kept = (k, lo, hi, step, d) => { const v = Math.round(+store.get(k) / step) * step; return v >= lo && v <= hi ? v : d; };
  let see = app ? kept(KEY_SEE, 25, 100, 5, 100) : 100, scale = app ? kept(KEY_SCALE, 60, 160, 10, 100) : 100;
  const prefs = { onTop: true, pass: false };
  let prefsAt = 0;   // when the app was last asked for them
  // a little column: label over number, a small line under
  const kTile = (k, label) => (SP[k + 'Box'] = el('div', { class: 'g-k g-k-' + k }, SP[k + 'L'] = el('div', { class: 'g-kl' }, label), SP[k] = el('div', { class: 'g-kn' }, '·'), SP[k + 'Sub'] = el('div', { class: 'g-ks' })));
  // Per 1%'s number is a potion's picture and how many go down, for one potion or two, and one potion's against your usual
  const perPart = () => { const P = {}; P.box = el('span', { class: 'g-perp' }, P.img = el('img', { alt: '', hidden: '' }), P.n = el('span', {}, '·')); return P; };
  SP.perN = [perPart(), perPart()];
  SP.perN[1].box.hidden = true;
  const perTile = () => { const t = kTile('per', 'Per 1%'); t.replaceChild(el('div', { class: 'g-kn g-ppr' }, SP.perN[0].box, SP.perN[1].box, SP.perUs = el('span', { class: 'g-us', hidden: '' })), SP.per); return t; };
  // a potion tile: a little glass that drains with the potion's picture in it, beside its clock, how many went down and
  // what's left, and a caption under them
  const potTile = () => {
    const P = {};
    P.box = el('div', { class: 'g-pot none' },
      el('div', { class: 'g-vial' }, P.juice = el('div', { class: 'g-juice', hidden: '' }), P.img = el('img', { alt: '', hidden: '' })),
      el('div', { class: 'g-pwords' }, P.clock = el('span', { class: 'g-pclock' }, '··:··'),
        P.left = el('div', { class: 'g-pleft', hidden: '' }, P.n = el('b', {}), P.verb = el('span', {}), P.lf = el('span', { class: 'g-plf' })),
        P.cap = el('div', { class: 'g-pcap' })));
    return P;
  };
  SP.pots = [potTile(), potTile()];
  // ⇆ Layout (Rimmah, 2026-11-04: pick one, not flip through): hovering it shows the four layouts as pictures with their
  // names, the one showing lit; a click on ⇆ shows them too (touch, keys). It opens a moment after the mouse arrives, so
  // passing over ⇆ on the way to ⚙ doesn't flash it, and shuts a moment after the mouse leaves, so the way over to the
  // pictures keeps it. While clicks pass through to the game it stays out of sight until the mouse on ⇆ holds them (the
  // CSS, g-pass and g-hold)
  const layName = l => l.charAt(0).toUpperCase() + l.slice(1);
  SP.lay = el('button', { type: 'button', class: 'g-lay k-sq', title: 'Layout', 'aria-label': 'Layout', 'aria-haspopup': 'true', 'aria-expanded': 'false', onclick: () => layRow(true) }, railIcon('swap'));
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
  // EXP an hour's switch: 5m, 10m, the run, and since Reset average once there is one
  const segBtn = (w, ...kids) => el('button', { type: 'button', 'data-w': w, 'aria-pressed': 'false', onclick: () => pickWindow(w) }, ...kids);
  SP.segs = [segBtn('5', '5m'), segBtn('10', '10m'), segBtn('run', 'run'), segBtn('since', el('span', { class: 'g-sw' }, 'since '), SP.sinceAt = el('span', {}))];
  SP.segs[3].hidden = true;
  const strip = el('div', { class: 'g-strip', id: 'g-strip', 'data-layout': layout, 'data-pots': '1', hidden: '' },
    el('div', { class: 'g-top' },
      // the light: is it ready, in a colour and two or three words (green reading, amber it wants something, red paused,
      // grey not running), with the bag's three tabs ticking off beside it during a flip
      SP.lamp = el('span', { class: 'g-lamp idle', role: 'status' }, el('i', { class: 'g-dot', 'aria-hidden': 'true' }),
        el('span', { class: 'g-lw' }, SP.lampT = el('span', { class: 'g-lt' }), SP.lampF = el('span', { class: 'g-flip', hidden: '' }))),
      el('span', { class: 'g-brand' }, 'Six Path Crossway'),
      el('span', { class: 'g-el' }, SP.elMap = el('span', { class: 'g-elm' }), SP.elTime = el('span', { class: 'g-elt' })),
      el('span', { class: 'g-btns' },
        layWrap,
        el('button', { type: 'button', class: 'g-reset k-sq', title: 'Reset average', 'aria-label': 'Reset average', onclick: () => resetAverage() }, railIcon('reset')),
        SP.rep = deps.report ? el('button', { type: 'button', class: 'g-rep k-sq', title: 'Grind feeling wonky?', 'aria-label': 'Grind feeling wonky?', 'aria-pressed': 'false', onclick: () => toggleReport() }, railIcon('flag')) : null,
        SP.gear = el('button', { type: 'button', class: 'g-gear k-sq', title: 'Settings', 'aria-label': 'Settings', 'aria-pressed': 'false', onclick: () => toggleSettings() }, railIcon('gear')),
        // the app's overlay has no frame: ✕ closes just it and brings the main window up, the session goes on (Show the
        // overlay brings it back). The site's pop-out has the browser's own ✕
        app ? el('button', { type: 'button', class: 'g-close k-sq', title: 'Back to the main window', 'aria-label': 'Back to the main window', onclick: () => backToMain() }, railIcon('close')) : null)),
    el('div', { class: 'g-body' },
      el('div', { class: 'g-k-exp' },
        el('div', { class: 'g-kh' }, el('span', { class: 'g-kl' }, 'EXP an hour'), SP.seg = el('span', { class: 'g-seg', role: 'group', 'aria-label': 'EXP an hour over' }, SP.segs)),
        el('div', { class: 'g-kv' }, SP.exp = el('span', { class: 'g-kn' }, '·'),
          SP.expUs = el('span', { class: 'g-us', hidden: '' }, SP.expUn = el('span', {}), SP.expUw = el('span', { class: 'g-uw' })), SP.expD = el('span', { class: 'g-d' }))),
      SP.grid = el('div', { class: 'g-grid' }, kTile('meso', 'Mesos'), kTile('gain', 'EXP gained'), perTile(), kTile('pace', 'Pace'), kTile('lv', 'Lv in')),
      SP.tilesBox = el('div', { class: 'g-tiles' }, SP.pots[0].box, SP.quip = el('div', { class: 'g-quip', hidden: '' }, SP.quipB = el('b', {}), SP.quipS = el('span', {})))),
    SP.l3 = el('div', { class: 'g-l3 g-alert', hidden: '' }),
    // ornaments: grass along the frame's top edge and a mushroom in the bottom right corner, art that takes no clicks (the CSS places them)
    el('span', { class: 'g-orn g-grass', 'aria-hidden': 'true' }), el('span', { class: 'g-orn g-shroom', 'aria-hidden': 'true' }));
  const potCount = () => +strip.dataset.pots || 1;
  // the window the panel lives in; on the site a window dragged to a new size keeps that size for the layout and tile
  // count it showed when it was dragged (the app's overlay can't be dragged: the page alone sizes it). The app's overlay
  // and Settings are windows of their own, titled as the app's windows are
  const overlay = window.GrindOverlay.create({ strip, home: root, app, title: app ? 'Six Path EXP Tracker overlay' : 'Grind', setTitle: 'Six Path EXP Tracker settings', hide: () => [SP.l3, strip.dataset.layout === 'column' && SP.lamp],
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
  const viewBar = el('div', { class: 'g-viewing', hidden: '' }, V.viewing = el('span', {}), el('button', { type: 'button', class: 'k-btn sm', onclick: () => { viewing = null; render(); } }, 'Back to live'),
    V.del = el('span', {}));
  // a saved session with bad numbers can go: Delete, then Yes (from the account, and from this device)
  const delButton = () => el('button', { type: 'button', id: 'g-del', class: 'k-btn sm', onclick: () => V.del.replaceChildren('Delete this session for good? ',
    el('button', { type: 'button', id: 'g-delyes', class: 'k-btn sm', onclick: () => deleteViewed() }, 'Yes, delete'), ' ', el('button', { type: 'button', class: 'k-btn sm', onclick: () => V.del.replaceChildren(delButton()) }, 'No')) }, 'Delete');
  V.del.append(delButton());
  function deleteViewed() {
    const id = viewing && viewing.id;
    if (!id) return;
    // its save can't bring it back: one waiting its turn goes, and one on its way right now is deleted again when it lands (send)
    waiting.delete(id);
    if (sending && sending.id === id) landsDeleted.add(id);
    if (!waiting.size) { failNote = null; clearTimeout(nextT); nextT = null; }
    const gone = () => { jset(KEY_LOCAL, jget(KEY_LOCAL, []).filter(r => r.id !== id)); viewing = null; V.del.replaceChildren(delButton()); render(); listSessions(); setStatus('Deleted that session.'); };
    (signedIn() ? api.deleteGrind(id) : Promise.resolve()).then(gone, e => { landsDeleted.delete(id); setStatus("Couldn't delete it (" + e.message + ').'); });
  }
  // Count my loot: one switch (remembered on this device), the bag's three tabs as checks under it while it's on, and
  // the session's result card at the top of Session details in both modes (the loot list only when it's on)
  // lootIdx and lootImg: the item pictures' sheet (the card's lists show them whatever the switch says); lootReady: the reader
  // has them too, so a flip through the bag counts
  let lootOn = store.get(KEY_LOOT) === '1', lootIdx = null, lootImg = null, sheetLoad = null, lootLoad = null, lootReady = false;
  const lootWords = el('span', {}, 'Count my loot: ' + (lootOn ? 'on' : 'off'));
  const lootBtn = el('button', { type: 'button', id: 'g-loot', class: 'k-btn', 'aria-pressed': String(lootOn), onclick: () => setLoot(!lootOn) }, el('i', { 'aria-hidden': 'true' }, railIcon('book')), lootWords);
  const bagCheck = el('ul', { class: 'g-check g-bagcheck', id: 'g-bagcheck', hidden: '' }, ['Equip', 'Use', 'Etc'].map(t => el('li', { 'data-k': 'bag-' + t }, el('b', {}, t), el('span', {}, 'Open it in your bag'))));
  // What it earned (V.res), a Window: the session's total as the lead number with Profitable or Losing and the hourly number under it, the
  // plain rows it adds up from, and with Count my loot on What you picked up beside them. The kept lines are small print under both
  V.res = el('section', { class: 'k-win g-res', id: 'g-res', hidden: '' },
    el('div', { class: 'k-bar' }, el('h2', {}, 'What it earned'), V.resBar = el('small', {})),
    el('div', { class: 'k-pad g-res-pad' },
      el('div', { class: 'g-res-grid' },
        el('div', { class: 'g-res-left' },
          el('div', { class: 'k-card g-res-lead' }, V.resTotal = el('span', { class: 'g-res-total', id: 'g-res-total' }, '·'),
            el('div', { class: 'g-res-side' }, V.resPill = el('span', { class: 'g-res-pill' }), V.resHr = el('span', { class: 'g-res-hr', id: 'g-res-hr' }, '·'))),
          V.resSub = el('p', { class: 'g-note g-res-sub', id: 'g-res-sub' }),
          V.resRows = el('div', { class: 'k-rows g-res-rows', id: 'g-res-rows' }),
          V.resNudge = el('div', { class: 'g-res-nudge', id: 'g-res-nudge' }, el('span', {}, "Your loot isn't counted, so this only shows mesos."),
            el('button', { type: 'button', class: 'k-btn sm', onclick: () => setLoot(true) }, 'Count my loot next time'))),
        V.resLoot = el('div', { class: 'g-res-loot', id: 'g-res-loot' })),
      el('div', { class: 'g-res-small' }, V.resLines = el('div', { class: 'g-res-lines', id: 'g-res-lines' }), V.resOther = el('p', { class: 'g-note' }),
        el('p', { class: 'g-note' }, 'Count my loot reads your bag when you flip through Equip, Use and Etc: the first full look and the latest one, at what an NPC pays (the market may pay more later). ' +
          'Without it, selling loot from an earlier session counts as earned. Items you use, wear, drop or hand over count as loot going down.'))));
  function setLoot(on) {
    lootOn = on; store.set(KEY_LOOT, on ? '1' : '');
    lootBtn.setAttribute('aria-pressed', String(on)); lootWords.textContent = 'Count my loot: ' + (on ? 'on' : 'off'); bagCheck.hidden = !on;
    if (session) session.mode = on ? 'loot' : 'track';
    if (on) loadLoot();
    render();
  }
  // the item pictures, once (about 900 KB), after the page is up: one that fails can be asked for again
  function loadSheet() {
    if (sheetLoad) return sheetLoad;
    const pic = new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'data/loot-icons.png'; });
    sheetLoad = Promise.all([fetch('data/loot-icons.json').then(r => r.json()), pic]).then(([L, im]) => { lootIdx = L; lootImg = im; render(); });
    sheetLoad.catch(() => { sheetLoad = null; });
    return sheetLoad;
  }
  // the reader learns them the first time the switch is on
  function loadLoot() {
    if (lootLoad) return lootLoad;
    lootLoad = loadSheet().then(() => { MS().loadLoot(lootImg, lootIdx); lootReady = true; render(); },
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
  // the maps, one optgroup for each region (the names come off the options, so the list sorts by what it shows); the two short
  // names that two maps share keep their region on the closed pick
  const shortCount = {};
  for (const id of Object.keys(data.maps)) shortCount[shortMap(id)] = (shortCount[shortMap(id)] || 0) + 1;
  const regions = new Map();
  for (const id of Object.keys(data.maps)) {
    const n = mapName(id), reg = / : /.test(n) ? n.replace(/ : .*$/, '') : 'Other';
    if (!regions.has(reg)) regions.set(reg, []);
    regions.get(reg).push([shortCount[shortMap(id)] > 1 ? n : shortMap(id), id]);
  }
  // the blank first option is the pick before a map is known: it shows as nothing and can't be picked from the list
  const mapSel = el('select', { id: 'g-map', 'aria-label': 'Map', onchange: () => setMap(mapSel.value) },
    el('option', { value: '', hidden: '', disabled: '' }, ''),
    [...regions.entries()].sort((x, y) => x[0].localeCompare(y[0])).map(([reg, list]) =>
      el('optgroup', { label: reg }, list.sort((x, y) => x[0].localeCompare(y[0])).map(([text, id]) => el('option', { value: id }, text)))));
  mapSel.value = mapId ? String(mapId) : '';
  // the map's name is the picker: the select in words, with a dotted underline and a pixel arrow (the class pick is the same under the drops)
  const pickWords = (sel, words, cls) => {
    const t = el('span', { class: 'g-pickt' }), wrap = el('span', { class: 'g-pickw ' + (cls || '') }, t, sel);
    wrap.sync = () => { const w = words(sel); if (t.textContent !== w) t.textContent = w; };
    sel.addEventListener('change', wrap.sync);
    wrap.sync();
    return wrap;
  };
  const mapPick = pickWords(mapSel, sel => (sel.selectedOptions[0] || {}).text || '');
  // This map, picked here or read off the minimap (Settings has none since 2026-11-04), given to the running session. Not kept on the
  // device: the next visit starts blank again
  function putMap(id) { mapId = +id; mapSel.value = String(mapId); mapPick.sync(); st.mapHere = mapId; showMap(); }
  function setMap(id) { putMap(id); if (session) GS().pickMap(session, mapId); render(); }
  // Your class, for the card's For you row: a small pick under the map's, filled when the drops arrive. Kept on the device once
  // picked; until then it follows the Builds tab's class (the app has no Builds tab in its storage, so there it starts unset)
  let classId = '';
  const classSel = el('select', { id: 'g-class', 'aria-label': 'Your class', hidden: '', onchange: () => { classId = classSel.value; store.set(KEY_CLASS, classId); render(); } });
  const classPick = pickWords(classSel, sel => { const o = sel.selectedOptions[0]; return o ? (sel.value ? 'For you: ' : '') + o.text : ''; }, 'g-classpick');
  classPick.hidden = true;
  function fillClass(D) {
    classSel.replaceChildren(el('option', { value: '' }, 'Pick your class to see gear for you'), ...D.classes.map(c => el('option', { value: c.id }, c.name)));
    const kept = store.get(KEY_CLASS), calc = jget('bt.calc', null), start = kept != null ? kept : calc && calc.cls;
    classId = D.classes.some(c => c.id === start) ? start : '';
    classSel.value = classId; classSel.hidden = false; classPick.hidden = false; classPick.sync();
  }
  // ⚙ Settings (grind-settings.js): one panel under the strip inside the pop-out (in the app, a window of its own beside
  // the overlay, with the app's rows), built the first time it opens. Its Count my loot is the Now grinding card's own
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
      onProfile: () => openProfile(), links: { builds: siteLink('#builds') }, onClose: () => closeSettings(),
      onSee: v => setSee(v), onSize: v => setScale(v), onTop: on => setPref('onTop', 'setOnTop', on), onPass: on => setPref('pass', 'setClickThrough', on) });
    readPrefs();   // the app's tray may have changed Clicks pass through since
    settings.update(settingsState());   // before it's measured: who is signed in changes its height
    if (overlay.showSettings(settings.el)) SP.gear.setAttribute('aria-pressed', 'true');
  }
  function closeSettings() { overlay.hideSettings(); SP.gear.setAttribute('aria-pressed', 'false'); if (SP.rep) SP.rep.setAttribute('aria-pressed', 'false'); reportOpen = false; }
  function toggleSettings() { if (overlay.settingsOpen() && !reportOpen) closeSettings(); else { if (reportOpen) closeSettings(); openSettings(); } }
  // The flag on the pop out: a small form in Settings' place (the pop out grows to hold it), so a report goes from the pop out itself
  // while the game is in front. The pictures are taken at the press, before the form is on screen
  let reportOpen = false, reporting = false;
  function toggleReport() {
    if (reportOpen) { closeSettings(); return; }
    if (reporting || !deps.report || !overlay.win()) return;
    if (overlay.settingsOpen()) closeSettings();
    reporting = true;
    Promise.resolve(deps.report(() => closeSettings(), sent => { if (sent) setStatus('Sent, thanks!'); })).then(f => {
      if (!f || !overlay.showSettings(f.el)) return;
      reportOpen = true; SP.rep.setAttribute('aria-pressed', 'true'); f.focus();
    }).catch(() => {}).then(() => { reporting = false; });
  }
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
    (alltime.el.hidden ? nowCard.el : alltime.el).scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  const mapNote = el('p', { class: 'g-note' });
  let mapMobs = [], drops = null, mobSprites = null;   // the map's monsters, most numerous first; the card's data files, once they arrive   // the card's data files, once they arrive
  const sessions = el('div', { class: 'g-runs-list', id: 'g-sessions' });
  // Your runs shows the newest 5; show more opens the rest (kept here, not in the page, since saving redraws the list)
  let runsOpen = false;
  const runsMore = el('button', { type: 'button', id: 'g-runsmore', class: 'linkish g-runsmore', hidden: '', onclick: () => { runsOpen = !runsOpen; listRuns(); } });
  // the whole session, a strip in This run: one cell a minute (60 to a row, a row an hour), the hover tip names the minute
  const tip = el('div', { id: 'g-tip', class: 'g-tip', hidden: '' });
  const wholeRowsBox = el('div', { class: 'g-wrows' });
  const whole = el('div', { class: 'g-whole', id: 'g-whole' }, el('div', { class: 'g-wh' }, 'The whole session'), wholeRowsBox, tip);
  const partyCompare = el('p', { class: 'g-note', id: 'g-party-compare' });
  whole.addEventListener('pointerover', e => showTip(e));
  whole.addEventListener('pointermove', e => showTip(e));
  whole.addEventListener('pointerleave', () => { tip.hidden = true; });
  // the share started: every check not read yet is looked for now (one already read keeps what it read)
  function startChecks() {
    for (const [k] of CHECKS) if (check.querySelector('[data-k="' + k + '"]').classList.contains('idle')) setCheck(k, '', 'Looking…');
    if (!session) { detailOpen = true; showDetail(); }   // Session details opens with the share, showing only Notices until a session starts
  }
  // this session on the Now grinding card's band, and its details (the session's card, the potions with their prices, the
  // charts) folded away until asked for (kept on the device); a saved session opened from the list always shows them
  V.now = el('div', { class: 'g-nowv' });
  let detailOpen = store.get(KEY_DETAIL) === '1';
  const moreWords = el('span', {}, 'Session details');
  const moreBtn = el('button', { type: 'button', id: 'g-more', class: 'k-btn push', 'aria-controls': 'g-detail', onclick: () => { detailOpen = !detailOpen; store.set(KEY_DETAIL, detailOpen ? '1' : ''); showDetail(); } }, el('i', { 'aria-hidden': 'true' }, railIcon('find')), moreWords);
  // the session card (grind-card.js): where this run ranks among your own at the map. Its pictures are looked up when it draws
  const sCard = window.GrindCard.build({ el, whole, pics: { get lemon() { return picOf(LEMON_IDS) || null; }, get meat() { return picOf(MEAT_IDS) || null; } } });
  // Notices (live only): a time stamped log, newest first, three rows and Show all N; Save a frame sits in its foot. A row is added when a
  // check changes state (found, lost, found again), never on every read (noteOf, called from setCheck). It lasts the session (New session clears it) and isn't saved
  const NOTES_SHOWN = 3, NOTES_KEPT = 200;
  let notesOpen = false;
  st.notes = []; st.noted = {};
  V.noteRows = el('div', { class: 'k-rows g-notes', id: 'g-noterows' });
  V.noteAll = el('button', { type: 'button', id: 'g-noteall', class: 'linkish', hidden: '', onclick: () => { notesOpen = !notesOpen; renderNotices(); } });
  const notices = el('section', { class: 'k-win g-win g-notices', id: 'g-notices', hidden: '' }, el('div', { class: 'k-bar' }, el('h2', {}, 'Notices')),
    el('div', { class: 'k-pad g-notepad' }, V.noteRows, el('div', { class: 'g-notefoot' }, V.noteAll, snapBtn)));
  // Potions: the table as it was, with its price boxes
  const potWin = el('section', { class: 'k-win g-win g-potwin', id: 'g-potwin', hidden: '' }, el('div', { class: 'k-bar' }, el('h2', {}, 'Potions')),
    el('div', { class: 'k-pad g-potpad' }, el('div', { class: 'g-scroll' }, pots), el('p', { class: 'g-note' }, 'A potion only counts if it sits on a quickslot.')));
  // The numbers: the card's rows in a Window of their own, with the lines that explain them in its foot
  const numbers = el('section', { class: 'k-win g-win', id: 'g-numbers', hidden: '' }, el('div', { class: 'k-bar' }, el('h2', {}, 'The numbers')),
    el('div', { class: 'k-pad g-numpad' }, card, V.numFoot = el('div', { class: 'g-numfoot' }, V.mesos, mapNote, partyCompare, V.tradeBox)));
  const duo = el('div', { class: 'g-duo', id: 'g-duo' }, potWin, notices);
  const detail = el('div', { class: 'g-detail', id: 'g-detail', hidden: '' }, viewBar, sCard.el, V.res, numbers, duo);
  // Session details opens when the game is shared, even before a session starts (then only Notices, so a player whose game isn't being
  // found can read why), and a saved run always shows it. With nothing to show the block takes no room
  function showDetail() {
    const open = (detailOpen || !!viewing) && (!!session || !!viewing || st.sharing);
    detail.hidden = !open;
    moreBtn.setAttribute('aria-expanded', String(open)); moreWords.textContent = open ? 'Hide details' : 'Session details';
    const s = viewing || session;
    numbers.hidden = potWin.hidden = !s;
    notices.hidden = !!viewing || !(st.sharing || st.notes.length);
    duo.hidden = potWin.hidden && notices.hidden;
  }
  // the button row of the Now grinding window, left to right (Session details is pushed to the right end). Share and Stop come from the
  // reader (shareArea); Find my game again lives on the problem line, and the version line at the page's foot
  const tools = el('div', { class: 'k-tools', id: 'g-tools' }, shareArea, popBtn, markBtn, newBtn, lootBtn, setBtn, quitBtn, moreBtn);
  // Now grinding (grind-now.js): the window with the map's pick and the lantern in its title bar, the numbers line, the buttons, the
  // lines that need you, then the map's monsters, the best drops there and what you picked up
  const nowCard = window.GrindNow.build({ el, band: V.now, tools, lamp: V.pill, mapPick, classPick, steps, lines: [V.problem, V.nudge, V.trade, bagCheck, check], mobName: id => (data.mobs[id] || [''])[0],
    pics: { item: id => lootIdx && lootIdx.items[id] ? cellPic(lootIdx.items[id][3]) : null } });
  // all time: Lemons and Meat first (by the client's own pictures), then the totals, the maps, personal bests and the days
  const LEMON_IDS = Object.keys(data.potions).filter(id => data.potions[id][0] === 'Lemon').map(Number);
  const MEAT_IDS = Object.keys(data.potions).filter(id => data.potions[id][0] === 'Meat').map(Number);
  const picOf = ids => pictures.Icons[ids.find(id => pictures.Icons[id])];
  const LF = {};
  // the session's Lemon and Meat tiles count both Lemon ids, and Meat's HP comes from the game's data
  const eatCfg = () => ({ lemon: LEMON_IDS, meat: MEAT_IDS, meatHp: (data.potions[MEAT_IDS[0]] || [])[2] || 0 });
  // a session carried on after a reload follows the switch as it is now
  if (session) { if (!session.eat) session.eat = eatCfg(); session.mode = lootOn ? 'loot' : 'track'; }
  bagCheck.hidden = !lootOn;
  if (lootOn) loadLoot();
  // All time (grind-alltime.js): Lemons and Meat in a window of their own at the top, shown once something has been eaten; the rest of it is
  // Your runs and Your record, further down
  const alltime = window.GrindAllTime.build({ el, store, pics: { lemon: picOf(LEMON_IDS), meat: picOf(MEAT_IDS) }, mapName: id => shortMap(id), mobName: id => (data.mobs[id] || ['a monster'])[0] });
  // Your runs, then Your record: two Windows. Runs are rows (five, then show more); the record is the five totals in a band, the most
  // trained maps as rows with their hours, Personal bests, then the days
  const runsWin = el('section', { class: 'k-win g-win', id: 'g-runs', hidden: '' }, el('div', { class: 'k-bar' }, el('h2', {}, 'Your runs')),
    el('div', { class: 'k-pad g-runpad' }, sessions, runsMore));
  const record = el('section', { class: 'k-win g-win', id: 'g-record', hidden: '' }, el('div', { class: 'k-bar' }, el('h2', {}, 'Your record')),
    el('div', { class: 'k-pad g-recpad' },
      LF.other = el('p', { class: 'g-note' }),
      LF.tots = el('div', { class: 'g-tots' }),
      el('div', { class: 'g-lgrid' },
        el('div', { class: 'g-lcard' }, el('h3', {}, 'Most trained maps'), LF.maps = el('div', { class: 'k-rows', id: 'g-maps' })),
        el('div', { class: 'g-lcard' }, el('h3', {}, 'Personal bests'), LF.bests = el('div', { class: 'k-rows g-bests', id: 'g-bests' }))),
      el('div', { class: 'g-lcard' }, el('h3', {}, 'Days you grinded'), LF.days = el('div', { class: 'g-days', id: 'g-days' }), LF.daysNote = el('p', { class: 'g-note' }))));
  const life = el('div', { class: 'g-life', id: 'g-life' }, runsWin, record);
  // one column of windows (spec Part 3): the status line, All time, Now grinding, Session details when open, then Your runs and Your
  // record, and the small print
  root.replaceChildren(el('div', { class: 'k-col g-col' }, status, alltime.el, nowCard.el, detail, life,
    el('div', { class: 'g-print' }, el('p', { class: 'g-note' }, 'Item and UI pictures are from MapleStory, which belongs to Nexon.'), verLine)), strip);

  const setStatus = msg => { status.textContent = msg; };
  function setCheck(k, state, text) {
    const li = check.querySelector('[data-k="' + k + '"]');
    li.className = state === 'done' || state === 'fix' || state === 'idle' ? state : '';
    li.lastChild.textContent = text;
    noteOf(k, state, noteText(k, state, text));
  }
  // Notices: a row when a check changes state (found, lost, found again), never on every read. Waiting ('Looking…') only counts as a row
  // when it follows a found or a trouble, which is a check lost. A yellow square marks trouble, green the rest
  // a found check reads as what it found (Level 47), the others as their name and what it says
  const NOTE_LEAD = { exp: 'EXP line: ', size: 'Game size: ', level: '', potions: '', mesos: 'Mesos: ' };
  const NOTE_NAME = Object.fromEntries(CHECKS);
  const noteText = (k, state, text) => state === 'done' ? NOTE_LEAD[k] + text.replace(/ at \d{1,2}:\d\d\s?[AP]M$/i, '') : text.toLowerCase().includes(NOTE_NAME[k].toLowerCase()) ? text : NOTE_NAME[k] + ': ' + text;
  function noteOf(k, state, text, t) {
    const was = st.noted[k];
    if (state === was) return;
    st.noted[k] = state;
    const good = state === 'done', lost = !good && (was === 'done' || was === 'fix');
    if (!good && state !== 'fix' && !lost) return;
    // a check that is trouble, or was found and is waiting again (lost), gets the yellow square; only a found check is green
    st.notes.unshift({ t: t == null ? Date.now() : t, kind: good ? 'ok' : 'bad', text });
    if (st.notes.length > NOTES_KEPT) st.notes.length = NOTES_KEPT;   // the newest stay
    renderNotices();
  }
  function renderNotices() {
    const all = st.notes, shown = notesOpen ? all : all.slice(0, NOTES_SHOWN);
    V.noteRows.replaceChildren(...(shown.length ? shown.map(n => el('div', { class: 'k-row row' }, el('span', { class: 'g-nt' }, timeOfDay(n.t)), el('i', { class: 'g-sq ' + n.kind, 'aria-hidden': 'true' }), el('span', { class: 'g-ntx' }, n.text)))
      : [el('p', { class: 'g-note' }, 'Nothing to report yet.')]));
    V.noteAll.hidden = all.length <= NOTES_SHOWN;
    V.noteAll.textContent = notesOpen ? 'Show fewer' : 'Show all ' + all.length;
    V.noteAll.setAttribute('aria-expanded', String(notesOpen));
    showDetail();
  }

  /* ----- the pickup lines (behind window.BT_PICKUPS) ----- */
  // The strip above the quickslots is cropped from the frame already in hand every tick (lines last a few seconds, so a read
  // every 1.4 s would miss some), fed to the tracker, and each new line is read: an item line for its tab and count (its name
  // stays unread for now), a mesos line for its amount. Display only: GrindSession keeps them beside the bag, never in the money
  const PICKUPS = window.BT_PICKUPS === true && !!window.PickupLines;
  let pickTracker = null, pickCv = null, pickKey = '';
  // the gap between the frames the tab reads: a median over 1.5 s (half a line's life) means lines can slip by unseen
  const frameGaps = []; let lastFrameT = 0;
  function noteFrame(now) {
    if (lastFrameT) { frameGaps.push(now - lastFrameT); if (frameGaps.length > 20) frameGaps.shift(); }
    lastFrameT = now;
    st.pickupSlow = frameGaps.length >= 10 && frameGaps.slice().sort((a, b) => a - b)[frameGaps.length >> 1] > 1500;
  }
  function readPickups(src, info) {
    if (PICKUPS) noteFrame(Date.now());
    if (!PICKUPS || !session || !lootOn) return;
    const PL = window.PickupLines, now = Date.now(), a = PL.stripArea(info.w, info.h);
    // a new window size starts the tracker over (the strip sits by the frame's size alone, so no HUD measurement is needed)
    const key = info.w + 'x' + info.h;
    if (!pickTracker || key !== pickKey) { pickTracker = PL.createTracker(); pickKey = key; }
    if (!st.pickStart) st.pickStart = now;
    if (!pickCv) pickCv = document.createElement('canvas');
    pickCv.width = a.w; pickCv.height = a.h;
    const g = pickCv.getContext('2d', { willReadFrequently: true });
    g.drawImage(src, a.x, a.y, a.w, a.h, 0, 0, a.w, a.h);
    const id = g.getImageData(0, 0, a.w, a.h), img = { w: id.width, h: id.height, data: id.data }, rows = PL.rowsOf(img), born = pickTracker.feed(rows, now).births;
    if (!born.length) return;
    st.lineT = now;
    const items = [], mesos = [];
    for (const i of born) {
      if (rows[i] === 'I') { const r = PL.readItem(img, i); items.push({ tab: r.tab, qty: r.qty, name: null }); }
      else if (rows[i] === 'M') mesos.push(PL.readMesos(img, i).amount);
    }
    GS().add(session, { t: now, pickup: { items, mesos, lines: items.length + mesos.length } });
  }

  /* ----- one frame from the share ----- */
  // The share ticks every 0.5 s. A full read (EXP, level, potions, mesos) runs when 1.4 s have passed since the last one;
  // the ticks between only look at the bag and the shop while they're open, at the spots they were seen, so a page of the
  // bag shown for a second (Rimmah flips that fast) still reads twice and counts
  function frame(src, info) {
    if (!picturesReady) return;
    readPickups(src, info);
    if (!st.mapsAsked) { st.mapsAsked = true; loadMaps(); }
    const since = st.lastFull ? Date.now() - st.lastFull : Infinity;   // a clock set back (a replay) reads in full
    if (since >= 0 && since < 1400) {
      // a bag missed a moment ago (a tooltip over its mesos) is still looked for at every tick: a page shown for a
      // second right after can come and go between two full reads
      const bagNear = st.mesoOpen || Date.now() - (st.mesoSeen || -Infinity) < BAG_NEAR_MS;
      if (session && info.w === st.fw && info.h === st.fh && ((lootOn && lootReady && bagNear) || st.shopOpen)) quick(src);
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
      if (!st.line) {
        if (!st.probeAt || Date.now() - st.probeAt > 15000) { st.probeAt = Date.now(); try { st.probe = S.greenProbe(src, w, h); } catch (e) { st.probe = null; } }   // for a report: why no bar
        mark('exp', false); setCheck('exp', 'fix', 'Make sure the bar at the bottom of the game is showing'); render(); return; }
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
      if (++st.expMiss >= 20) { st.line = null; st.m = null; st.expMiss = 0; render(); return; }
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
    guard('the map', () => followMap(src, S, h));
    const reading = { t: Date.now(), exp: exp.ok ? exp.exp : null, pct: exp.ok ? exp.pct : null, level: null, counts: [], party: null, map: st.mapHere };
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
          known.v = c.value; known.x = c.x; known.y = c.y;
          const pot = known.id ? data.potions[known.id] : null;
          reading.counts.push({ key: c.key, id: known.id, name: pot ? pot[0] : 'Unknown item', price: known.id && prices[known.id] != null ? prices[known.id] : (pot ? pot[1] : 0), value: c.value });
        }
        // a slot seen before whose count isn't read this time: is its picture still there? (a lone 1 over a bright icon can go
        // unread for a long while, and a count of 3 or less that stays unread is booked as ran out)
        const got = new Set(reading.counts.map(c => c.key));
        for (const [key, k] of Object.entries(st.slots)) {
          if (got.has(key) || !k.id || !k.x) continue;
          const ic = S.readIcon(src, { x: k.x, y: k.y }, st.m);
          if (ic.diff < 75 && +ic.id === k.id) (reading.held = reading.held || []).push(key);
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
      if (reading.exp != null) { if (st.prevExp != null && reading.exp !== st.prevExp) st.movedT = reading.t; st.prevExp = reading.exp; }
      // once the EXP number has named the level, that's the level everywhere, and digits it no longer needs can't turn the lantern red
      if (session.levelByExp) { st.level = session.level; mark('level', true); setCheck('level', 'done', 'Level ' + st.level); }
    }
    // the last 10 readings, for a Something off? report (an 84 read as 684 shows up here)
    st.recent.push({ t: reading.t, exp: reading.exp, pct: reading.pct, level: reading.level, mesos,
      counts: reading.counts.map(c => ({ key: c.key, id: c.id, value: c.value })) });
    if (st.recent.length > 10) st.recent.shift();
    // saved before it's drawn, so a drawing bug can't take the save with it
    save(false);
    render();
  }

  // which map: the game's minimap picture (data/minimaps). A read that changes moves the pick, on two reads running so a map fading in
  // doesn't count, which lets a pick by hand hold until the game goes somewhere new. Nothing to read (a town, the minimap collapsed, a
  // window over it): the pick stays. Where it last was costs a few ms a read; a search (about 60 ms) waits a while after finding nothing
  function loadMaps() {
    const pic = new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'data/minimaps.png'; });
    Promise.all([fetch('data/minimaps.json').then(r => r.json()), pic]).then(([index, im]) => { MS().loadMaps(im, index); st.mapsReady = true; }).catch(() => { /* the map stays a pick by hand */ });
  }
  function followMap(src, S, h) {
    if (!st.mapsReady) return;
    const now = Date.now(), search = now >= (st.mapSearchAt || 0), r = S.readMap(src, h, { search });
    if (!r.ok) { if (search) st.mapSearchAt = now + MAP_SEARCH_MS; st.mapNext = null; return; }
    if (r.id === st.mapRead) { st.mapNext = null; return; }
    if (st.mapNext !== r.id) { st.mapNext = r.id; return; }
    st.mapRead = r.id; st.mapNext = null;
    // two maps with one picture and the pick is one of them: the pick is as good an answer
    if ((r.also || []).includes(mapId)) { st.mapHere = mapId; return; }
    if (r.id !== mapId) putMap(r.id); else st.mapHere = mapId;
    st.noted.map = null; noteOf('map', 'done', 'Map: ' + shortMap(r.id));
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
    if (session && lootOn && lootReady) {
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
  // sending: the row on its way to the account; settled: told each time a send finishes (quitting the app listens);
  // landsDeleted: rows deleted while on their way
  let lastOk = -Infinity, busy = false, nextT = null, failNote = null, sending = null, settled = null;
  const landsDeleted = new Set();
  function save(force) {
    if (!session) return Promise.resolve();
    const now = Date.now();
    if (!force && now - st.lastSave < SAVE_MS) return Promise.resolve();
    st.lastSave = now;
    jset(KEY_OPEN, session);
    const row = GS().toRow(session);
    // anonymous funnel step: the first EXP read of a session (once per session)
    if (window.track && row.exp > 0 && !(window.__expSeen = window.__expSeen || new Set()).has(row.id)) { window.__expSeen.add(row.id); window.track('first_exp_read', { app: app ? 1 : 0 }); }
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
      if (window.track && row.exp > 0 && !(window.__acctSeen = window.__acctSeen || new Set()).has(id)) { window.__acctSeen.add(id); window.track('session_saved', { active_min: Math.round(row.active_min / 10) * 10 }); }
      busy = false; sending = null; lastOk = Date.now(); failNote = null;
      if (!waiting.has(id)) jset(KEY_LOCAL, jget(KEY_LOCAL, []).filter(x => x.id !== id));
      if (landsDeleted.delete(id)) api.deleteGrind(id).catch(er => setStatus("Couldn't delete it (" + er.message + ').')).then(listSessions);
      else listSessions();
      send();
      if (settled) settled();
    }, e => {
      busy = false; sending = null;
      if (landsDeleted.delete(id)) { listSessions(); send(); if (settled) settled(); return; }   // it never landed, so it's gone
      keepLocal(row); listSessions();
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
        if (!nothingWaiting()) { for (const r of waiting.values()) keepLocal(r); if (sending && !landsDeleted.has(sending.id)) keepLocal(sending); }
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
    sinceFor = session.id;   // its window is picked, for this session only (the switch's kept choice stays as it is)
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
  // the run just finished opens on the page as its session card, when it has EXP to rate; the panel carries on with the new
  // one. Pressed again with nothing in it, the card already open stays
  function newSession() {
    const row = session ? GS().toRow(session) : null, opens = !!row && row.exp > 0 && row.active_min > 0;
    save(true).then(() => {
      session = null; store.set(KEY_OPEN, '');
      st.notes = []; st.noted = {}; notesOpen = false; renderNotices();   // Notices last the session
      if (opens) viewing = GS().fromRow(row, eatCfg());
      render();
      if (opens) detail.scrollIntoView({ block: 'start', behavior: 'smooth' });
      setStatus('New session. It starts with your next EXP.');
    });
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
      if (window.track) window.track(st.sharing ? 'share_started' : 'share_ended', { why: st.sharing ? '' : String(why || ''), app: app ? 1 : 0 });
      if (st.sharing) startChecks();
      else {
        if (app) setStatus(why === 'denied' || why === 'failed' ? LOST : 'Stopped. This session is kept, press Start to carry on.');
        else setStatus(why === 'denied' ? 'Sharing was turned down. Press Share game window to try again.' : 'Stopped. This session is kept, share again to carry on.');
        save(true);   // before anything is drawn, so a drawing bug can't take the save with it
      }
      render();
      if (!st.sharing) return;
      if (app) { setStatus('Found MapleStory. Grind away, nothing to type.'); if (!overlay.win()) popOut(); return; }
      setStatus(WATCHING);
    } });
  // before sharing, Share game window is the main button; once sharing it's Pop out, and Stop sits after where Share was
  for (const b of shareArea.querySelectorAll('button')) b.classList.add('k-btn');
  const shareBtn = shareArea.querySelector('#g-share'), shareWords = t => { shareBtn.lastChild.textContent = t; };
  if (shareBtn) { shareBtn.classList.add('key'); shareBtn.replaceChildren(el('i', { 'aria-hidden': 'true' }, railIcon('pop')), el('span', {}, shareBtn.textContent)); }
  // an app older than this page can't start: the one line says to update it (renderHealth)
  if (appOld && shareBtn) shareBtn.disabled = true;
  if (app && typeof app.onClosing === 'function') app.onClosing(letGo);
  // Start in the app: the game window, found by the app. None: say so, and Start becomes Try again. One: that one. Several:
  // the player picks (Cancel starts nothing). The share starts once the app has it
  async function findGame() {
    if (appOld) return false;
    const notFound = () => { setStatus("Can't find MapleStory. Open the game, then press Try again."); if (shareBtn) shareWords('Try again'); return false; };
    let wins = [];
    try { wins = (await app.findGame()) || []; } catch (e) { /* the same as none */ }
    if (!wins.length) return notFound();
    if (shareBtn) shareWords('Start');
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
        wins.map(w => el('button', { type: 'button', class: 'k-btn g-pick', onclick: () => pick(w.id) }, w.thumb ? el('img', { src: w.thumb, alt: '' }) : null, el('span', {}, w.title))),
        el('button', { type: 'button', class: 'k-btn', onclick: () => pick(null) }, 'Cancel'));
      shareArea.append(box);
    });
  }

  /* ----- drawing ----- */
  // a bug in one of the cards or the panel stays out of the share (a throw from a frame stops it): it goes to the console, the
  // last one is kept for a Something off? report (report()), and the reading and the saving carry on
  let drawError = null;
  function guard(what, draw) {
    try { draw(); } catch (e) {
      const msg = what + ': ' + (e && e.message ? e.message : e);
      if (msg !== drawError) console.error('Grind: ' + what + " didn't draw", e);
      drawError = msg;
    }
  }
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
    popBtn.classList.toggle('key', st.sharing); snapBtn.hidden = !st.sharing; showPop();
    const share = shareArea.querySelector('#g-share');   // the reader's button; the main one until the game is shared
    if (share) share.classList.toggle('key', !st.sharing);
    renderBag();
    if (!s) {
      V.res.hidden = true; sCard.update(null);
      guard('the band', () => renderNow(null)); guard('the Now grinding card', () => renderCard()); guard('the pop-out panel', () => renderStrip());
      overlay.fit(); return;
    }
    const t = viewing ? s.tLast : Date.now(), o = GS().stats(s, t, avgExp(s.mapId || mapId)), R = GS().result(s, t);
    renderResult(s, R);
    guard('the session card', () => renderSessionCard(s, o, R));
    V.expHr.textContent = o.expHr != null ? fmtK(o.expHr) : '·';
    V.sub.textContent = o.expMin != null ? fmt(o.expMin) + ' a minute · ' + o.pctHr.toFixed(2) + '% an hour' : 'Needs 2 minutes of EXP first';
    // Pace: the last 5 minutes is the number, and the rest (the last 10, and since Reset average) is its small line. A saved run has no pace
    const pace = viewing ? [] : paceParts(o);
    V.paceV.parentNode.hidden = !!viewing;
    arrowed(V.paceV, pace.length ? pace[0].value + (pace[0].vs ? ' ' : '') : '·'); if (pace.length && pace[0].vs) { V.paceV.append(' '); const a = el('span', { class: 'g-nvs ' + (pace[0].up ? 'up' : 'down') }); arrowed(a, pace[0].vs); V.paceV.append(a); }
    V.pace.textContent = pace.map((p, i) => ({ p, i })).filter(x => x.p.value !== '·').map(({ p, i }) => i ? p.value + ' ' + p.label + (p.extra ? ' · ' + p.extra : '') : p.label.toLowerCase()).join(', ');
    V.next.textContent = o.hrsToLevel != null ? fmtDur(o.hrsToLevel * 60) + ' to ' + ((s.level || 0) + 1) + ', at ' + timeOfDay(t + o.hrsToLevel * 3600000) : '';
    V.gain.textContent = fmt(o.exp) + ' · ' + o.pct.toFixed(2) + '%' + (o.deaths ? ' · ' + deathText(o) : '');
    // the clock runs only while the EXP bar is read; time left out for a pause says so, to square with a stopwatch, and
    // so do the minutes EXP an hour ran on when town before the first kill or after the last left some out
    V.time.textContent = fmtDur(o.mins);
    V.timeSub.textContent = [o.pausedMins >= 1 ? fmtDur(o.pausedMins) + ' left out' : '', o.expHr != null && o.mins - o.expMins >= 1 ? 'EXP an hour over ' + fmtDur(o.expMins) + ', first kill to last' : ''].filter(Boolean).join(' · ');
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
    guard('the band', () => renderNow(s, o, mains, R));
    guard('the Now grinding card', () => renderCard());
    // all time follows the running session, so its Lemons never trail this session's line by a minute of saves
    if (!viewing && Date.now() - lifeAt > 5000) renderLife();
    // the panel follows the live run, whatever the page is looking at: its own numbers when that isn't the page's run
    guard('the pop-out panel', () => {
      const ps = stripSession(), po = ps === s ? o : ps ? GS().stats(ps, Date.now(), avgExp(ps.mapId || mapId)) : null;
      renderStrip(po, ps === s ? mains : ps ? mainPotions(ps, po) : []);
    });
    overlay.fit();
    renderWhole(s);
    partyCompare.textContent = compareParty(s);
    V.numFoot.hidden = !(V.mesos.textContent || mapNote.textContent || partyCompare.textContent) && V.tradeBox.hidden;
  }
  // the session card: this run against your other runs at the map (GrindSession.standing), EXP an hour first, then mesos an
  // hour from the result card, then the main potion per 1%. Under 10 minutes a number doesn't rank (null)
  function renderSessionCard(s, o, R) {
    const mapOf = s.mapId || mapId, base = { mapId: mapOf, exceptId: s.id };
    const main = mainPotions(s, o)[0];
    const potIds = main ? (LEMON_IDS.includes(+main.id) ? LEMON_IDS : MEAT_IDS.includes(+main.id) ? MEAT_IDS : [+main.id]) : [];
    const used = ids => ids.reduce((a, id) => a + usedOf(s, id), 0), lastLine = (k, n) => eatLines(k, { n }).slice(-1)[0];
    const potUsed = main ? used(potIds) : 0;
    const gs = GS();
    sCard.update(gs ? window.GrindCard.model({
      live: !viewing, map: mapOf ? panelMap(mapOf) : '', mins: o.mins, gained: o.exp, levelFrom: s.levelStart, levelTo: s.level,
      exp: gs.standing(lastRows, Object.assign({ metric: 'expHr', value: o.expMins >= 10 && o.expHr > 0 ? o.expHr : null }, base)),
      mesos: gs.standing(lastRows, Object.assign({ metric: 'mesosHr', mode: R.mode, value: R.window && R.window.mins >= 10 && R.perHr != null ? R.perHr : null }, base)),
      verdict: R.verdict || null,
      pot: main ? gs.standing(lastRows, Object.assign({ metric: 'potPer1', potIds, value: o.pct >= 1 && o.mins >= 10 && potUsed > 0 ? potUsed / o.pct : null }, base)) : null,
      potName: main ? plural(main.name) : null,
      lemon: { n: used(LEMON_IDS), quip: lastLine('lemon', used(LEMON_IDS)) }, meat: { n: used(MEAT_IDS), quip: lastLine('meat', used(MEAT_IDS)) },
      fmtK, fmtDur, fmtPer: perFmt }) : null);
  }
  // the card's pace line: EXP an hour over the last 5 and 10 minutes and since Reset average, each against the session's
  // average (differences under 2% get no arrow)
  function paceParts(o) {
    const vs = r => {
      if (!r || !o.expHr) return null;
      const d = r.expHr / o.expHr - 1;
      return Math.abs(d) < 0.02 ? null : { up: d > 0, text: (d > 0 ? '▲' : '▼') + Math.round(Math.abs(d) * 100) + '%' };
    };
    const part = (label, r) => { const v = vs(r); return { label, value: r ? fmtK(r.expHr) : '·', vs: v && v.text, up: v && v.up }; };
    const parts = [part('Last 5 min', o.pace && o.pace[5]), part('last 10 min', o.pace && o.pace[10])];
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
    const ids = s === viewing ? [] : GS().countdowns(s, Date.now()).map(c => String(c.id));
    for (const id of Object.keys(o.perPct).sort((a, b) => o.perPct[b] - o.perPct[a])) if (!ids.includes(id)) ids.push(id);
    return ids.slice(0, 2).map(id => {
      const sl = Object.values(s.slots).concat(s.retired || []).find(x => String(x.id) === id);
      return { id, name: sl ? sl.name : data.potions[id] ? data.potions[id][0] : 'Potion' };
    });
  }

  /* ----- is it reading everything: the lantern and checks, and the one thing to do (on the card, and under
     the pop out's tiles) ----- */
  function renderHealth() {
    const s = session;
    const h = lastHealth = health({ t: Date.now(), app: !!app, sharing: st.sharing, stopped: !!st.stopped, hasSession: !!s, exp: st.h.exp, level: st.h.level, levelNow: st.level,
      size: st.h.size, counts: st.h.counts, potNone: st.potNone, potCount: st.potCount, killed: !!s && (s.gainExp > 0 || s.gainPct > 0),
      meso: { at: s && s.meso && s.meso.last ? s.meso.last.t : null, unclear: !!(st.mesoOpen && st.mesoUnclear) },
      loot: { on: lootOn, pictures: lootReady, sets: s && s.bag ? s.bag.sets : 0, refillAfter: !!s && !PICKUPS && GS().inTown(s),
        needsFlip: st.needsFlip = PICKUPS && !!s && lootOn && GS().pickNeedsFlip(s, Date.now(), { sinceT: st.lineT, movedT: st.movedT, inTown: GS().inTown(s) }) } });
    // the pill over the buttons goes by what the core numbers need (mesos only ever ask)
    const core = ['exp', 'level', 'potions'].map(k => h.checks[k].state);
    const ps = !st.sharing ? 'idle' : core.includes('bad') ? 'bad' : core.every(x => x === 'ok') ? 'ok' : 'wait';
    V.pill.className = 'k-lamp g-pill ' + ps + (ps === 'idle' ? ' off' : '');
    // its words are the light's (the pop out says the same), with the level once it's read
    const pillText = h.nudge.short + (ps !== 'idle' && ps !== 'bad' && st.level ? ' · Lv ' + st.level : '');
    // written only when it changes: the pill is a live region, and this runs on every frame
    if (V.pillText.textContent !== pillText) V.pillText.textContent = pillText;
    // the one thing to do, only when there is one (a saved session being looked at isn't live); a check that matters failing is
    // the problem line instead, with Find my game again at its end
    const problem = h.nudge.state === 'bad' && !appOld;
    V.nudge.hidden = !!viewing || problem || h.nudge.state === 'ok' || (h.nudge.state === 'idle' && !s);
    V.problem.hidden = !!viewing || !problem;
    if (V.problemText.textContent !== h.nudge.text) V.problemText.textContent = h.nudge.text;
    if (problem && window.track && window.__prob !== h.nudge.text) { window.__prob = h.nudge.text; window.track('reading_problem', { text: String(h.nudge.text).slice(0, 60), app: app ? 1 : 0 }); }
    V.nudge.className = 'g-nudge ' + h.nudge.state; V.nudge.textContent = h.nudge.text;   // the lantern and the band carry the state, so no sign here
    // an app older than this page: that comes first, with where to get the new one
    if (appOld) {
      V.nudge.hidden = false; V.nudge.className = 'g-nudge bad';
      V.nudge.replaceChildren('This page needs a newer app. ', el('a', { href: deps.appDownload || RELEASES, target: '_blank', rel: 'noopener' }, 'Update the app'));
    }
    // the pop out's light says it all in a colour and a few words, live only; a saved run being looked at is grey
    const jump = s && s.meso && s.meso.jump;
    const savedRun = !!stripView();
    const ask = !!jump && !savedRun && h.nudge.state !== 'bad';   // a mesos jump to answer comes before anything amber
    const lamp = savedRun ? ['idle', 'Saved run'] : ask ? ['wait', 'Check your mesos'] : [h.nudge.state, h.nudge.short];
    const tabs = !savedRun && !ask && h.nudge.flip ? bagTabStates(s && s.bag) : null;
    // drawn again only when what it says changes: this runs on every frame, and the light is a live region
    const lampKey = lamp.join() + (tabs ? tabs.map(x => x.tab + x.state).join() : '');
    if (SP.lampSays !== lampKey) {
      SP.lampSays = lampKey;
      SP.lamp.className = 'g-lamp ' + lamp[0]; SP.lampT.textContent = lamp[1];
      SP.lampF.hidden = !tabs; SP.lampF.replaceChildren(...(tabs || []).map(({ tab, state }) => el('b', { class: state }, el('span', {}, tab))));
    }
    // the alert under the numbers is only for what needs a button: a mesos jump to answer, and Find my game again when it's stuck
    const alertSays = (key, draw) => { if (SP.l3Says !== key) { SP.l3Says = key; draw(); } };
    if (ask) {
      SP.l3.hidden = false; SP.l3.className = 'g-l3 g-alert wait';
      alertSays('jump ' + jump.amount, () => {
        const out = el('button', { type: 'button', onclick: () => answerJump(true) }, 'Leave it out'), keep = el('button', { type: 'button', class: 'g-keep', onclick: () => answerJump(false) }, 'Keep it');
        SP.l3.replaceChildren('Mesos ' + signed(jump.amount) + '. ' + (jump.amount > 0 ? 'Sold loot to someone?' : 'Bought something from someone?'),
          el('span', { class: 'g-l3b' }, jump.amount > 0 ? [keep, out] : [out, keep]));
      });
      return;
    }
    SP.l3.hidden = savedRun || h.nudge.state !== 'bad';
    SP.l3.className = 'g-l3 g-alert ' + h.nudge.state;
    alertSays([h.nudge.state, h.nudge.text, h.stuck].join(), () => SP.l3.replaceChildren(h.nudge.text, h.stuck ? el('button', { type: 'button', onclick: () => refind() }, railIcon('reset'), ' Find my game again') : ''));
  }

  /* ----- the pop out panel ----- */
  // the run the panel shows, decided here alone: a saved run only while nothing is being shared (a pop-out of a stopped
  // share can show one), else the running one, or none yet (dots)
  const stripView = () => st.sharing ? null : viewing;
  const stripSession = () => stripView() || session;
  // the panel writes only what changed, so a frame costs nothing and nothing restarts an animation
  const put = (e, text) => { if (e.textContent !== text) e.textContent = text; };
  const show = (e, on) => { if (e.hidden === !!on) e.hidden = !on; };
  const attr = (e, k, v) => { if (e.getAttribute(k) !== v) e.setAttribute(k, v); };
  const hoverText = (e, text) => { if (e.title !== text) e.title = text; };
  const picTo = (img, pic, alt) => { if (pic && img.getAttribute('src') !== pic) img.src = pic; show(img, !!pic); if (img.alt !== alt) img.alt = alt; };
  // EXP an hour's window: the one kept on the device (written only by a click on the switch), or since Reset average for
  // the session it was pressed in
  let expWin = ['5', '10', 'run'].includes(store.get(KEY_WINDOW)) ? store.get(KEY_WINDOW) : '10', sinceFor = null;
  function pickWindow(w) {
    if (w === 'since') sinceFor = session && session.id;
    else { sinceFor = null; expWin = w; store.set(KEY_WINDOW, w); }
    render();
  }
  // no run yet: the panel waits with dots
  const NO_RUN = { exp: 0, pct: 0, mins: 0, expHr: null, pace: {}, markT: null, since: null, mesosEarned: null, profit: null, mesoLooks: 0, per1: null, hrsToLevel: null, expToLevel: null, deaths: 0 };
  function renderStrip(stats, mains = []) {
    const s = stripSession(), saved = !!stripView(), now = Date.now(), o = stats || NO_RUN;
    // a saved session has no live clock, and its counts are where it stopped: no countdowns and no counts for it; retired
    // slots are marked so a stale count never shows
    const slots = !s ? [] : Object.values(s.slots).map(sl => saved ? Object.assign({}, sl, { count: null }) : sl)
      .concat((s.retired || []).map(r => Object.assign({}, r, { retired: true })));
    SP.tiles = potionTiles(slots, s && !saved ? GS().countdowns(s, now) : [], (SP.tiles || []).filter(Boolean).map(x => x.key), now);
    SP.main = mains[0] || null;   // the waiting tile shows the main potion's picture
    // one potion tile or two: the window takes that count's size when it can, and the panel fits it either way
    const n = SP.tiles.length;
    if (potCount() !== n) {
      strip.dataset.pots = String(n);
      if (n === 2) SP.tilesBox.insertBefore(SP.pots[1].box, SP.quip); else SP.pots[1].box.remove();
      overlay.resize(...layoutSize(layout, n));
      overlay.fit();
    }
    renderClocks(now);
    renderExp(s, o, saved, now);
    const minus = v => v < 0 ? '−' : '';
    put(SP.meso, o.mesosEarned != null ? signed(o.mesosEarned) : '·');
    put(SP.mesoSub, o.profit != null ? minus(o.profit) + fmt(Math.abs(o.profit)) + ' after potions' : o.mesoLooks ? 'peek again later' : 'no peek yet');
    put(SP.gain, s ? fmtK(o.exp) : '·');
    put(SP.gainSub, !s ? '' : minus(o.pct) + Math.abs(o.pct).toFixed(1) + '%' + (o.deaths ? ' · ' + o.deaths + ' death' + (o.deaths > 1 ? 's' : '') : s.level ? ' of Lv ' + s.level : ''));
    hoverText(SP.gainBox, o.deaths ? deathText(o) : '');
    renderPer(s, o, saved);
    renderPace(s, o, saved);
    // the next level, live only
    show(SP.lvBox, !saved);
    put(SP.lvL, s && s.level ? 'Lv ' + (s.level + 1) + ' in' : 'Next level in');
    put(SP.lv, !saved && o.hrsToLevel != null ? fmtDur(o.hrsToLevel * 60) : '·');
    put(SP.lvSub, !saved && o.hrsToLevel != null && o.expToLevel != null ? fmtK(o.expToLevel) + ' to go' : '');
    // one potion in Hero (the CSS keeps it to Hero): the spare slot's line, once something has gone down
    const lone = n === 1 && SP.tiles[0] && SP.tiles[0].used > 0 ? SP.tiles[0] : null;
    show(SP.quip, !!lone);
    if (lone) {
      const every = o.mins >= 1, lines = eatLines(lone.kind, { n: lone.used, name: lone.name, everySec: every ? o.mins * 60 / lone.used : null });
      put(SP.quipB, lines[lines.length - 1]);
      put(SP.quipS, every ? lines[0] : '');
    }
  }
  // the biggest number: the window picked, your usual beside it (a saved run says how long it ran over), the arrow, and under
  // them nothing (the trend line is gone). Before 2 minutes it's dots
  function renderExp(s, o, saved, now) {
    const usual = s && !saved ? GS().standing(lastRows, { mapId: s.mapId || mapId, exceptId: s.id, metric: 'expHr', value: null }).usual : null;
    const p = expPick(o, saved ? 'run' : s && sinceFor === s.id ? 'since' : expWin, usual);
    show(SP.seg, !saved);
    for (const b of SP.segs) {
      const w = p.windows.find(x => x.key === b.dataset.w);
      show(b, !!w);
      if (!w) continue;
      attr(b, 'aria-pressed', String(w.on));
      if (b.disabled !== w.off) b.disabled = w.off;
      if (w.key === 'since') { put(SP.sinceAt, w.label.replace(/^since /, '')); attr(b, 'aria-label', w.label); }
    }
    const us = saved ? (o.expHr != null ? 'over ' + fmtDur(o.expMins) : '') : usual != null ? '/ ' + fmtK(usual) : '';
    put(SP.exp, p.value != null ? fmtK(p.value) : '·');
    show(SP.expUs, !!us);
    put(SP.expUn, us);
    put(SP.expUw, us && !saved ? ' usual' : '');
    // the pixel arrow and the percent, rewritten only when they change (nothing animates on a number update)
    const vsText = p.vs ? p.vs.text : '';
    if (SP.expD.dataset.t !== vsText) { SP.expD.dataset.t = vsText; arrowed(SP.expD, vsText); }
    attr(SP.expD, 'class', 'g-d' + (p.vs ? (p.vs.up ? ' up' : ' down') : ''));
  }
  // Per 1%: how many of each potion on a tile go down for 1% (both Lemon ids count), the small line what 1% costs in potions;
  // one potion is against your usual at this map, two have no room for it
  function renderPer(s, o, saved) {
    const tiles = SP.tiles.filter(Boolean);
    SP.perN.forEach((P, i) => {
      const t = tiles[i];
      show(P.box, i === 0 || !!t);
      picTo(P.img, t ? pictures.Icons[t.id] : null, t ? t.name : '');
      put(P.n, t && o.pct >= 0.3 ? perFmt(t.used / o.pct) : '·');
    });
    const t = tiles.length === 1 && s && !saved ? tiles[0] : null;
    const usual = t ? GS().standing(lastRows, { mapId: s.mapId || mapId, exceptId: s.id, metric: 'potPer1', potIds: t.kind === 'lemon' ? LEMON_IDS : t.kind === 'meat' ? MEAT_IDS : [t.id], value: null }).usual : null;
    show(SP.perUs, usual != null);
    put(SP.perUs, usual != null ? '/ ' + perFmt(usual) : '');
    put(SP.perSub, o.per1 != null ? fmt(o.per1) + ' mesos' : '');
  }
  // Pace: the card's Last 5 min comparison against your usual, surfaced as a KPI tile in Bar only (Hero, Column and
  // Corner keep their four tiles and fixed window sizes). Rewritten only when it changes, so a redraw with nothing new
  // never restarts an animation
  function renderPace(s, o, saved) {
    show(SP.paceBox, !saved && layout === 'bar');
    if (saved || layout !== 'bar') return;
    const p = paceParts(o)[0], key = p.value + '|' + (p.vs || '');
    if (SP.pace.dataset.t !== key) {
      SP.pace.dataset.t = key;
      arrowed(SP.pace, p.value + (p.vs ? ' ' : ''));
      if (p.vs) { const a = el('span', { class: 'g-nvs ' + (p.up ? 'up' : 'down') }); arrowed(a, p.vs); SP.pace.append(a); }
    }
    put(SP.paceSub, p.value !== '·' ? 'last 5 min' : '');
  }
  // every frame and every second between: the timer tiles (each a little glass that drains), the map and how long
  function renderClocks(now) {
    const s = stripSession(), saved = !!stripView();
    (SP.tiles || [null]).forEach((tile, i) => {
      const P = SP.pots[i], x = potionTile(tile, now, saved), pic = tile ? pictures.Icons[tile.id] : SP.main && pictures.Icons[SP.main.id];
      attr(P.box, 'class', 'g-pot ' + x.kind + (x.low ? ' low' : ''));
      show(P.juice, x.juice > 0);
      if (P.juice.style.height !== x.juice + '%') P.juice.style.height = x.juice + '%';
      picTo(P.img, pic, tile ? tile.name : SP.main ? SP.main.name : '');
      put(P.clock, x.clock);
      show(P.left, !!x.n);
      put(P.n, x.n); put(P.verb, x.verb ? ' ' + x.verb : ''); put(P.lf, x.left ? ' · ' + x.left : ''); put(P.cap, x.cap);
      // Bar and two potion Corner have no room for these: they stay in the hover title
      hoverText(P.box, [x.left, x.cap].filter(Boolean).join(' · '));
    });
    // no map known: the spot stays empty, and how long runs on its own
    const pm = s ? s.mapId || mapId : mapId;
    put(SP.elMap, pm ? panelMap(pm) : '');
    put(SP.elTime, (pm ? ' · ' : '') + fmtDur(s ? elapsedSecs(s, now, !saved && st.sharing) / 60 : 0));
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
  /* ----- the whole session: one strip in This run, a cell a minute, a row an hour ----- */
  // Each cell is that minute's EXP in six strengths of the lead number's color (idle minutes faint). One hour or less is one strip with
  // its start and end times under it; longer runs get a row an hour, each starting with its clock time. The hover tip names the minute
  const wholeKey = { k: null };
  function renderWhole(s) {
    const ms = s.minutes || [], rows = GS().wholeRows(ms), top = Math.max(1, ...ms.map(m => m.exp || 0));
    // only drawn again when a minute changes (a frame inside the same minute moves nothing)
    const key = s.id + '|' + ms.length + '|' + (ms.length ? ms[ms.length - 1].exp : 0) + '|' + top;
    if (wholeKey.k === key) return;
    wholeKey.k = key;
    const cell = (m, i) => { const idle = !(m && m.exp > 0), k = idle ? 0 : Math.min(5, Math.floor(m.exp / top * 5.999));
      return el('i', { 'data-m': String(i), 'data-idle': idle ? '1' : '0', 'data-k': idle ? 'idle' : String(k) }); };
    const at = i => timeOfDay(s.t0 + i * 60000);
    wholeRowsBox.replaceChildren(...rows.map((r, ri) => el('div', { class: 'g-wrow' + (rows.length === 1 ? ' one' : '') }, rows.length > 1 ? el('span', { class: 'g-wt' }, at(ri * 60)) : null,
      el('div', { class: 'g-wcells', style: rows.length === 1 ? 'grid-template-columns:repeat(' + r.length + ',minmax(0,1fr))' : null }, r.map((_, i) => cell(ms[ri * 60 + i], ri * 60 + i))))),
      ...(rows.length === 1 ? [el('div', { class: 'g-wends' }, el('span', {}, at(0)), el('span', {}, at(ms.length)))] : []));
    whole.hidden = !rows.length;
  }
  // average EXP a minute solo against partied on this map, from this session and the sessions kept on this device
  function compareParty(s) {
    const map = s.mapId || mapId, pools = { 1: [], more: {} };
    const minutesOf = [s.minutes].concat(jget(KEY_LOCAL, []).filter(r => map != null && r.map_id === map && r.id !== s.id && r.minutes).map(r => GS().fromRow(r).minutes));
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
    const box = whole.getBoundingClientRect();
    tip.style.left = Math.min(Math.max(0, box.width - 220), Math.max(0, e.clientX - box.left + 12)) + 'px';
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
  // Pop out shows once the game is shared or a session exists (the app also hides it while its overlay is open, or when it is too old);
  // Reset average and New session need a session. Before that the row is Share and Count my loot (and the app's Settings and Quit)
  function showPop() {
    popBtn.hidden = !(st.sharing || session) || (!!app && (appOld || !!overlay.win()));
    markBtn.hidden = newBtn.hidden = !session;
  }
  // mesos from inventory looks, and the verdict: mesos earned an hour less potions drunk an hour
  function renderMesos(s, o) {
    V.trade.hidden = !(o.mesoJump && !viewing);
    if (!o.mesoJump) tradeKey = null;
    if (o.mesoJump) {
      const up = o.mesoJump.amount > 0;
      V.tradeQ.textContent = jumpQuestion(o.mesoJump.amount);
      // the two buttons are rebuilt only when the question side flips, so a frame does not take a press off them
      if (tradeKey !== up) { tradeKey = up; V.trade.replaceChildren(V.tradeQ, ' ', up ? V.tradeNo : V.tradeYes, ' ', up ? V.tradeYes : V.tradeNo); }
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
  // What it earned (GrindSession.result): the session's total as the lead number, Profitable or Losing, the hourly number under it, plain
  // rows that add up to it, and with Count my loot on what was picked up. The kept lines are small print
  const money = n => n == null ? '·' : (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(Math.round(n)));
  const moneyK = n => n == null ? '·' : (n > 0 ? '+' : n < 0 ? '−' : '') + fmtK(Math.abs(n));
  const tone = n => n == null || n === 0 ? '' : n > 0 ? 'pos' : 'neg';
  const COZY = 'https://cozy.markets/items/', PICKED_SHOWN = 5;
  let lootOpen = false, lootKey = null, potsKey = null, tradeKey = null;
  // What the pickup lines said, under What you picked up: a list marked "not checked", how it compares with the bag, and (only
  // while the mesos reading passes its accuracy gate) the mesos it saw. Never part of the total or the verdict
  function pickBlock(s) {
    if (!PICKUPS) return { key: '', nodes: [] };
    const K = GS().pickups(s), cmp = GS().pickupCompare(s), mesosOn = window.PickupLines.mesosOn();
    if (!K.lines && !cmp) return { key: '', nodes: [] };
    const key = JSON.stringify([K, cmp, mesosOn, !!st.pickupSlow]);
    const row = (label, v) => el('div', { class: 'k-row' }, el('span', { class: 'g-nl' }, label), el('span', { class: 'g-nv' }, v));
    const rows = [];
    for (const x of K.items) rows.push(row(x.name, '×' + fmt(x.count)));
    for (const tab of ['Use', 'Etc']) if (K.unnamed[tab]) rows.push(row(tab + ' items', '×' + fmt(K.unnamed[tab])));
    if (K.equips) rows.push(row('Equipment', '×' + fmt(K.equips)));
    if (mesosOn && (K.mesos.sum || K.mesos.unsure)) {
      rows.push(row('Mesos from drops (from lines)', fmt(K.mesos.sum)));
    }
    const nodes = [el('div', { class: 'g-res-h' }, 'From pickup lines, not checked')];
    if (rows.length) nodes.push(el('div', { class: 'k-rows' }, ...rows));
    if (mesosOn && K.mesos.unsure) nodes.push(el('p', { class: 'g-note' }, K.mesos.unsure + (K.mesos.unsure === 1 ? ' line' : ' lines') + ' unreadable'));
    if (cmp) nodes.push(el('p', { class: 'g-note' }, cmp.differs ? 'Counted ' + fmt(cmp.fromLines) + ' from the lines, the bag says ' + fmt(cmp.inBag) + '.' : 'The lines and the bag agree on ' + fmt(cmp.inBag) + '.'));
    if (st.pickupSlow) nodes.push(el('p', { class: 'g-note' }, 'The pickup lines are read too slowly to count every one.'));
    return { key, nodes };
  }
  function renderResult(s, R) {
    V.res.hidden = false;
    const has = !!R.window, loot = R.mode === 'loot';
    V.resBar.textContent = loot ? 'counted from your first flip through the bag to your latest' : '';
    V.resTotal.textContent = has ? money(R.total) : '·'; V.resTotal.className = 'g-res-total ' + (has ? tone(R.total) : '');
    V.resPill.textContent = R.verdict || 'Counting'; V.resPill.className = 'g-res-pill ' + (R.verdict === 'Profitable' ? 'up' : R.verdict === 'Losing' ? 'down' : '');
    V.resHr.textContent = has && R.perHr != null ? moneyK(R.perHr) + ' an hour · ' + fmtDur(R.window.mins) : 'no hourly number yet';
    V.resHr.className = 'g-res-hr ' + (has ? tone(R.perHr) : '');
    const usual = has && R.perHr != null ? GS().usualOf(lastRows, { mapId: s.mapId, mode: R.mode, exceptId: s.id }) : null;
    const short = has && R.window.mins < R.window.sessionMins - 1;
    const bits = [usual != null && Math.abs(R.perHr - usual) >= 1 ? fmtK(Math.abs(R.perHr - usual)) + ' an hour ' + (R.perHr >= usual ? 'better' : 'worse') + ' than your usual ' + shortMap(s.mapId) + '.' : '',
      short ? 'Counted over ' + Math.round(R.window.mins) + ' of your ' + Math.round(R.window.sessionMins) + ' minutes. ' + (loot ? 'Flip through your bag before you stop to count it all.' : 'Open your inventory before you stop to count it all.') : '',
      // a saved session can't take another look: it says why it has no total instead of asking for one
      has ? '' : viewing ? (loot ? 'Its bag was never looked through twice, so it has no total' : 'Its inventory was never opened twice, so it has no total')
        : loot ? 'No total yet, it counts from two flips through your bag' : 'No total yet, it counts from two looks at your inventory'].filter(Boolean);
    V.resSub.textContent = bits.join(' '); V.resSub.hidden = !bits.length;
    const rowOf = (label, v, sub, off) => el('div', { class: 'k-row' }, el('span', { class: 'g-nl' }, label, sub ? el('small', {}, sub) : null),
      el('span', { class: 'g-nv ' + (off ? 'quiet' : tone(v)) }, off ? 'Not counted' : money(v)));
    V.resRows.replaceChildren(rowOf('Mesos picked up', R.pickedUp), rowOf('Sold at the NPC', R.sold, R.otherBuys ? 'bought ' + fmt(R.otherBuys) + ' besides potions' : ''),
      // with one flip so far the mesos seen are counted, and the loot waits for the next flip
      rowOf("Your bag's change, at NPC prices", R.loot ? R.loot.value : null, loot && !R.loot && has ? (viewing ? 'its bag was looked through once' : 'counts at your next flip') : '', !loot),
      rowOf('Potions', R.potions == null ? null : -R.potions));
    V.resOther.textContent = R.other && R.other.n ? 'Plus ' + fmt(R.other.n) + ' other potions, ' + fmt(R.other.cost) + ' mesos of them.' : '';
    V.resOther.hidden = !V.resOther.textContent;
    // what you picked up: the catches first, then by value, each with its ring (a gold ring is the best one), five rows then show more
    V.resLoot.hidden = !loot;
    if (loot) {
      const L = R.loot, list = [], after = [];
      let P = null, key = L ? 'empty' : 'wait';
      const pk = pickBlock(s);
      if (L && L.items.length) {
        const C = drops ? window.GrindNow.dropColumns(mobsOf(s.mapId || mapId).sort((x, y) => y.count - x.count).map(m => m.id), drops, id => (data.mobs[id] || [''])[0], classId, levelNow()) : null;
        P = window.GrindNow.pickedRows(L, C ? window.GrindNow.wantedOf(C) : [], lootIdx || { cells: {} }, lootOpen ? Infinity : PICKED_SHOWN, drops);
        key = JSON.stringify([P.rows, P.more, lootOpen, L.best && L.best.key, !!lootImg, drops && drops.date]);
      }
      // redrawn only when what it shows changes: a frame every second or so would take the focus and the press off its button
      key += '|' + pk.key;
      if (key !== lootKey) {
        lootKey = key;
        if (!L) after.push(el('p', { class: 'g-note' }, 'Your loot shows once your bag has been looked through twice, a minute or more apart.'));
        else if (!L.items.length) after.push(el('p', { class: 'g-note' }, 'Nothing new in your bag yet.'));
        else {
          const K = n => (n < 0 ? '−' : '') + fmtK(Math.abs(n));
          const worth = r => r.fm ? el('a', { href: COZY + r.fmCozy, target: '_blank', rel: 'noopener', 'aria-label': r.name + ' on Cozy Market, ' + K(r.fm) + ' FM' }, K(r.fm) + ' FM') : K(r.value);
          for (const r of P.rows) list.push(el('div', { class: 'k-row' }, el('span', { class: 'k-ring' + (L.best && r.key === L.best.key ? ' gold' : '') }, cellPic(r.cell) ? el('img', { src: cellPic(r.cell), alt: '' }) : null),
            el('span', { class: 'g-nnm' }, el('span', { class: 'g-nn' }, r.name), r.got ? el('span', { class: 'k-tag' }, r.got === 'sure' ? 'Got one!' : 'Got one?') : null,
              r.got === 'maybe' ? el('small', {}, 'might be ' + r.might + ', check your bag') : r.n > 1 && r.each ? el('small', {}, fmt(r.each) + ' each') : null),
            el('span', { class: 'g-lc' }, el('b', {}, '×' + fmt(r.n)), el('small', {}, worth(r)))));
          if (P.more || lootOpen) after.push(el('button', { type: 'button', class: 'linkish', id: 'g-lootmore', 'aria-expanded': String(lootOpen), onclick: () => { lootOpen = !lootOpen; render(); } }, lootOpen ? 'Show fewer' : 'Show ' + P.more + ' more'));
          // an FM price on screen always has its credit, even where Now grinding's foot is folded away
          if (P.rows.some(r => r.fm)) {
            const day = drops && drops.date && new Date(drops.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            after.push(el('p', { class: 'g-note g-credit' }, 'Prices from ', el('a', { href: 'https://cozy.markets/', target: '_blank', rel: 'noopener' }, 'Cozy Market'), day ? ', ' + day + '.' : '.'));
          }
          after.push(el('p', { class: 'g-note' }, 'Flip through Equip, Use and Etc to update it.'));
        }
        V.resLoot.replaceChildren(el('div', { class: 'g-res-h' }, 'What you picked up'), ...(list.length ? [el('div', { class: 'k-rows' }, ...list)] : []), ...after, ...pk.nodes);
      }
    }
    const lines = [];
    if (R.flipped) lines.push(el('div', {}, 'Mesos alone: ', el('b', { class: 'neg' }, money(R.mesosOnly)), '. Your loot turned it around.'));
    if (R.perPct != null) lines.push(el('div', {}, 'Each 1% EXP ' + (R.perPct >= 0 ? 'made you ' : 'cost you '), el('b', { class: tone(R.perPct) }, money(R.perPct)), ' mesos.'));
    V.resLines.replaceChildren(...lines); V.resLines.hidden = !lines.length;
    V.resNudge.hidden = loot || !!viewing;
  }
  // the three tabs' state during a flip-through: seen in full (with when), part way (needs a slower scroll), or not
  // yet. Shared by the main card's checklist (renderBag) and the pop out's chips (renderHealth).
  function bagTabStates(B) {
    return ['Equip', 'Use', 'Etc'].map(tab => {
      const A = B && B.acc[tab], full = B && B.done[tab] ? B.done[tab].t : B && B.last ? B.last.t : null;
      // pages of a tab not finished in this opening, unless this opening already made a set (they're left from it)
      const part = !!(A && A.strips.length) && !(B && B.done[tab]) && !(B && B.last && B.last.t >= B.openT);
      return { tab, state: part ? 'fix' : full ? 'done' : '', full };
    });
  }
  // the bag's three tabs under the switch: seen in full (when), part of it (scroll on), or not yet
  function renderBag() {
    const B = session && session.bag;
    bagCheck.hidden = !lootOn || !GS().bagListShows(session, Date.now());
    if (!lootOn) return;
    // the list goes once a flip is done, so its time stays in Notices
    if (B && B.last && st.bagNoted !== B.last.t) { st.bagNoted = B.last.t; st.noted.bag = null; noteOf('bag', 'done', 'Bag counted: Equip, Use and Etc', B.last.t); }
    for (const { tab, state, full } of bagTabStates(B)) {
      const li = bagCheck.querySelector('[data-k="bag-' + tab + '"]');
      li.className = state;
      li.lastChild.textContent = state === 'fix' ? 'Scroll to its top and bottom, slowly' : state === 'done' ? 'Seen at ' + timeOfDay(full) : 'Open it in your bag';
    }
  }
  // the pop out's potion clocks and session length tick every second between frames
  const ticker = setInterval(() => {
    if (!root.isConnected) { clearInterval(ticker); return; }
    if (!strip.hidden) guard('the pop-out panel', () => renderClocks(Date.now()));
  }, 1000);

  function renderPots(s) {
    const body = pots.tBodies[0];
    const list = s ? Object.values(s.slots).filter(sl => sl.id || sl.used).sort((a, b) => a.key.localeCompare(b.key)) : [];
    // redrawn only when a row changes: a price button keeps its focus between frames
    const key = JSON.stringify([list.map(sl => [sl.key, sl.id, sl.name, sl.big ? sl.big.v : sl.count, sl.used, sl.price]), !!viewing, Object.keys(pictures.Icons).length]);
    if (key === potsKey) return;
    potsKey = key;
    body.replaceChildren(...list.map(sl => el('tr', {},
      el('td', {}, sl.key.replace(/^p\d+$/, '·')),
      el('td', {}, pictures.Icons[sl.id] ? el('img', { class: 'g-ico', src: pictures.Icons[sl.id], alt: '' }) : null, sl.name),
      el('td', { class: 'n' }, viewing ? '·' : fmt(sl.big ? sl.big.v : sl.count)), el('td', { class: 'n' }, fmt(sl.used)),
      el('td', { class: 'n' }, sl.id && !viewing ? el('button', { type: 'button', class: 'g-price', title: sl.name + ' price, ' + fmt(sl.price) + '. Set what you paid', 'aria-label': sl.name + ' price, ' + fmt(sl.price) + '. Set what you paid', onclick: e => editPrice(e.currentTarget, sl) }, fmt(sl.price)) : fmt(sl.price || 0)),
      el('td', { class: 'n' }, fmtK(sl.used * (sl.price || 0))))));
    if (!list.length) body.append(el('tr', {}, el('td', { colspan: '6' }, 'Your quickslot potions show up here once the game is shared.')));
  }
  function editPrice(btn, sl) {
    editing = true;
    const box = el('input', { type: 'number', min: '0', value: String(sl.price), 'aria-label': sl.name + ' price' });
    const done = keep => {
      if (!editing) return;
      editing = false; potsKey = null;
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
    mapMobs = mobsOf(mapId).sort((a, b) => b.count - a.count);   // the card draws a column for each
    const a = avgExp(mapId);
    mapNote.textContent = a ? 'From the game\'s own data. Kills a minute is your EXP a minute ÷ ' + Math.round(a) + ', the average EXP a kill here, so it reads low while a party member shares your EXP.' : '';
  }

  /* ----- the Now grinding card, and this session on its band ----- */
  const iconOf = (id, name) => pictures.Icons[id] ? el('img', { src: pictures.Icons[id], alt: name }) : null;
  const usedOf = (s, id) => Object.values(s.slots).concat(s.retired || []).filter(x => String(x.id) === String(id)).reduce((a, x) => a + x.used, 0);
  // the panel's top strip goes shorter still: Remains <Tomb> II is Tomb II, and Line 1 <Area 2> is Line 1 Area 2
  const panelMap = id => shortMap(id).replace(/^.*<([^>]+)>\s+(\S.*)$/, '$1 $2').replace(/[<>]/g, '');
  // the band's line, as what to draw, so it's drawn again only when what it says changes: the minutes, EXP an hour against your
  // usual, EXP gained, mesos with the verdict, the Lemon and Meat counts for the whole session (and the main potion, when
  // it's something else), and the next level
  function bandParts(s, o, mains, R) {
    const usual = GS().standing(lastRows, { mapId: s.mapId || mapId, exceptId: s.id, metric: 'expHr', value: null }).usual;
    const pick = expPick(o, 'run', usual), dur = fmtDur(o.mins), min = /^(\d+) min$/.exec(dur), main = mains[0];
    const count = (ids, name) => ({ pic: ids.find(id => pictures.Icons[id]), name, n: ids.reduce((a, id) => a + usedOf(s, id), 0) });
    return [{ cls: 't', v: min ? min[1] : dur, label: min ? 'min' : '' },
      { cls: 'y', v: pick.value != null ? fmtK(pick.value) : '·', label: 'an hour', vs: pick.vs && { up: pick.vs.up, text: pick.vs.text + ' vs usual' } },
      { cls: 'b', v: fmt(o.exp), label: 'EXP' },
      R && R.total != null ? { cls: R.total < 0 ? 'r' : 'g', v: money(R.total), label: 'mesos' } : null,
      R && R.verdict ? { verdict: R.verdict } : null,
      count(LEMON_IDS, 'Lemons'), count(MEAT_IDS, 'Meat'),
      main && !LEMON_IDS.includes(+main.id) && !MEAT_IDS.includes(+main.id) ? count([+main.id], plural(main.name)) : null,
      o.hrsToLevel != null && s.level ? { cls: 'b', pre: 'Lv ' + (s.level + 1) + ' in', v: fmtDur(o.hrsToLevel * 60) } : null].filter(Boolean);
  }
  const bandPart = p => p.say ? el('span', { class: 'g-nm' }, p.say)
    : p.verdict ? el('span', { class: 'g-nk v ' + (p.verdict === 'Profitable' ? 'up' : 'down') }, p.verdict)
      : p.name ? el('span', { class: 'g-nk pic' }, iconOf(p.pic, p.name), el('b', {}, fmt(p.n)))
        : el('span', { class: 'g-nk ' + p.cls }, p.pre || null, el('b', {}, p.v), p.label || null, p.vs ? arrowed(el('em', { class: p.vs.up ? 'up' : 'down' }), p.vs.text) : null);
  let bandKey = null;
  function renderNow(s, o, mains, R) {
    moreBtn.hidden = (!s && !st.sharing) || !!viewing;
    if (viewing) return;   // a saved run folds the card to its title bar and button row
    const parts = s ? bandParts(s, o, mains, R) : st.sharing ? [{ say: 'Your session starts with your next EXP' }] : [];   // before sharing the steps say how to start
    const key = JSON.stringify(parts);
    if (key === bandKey) return;
    bandKey = key;
    V.now.replaceChildren(...parts.map(bandPart));
  }
  // the level: as read, else this session's, else the newest saved run's
  function levelNow() {
    if (st.level) return st.level;
    if (session && session.level) return session.level;
    let newest = null;
    for (const r of lastRows) if (r.level_end != null && (!newest || Date.parse(r.started_at) > Date.parse(newest.started_at))) newest = r;
    return newest ? newest.level_end : null;
  }
  // a saved run being viewed folds the card to its title bar and button row
  function renderCard() {
    nowCard.update({ fold: !!viewing, nums: !!(session || st.sharing), sharing: st.sharing, session: !!session, label: session && st.sharing && st.h.exp.ok != null ? 'Now grinding' : 'This map',
      mobs: mapMobs, mobIds: mapMobs.map(m => m.id), D: drops, sprites: mobSprites, L: lootIdx, cls: classId, level: levelNow(),
      noMap: !mapId, lemon: pictures.Icons[LEMON_IDS[0]] || null });
  }

  /* ----- saved sessions, and all time from them ----- */
  function listSessions() {
    // signed in: the account's sessions plus any the account didn't take yet, which are kept on this device
    const local = jget(KEY_LOCAL, []);
    const got = signedIn() ? api.listGrind().catch(() => []).then(rows => rows.concat(local.filter(l => !rows.some(r => r.id === l.id)))) : Promise.resolve(local);
    return got.then(rows => {
      lastRows = rows;
      renderLife();
      render();   // the band's usual and the card's level come from these rows
      listRuns();
    });
  }
  // Your runs: newest first, each a button that opens the run; the picture and the count for both potions, and the arrow against
  // your usual at its map
  const RUNS_SHOWN = 5;
  // New session, then Stop saves a run with nothing in it: it takes no row here (All time and the saved rows keep it)
  const emptyRun = r => !(r.exp > 0) && !(r.active_min >= 1);
  function listRuns() {
    const rows = lastRows, listed = rows.filter(r => !emptyRun(r));
    runsWin.hidden = !listed.length;   // a player with no runs yet sees no empty window
    life.hidden = runsWin.hidden && record.hidden;
    if (!listed.length) { runsMore.hidden = true; sessions.replaceChildren(el('p', { class: 'g-note' }, signedIn() ? 'No saved sessions yet.' : 'No sessions yet. Signed out, they stay on this device.')); return; }
    const newest = listed.sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at)), shown = runsOpen ? newest : newest.slice(0, RUNS_SHOWN);
    const lemonPic = picOf(LEMON_IDS), meatPic = picOf(MEAT_IDS);
    const pot = (pic, n, name) => el('span', { class: 'pot', title: fmt(n) + ' ' + name }, pic ? el('img', { src: pic, alt: name }) : name + ' ', el('b', {}, fmt(n)));
    sessions.replaceChildren(...shown.map(r => {
      const x = runRow(r, rows, { lemon: LEMON_IDS, meat: MEAT_IDS, fmtK, shortMap: panelMap });
      return el('button', { type: 'button', class: 'g-run' + (x.edge ? ' ' + x.edge : ''), onclick: () => openSession(r) },
        el('span', { class: 'where' }, el('b', {}, x.map), el('small', {}, x.when + (x.best ? ' · your best' : ''))),
        el('span', { class: 'xp' }, el('b', {}, x.expHr != null ? fmtK(x.expHr) : '·'), el('small', {}, 'an hour'), x.vs ? arrowed(el('em', { class: x.vs.sign === '▲' ? 'up' : 'down' }), x.vs.text) : null),
        pot(lemonPic, x.lemons, 'Lemons'), pot(meatPic, x.meat, 'Meat'), el('span', { class: 'ms' }, el('b', {}, x.mesos || '·')));
    }));
    runsMore.hidden = newest.length <= RUNS_SHOWN;
    runsMore.textContent = newest.length <= RUNS_SHOWN ? '' : runsOpen ? 'Show fewer' : 'Show more (' + (newest.length - RUNS_SHOWN) + ' older)';
    runsMore.setAttribute('aria-expanded', String(runsOpen));
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
    const L = lifetime(rows, { now: Date.now(), lemon: LEMON_IDS, meat: MEAT_IDS, mobs: data.mobs, maps: data.maps });
    alltime.update(L, { since: 'since you started tracking' + (signedIn() ? '' : ', on this device') + ' · ' + L.sessions + ' run' + (L.sessions === 1 ? '' : 's') });
    record.hidden = !L.sessions; life.hidden = runsWin.hidden && record.hidden;
    alltime.el.hidden = !(L.lemon.used || L.meat.used);   // a new player with nothing eaten doesn't see it
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
    const top = L.maps.slice(0, 5);
    LF.maps.replaceChildren(...(top.length ? top.map((m, i) => el('div', { class: 'k-row g-mrow' }, el('span', { class: 'g-rk' }, String(i + 1)),
      el('span', { class: 'g-nl' }, shortMap(m.id), el('small', {}, m.expHr != null ? fmtK(m.expHr) + ' an hour' : '·')), el('span', { class: 'g-nv' }, fmtDur(m.mins))))
      : [el('p', { class: 'g-note' }, 'Your maps show up after your first session. They go by the map picked under This map.')]));
    const when = r => shortMap(r.map_id) + ' · ' + new Date(Date.parse(r.started_at)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const best = (label, b, v) => b ? el('div', { class: 'k-row g-bi' }, el('span', { class: 'g-nl' }, label, el('small', {}, when(b.row))), el('span', { class: 'g-nv' }, v(b.v))) : null;
    const bests = [best('Best EXP an hour', L.best.expHr, fmtK), best('Longest session', L.best.longest, fmtDur),
      best('Most Lemons in one go', L.best.lemons, fmt), best('Cheapest 1%', L.best.cheap1, fmtK)].filter(Boolean);
    LF.bests.replaceChildren(...(bests.length ? bests : [el('p', { class: 'g-note' }, 'Your bests show up after a session of 10 minutes or more.')]));
    const shade = m => !m ? 0 : m < 60 ? 1 : m < 150 ? 2 : 3;
    LF.days.replaceChildren(...L.daysList.map(d => el('i', { class: 'g-d' + shade(d.mins), 'data-day': d.date,
      title: new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + (d.mins ? ' · ' + fmtDur(d.mins) : ' · no grinding') })));
    LF.daysNote.textContent = 'The last 30 days, darker is more time.' + (L.streak > 1 ? ' Best streak: ' + L.streak + ' days in a row.' : '');
  }

  showMap(); renderNotices(); render(); listSessions();
  // what the card needs comes after the page is up, each on its own: one that fails leaves the card as it was
  const dataFile = f => fetch('data/' + f).then(r => { if (!r.ok) throw new Error(f); return r.json(); });
  dataFile('grind-drops.json').then(D => { drops = D; fillClass(D); render(); }, () => {});
  dataFile('mob-sprites.json').then(S => { mobSprites = S; render(); }, () => {});
  loadSheet().catch(() => {});
  if (session) setStatus('Carrying on your session from ' + timeOfDay(session.t0) + (app ? '. Press Start to carry on.' : '. Share the game window to keep going.'));
  window.Grind.debug = { noteFrame, session: () => session, state: () => ({ reads: st.reads, ticks: st.ticks, line: st.line, m: st.m, level: st.level }),
    // the overlay, opened as Start opens it (the app's own test); resolves to whether it's open
    overlay: () => (overlay.win() ? Promise.resolve() : popOut()).then(() => !!overlay.win()),
    setCheck, save: () => save(true), load: row => { viewing = GS().fromRow(row, eatCfg()); render(); }, capture: () => capture, mesoLine, lootReady: () => lootReady,
    // a session carried in whole (the page tests' mockup session), as if it had been read here
    use: x => { session = x; viewing = null; if (!session.eat) session.eat = eatCfg(); session.mode = lootOn ? 'loot' : 'track'; render(); } };
  // what a Something off? report carries from this tab (index.html keeps it), and the pop out to draw beside the page
  const reporter = {
    report: () => ({ sharing: st.sharing, ticks: st.ticks, reads: st.reads, frame: [st.fw, st.fh],
      stretch: st.m ? { s: st.m.s, score: st.m.score, countScore: st.m.countScore } : null, line: st.line, level: st.level,
      greenProbe: st.probe || null,
      can: { share: !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia), frames: typeof MediaStreamTrackProcessor === 'function', popout: !!window.documentPictureInPicture, platform: (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '' },
      slots: st.slots, mesos: st.mesos == null ? null : st.mesos, mesoHome: MS().mesoHome(), checks: lastHealth, recent: st.recent.slice(), drawError,
      map: mapId, session: session ? GS().stats(session, Date.now(), avgExp(session.mapId || mapId)) : null, popout: overlay.win() ? { layout } : null,
      // Count my loot: the switch, how far each tab's flip got, the bag sets, shop visits and prices learned
      loot: { on: lootOn, mode: session ? session.mode : null, pictures: lootReady, sets: session && session.bag ? session.bag.sets : 0,
        acc: session && session.bag ? Object.fromEntries(Object.entries(session.bag.acc).map(([k, a]) => [k, a.strips.map(x => ({ rows: x.rows.length, top: x.top, bottom: x.bottom }))])) : null,
        shop: session && session.shop ? { open: session.shop.open, visits: session.shop.visits.length } : null, learned: session ? session.learned || [] : [],
        needsFlip: !!st.needsFlip, pickups: PICKUPS && session ? GS().pickups(session) : null } }),
    popout: () => overlay.win() ? overlay.win().document.body : null,
  };
  window.Grind.debug.report = reporter.report;
  return reporter;
}

window.Grind = { mount, perFmt, perLine, runRow, railIcon, RAIL_ICONS, pixelSvg, arrowed, fmtK, clock, health, potionTile, potionTiles, expPick, elapsedSecs, lifetime, lootItem, eatLines };
})();
