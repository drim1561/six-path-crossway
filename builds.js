// Builds tab: Classic damage formulas, the mob ranking and the personal guide, plus the tab's UI.
// Formulas are meowdb's Classic ones (meowdb.com/msclassic/formulas/damage), and a class only gets a
// calculator once they reproduce a real stat window from a player of that class (see tests/builds-logic.test.js).
(function () {
'use strict';

/* ---------- Classes ---------- */

// jobMask is the client's reqJob bit: 1 warrior, 2 mage, 4 bowman, 8 thief.
const CLASSES = {
  cleric: { id: 'cleric', name: 'Cleric', family: 'spell', jobMask: 2, job2: 230,
    mainStat: 'int', reqStat: 'luk', weaponSlot: 'Wand', weapons: ['Wand', 'Staff'], attack: 2301004, attack1: 2001003, element: 'H',
    fields: ['level', 'str', 'dex', 'int', 'luk', 'magic', 'acc'],
    skills: [2301004, 2301001, 2301002, 2301003, 2300000, 2301000],
    // Holy Arrow is usually maxed by now; MP Eater stays at 1 (monsters near this level have too little MP).
    skillOrder: [[2301004, 30], [2301001, 30], [2301002, 20], [2301003, 20], [2301000, 20]] },
  assassin: { id: 'assassin', name: 'Assassin', family: 'claw', jobMask: 8, job2: 410,
    mainStat: 'luk', reqStat: 'dex', weaponSlot: 'Claw', weapons: ['Claw'], attack: 4001003, attack1: 4001003, mastery: 4100000,
    fields: ['level', 'str', 'dex', 'int', 'luk', 'atk', 'acc', 'crit'],
    skills: [4001003, 4100000, 4100001, 4100002, 4101000, 4101001, 4101002],
    // Claw Booster's speed is the same at level 1, so its points come last.
    skillOrder: [[4100000, 20], [4100001, 30], [4100002, 3], [4101001, 20], [4101002, 30], [4101000, 20]] },
  // Warriors: Power Strike stays the attack in 2nd job. Mastery, booster and final attack follow the weapon type.
  fighter: { id: 'fighter', name: 'Fighter', family: 'phys', jobMask: 1, job2: 110, mainStat: 'str', reqStat: 'dex',
    weapons: ['Two-handed Sword', 'One-Handed Sword', 'Two-handed Axe', 'One-Handed Axe'], attack: 1001001, attack1: 1001001,
    mastery: { 'One-Handed Sword': 1100000, 'Two-handed Sword': 1100000, 'One-Handed Axe': 1100001, 'Two-handed Axe': 1100001 },
    byType: { sword: [1100000, 1101002, 1101000], axe: [1100001, 1101003, 1101001] }, typeOf: slot => /Axe/.test(slot) ? 'axe' : 'sword',
    skillOrder: [['M', 20], ['B', 20], ['F', 30], [1101004, 30], [1101005, 20]] },
  page: { id: 'page', name: 'Page', family: 'phys', jobMask: 1, job2: 120, mainStat: 'str', reqStat: 'dex',
    weapons: ['Two-handed Blunt Weapon', 'One-Handed Sword', 'Two-handed Sword', 'One-Handed Blunt Weapon'], attack: 1001001, attack1: 1001001,
    mastery: { 'One-Handed Sword': 1200000, 'Two-handed Sword': 1200000, 'One-Handed Blunt Weapon': 1200001, 'Two-handed Blunt Weapon': 1200001 },
    byType: { sword: [1200000, 1201002, 1201000], blunt: [1200001, 1201003, 1201001] }, typeOf: slot => /Blunt/.test(slot) ? 'blunt' : 'sword',
    skillOrder: [['M', 20], ['B', 20], ['F', 30], [1201004, 20], [1201005, 20]] },
  spearman: { id: 'spearman', name: 'Spearman', family: 'phys', jobMask: 1, job2: 130, mainStat: 'str', reqStat: 'dex',
    weapons: ['Polearm', 'Spear'], attack: 1001001, attack1: 1001001, mastery: { Spear: 1300000, Polearm: 1300001 },
    byType: { spear: [1300000, 1301002, 1301000], polearm: [1300001, 1301003, 1301001] }, typeOf: slot => slot === 'Spear' ? 'spear' : 'polearm',
    skillOrder: [['M', 20], ['B', 20], ['F', 30], [1301004, 20], [1301005, 20]] },
  fpwizard: { id: 'fpwizard', name: 'Fire/Poison Wizard', family: 'spell', jobMask: 2, job2: 210, mainStat: 'int', reqStat: 'luk',
    weapons: ['Wand', 'Staff'], weaponSlot: 'Wand', attack: 2101003, attack1: 2001003, element: 'F',
    skillOrder: [[2101003, 30], [2101001, 20], [2100000, 1], [2101000, 20], [2101004, 30], [2101002, 20]] },
  ilwizard: { id: 'ilwizard', name: 'Ice/Lightning Wizard', family: 'spell', jobMask: 2, job2: 220, mainStat: 'int', reqStat: 'luk',
    weapons: ['Wand', 'Staff'], weaponSlot: 'Wand', attack: 2201003, attack1: 2001003, element: 'I',
    skillOrder: [[2201003, 30], [2201004, 30], [2201001, 20], [2201000, 20], [2200000, 1], [2201002, 20]] },
  hunter: { id: 'hunter', name: 'Hunter', family: 'phys', jobMask: 4, job2: 310, mainStat: 'dex', reqStat: 'str',
    weapons: ['Bow'], attack: 3001002, attack1: 3001002, mastery: { Bow: 3100000 },
    skillOrder: [[3100000, 20], [3101001, 20], [3101003, 20], [3100001, 30], [3101000, 30], [3101004, 30]] },
  crossbowman: { id: 'crossbowman', name: 'Crossbowman', family: 'phys', jobMask: 4, job2: 320, mainStat: 'dex', reqStat: 'str',
    weapons: ['Crossbow'], attack: 3001002, attack1: 3001002, mastery: { Crossbow: 3200000 },
    skillOrder: [[3200000, 20], [3201001, 20], [3201003, 20], [3200001, 30], [3201000, 30], [3201004, 30]] },
  bandit: { id: 'bandit', name: 'Bandit', family: 'phys', jobMask: 8, job2: 420, mainStat: 'luk', reqStat: 'dex', secBoth: true,
    weapons: ['Dagger'], attack: 4201003, attack1: 4001002, mastery: { Dagger: 4200000 },
    skillOrder: [[4200000, 20], [4201000, 20], [4201003, 30], [4201001, 20], [4200001, 20], [4201002, 1]] },
};
// The four 1st jobs: when they start, who advances them, the 2nd job paths, and the 1st job skill order (my call;
// a thief's depends on where they're heading). Targets cap at each skill's max.
const BRANCHES = {
  warrior: { id: 'warrior', name: 'Warrior', job1: 100, advance: 10, npc: 'Dances with Balrog in Perion', paths: ['fighter', 'page', 'spearman'],
    skillOrder: [[1001001, 1], [1001002, 1], [1001001, 20], [1000002, 15], [1000000, 3], [1000001, 15], [1001002, 20], [1001000, 20]] },
  magician: { id: 'magician', name: 'Magician', job1: 200, advance: 8, npc: 'Grendel the Really Old in Ellinia', paths: ['fpwizard', 'ilwizard', 'cleric'],
    skillOrder: [[2001002, 1], [2001003, 20], [2001000, 20], [2000000, 15], [2000001, 10], [2001001, 20]] },
  bowman: { id: 'bowman', name: 'Bowman', job1: 300, advance: 10, npc: 'Athena Pierce in Henesys', paths: ['hunter', 'crossbowman'],
    skillOrder: [[3001001, 1], [3001002, 20], [3000001, 20], [3000000, 20], [3001000, 20], [3001001, 20]] },
  thief: { id: 'thief', name: 'Thief', job1: 400, advance: 10, npc: 'the Dark Lord in Kerning City', paths: ['assassin', 'bandit'],
    skillOrder: [[4001003, 20], [4000000, 20], [4000001, 8], [4001001, 1]],
    byPath: { bandit: [[4001002, 20], [4000000, 20], [4001001, 1], [4000001, 8]] } },
};
for (const c of Object.values(CLASSES)) if (!c.fields) c.fields = c.family === 'spell' ? CLASSES.cleric.fields : ['level', 'str', 'dex', 'int', 'luk', 'weapon', 'atk', 'acc', 'crit'];
const branchOf = clsId => { const b = Object.values(BRANCHES).find(b => b.paths.includes(clsId)); return b ? b.id : undefined; };
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
// Classic weapon multipliers on the main stat (meowdb's Classic damage formulas page). Skills swing, stab or shoot;
// the stat window shows MAX with the largest one and MIN with the smallest melee one (or shoot for ranged weapons).
const WEAPONS = {
  'One-Handed Sword': { swing: 1.8, stab: 1.8, mixed: 1.8 }, 'Two-handed Sword': { swing: 2.5, stab: 2.5, mixed: 2.5 },
  'One-Handed Axe': { swing: 2.4, stab: 1.2, mixed: 1.8 }, 'One-Handed Blunt Weapon': { swing: 2.4, stab: 1.2, mixed: 1.8 },
  'Two-handed Axe': { swing: 3.0, stab: 2.0, mixed: 2.5 }, 'Two-handed Blunt Weapon': { swing: 3.0, stab: 2.0, mixed: 2.5 },
  Spear: { swing: 1.5, stab: 3.5, mixed: 2.5 }, Polearm: { swing: 3.5, stab: 1.5, mixed: 2.5 }, Dagger: { swing: 1.0, stab: 2.0, mixed: 1.5 },
  Bow: { swing: 1.0, stab: 1.0, shoot: 2.5, mixed: 1.0 }, Crossbow: { swing: 1.0, stab: 1.0, shoot: 2.5, mixed: 1.0 },
  Claw: { swing: 1.0, stab: 1.0, shoot: 2.5, mixed: 1.0 },
};
// Weapon types whose multiplier a real stat window has matched (Claw: 808s and JPark; sword and polearm: Ohmohnah).
const CHECKED_WEAPONS = new Set(['Claw', 'One-Handed Sword', 'Polearm']);
const windowMults = slot => { const w = WEAPONS[slot]; return w.shoot ? [w.shoot, w.shoot] : [Math.min(w.swing, w.stab), Math.max(w.swing, w.stab)]; };
// The stat window's ATTACK range for a weapon type: S 1, floored like the game shows it.
function windowRange({ W, P, sec, slot, M, ap = 0 }) {
  const [lo, hi] = windowMults(slot);
  return [Math.floor(physRange({ S: 1, W, P, sec, mult: lo, M, ap })[0]), Math.floor(physRange({ S: 1, W, P, sec, mult: hi, M, ap })[1])];
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

const LABEL = { level: 'level', str: 'STR', dex: 'DEX', int: 'INT', luk: 'LUK', magic: 'Magic', acc: 'accuracy', wat: 'weapon attack',
  atkMin: 'attack', atkMax: 'attack', critRate: 'crit rate', critDmg: 'crit damage' };
const LIMIT = { str: 999, dex: 999, int: 999, luk: 999, magic: 9999, acc: 999, wat: 999, atkMin: 99999, atkMax: 99999, critRate: 100, critDmg: 500 };
const blank = v => v === undefined || v === null || String(v).trim() === '';
// A skill's numbers at level n, or undefined at level 0 (no points, no bonus).
const level = (row, n) => row && n >= 1 ? row.lv[Math.min(n, row.lv.length) - 1] : undefined;
const num = v => Number(v) || 0;
let DATA = null; // set by rankMobs/buildGuide, used for gear based defaults
function bestWeapon(slot, lv, key) {
  if (!DATA) return 0;
  return DATA.gear.filter(g => g.slot === slot && g.level <= lv).reduce((m, g) => Math.max(m, g.inc[key] || 0), 0);
}
// The weapons a class can hold at a level, best attack first per type, in the order of cls.weapons.
function weaponsFor(clsId, lv) {
  const cls = CLASSES[clsId];
  if (!cls || !DATA) return [];
  return DATA.gear.filter(g => cls.weapons.includes(g.slot) && fits(g, cls) && g.level <= lv)
    .sort((a, b) => cls.weapons.indexOf(a.slot) - cls.weapons.indexOf(b.slot) || (b.inc.wat || 0) - (a.inc.wat || 0) || a.level - b.level);
}
// The weapon a physical build holds: the picked one when the class can use it, else the best of its first type.
const weaponOf = (cls, lv, id) => { const all = weaponsFor(cls.id, Math.max(lv, 10)); return all.find(g => g.id === Number(id)) || all[0] || null; };

// Under the 2nd job advancement a character plays its branch's 1st job; from 30 its class.
const ADV1 = clsId => BRANCHES[branchOf(clsId)].advance;
function phaseOf(cls, lv) {
  const br = BRANCHES[branchOf(cls.id)];
  if (lv < ADVANCE) return { phase: 1, job: br.job1, until: ADVANCE, attack: cls.attack1,
    order: (br.byPath && br.byPath[cls.id]) || br.skillOrder, branch: br };
  return { phase: 2, job: cls.job2, until: NEXT_ADVANCE, attack: cls.attack, order: cls.skillOrder, branch: br };
}
// A physical class's skill order names its mastery, booster and final attack as 'M', 'B', 'F': the ids for its weapon type.
function orderFor(cls, P, slot) {
  if (!cls.byType) return P.order;
  const t = cls.byType[cls.typeOf(slot)];
  return P.order.map(([id, n]) => [id === 'M' ? t[0] : id === 'B' ? t[1] : id === 'F' ? t[2] : id, n]);
}
// The skill boxes the form shows: the 1st job's skills under 30, the class's own (plus its attack) from 30.
function skillsFor(cls, lv) {
  if (!DATA) return cls.skills || [];
  const P = phaseOf(cls, lv);
  if (P.phase === 2 && cls.skills) return cls.skills;
  const ids = Object.keys(DATA.skills).map(Number).filter(id => DATA.skills[id].job === P.job && DATA.skills[id].name);
  return P.attack && !ids.includes(P.attack) ? [P.attack].concat(ids) : ids;
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
  const sk = raw.skills || {}, P = cls && phaseOf(cls, lv);
  if (cls) for (const id of skillsFor(cls, lv)) {
    const max = DATA && DATA.skills[id] ? DATA.skills[id].max : 30;
    // A blank attack skill: as high as the points spent in this job allow (3 a level), up to its max.
    const typical = Math.max(1, Math.min(max, 1 + 3 * (lv - (P.phase === 1 ? ADV1(cls.id) : ADVANCE))));
    if (blank(sk[id])) { stats.skills[id] = id === P.attack ? (cls.skills && P.phase === 2 ? max : typical) : 0; if (id === P.attack) assumed.push('skills'); }
    else stats.skills[id] = Math.max(0, Math.min(max, Math.floor(Number(sk[id]) || 0)));
    if (id === P.attack && stats.skills[id] < 1) errors.push('Put at least 1 point in ' + (DATA && DATA.skills[id] ? DATA.skills[id].name : 'your attack skill') + ' for a guide.');
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
  if (cls && cls.family === 'phys') {
    const w = weaponOf(cls, lv, raw.weapon);
    stats.weapon = w ? w.id : null;
    take('wat', () => w ? w.inc.wat || 0 : 0);
    const shape = physShape(stats, cls, w ? w.slot : cls.weapons[0]);
    const r = windowRange({ W: stats.wat, ...shape });
    take('atkMin', () => r[0]);
    take('atkMax', () => r[1]);
    if (assumed.includes('atkMin') !== assumed.includes('atkMax')) errors.push('Type both ends of the attack range.');
    take('acc', () => Math.floor(0.8 * stats.dex + 0.5 * stats.luk) + lv);
    const c = critSkill(stats, cls);
    take('critRate', () => 5 + num(c.crtX));
    take('critDmg', () => 120 + num(c.crdX));
    if (!errors.length && stats.atkMax < stats.atkMin) errors.push('The attack range looks backwards.');
  }
  return { stats, assumed, errors };
}
// Main stat, secondary, mastery and attack power for a physical class holding a weapon type.
function physShape(s, cls, slot) {
  const ms = cls.mastery && cls.mastery[slot], row = level(DATA && DATA.skills[ms], s.skills[ms]) || {};
  return { slot, P: s[cls.mainStat], sec: cls.secBoth ? s.str + s.dex : s[cls.reqStat], M: mastery(num(row.mastery)), ap: num(row.x) };
}
// The crit skill a physical class has: Precise Strikes (warriors), Critical Shot (bowmen).
function critSkill(s, cls) {
  const id = { 1: 1000002, 4: 3000000 }[cls.jobMask];
  return (id && level(DATA && DATA.skills[id], s.skills[id])) || {};
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
  const P = phaseOf(cls, s.level);
  if (cls.family === 'phys') {
    const g = DATA.gear.find(x => x.id === s.weapon), slot = g ? g.slot : cls.weapons[0], sh = physShape(s, cls, slot);
    // A typed attack range gives the weapon attack back (as the claw does); otherwise the attack box is used.
    const W = Wover !== undefined ? Wover : weaponAttackFromMax(s.atkMax, { P: sh.P, sec: sh.sec, mult: windowMults(slot)[1], ap: sh.ap });
    const a = sk(P.attack), w = WEAPONS[slot], mult = w.shoot || w.mixed;
    return { range: physRange({ S: num(a.damage) / 100, W, P: sh.P, sec: sh.sec, mult, M: sh.M, ap: sh.ap }),
      hits: Math.max(1, num(a.attackCount)) * Math.max(1, num(a.bulletCount)),
      crit: { rate: s.critRate / 100, dmg: s.critDmg / 100 - 1 }, def: 'pdd', element: null, W, slot };
  }
  const ha = sk(P.attack), el = P.phase === 2 ? cls.element : null;
  return { range: spellRange({ S: (ha.mad || 0) / 100, magic: s.magic, int: s.int, M: mastery(num(ha.mastery)) }), hits: num(ha.attackCount) || 1,
    crit: { rate: 0, dmg: 0 }, def: 'mdd', element: el };
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
  if (!cls) return [];
  const v = validateStats(raw, clsId);
  return v.errors.length ? [] : rankWith(v.stats, cls, data);
}

/* ---------- Guide ---------- */

const STAT_NAME = { str: 'STR', dex: 'DEX', int: 'INT', luk: 'LUK', wat: 'weapon attack', mad: 'magic attack', crt: 'crit rate', acc: 'accuracy' };
const ARMOR = ['Hat', 'Top', 'Bottom', 'Overall', 'Shoes', 'Gloves', 'Cape', 'Earrings'];
const fits = (g, cls) => g.job === 0 || (g.job & cls.jobMask) !== 0;
const physical = cls => cls.family === 'claw' || cls.family === 'phys';
// The weapon type a guide plans around: the one held, else the class's first.
const slotOf = (s, cls) => { const g = cls.family === 'phys' && DATA.gear.find(x => x.id === s.weapon); return g ? g.slot : cls.weaponSlot || cls.weapons[0]; };

// Expected damage of one cast with a few stats changed (d), for "what is +1 of this worth".
function avgCast(s, cls, d) {
  d = d || {};
  if (physical(cls)) {
    const base = attackModel(s, cls), s2 = { ...s, critRate: s.critRate + (d.crt || 0) };
    for (const k of ['str', 'dex', 'int', 'luk']) s2[k] = s[k] + (d[k] || 0);
    const am = attackModel(s2, cls, base.W + (d.wat || 0));
    return am.hits * (am.range[0] + am.range[1]) / 2 * (1 + am.crit.rate * am.crit.dmg);
  }
  const s2 = { ...s, int: s.int + (d.int || 0), magic: s.magic + (d.mad || 0) + (d.int || 0) / 2 };
  const am = attackModel(s2, cls);
  return am.hits * (am.range[0] + am.range[1]) / 2;
}
const gainPct = (s, cls, d) => Math.round((avgCast(s, cls, d) / avgCast(s, cls) - 1) * 10000) / 100;

// 3 SP a level until the next job advancement, spent down the phase's skill order (prerequisites first).
function planSkills(s, cls) {
  const P = phaseOf(cls, s.level), order = orderFor(cls, P, slotOf(s, cls));
  const ids = skillsFor(cls, s.level).filter(id => DATA.skills[id] && DATA.skills[id].job === P.job);
  const now = {}, plan = {};
  for (const id of ids) now[id] = plan[id] = s.skills[id] || 0;
  let left = Math.max(0, 3 * (P.until - s.level)), used = 0;
  const steps = [];
  const atLevel = i => s.level + 1 + Math.floor(i / 3);
  function raise(id, target) {
    const row = DATA.skills[id];
    for (const [rid, rlv] of Object.entries(row.req || {})) if (plan[rid] !== undefined) raise(Number(rid), rlv);
    const add = Math.min(Math.max(0, target - plan[id]), left);
    if (!add) return;
    steps.push({ from: atLevel(used), to: atLevel(used + add - 1), id, target: plan[id] + add, text: row.name + ' to ' + (plan[id] + add) + ' (' + add + (add === 1 ? ' point)' : ' points)') });
    plan[id] += add; left -= add; used += add;
  }
  for (const [id, target] of order) if (plan[id] !== undefined) raise(id, Math.min(target, DATA.skills[id].max));
  return { now, plan, steps, spare: left, until: P.until };
}

// The weapon tiers ahead of a level in one weapon type: the lowest second stat each level needs.
function weaponTiers(s, cls, slot, until) {
  const tiers = {};
  for (const g of DATA.gear) if (g.slot === slot && fits(g, cls) && g.level > s.level && g.level <= until) {
    const t = tiers[g.level];
    if (!t || g.req[cls.reqStat] < t.need) tiers[g.level] = { need: g.req[cls.reqStat], name: g.name.replace(/^\S+ /, ''), full: g };
  }
  return tiers;
}
// 5 AP a level into the main stat, except what the next weapon needs in its second stat, put in just before that level.
function planAP(s, cls) {
  // AP doesn't change at a job advancement, so the plan runs to 70 in either job.
  const until = NEXT_ADVANCE, tiers = weaponTiers(s, cls, slotOf(s, cls), until);
  const per = {};
  for (let lv = s.level + 1; lv < until; lv++) per[lv] = { req: 0, why: '' };
  let have = s[cls.reqStat];
  for (const T of Object.keys(tiers).map(Number).sort((a, b) => a - b)) {
    let need = tiers[T].need - have;
    if (need <= 0) continue;
    have += need;
    for (let lv = T - 1; lv > s.level && need > 0; lv--) {
      const take = Math.min(5 - per[lv].req, need);
      if (take <= 0) continue;
      per[lv].req += take; need -= take; per[lv].why = 'So you can wear a ' + tiers[T].name + ' at ' + T + ' (it needs ' + tiers[T].need + ' ' + STAT_NAME[cls.reqStat] + ').';
      per[lv].wear = { name: tiers[T].name, level: T, need: tiers[T].need };
    }
  }
  const rows = [];
  for (let lv = s.level + 1; lv < until; lv++) {
    const p = per[lv], main = 5 - p.req;
    const put = p.req ? p.req + ' ' + STAT_NAME[cls.reqStat] + (main ? ', ' + main + ' ' + STAT_NAME[cls.mainStat] : '') : '5 ' + STAT_NAME[cls.mainStat];
    const why = p.why || 'Your main stat, it adds the most damage.';
    const last = rows[rows.length - 1];
    if (last && last.put === put && last.why === why && last.to === lv - 1) last.to = lv;
    else rows.push({ from: lv, to: lv, put, why, ...(p.wear ? { wear: p.wear } : {}) });
  }
  return rows;
}

// The best item per level tier in each slot, scored by what it adds to this class's damage.
function planGear(s, cls) {
  const atk = physical(cls) ? 'wat' : 'mad', until = phaseOf(cls, s.level).until;
  const score = g => (g.inc[atk] || 0) * 6 + (g.inc[cls.mainStat] || 0) + (g.inc.crt || 0) * 1.5 + (g.inc[cls.reqStat] || 0) * 0.3;
  const out = [];
  for (const slot of [slotOf(s, cls)].concat(ARMOR)) {
    const best = {};
    for (const g of DATA.gear) {
      if (g.slot !== slot || !fits(g, cls) || g.level < s.level - 12 || g.level > until || !(score(g) > 0)) continue;
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
  const atk = physical(cls) ? 'wat' : 'mad';
  const useful = physical(cls) ? [atk, cls.mainStat, 'crt'] : [atk, cls.mainStat];
  const out = [];
  for (const f of DATA.scrolls) {
    if (!useful.includes(f.stat)) continue;
    const slot = gear.find(x => x.slot === f.slot);
    if (!slot) continue;
    const slots = slot.rows[0].slots || 5, gain = f.gains[0] * slots;
    out.push({ slot: f.slot, family: f.family, gainAllLesser: slots + ' slots, +' + gain + ' ' + STAT_NAME[f.stat], pct: gainPct(s, cls, { [f.stat]: gain }) });
  }
  return out.sort((a, b) => b.pct - a.pct).slice(0, 5).map((x, i) => ({ order: i + 1, ...x }));
}

// What's ahead: the next weapon worth buying, the job advancement, and the next skill in the plan.
function planNext(s, cls, P, skills, W) {
  const out = [], slot = slotOf(s, cls), key = physical(cls) ? 'wat' : 'mad';
  const up = DATA.gear.filter(g => g.slot === slot && fits(g, cls) && g.level > s.level && g.level <= P.until && (g.inc[key] || 0) > (W || 0))
    .sort((a, b) => a.level - b.level || (b.inc[key] || 0) - (a.inc[key] || 0))[0];
  if (up) {
    const needs = ['str', 'dex', 'int', 'luk'].filter(k => up.req[k]).map(k => up.req[k] + ' ' + STAT_NAME[k]).join(' and ');
    out.push({ kind: 'gear', level: up.level, name: up.name, gain: Math.round((up.inc[key] || 0) - (W || 0)), stat: STAT_NAME[key], needs,
      text: up.name + ' (' + (up.inc[key] || 0) + ' ' + STAT_NAME[key] + ')' + (needs ? ', it needs ' + needs : '') + '.' });
  }
  if (P.phase === 1) out.push({ kind: 'job', level: ADVANCE, text: '2nd job advancement: talk to ' + P.branch.npc + ' and become a ' + cls.name + '.' });
  const step = skills.steps[0];
  if (step) out.push({ kind: 'skill', level: step.from, text: 'Start ' + step.text + '.' });
  return out.sort((a, b) => a.level - b.level);
}

function buildGuide(raw, clsId, data) {
  DATA = data;
  const cls = CLASSES[clsId];
  if (!cls) return { ok: false, errors: ['Pick your class.'] };
  const lv = Number(raw && raw.level), br = BRANCHES[branchOf(clsId)];
  if (Number.isInteger(lv) && lv >= 1 && lv < br.advance) return { ok: false, beginner: true, advance: br.advance, npc: br.npc };
  const v = validateStats(raw, clsId);
  if (v.errors.length) return { ok: false, errors: v.errors };
  const s = v.stats, P = phaseOf(cls, s.level), am = attackModel(s, cls), sum = am.range[0] + am.range[1];
  const worth = physical(cls)
    ? [[cls.family === 'claw' ? '+1 weapon attack (claw, gloves or stars)' : '+1 weapon attack (weapon or gloves)', { wat: 1 }], ['+1% crit rate', { crt: 1 }],
      ...(cls.family === 'claw' ? [['+1 LUK', { luk: 1 }], ['+1 DEX or STR', { str: 1 }]]
        : [['+1 ' + STAT_NAME[cls.mainStat], { [cls.mainStat]: 1 }], ['+1 ' + STAT_NAME[cls.reqStat], { [cls.reqStat]: 1 }]])]
    : [['+1 magic attack', { mad: 1 }], ['+1 INT', { int: 1 }]];
  const gear = planGear(s, cls), skills = planSkills(s, cls), slot = slotOf(s, cls);
  const held = cls.family === 'phys' && DATA.gear.find(x => x.id === s.weapon);
  const weapon = physical(cls) ? { id: held ? held.id : null, slot, name: held ? held.name : null, wat: held ? held.inc.wat || 0 : null, W: am.W } : null;
  return { ok: true, phase: P.phase, estimated: cls.family === 'phys' && !CHECKED_WEAPONS.has(slot), weapon, assumed: v.assumed, stats: s,
    attack: { min: Math.round(am.range[0]), max: Math.round(am.range[1]), avg: Math.round(sum / 2 * am.hits) },
    train: rankWith(s, cls, data).slice(0, 10), skills, ap: planAP(s, cls), gear, next: planNext(s, cls, P, skills, physical(cls) ? am.W : bestWeapon(slot, s.level, 'mad')),
    scrolls: planScrolls(s, cls, gear), worth: worth.map(([what, d]) => ({ what, pct: gainPct(s, cls, d) })) };
}

// The ability points, skill points and upgrades ahead as one list by level, split at the next milestone (the next level a
// weapon needs the second stat, the next weapon, or the job advancement), and at least 5 levels ahead.
function pointsPlan(g) {
  const lv = g.stats.level, order = { up: 0, job: 1, ap: 2, sp: 3 };
  const events = [
    ...g.ap.map(a => ({ kind: 'ap', from: a.from, to: a.to, text: a.put, note: a.wear ? 'so you can wear a ' + a.wear.name + ' at ' + a.wear.level + ' (needs ' + a.wear.need + ')' : 'your main stat' })),
    ...g.skills.steps.map(st => ({ kind: 'sp', from: st.from, to: st.to, text: st.text })),
    ...g.next.filter(n => n.kind !== 'skill').map(n => ({ kind: n.kind === 'gear' ? 'up' : 'job', from: n.level, to: n.level, text: n.kind === 'gear' ? 'Equip ' + n.name : n.text })),
  ].sort((a, b) => a.from - b.from || order[a.kind] - order[b.kind]);
  const marks = [...g.ap.filter(a => a.wear).map(a => a.wear.level), ...g.next.filter(n => n.kind !== 'skill').map(n => n.level)].filter(x => x > lv);
  const horizon = Math.max(lv + 5, marks.length ? Math.min(...marks) : 0);
  return { horizon, until: events.length ? Math.max(...events.map(e => e.to)) : lv,
    shown: events.filter(e => e.from <= horizon), rest: events.filter(e => e.from > horizon) };
}

/* ---------- UI ---------- */

const INPUTS = { level: [['level', 'Level']], str: [['str', 'STR']], dex: [['dex', 'DEX']], int: [['int', 'INT']], luk: [['luk', 'LUK']],
  magic: [['magic', 'Magic']], acc: [['acc', 'Accuracy']], atk: [['atkMin', 'Attack low'], ['atkMax', 'Attack high']],
  crit: [['critRate', 'Crit rate %'], ['critDmg', 'Crit damage %']], weapon: [['weapon', 'Weapon'], ['wat', 'Weapon attack']] };
const ASSUMED_LABEL = { ...LABEL, atkMin: 'attack range', atkMax: 'attack range', skills: 'attack skill level' };
// read: boxes the screen reader filled ('v:luk', 's:4100000'), marked until the player edits them
const ui = { deps: null, data: null, root: null, form: { cls: 'cleric', v: {}, s: {} }, timer: 0, read: new Set() };
const E = (...a) => ui.deps.el(...a);
const fieldsOf = cls => cls.fields.flatMap(f => INPUTS[f]);
const formLevel = () => Number(ui.form.v.level) || ADVANCE;
// The weapon the form shows: the picked one when this class can hold it, else the best for the level.
const formWeapon = cls => weaponOf(cls, formLevel(), ui.form.v.weapon);
const fmt = n => Math.round(n).toLocaleString('en-US');

function loadForm() {
  try {
    const f = JSON.parse(ui.deps.store.get('bt.calc'));
    if (f && CLASSES[f.cls]) ui.form = { cls: f.cls, v: f.v || {}, s: f.s || {} };
  } catch { /* nothing saved yet */ }
}
const saveForm = () => ui.deps.store.set('bt.calc', JSON.stringify(ui.form));
const rawStats = () => ({ ...ui.form.v, skills: { ...ui.form.s } });

// The drawer's boxes (everything but the level, which sits on the character card) and the card's name and level.
function buildForm() {
  const cls = CLASSES[ui.form.cls], box = ui.root.querySelector('.b-form');
  const input = (id, label, value, on, key) => E('label', {}, label, E('input', { id, inputmode: 'numeric', autocomplete: 'off', value: value == null ? '' : String(value),
    ...(ui.read.has(key) ? { class: 'b-read' } : {}), oninput: e => { ui.read.delete(key); e.target.classList.remove('b-read'); on(e); typedIn(key); } }));
  const kids = [];
  ui.root.querySelector('#b-name').textContent = cls.name;
  ui.root.querySelector('#b-avatar').textContent = cls.name[0];
  const lvBox = ui.root.querySelector('#b-f-level'), lv = ui.form.v.level == null ? '' : String(ui.form.v.level);
  if (lvBox.value !== lv) lvBox.value = lv;
  lvBox.classList.toggle('b-read', ui.read.has('v:level'));
  for (const [k, label] of fieldsOf(cls)) {
    if (k === 'level') continue;
    if (k === 'weapon') {
      const w = formWeapon(cls);
      kids.push(E('label', { class: 'wide' }, label, E('select', { id: 'b-f-weapon', onchange: e => {
        const g = ui.data.gear.find(x => x.id === Number(e.target.value));
        ui.form.v.weapon = e.target.value; ui.form.v.wat = g ? String(g.inc.wat || 0) : '';
        const wat = ui.root.querySelector('#b-f-wat'); if (wat) wat.value = ui.form.v.wat;
        changed();
      } }, weaponsFor(cls.id, Math.max(formLevel(), 10)).map(g => {
        const o = E('option', { value: String(g.id) }, g.name + ' (' + g.slot + ', ' + (g.inc.wat || 0) + ' attack, level ' + g.level + ')');
        if (w && g.id === w.id) o.selected = true; return o;
      }))));
    } else if (k === 'wat') {
      const w = formWeapon(cls), shown = blank(ui.form.v.wat) ? (w ? w.inc.wat || 0 : '') : ui.form.v.wat;
      kids.push(input('b-f-wat', label, shown, e => { ui.form.v.wat = e.target.value; changed(); }, 'v:wat'));
    } else kids.push(input('b-f-' + k, label, ui.form.v[k], e => { ui.form.v[k] = e.target.value; changed(); }, 'v:' + k));
  }
  ui.formPhase = phaseOf(cls, formLevel()).phase;
  const ids = skillsFor(cls, formLevel()).filter(id => ui.data.skills[id]);
  if (ids.length) kids.push(E('p', { class: 'b-sub' }, ui.formPhase === 1 ? BRANCHES[branchOf(cls.id)].name + ' skill levels' : 'Skill levels'));
  for (const id of ids) kids.push(input('b-s-' + id, ui.data.skills[id].name, ui.form.s[id], e => { ui.form.s[id] = e.target.value; changed(); }, 's:' + id));
  box.replaceChildren(...kids);
  // every way the class changes (tiles, the select, a loaded card, Read from game) redraws the form, so the tiles follow here
  renderTiles();
}
// A level that crosses 30 swaps the skill boxes (1st job or 2nd job) and the weapon list, so the drawer is redrawn.
// The level box itself is on the card and is never redrawn, so the cursor stays put.
function levelChanged() {
  const cls = CLASSES[ui.form.cls];
  if (phaseOf(cls, formLevel()).phase !== ui.formPhase || cls.family === 'phys') buildForm();
  changed();
}
function typeLevel(e) {
  ui.read.delete('v:level'); e.target.classList.remove('b-read');
  ui.form.v.level = e.target.value; levelChanged(); typedIn('v:level');
}
// The minus and plus buttons next to the level.
function stepLevel(d) {
  const n = Math.min(200, Math.max(1, (parseInt(ui.form.v.level, 10) || ADVANCE) + d)), box = ui.root.querySelector('#b-f-level');
  ui.form.v.level = box.value = String(n);
  ui.read.delete('v:level'); box.classList.remove('b-read');
  levelChanged(); typedIn('v:level');
}
// The drawer of stat and skill boxes, and the save and community panels: open or shut, remembered on this device.
function setOpen(id, open, key) {
  const box = ui.root.querySelector('#' + id), btn = ui.root.querySelector('[aria-controls="' + id + '"]');
  box.hidden = !open;
  if (btn) btn.setAttribute('aria-expanded', String(open));
  if (key) ui.deps.store.set(key, open ? '1' : '');
}
const toggle = (id, key) => setOpen(id, ui.root.querySelector('#' + id).hidden, key);
// Switching class keeps the numbers but drops a weapon the new class can't hold.
function pickClass(id) {
  if (!CLASSES[id]) return;
  ui.form.cls = id;
  const w = ui.form.v.weapon && ui.data.gear.find(x => x.id === Number(ui.form.v.weapon));
  if (w && !(CLASSES[id].weapons || []).includes(w.slot)) { delete ui.form.v.weapon; delete ui.form.v.wat; }
  saveForm(); buildForm(); renderGuide();
}
// The four 1st job tiles and, under them, the picked tile's 2nd job paths.
function renderTiles() {
  const br = branchOf(ui.form.cls), lv = formLevel();
  ui.root.querySelector('#b-tiles').replaceChildren(...Object.values(BRANCHES).map(b => E('button', { type: 'button', class: 'b-tile', 'data-branch': b.id,
    'aria-pressed': String(b.id === br), onclick: () => pickClass(b.paths.includes(ui.form.cls) ? ui.form.cls : b.paths[0]) }, b.name)));
  ui.root.querySelector('#b-paths').replaceChildren(E('span', { class: 'b-paths-label' }, lv < ADVANCE ? "Where you're heading" : 'Your 2nd job'),
    ...BRANCHES[br].paths.map(id => E('button', { type: 'button', 'data-path': id, 'aria-pressed': String(id === ui.form.cls), onclick: () => pickClass(id) }, CLASSES[id].name)));
}
// The signed in player's own builds, one tap to open each; signed out, a nudge to sign in.
async function renderMine() {
  const box = ui.root.querySelector('#b-mine'), s = me(), gen = ui.mineGen = (ui.mineGen || 0) + 1;
  if (!s) {
    box.replaceChildren(E('p', { class: 'small' }, 'Sign in with Discord to keep your characters here. ',
      E('button', { type: 'button', class: 'linkish', onclick: () => ui.deps.signIn && ui.deps.signIn() }, 'Sign in')));
    return;
  }
  try {
    const rows = await ui.deps.api.listBuilds({ userId: s.user_id, sort: 'new' });
    if (gen !== ui.mineGen) return;
    const mine = rows.filter(b => b.user_id === s.user_id);
    box.replaceChildren(E('h3', {}, 'My builds'), mine.length
      ? E('div', { class: 'b-mine-list' }, mine.map(b => E('button', { type: 'button', class: 'b-mine-card', onclick: () => fill(b.stats, b.class) },
        E('b', {}, b.ign), ' Lv ' + b.level + ' ' + (CLASSES[b.class] ? CLASSES[b.class].name : b.class))))
      : E('p', { class: 'small' }, 'Builds you save show up here.'));
  } catch (e) { if (gen === ui.mineGen) box.replaceChildren(E('p', { class: 'small' }, "Couldn't load your builds: " + e.message)); }
}
function changed() { saveForm(); clearTimeout(ui.timer); ui.timer = setTimeout(renderGuide, 150); }

const incText = inc => Object.entries(inc).filter(([k]) => STAT_NAME[k]).map(([k, v]) => STAT_NAME[k] + ' +' + v).join(', ');
const range = (a, b) => a === b ? String(a) : a + ' to ' + b;
const bar = pct => E('div', { class: 'b-bar' }, E('i', { style: 'width:' + Math.max(2, Math.min(100, pct)) + '%' }));
// A row that waits behind "show more": hidden until the panel's button opens it.
const extra = (node, i, keep) => { if (i >= keep) { node.classList.add('b-extra'); node.hidden = true; } return node; };
// The panel's "show more" button, or nothing when every row already shows.
function moreButton(box, label) {
  if (!box.querySelector('.b-extra')) return;
  box.append(E('button', { type: 'button', class: 'b-more', onclick: e => {
    const rows = [...box.querySelectorAll('.b-extra')], show = rows.some(x => x.hidden);
    rows.forEach(x => { x.hidden = !show; });
    e.target.textContent = show ? 'Show less' : label;
  } }, label));
}
const castsText = m => m.casts.toFixed(1) === '1.0' ? '1 cast a kill' : m.casts.toFixed(1) + ' casts a kill';
const tile = (k, label, v, s) => E('div', { class: 'b-nowt', 'data-k': k }, E('div', { class: 'k' }, label), E('div', { class: 'v' }, v), E('div', { class: 's' }, s || ''));

// The card's big numbers: the two stats this class cares about, magic or weapon attack, the attack per hit, and what a point is worth.
function renderBig(g, cls) {
  const guess = k => g.assumed.includes(k);
  const big = (k, v, sub, guessed) => E('div', { class: 'b-bigone' }, E('div', { class: 'k' }, k), E('div', { class: 'v' + (guessed ? ' guess' : '') }, v),
    guessed || sub ? E('div', { class: 's' }, guessed ? 'guessed' : sub) : null);
  const atk = ui.data.skills[g.phase === 1 ? cls.attack1 : cls.attack].name;
  const worth = g.worth.find(w => w.what === '+1 ' + STAT_NAME[cls.mainStat]) || g.worth[0];
  ui.root.querySelector('#b-big').replaceChildren(
    big(STAT_NAME[cls.mainStat], fmt(g.stats[cls.mainStat]), '', guess(cls.mainStat)),
    big(STAT_NAME[cls.reqStat], fmt(g.stats[cls.reqStat]), '', guess(cls.reqStat)),
    physical(cls) ? big('Weapon attack', fmt(g.weapon.W), '', ['wat', 'weapon', 'atkMin', 'atkMax'].some(guess)) : big('Magic', fmt(g.stats.magic), '', guess('magic')),
    big(atk, fmt(g.attack.min) + ' to ' + fmt(g.attack.max), 'per hit'),
    worth ? big(worth.what, '+' + worth.pct + '%', 'damage') : null);
}

// The four "right now" answers: where to train, the next ability and skill points, and the next upgrade.
function renderNow(g, cls) {
  const m = g.train[0];
  const a = g.ap[0], wear = g.ap.find(r => r.wear);
  const apSub = !a ? 'each level' : a.wear ? 'for a ' + a.wear.name + ' at ' + a.wear.level : wear ? wear.put.split(',')[0] + ' at ' + wear.from + ', for a ' + wear.wear.name : 'your main stat';
  const st = g.skills.steps[0], sk = g.skills;
  const up = g.next.find(n => n.kind === 'gear') || g.next.find(n => n.kind === 'job');
  const upSub = !up ? '' : up.kind === 'job' ? up.text : [up.gain > 0 ? '+' + up.gain + ' ' + up.stat : '', up.needs ? 'needs ' + up.needs : ''].filter(Boolean).join(', ');
  ui.root.querySelector('#b-now').replaceChildren(
    tile('train', 'Train', m ? m.name : 'No map yet', m ? m.map + ', ' + castsText(m) : ''),
    tile('ap', 'Next AP', a ? a.put : '5 ' + STAT_NAME[cls.mainStat], apSub),
    st ? tile('sp', 'Next SP', ui.data.skills[st.id].name, 'from ' + st.from + ', up to ' + st.target)
      : tile('sp', 'Next SP', sk.spare ? sk.spare + ' spare' : 'All planned', sk.spare ? 'points left by level ' + sk.until : ''),
    tile('up', 'Next upgrade', !up ? 'Nothing soon' : up.kind === 'job' ? '2nd job at ' + up.level : up.name + ' at ' + up.level, upSub));
}

function renderPanels(g) {
  const lv = g.stats.level, top = g.train.length ? g.train[0].expPerCast : 1;
  const train = ui.root.querySelector('#train');
  train.replaceChildren(...g.train.map((m, i) => extra(E('div', { class: 'b-mob' },
    E('div', {}, E('div', {}, E('b', { class: 'b-name' }, m.name), ' ', E('span', { class: 'small' }, 'lv ' + m.level)),
      E('div', { class: 'small' }, m.map + ', ' + castsText(m) + ', ' + m.hit + '% hit, ' + fmt(m.hp) + ' HP'),
      bar(m.expPerCast / top * 100)),
    E('div', { class: 'num' }, m.expPerCast.toFixed(0) + ' EXP a cast')), i, 3)),
    E('p', { class: 'small b-foot' }, 'Ranked by EXP per cast at your level, over a few thousand simulated kills with your damage range, crits, monster defense and hit chance. Walking time is not counted.'));
  moreButton(train, 'Show all ' + g.train.length + ' maps');
  train.append(train.querySelector('.b-foot'));

  const pts = pointsPlan(g), chip = { ap: 'AP', sp: 'SP', up: 'upgrade', job: 'job' };
  const row = e => E('li', { class: 'b-ev', 'data-from': String(e.from) }, E('span', { class: 'num' }, range(e.from, e.to)),
    E('span', {}, E('b', {}, e.text), e.note ? E('span', { class: 'small' }, ' ' + e.note) : null, ' ', E('span', { class: 'b-chip ' + e.kind }, chip[e.kind])));
  const now = Object.keys(g.skills.now).map(id => ui.data.skills[id].name + ' ' + g.skills.now[id]).join(', ');
  const points = ui.root.querySelector('#points');
  points.replaceChildren(E('ul', { class: 'b-time' }, pts.shown.map(row), pts.rest.map(e => extra(row(e), 1, 0))),
    E('p', { class: 'small b-foot' }, 'Skills now: ' + now + '.' + (g.skills.spare ? ' ' + g.skills.spare + ' SP left over by level ' + g.skills.until + '.' : '')));
  moreButton(points, 'Show the plan to ' + pts.until);
  points.append(points.querySelector('.b-foot'));

  const gear = ui.root.querySelector('#gear');
  gear.replaceChildren(E('div', { class: 'b-gear' }, g.gear.map(s => {
    const cur = s.rows.filter(r => r.level <= lv).pop(), nxt = s.rows.find(r => r.level > lv);
    const item = r => [E('b', {}, r.name), ' (' + r.level + (incText(r.inc) ? ', ' + incText(r.inc) : '') + ') ', r.craft ? E('span', { class: 'b-craft' }, 'craft') : null];
    return E('div', { class: 'b-gcard' }, E('div', { class: 'k' }, s.slot),
      E('div', { class: 'b-item' }, cur ? item(cur) : E('span', { class: 'small' }, 'Nothing for your level yet')),
      nxt ? E('div', { class: 'small' }, 'Next: ', E('b', {}, nxt.name), ' at ' + nxt.level) : null,
      extra(E('ul', { class: 'b-ladder' }, s.rows.map(r => E('li', {}, item(r)))), 1, 0));
  })), E('p', { class: 'small b-foot' }, 'Gear and scrolls come from the game files. They have no drop tables, so check in game where the items drop.'));
  moreButton(gear, 'Show every item by level');
  gear.append(gear.querySelector('.b-foot'));

  const scrolls = ui.root.querySelector('#scrolls'), best = g.scrolls.length ? g.scrolls[0].pct : 1;
  scrolls.replaceChildren(...g.scrolls.map((s, i) => extra(E('div', { class: 'b-mob' },
    E('div', {}, E('b', {}, s.family), E('div', { class: 'small' }, s.slot + ': ' + s.gainAllLesser + ' with Lessers'), bar(s.pct / best * 100)),
    E('div', { class: 'num' }, '+' + s.pct + '%')), i, 3)),
    E('p', { class: 'small b-foot' }, 'What a point is worth: ' + g.worth.map(w => w.what + ' adds ' + w.pct + '% damage').join(', ') + '.'));
  moreButton(scrolls, 'Show more');
  scrolls.append(scrolls.querySelector('.b-foot'));
}

const TABS = [['train', 'Train'], ['points', 'Points'], ['gear', 'Gear'], ['scrolls', 'Scrolls']];
function showTab(t) {
  if (!TABS.some(([id]) => id === t)) t = 'train';
  for (const [id] of TABS) {
    ui.root.querySelector('#' + id).hidden = id !== t;
    ui.root.querySelector('[data-tab="' + id + '"]').setAttribute('aria-selected', String(id === t));
  }
  ui.deps.store.set('bt.btab', t);
}

function renderGuide() {
  const cls = CLASSES[ui.form.cls], msg = ui.root.querySelector('#b-msg'), out = ui.root.querySelector('#b-guide');
  const g = buildGuide(rawStats(), ui.form.cls, ui.data);
  msg.className = '';
  if (!g.ok) {
    out.hidden = true;
    ui.root.querySelector('#b-big').replaceChildren();
    for (const id of ['b-now', 'train', 'points', 'gear', 'scrolls']) ui.root.querySelector('#' + id).replaceChildren();
    if (g.beginner) { msg.className = 'note'; msg.textContent = 'Your 1st job starts at level ' + g.advance + '. Talk to ' + g.npc + ' then come back for a guide.'; }
    else { msg.className = 'error'; msg.textContent = g.errors.join(' '); }
    return g;
  }
  out.hidden = false;
  const guessed = [...new Set(g.assumed.map(k => ASSUMED_LABEL[k]))];
  if (guessed.length) {
    msg.className = 'note';
    msg.replaceChildren('Guessed from your level: ' + guessed.join(', ') + '. ',
      E('button', { type: 'button', class: 'linkish', onclick: () => setOpen('b-drawer', true, 'bt.bedit') }, 'Add them'), ' for a sharper guide.');
  } else msg.replaceChildren();
  out.querySelector('#b-estimated').hidden = !g.estimated;
  renderBig(g, cls); renderNow(g, cls); renderPanels(g);
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
    if (skillsFor(c, formLevel()).includes(Number(id))) { ui.form.s[id] = String(n); ui.read.add('s:' + id); filled.push(String(id)); }
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
  return /^s\d+$/.test(k) ? skillsFor(c, formLevel()).includes(Number(k.slice(1))) : formKeys(c).includes(k);
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

// The reader panel opens under the card, with the drawer, so the boxes it fills (marked) and the ones it asks for show.
function openReader() {
  const panel = ui.root.querySelector('#b-reader'), btn = ui.root.querySelector('#b-readbtn'), note = panel.querySelector('#b-readnote');
  panel.hidden = false; setOpen('b-drawer', true);
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
    loadList(); renderMine();
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
      mine ? E('button', { type: 'button', onclick: () => { ui.editing = b; fill(b.stats, b.class); renderSave(); setOpen('b-save', true); ui.root.querySelector('#b-save').scrollIntoView({ behavior: 'smooth' }); } }, 'Edit') : null,
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
  renderSave(); loadList(); renderMine();
}

function mount(root, deps) {
  ui.root = root; ui.deps = deps; ui.data = deps.data; DATA = deps.data;
  ui.editing = null; ui.lastIgn = ''; ui.listGen = 0; ui.who = null; ui.filter = { cls: '', minLv: '', maxLv: '', sort: 'level' };
  loadForm();
  const editOpen = !!ui.deps.store.get('bt.bedit');
  const shut = open => open ? {} : { hidden: '' };
  root.replaceChildren(
    E('section', { class: 'b-calc' },
      E('div', { id: 'b-mine', class: 'b-mine' }),
      E('div', { class: 'b-picker' }, E('div', { id: 'b-tiles', class: 'b-tiles' }), E('div', { id: 'b-paths', class: 'b-paths' })),
      E('div', { id: 'b-hero', class: 'b-hero' },
        E('div', { id: 'b-avatar', class: 'b-avatar', 'aria-hidden': 'true' }),
        E('div', { class: 'b-who' }, E('h2', { id: 'b-name' }),
          E('div', { class: 'b-lv' },
            E('button', { id: 'b-lvdown', type: 'button', class: 'b-step', 'aria-label': 'Level down', onclick: () => stepLevel(-1) }, '−'),
            E('input', { id: 'b-f-level', inputmode: 'numeric', autocomplete: 'off', 'aria-label': 'Level', oninput: typeLevel }),
            E('button', { id: 'b-lvup', type: 'button', class: 'b-step', 'aria-label': 'Level up', onclick: () => stepLevel(1) }, '+'),
            E('span', { class: 'small' }, 'level'))),
        E('div', { class: 'b-act' },
          E('button', { id: 'b-readbtn', type: 'button', class: 'b-primary', onclick: openReader }, 'Read from game'),
          E('button', { id: 'b-edit', type: 'button', class: 'linkish', 'aria-controls': 'b-drawer', 'aria-expanded': String(editOpen), onclick: () => toggle('b-drawer', 'bt.bedit') }, 'Edit stats and skills')),
        E('div', { id: 'b-big', class: 'b-big' }),
        E('p', { id: 'b-msg' })),
      E('div', { id: 'b-reader', class: 'b-reader', hidden: '' },
        E('p', { id: 'b-readnote', class: 'small' }, 'Reads your stat and skill windows, from a shared game window or a screenshot.')),
      E('div', { id: 'b-drawer', class: 'b-drawer', ...shut(editOpen) }, E('div', { class: 'b-form' }))),
    E('section', { id: 'b-guide', hidden: '' },
      estimatedNote(),
      E('div', { id: 'b-now', class: 'b-now' }),
      E('div', { class: 'b-dtabs', role: 'tablist' }, TABS.map(([id, name]) =>
        E('button', { type: 'button', role: 'tab', 'data-tab': id, 'aria-controls': id, onclick: () => showTab(id) }, name))),
      TABS.map(([id]) => E('section', { id, class: 'b-dpanel', role: 'tabpanel' }))),
    E('section', { class: 'b-strip' },
      E('div', {}, E('b', {}, 'Keep this character'), ' ', E('span', { class: 'small' }, "Save it, or see other players' builds.")),
      E('div', { class: 'b-strip-btns' },
        E('button', { id: 'b-savetoggle', type: 'button', 'aria-controls': 'b-save', 'aria-expanded': 'false', onclick: () => toggle('b-save') }, 'Save build'),
        E('button', { id: 'b-browsetoggle', type: 'button', 'aria-controls': 'b-browse', 'aria-expanded': 'false', onclick: () => toggle('b-browse') }, 'Community builds'))),
    E('section', { id: 'b-save', class: 'b-panel', hidden: '' }),
    E('section', { id: 'b-browse', hidden: '' }, E('h2', {}, 'Builds'),
      E('p', { class: 'lead' }, "Other players' characters, their stats and where they train. Load one into the calculator to see its guide."),
      renderFilters(), E('div', { id: 'b-list' })));
  showTab(ui.deps.store.get('bt.btab'));
  buildForm();
  renderGuide();
  refresh();
}
const estimatedNote = () => E('p', { id: 'b-estimated', class: 'b-badge', hidden: '' }, E('b', {}, 'Estimated. '), "Damage for this weapon comes from meowdb's table and hasn't been checked against a real stat window yet.");

window.Builds = { CLASSES, BRANCHES, branchOf, weaponsFor, mastery, physRange, spellRange, weaponAttackFromMax, WEAPONS, CHECKED_WEAPONS, windowRange, levelScale, hitChance, defend, elemMult, makeRng, castsToKill,
  validateStats, rankMobs, buildGuide, pointsPlan, mount, fill, refresh, shrinkImage, take, classOf };
})();
