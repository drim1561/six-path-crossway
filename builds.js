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
// Skill paths: ways to spend SP side by side, from the character's points now (my calls, as data). order1 and order2
// replace the 1st and 2nd job orders; early plays the 1st job as another class (Lucky Seven with a claw for a Bandit),
// and reset says an SP Reset Scroll (Cash Shop, 5051001) moves those points into the class's own 1st job order later.
const PATHS = {
  bandit: [
    { id: 'l7reset', name: 'Lucky Seven now, SP Reset into Bandit', early: 'assassin', order1: BRANCHES.thief.skillOrder, reset: true,
      how: 'Lucky Seven with a claw through 1st job, Savage Blow with a dagger once it overtakes, then an SP Reset Scroll.' },
    { id: 'dstab', name: 'Double Stab all the way', how: 'Double Stab with a dagger now, then Savage Blow.' }],
  cleric: [
    { id: 'heal', name: 'Heal first', order2: [[2301001, 30], [2301004, 30], [2301002, 20], [2301003, 20], [2301000, 20]],
      how: 'Max Heal, then Holy Arrow. Heal hits up to 5 undead at once.' },
    { id: 'arrow', name: 'Holy Arrow first', how: 'Max Holy Arrow, then Heal.' }],
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
  // Far past 20 casts on average damage: no need to simulate it to know.
  if (hp / (hits * hit * mult * (range[0] + range[1]) / 2 * (1 + crit.rate * crit.dmg)) > 25) return null;
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

const LABEL = { apLeft: 'AP left', level: 'level', str: 'STR', dex: 'DEX', int: 'INT', luk: 'LUK', magic: 'Magic', acc: 'accuracy', wat: 'weapon attack',
  atkMin: 'attack', atkMax: 'attack', critRate: 'crit rate', critDmg: 'crit damage' };
const LIMIT = { apLeft: 999, str: 999, dex: 999, int: 999, luk: 999, magic: 9999, acc: 999, wat: 999, atkMin: 99999, atkMax: 99999, critRate: 100, critDmg: 500 };
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
    order: cls.order1 || (br.byPath && br.byPath[cls.id]) || br.skillOrder, branch: br };
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
  // AP left: points from the stat window not spent yet. Blank means all spent, not a guess.
  if (!blank(raw.apLeft)) { const n = Number(raw.apLeft); if (!Number.isInteger(n) || n < 0 || n > LIMIT.apLeft) errors.push("That AP left doesn't look like a number."); else stats.apLeft = n; }
  const main = cls && cls.mainStat, req = cls && cls.reqStat;
  // The second stat meets what the held weapon asks for (a Zard at 40 needs 40 DEX), paid for out of the main stat.
  const held = cls && cls.family === 'phys' && DATA ? weaponOf(cls, lv, raw.weapon) : null;
  const reqGuess = Math.max(25, held ? held.req[req] || 0 : 0);
  for (const k of ['str', 'dex', 'int', 'luk']) take(k, () => k === main ? 4 + 5 * (lv - 1) - (reqGuess - 25) : k === req ? reqGuess : 4);
  const sk = raw.skills || {}, P = cls && phaseOf(cls, lv);
  // No skill typed at all: assume the guide's own skill order was followed (1st job passives included).
  const noneTyped = cls && DATA && skillsFor(cls, lv).every(id => blank(sk[id]));
  if (noneTyped) {
    const w = cls.family === 'phys' ? weaponOf(cls, lv, raw.weapon) : null;
    Object.assign(stats.skills, typicalSkills(cls, lv, w ? w.slot : cls.weaponSlot || cls.weapons[0]));
    assumed.push('skills');
  }
  if (cls && !noneTyped) for (const id of skillsFor(cls, lv)) {
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
    const skillAcc = Object.entries(stats.skills).reduce((t, [id, n]) => t + num((level(DATA && DATA.skills[id], n) || {}).accX), 0);
    take('acc', () => Math.floor(0.8 * stats.dex + 0.5 * stats.luk) + lv + skillAcc);
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

// Damaging skills that hit several monsters a cast (Thunder Bolt, Iron Arrow, Power Knockback, Double Shot). Rush is left
// out: it's a dash that shoves monsters along, nobody trains with it, and at 1 point it sent a level 60 Spearman to Wraiths.
const MULTI = [2201004, 3201004, 3001003, 3001002];
const SKILL_ELEMENT = { 2201004: 'L' };
// Monsters one cast reaches: about one for every 8 the map spawns, up to what the skill can hit. Gathering them costs
// a cast of walking for each one past the first, so a crowd only wins when its monsters are worth the trip.
const CROWD = 8;
const crowdHits = (count, mobCount) => Math.min(mobCount, Math.max(1, Math.floor(count / CROWD)));
const groupGap = k => KILL_GAP + (k - 1);

// Heal (Clerics): hurts undead monsters only. HEAL_SOURCE: meowdb.com/msclassic/formulas/damage, the Heal section, which
// it marks Unconfirmed: pool = ((INT·r + LUK)/1000 + 2.5) · Magic · S · (1 + 0.5(t - 1)) with r from 0.1 to 1.2 and S the
// recovery rate; each undead takes trunc(trunc(pool) / t / 1.5), t = you plus every undead hit (6 slots, you take one).
// Not checked against a real Heal hit yet, so the card says Estimated.
const HEAL = 2301001;
function healRange({ int, luk, magic, x, targets }) {
  const t = 1 + Math.max(1, targets), each = r => Math.trunc(Math.trunc(((int * r + luk) / 1000 + 2.5) * magic * x / 100 * (1 + 0.5 * (t - 1))) / t / 1.5);
  return [each(0.1), each(1.2)];
}

// What one cast does: damage range per hit, hits per cast, crits, which defense and element apply.
// skillId picks the skill cast (the phase's attack when left out).
function attackModel(s, cls, Wover, skillId) {
  const sk = id => level(DATA.skills[id], s.skills[id]) || {};
  if (cls.family === 'claw') {
    const cm = sk(cls.mastery), ap = cm.x || 0, sec = s.str + s.dex;
    const W = Wover !== undefined ? Wover : s.W !== undefined ? s.W : weaponAttackFromMax(s.atkMax, { P: s.luk, sec, mult: 2.5, ap });
    const l7 = sk(cls.attack);
    return { range: physRange({ S: (l7.damage || 0) / 100, W, P: s.luk, sec, mult: 3, M: 0.5, ap }), hits: l7.bulletCount || 2,
      crit: { rate: s.critRate / 100, dmg: s.critDmg / 100 - 1 }, def: 'pdd', element: null, W, skill: cls.attack, targets: 1 };
  }
  const P = phaseOf(cls, s.level), id = skillId || P.attack, targets = Math.max(1, num(sk(id).mobCount));
  if (id === HEAL) {
    const h = sk(HEAL), heal = n => healRange({ int: s.int, luk: s.luk, magic: s.magic, x: num(h.x), targets: n });
    return { range: heal(1), rangeFor: heal, hits: 1, crit: { rate: 0, dmg: 0 }, def: 'mdd', element: null, skill: HEAL,
      targets: Math.max(1, targets - 1), undeadOnly: true, estimated: true };
  }
  if (cls.family === 'phys') {
    const g = DATA.gear.find(x => x.id === s.weapon), slot = g ? g.slot : cls.weapons[0], sh = physShape(s, cls, slot);
    // A typed attack range gives the weapon attack back (as the claw does); otherwise the attack box is used.
    const W = Wover !== undefined ? Wover : s.W !== undefined ? s.W : weaponAttackFromMax(s.atkMax, { P: sh.P, sec: sh.sec, mult: windowMults(slot)[1], ap: sh.ap });
    const a = sk(id), w = WEAPONS[slot], mult = w.shoot || w.mixed;
    return { range: physRange({ S: num(a.damage) / 100, W, P: sh.P, sec: sh.sec, mult, M: sh.M, ap: sh.ap }),
      hits: Math.max(1, num(a.attackCount)) * Math.max(1, num(a.bulletCount)),
      crit: { rate: s.critRate / 100, dmg: s.critDmg / 100 - 1 }, def: 'pdd', element: null, W, slot, skill: id, targets };
  }
  const ha = sk(id), el = SKILL_ELEMENT[id] || (P.phase === 2 ? cls.element : null);
  return { range: spellRange({ S: (ha.mad || 0) / 100, magic: s.magic, int: s.int, M: mastery(num(ha.mastery)) }), hits: num(ha.attackCount) || 1,
    crit: { rate: 0, dmg: 0 }, def: 'mdd', element: el, skill: id, targets };
}
// Time between kills (walking to the next monster, respawns, loot) in casts. Without it, anything one cast kills
// looked as good as a monster three levels of EXP richer, so a level 49 Cleric was sent to Zombie Mushrooms.
const KILL_GAP = 2;
// Each monster is fought with whichever skill the character has points in gives the best pace: the attack, or a
// multi-target skill that kills a group (every monster in reach takes the same casts) for one walk.
function rankWith(s, cls, data, n, seed) {
  const P = phaseOf(cls, s.level), out = [];
  if (seed === undefined) seed = hash(JSON.stringify(s));
  const models = [attackModel(s, cls)].concat(MULTI.filter(id => id !== P.attack && s.skills[id] >= 1 && DATA.skills[id]).map(id => attackModel(s, cls, undefined, id)),
    hasHeal(s, cls) ? [attackModel(s, cls, undefined, HEAL)] : []);
  for (const mob of data.mobs) {
    let best = null;
    // A skill whose pace on average damage is well behind another's isn't worth simulating.
    const fights = models.filter(am => !am.undeadOnly || mob.undead).map(am => {
      const hit = hitChance(s.acc, s.level, mob), mult = defend(1, mob[am.def]) * elemMult(mob, am.element) * levelScale(mob.level, s.level);
      const k = crowdHits(mob.maps[0][1], am.targets), range = am.rangeFor ? am.rangeFor(k) : am.range;
      const avg = am.hits * hit * mult * (range[0] + range[1]) / 2 * (1 + am.crit.rate * am.crit.dmg);
      return { am, hit, mult, k, range, guess: avg > 0 ? k * mob.exp / (Math.max(1, mob.hp / avg) + groupGap(k)) : 0 };
    });
    const top = Math.max(...fights.map(f => f.guess));
    for (const { am, hit, mult, k, range, guess } of fights) {
      if (guess < 0.8 * top) continue;
      const casts = castsToKill({ hp: mob.hp, range, hits: am.hits, crit: am.crit, hit, mult }, makeRng(seed ^ mob.id), n);
      if (casts === null) continue;
      const pace = k * mob.exp / (casts + groupGap(k));
      if (best && best.pace >= pace) continue;
      best = { pace, casts, k, hit, am };
    }
    if (!best) continue;
    const { casts, k, hit, am } = best;
    out.push({ id: mob.id, name: mob.name, level: mob.level, hp: mob.hp, exp: mob.exp, def: mob[am.def], casts: Math.round(casts * 100) / 100,
      expPerCast: Math.round(k * mob.exp / casts * 10) / 10, pace: Math.round(best.pace * 10) / 10, hits: k, skill: am.skill,
      hit: Math.round(hit * 100), map: mob.maps[0][0], mapId: mob.maps[0][2], count: mob.maps[0][1] });
  }
  return out.sort((a, b) => b.pace - a.pace || b.exp - a.exp);
}
// A Cleric in 2nd job with at least a point in Heal.
const hasHeal = (s, cls) => cls.id === 'cleric' && s.level >= ADVANCE && s.skills[HEAL] >= 1 && !!DATA.skills[HEAL];
/* ---------- EXP an hour ---------- */

// EXP to the next level, by level (the classic table: the client keeps it in the program, not the data files). Rimmah's
// Grind frames at 47 read 98,856 EXP as 17.79%, which is 555,680.
const EXP_TABLE = [0, 15, 34, 57, 92, 135, 372, 560, 840, 1242, 1716, 2360, 3216, 4200, 5460, 7050, 8840, 11040, 13716, 16680, 20216,
  24402, 28980, 34320, 40512, 47216, 54900, 63666, 73080, 83720, 95700, 108480, 122760, 138666, 155540, 174216, 194832, 216600, 240550,
  266682, 294216, 324240, 356916, 391160, 428280, 468450, 510420, 555680, 604416, 655200, 709716, 748608, 789631, 832902, 878545, 926689,
  977471, 1031036, 1087536, 1147132, 1209994, 1276301, 1346242, 1420016, 1497832, 1579913, 1666492, 1757815, 1854143, 1955750, 2062925];
// Seconds a pace step takes (one cast, or one cast's worth of walking to the next monster). Rimmah at 47 on Mummydogs at
// the Tomb made about 113K an hour on a friend's tracker (2026-10-31), where the ranking's pace is 19.1 EXP a step.
const STEP_SEC = 0.61;
const expHour = (pace, sec = STEP_SEC) => Math.round(pace * 3600 / sec / 100) * 100;
// Grinding hours from the start of s.level to toLevel at the best spot each level, following the guide's plan.
function hoursTo(s, cls, toLevel, sec = STEP_SEC, ap = planAP(s, cls)) {
  let h = 0;
  for (let lv = s.level; lv < toLevel; lv++) {
    const t = lv === s.level ? s : statsAt(s, cls, lv, ap), top = rankWith(t, cls, DATA, 150)[0];
    if (!top || !EXP_TABLE[lv]) return Infinity;
    h += EXP_TABLE[lv] / expHour(top.pace, sec);
  }
  return h;
}

// Seconds a step takes for this player, from their saved Grind sessions: those of 10 minutes or more within 5 levels of
// the build (sessions don't say which character, and an alt or older, weaker stats would skew it), each scored with the
// build's stats at the best monster the ranking has on that map. The median, or STEP_SEC when none fit.
const TUNE_MIN = 10, TUNE_LEVELS = 5;
function tuneSeconds(s, cls, rows) {
  const rank = rankWith(s, cls, DATA), secs = [];
  for (const r of rows || []) {
    const min = r.exp_min != null ? r.exp_min : r.active_min, lv = r.level_end || r.level_start;
    if (!(min >= TUNE_MIN) || !(r.exp > 0) || !lv || Math.abs(lv - s.level) > TUNE_LEVELS) continue;
    const here = new Set(DATA.mobs.filter(m => m.maps.some(x => x[2] === Number(r.map_id))).map(m => m.id));
    const best = rank.filter(x => here.has(x.id)).reduce((b, x) => Math.max(b, x.pace), 0);
    if (best > 0) secs.push(best * 60 / (r.exp / min));
  }
  secs.sort((a, b) => a - b);
  const n = secs.length;
  return { sec: n ? (n % 2 ? secs[(n - 1) / 2] : (secs[n / 2 - 1] + secs[n / 2]) / 2) : STEP_SEC, n };
}
/* ---------- Skill paths ---------- */

// Classes with nothing to compare: their attack is the only one worth points (my call).
const ONE_PATH = ['assassin'];
// A class with a path's skill orders in place of its own.
const pathClass = (cls, path) => ({ ...cls, ...(path.order1 ? { order1: path.order1 } : {}), ...(path.order2 ? { skillOrder: path.order2 } : {}) });
// The top spot at each level along one path: { level, pace, skill, mob, t, cls } (pace 0 when nothing can be killed).
function pathLevels(raw, clsId, path, levels) {
  const base = { level: raw.level, str: raw.str, dex: raw.dex, int: raw.int, luk: raw.luk, skills: { ...(raw.skills || {}) } };
  const top = (t, c) => { const r = rankWith(t, c, DATA, 40)[0]; return r ? { pace: r.pace, skill: r.skill, mob: r, t, cls: c } : { pace: 0, t, cls: c }; };
  const own = pathClass(CLASSES[clsId], path), s0 = validateStats(path.early ? base : raw, clsId).stats, ap0 = planAP(s0, own);
  let early = null;
  if (path.early) {
    const ce = { ...CLASSES[path.early], order1: path.order1 }, se = validateStats(base, path.early).stats;
    early = { cls: ce, s: se, ap: planAP(se, ce), skills29: skillsAt(se, ce, ADVANCE - 1, slotOf(se, ce)) };
  }
  let switched = false;
  return levels.map(lv => {
    const mine = top(lv === s0.level ? s0 : statsAt(s0, own, lv, ap0), own);
    if (!early) return { level: lv, ...mine };
    // the early class's 1st job attack, kept past 30 with only 1st job points, until the class's own attack overtakes
    // it; from then on the class's own (the reset has moved those points)
    if (!switched && lv >= ADVANCE) {
      const t = { ...statsAt(early.s, early.cls, lv, early.ap), skills: early.skills29 };
      if (mine.pace < top(t, early.cls).pace) return { level: lv, ...top(t, early.cls) };
      switched = true;
      return { level: lv, ...mine, switched: true };
    }
    if (switched) return { level: lv, ...mine };
    return { level: lv, ...top(lv === early.s.level ? early.s : statsAt(early.s, early.cls, lv, early.ap), early.cls) };
  });
}
// Every path for the class side by side, or null when it has none. Hours are grinding hours to target at the default clock.
// Kept for the last few forms: the guide reruns on every keystroke, and paths are the slow part.
const pathMemo = new Map();
function comparePaths(raw, clsId, data) {
  if (data) DATA = data;
  const key = clsId + JSON.stringify(raw);
  if (!pathMemo.has(key)) { pathMemo.set(key, comparePathsNow(raw, clsId)); if (pathMemo.size > 20) pathMemo.delete(pathMemo.keys().next().value); }
  return pathMemo.get(key);
}
function comparePathsNow(raw, clsId) {
  const lv0 = Number(raw && raw.level);
  // a path that plays 1st job as another class only makes sense while still in 1st job
  const paths = PATHS[clsId] && PATHS[clsId].filter(x => !x.early || lv0 < ADVANCE);
  if (!paths || !CLASSES[clsId] || !(lv0 >= 1)) return null;
  const target = Math.min(NEXT_ADVANCE, Math.max(40, lv0 + 10));
  const show = [...new Set([lv0, lv0 + 5, lv0 + 10, lv0 < ADVANCE ? ADVANCE : 0, 35, 40, target].filter(x => x >= lv0 && x <= target))].sort((a, b) => a - b);
  // every fourth level plus the shown ones and the level before the advance; hours use the nearest sampled level below
  const all = [...new Set([...Array.from({ length: target - lv0 + 1 }, (_, i) => lv0 + i).filter(x => (x - lv0) % 4 === 0), ...show, ADVANCE - 1, ADVANCE].filter(x => x >= lv0 && x <= target))].sort((a, b) => a - b);
  const out = paths.map(path => {
    const runs = pathLevels(raw, clsId, path, all);
    let hours = 0;
    for (let lv = lv0; lv < target; lv++) {
      const r = runs.filter(x => x.level <= lv).pop();
      hours += r.pace > 0 && EXP_TABLE[lv] ? EXP_TABLE[lv] / expHour(r.pace) : Infinity;
    }
    const sw = path.reset ? runs.find(r => r.switched) : null;
    const rows = runs.filter(r => show.includes(r.level)).map(r => {
      const am = r.skill ? attackModel(r.t, r.cls, undefined, r.skill) : null, range = am ? (am.rangeFor ? am.rangeFor(r.mob.hits) : am.range) : null;
      return { level: r.level, pace: r.pace, expHour: r.pace ? expHour(r.pace) : 0, skill: r.skill || null, spot: r.mob ? r.mob.name : null,
        map: r.mob ? r.mob.map : null, attack: range ? { min: Math.round(range[0]), max: Math.round(range[1]) } : null };
    });
    if (sw) {
      const n = pathLevels(raw, clsId, path, [ADVANCE - 1])[0], l7 = (n.t.skills || {})[CLASSES[path.early].attack1] || 0;
      rows.push({ level: sw.level, reset: true, text: 'Use an SP Reset Scroll, then put your ' + l7 + ' ' + DATA.skills[CLASSES[path.early].attack1].name +
        ' points into ' + DATA.skills[CLASSES[clsId].attack1].name + ' and the rest of your 1st job skills' });
      rows.sort((a, b) => a.level - b.level || (a.reset ? 1 : 0) - (b.reset ? 1 : 0));
    }
    return { id: path.id, name: path.name, how: path.how, rows, hours: Math.round(hours * 10) / 10, needsReset: !!sw, resetAt: sw ? sw.level : null };
  });
  // a path that needs the Cash Shop scroll has to win by half an hour or more
  const cost = x => x.hours + (x.needsReset ? 0.5 : 0);
  const best = out.reduce((b, x) => cost(x) < cost(b) ? x : b), rest = out.filter(x => x !== best), gap = rest.length ? Math.min(...rest.map(x => x.hours)) - best.hours : 0;
  const h = Math.round(gap), soon = h >= 2 ? 'about ' + h + ' hours sooner' : h === 1 ? 'about an hour sooner' : 'a little sooner';
  const why = !rest.length ? best.name + ' is the way to go from here.'
    : best.name + (gap > 0.05 ? ' gets you to ' + target + ' ' + soon : ' is just as quick to ' + target) + (best.needsReset ? ', but needs an SP Reset Scroll from the Cash Shop' : '') + '.';
  // what rests on formulas nobody has checked against the game yet
  const uses = new Set(out.flatMap(x => x.rows.map(r => r.skill))), cls = CLASSES[clsId];
  const unchecked = cls.family === 'phys' ? cls.weapons.filter(w => !CHECKED_WEAPONS.has(w)) : [];
  const estimated = [uses.has(HEAL) ? "Heal's damage is an estimate until it's checked against a real hit." : '',
    unchecked.length ? unchecked.join(' and ') + " damage comes from meowdb's table and hasn't been checked against a real stat window yet." : ''].filter(Boolean).join(' ');
  return { paths: out, best: best.id, why, target, estimated };
}

// The Overview's where to train: a Cleric with Heal gets its best Heal spot and its best Holy Arrow spot, anyone else the
// two best spots; then the attack maxed (what the points still to come change), when it isn't yet.
function overviewSpots(s, cls, rank) {
  const name = id => DATA.skills[id] ? DATA.skills[id].name : '', atk = phaseOf(cls, s.level).attack;
  const spots = (hasHeal(s, cls) ? [rank.find(r => r.skill === HEAL), rank.find(r => r.skill === atk)].filter(Boolean) : rank.slice(0, 2))
    .map(r => ({ label: name(r.skill) || name(atk), row: r }));
  const sk = DATA.skills[atk], cur = s.skills[atk] || 0;
  let maxed = null;
  if (sk && cur < sk.max) {
    const r2 = rankWith({ ...s, skills: { ...s.skills, [atk]: sk.max } }, cls, DATA, 150), r = r2.find(x => x.skill === atk) || r2[0];
    if (r) { r.expHour = expHour(r.pace); maxed = { label: name(atk) + ' maxed', row: r, more: sk.max - cur }; }
  }
  return { spots, maxed };
}
// Grinding hours over the forecast's stages (each level at its own top pace), to the forecast's last level.
function stageHours(s, stages) {
  let h = 0;
  for (const st of stages) for (let lv = st.from; lv <= st.to; lv++) if (lv < stages[stages.length - 1].to && EXP_TABLE[lv]) h += EXP_TABLE[lv] / expHour(st.paces[lv - st.from] || st.picks[0].pace);
  return h;
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
  const atLevel = i => s.level + 1 + Math.floor(i / 3), steps = [];
  const spare = spend(order, plan, 3 * (P.until - s.level), (id, from, add) => steps.push({ from: atLevel(from), to: atLevel(from + add - 1), id,
    target: plan[id], text: DATA.skills[id].name + ' to ' + plan[id] + ' (' + add + (add === 1 ? ' point)' : ' points)') }));
  return { now, plan, steps, spare, until: P.until };
}
// Spends points down a skill order into plan (only the ids it holds), prerequisites first; onAdd(id, pointsUsedBefore, added).
function spend(order, plan, points, onAdd) {
  let left = Math.max(0, points), used = 0;
  function raise(id, target) {
    for (const [rid, rlv] of Object.entries(DATA.skills[id].req || {})) if (plan[rid] !== undefined) raise(Number(rid), rlv);
    const add = Math.min(Math.max(0, target - plan[id]), left);
    if (!add) return;
    plan[id] += add; left -= add;
    if (onAdd) onAdd(id, used, add);
    used += add;
  }
  for (const [id, target] of order) if (plan[id] !== undefined && DATA.skills[id]) raise(id, Math.min(target, DATA.skills[id].max));
  return left;
}
// The skills of someone who followed the guide: 1 point at each advancement plus 3 a level, down each job's order.
function typicalSkills(cls, lv, slot) {
  const out = {}, jobs = [phaseOf(cls, Math.min(lv, ADVANCE - 1))].concat(lv >= ADVANCE ? [phaseOf(cls, lv)] : []);
  for (const P of jobs) {
    const start = P.phase === 1 ? ADV1(cls.id) : ADVANCE, end = P.phase === 1 ? Math.min(lv, ADVANCE - 1) : lv;
    const plan = {};
    for (const id of Object.keys(DATA.skills).map(Number)) if (DATA.skills[id].job === P.job) plan[id] = 0;
    // A warrior's 2nd job still swings Power Strike, so the attack carries its 1st job points in.
    if (P.attack !== undefined && plan[P.attack] === undefined) plan[P.attack] = out[P.attack] || 0;
    spend([[P.attack, 1]].concat(orderFor(cls, P, slot)), plan, 1 + 3 * (end - start));
    // The attack always has a point, even when its prerequisite took the only one (Double Shot at 10).
    if (P.attack !== undefined && plan[P.attack] < 1) plan[P.attack] = 1;
    Object.assign(out, plan);
  }
  return out;
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
  // Points not spent yet (AP left) are a row of their own at your level, before the next level up.
  const per = {}, left = s.apLeft || 0, first = left ? s.level : s.level + 1, cap = lv => lv === s.level ? left : 5;
  for (let lv = first; lv < until; lv++) per[lv] = { req: 0, why: '' };
  let have = s[cls.reqStat];
  for (const T of Object.keys(tiers).map(Number).sort((a, b) => a - b)) {
    let need = tiers[T].need - have;
    if (need <= 0) continue;
    have += need;
    for (let lv = T - 1; lv >= first && need > 0; lv--) {
      const take = Math.min(cap(lv) - per[lv].req, need);
      if (take <= 0) continue;
      per[lv].req += take; need -= take; per[lv].why = 'So you can wear a ' + tiers[T].name + ' at ' + T + ' (it needs ' + tiers[T].need + ' ' + STAT_NAME[cls.reqStat] + ').';
      per[lv].wear = { name: tiers[T].name, level: T, need: tiers[T].need };
    }
  }
  const rows = [];
  for (let lv = first; lv < until; lv++) {
    const p = per[lv], main = cap(lv) - p.req, now = lv === s.level;
    const put = p.req ? p.req + ' ' + STAT_NAME[cls.reqStat] + (main ? ', ' + main + ' ' + STAT_NAME[cls.mainStat] : '') : cap(lv) + ' ' + STAT_NAME[cls.mainStat];
    const why = p.why || 'Your main stat, it adds the most damage.';
    const last = rows[rows.length - 1];
    if (last && !last.now && !now && last.put === put && last.why === why && last.to === lv - 1) last.to = lv;
    else rows.push({ from: lv, to: lv, put, why, req: p.req, ...(now ? { now: true } : {}), ...(p.wear ? { wear: p.wear } : {}) });
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
      .map(g => ({ id: g.id, level: g.level, name: g.name, inc: g.inc, craft: g.craft, slots: g.slots }));
    if (rows.length) out.push({ slot, rows });
  }
  return out;
}

/* ---------- Scrolls ---------- */

// Stats with a few gains applied (d), the way avgCast applies them: magic attack and INT/2 into a mage's magic,
// weapon attack into the physical W override.
function withGain(s, cls, d) {
  const s2 = { ...s, skills: s.skills };
  for (const k of ['str', 'dex', 'int', 'luk']) s2[k] = s[k] + (d[k] || 0);
  if (physical(cls)) { s2.critRate = s.critRate + (d.crt || 0); s2.W = attackModel(s, cls).W + (d.wat || 0); }
  else s2.magic = s.magic + (d.mad || 0) + (d.int || 0) / 2;
  return s2;
}

// How a gain plays at your spot: the Train tab's simulation rerun on the few monsters that matter, with the dice
// pinned to your stats as they are now, so the only thing that changes is the gain.
function spotModel(s, cls, rank) {
  const ids = new Set(rank.slice(0, 6).map(m => m.id)), mobs = DATA.mobs.filter(m => ids.has(m.id)), seed = hash(JSON.stringify(s));
  const memo = {}, at = d => memo[JSON.stringify(d)] || (memo[JSON.stringify(d)] = rankWith(withGain(s, cls, d), cls, { ...DATA, mobs }, 150, seed));
  // Your spot is the Train tab's pick; the gains are measured on it, so both tabs name the same monster.
  const base = at({}), here = rank[0] && base.find(m => m.id === rank[0].id);
  const pct = rows => { const m = here && rows.find(x => x.id === here.id); return m ? Math.round((m.pace / here.pace - 1) * 1000) / 10 : 0; };
  return { here, base, at, pct, gain: d => here ? pct(at(d)) : 0 };
}

// Where you stand: how much more magic or weapon attack keeps raising EXP an hour at your spot, where it stops
// helping (stops), when it only starts helping past +5 (starts), and when nothing to +40 moves your spot (flat), how much
// it takes for one cast fewer.
function standing(s, cls, spot) {
  const { here, at, pct } = spot;
  if (!here) return null;
  const stat = physical(cls) ? 'wat' : 'mad', castsAt = add => (at({ [stat]: add }).find(m => m.id === here.id) || here).casts;
  const steps = [5, 10, 15, 20, 25, 30, 35, 40].map(add => { const rows = at({ [stat]: add }); return { add, pct: pct(rows), mob: rows[0].name }; });
  const top = steps[steps.length - 1].pct, flat = top < 1, first = steps.find(x => x.pct >= 1);
  let stops = null;
  if (top >= 1) {
    const i = steps.findIndex(x => top - x.pct < 1);
    let lo = i ? steps[i - 1].add : 0, hi = steps[i].add;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; top - pct(at({ [stat]: mid })) < 1 ? hi = mid : lo = mid; }
    stops = hi;
  }
  let fewer = null;
  if (flat) {
    const goal = here.casts - 1 + 0.05;
    let hi = null, lo = 0;
    for (let add = 10; add <= 80; add += 10) { if (castsAt(add) <= goal) { hi = add; break; } lo = add; }
    if (hi !== null) { while (hi - lo > 1) { const mid = (lo + hi) >> 1; castsAt(mid) <= goal ? hi = mid : lo = mid; } fewer = hi; }
  }
  const far = at({ [stat]: 40 });
  const moved = far.find(m => m.id !== here.id && (spot.base.find(b => b.id === m.id) || m).casts - m.casts >= 0.3);
  return { mob: here.name, skill: here.skill, casts: here.casts, stat, steps, starts: first && first.add > 5 ? first.add : null, stops: flat ? null : stops, flat, fewer, next: moved ? moved.name : null };
}

// Scroll families that raise this class's damage, one card per slot you have an item in: Lesser, Intermediate and
// Greater side by side with what filling the item's slots should get you (odds x gain), its damage and EXP an hour at
// your spot, and with a Cozy price, the cost and the cost of each 1% of damage.
function planScrolls(s, cls, gear, spot) {
  const atk = physical(cls) ? 'wat' : 'mad';
  const useful = physical(cls) ? [atk, cls.mainStat, 'crt'] : [atk, cls.mainStat];
  const out = [];
  for (const f of DATA.scrolls) {
    if (!useful.includes(f.stat) || !f.tiers) continue;
    const g = gear.find(x => x.slot === f.slot), cur = g && g.rows.filter(r => r.level <= s.level).pop();
    if (!cur || !cur.slots) continue;
    const tiers = f.tiers.map(t => {
      const expect = Math.round(cur.slots * t.rate / 100 * t.gain * 10) / 10, dmg = gainPct(s, cls, { [f.stat]: expect });
      const cost = t.price ? cur.slots * t.price : null;
      return { tier: t.tier, rate: t.rate, cozy: t.cozy, price: t.price, sales: t.sales, expect, dmg, exp: spot.gain({ [f.stat]: expect }),
        cost, per1: cost && dmg > 0 ? Math.round(cost / dmg) : null };
    });
    const priced = tiers.filter(t => t.per1 !== null);
    out.push({ slot: f.slot, family: f.family, stat: f.stat, slots: cur.slots, item: cur.name, itemId: cur.id, tiers,
      best: priced.length ? Math.min(...priced.map(t => t.per1)) : null, top: Math.max(...tiers.map(t => t.dmg)) });
  }
  return out.sort((a, b) => (a.best === null) - (b.best === null) || (a.best - b.best) || b.top - a.top);
}

// What +1, +5 and +10 of each stat is worth to you in damage, and +10 in EXP an hour at your spot.
function worthTable(s, cls, spot) {
  const atk = physical(cls) ? 'wat' : 'mad';
  const keys = [atk, cls.mainStat, ...['str', 'dex', 'int', 'luk'].filter(k => k !== cls.mainStat), ...(physical(cls) ? ['crt'] : [])];
  const cap = k => STAT_NAME[k].length > 3 ? STAT_NAME[k][0].toUpperCase() + STAT_NAME[k].slice(1) : STAT_NAME[k];
  const rows = keys.map(k => {
    const d = [1, 5, 10].map(n => gainPct(s, cls, { [k]: n }));
    return { what: cap(k), stat: k, d, exp10: d[2] > 0 ? spot.gain({ [k]: 10 }) : null };
  });
  return rows.slice(0, 2).concat(rows.slice(2).sort((a, b) => b.d[2] - a.d[2]));
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
  const paths = comparePaths(raw, clsId), bestPath = paths && PATHS[clsId].find(x => x.id === paths.best);
  // the recommended path's orders drive Next SP and the Points tab
  const planCls = bestPath ? pathClass(cls, bestPath) : cls;
  // a path within the class (Heal first) also drives the forecast; one that plays 1st job as another class doesn't
  const gear = planGear(s, cls), skills = planSkills(s, planCls), slot = slotOf(s, cls), rank = rankWith(s, cls, data), ap = planAP(s, cls), spot = spotModel(s, cls, rank);
  const stages = forecast(s, bestPath && !bestPath.early ? planCls : cls, ap);
  const held = cls.family === 'phys' && DATA.gear.find(x => x.id === s.weapon);
  const weapon = physical(cls) ? { id: held ? held.id : null, slot, name: held ? held.name : null, wat: held ? held.inc.wat || 0 : null, W: am.W } : null;
  for (const r of rank) r.expHour = expHour(r.pace);
  return { ok: true, sec: STEP_SEC, phase: P.phase, estimated: cls.family === 'phys' && !CHECKED_WEAPONS.has(slot), weapon, assumed: v.assumed, stats: s,
    attack: { min: Math.round(am.range[0]), max: Math.round(am.range[1]), avg: Math.round(sum / 2 * am.hits) },
    heal: hasHeal(s, cls) ? (h => ({ min: h.range[0], max: h.range[1], level: s.skills[HEAL], targets: h.targets }))(attackModel(s, cls, undefined, HEAL)) : null,
    paths, overview: overviewSpots(s, cls, rank), train: rank.slice(0, 10), here: rank[0] || null, tryNext: worthTry(rank, s.level, rank[0] && rank[0].id), stages,
    stageHours: stageHours(s, stages),
    skills, ap, gear, next: planNext(s, cls, P, skills, physical(cls) ? am.W : bestWeapon(slot, s.level, 'mad')),
    scrolls: planScrolls(s, cls, gear, spot), standing: standing(s, cls, spot), worth: worthTable(s, cls, spot), prices: data.prices || null };
}

/* ---------- The road ahead ---------- */

// Monsters above your level, up to 8 levels up, that you hit at least 70% of the time: worth trying now.
const worthTry = (rank, lv, nowId) => rank.filter(m => m.level > lv && m.level <= lv + 8 && m.hit >= 70 && m.id !== nowId).slice(0, 3);

// The best weapon of a type this class can wear by a level, by its attack (weapon attack, or magic attack for mages).
function bestGearAt(cls, slot, lv) {
  const key = physical(cls) ? 'wat' : 'mad';
  return DATA.gear.filter(g => g.slot === slot && fits(g, cls) && g.level <= lv).reduce((b, g) => !b || (g.inc[key] || 0) > (b.inc[key] || 0) ? g : b, null);
}
// Skills at a later level for someone who follows the guide: the 1st job's order to 29, then 1 point at 30 and 3 a level.
function skillsAt(s, cls, lv, slot) {
  const out = { ...s.skills };
  const run = (P, points) => {
    const plan = {};
    for (const id of Object.keys(DATA.skills).map(Number)) if (DATA.skills[id].job === P.job) plan[id] = out[id] || 0;
    if (P.attack !== undefined && plan[P.attack] === undefined) plan[P.attack] = out[P.attack] || 0;
    spend([[P.attack, 1]].concat(orderFor(cls, P, slot)), plan, points);
    Object.assign(out, plan);
  };
  const P0 = phaseOf(cls, s.level);
  if (P0.phase === 2) run(P0, 3 * (lv - s.level));
  else {
    run(P0, 3 * (Math.min(lv, ADVANCE - 1) - s.level));
    if (lv >= ADVANCE) run(phaseOf(cls, lv), 1 + 3 * (lv - ADVANCE));
  }
  return out;
}
// The character at a later level following the plan: AP rows, skill order, and the best weapon they can wear by then.
// Only the stats typed now are real; everything after is the guide's own plan.
function statsAt(s, cls, lv, ap) {
  const d = { str: 0, dex: 0, int: 0, luk: 0 }, slot = slotOf(s, cls), key = physical(cls) ? 'wat' : 'mad';
  for (const r of ap) for (let l = r.from; l <= Math.min(r.to, lv); l++) { d[cls.reqStat] += r.req; d[cls.mainStat] += 5 - r.req; }
  const t = { ...s, level: lv, skills: skillsAt(s, cls, lv, slot) };
  for (const k in d) t[k] = s[k] + d[k];
  const held = cls.family === 'phys' && DATA.gear.find(x => x.id === s.weapon), now = bestGearAt(cls, slot, s.level), then = bestGearAt(cls, slot, lv);
  const cur = held ? held.inc.wat || 0 : now ? now.inc[key] || 0 : 0, gain = Math.max(0, (then ? then.inc[key] || 0 : 0) - cur);
  if (physical(cls)) {
    t.W = attackModel(s, cls).W + gain;
    t.acc = Math.round(s.acc + (lv - s.level) + 0.8 * d.dex + 0.5 * d.luk);
  } else {
    t.magic = s.magic + Math.floor(d.int / 2) + gain;
    t.acc = s.acc + (lv - s.level);
  }
  return t;
}
// The next 10 levels (or to 70) as stages: the ranking rerun at each level, grouped while the top pick holds. A one level
// blip folds into the stage before it (or after, at the start), and each stage says what changed to start it.
function forecast(s, cls, ap) {
  const end = Math.max(s.level, Math.min(s.level + 10, NEXT_ADVANCE)), slot = slotOf(s, cls), runs = [];
  for (let lv = s.level; lv <= end; lv++) {
    const t = lv === s.level ? s : statsAt(s, cls, lv, ap), r = rankWith(t, cls, DATA, 150);
    if (r.length) runs.push({ lv, t, r });
  }
  const byLv = {};
  for (const x of runs) byLv[x.lv] = x;
  let st = [];
  for (const x of runs) {
    const last = st[st.length - 1];
    if (last && last.top === x.r[0].id) last.to = x.lv;
    else st.push({ from: x.lv, to: x.lv, top: x.r[0].id, run: x });
  }
  for (let i = 0; i < st.length - 1; i++) if (st[i].from === st[i].to && st.length > 1) {
    if (i > 0) st[i - 1].to = st[i].to; else { st[1].from = st[0].from; st[1].run = st[0].run; st[1].top = st[0].top; }
    st.splice(i, 1); i = -1;
  }
  // Neighbours with the same pick after folding become one.
  st = st.reduce((a, x) => { const l = a[a.length - 1]; if (l && l.top === x.top) l.to = x.to; else a.push(x); return a; }, []);
  return st.map((x, i) => {
    const r = x.run.r, picks = [r[0]].concat(r[1] && r[1].pace >= 0.9 * r[0].pace ? [r[1]] : []);
    // The latest change in the 3 levels leading into the stage, so a reason from long before doesn't take the credit.
    let why = '';
    for (let lv = x.from; i && !why && lv > Math.max(st[i - 1].from, x.from - 3); lv--)
      why = whyStage(byLv[lv - 1].t, byLv[lv].t, cls, slot, r[0], lv === x.from ? st[i - 1].run.r[0] : null, x.from);
    // each level's own top pace, for the hours it takes (the stage's picks are from its first level)
    return { from: x.from, to: x.to, picks, why, paces: runs.filter(y => y.lv >= x.from && y.lv <= x.to).map(y => y.r[0].pace) };
  });
}
// What changed from level a to the next level b of the plan: the 2nd job, a skill the stage's pick uses maxing or
// taking over from the last stage's (was, only at the stage's first level), a better weapon, any skill maxed. Changes
// before the stage's first level (from) say their level.
function whyStage(a, b, cls, slot, pick, was, from) {
  const at = b.level < from ? ' at ' + b.level : '';
  if (a.level < ADVANCE && b.level >= ADVANCE) return '2nd job at ' + ADVANCE;
  const maxed = id => DATA.skills[id] && DATA.skills[id].name && b.skills[id] >= DATA.skills[id].max && !(a.skills[id] >= DATA.skills[id].max);
  if (maxed(pick.skill)) return DATA.skills[pick.skill].name + ' maxed' + at;
  if (was && pick.skill !== was.skill) return DATA.skills[pick.skill].name + ' ' + b.skills[pick.skill] + ' takes over';
  const wa = bestGearAt(cls, slot, a.level), wb = bestGearAt(cls, slot, b.level);
  if (wb && wb !== wa) return wb.name + ' at ' + wb.level;
  const any = Object.keys(b.skills).map(Number).find(maxed);
  return any ? DATA.skills[any].name + ' maxed' + at : '';
}

// The ability points, skill points and upgrades ahead as one list by level, split at the next milestone (the next level a
// weapon needs the second stat, the next weapon, or the job advancement), and at least 5 levels ahead.
function pointsPlan(g) {
  const lv = g.stats.level, order = { up: 0, job: 1, ap: 2, sp: 3 };
  const events = [
    ...g.ap.map(a => ({ kind: 'ap', from: a.from, to: a.to, now: a.now, text: a.put, note: a.wear ? 'so you can wear a ' + a.wear.name + ' at ' + a.wear.level + ' (needs ' + a.wear.need + ')' : 'your main stat' })),
    ...g.skills.steps.map(st => ({ kind: 'sp', from: st.from, to: st.to, text: st.text })),
    ...(g.paths ? g.paths.paths.find(x => x.id === g.paths.best).rows.filter(r => r.reset).map(r => ({ kind: 'sp', from: r.level, to: r.level, text: r.text })) : []),
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
// form.from: where the numbers came from, for a Something off? report ('mine' or 'community' for a loaded build, 'read'
// for Read from game, none when typed by hand), and form.edited once the player changed something after that
// lastPic: the picture Read from game read last ({ img, at }), kept for a report until the next one or a reload
const ui = { deps: null, data: null, root: null, form: { cls: 'cleric', v: {}, s: {} }, timer: 0, read: new Set(), lastPic: null };
const FROM = ['mine', 'community', 'read', 'friend'];
const E = (...a) => ui.deps.el(...a);
const fieldsOf = cls => cls.fields.flatMap(f => INPUTS[f]).concat([['apLeft', 'AP left']]);
const formLevel = () => Number(ui.form.v.level) || ADVANCE;
// The weapon the form shows: the picked one when this class can hold it, else the best for the level.
const formWeapon = cls => weaponOf(cls, formLevel(), ui.form.v.weapon);
const fmt = n => Math.round(n).toLocaleString('en-US');

function loadForm() {
  try {
    const f = JSON.parse(ui.deps.store.get('bt.calc'));
    if (f && CLASSES[f.cls]) ui.form = { cls: f.cls, v: f.v || {}, s: f.s || {}, ...(FROM.includes(f.from) ? { from: f.from } : {}), ...(f.edited === true ? { edited: true } : {}) };
  } catch { /* nothing saved yet */ }
}
// The player changed the form by hand after it was loaded or read.
const edited = () => { if (ui.form.from) ui.form.edited = true; };
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
  edited(); saveForm(); buildForm(); renderGuide();
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
      ? E('div', { class: 'b-mine-list' }, mine.map(b => E('button', { type: 'button', class: 'b-mine-card', onclick: () => fill(b.stats, b.class, 'mine') },
        E('b', {}, b.ign), ' Lv ' + b.level + ' ' + (CLASSES[b.class] ? CLASSES[b.class].name : b.class))))
      : E('p', { class: 'small' }, 'Builds you save show up here.'));
  } catch (e) { if (gen === ui.mineGen) box.replaceChildren(E('p', { class: 'small' }, "Couldn't load your builds: " + e.message)); }
}
function changed() { edited(); saveForm(); clearTimeout(ui.timer); ui.timer = setTimeout(renderGuide, 150); }

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
  // the attacks first and big (Heal ahead of Holy Arrow for a Cleric with points in it), then the stats: a six column
  // grid where the attacks share one row and the three stats the next, so every row is full
  const skills = (g.heal ? [['heal', 'Heal, Lv ' + g.heal.level, fmt(g.heal.min) + ' to ' + fmt(g.heal.max), 'per undead hit, up to ' + g.heal.targets + ' at once. Estimated']] : [])
    .concat([['atk', atk, fmt(g.attack.min) + ' to ' + fmt(g.attack.max), 'per hit']]);
  ui.root.querySelector('#b-big').replaceChildren(
    ...skills.map(([k, name, v, sub]) => { const t = big(name, v, sub); t.classList.add('sk', k); t.style.gridColumn = 'span ' + 6 / skills.length; return t; }),
    big(STAT_NAME[cls.mainStat], fmt(g.stats[cls.mainStat]), '', guess(cls.mainStat)),
    big(STAT_NAME[cls.reqStat], fmt(g.stats[cls.reqStat]), '', guess(cls.reqStat)),
    physical(cls) ? big('Weapon attack', fmt(g.weapon.W), '', ['wat', 'weapon', 'atkMin', 'atkMax'].some(guess)) : big('Magic', fmt(g.stats.magic), '', guess('magic')));
}

// The Overview's four tiles: the next ability and skill points, the next upgrade, and the best scroll for you.
function overviewTiles(g, cls) {
  const a = g.ap[0], wear = g.ap.find(r => r.wear);
  const apSub = !a ? 'each level' : a.wear ? 'for a ' + a.wear.name + ' at ' + a.wear.level : wear ? wear.put.split(',')[0] + ' at ' + wear.from + ', for a ' + wear.wear.name : 'your main stat';
  const st = g.skills.steps[0], sk = g.skills;
  const up = g.next.find(n => n.kind === 'gear') || g.next.find(n => n.kind === 'job');
  const upSub = !up ? '' : up.kind === 'job' ? up.text : [up.gain > 0 ? '+' + up.gain + ' ' + up.stat : '', up.needs ? 'needs ' + up.needs : ''].filter(Boolean).join(', ');
  const c = g.scrolls[0], mid = c && c.tiers[1];
  return [
    tile('ap', 'Next AP', a ? a.put : '5 ' + STAT_NAME[cls.mainStat], apSub),
    st ? tile('sp', 'Next SP', ui.data.skills[st.id].name, 'from ' + st.from + ', up to ' + st.target)
      : tile('sp', 'Next SP', sk.spare ? sk.spare + ' spare' : 'All planned', sk.spare ? 'points left by level ' + sk.until : ''),
    tile('up', 'Next upgrade', !up ? 'Nothing soon' : up.kind === 'job' ? '2nd job at ' + up.level : up.name + ' at ' + up.level, upSub),
    tile('scroll', 'Best scroll', c ? c.family : 'Nothing yet', c ? (mid.exp > 0 ? 'about +' + mid.exp + '% EXP an hour with 60% scrolls' : 'on your ' + c.item) : 'no damage scrolls for your gear yet')];
}
// The Overview: where to train with EXP an hour, the four tiles, the next levels in a sentence and the recommended skill
// path, each pointing at its own tab.
function renderOverview(g, cls) {
  const box = ui.root.querySelector('#overview'), o = g.overview, sk = id => ui.data.skills[id] ? ui.data.skills[id].name : '';
  const go = (tab, text) => E('button', { type: 'button', class: 'linkish b-go', 'data-go': tab, onclick: () => showTab(tab) }, text);
  const sec = text => E('h4', { class: 'b-sec' }, text);
  const rows = o.spots.map(x => ({ ...x, tag: x.row.skill === HEAL ? 'your skills now, estimated' : '' })).concat(o.maxed ? [{ ...o.maxed, tag: 'with ' + o.maxed.more + ' more points' }] : []);
  const most = Math.max(1, ...rows.map(x => x.row.pace));
  const row = x => E('div', { class: 'b-ovrow' },
    E('div', {}, E('div', {}, E('b', {}, x.label), ' at ', E('b', { class: 'b-name' }, x.row.name), x.tag ? E('span', { class: 'b-chip' }, x.tag) : null),
      E('div', { class: 'small' }, [x.row.map.replace(/^.*? : /, ''), castsText(x.row), x.row.hits > 1 ? x.row.hits + ' at a time' : ''].filter(Boolean).join(', ')),
      bar(x.row.pace / most * 100)),
    E('div', { class: 'num b-hr' }, perHour(expHour(x.row.pace, g.sec))));
  const st = g.stages, end = st.length ? st[st.length - 1].to : g.stats.level, hrs = Math.round(g.stageHours * g.sec / STEP_SEC);
  const stageText = st.map(x => x.picks[0].name + ' with ' + (sk(x.picks[0].skill) || 'your attack') + (x.from === x.to ? ' at ' + x.from : ' from ' + x.from + ' to ' + x.to)).join(', then ');
  const best = g.paths && g.paths.paths.find(x => x.id === g.paths.best);
  box.replaceChildren(
    sec('Where to train'), ...(rows.length ? rows.map(row) : [E('p', { class: 'small' }, 'Nothing you can kill yet.')]), go('train', 'More spots on the Train tab'),
    E('div', { class: 'b-now' }, ...overviewTiles(g, cls)),
    E('div', { class: 'b-ovgo' }, go('points', 'Points tab'), go('gear', 'Gear tab'), go('scrolls', 'Scrolls tab')),
    sec(end > g.stats.level ? 'Your next ' + (end - g.stats.level) + ' levels' : 'From here'),
    E('p', {}, stageText + '.' + (end > g.stats.level ? ' About ' + Math.max(1, hrs) + ' hours of grinding to ' + end + '.' : '')), go('train', 'The stages on the Train tab'),
    // replaceChildren writes a null as the text "null", so a class without paths leaves the three out
    ...(best ? [sec('Skill paths'), E('p', {}, g.paths.why, g.paths.estimated ? E('span', { class: 'small' }, ' ' + g.paths.estimated) : null), go('paths', 'Compare them on the Skill paths tab')] : []),
    E('p', { class: 'small b-foot' }, 'EXP an hour: ' + tuneText(g.tune)));
}

// EXP an hour in short: 118K/hr.
const perHour = x => x >= 10000 ? Math.round(x / 1000) + 'K/hr' : x >= 1000 ? (x / 1000).toFixed(1) + 'K/hr' : x + '/hr';
// The clock EXP an hour runs on: tuned from the player's own saved Grind sessions when the build is theirs (from My
// builds or Read from game), else the rough default. Sessions load once per signed in player.
function tuneFor(g) {
  const from = ui.form.from, base = { sec: STEP_SEC, n: 0 };
  if (from === 'friend') return { ...base, why: 'friend' };
  if (!me()) return { ...base, why: 'signedout' };
  if (from !== 'mine' && from !== 'read') return { ...base, why: 'notyours' };
  if (!ui.grind || ui.grind.user !== me().user_id) loadGrind();
  if (!ui.grind.rows) return { ...base, why: 'none' };
  const t = tuneSeconds(g.stats, CLASSES[ui.form.cls], ui.grind.rows);
  return { ...t, why: t.n ? 'tuned' : 'none' };
}
function loadGrind() {
  const g = ui.grind = { user: me().user_id, rows: null };
  if (!ui.deps.api.listGrind) { g.rows = []; return; }
  ui.deps.api.listGrind().then(r => { g.rows = r || []; }, () => { g.rows = []; }).then(() => { if (ui.grind === g) renderGuide(); });
}
const TUNE_TEXT = {
  tuned: t => 'Tuned from your ' + t.n + ' Grind session' + (t.n === 1 ? '' : 's') + ' near this level.',
  friend: () => "A rough guess, since this isn't your character.",
  notyours: () => 'A rough guess. Load your build from My builds or Read from game to tune it to your Grind sessions.',
  signedout: () => 'A rough guess. Sign in and save a Grind session to tune it to how fast you play.',
  none: () => "A rough guess until you've saved a Grind session near this level." };
const tuneText = t => TUNE_TEXT[t.why](t);
// Puts the tuned clock on every ranking row the guide shows.
function applyTune(g, t) {
  g.sec = t.sec; g.tune = t;
  const o = g.overview;
  for (const r of [...g.train, ...g.tryNext, ...g.stages.flatMap(st => st.picks), ...o.spots.map(x => x.row), ...(o.maxed ? [o.maxed.row] : [])]) r.expHour = expHour(r.pace, t.sec);
}

function renderPanels(g) {
  const lv = g.stats.level, top = g.train.length ? g.train[0].pace : 1;
  const train = ui.root.querySelector('#train'), h = g.here;
  const sec = text => E('h4', { class: 'b-sec' }, text), ahead = g.stages.length ? g.stages[g.stages.length - 1].to - lv : 0;
  const where = m => m.map.replace(/^.*? : /, '');
  const crowd = m => m.hits > 1 ? ui.data.skills[m.skill].name + ' hits about ' + m.hits + ' at a time' : '';
  train.replaceChildren(
    sec('Train here now'),
    h ? E('div', { class: 'b-here' }, E('div', {}, E('b', { class: 'b-name' }, h.name), ' ', E('span', { class: 'small' }, 'lv ' + h.level)),
      E('div', { class: 'small' }, [where(h), castsText(h), h.hit + '% hit', fmt(h.exp) + ' EXP each', crowd(h)].filter(Boolean).join(', ')),
      E('div', { class: 'b-hrbig' }, 'About ', E('b', { class: 'num' }, perHour(h.expHour)), h.skill === HEAL ? ' with Heal' : ''))
      : E('p', { class: 'small' }, 'Nothing you can kill yet.'),
    E('p', { class: 'small b-tune' }, 'EXP an hour: ' + tuneText(g.tune)),
    sec('Worth a try'),
    g.tryNext.length ? E('div', { class: 'b-try' }, g.tryNext.map(m => E('div', { class: 'b-tryone' },
      E('b', {}, m.name), ' ', E('span', { class: 'small' }, 'lv ' + m.level), E('div', { class: 'small' }, [where(m), castsText(m), m.hit + '% hit', crowd(m)].filter(Boolean).join(', ')))))
      : E('p', { class: 'small' }, 'Nothing up to 8 levels above you that you hit often enough yet.'),
    sec(ahead > 0 ? 'Your next ' + ahead + ' levels' : 'From here'),
    E('ul', { class: 'b-time' }, g.stages.map(st => E('li', { class: 'b-ev b-stage' }, E('span', { class: 'num' }, range(st.from, st.to)),
      E('span', {}, E('b', {}, st.picks.map(m => m.name).join(', ')), ' ', E('span', { class: 'small' }, st.picks.map(where).filter((x, i, a) => a.indexOf(x) === i).join(', ')),
        st.why ? [' ', E('span', { class: 'b-chip up' }, st.why)] : null)))),
    sec('Every map, ranked'),
    ...g.train.map((m, i) => extra(E('div', { class: 'b-mob' },
      E('div', {}, E('div', {}, E('b', { class: 'b-name' }, m.name), ' ', E('span', { class: 'small' }, 'lv ' + m.level)),
        E('div', { class: 'small' }, [m.map, castsText(m), m.hit + '% hit', fmt(m.hp) + ' HP', crowd(m)].filter(Boolean).join(', ')),
        bar(m.pace / top * 100)),
      E('div', { class: 'num' }, E('div', { class: 'n b-hr' }, perHour(m.expHour)), E('div', { class: 'small' }, fmt(m.exp) + ' EXP a kill'))), i, 0)),
    E('p', { class: 'small b-foot' }, 'Ranked by EXP over time: casts to kill, from a few thousand simulated kills with your damage range, crits, monster defense and hit chance, plus about 2 casts of walking between kills. So a monster you one shot only wins if its EXP holds up. ',
      'Skills that hit several monsters get credit for about one monster in reach for every ' + CROWD + ' the map spawns, and each extra one costs a cast of walking to gather. ',
      'Only "Train here now" and "Worth a try" use your numbers. The next levels assume you follow this guide: its AP, skill points and the best weapon you can wear.'));
  moreButton(train, 'Show all ' + g.train.length + ' maps');
  train.append(train.querySelector('.b-foot'));

  const pts = pointsPlan(g), chip = { ap: 'AP', sp: 'SP', up: 'upgrade', job: 'job' };
  const row = e => E('li', { class: 'b-ev', 'data-from': String(e.from) }, E('span', { class: 'num' }, e.now ? 'Now' : range(e.from, e.to)),
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

  renderScrolls(g);
}

// Mesos the short way: 179k, 1.25m.
const meso = n => n >= 1e6 ? +(n / 1e6).toFixed(2) + 'm' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n);
const SHORT = { mad: 'MA', wat: 'ATT' };
const plural = n => /y$/.test(n) ? n.slice(0, -1) + 'ies' : /s$/.test(n) ? n : n + 's';

// The Where you stand sentences: where more attack starts helping, where it tops out, or that nothing moves this spot.
// Skill paths: each way to spend SP as a column, the recommended one marked, with why on top. A class without paths
// shows its one plan.
function renderPaths(g, cls) {
  const box = ui.root.querySelector('#paths'), name = id => ui.data.skills[id] ? ui.data.skills[id].name : '';
  if (!g.paths) {
    const P = phaseOf(cls, g.stats.level), order = orderFor(cls, P, slotOf(g.stats, cls)).filter(([id]) => name(id));
    box.replaceChildren(E('h4', { class: 'b-sec' }, 'Your plan'),
      E('p', {}, order.map(([id, n]) => name(id) + ' to ' + Math.min(n, ui.data.skills[id].max)).join(', then ') + '.'),
      E('p', { class: 'small' }, ONE_PATH.includes(cls.id) ? 'This is the one way to go for ' + plural(cls.name) + ': its attack is the only one worth points.' : 'Comparisons for this class are coming.'));
    return;
  }
  const scale = g.sec / STEP_SEC, hrs = h => isFinite(h) ? Math.round(h * scale) + ' hours' : 'a long time';
  const col = x => E('div', { class: 'b-pcol' + (x.id === g.paths.best ? ' best' : '') },
    E('div', { class: 'top' }, E('b', {}, x.name), x.id === g.paths.best ? E('span', { class: 'b-pill' }, 'Recommended') : null),
    E('p', { class: 'small' }, x.how),
    E('p', {}, 'About ', E('b', { class: 'num' }, hrs(x.hours)), ' of grinding to ' + g.paths.target + (x.needsReset ? '. Needs an SP Reset Scroll from the Cash Shop.' : '.')),
    E('table', { class: 'b-table' },
      E('thead', {}, E('tr', {}, ['Lv', 'Skill', 'Per hit', 'Spot', 'EXP an hour'].map((h, j) => E('th', { class: j === 0 || j > 1 && j !== 3 ? 'n' : '' }, h)))),
      E('tbody', {}, x.rows.map(r => r.reset
        ? E('tr', { class: 'reset' }, E('td', { class: 'n' }, String(r.level)), E('td', { colspan: '4' }, r.text + '.'))
        : E('tr', {}, E('td', { class: 'n' }, String(r.level)), E('td', {}, r.skill ? name(r.skill) : ''),
          E('td', { class: 'n' }, r.attack ? r.attack.min + ' to ' + r.attack.max : ''), E('td', {}, r.spot || 'nothing yet'),
          E('td', { class: 'n b-hr' }, r.pace ? perHour(expHour(r.pace, g.sec)) : '0/hr'))))));
  box.replaceChildren(E('h4', { class: 'b-sec' }, 'Ways to spend your skill points'), E('div', { class: 'b-here' }, g.paths.why),
    E('div', { class: 'b-pcols' }, g.paths.paths.map(col)),
    E('p', { class: 'small b-foot' }, 'Each path starts from the points you have now and puts every new point where it says. EXP an hour is at the best spot for that level. ' +
      'Next SP and the Points tab follow the recommended path. ' + (g.paths.estimated ? g.paths.estimated + ' ' : '') + tuneText(g.tune)));
}

function standingText(st) {
  const att = STAT_NAME[st.stat], mobs = plural(st.mob), top = st.steps[st.steps.length - 1];
  if (st.flat) return ["More " + att + " won't speed this spot up yet: even +40 kills " + mobs + ' no faster.',
    st.fewer ? ' One cast fewer takes about +' + st.fewer + ' ' + att + '.' : ''];
  const start = !st.starts ? 'Every bit of ' + att + ' helps here. '
    : st.starts <= 10 ? '+5 ' + att + ' changes nothing here. It starts helping at about +' + st.starts + '. '
    : '+5 and +10 ' + att + ' change nothing here. It starts helping at about +' + st.starts + '. ';
  return [start, st.stops && st.stops < 40
    ? 'At about +' + st.stops + ' it tops out at ' + top.pct + '% more EXP an hour' + (st.next ? ', and past that only ' + plural(st.next) + ' get faster.' : '; past that nothing changes here.')
    : '+40 is about ' + top.pct + '% more EXP an hour, and it keeps helping past that.'];
}

// Scrolls tab: where you stand, a card per slot with the three tiers priced from Cozy, and what a stat is worth.
// Item pictures from the client, the same sheet Count my loot uses (data/loot-icons.*, npm run boss:grind), loaded the
// first time the Scrolls tab draws a card; a card drawn before then gets its picture when the sheet arrives.
function itemPic(id) { const e = E('div', { class: 'b-icon', 'data-item': String(id || ''), 'aria-hidden': 'true' }); paintPic(e); return e; }
function paintPic(e) {
  const L = ui.pics, k = L && L.items[e.dataset.item] ? L.items[e.dataset.item][3] : null;
  if (k == null) return;
  e.style.backgroundImage = 'url(data/loot-icons.png)';
  e.style.backgroundPosition = -(k % L.cols) * L.cell + 'px ' + -Math.floor(k / L.cols) * L.cell + 'px';
  e.style.width = e.style.height = L.cell + 'px';
}
function loadPics() {
  if (ui.pics !== undefined) return;
  ui.pics = null;
  fetch('data/loot-icons.json').then(r => r.json()).then(L => { ui.pics = L; ui.root.querySelectorAll('.b-icon').forEach(paintPic); }, () => {});
}

function renderScrolls(g) {
  const box = ui.root.querySelector('#scrolls'), st = g.standing;
  const mobs = st ? plural(st.mob) : '', expAt = x => x > 0 ? '+' + x + '%' : 'no change';
  const say = st ? E('div', { class: 'b-here' }, 'You train best at ', E('b', {}, mobs), ': ' + (ui.data.skills[st.skill] ? ui.data.skills[st.skill].name : 'your attack') + ' takes about ',
    E('b', { class: 'num' }, st.casts.toFixed(1)), ' casts each.', E('div', { class: 'small', style: 'margin-top:6px' }, ...standingText(st))) : null;
  const cheapest = Math.min(...g.scrolls.flatMap(c => c.tiers.map(t => t.per1).filter(x => x !== null)));
  const most = Math.max(...g.scrolls.map(c => c.top));
  const cards = g.scrolls.map((c, i) => {
    const mid = c.tiers[1], name = STAT_NAME[c.stat];
    const pill = i === 0 && c.best !== null ? E('span', { class: 'b-pill' }, 'best per meso') : c.top === most ? E('span', { class: 'b-pill warm' }, 'most damage') : null;
    const row = t => E('tr', { class: t.per1 !== null && t.per1 === cheapest ? 'best' : '' },
      E('td', {}, t.cozy ? E('a', { href: 'https://cozy.markets/items/' + t.cozy, target: '_blank', rel: 'noopener' }, t.tier) : t.tier),
      E('td', { class: 'n' }, t.rate + '%'),
      E('td', { class: 'n', title: t.sales + ' sales on Cozy' }, t.price ? meso(t.price) + (t.sales < 5 ? ' few sales' : '') : 'no sales'),
      E('td', { class: 'n' }, '+' + t.expect + ' ' + (SHORT[c.stat] || name) + ' · ' + t.dmg + '%'),
      E('td', { class: 'n' }, expAt(t.exp)),
      E('td', { class: 'n' }, t.cost ? meso(t.cost) : ''),
      E('td', { class: 'n' }, t.per1 !== null ? meso(t.per1) : ''));
    return E('div', { class: 'b-scard' },
      E('div', { class: 'top' }, itemPic(c.itemId), E('div', {}, E('b', { class: 'b-slot' }, c.slot), ' ', E('span', {}, c.family.startsWith(c.slot + ' ') ? c.family.slice(c.slot.length + 1) : c.family)), pill),
      E('div', { class: 'small' }, c.slots + ' slots on your ' + c.item + '. Intermediates (60%) should add +' + mid.expect + ' ' + name +
        (st ? ', about ' + (mid.exp > 0 ? mid.exp + '% more EXP an hour at ' + mobs : 'no change at ' + mobs) : '') + '.'),
      E('table', { class: 'b-table' }, E('thead', {}, E('tr', {}, ...['Scroll', 'Odds', 'Each', "You'd expect", 'EXP an hour', 'Cost', 'Per 1%']
        .map((h, j) => E('th', { class: j ? 'n' : '' }, h)))), E('tbody', {}, c.tiers.map(row))));
  });
  const when = g.prices && new Date(g.prices.date + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const foot = E('p', { class: 'small b-foot' }, "You'd expect is the average for filling every slot. A 60% scroll fails about 4 in 10 and a 10% about 9 in 10, so if you want a clean item, plan on rebuying it.",
    when ? ' Prices from Cozy Market, ' + when + ': the usual Free Market price. Each scroll links to its page on ' : ' Each scroll links to its page on ',
    E('a', { href: 'https://cozy.markets', target: '_blank', rel: 'noopener' }, 'Cozy Market'), ', which also shows who drops it.');
  const used = g.worth.filter(w => w.d[2] > 0), idle = g.worth.filter(w => w.d[2] === 0);
  const worth = E('table', { class: 'b-table b-worth' },
    E('thead', {}, E('tr', {}, E('th', {}, ''), E('th', { class: 'n' }, '+1'), E('th', { class: 'n' }, '+5'), E('th', { class: 'n' }, '+10'),
      E('th', { class: 'n' }, st ? 'EXP an hour at ' + mobs + ', +10' : 'EXP an hour, +10'))),
    E('tbody', {}, used.map(w => E('tr', {}, E('td', {}, w.what), ...w.d.map(x => E('td', { class: 'n' }, x + '%')), E('td', { class: 'n' }, w.exp10 === null ? '' : expAt(w.exp10)))),
      idle.length ? E('tr', {}, E('td', {}, idle.map(w => w.what).join(', ')), E('td', { class: 'n' }, '0%'), E('td', { class: 'n' }, '0%'), E('td', { class: 'n' }, '0%'), E('td', { class: 'n' }, 'only for gear')) : null));
  box.replaceChildren(E('h4', { class: 'b-sec' }, 'Where you stand'), say || E('p', { class: 'small' }, 'Nothing to train on yet.'),
    E('h4', { class: 'b-sec' }, 'Start here: cheapest first'), ...(cards.length ? cards : [E('p', { class: 'small' }, 'No damage scrolls for your gear yet.')]));
  loadPics();
  box.append(foot, E('h4', { class: 'b-sec' }, 'What a stat is worth to you'), worth);
}

const TABS = [['overview', 'Overview'], ['train', 'Train'], ['paths', 'Skill paths'], ['points', 'Points'], ['gear', 'Gear'], ['scrolls', 'Scrolls']];
function showTab(t) {
  if (!TABS.some(([id]) => id === t)) t = 'overview';
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
    for (const [id] of TABS) ui.root.querySelector('#' + id).replaceChildren();
    if (g.beginner) { msg.className = 'note'; msg.textContent = 'Your 1st job starts at level ' + g.advance + '. Talk to ' + g.npc + ' then come back for a guide.'; }
    else { msg.className = 'error'; msg.textContent = g.errors.join(' '); }
    return g;
  }
  out.hidden = false;
  applyTune(g, tuneFor(g));
  const guessed = [...new Set(g.assumed.map(k => ASSUMED_LABEL[k]))];
  if (guessed.length) {
    msg.className = 'note';
    msg.replaceChildren('Guessed from your level: ' + guessed.join(', ') + '. ',
      E('button', { type: 'button', class: 'linkish', onclick: () => setOpen('b-drawer', true, 'bt.bedit') }, 'Add them'), ' for a sharper guide.');
  } else msg.replaceChildren();
  out.querySelector('#b-estimated').hidden = !g.estimated;
  renderBig(g, cls); renderOverview(g, cls); renderPanels(g); renderPaths(g, cls);
  return g;
}

// New build: a blank form in the same class for another character. Saved builds stay as they are, and Save makes a new one.
function newBuild() {
  ui.form = { cls: ui.form.cls, v: {}, s: {} };
  ui.read.clear(); ui.editing = null; ui.lastIgn = '';
  saveForm(); buildForm(); renderGuide(); renderSave();
}

// New friend's build: the same blank form, marked as someone else's character (EXP an hour isn't tuned from your sessions).
function newFriendBuild() {
  ui.form = { cls: ui.form.cls, v: {}, s: {}, from: 'friend' };
  ui.read.clear(); ui.editing = null; ui.lastIgn = '';
  saveForm(); buildForm(); renderGuide(); renderSave();
}

// Puts a build's stats into the calculator (from a saved card: from is 'mine' or 'community').
function fill(raw, clsId, from) {
  const { skills, friend, ...v } = raw || {};
  if (friend) from = 'friend';
  ui.form = { cls: CLASSES[clsId] ? clsId : ui.form.cls, v: {}, s: {}, ...(FROM.includes(from) ? { from } : {}) };
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
  // the first box a read fills makes the form the reader's; a fix typed after that stays marked edited
  if ((Object.keys(vals).length || filled.length) && ui.form.from !== 'read') { ui.form.from = 'read'; delete ui.form.edited; }
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
  // the pixels the reader is handed are already its own copy, so keeping the last one costs no extra copying
  ui.lastPic = { img, at: Date.now() };
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
  // everything is read: tuck the panel away to its status line once the share has had its say
  if (done) setTimeout(() => tuckReader(true));
  return { done };
}

// The reader panel opens under the card, with the drawer, so the boxes it fills (marked) and the ones it asks for show.
function tuckReader(tuck) {
  const panel = ui.root.querySelector('#b-reader');
  for (const sel of ['.r-area', '#r-check', '#r-msg', '#b-readnote']) { const e = panel.querySelector(sel); if (e) e.hidden = tuck; }
  const btn = ui.root.querySelector('#b-readbtn');
  btn.hidden = !tuck; btn.disabled = false;
}
function openReader() {
  const panel = ui.root.querySelector('#b-reader'), btn = ui.root.querySelector('#b-readbtn'), note = panel.querySelector('#b-readnote');
  // read again: the panel is already built, so open it back up for a fresh read
  if (ui.capture) { rd = newSession(); rd.status = ''; renderReader(); tuckReader(false); setOpen('b-drawer', true); return; }
  panel.hidden = false; setOpen('b-drawer', true);
  btn.disabled = true; note.textContent = 'Loading the reader...';
  loadReader().then(() => {
    btn.hidden = true; note.textContent = "Open your Character Stat window with DETAIL, then your Skill window, and click through your 1st and 2nd job tabs. Every box it fills is marked so you can check it. Reading happens on your computer, and your game pictures stay there unless you send one with a Something off? report.";
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
  // a friend's build keeps saying so, so EXP an hour is never tuned from your own sessions
  if (ui.form.from === 'friend') stats.friend = 1;
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
        fill(b.stats, b.class, mine ? 'mine' : 'community'); ui.root.scrollIntoView({ behavior: 'smooth' });
      } }, 'Load into calculator'),
      mine ? E('button', { type: 'button', onclick: () => { ui.editing = b; fill(b.stats, b.class, 'mine'); renderSave(); setOpen('b-save', true); ui.root.querySelector('#b-save').scrollIntoView({ behavior: 'smooth' }); } }, 'Edit') : null,
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
  ui.who = who; ui.grind = null;
  renderSave(); loadList(); renderMine(); renderGuide();
}

function mount(root, deps) {
  ui.root = root; ui.deps = deps; ui.data = deps.data; DATA = deps.data;
  ui.editing = null; ui.lastIgn = ''; ui.listGen = 0; ui.who = null; ui.filter = { cls: '', minLv: '', maxLv: '', sort: 'level' };
  loadForm();
  const editOpen = !!ui.deps.store.get('bt.bedit');
  const shut = open => open ? {} : { hidden: '' };
  const btn = (id, label, onclick, more) => E('button', { id, type: 'button', class: 'g-btn', onclick, ...more }, label);
  root.replaceChildren(E('div', { class: 'g-page b-page' },
    // the buttons down the left, like the Grind tab's
    E('aside', { class: 'g-rail', id: 'b-rail' }, E('div', { class: 'g-railin' },
      E('div', { class: 'g-box g-acts' },
        E('button', { id: 'b-readbtn', type: 'button', class: 'g-btn go', onclick: openReader }, 'Read from game'),
        btn('b-edit', 'Edit stats and skills', () => toggle('b-drawer', 'bt.bedit'), { 'aria-controls': 'b-drawer', 'aria-expanded': String(editOpen) }),
        btn('b-new', 'New build', newBuild),
        btn('b-friend', "New friend's build", newFriendBuild, { title: "For a build that isn't your character" })),
      E('div', { class: 'g-box g-acts' }, E('div', { class: 'g-boxh' }, 'Keep this character'),
        btn('b-savetoggle', 'Save build', () => toggle('b-save'), { 'aria-controls': 'b-save', 'aria-expanded': 'false' }),
        btn('b-browsetoggle', 'Community builds', () => toggle('b-browse'), { 'aria-controls': 'b-browse', 'aria-expanded': 'false' }),
        E('p', { class: 'small' }, "Save it, or see other players' builds.")))),
    E('div', { class: 'b-main' },
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
        E('div', { id: 'b-big', class: 'b-big' }),
        E('p', { id: 'b-msg' })),
      E('div', { id: 'b-reader', class: 'b-reader', hidden: '' },
        E('p', { id: 'b-readnote', class: 'small' }, 'Reads your stat and skill windows, from a shared game window or a screenshot.')),
      E('div', { id: 'b-drawer', class: 'b-drawer', ...shut(editOpen) }, E('div', { class: 'b-form' }))),
    E('section', { id: 'b-guide', hidden: '' },
      estimatedNote(),
      E('div', { class: 'b-dtabs', role: 'tablist' }, TABS.map(([id, name]) =>
        E('button', { type: 'button', role: 'tab', 'data-tab': id, 'aria-controls': id, onclick: () => showTab(id) }, name))),
      TABS.map(([id]) => E('section', { id, class: 'b-dpanel', role: 'tabpanel' }))),
    E('section', { id: 'b-save', class: 'b-panel', hidden: '' }),
    E('section', { id: 'b-browse', hidden: '' }, E('h2', {}, 'Builds'),
      E('p', { class: 'lead' }, "Other players' characters, their stats and where they train. Load one into the calculator to see its guide."),
      renderFilters(), E('div', { id: 'b-list' })))));
  showTab(ui.deps.store.get('bt.btab'));
  buildForm();
  renderGuide();
  refresh();
  // what a Something off? report carries from this tab (index.html keeps it)
  // (what Read from game filled, what it asked to be typed, and what the form turned down)
  return { report: () => ({ tab: ui.deps.store.get('bt.btab') || 'train', form: ui.form, read: rd.last, filled: [...ui.read],
    asked: [...rd.asked], bad: Object.fromEntries(rd.bad) }),
    // the last picture Read from game read, on a canvas of its own, once the share has stopped (while it runs, the
    // live frame goes instead); null when nothing was read since the page loaded
    frame: () => {
      if (!ui.lastPic || (ui.capture && ui.capture.sharing())) return null;
      const { img, at } = ui.lastPic, c = document.createElement('canvas');
      c.width = img.w; c.height = img.h;
      c.getContext('2d').putImageData(new ImageData(img.data, img.w, img.h), 0, 0);
      return { canvas: c, at };
    } };
}
const estimatedNote = () => E('p', { id: 'b-estimated', class: 'b-badge', hidden: '' }, E('b', {}, 'Estimated. '), "Damage for this weapon comes from meowdb's table and hasn't been checked against a real stat window yet.");

window.Builds = { comparePaths, PATHS, tuneSeconds, EXP_TABLE, STEP_SEC, expHour, hoursTo, healRange, HEAL, standingText, KILL_GAP, CLASSES, BRANCHES, branchOf, weaponsFor, mastery, physRange, spellRange, weaponAttackFromMax, WEAPONS, CHECKED_WEAPONS, windowRange, levelScale, hitChance, defend, elemMult, makeRng, castsToKill,
  validateStats, rankMobs, buildGuide, pointsPlan, mount, fill, refresh, shrinkImage, take, classOf };
})();
