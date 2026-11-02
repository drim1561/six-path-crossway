// Appraiser selling price: what an item sells for right now, from rows of the same item (Cozy rows the player pasted,
// prices players reported), and how sure that is. No DOM, so it's tested under node (tests/appraiser-price.test.js).
// Pasted Cozy rows are Cozy's data: they're used here for this player's estimate and never sent to the site's database.
(function () {
'use strict';

const WINDOW_DAYS = 14;     // Cozy keeps 14 days, so the estimate does too
const LISTED_FACTOR = 0.85; // an ask is worth this much of a sale until the item has enough of both to learn its own ratio
const OUTLIER = 5;          // a price more than 5x above or below the middle is dropped (meowdb's rule)
const SOLID_MIN = 5;        // exact sales it takes to call the answer Solid
const DAY = 864e5;

// short stat names, as Cozy writes them, for tags, chips and roll lines
const LABELS = { int: 'INT', luk: 'LUK', str: 'STR', dex: 'DEX', pdd: 'W.Def', mdd: 'M.Def', wat: 'W.Atk', mad: 'M.Atk', acc: 'Accuracy',
  eva: 'Avoid', hp: 'HP', mp: 'MP', speed: 'Speed', jump: 'Jump', crt: 'Crit', crd: 'Crit Dmg' };

// One step apart counts as close: the drop roll swing (Appraiser.swing), at least 1.
const step = clean => Math.max(1, clean > 0 ? Math.floor(clean / 10) + 1 : 0);

function quantile(xs, q) {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return null;
  const i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}
const median = xs => quantile(xs, 0.5);
const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;

// rows: [{ bonus, total, slotsLeft, price (each), sold, ts, from, reporter? }]; target: { equip, bonus, slotsLeft }.
// Filters in order: a bad row (a stat we don't know, or a bonus that isn't a whole number), a different item (a shown
// stat's total minus bonus isn't this item's clean value), older than 14 days, not close (a stat that matters more than a
// step away; a stat the row leaves out is +0, since Cozy lists every stat an item has and reports save every stat that
// matters), then far (over 5x from the middle). Order of trust: with 5 exact sales from 5 sources (pasted rows each count;
// reports count once per reporter, so one account can't make it Solid alone), the price comes from those sales only.
// Otherwise every row left counts, and each stat that matters with 3 or more values among them gets a per point worth (a
// straight line fit, never below 0: more of a stat never makes it cheaper) that moves each row toward the target's stats,
// never past the highest or lowest value seen.
function estimate(rows, target, { matters, now }) {
  const clean = s => target.equip.inc[s] || 0;
  const want = s => target.bonus[s] || 0;
  const bonusOf = (row, s) => (row.bonus && row.bonus[s]) || 0;
  const sound = row => Object.entries(row.bonus || {}).every(([s, v]) => Object.prototype.hasOwnProperty.call(LABELS, s) && Number.isInteger(v));
  const views = rows.map(row => {
    if (!sound(row) || !(row.price > 0)) return { row, tag: '', why: 'bad row' };
    for (const s of Object.keys(row.total || {})) if (row.total[s] - bonusOf(row, s) !== clean(s)) return { row, tag: '', why: 'different item' };
    if (now - row.ts > WINDOW_DAYS * DAY) return { row, tag: '', why: 'old' };
    const diffs = [];
    for (const s of matters) {
      const d = bonusOf(row, s) - want(s);
      if (Math.abs(d) > step(clean(s))) return { row, tag: '', why: 'not close' };
      if (d) diffs.push([s, d]);
    }
    const exact = !diffs.length && row.slotsLeft != null && target.slotsLeft != null && Math.abs(row.slotsLeft - target.slotsLeft) <= 1;
    const tag = diffs.length ? diffs.map(([s, d]) => `${Math.abs(d)} ${LABELS[s] || s} ${d < 0 ? 'less' : 'more'}`).join(', ') : 'same stats';
    return { row, tag, exact, gap: diffs.reduce((n, [, d]) => n + Math.abs(d), 0) };
  });

  const close = views.filter(v => !v.why);
  const soldP = close.filter(v => v.row.sold).map(v => v.row.price), listP = close.filter(v => !v.row.sold).map(v => v.row.price);
  const ratio = soldP.length >= 3 && listP.length >= 3 ? median(soldP) / median(listP) : LISTED_FACTOR;
  const eff = v => v.row.sold ? v.row.price : v.row.price * ratio;
  const mid = median(close.map(eff));
  for (const v of close) { const e = eff(v); if (e > mid * OUTLIER || e < mid / OUTLIER) v.why = 'far'; }
  const kept = close.filter(v => !v.why);

  // exact sales, counted by source: each pasted row is one, a reporter's reports are one together
  const exactSales = kept.filter(v => v.exact && v.row.sold);
  const sources = new Set(exactSales.map((v, i) => v.row.from === 'report' ? 'r:' + (v.row.reporter || '?') : 'p:' + i)).size;
  const solid = sources >= SOLID_MIN;
  const priced = solid ? exactSales : kept;

  const slopes = {}, span = {};
  for (const s of matters) {
    const pts = priced.map(v => [bonusOf(v.row, s), eff(v)]);
    if (new Set(pts.map(p => p[0])).size < 3) continue;
    const mx = mean(pts.map(p => p[0])), my = mean(pts.map(p => p[1]));
    const num = pts.reduce((n, [x, y]) => n + (x - mx) * (y - my), 0), den = pts.reduce((n, [x]) => n + (x - mx) * (x - mx), 0);
    slopes[s] = Math.max(0, num / den);
    span[s] = [Math.min(...pts.map(p => p[0])), Math.max(...pts.map(p => p[0]))];
  }
  const toward = s => Math.min(span[s][1], Math.max(span[s][0], want(s)));
  const adjusted = v => eff(v) + Object.keys(slopes).reduce((n, s) => n + slopes[s] * (toward(s) - bonusOf(v.row, s)), 0);
  const prices = priced.map(adjusted);
  const round = x => x === null ? null : Math.round(x);
  const used = [...kept].sort((a, b) => b.exact - a.exact || a.gap - b.gap || b.row.ts - a.row.ts);
  return {
    price: priced.length ? round(median(prices)) : null,
    low: priced.length ? round(quantile(prices, 0.25)) : null,
    high: priced.length ? round(quantile(prices, 0.75)) : null,
    sold: priced.filter(v => v.row.sold).length,
    listed: priced.filter(v => !v.row.sold).length,
    confidence: !kept.length ? 'none' : solid ? 'solid' : 'rough',
    used: used.map(({ row, tag, exact }) => ({ row, tag, exact })),
    dropped: views.filter(v => v.why).map(({ row, tag, why }) => ({ row, tag, why })),
  };
}

// An offer next to the estimate, within 5% counts as about the same.
function compareOffer(offer, price) {
  const r = offer / price;
  if (Math.abs(r - 1) <= 0.05) return 'About what it usually sells for.';
  return `${Math.round(Math.abs(1 - r) * 100)}% ${r < 1 ? 'under' : 'over'} what it usually sells for.`;
}

// The history key for one item: the bonus on every stat that matters, and the slots left.
const statsKey = (bonus, matters, slotsLeft) => [...matters].sort().map(s => `${s}:${bonus[s] || 0}`).join(',') + ';left:' + slotsLeft;

/* ---------- Paste from Cozy ---------- */

// Cozy's stat names (its filter boxes and its table) to ours. Checked on its pages 2026-11-02: STR, DEX, INT, LUK, MP,
// W.Def, M.Def, Crit Dmg, W.Att, M.Att. The rest are its likely spellings. A name that isn't here is left out, never guessed.
const COZY_STATS = { STR: 'str', DEX: 'dex', INT: 'int', LUK: 'luk', HP: 'hp', MP: 'mp', 'W.Def': 'pdd', 'M.Def': 'mdd', 'W.Att': 'wat', 'M.Att': 'mad',
  Acc: 'acc', Accuracy: 'acc', Avoid: 'eva', Avoidability: 'eva', Speed: 'speed', Jump: 'jump', Crit: 'crt', 'Crit Dmg': 'crd' };
const isStat = s => Object.prototype.hasOwnProperty.call(COZY_STATS, s);

const mesos = s => {
  const m = /^(\d*\.?\d+)([kmb])?$/i.exec(String(s).replace(/,/g, '').trim());
  return m ? Math.round(parseFloat(m[1]) * ({ k: 1e3, m: 1e6, b: 1e9 }[(m[2] || '').toLowerCase()] || 1)) : null;
};
// "just now", "15m ago", "21h ago", "2d ago", "1 week ago"; anything else is null, so its row is skipped, not guessed
function ageOf(s) {
  s = s.trim().toLowerCase();
  if (s === 'just now') return 0;
  const m = /^(\d+)\s*([mhdw])[a-z]*\s+ago$/.exec(s);
  return m ? +m[1] * { m: 6e4, h: 36e5, d: DAY, w: 7 * DAY }[m[2]] : null;
}

// The listings table on a Cozy item page, as selecting it and copying gives it: per row the when, "Ch 28 · FM 17", the
// shop's owner and message (thrown away here), each stat as name, total and an optional signed bonus, "Slots 0/10" (slots
// left of the item's slots), the stock, SOLD on a sale, an optional "↓ from 1.4m", the price and then "each  +2471%".
// A row with no stats recorded (Cozy's —) or a time it can't read is skipped and counted.
function parseCozyPaste(text, now) {
  if (!text || !text.trim()) return { rows: [], skipped: 0, error: 'empty' };
  const lines = text.split(/\r?\n/).map(l => l.trim());
  const starts = [];
  for (let i = 0; i + 1 < lines.length; i++) if (/^Ch \d+ · /.test(lines[i + 1])) starts.push(i);
  if (!starts.length) return { rows: [], skipped: 0, error: 'unrecognized' };
  const rows = [];
  let skipped = 0;
  starts.forEach((s, n) => {
    const block = lines.slice(s, n + 1 < starts.length ? starts[n + 1] : lines.length);
    const age = ageOf(block[0]), where = block[1];
    let i = 2;
    while (i < block.length && !/^—/.test(block[i]) && !((isStat(block[i]) || block[i] === 'Slots') && /^\d+(\/\d+)?$/.test(block[i + 1] || ''))) i++;
    if (age === null || i >= block.length || /^—/.test(block[i])) { skipped++; return; }
    const bonus = {}, total = {};
    let slotsLeft = null;
    while (i < block.length) {
      if (block[i] === 'Slots') { const m = /^(\d+)\/\d+$/.exec(block[i + 1] || ''); if (m) slotsLeft = +m[1]; i += 2; break; }
      if (!/^\d+$/.test(block[i + 1] || '')) break;
      const b = /^[+-]\d+$/.test(block[i + 2] || '') ? +block[i + 2] : null;
      if (isStat(block[i])) { total[COZY_STATS[block[i]]] = +block[i + 1]; bonus[COZY_STATS[block[i]]] = b || 0; }
      i += b === null ? 2 : 3;
    }
    // the rest of this row only (up to Cozy's "Shop Gone?" button), so nothing from the next row leaks in
    const end = block.indexOf('Shop Gone?', i), tail = block.slice(i, end < 0 ? block.length : end);
    // the EACH price is the one before VS FM ("1.2m  +2471%", tab or spaces); with VS FM blank, the last amount after the stock
    const each = tail.map(l => /^(\S+)\s+[+-]?\d+%/.exec(l)).find(Boolean);
    const amounts = tail.slice(1).filter(l => /^\d[\d.,]*[kmb]?$/i.test(l));
    const price = each ? mesos(each[1]) : amounts.length ? mesos(amounts[amounts.length - 1]) : null;
    if (!price) { skipped++; return; }
    const sold = tail.includes('SOLD');
    rows.push({ bonus, total, slotsLeft, price, sold, ts: now - age, from: 'paste', key: [where, JSON.stringify(total), slotsLeft, price, sold ? 1 : 0].join('|') });
  });
  return { rows, skipped };
}

// Rows from another paste added in, each listing once however often it's pasted (keyed on where, stats, price, sold).
function merge(a, b) {
  const seen = new Set(a.map(r => r.key));
  return [...a, ...b.filter(r => !seen.has(r.key) && seen.add(r.key))];
}

window.AppraiserPrice = { WINDOW_DAYS, LISTED_FACTOR, OUTLIER, SOLID_MIN, LABELS, COZY_STATS, estimate, compareOffer, statsKey, parseCozyPaste, merge };
})();
