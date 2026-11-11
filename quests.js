// Quests tab logic (no DOM): which quest rewards are worth a character right now, worded as a row.
// window.Quests = { plan, lookOut, stamp }
(function () {
'use strict';

const money = n => window.Builds.money(n);
const plural = n => window.Builds.plural(n);
const WEAPON_STEMS = new Set([...Object.keys(window.Builds.WEAPONS), 'Wand', 'Staff']);

const TIER_PCT = { Lesser: '100%', Intermediate: '60%', Greater: '10%' };
const tierText = t => TIER_PCT[t] || t;

const isGear = it => it.lv !== undefined;
const isScroll = it => it.fam !== undefined;

const uniq = list => { const out = []; for (const x of list) if (!out.includes(x)) out.push(x); return out; };
// English list join, Oxford-comma-less: a; a and b; a, b and c; ...
const joinWord = (list, word) => list.length <= 1 ? (list[0] || '') : list.slice(0, -1).join(', ') + ' ' + word + ' ' + list[list.length - 1];
// Up to 3 names, then "and N more".
const joinNames = names => names.length <= 3 ? joinWord(names, 'and') : names.slice(0, 3).join(', ') + ' and ' + (names.length - 3) + ' more';

function stepApplies(s, me, now) {
  if (s.jobs && s.jobs.length && !s.jobs.includes(me.job)) return false;
  if (s.start && now < s.start) return false;
  if (s.end && now >= s.end) return false;
  return true;
}

// A reward applies when it has no job or job & (mask*2), and its item isn't gear with a job that misses the mask.
function rewardApplies(r, item, me) {
  if (r.job && !(r.job & (me.mask * 2))) return false;
  if (isGear(item) && item.job && !(item.job & me.mask)) return false;
  return true;
}

// Trusted price: p when src !== 'sold3d' || s >= 5, else 0. Returns null when there is no price at all.
function trusted(item) {
  if (item.p == null) return null;
  return { price: item.p, trusted: item.src !== 'sold3d' || item.s >= 5 };
}
const trustedValue = item => { const t = trusted(item); return t && t.trusted ? t.price : 0; };

// value: given sums, pick takes the best, random weights each by prop / (sum of this step's props + other).
function computeValue(step, survivors, items) {
  if (step.kind === 'given') return items.reduce((s, it) => s + trustedValue(it), 0);
  if (step.kind === 'pick') return Math.max(...items.map(trustedValue));
  const other = step.other || 0;
  const props = survivors.map(r => r.prop != null ? r.prop : 1);
  const denom = props.reduce((a, b) => a + b, 0) + other;
  return survivors.reduce((sum, r, i) => sum + trustedValue(items[i]) * (props[i] / denom), 0);
}

function noPriceFallback(items) {
  if (items.every(isGear)) { const lvs = items.map(it => it.lv); return 'lv ' + Math.min(...lvs) + ' to ' + Math.max(...lvs); }
  return 'no price';
}

// A list's right side uses priced rewards: 2 read "349K or 1.4M" low first, 1 of 2 reads "349K or no price",
// 3+ read "10K to 320K"; a list with no prices reads the lv range for gear, "no price" for scrolls.
function rightForList(items) {
  const priced = items.map(it => { const t = trusted(it); return t && t.trusted ? t.price : null; });
  const good = priced.map((p, i) => p != null ? i : -1).filter(i => i >= 0);
  const gearPriced = good.some(i => isGear(items[i]));
  if (items.length === 2) {
    if (good.length === 2) { const vals = good.map(i => priced[i]).sort((a, b) => a - b); return { right: money(vals[0]) + ' or ' + money(vals[1]), gearPriced }; }
    if (good.length === 1) return { right: money(priced[good[0]]) + ' or no price', gearPriced };
    return { right: noPriceFallback(items), gearPriced: false };
  }
  if (good.length >= 2) { const vals = good.map(i => priced[i]); return { right: money(Math.min(...vals)) + ' to ' + money(Math.max(...vals)), gearPriced }; }
  if (good.length === 1) return { right: money(priced[good[0]]), gearPriced };
  return { right: noPriceFallback(items), gearPriced: false };
}

// One scroll: "349K", "66K, few sales" (priced but can't be trusted) or "no price". One gear: its price or "lv 50".
function singleRight(it) {
  const t = trusted(it);
  if (!t) return { right: isGear(it) ? 'lv ' + it.lv : 'no price', gearPriced: false };
  if (t.trusted) return { right: money(t.price), gearPriced: isGear(it) };
  return { right: money(t.price) + ', few sales', gearPriced: false };
}

function nameOf(it) { return isGear(it) ? it.n : isScroll(it) ? it.fam + ' ' + tierText(it.tier) : it.n; }

function titleRight(step, items) {
  if (items.length === 1) { const { right, gearPriced } = singleRight(items[0]); return { title: nameOf(items[0]), right, gearPriced }; }

  if (step.kind === 'given') {
    const sum = items.reduce((s, it) => s + trustedValue(it), 0);
    const trustedIdx = items.map((it, i) => { const t = trusted(it); return t && t.trusted ? i : -1; }).filter(i => i >= 0);
    const gearPriced = trustedIdx.some(i => isGear(items[i]));
    return { title: joinWord(items.map(nameOf), 'and'), right: money(sum), gearPriced };
  }

  const { right, gearPriced } = rightForList(items);

  const allGear = items.every(isGear), allScroll = items.every(isScroll);
  let core, isCountForm = false;
  if (allGear) {
    if (items.length === 2) { core = items[0].n + ' or ' + items[1].n; }
    else {
      const slots = items.map(it => it.slot);
      core = slots.every(s => s === slots[0]) ? items.length + ' ' + plural(slots[0].toLowerCase()) : items.length + ' items';
      isCountForm = true;
    }
  } else if (allScroll) {
    const stems = uniq(items.map(it => it.stem)), stats = uniq(items.map(it => it.stat)), tiers = uniq(items.map(it => it.tier));
    const weaponLike = stems.every(s => WEAPON_STEMS.has(s));
    if (stems.length === 1) {
      const stem = stems[0];
      if (stats.length === 1) { core = stem + ' ' + stats[0] + ' ' + joinWord(tiers.map(tierText), 'or'); }
      else if (stats.length === 2) {
        core = tiers.length === 1
          ? stem + ' ' + stats[0] + ' or ' + stats[1] + ' ' + tierText(tiers[0])
          : stem + ' ' + stats[0] + ' or ' + stats[1] + ', ' + joinWord(tiers.map(tierText), 'or');
      } else { core = items.length + ' ' + stem.toLowerCase() + ' ' + tierText(tiers[0]) + 's'; isCountForm = true; }
    } else if (weaponLike && items.length === 2 && stats.length === 1 && tiers.length === 1) {
      core = stems[0] + ' or ' + stems[1] + ' ' + tierText(tiers[0]);
    } else if (weaponLike && items.length >= 3 && tiers.length === 1) {
      core = items.length + ' weapon ' + tierText(tiers[0]) + 's'; isCountForm = true;
    } else { core = items.length + ' scrolls'; isCountForm = true; }
  } else { core = items.length + ' items'; isCountForm = true; }

  const title = step.kind === 'pick' ? 'Your pick of ' + core : (isCountForm ? 'One of ' + core : core);
  return { title, right, gearPriced };
}

// Added to say: a random list holding me.weapon notes how many in how many; a step with other notes the chance.
function buildSay(step, survivors, items, me) {
  let say = step.say;
  if (step.kind === 'random') {
    const n = items.filter(it => it.stem === me.weapon).length;
    if (n > 0) say += ' ' + n + ' in ' + items.length + ' ' + (n === 1 ? 'is a' : 'are') + ' ' + me.weapon + ' scroll' + (n === 1 ? '' : 's') + '.';
  }
  if (step.other) {
    const props = survivors.map(r => r.prop != null ? r.prop : 1), sum = props.reduce((a, b) => a + b, 0);
    say += ' ' + sum + ' in ' + (sum + step.other) + ' chance.';
  }
  return say;
}

function stepRow(step, Q, me) {
  const survivors = (step.rewards || []).filter(r => { const it = Q.items[r.id]; return it && rewardApplies(r, it, me); });
  if (!survivors.length) return null;
  const items = survivors.map(r => Q.items[r.id]);
  const value = computeValue(step, survivors, items);
  const allGear = items.every(isGear), allScroll = items.every(isScroll);
  if (allGear && Math.max(...items.map(it => it.lv)) < me.level - 10) return null;
  if (allScroll && value > 0 && value < 10000) return null;
  const { title, right, gearPriced } = titleRight(step, items);
  const say = buildSay(step, survivors, items, me);
  const pricedIdx = items.map((it, i) => it.p != null ? i : -1).filter(i => i >= 0);
  const link = pricedIdx.length === 1 && items[pricedIdx[0]].c != null ? items[pricedIdx[0]].c : null;
  const gearLv = items.some(isGear) ? Math.max(...items.filter(isGear).map(it => it.lv)) : -Infinity;
  const who = typeof step.npc === 'string' ? step.npc : nameFromSay(step.say);
  return { row: { id: step.id, at: step.lv, title, right, say, pic: survivors[0].id, value, link, gearPriced, who }, gearLv };
}

// plan(Q, me, now) -> { open: Row[], soon: Row[], wanting: Step[] }
// me.done (optional Set of step ids) skips those steps, so they are in none of the three.
function plan(Q, me, now) {
  const openEntries = [], soonEntries = [], wanting = [];
  for (const step of Q.steps) {
    if (me.done && me.done.has(step.id)) continue;
    if (!stepApplies(step, me, now)) continue;
    if (step.wants && step.wants.length && step.lv <= me.level + 5) wanting.push(step);
    const entry = stepRow(step, Q, me);
    if (!entry) continue;
    if (step.lv <= me.level) openEntries.push(entry);
    else if (step.lv <= me.level + 5) soonEntries.push(entry);
  }
  const cmp = (a, b) => (b.row.value - a.row.value) || (b.gearLv - a.gearLv) || (a.row.id - b.row.id);
  openEntries.sort(cmp); soonEntries.sort(cmp);
  return { open: openEntries.map(e => e.row), soon: soonEntries.slice(0, 3).map(e => e.row), wanting };
}

// lookOut(wanting, Q, mobs, dropsMobs) -> [{ pic, title, right, say }], up to 3, most wanted first.
function lookOut(wanting, Q, mobs, dropsMobs) {
  const totals = {}, names = {};
  for (const step of wanting) {
    const name = typeof step.npc === 'string' ? step.npc : nameFromSay(step.say);
    for (const [id, count] of step.wants) {
      totals[id] = (totals[id] || 0) + count;
      if (!names[id]) names[id] = [];
      if (!names[id].includes(name)) names[id].push(name);
    }
  }
  const results = [];
  for (const [id, total] of Object.entries(totals)) {
    const drops = [];
    for (const mob of mobs) { const list = dropsMobs[mob.id]; if (list && list.includes(+id)) drops.push(mob.name); }
    if (!drops.length) continue;
    const item = Q.items[id];
    results.push({ pic: +id, title: item ? item.n : '', right: 'x' + total, say: joinNames(uniq(drops).map(plural)) + ' drop them. ' + joinNames(names[id]) + ' want them.', total });
  }
  results.sort((a, b) => b.total - a.total);
  return results.slice(0, 3).map(({ total, ...r }) => r);
}

function nameFromSay(say) {
  const m = say.match(/^(.*?)(?:\.| in )/);
  return m ? m[1] : say;
}

// stamp(date) -> 'YYYYMMDDHHmm' in local time.
function stamp(date) {
  const p2 = n => String(n).padStart(2, '0');
  return '' + date.getFullYear() + p2(date.getMonth() + 1) + p2(date.getDate()) + p2(date.getHours()) + p2(date.getMinutes());
}

window.Quests = { plan, lookOut, stamp };
})();
