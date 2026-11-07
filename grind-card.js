// This run, the session card at the top of Session details (a Trail Signs Window): where a run ranks among your own runs at
// that map. First model, pure functions that turn the standings (GrindSession.standing) into what the card says; then
// build, which draws it.
// window.GrindCard = { ordinal, model, build }
(function () {
'use strict';

const BEST_MIN = 10;   // minutes a run needs before it can rank (GrindSession's own floor)

const ordinal = n => {
  const t = n % 100, s = ['th', 'st', 'nd', 'rd'][t >= 11 && t <= 13 ? 0 : n % 10 < 4 ? n % 10 : 0];
  return n + s;
};
const dateOf = ms => ms ? new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

// q = { live, map, mins, gained, levelFrom, levelTo, exp, mesos, verdict, pot, potName, lemon, meat, fmtK, fmtDur, fmtPer }
// exp, mesos and pot are GrindSession.standing results (or null), lemon and meat are { n, quip }, gained the run's EXP.
// fmtPer is the page's one rule for potions per 1% (Grind.perFmt).
// -> { badge, title, sub, bar, of, line, tabs: [{ key, label, mine, usual, vs, rows: [{ label, note, value, lit, rank }], verdict, line }], lemon, meat }
function model(q) {
  const exp = q.exp || { value: null, rank: null, of: 0, best: null, usual: null };
  const place = exp.rank == null ? null : exp.rank;
  const short = q.mins < BEST_MIN;
  const title = place == null ? (short ? 'A short run, so no rank yet' : q.gained > 0 ? 'No rank yet at ' + q.map : 'A run with no EXP at ' + q.map)
    : exp.of <= 1 ? 'Your first run at ' + q.map
    : place === 1 ? 'Your best run at ' + q.map + ' yet'
    : 'Your ' + ordinal(place) + ' best run at ' + q.map;
  const lv = q.levelFrom == null ? '' : q.levelTo != null && q.levelTo !== q.levelFrom ? 'Lv ' + q.levelFrom + ' to ' + q.levelTo : 'Lv ' + q.levelFrom;
  const sub = [q.live ? 'So far' : 'Session done', q.mins != null ? q.fmtDur(q.mins) : '', lv, exp.of > 1 ? 'out of ' + exp.of + ' runs here' : ''].filter(Boolean).join(' · ');

  // the potion tab's number is whole (grind.js hands in its own perFmt, so there is one rule for it)
  const fmtPer = q.fmtPer || String;
  const tab = (key, label, st, fmtV, lower, why) => {
    const mine = st && st.value != null ? st.value : null, best = st && st.best, usual = st && st.usual != null ? st.usual : null;
    const rows = [];
    // this run is the best: the "best" row would be the second best, so it is left out
    if (best && !(mine != null && st.rank === 1)) rows.push({ label: 'Your best', note: dateOf(best.t), value: fmtV(best.v) });
    if (mine != null) rows.push({ label: 'This run', note: '', value: fmtV(mine), lit: true, rank: st.rank });
    if (usual != null) rows.push({ label: 'Your usual', note: '', value: fmtV(usual) });
    // the arrow against your usual (under 2% is no arrow); for potions per 1% lower is the good way
    const d = mine != null && usual ? mine / usual - 1 : null;
    const vs = d != null && Math.abs(d) >= 0.02 ? { up: d > 0, good: lower ? d < 0 : d > 0, text: (d > 0 ? '▲' : '▼') + Math.round(Math.abs(d) * 100) + '%' } : null;
    const line = mine == null ? why : !best ? 'This run sets the bar for ' + q.map + '.' : '';
    return { key, label, mine: mine == null ? null : fmtV(mine), usual: usual == null ? null : fmtV(usual), vs, rows, verdict: null, line };
  };
  const sign = n => (n < 0 ? '−' : n > 0 ? '+' : '') + q.fmtK(Math.abs(n));
  const tabs = [tab('exp', 'EXP an hour', q.exp, q.fmtK, false, 'Needs ' + BEST_MIN + ' minutes from the first kill to rank.'),
    tab('mesos', 'Mesos', q.mesos, sign, false, 'Needs ' + BEST_MIN + ' minutes of counted mesos to rank.')];
  tabs[1].verdict = q.verdict || null;
  if (q.pot && q.potName) tabs.push(tab('pot', q.potName + ' per 1%', q.pot, fmtPer, true, 'Needs ' + BEST_MIN + ' minutes and a whole 1% of EXP to rank.'));
  // sub is the whole line; bar is what the title bar says (the same without how many runs) and of what sits under the rank ring
  const bar = [q.live ? 'So far' : 'Session done', q.mins != null ? q.fmtDur(q.mins) : '', lv].filter(Boolean).join(' · ');
  return { badge: place == null ? null : '#' + place, title, sub, bar, of: exp.of > 1 ? 'out of ' + exp.of + ' runs here' : '', line: place == null && short ? 'Runs under ' + BEST_MIN + ' minutes are not ranked.' : '', tabs, lemon: q.lemon || { n: 0, quip: '' }, meat: q.meat || { n: 0, quip: '' } };
}

/* ---------- the card ---------- */

// build({ el, pics, whole }): el is the page's element maker, pics = { lemon, meat } data URLs or null, whole the strip of the whole
// session (a node the page keeps drawing), which sits under the comparison. A Window: "This run" and the one line in its title bar,
// a ring holding the rank (gold) or nothing (brown) with the title and the three tabs as small signs, a Card with this run against
// your usual and plain rows beside it, the strip, then the Lemon and Meat tiles.
// update(model | null): each part keeps what it last drew and draws again only when its text changes, so a live frame changes
// numbers in place.
function build({ el, pics, whole }) {
  const arrow = (node, text) => { if (window.PixelIcons) window.PixelIcons.arrowed(node, text); else node.textContent = text; };
  const barSub = el('small', {});
  const rank = el('span', { class: 'k-ring big g-sc-rank' }), title = el('h3', { class: 'g-sc-title' }), of = el('p', { class: 'g-sc-sub' });
  const tabsBox = el('div', { class: 'g-sc-tabs', role: 'tablist' }), panel = el('div', { class: 'g-sc-panel', role: 'tabpanel' });
  const pots = el('div', { class: 'g-sc-pots' });
  const card = el('section', { class: 'k-win g-sc', id: 'g-scard', hidden: '', 'aria-label': 'Where this run ranks' },
    el('div', { class: 'k-bar' }, el('h2', {}, 'This run'), barSub),
    el('div', { class: 'k-pad g-sc-body' },
      el('div', { class: 'g-sc-head' }, rank, el('div', { class: 'g-sc-hd' }, title, of), tabsBox), panel, whole || null, pots));

  const drawn = {};
  const changed = (part, ...now) => { const k = JSON.stringify(now); if (drawn[part] === k) return false; drawn[part] = k; return true; };
  let picked = 'exp', last = null, shape = null;

  const pickTab = key => { picked = key; if (last) draw(last); };
  const lit = () => { for (const b of tabsBox.children) { const on = b.dataset.key === picked; b.setAttribute('aria-selected', String(on)); b.classList.toggle('on', on); b.classList.toggle('key', on); } };
  function drawTabs(m) {
    if (changed('tabs', m.tabs.map(t => t.key + t.label))) tabsBox.replaceChildren(...m.tabs.map(t => el('button', { type: 'button', role: 'tab', class: 'k-btn sm g-sc-tab', 'data-key': t.key, onclick: () => pickTab(t.key) }, t.label)));
    lit();
  }
  const span = (cls, text) => el('span', { class: cls }, text);
  function drawPanel(t, m) {
    // the shape: what is drawn, apart from the numbers in it. The same shape is patched in place
    const sig = JSON.stringify([t.key, t.rows.map(r => r.label + (r.lit ? '*' : '')), t.usual == null, !!t.verdict, !!t.vs, t.line, m.line]);
    if (shape !== sig) {
      shape = sig;
      const big = el('div', { class: 'k-card g-sc-big' }, el('div', {}, span('n gold', ''), el('small', {}, 'this run')),
        t.usual != null ? el('div', { class: 'vs' }, 'vs') : null, t.usual != null ? el('div', {}, span('n', ''), el('small', {}, 'your usual')) : null,
        t.vs ? el('span', { class: 'g-sc-vs' }) : null,
        t.verdict ? el('div', { class: 'g-sc-verdict ' + (t.verdict === 'Profitable' ? 'up' : 'down') }, t.verdict) : null);
      const list = el('div', { class: 'k-rows g-sc-list' }, t.rows.map(r => el('div', { class: 'k-row' + (r.lit ? ' you' : '') },
        el('span', { class: 'lbl' }, r.label, r.note ? el('small', {}, r.note) : null), span('n', ''))));
      const note = t.line || m.line;
      panel.replaceChildren(el('div', { class: 'g-sc-cmp' }, big, t.rows.length ? list : null), ...(note ? [el('p', { class: 'g-sc-line' }, note)] : []));
      panel.setAttribute('aria-label', t.label);
    }
    const ns = panel.querySelectorAll('.g-sc-big .n');
    const set = (node, v) => { if (node.textContent !== v) node.textContent = v; };
    set(ns[0], t.mine == null ? '·' : t.mine);
    if (ns[1]) set(ns[1], t.usual);
    const vs = panel.querySelector('.g-sc-vs');
    if (vs && vs.dataset.t !== (t.vs ? t.vs.text : '')) { vs.dataset.t = t.vs ? t.vs.text : ''; vs.className = 'g-sc-vs ' + (t.vs && t.vs.good ? 'up' : 'down'); arrow(vs, t.vs ? t.vs.text : ''); }
    panel.querySelectorAll('.g-sc-list .k-row').forEach((li, i) => set(li.querySelector('.n'), t.rows[i].value));
  }
  const potTile = (kind, down, pic, g) => el('div', { class: 'k-card g-sc-pot ' + kind },
    el('span', { class: 'k-ring' }, pic ? el('img', { src: pic, alt: '' }) : null),
    el('div', {}, span('n', String(Math.round(g.n))), el('small', {}, g.n ? down : '', g.n && g.quip ? ' · ' : '', g.quip)));

  function draw(m) {
    const t = m.tabs.find(x => x.key === picked) || m.tabs[0];
    if (t.key !== picked) picked = t.key;
    if (changed('head', m.badge, m.title, m.bar, m.of)) {
      rank.classList.toggle('gold', !!m.badge); rank.textContent = m.badge || ''; title.textContent = m.title; of.textContent = m.of; of.hidden = !m.of; barSub.textContent = m.bar;
    }
    drawTabs(m);
    drawPanel(t, m);
    if (changed('pots', m.lemon, m.meat, !!pics.lemon, !!pics.meat)) pots.replaceChildren(potTile('lemon', 'Lemons down', pics.lemon, m.lemon), potTile('meat', 'Meat eaten', pics.meat, m.meat));
  }
  function update(m) {
    last = m;
    if (card.hidden !== !m) card.hidden = !m;
    if (!m) { for (const k of Object.keys(drawn)) delete drawn[k]; shape = null; return; }
    draw(m);
  }
  return { el: card, update };
}

window.GrindCard = { ordinal, model, build };
})();
