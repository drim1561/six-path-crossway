// Grind tab (#grind): one click EXP and potion tracker. Share the game window and everything reads itself (screen.js):
// the EXP line, the game's stretch, the level, every quickslot potion and the party. grind-session.js turns the readings
// into minutes and numbers; this file draws the setup checklist, the card with the potion countdown, the potions list,
// the map panel and the saved sessions, and saves to the player's private grind_sessions rows or this device.
// Design: docs/superpowers/specs/2026-10-31-grind-tab-design.md
(function () {
'use strict';

const MS = () => window.MapleScreen, GS = () => window.GrindSession;
const KEY_OPEN = 'grind.open', KEY_LOCAL = 'grind.local', KEY_PRICES = 'grind.prices', KEY_MAP = 'grind.map';
const RESUME_MS = 30 * 60000, SAVE_MS = 60000, LEVEL_EVERY = 20, PARTY_EVERY = 2, ICON_EVERY = 40;

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
// current run of misses began (null while it works). meso: { at, unclear }, etc: { at }: the last inventory looks.
// Returns six checks (ok green, wait amber, bad red), the one thing to do (most important first) and stuck, which lights
// up Find my game again. Red is kept for what breaks the core numbers; mesos and etc only ever ask.
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
  C.party = f.party ? { state: 'ok', text: f.party === 1 ? 'solo' : String(f.party) } : { state: 'wait', text: 'looking' };
  const mesoStale = f.meso.at != null && t - f.meso.at > STALE_MS;
  C.mesos = f.meso.unclear ? { state: 'wait', text: "can't read clearly" } : f.meso.at == null ? { state: 'wait', text: 'open inventory' } : { state: mesoStale ? 'wait' : 'ok', text: ago(f.meso.at) };
  const afterTown = f.etc.at != null && f.refillAt != null && f.refillAt > f.etc.at;
  C.etc = f.etc.at == null ? { state: 'wait', text: 'not seen' } : afterTown ? { state: 'wait', text: 'look again' } : { state: 'ok', text: ago(f.etc.at) };

  const stuck = ['exp', 'potions', 'level'].some(k => C[k].state === 'bad');
  const say = (state, text) => ({ checks: C, nudge: { state, text }, stuck });
  if (!f.sharing) return say('idle', f.hasSession ? 'Share stopped. Share the game window again to carry on' : 'Share the game window to start');
  if (C.exp.state === 'bad') return say('bad', "Can't see your EXP bar, paused. Is the game still shared, with the bar showing?");
  if (stuckOn(f.size)) return say('bad', "Can't measure the game. Share the game window itself, at full size");
  if (C.potions.state === 'bad') return say('bad', "Can't read your quickslot numbers. Make the game window bigger, or share it again");
  if (C.level.state === 'bad') return say('bad', "Can't read your level. Try Find my game again");
  if (f.exp.ok == null || f.size.ok == null) return say('wait', 'Looking for your game…');
  if (f.potNone) return say('wait', 'Put the potions you drink on your quickslots so they count');
  if (afterTown) return say('wait', "Back from town? Open your Etc tab for a moment so what you sold doesn't count twice");
  if (f.meso.unclear) return say('wait', "Can't read your meso total clearly yet. Move the mouse off it");
  if ((f.meso.at == null || mesoStale) && f.etc.at == null) return say('wait', 'Open your inventory on the Etc tab for a moment, so mesos and etc items count');
  if (f.meso.at == null) return say('wait', 'Open your inventory for a moment so mesos count');
  if (mesoStale) return say('wait', 'Mesos last seen ' + ago(f.meso.at) + '. Open your inventory for a moment');
  if (f.etc.at == null) return say('wait', 'Open the Etc tab in your inventory once, so etc items count');
  return say('ok', 'Reading everything');
}

/* ---------- the tab ---------- */

function mount(root, deps) {
  const { el, store, api, data, pictures } = deps;
  const jget = (k, d) => { try { const v = store.get(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const jset = (k, v) => store.set(k, JSON.stringify(v));
  const prices = jget(KEY_PRICES, {});
  let mapId = +store.get(KEY_MAP) || 10004134;
  let session = null, viewing = null, editing = false, picturesReady = false;
  let cd = null, lastHealth = null;   // the potion countdown and the checks, as last drawn
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

  /* ----- layout ----- */
  const status = el('p', { class: 'g-status', id: 'g-status' });
  const shareArea = el('div', { id: 'g-sharearea' });
  const newBtn = el('button', { type: 'button', id: 'g-new', onclick: () => newSession() }, 'New session');
  // the next frame from the share comes down as a picture, to send when something reads wrong
  const snapBtn = el('button', { type: 'button', id: 'g-snap', onclick: () => { st.wantSnap = true; setStatus('Saving the next frame from your game…'); } }, 'Save a frame');
  // the quick reset: look for the bars, measure and name the potions again, keeping the session
  const refindBtn = el('button', { type: 'button', id: 'g-refind', onclick: () => refind() }, 'Find my game again');
  // a fresh average from now on, to try another way of grinding; the session average keeps going
  const markBtn = el('button', { type: 'button', id: 'g-mark', onclick: () => resetAverage() }, 'Reset average');
  const HEALTH = [['exp', 'EXP'], ['level', 'Level'], ['potions', 'Potions'], ['party', 'Party'], ['mesos', 'Mesos'], ['etc', 'Etc']];
  const SIGN = { ok: '✓', wait: '!', bad: '✕', idle: '·' };
  const CHECKS = [['exp', 'EXP line'], ['size', 'Game size'], ['level', 'Level'], ['potions', 'Potions'], ['party', 'Party'], ['mesos', 'Mesos']];
  const NEEDED = ['exp', 'size', 'level', 'potions', 'party'];   // mesos only come when the inventory opens
  const check = el('ul', { class: 'g-check', id: 'g-check' }, CHECKS.map(([k, label]) => el('li', { 'data-k': k }, el('b', {}, label), el('span', {}, 'Looking…'))));
  const V = {};
  const row = (k, label, strong) => el('div', { class: 'g-row' }, strong ? el('b', {}, label) : el('span', {}, label), V[k] = el(strong ? 'b' : 'span', {}, '·'));
  const card = el('div', { class: 'g-card', id: 'g-card' },
    el('div', { class: 'g-kpis' },
      el('div', {}, el('div', { class: 'g-lbl' }, 'EXP per hour'), V.expHr = el('div', { class: 'g-big', id: 'g-exphr' }, '·')),
      el('div', { id: 'g-mesokpi' }, el('div', { class: 'g-lbl' }, 'Mesos earned'), V.mesoBig = el('div', { class: 'g-big' }, '·'),
        V.mesoSub = el('div', { class: 'g-sub' }, 'Open your inventory on the Etc tab now and then to start counting'))),
    V.health = el('div', { class: 'g-health', id: 'g-health' }, HEALTH.map(([k]) => el('span', { class: 'g-hc wait', 'data-k': k }))),
    V.nudge = el('div', { class: 'g-nudge idle', id: 'g-nudge' }, 'Share the game window to start'),
    V.sub = el('div', { class: 'g-sub' }, 'Share the game window to start'), V.pace = el('div', { class: 'g-sub', id: 'g-pace' }), V.next = el('div', { class: 'g-sub' }),
    el('div', { class: 'g-cd', id: 'g-cd' }, V.cdIcon = el('img', { alt: '', hidden: '' }),
      el('div', {}, V.cdLabel = el('div', { class: 'g-lbl' }, 'Potions out in'), V.clock = el('div', { class: 'g-clock' }, '··:··'),
        V.cdSub = el('div', { class: 'g-sub' }, 'Starts once you drink a few potions'), V.low = el('div', { class: 'g-low', hidden: '' }))),
    V.verdict = el('div', { class: 'g-verdict', id: 'g-verdict', hidden: '' }), V.mesos = el('div', { class: 'g-sub', id: 'g-mesos' }, 'Mesos: open your inventory now and then to count them'),
    // a big jump between peeks: a trade or a big buy isn't grinding, so it asks
    V.trade = el('div', { class: 'g-nudge wait', id: 'g-trade', hidden: '' }, V.tradeQ = el('span', {}), ' ',
      el('button', { type: 'button', id: 'g-tradeyes', onclick: () => answerJump(true) }, 'Leave it out'), ' ',
      el('button', { type: 'button', id: 'g-tradeno', onclick: () => answerJump(false) }, 'Keep it')),
    V.tradeBox = el('div', { class: 'g-tradebox', id: 'g-tradebox' }, el('button', { type: 'button', class: 'linkish', id: 'g-tradebtn', onclick: () => openTrade() }, 'Leave out a trade')),
    row('gain', 'EXP gained'), row('time', 'Time'), row('kpm', 'Kills a minute'), row('pots', 'Potions used'),
    row('costHr', 'Potions an hour', true), row('per1', 'Cost per 1%', true),
    el('div', { class: 'g-row' }, V.perPotL = el('span', {}, 'Potions per 1%'), V.perPot = el('span', {}, '·')),
    V.perPot2Row = el('div', { class: 'g-row', hidden: '' }, V.perPot2L = el('span', {}), V.perPot2 = el('span', {}, '·')), row('party', 'Party'), row('level', 'Level'));
  // the pop out over the game: one slim dark strip, built here and moved into the pop out window. Line 1 the big numbers
  // and a dot per check (a dot that isn't green says its name), line 2 the rest, line 3 only when it needs you.
  const SP = {};
  const sep = () => el('span', { class: 'g-sep' }, '|');
  const strip = el('div', { class: 'g-strip', id: 'g-strip', hidden: '' },
    el('div', { class: 'g-l1' }, SP.clocks = el('span', { class: 'g-clocks' }, el('b', {}, '··:··')),
      sep(), SP.exp = el('b', {}, '·'), el('small', {}, 'exp/hr'), sep(), SP.pct = el('b', {}, '·'), el('small', {}, '/hr'),
      sep(), SP.meso = el('b', {}, '·'), el('small', {}, 'mesos'), sep(), SP.profit = el('b', {}, '·'), el('small', {}, 'profit'),
      SP.dots = el('span', { class: 'g-dots' }, ['exp', 'level', 'potions', 'mesos', 'etc'].map(k => el('span', { class: 'g-dw', 'data-k': k }, el('i', { class: 'g-dot' }), el('small', {}))))),
    SP.lp = el('div', { class: 'g-lp' }),
    SP.l2 = el('div', { class: 'g-l2' }),
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
  const mobs = el('tbody', {}), mapNote = el('p', { class: 'g-note' });
  const sessions = el('div', { class: 'g-sess', id: 'g-sessions' });
  const popBtn = el('button', { type: 'button', id: 'g-pop', onclick: () => popOut() }, 'Pop out over the game');
  const tiles = el('div', { class: 'g-tiles', id: 'g-tiles' });
  const chartA = el('div', { id: 'g-chart-a', class: 'g-chart' }), chartB = el('div', { id: 'g-chart-b', class: 'g-chart' }), heat = el('div', { id: 'g-heat', class: 'g-chart' });
  const tip = el('div', { id: 'g-tip', class: 'g-tip', hidden: '' });
  const table = el('table', { class: 'b-table', id: 'g-table', hidden: '' },
    el('thead', {}, el('tr', {}, ['Minute', 'Time', 'EXP', 'Potions', 'Party'].map((h, i) => el('th', i > 1 ? { class: 'n' } : {}, h)))), el('tbody', {}));
  const tableBtn = el('button', { type: 'button', id: 'g-showtable', class: 'linkish', onclick: () => { table.hidden = !table.hidden; tableBtn.textContent = table.hidden ? 'Show as table' : 'Hide the table'; render(); } }, 'Show as table');
  const partyCompare = el('p', { class: 'g-note', id: 'g-party-compare' });
  const charts = el('div', { class: 'g-charts', id: 'g-charts' },
    el('h3', {}, 'Right now'), tiles,
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
    readyText.textContent = '✓ Reading your game · Level ' + st.level + ' · ' + namedCount + ' potion' + (namedCount === 1 ? '' : 's') + ' · ' + (st.party === 1 ? 'Solo' : 'party of ' + st.party) + ' · ' + (st.mesos != null ? fmt(st.mesos) + ' mesos' : st.mesoUnclear ? 'mesos unclear' : 'open your inventory for mesos');
  }
  root.replaceChildren(
    el('h2', {}, 'Grind'),
    el('p', { class: 'g-lead' }, 'Share the game window and grind. Your EXP, level, potions and party read themselves, nothing to type.'),
    shareArea, status,
    el('div', { class: 'g-top' }, el('div', {}, card, el('div', { class: 'r-bar', style: 'margin-top:10px' }, popBtn, markBtn, refindBtn, newBtn, snapBtn)), el('div', {}, ready, check, viewBar)),
    charts,
    el('h3', {}, 'Potions'), el('div', { class: 'g-scroll' }, pots),
    el('p', { class: 'g-note' }, 'Keep every potion you drink on a quickslot (the hotkey grid at the bottom right): a count going down is a potion drunk, a count jumping up is a refill. Each one is matched to the game\'s own potion picture. Prices start at 10 times what the NPC pays (a Lemon is 150); tap a price to set what you really paid, and refills you already made follow it.'),
    el('h3', {}, 'This map'), mapSel, el('div', { class: 'g-scroll', style: 'margin-top:10px' },
      el('table', { class: 'b-table' }, el('thead', {}, el('tr', {}, ['Monster', 'Lv', 'EXP', 'HP', 'On map', ''].map((h, i) => el('th', i && i < 5 ? { class: 'n' } : {}, h)))), mobs)), mapNote,
    el('h3', {}, 'Your sessions'), sessions,
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
    if (w !== st.fw || h !== st.fh) { st.fw = w; st.fh = h; st.line = null; }   // the window changed size
    // the inventory's meso box: every tick while it's open, every third tick while looking for it (a full look takes a moment)
    let mesos = null, etc = null;
    if (st.mesoOpen || st.ticks % 3 === 1) {
      const mr = S.readMesos(src);
      st.mesoOpen = mr.reason !== 'no inventory';
      st.mesoUnclear = !mr.ok && mr.reason !== 'no inventory';
      // the open tab and, on the Etc tab, every etc item and its count (every other tick: it's the slowest read)
      if (mr.reason !== 'no inventory' && (st.ticks % 2 === 0 || !st.tab)) {
        const inv = S.readInventory(src);
        if (inv.ok) {
          st.tab = inv.tab;
          if (inv.tab === 'Etc') {
            const known = inv.slots.filter(q => q.id && data.etc[q.id]);
            etc = known.map(q => ({ id: q.id, name: data.etc[q.id][0], price: data.etc[q.id][1], count: q.value }));
            st.etcKinds = new Set(known.map(q => q.id)).size;
          }
        }
      }
      const etcPart = st.tab === 'Etc' ? ' · ' + st.etcKinds + ' etc kinds' : ' · open the Etc tab to count etc items';
      if (mr.ok) { mesos = mr.value; st.mesos = mr.value; setCheck('mesos', 'done', fmt(mr.value) + ' at ' + timeOfDay(Date.now()) + etcPart); }
      else if (mr.reason !== 'no inventory') setCheck('mesos', 'fix', "Can't read your mesos clearly (a tooltip over them, or a digit it hasn't learned yet)");
      else if (st.mesos == null) setCheck('mesos', '', 'Open your inventory now and then');
    }
    if ((mesos != null || etc) && session) GS().add(session, Object.assign({ t: Date.now() }, mesos != null ? { mesos } : {}, etc ? { etc } : {}));
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
      // the engine changes the party size only when two of these reads agree
      if (st.ticks % PARTY_EVERY === 0 || !session || !session.partyNow) {
        const pr = S.readParty(src, st.line, st.m);
        if (pr.sure) reading.party = pr.n;
      }
    }
    if (reading.exp != null || reading.counts.length) {
      if (!session) session = GS().create({ mapId, t: reading.t, prices });
      GS().add(session, reading); st.reads++;
    }
    st.party = session && session.partyNow ? session.partyNow : null;
    if (st.party) setCheck('party', 'done', st.party === 1 ? 'Solo' : 'party of ' + st.party);
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
  function save(force) {
    if (!session) return Promise.resolve();
    const now = Date.now();
    if (!force && now - st.lastSave < SAVE_MS) return Promise.resolve();
    st.lastSave = now;
    jset(KEY_OPEN, session);
    const row = GS().toRow(session);
    if (!signedIn()) {
      jset(KEY_LOCAL, [row].concat(jget(KEY_LOCAL, []).filter(r => r.id !== row.id)).slice(0, 50));
      listSessions();
      return Promise.resolve();
    }
    // a row the account didn't take is kept on the device too, so starting a new session can't lose it
    const keepLocal = r => jset(KEY_LOCAL, [r].concat(jget(KEY_LOCAL, []).filter(x => x.id !== r.id)).slice(0, 50));
    return api.saveGrind(row).then(() => { jset(KEY_LOCAL, jget(KEY_LOCAL, []).filter(x => x.id !== row.id)); listSessions(); },
      e => { keepLocal(row); listSessions(); setStatus('Saved on this device only, your account didn\'t take it (' + e.message + '). It tries again in a minute.'); });
  }
  // the quick reset: forget where the game was (bars, size, which potion sits on each key, the inventory) and look again;
  // the session and every number in it stay
  function refind() {
    Object.assign(st, { line: null, m: null, measureAt: 0, levelAt: 0, expMiss: 0, slots: {}, tab: null, mesoOpen: false, h: fresh() });
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
    copy: { share: 'Share game window' },
    onImage: frame, say: setStatus,
    onState: (state, why) => {
      st.sharing = state === 'sharing'; render();
      if (state === 'sharing') { setStatus('Watching. Pick the Window tab and MapleStory if you haven\'t.'); return; }
      setStatus(why === 'denied' ? 'Sharing was turned down. Press Share game window to try again.' : 'Stopped. This session is kept, share again to carry on.');
      save(true);
    } });

  /* ----- drawing ----- */
  function render() {
    const s = viewing || session;
    viewBar.hidden = !viewing;
    if (viewing) V.viewing.textContent = 'Looking at ' + mapName(viewing.mapId) + ', ' + dateOf(viewing.t0);
    if (!editing) renderPots(s);
    renderHealth();
    charts.hidden = !s;
    if (!s) { fitStrip(); return; }
    const t = viewing ? s.tLast : Date.now(), o = GS().stats(s, t, avgExp(s.mapId || mapId));
    V.expHr.textContent = o.expHr != null ? fmtK(o.expHr) : '·';
    V.sub.textContent = o.expMin != null ? fmt(o.expMin) + ' a minute · ' + o.pctHr.toFixed(2) + '% an hour' : 'Needs 2 minutes of EXP first';
    V.pace.hidden = !!viewing;
    V.pace.textContent = paceParts(o, true).map(p => p.label + ' ' + p.value + (p.vs ? ' ' + p.vs : '') + (p.extra ? ' · ' + p.extra : '')).join(' · ');
    V.next.textContent = o.hrsToLevel != null ? 'Level ' + ((s.level || 0) + 1) + ' at ' + timeOfDay(t + o.hrsToLevel * 3600000) + ', in ' + fmtDur(o.hrsToLevel * 60) : '';
    V.gain.textContent = fmt(o.exp) + ' · ' + o.pct.toFixed(2) + '%' + (o.deaths ? ' · ' + deathText(o) : '');
    V.time.textContent = fmtDur(o.mins);
    V.kpm.textContent = o.kpm != null ? 'about ' + o.kpm.toFixed(1) : '·';
    V.pots.textContent = o.potUsed ? fmt(o.potUsed) + ' · ' + fmtK(o.potCost) : '·';
    V.costHr.textContent = o.costHr != null ? fmtK(o.costHr) : '·';
    V.per1.textContent = o.per1 != null ? fmtK(o.per1) : '·';
    const lastParty = viewing ? (s.minutes.length ? s.minutes[s.minutes.length - 1].party : null) : st.party;
    V.party.textContent = lastParty == null ? '·' : lastParty === 1 ? 'Solo' : lastParty + ' of you';
    V.level.textContent = s.level ? s.level + (s.last ? ' · ' + s.last.pct.toFixed(2) + '%' : '') : '·';
    renderCountdown(s, t);
    const mains = mainPotions(s, o), main = mains[0] || null, second = mains[1] || null;
    V.perPotL.textContent = (main ? plural(main.name) : 'Potions') + ' per 1%';
    V.perPot.textContent = main && o.perPct[main.id] != null ? perFmt(o.perPct[main.id]) : '·';
    V.perPot2Row.hidden = !second;
    if (second) { V.perPot2L.textContent = plural(second.name) + ' per 1%'; V.perPot2.textContent = o.perPct[second.id] != null ? perFmt(o.perPct[second.id]) : '·'; }
    renderMesos(s, o);
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

  /* ----- is it reading everything: checks on the card, the one thing to do, and the strip's dots ----- */
  function renderHealth() {
    const s = session;
    const h = lastHealth = health({ t: Date.now(), sharing: st.sharing, hasSession: !!s, exp: st.h.exp, level: st.h.level, levelNow: st.level,
      size: st.h.size, counts: st.h.counts, potNone: st.potNone, potCount: st.potCount, party: st.party,
      meso: { at: s && s.meso && s.meso.last ? s.meso.last.t : null, unclear: !!(st.mesoOpen && st.mesoUnclear) },
      etc: { at: s && s.etcs && s.etcs.last ? s.etcs.last.t : null }, refillAt: s && s.lastRefill || null });
    // a saved session being looked at isn't live, so its card has no checks
    V.health.hidden = V.nudge.hidden = !!viewing;
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

  /* ----- the strip: the clock, EXP an hour, mesos and the dots; a second line with the rest, or the one thing to do ----- */
  function renderStrip(s, o, mains) {
    // a clock for each of the two potions running out first (Lemons and Meat), the first one leading
    SP.ticks = viewing ? [] : GS().countdowns(s, Date.now()).slice(0, 2);
    SP.clocks.replaceChildren(...(SP.ticks.length ? SP.ticks.map((c, i) => el('span', { class: 'g-clk' }, i ? el('span', { class: 'g-sep' }, '|') : '',
      pictures.Icons[c.id] ? el('img', { src: pictures.Icons[c.id], alt: c.name }) : el('small', {}, c.name), el('b', {}, clock((c.doneAt - Date.now()) / 1000)),
      el('small', {}, fmt(c.left) + ' left'))) : [el('b', {}, '··:··')]));
    SP.exp.textContent = o.expHr != null ? fmtK(o.expHr) : '·';
    SP.pct.textContent = o.pctHr != null ? o.pctHr.toFixed(2) + '%' : '·';
    SP.meso.textContent = o.mesosEarned != null ? (o.mesosEarned >= 0 ? '+' : '−') + fmtK(Math.abs(o.mesosEarned)) : o.mesoLooks >= 1 ? '+0' : '·';
    SP.profit.textContent = o.profitHr != null ? (o.profitHr >= 0 ? '▲ +' : '▼ −') + fmtK(Math.abs(o.profitHr)) + '/hr' : '·';
    SP.profit.className = o.profitHr == null ? '' : o.profitHr >= 0 ? 'up' : 'down';
    // the pace line, live only, with Reset average right there so it can be pressed without leaving the game
    SP.lp.hidden = !!viewing;
    SP.lp.replaceChildren(...paceParts(o, false).map(p => el('span', {}, el('small', {}, p.label + ' '), el('b', {}, p.value),
      p.vs ? el('span', { class: p.up ? 'up' : 'down' }, ' ' + p.vs) : '', p.extra ? el('small', {}, ' · ' + p.extra) : '')),
      el('button', { type: 'button', onclick: () => resetAverage() }, '↺ Reset average'));
    const bits = [];
    if (o.hrsToLevel != null) bits.push(el('span', {}, 'Lv ' + ((s.level || 0) + 1) + ' in ', el('b', {}, fmtDur(o.hrsToLevel * 60))));
    for (const p of mains) if (o.perPct[p.id] != null) bits.push(el('span', {}, pictures.Icons[p.id] ? el('img', { src: pictures.Icons[p.id], alt: p.name }) : p.name + ' ', el('b', {}, perFmt(o.perPct[p.id])), ' per 1%'));
    if (o.per1 != null) bits.push(el('span', {}, '1% costs ', el('b', {}, fmtK(o.per1))));
    if (o.costHr != null) bits.push(el('span', {}, 'pots ', el('b', {}, fmtK(o.costHr)), '/hr'));
    bits.push(el('span', {}, el('b', {}, '+' + o.pct.toFixed(2) + '%'), ' gained'));
    if (o.deaths) bits.push(el('span', { class: 'down' }, deathText(o)));
    bits.push(el('b', {}, fmtDur(o.mins)));
    SP.l2.replaceChildren(...bits);
  }
  // the strip fits its pop out window: the text as big as the widest line and all the lines allow (each stays on one
  // row; the one thing to do may wrap, so the height is checked again at the new size)
  function fitStrip() {
    const w = strip.ownerDocument.defaultView;
    if (strip.hidden || !w || w === window) return;
    strip.style.fontSize = '16px'; strip.style.width = 'max-content'; SP.l3.style.display = 'none';
    const nat = strip.getBoundingClientRect();
    strip.style.width = ''; SP.l3.style.display = '';
    let f = Math.max(8, Math.min(40, 16 * Math.min(w.innerWidth / nat.width, w.innerHeight / nat.height)));
    strip.style.fontSize = f + 'px';
    const tall = strip.scrollHeight;
    if (tall > w.innerHeight) strip.style.fontSize = Math.max(8, f * w.innerHeight / tall) + 'px';
  }

  /* ----- charts: A EXP every minute, B potions every minute, C runway tiles, D the minute heatmap ----- */
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
    // C
    const live = !viewing, cdNow = live ? GS().countdown(s, t) : null, last = ms.length > 1 ? ms[ms.length - 2] : null;
    const tile = (label, value, sub) => el('div', { class: 'g-tile' }, el('div', { class: 'g-lbl' }, label), el('div', { class: 'g-tv' }, value), el('div', { class: 'g-sub' }, sub));
    const thisMin = last && avg ? Math.round((last.exp / avg - 1) * 100) : null;
    const pm = n => (n >= 0 ? '+' : '−') + fmt(Math.abs(n));
    tiles.replaceChildren(
      // the big numbers live here too, so the page keeps them while the card is popped out over the game
      tile('EXP per hour', o.expHr != null ? fmtK(o.expHr) : '·', o.expMin != null ? fmt(o.expMin) + ' a minute' : 'needs 2 minutes'),
      tile('Mesos earned', o.mesosEarned != null ? pm(o.mesosEarned) : '·', o.mesosHr != null ? fmtK(o.mesosHr) + ' an hour' : 'open your inventory now and then'),
      tile('Profit', o.profit != null ? pm(o.profit) : '·', o.profitHr != null ? (o.profitHr >= 0 ? '▲ ' : '▼ ') + fmtK(Math.abs(o.profitHr)) + ' an hour' : 'mesos + etc − potions'),
      tile('Potions an hour', o.costHr != null ? fmtK(o.costHr) : '·', o.potUsed ? fmt(o.potUsed) + ' drunk · ' + fmtK(o.potCost) : 'none yet'),
      tile(cdNow && !cdNow.measuring ? plural(cdNow.name) + ' out in' : 'Potions out in', cdNow && !cdNow.measuring ? clock((cdNow.doneAt - Date.now()) / 1000) : '·', cdNow && !cdNow.measuring ? fmt(cdNow.left) + ' left' : cdNow ? 'measuring' : 'once you drink'),
      tile('Next level at', o.hrsToLevel != null ? timeOfDay(t + o.hrsToLevel * 3600000) : '·', o.hrsToLevel != null ? fmtDur(o.hrsToLevel * 60) + ' at this pace' : 'needs 2 minutes'),
      tile('Last minute', last ? fmt(last.exp) + ' EXP' : '·', thisMin == null ? '·' : Math.abs(thisMin) < 1 ? 'right on your average' : Math.abs(thisMin) + '% ' + (thisMin > 0 ? 'above' : 'below') + ' your average'),
      tile('Party', st.party && live ? (st.party === 1 ? 'Solo' : st.party + ' of you') : ms.length && ms[ms.length - 1].party ? (ms[ms.length - 1].party === 1 ? 'Solo' : ms[ms.length - 1].party + ' of you') : '·', 'counted from the party list'));
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
    documentPictureInPicture.requestWindow({ width: 640, height: 156 }).then(pip => {
      const d = pip.document;
      for (const ss of document.styleSheets) {
        try { const s = d.createElement('style'); s.textContent = Array.from(ss.cssRules).map(r => r.cssText).join('\n'); d.head.append(s); } catch (e) { /* a stylesheet from another site */ }
      }
      if (document.documentElement.dataset.theme) d.documentElement.dataset.theme = document.documentElement.dataset.theme;
      d.title = 'Grind';
      d.body.className = 'g-pip';
      strip.hidden = false;
      const wrap = d.createElement('div'); wrap.id = 'view-grind'; wrap.append(strip); d.body.append(wrap);
      pip.addEventListener('pagehide', () => { strip.hidden = true; strip.style.fontSize = ''; root.append(strip); });
      pip.addEventListener('resize', fitStrip);
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
    // one look is only where the count starts: earnings show once a later look is a minute or more after it
    else if (o.mesoLooks >= 1) { V.mesoBig.textContent = '+0'; V.mesoSub.textContent = 'Counting from ' + fmt(s.meso.first.v) + '. Open your inventory again in a few minutes'; }
    else { V.mesoBig.textContent = '·'; V.mesoSub.textContent = st.mesoUnclear ? "Can't read your mesos clearly yet" : 'Open your inventory on the Etc tab now and then to start counting'; }
    // profit: mesos earned + etc picked up - potions drunk
    V.verdict.hidden = o.profit == null;
    if (o.profit != null) {
      const up = (o.profitHr != null ? o.profitHr : o.profit) >= 0;
      V.verdict.className = 'g-verdict ' + (up ? 'up' : 'down');
      V.verdict.textContent = (up ? '▲ Profit +' : '▼ Loss −') + fmt(Math.abs(o.profit)) + (o.profitHr != null ? ' · ' + fmtK(Math.abs(o.profitHr)) + ' an hour' : '');
    }
  }
  function renderCountdown(s, t) {
    cd = viewing ? null : GS().countdown(s, t);
    const real = cd && !cd.measuring;
    V.cdIcon.hidden = !real;
    if (real && pictures.Icons[cd.id]) V.cdIcon.src = pictures.Icons[cd.id];
    V.cdLabel.textContent = real ? plural(cd.name) + ' out in' : 'Potions out in';
    V.clock.textContent = real ? clock((cd.doneAt - Date.now()) / 1000) : cd && cd.measuring ? 'Measuring…' : '··:··';
    V.cdSub.textContent = real ? fmt(cd.left) + ' left · done around ' + timeOfDay(cd.doneAt) : cd && cd.measuring ? 'Give it 2 minutes of drinking' : 'Starts once you drink a few potions';
    V.low.hidden = !(real && cd.low);
    V.low.textContent = real ? '⚠ ' + plural(cd.name) + ' almost out' : '';
  }
  // the clock ticks every second between frames
  const ticker = setInterval(() => {
    if (!root.isConnected) { clearInterval(ticker); return; }
    if (cd && !cd.measuring) V.clock.textContent = clock((cd.doneAt - Date.now()) / 1000);
    SP.clocks.querySelectorAll('.g-clk b').forEach((b, i) => { const c = (SP.ticks || [])[i]; if (c) b.textContent = clock((c.doneAt - Date.now()) / 1000); });
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
    mobs.replaceChildren(...mobsOf(mapId).map(m => el('tr', {}, el('td', {}, m.name), el('td', { class: 'n' }, String(m.level)), el('td', { class: 'n' }, fmt(m.exp)),
      el('td', { class: 'n' }, fmt(m.hp)), el('td', { class: 'n' }, String(m.count)), el('td', {}, m.undead ? el('span', { class: 'g-chip' }, 'undead · Heal hits it') : null))));
    const a = avgExp(mapId);
    mapNote.textContent = a ? 'From the game\'s own data. Kills a minute is your EXP a minute ÷ ' + Math.round(a) + ', the average EXP a kill here, so it reads low while a party member shares your EXP.' : '';
  }

  /* ----- saved sessions ----- */
  function listSessions() {
    // signed in: the account's sessions plus any the account didn't take yet, which are kept on this device
    const local = jget(KEY_LOCAL, []);
    const got = signedIn() ? api.listGrind().catch(() => []).then(rows => rows.concat(local.filter(l => !rows.some(r => r.id === l.id)))) : Promise.resolve(local);
    return got.then(rows => {
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
    const full = r.minutes ? Promise.resolve(r) : api.getGrind(r.id);
    return full.then(row => { viewing = GS().fromRow(row); render(); }, e => setStatus("Couldn't open that session (" + e.message + ').'));
  }

  showMap(); render(); listSessions();
  if (session) setStatus('Carrying on your session from ' + timeOfDay(session.t0) + '. Share the game window to keep going.');
  window.Grind.debug = { session: () => session, state: () => ({ reads: st.reads, ticks: st.ticks, line: st.line, m: st.m, party: st.party, level: st.level }),
    save: () => save(true), load: row => { viewing = GS().fromRow(row); render(); }, capture: () => capture, mesoLine };
}

window.Grind = { mount, fmtK, clock, health };
})();
