// Appraiser tab: what an item sells for, plus the math behind its Odds tab and the tab's UI. The estimate itself lives in
// appraiser-price.js (no DOM); every slot, stat and scroll odd here comes from data/appraiser.json, from the game's own files.
(function () {
'use strict';

/* ---------- Mesos ---------- */

function parseMesos(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().toLowerCase().replace(/[, ]/g, '');
  if (!s) return null;
  const m = s.match(/^(\d*\.?\d+)([kmb])?$/);
  if (!m) return NaN;
  return parseFloat(m[1]) * ({ k: 1e3, m: 1e6, b: 1e9 }[m[2]] || 1);
}
function fmt(n) {
  if (n === null || n === undefined || !isFinite(n)) return '?';
  const a = Math.abs(n);
  const short = (x, u) => (x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2)).replace(/\.?0+$/, '') + u;
  if (a >= 1e9) return short(n / 1e9, 'B');
  if (a >= 1e6) return short(n / 1e6, 'M');
  if (a >= 1e3) return short(n / 1e3, 'k');
  return Math.round(n).toString();
}
// "1 in 2.4", "1 in 37", "1 in 1.23k"
const oneIn = x => x < 10 ? String(Math.round(x * 10) / 10) : fmt(Math.round(x));

/* ---------- Rolls ---------- */

// How far a clean stat can land from the client's value: the leftover a scroll story may leave for the drop roll.
// Our rule, not the server's (that lives on the server): every clean Cat's Eye and Blue Starlight roll players
// reported on meowdb (2026-11-02) fits it, and a stat that's 0 on a clean item never rolls.
const swing = clean => clean > 0 ? Math.floor(clean / 10) + 1 : 0;

const choose = (n, k) => { let r = 1; for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1); return r; };
const isWhole = v => Number.isInteger(v) && v >= 0;

/* ---------- Stories: how the tooltip's bonuses got there (the Odds tab) ---------- */

// Each typed stat's bonus (the bracket's second number) is scroll passes plus a drop roll. The + passes are split between
// the typed stats the slot has scrolls for; a stat with no scrolls on this slot is all drop roll. Within one stat a story
// is plain (k passes of one tier that can fail, plus m of the 100% filler) or, only when no plain story fits the item,
// mixed (passes from several tiers that can fail). A tier counts every stat it raises (Overall DEF adds magic def too).
// What's left on a stat is its drop roll d, which has to fit: |d| <= swing(clean) and clean + d >= 0.

// Every way to split n into `parts` whole numbers, 0 allowed.
function splits(n, parts) {
  if (parts === 0) return n === 0 ? [[]] : [];
  if (parts === 1) return [[n]];
  const out = [];
  for (let i = 0; i <= n; i++) for (const rest of splits(n - i, parts - 1)) out.push([i, ...rest]);
  return out;
}

// The chance of exactly these passes from the story's scrolls: the fails (used slots minus passes) are shared between its
// tiers that can fail, summed over every way to share them. 100% fillers never fail, so they sit outside. For one tier this
// is choose(used - m, k) * r^k * ((1 - r)(1 - chaos))^fails, the old one stat formula.
function storyP(failable, fails) {
  if (!failable.length) return fails === 0 ? 1 : 0;
  let P = 0;
  for (const f of splits(fails, failable.length)) {
    let p = 1;
    failable.forEach(({ tier, k }, i) => {
      const r = tier.rate / 100;
      p *= choose(k + f[i], k) * Math.pow(r, k) * Math.pow((1 - r) * (1 - tier.chaos), f[i]);
    });
    P += p;
  }
  return P;
}

// One stat's ways to take k passes from its family: plain always, mixed (two or more tiers that can fail) when asked.
function statOptions(family, k, mixed) {
  if (k === 0) return [{ tiers: [], filler: null }];
  const filler = family.tiers.find(t => t.rate === 100) || null;
  const failable = family.tiers.filter(t => t.rate < 100);
  const out = [];
  for (let m = 0; m <= (filler ? k : 0); m++) {
    const kk = k - m, fill = m ? { tier: filler, m } : null;
    if (kk === 0) { out.push({ tiers: [], filler: fill }); continue; }
    for (const tier of failable) out.push({ tiers: [{ tier, k: kk }], filler: fill });
    if (mixed) for (const counts of splits(kk, failable.length)) {
      const tiers = failable.map((tier, i) => ({ tier, k: counts[i] })).filter(t => t.k > 0);
      if (tiers.length > 1) out.push({ tiers, filler: fill });
    }
  }
  return out;
}

const gainOn = (opt, stat) => opt.tiers.reduce((n, t) => n + (t.tier.gains[stat] || 0) * t.k, 0) + (opt.filler ? (opt.filler.tier.gains[stat] || 0) * opt.filler.m : 0);

// Every story for a tooltip, most likely first: fewer scrolled stats, plain before mixed, no fillers before fillers,
// higher P, smaller total |d|. No story fitting is an empty list, not a guess.
function explain({ equip, passes, slotsLeft, stats = [] }, families) {
  const out = { stories: [] };
  if (!isWhole(passes) || !isWhole(slotsLeft)) return { ...out, error: 'The + number and slots left should be whole numbers.' };
  if (slotsLeft > equip.slots) return { ...out, error: `${equip.name} only has ${equip.slots} slots, so it can't have ${slotsLeft} left.` };
  const used = out.used = equip.slots - slotsLeft;
  if (passes > used) return { ...out, error: `+${passes} needs at least ${passes} used slots, and only ${used} are used.` };
  const typed = stats.filter(s => s && s.stat && Number.isInteger(s.bonus));
  const clean = s => equip.inc[s] || 0;
  const famOf = s => families.find(f => f.slot === equip.slot && f.stat === s);
  const scrolled = typed.filter(s => famOf(s.stat)).map(s => ({ ...s, family: famOf(s.stat) }));
  const fails = used - passes;
  // what the other scrolled stats' scrolls could add to this one at most, so options that can't fit are dropped early
  const crossMax = i => scrolled.reduce((n, o, j) => j === i ? n : n + passes * Math.max(0, ...o.family.tiers.map(t => t.gains[scrolled[i].stat] || 0)), 0);
  const run = mixed => {
    const stories = [];
    const optionLists = scrolled.map((s, i) => {
      const lo = s.bonus - swing(clean(s.stat)) - crossMax(i), hi = Math.min(s.bonus + swing(clean(s.stat)), s.bonus + clean(s.stat));
      const byK = [];
      for (let k = 0; k <= passes; k++) byK.push(statOptions(s.family, k, mixed).filter(o => { const g = gainOn(o, s.stat); return g >= lo && g <= hi; }));
      return byK;
    });
    const consider = combo => {
      const rolls = [];
      let absD = 0;
      for (const s of typed) {
        const d = s.bonus - combo.reduce((n, o) => n + gainOn(o, s.stat), 0);
        if (Math.abs(d) > swing(clean(s.stat)) || clean(s.stat) + d < 0) return;
        if (d) { rolls.push({ stat: s.stat, d }); absD += Math.abs(d); }
      }
      const failable = combo.flatMap(o => o.tiers);
      if (fails > 0 && !failable.length) return;
      const parts = scrolled.map((s, i) => ({ stat: s.stat, tiers: combo[i].tiers, filler: combo[i].filler })).filter(p => p.tiers.length || p.filler);
      stories.push({ parts, rolls, mixed: parts.some(p => p.tiers.length > 1), fillers: parts.some(p => !!p.filler), P: storyP(failable, fails), absD });
    };
    const walk = (split, i, combo) => {
      if (i === scrolled.length) return consider(combo);
      for (const o of optionLists[i][split[i]]) walk(split, i + 1, [...combo, o]);
    };
    for (const split of splits(passes, scrolled.length)) walk(split, 0, []);
    return stories.sort((a, b) => a.parts.length - b.parts.length || a.mixed - b.mixed || a.fillers - b.fillers || b.P - a.P || a.absD - b.absD);
  };
  out.stories = run(false);
  if (!out.stories.length) out.stories = run(true);
  return out;
}

// How rare a story is: 1 in oneIn clean bases end up exactly like this. The chart (the chance of each number of passes
// over the used slots) is drawn only for one tier that can fail, with no chaos and no fillers.
function oddsOf(story, used) {
  const P = story.P, failable = story.parts.flatMap(p => p.tiers);
  let chart = null;
  if (failable.length === 1 && !failable[0].tier.chaos && !story.fillers) {
    const r = failable[0].tier.rate / 100;
    chart = [];
    for (let j = 0; j <= used; j++) chart.push(choose(used, j) * Math.pow(r, j) * Math.pow(1 - r, used - j));
  }
  return { P, oneIn: P > 0 ? 1 / P : Infinity, chart };
}

// The stats that change what an item sells for: the ones its slot has scrolls for, and its attack.
const mattersFor = (equip, families) => [...new Set([...families.filter(f => f.slot === equip.slot).map(f => f.stat), ...['wat', 'mad'].filter(s => equip.inc[s])])];
/* ---------- UI ---------- */

// Big buttons down the left (like the Grind page), then on the right: the typed form, the item in one slim dark line,
// the price in a yellow band, and Sales, Odds and Drops tabs. The selling price itself comes from appraiser-price.js.
const AP = () => window.AppraiserPrice;
const LABEL = s => (AP() && AP().LABELS[s]) || s;
const STAT_CHOICES = ['int', 'luk', 'str', 'dex', 'wat', 'mad', 'pdd', 'mdd', 'acc', 'eva', 'hp', 'mp', 'speed', 'jump', 'crt', 'crd'];
const JOBS = [[1, 'Warrior'], [2, 'Magician'], [4, 'Bowman'], [8, 'Thief']];
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const word = n => WORDS[n] || String(n);
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
// a typed whole number; "+9", "-2" and "−2" all read
const whole = v => { const s = String(v).trim().replace('−', '-').replace(/^\+/, ''); return /^-?\d+$/.test(s) ? Number(s) : NaN; };
const signed = n => n < 0 ? '−' + Math.abs(n) : '+' + n;

const ui = {};
let E;
const $ = id => ui.root.querySelector('#' + id);

function mount(root, deps) {
  ui.root = root; ui.data = deps.data; ui.deps = deps; E = deps.el;
  Object.assign(ui, { equip: null, pick: 0, tab: 'sales', read: false, rows: { paste: [], reports: [] }, history: [], histKey: '', saved: new Map(), mine: loadMine() });
  // Cozy Market's number for each item and scroll that has one (meowdb uses the same numbers), so the page can link to it
  ui.cozy = new Map([...ui.data.equips, ...ui.data.families.flatMap(f => f.tiers)].filter(x => x.cozy).map(x => [x.name, x.cozy]));
  const field = (label, input, hint) => E('label', {}, label, input, hint ? E('span', { class: 'small' }, hint) : null);
  const num = id => E('input', { id, inputmode: 'numeric', autocomplete: 'off' });
  const names = [...new Set(ui.data.equips.map(e => e.name))].sort();
  const btn = (id, icon, label, extra = {}) => E('button', { type: 'button', id, class: 'ap-btn', ...extra }, E('i', { 'aria-hidden': 'true' }, icon), label);
  const tabBtn = (key, label) => E('button', { type: 'button', role: 'tab', 'data-tab': key, onclick: () => { ui.tab = key; showTab(); } }, label);

  root.replaceChildren(
    E('h2', {}, 'Appraiser'),
    E('p', { class: 'lead' }, 'What will this item sell for? Pick it, type what its tooltip says, and see what items like it went for, how rare it is, and who drops it.'),
    E('div', { class: 'ap-page' },
      E('aside', { class: 'ap-rail' }, E('div', { class: 'ap-railin' },
        // the tooltip reader (its own plan) shows these two
        btn('ap-share', '▶', 'Share game window', { class: 'ap-btn go', hidden: '' }),
        btn('ap-paste', '⎘', 'Paste a screenshot', { hidden: '' }),
        btn('ap-type', '✎', 'Type it instead', { onclick: () => { $('ap-form').hidden = false; $('ap-item').focus(); } }),
        E('div', { class: 'ap-box' }, E('div', { class: 'ap-boxh' }, 'Reading'), E('ul', { class: 'ap-checks', id: 'ap-checks' })))),
      E('div', { class: 'ap-main' },
        E('section', { id: 'ap-form', class: 'ap-card' },
          field('Item', E('input', { id: 'ap-item', list: 'ap-items', autocomplete: 'off', spellcheck: 'false', placeholder: 'Start typing a name' })),
          E('datalist', { id: 'ap-items' }, names.map(n => E('option', { value: n }))),
          E('p', { id: 'ap-facts' }),
          E('div', { class: 'ap-row' }, field('+ in the name', num('ap-passes')), field('Slots left', num('ap-left'))),
          E('div', {},
            E('div', { class: 'ap-statsh' }, 'Every stat with a bracket, and the number after the plus, like the 9 in (8 +9)'),
            E('div', { id: 'ap-statrows' }),
            E('button', { type: 'button', id: 'ap-addstat', class: 'linkish', onclick: () => { addStatRow(); } }, '+ Add a stat'))),
        E('div', { id: 'ap-line', class: 'ap-line' }),
        E('p', { id: 'ap-note', 'aria-live': 'polite' }),
        E('div', { id: 'ap-band', class: 'ap-band', 'aria-live': 'polite' },
          E('div', {}, E('div', { class: 'ap-bk' }, 'Sells for about'), E('div', { class: 'ap-big', id: 'ap-price' })),
          E('div', { class: 'ap-bandl' }, E('span', { id: 'ap-range' }), E('span', { id: 'ap-oddsline' }), E('span', { id: 'ap-pill', class: 'ap-pill' }),
            E('label', { class: 'ap-offer' }, 'Offer you got', E('input', { id: 'ap-offer', autocomplete: 'off', placeholder: 'like 1.5m' })),
            E('span', { id: 'ap-offerline' }))),
        E('div', { id: 'ap-tabs', class: 'ap-tabs', role: 'tablist' }, tabBtn('sales', 'Sales'), tabBtn('odds', 'Odds'), tabBtn('drops', 'Drops')),
        // built once, so typing in the form never wipes a half done paste or price
        E('div', { id: 'ap-sales', class: 'ap-pane', role: 'tabpanel' },
          E('div', { id: 'ap-cozypaste', class: 'ap-paste' },
            E('label', {}, "Paste from Cozy: on the item's Cozy page, set the stat filters like yours, select the listings, copy and paste them here.",
              E('textarea', { rows: '3', placeholder: 'Paste the listings here', spellcheck: 'false' })),
            E('button', { type: 'button', onclick: () => addPaste() }, 'Add these rows')),
          E('p', { id: 'ap-pastenote', class: 'small', 'aria-live': 'polite' }),
          E('div', { id: 'ap-rows' }),
          E('div', { id: 'ap-before' }),
          E('div', { id: 'ap-report' },
            E('div', { class: 'ap-rin' }, E('input', { id: 'ap-rprice', autocomplete: 'off', placeholder: 'like 1.6m', 'aria-label': 'Price' }),
              E('button', { type: 'button', onclick: () => report('sold') }, 'I sold mine for'),
              E('button', { type: 'button', onclick: () => report('seen') }, 'I saw one in a shop at')),
            E('div', { class: 'ap-rout' }, 'Sold one, or saw one in a shop? Sign in and tell us, and the next guess gets better. ',
              E('button', { type: 'button', onclick: () => ui.deps.signIn && ui.deps.signIn() }, 'Sign in')),
            E('p', { id: 'ap-reportnote', class: 'small', 'aria-live': 'polite' }))),
        E('div', { id: 'ap-odds', class: 'ap-pane', role: 'tabpanel', hidden: '' }),
        E('div', { id: 'ap-drops', class: 'ap-pane', role: 'tabpanel', hidden: '' }))));

  for (const id of ['ap-item', 'ap-passes', 'ap-left']) $(id).addEventListener('input', e => { unmark(e.target); ui.pick = 0; update(); });
  $('ap-offer').addEventListener('input', update);
  addStatRow();
  showTab();
  update();
}

// One stat row: the stat, its bonus (the bracket's second number), and a way to take the row out. The ids are only so a
// Something off? report (flag.js sends every box with an id) shows the stats; the Cozy paste box has none on purpose.
let rowIds = 0;
function addStatRow(stat = '', bonus = '') {
  const n = ++rowIds;
  const sel = E('select', { id: 'ap-stat-' + n, class: 'ap-stat', 'aria-label': 'Stat' }, E('option', { value: '' }, 'Stat'), STAT_CHOICES.map(s => E('option', { value: s }, LABEL(s))));
  sel.value = stat;
  const inp = E('input', { id: 'ap-bonus-' + n, class: 'ap-bonus', inputmode: 'numeric', autocomplete: 'off', 'aria-label': 'Bonus', placeholder: '+9' });
  inp.value = bonus === '' ? '' : String(bonus);
  const row = E('div', { class: 'ap-statrow', 'data-stat-row': '' }, sel, inp,
    E('button', { type: 'button', class: 'ap-del', 'aria-label': 'Take this stat out', onclick: () => { row.remove(); ui.pick = 0; update(); } }, '×'));
  sel.addEventListener('change', () => { unmark(sel); ui.pick = 0; update(); });
  inp.addEventListener('input', () => { unmark(inp); ui.pick = 0; update(); });
  $('ap-statrows').append(row);
  return row;
}

const readStats = () => [...ui.root.querySelectorAll('[data-stat-row]')]
  .map(r => ({ stat: r.querySelector('select.ap-stat').value, bonus: whole(r.querySelector('input.ap-bonus').value) }))
  .filter(s => s.stat && Number.isInteger(s.bonus));

// A box the reader filled stops counting as read once the player types over it.
function unmark(box) {
  box.classList.remove('ap-read');
  if (!ui.root.querySelector('#ap-form .ap-read')) ui.read = false;
}

// Fill the form from the tooltip reader (its own plan) or anything else: { item, passes, slotsLeft, stats: [{ stat, bonus }] }.
// With read, every box it filled is marked so the player can see what came from the game.
function take(fill, { read = false } = {}) {
  const set = (id, v) => { const b = $(id); b.value = v == null ? '' : String(v); b.classList.toggle('ap-read', read && v != null); };
  set('ap-item', fill.item); set('ap-passes', fill.passes); set('ap-left', fill.slotsLeft);
  $('ap-statrows').replaceChildren();
  for (const s of fill.stats || []) {
    const row = addStatRow(s.stat, s.bonus);
    if (read) row.querySelectorAll('select, input').forEach(b => b.classList.add('ap-read'));
  }
  if (!(fill.stats || []).length) addStatRow();
  ui.read = read; ui.pick = 0;
  update();
}

function update() {
  const t = $('ap-item').value.trim().toLowerCase();
  const equip = ui.data.equips.find(e => e.name.toLowerCase() === t) || null;
  if (equip !== ui.equip) {
    // a new item: its pasted rows come back from this device, its reports from the site
    Object.assign(ui, { equip, pick: 0, rows: { paste: equip ? loadPaste(equip.id) : [], reports: [] }, history: [], histKey: '' });
    $('ap-pastenote').textContent = ''; $('ap-reportnote').textContent = '';
    if (equip) loadReports(equip);
  }
  const passes = whole($('ap-passes').value), left = whole($('ap-left').value), stats = readStats();
  const typed = Number.isInteger(passes) && Number.isInteger(left);
  const r = equip && typed ? explain({ equip, passes, slotsLeft: left, stats }, ui.data.families) : null;
  let est = null;
  if (equip && AP()) {
    const target = { equip, bonus: Object.fromEntries(stats.map(s => [s.stat, s.bonus])), slotsLeft: Number.isInteger(left) ? left : null };
    const matters = mattersFor(equip, ui.data.families);
    est = AP().estimate([...ui.rows.paste, ...ui.rows.reports], target, { matters, now: Date.now() });
    if (Number.isInteger(left)) keepHistory(equip, AP().statsKey(target.bonus, matters, left), est);
  }
  Object.assign(ui, { state: { equip, passes, left, stats, typed }, explained: r, est });
  renderFacts(); renderChecks(); renderLine(); renderBand(); renderOdds(); renderDrops(); renderSales();
  $('ap-tabs').querySelector('[data-tab="sales"]').textContent = `Sales (${est ? est.used.length : 0})`;
}

/* ---------- Sales: pasted rows (this device only), reports and history (the site) ---------- */

const signedIn = () => !!(ui.deps.session && ui.deps.session());
const api = () => ui.deps.api;
const getJSON = (k, fallback) => { try { const v = ui.deps.store.get(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
const setJSON = (k, v) => { try { ui.deps.store.set(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } };
const fresh = rows => rows.filter(r => Date.now() - r.ts <= 14 * 864e5);
// Cozy rows a player pasted stay on their own device, per item, for 14 days. They're Cozy's data: never sent anywhere.
const loadPaste = id => fresh(getJSON('ap.paste.' + id, []));
const savePaste = (id, rows) => setJSON('ap.paste.' + id, fresh(rows));
// the reports this player made here, so theirs can be deleted
const loadMine = () => new Set(getJSON('ap.mine', []));
const saveMine = () => setJSON('ap.mine', [...ui.mine].slice(-200));

const reportRow = r => ({ id: r.id, bonus: r.bonus || {}, total: {}, slotsLeft: r.slots_left == null ? null : r.slots_left, price: +r.price,
  sold: r.kind === 'sold', ts: Date.parse(r.created_at) || Date.now(), from: 'report', reporter: r.reporter || null, key: 'report|' + r.id });
// a report the site hands back with a bonus that isn't whole numbers, or no price, is junk and left out
const soundReport = r => r && r.bonus && typeof r.bonus === 'object' && Object.values(r.bonus).every(Number.isInteger) && +r.price > 0;

function loadReports(equip) {
  Promise.resolve().then(() => api().listPriceReports(equip.id)).then(list => {
    if (ui.equip !== equip) return;
    ui.rows.reports = (list || []).filter(soundReport).map(reportRow);
    update();
  }, () => { /* the site's database is down: pasted rows still give a price */ });
}

// One history row per item, stats and day: our own estimate, never Cozy's rows. Saved for signed in players only, once a
// page view per price, and read back so the band can say what these stats went for before. Both wait for typing to settle
// (HISTORY_WAIT), so the keys a player passes through on the way (left:1 on the way to left:10) are never written.
const HISTORY_WAIT = 1500;
function keepHistory(equip, key, est) {
  ui.curKey = key;
  clearTimeout(ui.histTimer);
  ui.histTimer = setTimeout(() => {
    if (ui.equip !== equip || ui.curKey !== key) return;
    if (key !== ui.histKey) {
      ui.histKey = key; ui.history = [];
      Promise.resolve().then(() => api().listPriceHistory(equip.id, key)).then(h => { if (ui.histKey === key) { ui.history = h || []; update(); } }, () => {});
    }
    const id = equip.id + '|' + key;
    if (!signedIn() || est.price === null || ui.saved.get(id) === est.price) return;
    ui.saved.set(id, est.price);
    Promise.resolve().then(() => api().savePriceHistory({ item_id: equip.id, stats_key: key, price: est.price, low: est.low, high: est.high,
      sold: est.sold, listed: est.listed, confidence: est.confidence })).catch(() => {});
  }, HISTORY_WAIT);
}

function addPaste() {
  const box = $('ap-cozypaste').querySelector('textarea'), equip = ui.equip, note = t => { $('ap-pastenote').textContent = t; };
  if (!equip) return note('Pick the item first, then paste its Cozy listings.');
  const got = AP().parseCozyPaste(box.value, Date.now());
  if (got.error === 'empty') return note("Paste the listings table from the item's Cozy page first.");
  if (got.error) return note("That doesn't look like Cozy's listings table. On the item's Cozy page, select the rows, copy, and paste them here.");
  // a row whose shown stat minus its bonus isn't this item's clean value came from another item's page
  const fits = got.rows.filter(r => Object.keys(r.total).every(s => r.total[s] - (r.bonus[s] || 0) === (equip.inc[s] || 0)));
  if (got.rows.length && !fits.length) return note(`That paste looks like a different item. Check it came from the ${equip.name} page on Cozy.`);
  if (!got.rows.length) return note("Couldn't read the rows in that paste. Copy the table straight from the item's Cozy page and try again.");
  const before = ui.rows.paste.length;
  ui.rows.paste = AP().merge(ui.rows.paste, fits);
  savePaste(equip.id, ui.rows.paste);
  const added = ui.rows.paste.length - before, other = got.rows.length - fits.length;
  box.value = '';
  note((added ? `Added ${plural(added, 'row')} from Cozy.` : 'Nothing new in that paste.')
    + (other ? ` Left out ${other} from a different item.` : '') + (got.skipped ? ` Left out ${plural(got.skipped, 'row')} with no stats or no time.` : ''));
  update();
}

async function report(kind) {
  const { equip, left, stats, typed } = ui.state, note = t => { $('ap-reportnote').textContent = t; };
  const price = parseMesos($('ap-rprice').value);
  if (!equip) return note('Pick the item first.');
  if (!typed) return note('Type the + number and slots left first, so the report says which one you had.');
  if (!(price > 0)) return note('Type a price like 1.6m first.');
  // every stat that matters goes in, +0 when it has no bracket, so a report is never a match for any stats at all
  const bonus = Object.fromEntries(stats.map(s => [s.stat, s.bonus]));
  for (const s of mattersFor(equip, ui.data.families)) if (!(s in bonus)) bonus[s] = 0;
  const row = { item_id: equip.id, bonus, slots_left: left, price: Math.round(price), kind };
  try {
    const saved = await api().addPriceReport(row);
    ui.mine.add(saved.id); saveMine();
    if (ui.equip === equip) ui.rows.reports.unshift(reportRow(saved));
    $('ap-rprice').value = '';
    note("Thanks, that's in. It helps the next guess.");
    update();
  } catch (e) { note(`That didn't go through (${e.message}).`); }
}

async function deleteReport(id) {
  try {
    await api().deletePriceReport(id);
    ui.rows.reports = ui.rows.reports.filter(r => r.id !== id);
    ui.mine.delete(id); saveMine();
    update();
  } catch (e) { $('ap-reportnote').textContent = `Couldn't delete it (${e.message}).`; }
}

function showTab() {
  for (const b of $('ap-tabs').querySelectorAll('button')) b.setAttribute('aria-selected', String(b.dataset.tab === ui.tab));
  for (const k of ['sales', 'odds', 'drops']) $('ap-' + k).hidden = k !== ui.tab;
}

function renderFacts() {
  const e = ui.equip;
  if (!e) { $('ap-facts').textContent = $('ap-item').value.trim() ? 'Pick an item from the list.' : ''; return; }
  const jobs = e.job ? JOBS.filter(([b]) => e.job & b).map(([, n]) => n).join(', ') : 'any class';
  const stats = Object.entries(e.inc).map(([s, v]) => `${v} ${LABEL(s)}`).join(', ');
  $('ap-facts').textContent = `${e.slot} · Lv ${e.level} · ${jobs} · clean ${stats || 'no stats'} · ${plural(e.slots, 'slot')}`;
}

function renderChecks() {
  const { equip, passes, left, stats, typed } = ui.state;
  const li = (done, text) => E('li', { class: done ? 'done' : '' }, text);
  $('ap-checks').replaceChildren(
    li(!!equip, equip ? equip.name : 'The item'),
    li(typed, typed ? `+${passes}, ${plural(left, 'slot')} left` : 'The + number and slots left'),
    li(stats.length > 0, stats.length ? stats.map(s => LABEL(s.stat)).join(', ') : 'Each stat with a bracket'),
    E('li', { class: 'ap-checknote' }, ui.read ? 'Read from the game. Fix anything that looks off.' : 'Type them from the tooltip.'));
}

function renderLine() {
  const { equip, passes, left, stats } = ui.state;
  if (!equip) { $('ap-line').replaceChildren(E('span', { class: 'ap-lmuted' }, 'Pick an item to start.')); return; }
  const chip = (label, total, bracket) => E('span', { class: 'ap-chip' }, label + ' ', E('b', {}, String(total)), bracket ? E('span', { class: 'lav' }, ` (${bracket})`) : null);
  const clean = s => equip.inc[s] || 0;
  // (the DOM's own replaceChildren writes a null as the word "null", so the empty ones go first)
  $('ap-line').replaceChildren(...[
    E('span', { class: 'ap-ico', 'aria-hidden': 'true' }),
    E('span', { class: 'ap-nm' }, equip.name + (passes > 0 ? ` (+${passes})` : '')),
    ...stats.map(s => chip(LABEL(s.stat), clean(s.stat) + s.bonus, `${clean(s.stat)} ${signed(s.bonus)}`)),
    Number.isInteger(left) ? chip('Slots', left) : null,
    ui.read ? E('span', { class: 'ap-readok' }, '✓ read from game') : null,
    E('span', { class: 'ap-links' }, ...lookups(equip.name))].filter(Boolean));
}

// The lead story, or the one the player picked from the Odds tab.
const story = () => { const r = ui.explained; return r && r.stories.length ? r.stories[Math.min(ui.pick, r.stories.length - 1)] : null; };

function renderBand() {
  const { equip, passes } = ui.state, est = ui.est, s = story();
  const priced = est && est.price !== null;
  $('ap-price').textContent = priced ? fmt(est.price) : '';
  $('ap-price').hidden = !priced;
  const last = ui.history[0];
  $('ap-range').textContent = !equip ? 'Pick an item to see what it sells for.'
    : priced ? `Most sales like it: ${fmt(est.low)} to ${fmt(est.high)}`
    : 'No sales or listings like this in the past 14 days. Paste from Cozy or tell us a sale.' + (last ? ` Last seen at ${fmt(+last.price)} on ${dayName(last.day)}.` : '');
  let odds = '';
  if (s && passes > 0) { const o = oddsOf(s, ui.explained.used); odds = o.P >= 0.999 ? 'Every clean one gets here with 100% scrolls' : `Only 1 in ${oneIn(o.oneIn)} clean ones get here`; }
  $('ap-oddsline').textContent = odds;
  $('ap-oddsline').hidden = !odds;
  const conf = est ? est.confidence : 'none';
  $('ap-pill').className = 'ap-pill ' + conf;
  $('ap-pill').hidden = !equip;
  $('ap-pill').textContent = '● ' + ({ solid: 'Solid', rough: 'Rough', none: 'Not enough yet' })[conf]
    + (priced ? ` · based on ${plural(est.sold, 'sale')} and ${plural(est.listed, 'listing')}, last 14 days` : '');
  const offer = parseMesos($('ap-offer').value);
  $('ap-offerline').textContent = priced && offer > 0 ? AP().compareOffer(offer, est.price) : '';
}

// "Three passes from 4 tries of the 10% INT scroll (+3 each)."
function sentence(s, passes, used) {
  if (passes === 0) return 'Clean, no scrolls used.';
  const name = (tier, stat) => `${tier.rate}%${tier.chaos ? ' chaos' : ''} ${LABEL(stat)} scroll (+${tier.gains[stat] || tier.gain} each)`;
  const pieces = s.parts.flatMap(p => [...p.tiers.map(t => [t.k, name(t.tier, p.stat)]), ...(p.filler ? [[p.filler.m, name(p.filler.tier, p.stat)]] : [])]);
  const head = `${cap(word(passes))} ${passes === 1 ? 'pass' : 'passes'} from ${used} ${used === 1 ? 'try' : 'tries'}`;
  return pieces.length === 1 ? `${head} of the ${pieces[0][1]}.` : `${head}: ${pieces.map(([k, n]) => `${word(k)} of the ${n}`).join(', ')}.`;
}
const short = s => s.parts.length ? s.parts.map(p => [...p.tiers.map(t => `${t.k}× ${t.tier.rate}%${t.tier.chaos ? ' chaos' : ''} ${LABEL(p.stat)}`),
  ...(p.filler ? [`${p.filler.m}× 100% ${LABEL(p.stat)}`] : [])].join(' + ')).join(' + ') : 'No scrolls';

function renderOdds() {
  const box = $('ap-odds'), { equip, passes, left, typed } = ui.state, r = ui.explained;
  const p = (text, cls) => E('p', cls ? { class: cls } : {}, text);
  if (!equip) return box.replaceChildren(p('Pick an item first.'));
  if (!typed) return box.replaceChildren(p('Type the + number and slots left from the tooltip.'));
  if (r.error) return box.replaceChildren(p(r.error, 'error'));
  const s = story();
  if (!s) return box.replaceChildren(p('No mix of scrolls and drop rolls adds up to these stats. Check the numbers against the tooltip.', 'error'));
  const kids = [p(sentence(s, passes, r.used))];
  if (passes > 0) {
    const o = oddsOf(s, r.used);
    kids.push(p(o.P >= 0.999 ? 'Every clean one ends up like this.' : `1 in ${oneIn(o.oneIn)} clean ones end up like this.`, 'ap-one'));
    if (o.chart) {
      const top = Math.max(...o.chart);
      kids.push(E('div', { class: 'ap-chart', 'aria-label': `The chance of each number of passes from ${r.used} tries` },
        o.chart.map((c, j) => E('div', { class: 'ap-bar' + (j === passes ? ' me' : ''), title: `${j} passes: ${(c * 100).toFixed(c < 0.01 ? 2 : 0)}%` },
          E('small', {}, `${(c * 100).toFixed(c < 0.01 ? 2 : 0)}%`), E('i', { style: `height:${Math.max(2, c / top * 80)}%` }), E('b', {}, String(j) + (j === passes ? ' ★' : ''))))),
        p(`Passes from ${r.used} tries. ★ is this one.`, 'small'));
    }
  }
  if (left > 0 && ui.data.families.some(f => f.slot === equip.slot)) kids.push(p(`It still has ${plural(left, 'slot')}, so it can go higher.`));
  for (const { stat, d } of s.rolls) {
    const c = equip.inc[stat] || 0, sw = swing(c);
    kids.push(p(`Drop rolls on ${LABEL(stat)} go from ${Math.max(0, c - sw)} to ${c + sw}. This one rolled ${signed(d)}.`));
  }
  const others = r.stories.slice(0, 4);
  if (others.length > 1) kids.push(E('div', { class: 'ap-or' }, 'Other ways it could have happened:', others.map((o, i) =>
    E('button', { type: 'button', 'aria-pressed': String(i === Math.min(ui.pick, r.stories.length - 1)), onclick: () => { ui.pick = i; update(); } }, short(o)))));
  box.replaceChildren(...kids);
}

function renderDrops() {
  const e = ui.equip;
  if (!e) return $('ap-drops').replaceChildren(E('p', {}, 'Pick an item first.'));
  const n = ui.cozy.get(e.name);
  $('ap-drops').replaceChildren(
    n ? E('p', {}, E('a', { href: 'https://meowdb.com/msclassic/item-db/' + n, target: '_blank', rel: 'noopener' }, 'See who drops it, as confirmed by Classic players, on meowdb'))
      : E('p', {}, `Search for ${e.name} on meowdb `, copyButton(e.name, 'https://meowdb.com/msclassic/item-db', 'meowdb')),
    E('p', { class: 'small' }, "Classic players vote on every drop there, so it's the best list there is. We link to it instead of copying it."));
}

const dayName = d => new Date(d + (String(d).length === 10 ? 'T12:00:00' : '')).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const ago = ts => { const m = Math.round((Date.now() - ts) / 6e4); return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };
const WHY = { old: 'over 14 days old', far: 'far from the rest', 'not close': 'stats too different', 'different item': 'a different item?', 'bad row': "couldn't read it" };
const statText = row => Object.keys(row.bonus).map(s => `${LABEL(s)} ${row.total[s] != null ? row.total[s] + ' ' : ''}(${signed(row.bonus[s])})`)
  .concat(row.slotsLeft != null ? [`${plural(row.slotsLeft, 'slot')} left`] : []).join(' · ');

// The rows behind the estimate, closest first, then the ones left out (faded, with why); then what these stats went for
// before (our own history); the report form shows to signed in players.
function renderSales() {
  const est = ui.est, row = (v, dropped) => {
    const mine = v.row.from === 'report' && ui.mine.has(v.row.id);
    return E('div', { class: 'ap-r' + (dropped ? ' ap-rdrop' : ''), ...(dropped ? { 'data-dropped': v.why } : { 'data-tag': v.tag }), ...(mine ? { 'data-mine': '' } : {}) },
      E('span', { class: 'ap-rtag' + (v.exact ? ' same' : '') }, dropped ? WHY[v.why] : v.tag),
      E('span', { class: 'ap-rstats' }, statText(v.row)),
      E('b', {}, fmt(v.row.price)),
      E('span', {}, v.row.sold ? 'sold' : 'listed'),
      E('span', { class: 'ap-rmuted' }, ago(v.row.ts) + ' · ' + (v.row.from === 'paste' ? 'from Cozy' : 'reported')),
      mine ? E('button', { type: 'button', class: 'linkish', onclick: () => deleteReport(v.row.id) }, 'Delete') : null);
  };
  $('ap-rows').replaceChildren(...(!est ? [] : !est.used.length && !est.dropped.length
    ? [E('p', { class: 'small' }, 'No sales or listings yet.')]
    : [...est.used.map(v => row(v, false)), ...est.dropped.map(v => row(v, true))]));
  const before = ui.history.length > 1 ? ui.history.slice(0, 10) : [];
  $('ap-before').replaceChildren(...(before.length ? [E('h4', {}, 'Before'), E('ul', { class: 'ap-hist' }, before.map(h =>
    E('li', {}, `${dayName(h.day)}: ${fmt(+h.price)}, ${h.confidence === 'solid' ? 'Solid' : 'Rough'}, ${plural(h.sold, 'sale')} and ${plural(h.listed, 'listing')}`)))] : []));
  const inn = signedIn();
  $('ap-report').querySelector('.ap-rin').hidden = !inn;
  $('ap-report').querySelector('.ap-rout').hidden = inn;
}

// Straight to the item's page on Cozy and on meowdb when its number is known, otherwise copy the name and open Cozy.
function lookups(name) {
  const n = ui.cozy.get(name);
  if (n) return [E('a', { class: 'cozy', href: 'https://cozy.markets/items/' + n, target: '_blank', rel: 'noopener', title: 'Sales and listings on Cozy Market' }, 'Cozy'),
    E('a', { class: 'cozy', href: 'https://meowdb.com/msclassic/item-db/' + n, target: '_blank', rel: 'noopener', title: 'The item on meowdb' }, 'meowdb')];
  return [copyButton(name, 'https://cozy.markets/items', 'Cozy')];
}

function copyButton(name, url, site) {
  return E('button', { type: 'button', class: 'cozy', 'data-name': name, title: `Copies the name and opens ${site}`, onclick: () => copyAndOpen(name, url, site) }, `Check on ${site}`);
}

function copyAndOpen(name, url, site) {
  const note = $('ap-note');
  const handBack = () => {
    const box = E('input', { readonly: '', value: name });
    note.replaceChildren(`Your browser didn't let us copy it. Copy the name, then paste it into ${site}'s search:`, box);
    box.focus(); box.select();
  };
  let copying;
  try { copying = navigator.clipboard.writeText(name); } catch { copying = Promise.reject(); }
  window.open(url, '_blank', 'noopener');
  copying.then(() => note.replaceChildren(`Copied "${name}". Paste it into ${site}'s search.`), handBack);
}

// refresh: the page calls it when someone signs in or out, so the report form follows
window.Appraiser = { parseMesos, fmt, oneIn, swing, explain, oddsOf, mattersFor, mount, take, refresh: () => { if (ui.root) update(); } };
})();
