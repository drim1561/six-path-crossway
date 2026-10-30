// Builds tab: Classic damage formulas, the mob ranking and the personal guide, plus the tab's UI.
// Formulas are meowdb's Classic ones (meowdb.com/msclassic/formulas/damage), and a class only gets a
// calculator once they reproduce a real stat window from a player of that class (see tests/builds-logic.test.js).
(function () {
'use strict';

/* ---------- Classes ---------- */

// jobMask is the client's reqJob bit: 1 warrior, 2 mage, 4 bowman, 8 thief.
const CLASSES = {
  cleric: { id: 'cleric', name: 'Cleric', checked: true, family: 'spell', jobMask: 2, job2: 230,
    mainStat: 'int', reqStat: 'luk', weaponSlot: 'Wand', attack: 2301004, element: 'H',
    fields: ['level', 'str', 'dex', 'int', 'luk', 'magic', 'acc'],
    skills: [2301004, 2301001, 2301002, 2301003, 2300000, 2301000],
    // Holy Arrow is usually maxed by now; MP Eater stays at 1 (monsters near this level have too little MP).
    skillOrder: [[2301004, 30], [2301001, 30], [2301002, 20], [2301003, 20], [2301000, 20]] },
  assassin: { id: 'assassin', name: 'Assassin', checked: true, family: 'claw', jobMask: 8, job2: 410,
    mainStat: 'luk', reqStat: 'dex', weaponSlot: 'Claw', attack: 4001003, mastery: 4100000,
    fields: ['level', 'str', 'dex', 'int', 'luk', 'atk', 'acc', 'crit'],
    skills: [4001003, 4100000, 4100001, 4100002, 4101000, 4101001, 4101002],
    // Claw Booster's speed is the same at level 1, so its points come last.
    skillOrder: [[4100000, 20], [4100001, 30], [4100002, 3], [4101001, 20], [4101002, 30], [4101000, 20]] },
  fighter: { id: 'fighter', name: 'Fighter', checked: false, jobMask: 1 },
  page: { id: 'page', name: 'Page', checked: false, jobMask: 1 },
  spearman: { id: 'spearman', name: 'Spearman', checked: false, jobMask: 1 },
  fpwizard: { id: 'fpwizard', name: 'Fire/Poison Wizard', checked: false, jobMask: 2 },
  ilwizard: { id: 'ilwizard', name: 'Ice/Lightning Wizard', checked: false, jobMask: 2 },
  hunter: { id: 'hunter', name: 'Hunter', checked: false, jobMask: 4 },
  crossbowman: { id: 'crossbowman', name: 'Crossbowman', checked: false, jobMask: 4 },
  bandit: { id: 'bandit', name: 'Bandit', checked: false, jobMask: 8 },
};
const ADVANCE = 30, NEXT_ADVANCE = 70;

/* ---------- Formulas ---------- */

const mastery = level => (level / 10 + 0.1) * 0.7;
// Physical: MAX = S·W·(1 + (P·mult + sec)/100 + ap/50); MIN swaps 1 for 0.8 and P for P·M.
function physRange({ S, W, P, sec, mult, M, ap }) {
  return [S * W * (0.8 + (P * M * mult + sec) / 100 + ap / 50), S * W * (1 + (P * mult + sec) / 100 + ap / 50)];
}
// Spells: MAX = S·Magic·(1 + INT/125), MIN = S·Magic·(1 + INT·M/125).
function spellRange({ S, magic, int, M }) {
  return [S * magic * (1 + int * M / 125), S * magic * (1 + int / 125)];
}
// The stat window shows the claw's normal throw (S = 1), so its max gives the total weapon attack back.
function weaponAttackFromMax(max, { P, sec, mult, ap }) {
  const W = max / (1 + (P * mult + sec) / 100 + ap / 50);
  return W > 0 && isFinite(W) ? W : NaN;
}
function levelScale(mobLv, lv) {
  const g = mobLv - lv;
  return g <= 0 ? 1 : g < 10 ? 1 / (1 + g * g * 0.005) : 1 / (1 + g * 0.05);
}
function hitChance(acc, lv, mob) {
  const L = Math.max(0, mob.level - lv), A = acc * 100 / (10 * L + 255), D = A - mob.eva;
  if (D >= 25 + L * (0.5 * lv + 15)) return 1;
  const f = 0.15 + 0.2 / (1 + Math.exp(D / 12)), q = mob.eva / A;
  if (q <= 1 - f) return 1;
  if (q >= 1 + f) return 0;
  return (1 + f - q) / (2 * f);
}
const defend = (dmg, def) => dmg * 100 / (def + 100);
// Client elemAttr is letter + digit pairs: 1 immune, 2 resist, 3 weak. Undead count as Holy weak.
function elemMult(mob, element) {
  if (!element) return 1;
  const m = new RegExp(element + '([123])').exec(mob.elem || '');
  if (m) return { 1: 0, 2: 0.75, 3: 1.25 }[m[1]];
  return element === 'H' && mob.undead ? 1.25 : 1;
}
function makeRng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
// Average casts over n simulated kills; null when the monster is effectively unkillable (over 20 casts).
function castsToKill({ hp, range, hits, crit, hit, mult }, rng, n = 2000) {
  if (!(hit * mult > 0)) return null;
  let total = 0;
  for (let i = 0; i < n; i++) {
    let left = hp, casts = 0;
    while (left > 0 && casts < 50) {
      casts++;
      for (let k = 0; k < hits; k++) {
        if (rng() >= hit) continue;
        let x = (range[0] + rng() * (range[1] - range[0])) * mult;
        if (rng() < crit.rate) x *= 1 + crit.dmg;
        left -= Math.floor(x);
      }
    }
    total += casts;
  }
  const mean = total / n;
  return mean > 20 ? null : mean;
}

/* ---------- Inputs ---------- */

const LABEL = { level: 'level', str: 'STR', dex: 'DEX', int: 'INT', luk: 'LUK', magic: 'Magic', acc: 'accuracy',
  atkMin: 'attack', atkMax: 'attack', critRate: 'crit rate', critDmg: 'crit damage' };
const LIMIT = { str: 999, dex: 999, int: 999, luk: 999, magic: 9999, acc: 999, atkMin: 99999, atkMax: 99999, critRate: 100, critDmg: 500 };
const blank = v => v === undefined || v === null || String(v).trim() === '';
// A skill's numbers at level n, or undefined at level 0 (no points, no bonus).
const level = (row, n) => row && n >= 1 ? row.lv[Math.min(n, row.lv.length) - 1] : undefined;
let DATA = null; // set by rankMobs/buildGuide, used for gear based defaults
function bestWeapon(slot, lv, key) {
  if (!DATA) return 0;
  return DATA.gear.filter(g => g.slot === slot && g.level <= lv).reduce((m, g) => Math.max(m, g.inc[key] || 0), 0);
}

// Turns the form into numbers. Blank fields get a typical value for the class and level and are listed in assumed.
function validateStats(raw, clsId) {
  const cls = CLASSES[clsId], errors = [], assumed = [], stats = { skills: {} };
  const lv = Number(raw.level);
  if (blank(raw.level) || !Number.isInteger(lv) || lv < 1 || lv > 200) {
    errors.push('Type your level, a whole number from 1 to 200.');
    return { stats, assumed, errors };
  }
  stats.level = lv;
  const take = (k, dflt) => {
    if (blank(raw[k])) { assumed.push(k); stats[k] = dflt(); return; }
    const n = Number(raw[k]);
    if (!isFinite(n) || n < 0) errors.push('That ' + LABEL[k] + " doesn't look like a number.");
    else if (n > LIMIT[k]) errors.push('That ' + LABEL[k] + ' looks too high.');
    stats[k] = n;
  };
  const main = cls && cls.mainStat, req = cls && cls.reqStat;
  for (const k of ['str', 'dex', 'int', 'luk']) take(k, () => k === main ? 4 + 5 * (lv - 1) : k === req ? 25 : 4);
  const sk = raw.skills || {};
  if (cls && cls.skills) for (const id of cls.skills) {
    const max = DATA && DATA.skills[id] ? DATA.skills[id].max : 30;
    if (blank(sk[id])) { stats.skills[id] = id === cls.attack ? max : 0; if (id === cls.attack) assumed.push('skills'); }
    else stats.skills[id] = Math.max(0, Math.min(max, Math.floor(Number(sk[id]) || 0)));
    if (id === cls.attack && stats.skills[id] < 1) errors.push('Put at least 1 point in ' + (DATA && DATA.skills[id] ? DATA.skills[id].name : 'your attack skill') + ' for a guide.');
  }
  if (cls && cls.family === 'spell') {
    take('magic', () => Math.floor(stats.int / 2) + bestWeapon(cls.weaponSlot, lv, 'mad'));
    take('acc', () => lv + 60);
    if (!errors.length && !(stats.magic > 0)) errors.push('That Magic looks too low.');
  }
  if (cls && cls.family === 'claw') {
    const cm = DATA && DATA.skills[cls.mastery], ap = (level(cm, stats.skills[cls.mastery]) || {}).x || 0;
    const shape = { P: stats.luk, sec: stats.str + stats.dex, mult: 2.5, ap };
    const W = bestWeapon(cls.weaponSlot, lv, 'wat') + 15;
    const M = mastery((level(cm, stats.skills[cls.mastery]) || {}).mastery || 0);
    const r = physRange({ S: 1, W, ...shape, M });
    take('atkMin', () => Math.round(r[0]));
    take('atkMax', () => Math.round(r[1]));
    if (assumed.includes('atkMin') !== assumed.includes('atkMax')) errors.push('Type both ends of the attack range.');
    take('acc', () => Math.floor((1.2 * stats.dex + 2 * lv + 0.6 * stats.luk) / 4 + 15) + 15);
    const ct = DATA && DATA.skills[4100001], c = level(ct, stats.skills[4100001]) || {};
    take('critRate', () => 5 + (c.crtX || 0));
    take('critDmg', () => 120 + (c.crdX || 0));
    if (!errors.length) {
      if (stats.atkMax < stats.atkMin) errors.push('The attack range looks backwards.');
      else if (Number.isNaN(weaponAttackFromMax(stats.atkMax, shape))) errors.push('That attack range looks too low.');
    }
  }
  return { stats, assumed, errors };
}

/* ---------- Ranking ---------- */

// What one cast does: damage range per hit, hits per cast, crits, which defense and element apply.
function attackModel(s, cls, Wover) {
  const sk = id => level(DATA.skills[id], s.skills[id]) || {};
  if (cls.family === 'claw') {
    const cm = sk(cls.mastery), ap = cm.x || 0, sec = s.str + s.dex;
    const W = Wover !== undefined ? Wover : weaponAttackFromMax(s.atkMax, { P: s.luk, sec, mult: 2.5, ap });
    const l7 = sk(cls.attack);
    return { range: physRange({ S: (l7.damage || 0) / 100, W, P: s.luk, sec, mult: 3, M: 0.5, ap }), hits: l7.bulletCount || 2,
      crit: { rate: s.critRate / 100, dmg: s.critDmg / 100 - 1 }, def: 'pdd', element: null, W };
  }
  const ha = sk(cls.attack);
  return { range: spellRange({ S: (ha.mad || 0) / 100, magic: s.magic, int: s.int, M: mastery(ha.mastery || 0) }), hits: ha.attackCount || 1,
    crit: { rate: 0, dmg: 0 }, def: 'mdd', element: cls.element };
}
function rankWith(s, cls, data) {
  const am = attackModel(s, cls), seed = hash(JSON.stringify(s)), out = [];
  for (const mob of data.mobs) {
    const hit = hitChance(s.acc, s.level, mob), mult = defend(1, mob[am.def]) * elemMult(mob, am.element) * levelScale(mob.level, s.level);
    const casts = castsToKill({ hp: mob.hp, range: am.range, hits: am.hits, crit: am.crit, hit, mult }, makeRng(seed ^ mob.id));
    if (casts === null) continue;
    out.push({ id: mob.id, name: mob.name, level: mob.level, hp: mob.hp, exp: mob.exp, def: mob[am.def], casts: Math.round(casts * 100) / 100,
      expPerCast: Math.round(mob.exp / casts * 10) / 10, hit: Math.round(hit * 100), map: mob.maps[0][0], count: mob.maps[0][1] });
  }
  return out.sort((a, b) => b.expPerCast - a.expPerCast || b.exp - a.exp);
}
function rankMobs(raw, clsId, data) {
  DATA = data;
  const cls = CLASSES[clsId];
  if (!cls || !cls.checked) return [];
  const v = validateStats(raw, clsId);
  return v.errors.length ? [] : rankWith(v.stats, cls, data);
}

/* ---------- Guide ---------- */

const STAT_NAME = { str: 'STR', dex: 'DEX', int: 'INT', luk: 'LUK', wat: 'weapon attack', mad: 'magic attack', crt: 'crit rate', acc: 'accuracy' };
const ARMOR = ['Hat', 'Top', 'Bottom', 'Overall', 'Shoes', 'Gloves', 'Cape', 'Earrings'];
const fits = (g, cls) => g.job === 0 || (g.job & cls.jobMask) !== 0;

// Expected damage of one cast with a few stats changed (d), for "what is +1 of this worth".
function avgCast(s, cls, d) {
  d = d || {};
  if (cls.family === 'claw') {
    const base = attackModel(s, cls);
    const s2 = { ...s, luk: s.luk + (d.luk || 0), str: s.str + (d.str || 0), critRate: s.critRate + (d.crt || 0) };
    const am = attackModel(s2, cls, base.W + (d.wat || 0));
    return am.hits * (am.range[0] + am.range[1]) / 2 * (1 + am.crit.rate * am.crit.dmg);
  }
  const s2 = { ...s, int: s.int + (d.int || 0), magic: s.magic + (d.mad || 0) + (d.int || 0) / 2 };
  const am = attackModel(s2, cls);
  return am.hits * (am.range[0] + am.range[1]) / 2;
}
const gainPct = (s, cls, d) => Math.round((avgCast(s, cls, d) / avgCast(s, cls) - 1) * 10000) / 100;

// 3 SP a level until the next job advancement, spent down skillOrder (prerequisites first).
function planSkills(s, cls) {
  const ids = cls.skills.filter(id => DATA.skills[id] && DATA.skills[id].job === cls.job2);
  const now = {}, plan = {};
  for (const id of ids) now[id] = plan[id] = s.skills[id] || 0;
  let left = Math.max(0, 3 * (NEXT_ADVANCE - s.level)), used = 0;
  const steps = [];
  const atLevel = i => s.level + 1 + Math.floor(i / 3);
  function raise(id, target) {
    const row = DATA.skills[id];
    for (const [rid, rlv] of Object.entries(row.req || {})) if (plan[rid] !== undefined) raise(Number(rid), rlv);
    const add = Math.min(Math.max(0, target - plan[id]), left);
    if (!add) return;
    steps.push({ from: atLevel(used), to: atLevel(used + add - 1), id, text: row.name + ' to ' + (plan[id] + add) + ' (' + add + (add === 1 ? ' point)' : ' points)') });
    plan[id] += add; left -= add; used += add;
  }
  for (const [id, target] of cls.skillOrder) if (plan[id] !== undefined) raise(id, Math.min(target, DATA.skills[id].max));
  return { now, plan, steps, spare: left };
}

// 5 AP a level into the main stat, except what the next weapon needs in its second stat, put in just before that level.
function planAP(s, cls) {
  const tiers = {};
  for (const g of DATA.gear) if (g.slot === cls.weaponSlot && fits(g, cls) && g.level > s.level && g.level <= NEXT_ADVANCE) {
    const t = tiers[g.level];
    if (!t || g.req[cls.reqStat] < t.need) tiers[g.level] = { need: g.req[cls.reqStat], name: g.name.replace(/^\S+ /, '') };
  }
  const per = {};
  for (let lv = s.level + 1; lv < NEXT_ADVANCE; lv++) per[lv] = { req: 0, why: '' };
  let have = s[cls.reqStat];
  for (const T of Object.keys(tiers).map(Number).sort((a, b) => a - b)) {
    let need = tiers[T].need - have;
    if (need <= 0) continue;
    have += need;
    for (let lv = T - 1; lv > s.level && need > 0; lv--) {
      const take = Math.min(5 - per[lv].req, need);
      if (take <= 0) continue;
      per[lv].req += take; need -= take; per[lv].why = 'So you can wear a ' + tiers[T].name + ' at ' + T + ' (it needs ' + tiers[T].need + ' ' + STAT_NAME[cls.reqStat] + ').';
    }
  }
  const rows = [];
  for (let lv = s.level + 1; lv < NEXT_ADVANCE; lv++) {
    const p = per[lv], main = 5 - p.req;
    const put = p.req ? p.req + ' ' + STAT_NAME[cls.reqStat] + (main ? ', ' + main + ' ' + STAT_NAME[cls.mainStat] : '') : '5 ' + STAT_NAME[cls.mainStat];
    const why = p.why || 'Your main stat, it adds the most damage.';
    const last = rows[rows.length - 1];
    if (last && last.put === put && last.why === why && last.to === lv - 1) last.to = lv;
    else rows.push({ from: lv, to: lv, put, why });
  }
  return rows;
}

// The best item per level tier in each slot, scored by what it adds to this class's damage.
function planGear(s, cls) {
  const atk = cls.family === 'claw' ? 'wat' : 'mad';
  const score = g => (g.inc[atk] || 0) * 6 + (g.inc[cls.mainStat] || 0) + (g.inc.crt || 0) * 1.5 + (g.inc[cls.reqStat] || 0) * 0.3;
  const out = [];
  for (const slot of [cls.weaponSlot].concat(ARMOR)) {
    const best = {};
    for (const g of DATA.gear) {
      if (g.slot !== slot || !fits(g, cls) || g.level < s.level - 12 || g.level > NEXT_ADVANCE || !(score(g) > 0)) continue;
      if (!best[g.level] || score(g) > score(best[g.level])) best[g.level] = g;
    }
    const rows = Object.values(best).sort((a, b) => a.level - b.level).slice(0, 4)
      .map(g => ({ level: g.level, name: g.name, inc: g.inc, craft: g.craft, slots: g.slots }));
    if (rows.length) out.push({ slot, rows });
  }
  return out;
}

// Scroll families that raise this class's damage, by what filling a typical item's slots with Lessers adds.
function planScrolls(s, cls, gear) {
  const atk = cls.family === 'claw' ? 'wat' : 'mad';
  const useful = cls.family === 'claw' ? [atk, cls.mainStat, 'crt'] : [atk, cls.mainStat];
  const out = [];
  for (const f of DATA.scrolls) {
    if (!useful.includes(f.stat)) continue;
    const slot = gear.find(x => x.slot === f.slot);
    if (!slot) continue;
    const slots = slot.rows[0].slots || 5, gain = f.gains[0] * slots;
    out.push({ slot: f.slot, family: f.family, gainAllLesser: slots + ' slots, +' + gain + ' ' + STAT_NAME[f.stat], pct: gainPct(s, cls, { [f.stat === 'luk' || f.stat === 'int' ? f.stat : f.stat]: gain }) });
  }
  return out.sort((a, b) => b.pct - a.pct).slice(0, 5).map((x, i) => ({ order: i + 1, ...x }));
}

function buildGuide(raw, clsId, data) {
  DATA = data;
  const cls = CLASSES[clsId];
  if (!cls) return { ok: false, errors: ['Pick your class.'] };
  if (!cls.checked) return { ok: false, unchecked: true };
  const v = validateStats(raw, clsId);
  if (v.errors.length) return { ok: false, errors: v.errors };
  const s = v.stats, am = attackModel(s, cls), sum = am.range[0] + am.range[1];
  const worth = cls.family === 'claw'
    ? [['+1 weapon attack (claw, gloves or stars)', { wat: 1 }], ['+1% crit rate', { crt: 1 }], ['+1 LUK', { luk: 1 }], ['+1 DEX or STR', { str: 1 }]]
    : [['+1 magic attack', { mad: 1 }], ['+1 INT', { int: 1 }]];
  const gear = planGear(s, cls);
  return { ok: true, assumed: v.assumed, stats: s,
    attack: { min: Math.round(am.range[0]), max: Math.round(am.range[1]), avg: Math.round(sum / 2 * am.hits) },
    train: rankWith(s, cls, data).slice(0, 10), skills: planSkills(s, cls), ap: planAP(s, cls), gear,
    scrolls: planScrolls(s, cls, gear), worth: worth.map(([what, d]) => ({ what, pct: gainPct(s, cls, d) })) };
}

/* ---------- UI ---------- */

const INPUTS = { level: [['level', 'Level']], str: [['str', 'STR']], dex: [['dex', 'DEX']], int: [['int', 'INT']], luk: [['luk', 'LUK']],
  magic: [['magic', 'Magic']], acc: [['acc', 'Accuracy']], atk: [['atkMin', 'Attack low'], ['atkMax', 'Attack high']],
  crit: [['critRate', 'Crit rate %'], ['critDmg', 'Crit damage %']] };
const OPEN_FIELDS = ['level', 'str', 'dex', 'int', 'luk', 'atk', 'magic', 'acc'];
const ASSUMED_LABEL = { ...LABEL, atkMin: 'attack range', atkMax: 'attack range', skills: 'attack skill level' };
// read: boxes the screen reader filled ('v:luk', 's:4100000'), marked until the player edits them
const ui = { deps: null, data: null, root: null, form: { cls: 'cleric', v: {}, s: {} }, timer: 0, read: new Set() };
const E = (...a) => ui.deps.el(...a);
const fieldsOf = cls => (cls.checked ? cls.fields : OPEN_FIELDS).flatMap(f => INPUTS[f]);
const fmt = n => Math.round(n).toLocaleString('en-US');

function loadForm() {
  try {
    const f = JSON.parse(ui.deps.store.get('bt.calc'));
    if (f && CLASSES[f.cls]) ui.form = { cls: f.cls, v: f.v || {}, s: f.s || {} };
  } catch { /* nothing saved yet */ }
}
const saveForm = () => ui.deps.store.set('bt.calc', JSON.stringify(ui.form));
const rawStats = () => ({ ...ui.form.v, skills: { ...ui.form.s } });

function buildForm() {
  const cls = CLASSES[ui.form.cls], box = ui.root.querySelector('.b-form');
  const input = (id, label, value, on, key) => E('label', {}, label, E('input', { id, inputmode: 'numeric', autocomplete: 'off', value: value == null ? '' : String(value),
    ...(ui.read.has(key) ? { class: 'b-read' } : {}), oninput: e => { ui.read.delete(key); e.target.classList.remove('b-read'); on(e); typedIn(key); } }));
  const kids = [E('label', { class: 'wide' }, 'Class', E('select', { id: 'b-class', onchange: e => { ui.form.cls = e.target.value; saveForm(); buildForm(); renderGuide(); } },
    Object.values(CLASSES).map(c => { const o = E('option', { value: c.id }, c.name + (c.checked ? '' : ' (no guide yet)')); if (c.id === ui.form.cls) o.selected = true; return o; })))];
  for (const [k, label] of fieldsOf(cls)) kids.push(input('b-f-' + k, label, ui.form.v[k], e => { ui.form.v[k] = e.target.value; changed(); }, 'v:' + k));
  if (cls.checked) {
    kids.push(E('p', { class: 'b-sub' }, 'Skill levels'));
    for (const id of cls.skills) {
      const row = ui.data.skills[id];
      if (row) kids.push(input('b-s-' + id, row.name, ui.form.s[id], e => { ui.form.s[id] = e.target.value; changed(); }, 's:' + id));
    }
  }
  box.replaceChildren(...kids);
}
function changed() { saveForm(); clearTimeout(ui.timer); ui.timer = setTimeout(renderGuide, 150); }

function table(head, rows, numeric) {
  return E('div', { class: 'b-wrap' }, E('table', { class: 'b-table' },
    E('thead', {}, E('tr', {}, head.map((h, i) => E('th', numeric && numeric.includes(i) ? { class: 'n' } : {}, h)))),
    E('tbody', {}, rows.map(r => E('tr', {}, r.map((c, i) => E('td', numeric && numeric.includes(i) ? { class: 'n' } : {}, c)))))));
}
const incText = inc => Object.entries(inc).filter(([k]) => STAT_NAME[k]).map(([k, v]) => STAT_NAME[k] + ' +' + v).join(', ');

function renderGuide() {
  const cls = CLASSES[ui.form.cls], msg = ui.root.querySelector('#b-msg'), out = ui.root.querySelector('#b-guide');
  const g = buildGuide(rawStats(), ui.form.cls, ui.data);
  msg.className = '';
  if (!g.ok) {
    out.hidden = true;
    out.querySelectorAll('tbody').forEach(t => t.replaceChildren());
    if (g.unchecked) { msg.className = 'note'; msg.textContent = "We haven't checked this class's damage math yet, so there's no guide for it. You can still save and browse " + cls.name + ' builds below.'; }
    else { msg.className = 'error'; msg.textContent = g.errors.join(' '); }
    return g;
  }
  out.hidden = false;
  const guessed = [...new Set(g.assumed.map(k => ASSUMED_LABEL[k]))];
  if (guessed.length) { msg.className = 'note'; msg.textContent = 'Guessed from your level because these boxes are empty: ' + guessed.join(', ') + '. Fill them in for a sharper guide.'; }
  else msg.textContent = '';
  const atk = ui.data.skills[cls.attack].name;
  out.querySelector('#b-attack').textContent = 'One ' + atk + ' does ' + fmt(g.attack.min) + ' to ' + fmt(g.attack.max) + ' a hit, about ' + fmt(g.attack.avg) + ' a cast before monster defense.';
  out.querySelector('#train').replaceChildren(table(['Monster', 'Map', 'HP', 'Def', 'EXP', 'Casts', 'EXP a cast', 'Hit'],
    g.train.map(m => [m.name + ' (' + m.level + ')', m.map + ' (' + m.count + ')', fmt(m.hp), String(m.def), fmt(m.exp), m.casts.toFixed(1), m.expPerCast.toFixed(0), m.hit + '%']), [2, 3, 4, 5, 6, 7]));
  const sk = g.skills;
  const nowText = Object.keys(sk.now).map(id => ui.data.skills[id].name + ' ' + sk.now[id]).join(', ');
  out.querySelector('#skills').replaceChildren(E('ul', { class: 'b-steps' },
    E('li', {}, E('b', {}, 'Now (' + g.stats.level + ')'), E('span', {}, nowText)),
    sk.steps.map(st => E('li', {}, E('b', {}, st.from === st.to ? 'Lv ' + st.from : 'Lv ' + st.from + ' to ' + st.to), E('span', {}, st.text))),
    sk.spare ? E('li', {}, E('b', {}, 'Spare'), E('span', {}, sk.spare + ' points left over by level ' + NEXT_ADVANCE + '.')) : null));
  out.querySelector('#ap').replaceChildren(table(['Levels', 'Put AP in', 'Why'],
    g.ap.map(a => [a.from === a.to ? String(a.from) : a.from + ' to ' + a.to, a.put, a.why])));
  out.querySelector('#worth').replaceChildren(table(['Gain', 'Damage'], g.worth.map(w => [w.what, '+' + w.pct + '%']), [1]));
  out.querySelector('#gear').replaceChildren(table(['Slot', 'By level'], g.gear.map(s => [s.slot,
    E('span', {}, s.rows.flatMap((r, i) => [i ? E('br') : null, E('b', {}, r.name), ' (' + r.level + (incText(r.inc) ? ', ' + incText(r.inc) : '') + ') ', r.craft ? E('span', { class: 'b-craft' }, 'craft') : null]))])));
  out.querySelector('#scrolls').replaceChildren(table(['Order', 'Item', 'Scroll', 'All slots with Lesser', 'Damage'],
    g.scrolls.map(s => [String(s.order), s.slot, s.family, s.gainAllLesser, '+' + s.pct + '%']), [0, 4]));
  return g;
}

// Puts a build's stats into the calculator (from a saved card).
function fill(raw, clsId) {
  const { skills, ...v } = raw || {};
  ui.form = { cls: CLASSES[clsId] ? clsId : ui.form.cls, v: {}, s: {} };
  ui.read.clear();
  for (const [k, x] of Object.entries(v)) if (x != null) ui.form.v[k] = String(x);
  for (const [k, x] of Object.entries(skills || {})) if (x != null) ui.form.s[k] = String(x);
  saveForm(); buildForm(); renderGuide();
}

/* ---------- Read from game ---------- */

const BASE_KEYS = ['level', 'str', 'dex', 'int', 'luk'], DETAIL_KEYS = ['atkMin', 'atkMax', 'magic', 'acc', 'critRate', 'critDmg'];
const formKeys = cls => fieldsOf(cls).map(([k]) => k);
const inputLabel = k => (Object.values(INPUTS).flat().find(([x]) => x === k) || [k, k])[1];
const jobOf = id => Math.floor(Number(id) / 10000);
const tierOf = job => job > 0 ? (job % 100 === 0 ? 1 : 2) : 0;

// The class a read belongs to: the job line when it names one, else the class whose skills were read.
function classOf(job, skills) {
  if (job && CLASSES[job]) return job;
  const jobs = new Set(Object.keys(skills || {}).map(jobOf));
  const c = Object.values(CLASSES).find(c => c.skillOrder && c.skillOrder.some(([id]) => jobs.has(jobOf(id))));
  return c ? c.id : undefined;
}
// Whether validateStats takes these read values on their own (any class that has the box, at a typical level).
function readOk(keys, vals) {
  const raw = { level: keys.includes('level') ? vals.level : 50 };
  for (const k of keys) raw[k] = vals[k];
  return !validateStats(raw, keys.some(k => /^(atk|crit)/.test(k)) ? 'assassin' : 'cleric').errors.length;
}

// Puts what the screen reader read into the form without clearing anything else. A value validateStats rejects or a
// skill level above its max is skipped. Boxes the form doesn't show are kept for when the class changes. Filled boxes are marked.
function take({ cls, values = {}, skills = {} } = {}) {
  const filled = [], skipped = [];
  if (CLASSES[cls] && cls !== ui.form.cls) ui.form.cls = cls;
  const c = CLASSES[ui.form.cls], shown = formKeys(c), vals = {};
  for (const [k, x] of Object.entries(values)) if (LABEL[k] && !blank(x)) vals[k] = x;
  if ('atkMin' in vals || 'atkMax' in vals) {
    const pair = { atkMin: 'atkMin' in vals ? vals.atkMin : vals.atkMax, atkMax: 'atkMax' in vals ? vals.atkMax : vals.atkMin };
    if (!readOk(['atkMin', 'atkMax'], pair)) for (const k of ['atkMin', 'atkMax']) if (k in vals) { skipped.push(k); delete vals[k]; }
  }
  for (const k of Object.keys(vals)) if (!/^atk/.test(k) && !readOk([k], vals)) { skipped.push(k); delete vals[k]; }
  // A box this class hides is kept too: a 1st job window names no class, so the player often picks it after reading.
  for (const [k, x] of Object.entries(vals)) { ui.form.v[k] = String(x); ui.read.add('v:' + k); if (shown.includes(k)) filled.push(k); }
  for (const [id, x] of Object.entries(skills)) {
    const row = ui.data.skills[id], n = Number(x);
    if (!row || !Number.isInteger(n) || n < 0 || n > row.max) { skipped.push(String(id)); continue; }
    if (c.checked && c.skills.includes(Number(id))) { ui.form.s[id] = String(n); ui.read.add('s:' + id); filled.push(String(id)); }
  }
  clearTimeout(ui.timer);
  saveForm(); buildForm(); renderGuide();
  return { filled, skipped };
}

// reader.js and the skill icons load the first time someone opens Read from game.
let readerLoading = null;
function loadReader() {
  if (readerLoading) return readerLoading;
  const script = window.Reader ? Promise.resolve() : new Promise((resolve, reject) => {
    document.head.append(E('script', { src: 'reader.js', onload: resolve, onerror: () => reject(new Error('reader.js')) }));
  });
  const json = fetch('data/skill-icons.json').then(r => { if (!r.ok) throw new Error('skill-icons.json'); return r.json(); });
  const png = new Promise((resolve, reject) => { const im = new Image(); im.onload = () => resolve(im); im.onerror = () => reject(new Error('skill-icons.png')); im.src = 'data/skill-icons.png'; });
  readerLoading = Promise.all([script, json, png]).then(([, j, im]) => window.Reader.setIcons(j, im));
  readerLoading.catch(() => { readerLoading = null; });
  return readerLoading;
}

const CHECK = [['stat', 'Stats'], ['detail', 'Detail'], ['t1', '1st job skills'], ['t2', '2nd job skills']];
// A reading session (one share, or pastes until the next share). Keys are 'luk' or 's4100000'.
// got: read and filled; bad: the last read of a key, when the form turned it down (key to value); asked: keys on the
// "please type" line; typed: asked keys the player then typed in; tiers: the job and row count each skill tab showed last.
const newSession = () => ({ got: new Set(), bad: new Map(), asked: new Set(), typed: new Set(), stat: false, detail: false, tiers: {}, last: null, status: '' });
let rd = newSession();
const formValue = k => /^s\d+$/.test(k) ? ui.form.s[k.slice(1)] : ui.form.v[k];
// read, or typed in by the player after the panel asked for it (and not left empty)
const have = k => rd.got.has(k) || (rd.typed.has(k) && !blank(formValue(k)));
function typedIn(inputKey) {
  const k = inputKey.startsWith('s:') ? 's' + inputKey.slice(2) : inputKey.slice(2);
  if (rd.asked.has(k)) { rd.typed.add(k); renderReader(); }
}

// Whether the form has a box for a key ('luk', or 's4100000' for a skill), so the player could type it.
function inForm(k) {
  const c = CLASSES[ui.form.cls];
  return /^s\d+$/.test(k) ? !!c.checked && c.skills.includes(Number(k.slice(1))) : formKeys(c).includes(k);
}
// Where each checklist item stands: 'done', 'part' (some read) or '' (nothing yet), with a count for skill tabs.
// A skill tab only needs the skills the form has a box for (a Cleric's form has none for the 1st job tab), and a
// character under level 30 has no 2nd job tab yet, so that item is skipped.
function checklist() {
  const need = keys => keys.filter(inForm);
  const of = (seen, keys) => !seen ? '' : keys.every(have) ? 'done' : 'part';
  const out = { stat: { state: of(rd.stat, need(BASE_KEYS)) }, detail: { state: of(rd.detail, need(DETAIL_KEYS)) } };
  const lv = Number(ui.form.v.level), firstJob = have('level') && lv >= 1 && lv < ADVANCE;
  for (const t of [1, 2]) {
    if (t === 2 && firstJob) { out.t2 = { state: 'done', skip: true }; continue; }
    const tab = rd.tiers[t];
    if (!tab) { out['t' + t] = { state: '' }; continue; }
    // every skill of the tab's job (to tell a cut off tab), and the ones the form asks for
    const all = Object.keys(ui.data.skills).filter(id => jobOf(id) === tab.job && ui.data.skills[id].name);
    const ids = all.filter(id => inForm('s' + id)), missing = ids.filter(id => !have('s' + id));
    out['t' + t] = { state: missing.length ? 'part' : 'done', have: ids.length - missing.length, of: ids.length, missing, cut: tab.rows < all.length };
  }
  return out;
}
const allDone = () => Object.values(checklist()).every(x => x.state === 'done');

function renderReader() {
  const box = ui.root.querySelector('#r-check');
  if (!box) return;
  const ck = checklist(), lines = [], ask = [], scroll = [];
  box.replaceChildren(...CHECK.map(([k, name]) => E('li', ck[k].state ? { class: ck[k].state } : {},
    name + (ck[k].skip ? ' (none until level ' + ADVANCE + ')' : ck[k].state === 'part' && ck[k].of ? ' (' + ck[k].have + ' of ' + ck[k].of + ')' : ''))));
  const skill = id => ui.data.skills[id] ? ui.data.skills[id].name : id;
  // only boxes the form has are asked for: anything else can't be typed
  if (rd.stat) for (const k of BASE_KEYS) if (inForm(k) && !have(k)) ask.push(k);
  if (rd.detail) for (const k of DETAIL_KEYS) if (inForm(k) && !have(k)) ask.push(k);
  for (const k of rd.bad.keys()) if (inForm(k) && !have(k)) ask.push(k);
  for (const t of ['t1', 't2']) if (ck[t].missing) (ck[t].cut ? scroll : ask).push(...ck[t].missing.map(id => 's' + id));
  rd.asked = new Set([...rd.asked, ...ask]);
  const name = k => /^s\d+$/.test(k) ? skill(k.slice(1)) : inputLabel(k), last = rd.last;
  if (ask.length) lines.push("Couldn't read, please type: " + [...new Set(ask.map(name))].join(', '));
  if (scroll.length) lines.push('Scroll down to show ' + [...new Set(scroll.map(name))].join(', '));
  if (rd.stat && !rd.detail) lines.push('Open DETAIL too, for attack and accuracy');
  // a share can't be pasted again, so a share is told to fix the game's size instead
  if (last && last.error === 'scale') lines.push(last.from === 'share' ? "Your game window looks an unusual size, so it can't be read. Try the game at its normal size." : 'Please paste a plain unscaled screenshot');
  else if (last && last.error && last.from === 'paste') lines.push("Couldn't find a stat or skill window in that picture.");
  else if (last && last.unreadTab) lines.push("Couldn't read that skill tab. Move the mouse off it and try again.");
  ui.root.querySelector('#r-msg').replaceChildren(...lines.map(t => E('p', {}, t)));
  ui.root.querySelector('#r-status').textContent = rd.status;
}

// One picture or shared frame: read it, put what's new into the form, and tick the checklist.
function onImage(img, { from }) {
  const r = window.Reader.readAll(img), share = from === 'share';
  // While sharing, the same frame comes in twice a second: leave out what was read, typed, or turned down at this value,
  // so the form is only rebuilt when something new turns up.
  const fresh = (k, x) => !share || !(have(k) || rd.typed.has(k) || rd.bad.get(k) === String(x));
  const values = {}, skills = {};
  for (const [k, x] of Object.entries(r.values)) if (k !== 'job' && fresh(k, x)) values[k] = x;
  for (const [id, x] of Object.entries(r.skills)) if (fresh('s' + id, x)) skills[id] = x;
  const cls = classOf(r.values.job, r.skills);
  let skipped = [];
  if (Object.keys(values).length || Object.keys(skills).length || (CLASSES[cls] && cls !== ui.form.cls)) skipped = take({ cls, values, skills }).skipped;
  // a turned down read takes the key off got, so the panel asks for it again
  const keep = (k, key, x) => { if (skipped.includes(k)) { rd.bad.set(key, String(x)); rd.got.delete(key); } else { rd.got.add(key); rd.bad.delete(key); } };
  for (const [k, x] of Object.entries(values)) keep(k, k, x);
  for (const [id, x] of Object.entries(skills)) keep(id, 's' + id, x);
  if (Object.keys(r.values).length || r.missing.length) rd.stat = true;
  if (r.detail) rd.detail = true;
  const ids = Object.keys(r.skills);
  for (const job of new Set(ids.map(jobOf))) {
    const t = tierOf(job);
    if (t) rd.tiers[t] = { job, rows: ids.filter(id => jobOf(id) === job).length + r.unknownRows };
  }
  rd.last = { from, error: r.error, unreadTab: !ids.length && r.unknownRows > 0 };
  const done = allDone();
  if (done && !share) rd.status = 'All read. Check the marked boxes, then save.';
  renderReader();
  return { done };
}

function openReader() {
  const panel = ui.root.querySelector('#b-reader'), btn = panel.querySelector('#b-readbtn'), note = panel.querySelector('#b-readnote');
  btn.disabled = true; note.textContent = 'Loading the reader...';
  loadReader().then(() => {
    btn.hidden = true; note.textContent = "Open your Character Stat window with DETAIL, then your Skill window, and click through your 1st and 2nd job tabs. Every box it fills is marked so you can check it. Reading happens on your computer. The reader never sends your game pictures anywhere.";
    const area = E('div', { class: 'r-area' });
    panel.append(area, E('ul', { id: 'r-check' }), E('p', { id: 'r-status' }), E('div', { id: 'r-msg' }));
    ui.capture = window.Reader.capture(area, { el: E, onImage,
      say: t => { rd.status = t; renderReader(); },
      onState: (state, why) => {
        if (state === 'sharing') { rd = newSession(); rd.status = 'Watching your game window. It stops by itself once everything is read.'; }
        else rd.status = { done: 'All read. Check the marked boxes, then save.', time: 'Stopped sharing after 2 minutes. Press Share the game window to try again.',
          stop: 'Stopped sharing.', ended: 'Stopped sharing.', hidden: 'Stopped sharing because you left the Builds tab.' }[why] || '';
        renderReader();
      } });
    renderReader();
  }, () => { btn.disabled = false; note.textContent = "The reader didn't load. Try again."; });
}

/* ---------- Saving and browsing ---------- */

// Shrinks a screenshot to at most 1000 px wide and under 1 MB before it's uploaded.
async function shrinkImage(file) {
  if (!file || !/^image\//.test(file.type)) throw new Error("That file isn't a picture.");
  let img;
  try { img = await createImageBitmap(file); } catch { throw new Error("That file isn't a picture."); }
  const scale = Math.min(1, 1000 / img.width), c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.width * scale)); c.height = Math.max(1, Math.round(img.height * scale));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  for (const q of [0.85, 0.6]) {
    let blob = await new Promise(r => c.toBlob(r, 'image/webp', q));
    if (!blob || blob.type !== 'image/webp') blob = await new Promise(r => c.toBlob(r, 'image/jpeg', q));
    if (blob && blob.size <= 1048576) return blob;
  }
  throw new Error('That picture is too big, try a smaller screenshot.');
}

const me = () => ui.deps.session && ui.deps.session();
// What a card shows in one line, from whatever stats the player typed.
function statLine(b) {
  const s = b.stats || {}, bits = [];
  for (const k of ['str', 'dex', 'int', 'luk']) if (s[k] != null) bits.push(STAT_NAME[k] + ' ' + s[k]);
  if (s.atkMin != null && s.atkMax != null) bits.push('Attack ' + s.atkMin + ' to ' + s.atkMax);
  if (s.magic != null) bits.push('Magic ' + s.magic);
  if (s.acc != null) bits.push('Accuracy ' + s.acc);
  return bits.join(', ');
}
// The typed numbers only: blank boxes are left out rather than saved as guesses.
function typedStats() {
  const stats = { skills: {} };
  for (const [k, x] of Object.entries(ui.form.v)) if (!blank(x) && isFinite(Number(x))) stats[k] = Number(x);
  for (const [k, x] of Object.entries(ui.form.s)) if (!blank(x) && isFinite(Number(x))) stats.skills[k] = Number(x);
  return stats;
}

function renderSave() {
  const box = ui.root.querySelector('#b-save'), s = me(), ed = ui.editing;
  if (!s) {
    box.replaceChildren(E('h3', {}, 'Save this build'),
      E('p', {}, 'Sign in with Discord to save this build. Saved builds show the character name you type, never your Discord name.'),
      E('button', { type: 'button', onclick: () => ui.deps.signIn && ui.deps.signIn() }, 'Sign in with Discord'));
    return;
  }
  const field = (id, label, value, max, cls) => E('label', cls ? { class: cls } : {}, label, E('input', { id, maxlength: String(max), value: value || '', autocomplete: 'off' }));
  box.replaceChildren(E('h3', {}, ed ? 'Edit ' + ed.ign : 'Save this build'),
    E('p', { class: 'small' }, 'Saves the stats in the calculator above. Anyone can see saved builds.'),
    E('div', { class: 'b-row' },
      field('b-ign', 'Character name', ed ? ed.ign : ui.lastIgn, 12),
      field('b-trains', 'Where you train', ed ? ed.trains_at : '', 80, 'grow')),
    E('div', { class: 'b-row' },
      field('b-note', 'Note (gear, scrolls, anything)', ed ? ed.note : '', 280, 'grow'),
      E('label', {}, ed && ed.shot_path ? 'Replace equip screenshot' : 'Equip screenshot (optional)', E('input', { id: 'b-shot', type: 'file', accept: 'image/*' }))),
    E('div', { class: 'b-row' },
      E('button', { id: 'b-savebtn', type: 'button', onclick: save }, ed ? 'Save changes' : 'Save this build'),
      ed ? E('button', { type: 'button', onclick: () => { ui.editing = null; renderSave(); } }, 'Cancel') : null),
    E('p', { id: 'b-savemsg' }));
}

async function save() {
  const say = t => { ui.root.querySelector('#b-savemsg').textContent = t; };
  const btn = ui.root.querySelector('#b-savebtn'), val = id => ui.root.querySelector(id).value.trim();
  const ign = val('#b-ign');
  if (!ign) return say('Type your character name first.');
  const v = validateStats(rawStats(), ui.form.cls);
  if (v.errors.length) return say(v.errors.join(' '));
  const ed = ui.editing, file = ui.root.querySelector('#b-shot').files[0];
  btn.disabled = true; say('Saving...');
  let shot = ed ? ed.shot_path || null : null, note = '';
  try {
    if (file) {
      try { shot = await ui.deps.api.uploadShot(await shrinkImage(file)); }
      catch (e) { note = 'Saved without the picture: ' + e.message; }
    }
    const row = { ign, class: ui.form.cls, level: v.stats.level, stats: typedStats(), trains_at: val('#b-trains'), note: val('#b-note'), shot_path: shot };
    if (ed) row.id = ed.id;
    await ui.deps.api.saveBuild(row);
    // A replaced picture is no longer used by anything.
    if (ed && ed.shot_path && shot !== ed.shot_path) ui.deps.api.removeShot(ed.shot_path).catch(() => {});
    ui.lastIgn = ign; ui.editing = null;
    renderSave(); say(note || 'Saved.');
    loadList();
  } catch (e) {
    if (shot && (!ed || shot !== ed.shot_path)) ui.deps.api.removeShot(shot).catch(() => {});
    say("Couldn't save: " + e.message);
  } finally { btn.disabled = false; }
}

function renderFilters() {
  const f = ui.filter, on = () => { clearTimeout(ui.listTimer); ui.listTimer = setTimeout(loadList, 250); };
  const num = (id, label, key) => E('label', {}, label, E('input', { id, inputmode: 'numeric', value: f[key], oninput: e => { f[key] = e.target.value.trim(); on(); } }));
  return E('div', { class: 'b-row' },
    E('label', {}, 'Class', E('select', { id: 'b-filter-class', onchange: e => { f.cls = e.target.value; loadList(); } },
      E('option', { value: '' }, 'All classes'), Object.values(CLASSES).map(c => E('option', { value: c.id }, c.name)))),
    num('b-filter-min', 'Level from', 'minLv'), num('b-filter-max', 'Level to', 'maxLv'),
    E('label', {}, 'Sort', E('select', { id: 'b-filter-sort', onchange: e => { f.sort = e.target.value; loadList(); } },
      E('option', { value: 'level' }, 'Highest level'), E('option', { value: 'new' }, 'Newest'))));
}

function card(b) {
  const s = me(), mine = s && b.user_id === s.user_id, admin = ui.deps.admin && ui.deps.admin();
  const cls = CLASSES[b.class];
  return E('article', { class: 'b-card' },
    E('h4', {}, b.ign),
    E('p', { class: 'b-nums' }, 'Lv ' + b.level + ' ' + (cls ? cls.name : b.class) + (b.hidden ? ', hidden' : '')),
    E('p', {}, statLine(b)),
    b.trains_at ? E('p', {}, 'Trains at ', E('b', {}, b.trains_at)) : null,
    b.note ? E('p', { class: 'muted' }, b.note) : null,
    b.shot_path ? E('img', { src: ui.deps.api.shotUrl(b.shot_path), alt: b.ign + "'s equipment", loading: 'lazy' }) : null,
    E('div', { class: 'b-actions' },
      E('button', { type: 'button', onclick: () => {
        if (ui.editing && ui.editing.id !== b.id) { ui.editing = null; renderSave(); }
        fill(b.stats, b.class); ui.root.scrollIntoView({ behavior: 'smooth' });
      } }, 'Load into calculator'),
      mine ? E('button', { type: 'button', onclick: () => { ui.editing = b; fill(b.stats, b.class); renderSave(); ui.root.querySelector('#b-save').scrollIntoView({ behavior: 'smooth' }); } }, 'Edit') : null,
      mine ? E('button', { type: 'button', onclick: () => remove(b) }, 'Delete') : null,
      admin && !mine ? E('button', { type: 'button', onclick: () => ui.deps.api.hideBuild(b.id).then(loadList, e => alert(e.message)) }, 'Hide') : null));
}

async function remove(b) {
  if (!confirm('Delete ' + b.ign + '? This also deletes its screenshot.')) return;
  try {
    await ui.deps.api.deleteBuild(b.id);
    if (b.shot_path) await ui.deps.api.removeShot(b.shot_path).catch(() => {});
    if (ui.editing && ui.editing.id === b.id) { ui.editing = null; renderSave(); }
    loadList();
  } catch (e) { alert("Couldn't delete: " + e.message); }
}

async function loadList() {
  const list = ui.root.querySelector('#b-list'), gen = ++ui.listGen, f = ui.filter;
  const lv = x => { const n = parseInt(x, 10); return n >= 1 && n <= 200 ? n : undefined; };
  try {
    const rows = await ui.deps.api.listBuilds({ cls: f.cls || undefined, minLv: lv(f.minLv), maxLv: lv(f.maxLv), sort: f.sort });
    if (gen !== ui.listGen) return;
    list.replaceChildren(...(rows.length ? rows.map(card) : [E('p', { class: 'empty' }, 'No builds yet for these filters.')]));
  } catch (e) {
    if (gen === ui.listGen) list.replaceChildren(E('p', { class: 'empty' }, "Couldn't load builds: " + e.message));
  }
}

// Called on every auth event, including token refreshes and coming back to the tab, so it leaves
// a half typed save form alone unless the signed in player or their admin flag really changed.
function refresh() {
  if (!ui.root) return;
  const s = me(), who = (s ? s.user_id : '') + '|' + !!(ui.deps.admin && ui.deps.admin());
  if (who === ui.who) return;
  ui.who = who;
  renderSave(); loadList();
}

function mount(root, deps) {
  ui.root = root; ui.deps = deps; ui.data = deps.data; DATA = deps.data;
  ui.editing = null; ui.lastIgn = ''; ui.listGen = 0; ui.who = null; ui.filter = { cls: '', minLv: '', maxLv: '', sort: 'level' };
  loadForm();
  const sec = (title, id, extra) => [E('h3', {}, title), extra || null, E('div', { id })];
  root.replaceChildren(
    E('section', { class: 'b-calc' },
      E('h2', {}, 'Your build'),
      E('p', { class: 'lead' }, 'Type in your stat window and get a leveling guide for your character: where to train, where your points go, and what to wear and scroll.'),
      E('div', { id: 'b-reader', class: 'b-reader' },
        E('button', { id: 'b-readbtn', type: 'button', onclick: openReader }, 'Read from game'),
        E('p', { id: 'b-readnote', class: 'small' }, 'Or let the page read your stat and skill windows, from a shared game window or a screenshot.')),
      E('div', { class: 'b-form' }),
      E('p', { id: 'b-msg' })),
    E('section', { id: 'b-guide', hidden: '' },
      sec('Where to train', 'train', E('p', { class: 'small', id: 'b-attack' })),
      E('p', { class: 'small' }, 'Ranked by EXP per cast at your level, over a few thousand simulated kills with your damage range, crits, monster defense and hit chance. Walking time is not counted.'),
      sec('Skill points', 'skills'), sec('Ability points', 'ap'), sec('What each stat is worth', 'worth'), sec('Gear', 'gear'), sec('Scrolls', 'scrolls'),
      E('p', { class: 'small' }, 'Gear and scrolls come from the game files. They have no drop tables, so check in game where the items drop.')),
    E('section', { id: 'b-save', class: 'b-panel' }),
    E('section', { id: 'b-browse' }, E('h2', {}, 'Builds'),
      E('p', { class: 'lead' }, "Other players' characters, their stats and where they train. Load one into the calculator to see its guide."),
      renderFilters(), E('div', { id: 'b-list' })));
  buildForm();
  renderGuide();
  refresh();
}

window.Builds = { CLASSES, mastery, physRange, spellRange, weaponAttackFromMax, levelScale, hitChance, defend, elemMult, makeRng, castsToKill,
  validateStats, rankMobs, buildGuide, mount, fill, refresh, shrinkImage, take, classOf };
})();
