// Appraiser tab: what an item would cost, on average, to make yourself, plus the tab's UI.
// The scroll run math is the Meso Appraiser artifact's (item-appraiser/index.html), and every slot, stat,
// and scroll odd comes from data/appraiser.json, written from the game's own files.
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
const priceOk = v => typeof v === 'number' && isFinite(v) && v > 0;
// "1 in 2.4", "1 in 37", "1 in 1.23k"
const oneIn = x => x < 10 ? String(Math.round(x * 10) / 10) : fmt(Math.round(x));

/* ---------- Rolls ---------- */

// How far a clean stat can land from the client's value: the leftover a scroll story may leave for the drop roll.
// The real rule lives on the server; this matches the ±1s on Rimmah's Blue Arten, and ±2 for bigger stats is a guess.
const swingFor = clean => clean <= 10 ? 1 : 2;

/* ---------- Scroll runs ---------- */

// Keep scrolling a clean base until it reaches `passes` successes, or until fails make that impossible within
// `used` slots. Runs that pass with slots to spare count too. A failed chaos scroll destroys the item `boom` of the time.
function scrollRun({ rate, boom = 0, used, passes }) {
  const p = rate / 100, F = used - passes;
  if (!(used >= 0) || !(passes >= 0) || F < 0 || !(p > 0 && p <= 1)) return null;
  if (passes === 0) return { q: 1, scrolls: 0 };
  let layer = new Map([['0,0', 1]]), scrolls = 0, q = 0;
  for (let n = 0; n < used; n++) {
    const next = new Map();
    for (const [key, r] of layer) {
      const [k, f] = key.split(',').map(Number);
      scrolls += r;
      if (k + 1 === passes) q += r * p; else next.set(k + 1 + ',' + f, (next.get(k + 1 + ',' + f) || 0) + r * p);
      if (f + 1 <= F) next.set(k + ',' + (f + 1), (next.get(k + ',' + (f + 1)) || 0) + r * (1 - p) * (1 - boom));
    }
    layer = next;
  }
  return { q, scrolls };
}

const choose = (n, k) => { let r = 1; for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1); return r; };

// Every way the tooltip could have been scrolled: k passes of one tier T that took all the fails, plus m passes of
// the family's 100% scroll as fillers. d is what's left over for the drop roll and has to fit the swing.
// Most likely first: no fillers, then the likelier exact run, then the smaller drop roll.
// With `clean` given, a drop roll can't take the stat below 0.
function findStories(family, used, passes, bonus, swing, clean = Infinity) {
  const fails = used - passes;
  if (!family || passes < 1 || fails < 0) return [];
  const filler = family.tiers.find(t => t.rate === 100);
  const out = [];
  for (const T of family.tiers) {
    if (T.rate === 100 && fails > 0) continue;
    const maxM = filler && T !== filler ? passes - 1 : 0;
    for (let m = 0; m <= maxM; m++) {
      const k = passes - m;
      const d = bonus - (k * T.gain + m * (filler ? filler.gain : 0));
      if (Math.abs(d) > swing || clean + d < 0) continue;
      const r = T.rate / 100;
      const P = choose(used - m, k) * Math.pow(r, k) * Math.pow((1 - r) * (1 - T.chaos), fails);
      out.push({ tier: T, filler: m > 0 ? filler : null, k, m, d, P });
    }
  }
  return out.sort((a, b) => (a.m > 0) - (b.m > 0) || b.P - a.P || Math.abs(a.d) - Math.abs(b.d));
}

const isWhole = v => Number.isInteger(v) && v >= 0;

function appraiseScrolled({ equip, family, slotsLeft, passes, bonus, pick = 0, prices = {} }) {
  const out = { stories: [] };
  if (!isWhole(passes) || !isWhole(slotsLeft)) return { ...out, error: 'The + number and slots left should be whole numbers.' };
  if (slotsLeft > equip.slots) return { ...out, error: `${equip.name} only has ${equip.slots} slots, so it can't have ${slotsLeft} left.` };
  const used = equip.slots - slotsLeft;
  if (passes > used) return { ...out, error: `+${passes} needs at least ${passes} used slots, and only ${used} are used.` };
  if (passes === 0) {
    if (!priceOk(prices.base)) return { ...out, waitingFor: 'base' };
    return { ...out, q: 1, scrolls: 0, bases: 1, price: prices.base };
  }
  if (!family) return { ...out, error: `The game has no scrolls for that stat on ${equip.slot.toLowerCase()}s.` };
  if (!Number.isInteger(bonus)) return { ...out, error: 'Type the bonus after the plus, like the 7 in (75 +7).' };

  const clean = equip.inc[family.stat] || 0;
  out.stories = findStories(family, used, passes, bonus, swingFor(clean), clean);
  let story = out.stories[pick] || out.stories[0];
  if (!story) {
    // Nothing fits: price it as if every pass were the likeliest scroll that can fail (the 60% one). It makes no claim about the drop roll.
    const T = family.tiers.find(t => t.rate < 100) || family.tiers[0];
    story = { tier: T, filler: null, k: passes, m: 0, d: 0, P: 0, fallback: true };
    out.warning = `No mix of these scrolls adds up to ${bonus < 0 ? bonus : '+' + bonus} with ${passes} passes in ${used} slots, so this assumes every pass was a ${T.rate}% scroll.`;
  }
  out.story = story;
  const run = scrollRun({ rate: story.tier.rate, boom: story.tier.chaos, used: used - story.m, passes: story.k });
  if (!run || !(run.q > 0)) return { ...out, error: "That run can't happen with these scrolls." };
  Object.assign(out, { q: run.q, scrolls: run.scrolls, bases: 1 / run.q, scrollsPerItem: run.scrolls / run.q });

  const byTier = prices.byTier || {};
  if (!priceOk(prices.base)) return { ...out, waitingFor: 'base' };
  if (!priceOk(byTier[story.tier.name])) return { ...out, waitingFor: story.tier.name };
  if (story.m > 0 && !priceOk(byTier[story.filler.name])) return { ...out, waitingFor: story.filler.name };
  out.price = (prices.base + run.scrolls * byTier[story.tier.name]) / run.q + (story.m > 0 ? story.m * byTier[story.filler.name] : 0);
  return out;
}


function compareOffer(offer, price) {
  const ratio = offer / price;
  return ratio >= 1 ? `${ratio.toFixed(1)}× the cost to make it. Making one is cheaper.`
    : `${Math.round(ratio * 100)}% of the cost to make it. Buying beats making.`;
}

/* ---------- UI ---------- */

const STAT_NAME = { wat: 'Weapon attack', mad: 'Magic attack', str: 'STR', dex: 'DEX', int: 'INT', luk: 'LUK', acc: 'Accuracy', eva: 'Avoid',
  pdd: 'Weapon def', mdd: 'Magic def', hp: 'Max HP', mp: 'Max MP', speed: 'Speed', jump: 'Jump', crt: 'Crit rate', crd: 'Crit damage' };
const STAT_ORDER = ['wat', 'mad', 'int', 'luk', 'dex', 'str'];
const JOBS = [[1, 'Warrior'], [2, 'Magician'], [4, 'Bowman'], [8, 'Thief']];
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const word = n => WORDS[n] || String(n);
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const tierWord = t => t.name.split(': ').pop();
const whole = v => { const s = String(v).trim(); return /^-?\d+$/.test(s) ? Number(s) : NaN; };

const ui = {};
let E;
const $ = id => ui.root.querySelector('#' + id);

function mount(root, deps) {
  ui.root = root; ui.data = deps.data; E = deps.el;
  Object.assign(ui, { equip: null, pick: 0, prices: {}, priceKeys: '', storyKeys: '' });
  const field = (label, input, hint) => E('label', {}, label, input, hint ? E('span', { class: 'small' }, hint) : null);
  const num = (id, extra = {}) => E('input', { id, inputmode: 'numeric', autocomplete: 'off', ...extra });
  const names = [...new Set(ui.data.equips.map(e => e.name))].sort();
  root.replaceChildren(
    E('h2', {}, 'Appraiser'),
    E('p', { class: 'lead' }, 'What would it cost to make this item yourself? Type what its tooltip says, look up prices on Cozy, and get the average cost to make one. Nobody should pay much more than that.'),
    E('div', { class: 'ap-grid' },
      E('section', { id: 'ap-inputs', class: 'ap-card' },
        field('Item', E('input', { id: 'ap-item', list: 'ap-items', autocomplete: 'off', spellcheck: 'false', placeholder: 'Start typing a name' })),
        E('datalist', { id: 'ap-items' }, names.map(n => E('option', { value: n }))),
        E('p', { id: 'ap-facts' }),
        E('div', { id: 'ap-scrolled', class: 'ap-card-part' },
          E('div', { class: 'ap-row' },
            field('+ in the name', num('ap-passes')),
            field('Slots left', num('ap-left')),
            field('Stat', E('select', { id: 'ap-stat' })),
            field('Bonus', num('ap-bonus'), 'After the plus, like the 7 in (75 +7)')),
          E('div', { id: 'ap-stories' })),
        E('div', { id: 'ap-prices', class: 'ap-card-part' }),
        E('p', { id: 'ap-note', 'aria-live': 'polite' })),
      E('section', { id: 'ap-answer', class: 'ap-card', 'aria-live': 'polite' },
        E('p', { class: 'small' }, 'Costs about this much to make one'),
        E('div', { id: 'ap-price', class: 'big' }),
        E('div', { id: 'ap-why' }),
        E('label', {}, 'Offer you got (optional)', E('input', { id: 'ap-offer', autocomplete: 'off' })),
        E('p', { id: 'ap-offerline' }),
        E('p', { class: 'small' }, "This is a ceiling. Check Cozy's listings with the same stats too, since that's what one actually sells for."))));

  $('ap-item').addEventListener('input', () => setItem($('ap-item').value));
  for (const id of ['ap-passes', 'ap-left', 'ap-bonus']) $(id).addEventListener('input', () => { ui.pick = 0; update(); });
  $('ap-stat').addEventListener('change', () => { ui.pick = 0; renderFacts(); update(); });
  $('ap-offer').addEventListener('input', update);
  update();
}

function setItem(text) {
  const t = text.trim().toLowerCase();
  const equip = ui.data.equips.find(e => e.name.toLowerCase() === t) || null;
  if (equip === ui.equip) return;
  Object.assign(ui, { equip, pick: 0 });
  const fams = equip ? ui.data.families.filter(f => f.slot === equip.slot) : [];
  fams.sort((a, b) => (STAT_ORDER.indexOf(a.stat) + 1 || 99) - (STAT_ORDER.indexOf(b.stat) + 1 || 99));
  $('ap-stat').replaceChildren(...fams.map(f => E('option', { value: f.stat }, STAT_NAME[f.stat] || f.stat)));
  renderFacts(); update();
}

const family = () => ui.equip && ui.data.families.find(f => f.slot === ui.equip.slot && f.stat === $('ap-stat').value);

function renderFacts() {
  const e = ui.equip;
  if (!e) { $('ap-facts').textContent = $('ap-item').value.trim() ? 'Pick an item from the list.' : ''; return; }
  const jobs = e.job ? JOBS.filter(([b]) => e.job & b).map(([, n]) => n).join(', ') : 'any class';
  const stats = Object.entries(e.inc).map(([s, v]) => `${v} ${(STAT_NAME[s] || s).toLowerCase()}`).join(', ');
  const f = family();
  const odds = f ? ' · scrolls ' + f.tiers.map(t => `+${t.gain} ${t.rate}%${t.chaos ? ' chaos' : ''}`).join(', ') : '';
  $('ap-facts').textContent = `${e.slot} · Lv ${e.level} · ${jobs} · clean ${stats || 'no stats'} · ${e.slots} slots${odds}`;
}

function priceOf(name) { const v = parseMesos(ui.prices[name]); return v === null ? null : v; }

// The boxes are rebuilt only when the set of names changes, so typing in one never loses focus.
function renderPrices(rows) {
  const key = rows.map(r => r.name).join('|');
  if (key === ui.priceKeys) return;
  ui.priceKeys = key;
  $('ap-prices').replaceChildren(...rows.map(({ name, label }) => {
    const input = E('input', { 'data-price': name, autocomplete: 'off', placeholder: 'like 150k' });
    input.value = ui.prices[name] || '';
    input.addEventListener('input', () => { ui.prices[name] = input.value; update(); });
    const btn = E('button', { type: 'button', class: 'cozy', 'data-name': name, title: 'Copies the name and opens Cozy Market' }, 'Check on Cozy');
    btn.addEventListener('click', () => checkCozy(name));
    return E('label', {}, E('span', { class: 'ap-label' }, label, btn), input);
  }));
}

function checkCozy(name) {
  const note = $('ap-note');
  const handBack = () => {
    const box = E('input', { readonly: '', value: name });
    note.replaceChildren("Your browser didn't let us copy it. Copy the name, then paste it into Cozy's search:", box);
    box.focus(); box.select();
  };
  let copying;
  try { copying = navigator.clipboard.writeText(name); } catch { copying = Promise.reject(); }
  window.open('https://cozy.markets/items', '_blank', 'noopener');
  copying.then(() => note.replaceChildren(`Copied "${name}". Paste it into Cozy's search.`), handBack);
}

function renderStories(stories) {
  const top = stories.slice(0, 3);
  const key = top.map(s => s.tier.name + s.k + s.m).join('|') + '#' + ui.pick;
  if (key === ui.storyKeys) return;
  ui.storyKeys = key;
  if (top.length < 2) { $('ap-stories').replaceChildren(); return; }
  $('ap-stories').replaceChildren('Or:', ...top.map((s, i) => {
    const text = `${s.k} ${tierWord(s.tier)}` + (s.m ? ` + ${s.m} ${tierWord(s.filler)}` : '');
    const b = E('button', { type: 'button', 'aria-pressed': String(i === ui.pick) }, text);
    b.addEventListener('click', () => { ui.pick = i; update(); });
    return b;
  }));
}

const waitingLabel = (w, e) => w === 'base' ? e.name : w;

function scrolledView(e) {
  const f = family();
  if (['ap-passes', 'ap-left', 'ap-bonus'].every(id => !$(id).value.trim()))
    return { r: {}, rows: [{ name: e.name, label: 'Clean ' + e.name }], why: ['Type the + number, slots left and bonus from the tooltip.'], stories: [], blank: true };
  const r = appraiseScrolled({ equip: e, family: f, slotsLeft: whole($('ap-left').value), passes: whole($('ap-passes').value), bonus: whole($('ap-bonus').value), pick: ui.pick,
    prices: { base: priceOf(e.name), byTier: Object.fromEntries((f ? f.tiers : []).map(t => [t.name, priceOf(t.name)])) } });
  const rows = [{ name: e.name, label: 'Clean ' + e.name }];
  const s = r.story;
  if (s) { rows.push({ name: s.tier.name, label: s.tier.name }); if (s.m) rows.push({ name: s.filler.name, label: s.filler.name }); }
  const why = [];
  if (s) {
    const T = s.tier, chaos = T.chaos ? ' chaos' : '';
    why.push(`${cap(word(s.k))} ${T.rate}%${chaos} pass${s.k > 1 ? 'es' : ''} (+${s.k * T.gain})` + (s.m ? ` plus ${word(s.m)} 100% scroll${s.m > 1 ? 's' : ''} (+${s.m * s.filler.gain})` : '') + '.');
    if (r.q !== undefined) {
      const per = Math.round(r.scrollsPerItem * 10) / 10;
      const using = `using about ${per < 10 ? per : fmt(per)} scrolls per finished item.`;
      why.push(r.q >= 0.95 ? `Almost every clean base gets this far, ${using}`
        : r.q >= 0.5 ? `${Math.min(9, Math.round(r.q * 10))} in 10 clean bases get this far, ${using}`
        : `Only 1 in ${oneIn(r.bases)} clean bases get this far, ${using}`);
    }
    if (s.d && !s.fallback) why.push(`The ${s.d > 0 ? '+' : ''}${s.d} on the base is just the drop roll.`);
    if (r.q >= 0.5 && !r.warning) why.push("A buyer can make one almost every time, so don't pay much more.");
  } else if (r.price !== undefined) why.push("No scrolls passed, so it's worth a clean one.");
  return { r, rows, why, stories: r.stories || [] };
}

function update() {
  const e = ui.equip;
  const view = e ? scrolledView(e) : null;
  renderPrices(view ? view.rows : []);
  renderStories(view ? view.stories : []);
  const lines = [];
  let price;
  if (!view) lines.push(E('p', {}, 'Pick an item to start.'));
  else {
    const { r, why } = view;
    if (r.error) lines.push(E('p', { class: 'error' }, r.error));
    else {
      if (r.warning) lines.push(E('p', { class: 'error' }, r.warning));
      for (const w of why) lines.push(E('p', {}, w));
      if (r.waitingFor) lines.push(E('p', { class: 'small' }, `Fill in the price for ${waitingLabel(r.waitingFor, e)} to see the answer.`));
      else price = r.price;
    }
  }
  $('ap-price').textContent = price !== undefined && isFinite(price) ? fmt(price) : '?';
  $('ap-why').replaceChildren(...lines);
  const offer = parseMesos($('ap-offer').value);
  $('ap-offerline').textContent = price > 0 && offer > 0 ? compareOffer(offer, price) : '';
}

window.Appraiser = { parseMesos, fmt, oneIn, swingFor, scrollRun, findStories, appraiseScrolled, compareOffer, mount };
})();
