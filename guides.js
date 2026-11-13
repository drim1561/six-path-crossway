// Guides tab (#guides): the Mage guide that tools/make-guides.js writes into data/guides.json, drawn with the page's el.
// Every number is already in the data; this file only lays it out and remembers which roads are lit.
// window.Guides = { mount, swapPick }
(function () {
'use strict';

// A job with a pick shows two roads at a time: tapping an unlit one lets the older lit one go
const swapPick = (lit, id) => lit.includes(id) ? lit : [lit[1], id];

// the Planner's K rule (Builds.money isn't loaded here): 48K, 112K, 1.2M
const k = n => n >= 999500 ? +(n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'K' : String(n);
// hours: a tenth under 10 (the Magician run's 9.1), whole from 10, so 59.5 and 59.6 both read 60
const hrs = h => h < 10 ? String(Math.round(h * 10) / 10) : String(Math.round(h));
const span = (a, b) => a === b ? String(a) : a + ' to ' + b;

function mount(root, { el, data, job, onJob }) {
  const G = data.guides.mage, jobs = G.roadmap.jobs;
  const jobOf = id => jobs.find(j => j.id === id);
  const order = id => jobOf(id).roads.map(r => r.id);   // road map order, fastest first
  const lit = {};
  for (const j of jobs) lit[j.id] = (G.pick[j.id] || order(j.id)).slice();
  let pending = null;   // the column a road map link asked for, scrolled to once its job shows

  const small = (...t) => el('small', { class: 'small' }, ...t);
  const out = (href, text) => el('a', { href, target: '_blank', rel: 'noopener' }, text);
  const credit = c => !c ? [] : c.parts.flatMap((p, i) => [i ? ' and ' : '', p.link ? out(p.link, p.text) : p.text]);
  const row = (...kids) => el('div', { class: 'k-row' }, ...kids);
  const group = (cls, title, rows) => el('div', { class: 'gd-group ' + cls }, el('h3', { class: 'gd-h' }, title), el('div', { class: 'k-rows' }, rows));

  // One road's column for a band: where to train, AP, points, gear, then the hours and Lemons to the band's end
  function column(band, c, id) {
    const t = c.train, attrs = { class: 'gd-col' };
    if (id) attrs.id = id;
    if (c.road) attrs['data-road'] = c.road;
    const train = t.stages.map(s => row(el('span', { class: 'gd-lv' }, span(s.from, s.to)), el('span', {}, s.mob, ' ', small(s.map)), el('span', {}, k(s.expHour), ' ', small('an hour'))));
    if (t.tryNext) train.push(row(el('span', { class: 'gd-lv' }, 'Worth a try'), el('span', {}, t.tryNext.name, ' ', small(t.tryNext.map)), el('span', {}, small('level ' + t.tryNext.level))));
    return el('div', attrs,
      el('div', { class: 'gd-head' }, el('h3', {}, c.name), c.credit ? el('p', { class: 'small' }, credit(c.credit)) : null),
      group('gd-train', 'Where to train', train),
      group('gd-ap', 'Ability points', c.ap.map(a => row(el('span', { class: 'gd-lv' }, span(a.from, a.to)), el('span', { class: 'gd-txt' }, a.text)))),
      group('gd-points', 'Skill points', c.points.map(p => row(el('span', { class: 'gd-lv' }, span(p.from, p.to)), el('span', { class: 'gd-txt' }, p.text)))),
      // what the band starts in, with the weapon it reaches as a Then row under the weapon
      group('gd-gear', 'Gear', c.gear.map(g => row(el('span', { class: 'gd-lv' }, g.up ? 'Then' : g.slot), el('span', {}, g.cozy ? out('https://cozy.markets/items/' + g.cozy, g.name) : g.name), el('span', {}, small('level ' + g.level))))),
      el('div', { class: 'gd-tiles' },
        el('div', { class: 'k-card gd-tile' }, el('div', { class: 'k' }, 'Hours to ' + band.to), el('div', { class: 'v' }, hrs(c.hours))),
        c.lemons == null ? null : el('div', { class: 'k-card lemon gd-tile' }, el('div', { class: 'k' }, 'Lemons to ' + band.to), el('div', { class: 'v' }, k(c.lemons)))));
  }
  const bandWin = (band, sub) => el('section', { class: 'k-win gd-band', 'data-from': band.from, ...(band.job ? { 'data-job': band.job } : {}) },
    el('div', { class: 'k-bar' }, el('h2', {}, span(band.from, band.to)), small(sub)),
    el('div', { class: 'k-pad' }, el('div', { class: 'gd-cols' })));

  // a job's band columns: its lit roads in road map order, the id only on its first band so ids stay unique
  const jobBands = {};
  function fill(j) {
    const roads = order(j).filter(r => lit[j].includes(r));
    jobBands[j].forEach(({ band, win }, i) => win.querySelector('.gd-cols').replaceChildren(
      ...roads.map(r => column(band, band.columns.find(c => c.road === r), i ? null : 'gd-col-' + j + '-' + r))));
  }
  function scrollTo(id) {
    const c = document.getElementById(id);
    if (!c) return;
    const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    c.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
  }

  // the road map: the Magician run, then each job's roads to 50, fastest first, with the spread in one line
  const spread = j => {
    const h = j.roads.map(r => Math.round(r.hours)), lo = Math.min(...h), hi = Math.max(...h), n = j.roads.length;
    return 'From 30 to 50: ' + (n === 1 ? 'one road, ' + lo + ' hours' : n + ' roads, ' + (lo === hi ? 'about ' + lo + ' hours each' : lo + ' to ' + hi + ' hours'));
  };
  const first = G.roadmap.first;
  const map = el('section', { id: 'gd-map', class: 'k-win' },
    el('div', { class: 'k-bar' }, el('h2', {}, 'Road map'), small('hours of grinding at a typical pace')),
    el('div', { class: 'k-pad' },
      el('div', { class: 'k-rows' }, el('div', { class: 'k-row gd-first' },
        el('span', {}, first.name), el('span', {}, small('every Mage, ' + span(first.from, first.to))), el('span', {}, hrs(first.hours) + ' h'))),
      el('div', { class: 'gd-jobs' }, jobs.map(j => el('div', { class: 'k-card gd-job' },
        el('h3', {}, j.name), el('p', { class: 'small' }, spread(j)),
        el('div', { class: 'k-rows' }, j.roads.map(r => row(
          el('a', { href: '#gd-col-' + j.id + '-' + r.id, onclick: e => { e.preventDefault(); go(j.id, r.id); } }, r.name),
          el('span', { class: 'gd-rh' }, hrs(r.hours) + ' h', r.lemons == null ? null : small(k(r.lemons) + ' Lemons')))))))),
      el('p', { id: 'gd-foot', class: 'small k-foot' }, G.foot)));
  function go(j, r) {
    if (G.pick[j] && !lit[j].includes(r)) { lit[j] = swapPick(lit[j], r); fill(j); if (j === job) pills(); }
    pending = 'gd-col-' + j + '-' + r;
    if (j === job) { scrollTo(pending); pending = null; } else onJob(j);
  }

  // the switch: three jobs, the job's line, where its roads part, and the pick for a job with more than two roads
  const switchRow = el('div', { id: 'gd-switch', class: 'gd-switch k-tools' }, jobs.map(j => el('button', { type: 'button', class: 'k-btn', 'data-job': j.id, onclick: () => onJob(j.id) }, j.name)));
  const jobLine = el('p', { id: 'gd-jobline' }), split = el('p', { class: 'gd-split small' });
  const pick = el('div', { id: 'gd-pick', class: 'k-tools' });
  function pills() {
    const roads = jobOf(job).roads;
    pick.replaceChildren(el('span', { class: 'small' }, 'Two roads side by side, tap another to swap it in:'),
      ...roads.map(r => el('button', { type: 'button', class: 'k-btn sm gd-pill', 'data-road': r.id, 'aria-pressed': String(lit[job].includes(r.id)), onclick: () => {
        if (lit[job].includes(r.id)) return;
        lit[job] = swapPick(lit[job], r.id); fill(job);
        for (const b of pick.querySelectorAll('.gd-pill')) b.setAttribute('aria-pressed', String(lit[job].includes(b.dataset.road)));
      } }, r.name, ' ', small(hrs(r.hours) + ' h'))));
  }

  const magician = G.bands.filter(b => !b.job).map((b, i) => {
    const win = bandWin(b, 'Magician');
    win.querySelector('.gd-cols').append(column(b, b.columns[0], i ? null : 'gd-col-magician'));
    return win;
  });
  const bands = [];
  for (const j of jobs) {
    jobBands[j.id] = G.bands.filter(b => b.job === j.id).map(band => ({ band, win: bandWin(band, j.name) }));
    for (const { win } of jobBands[j.id]) bands.push(win);
    fill(j.id);
  }

  root.replaceChildren(
    el('section', { class: 'k-win' }, el('div', { class: 'k-bar' }, el('h2', { id: 'gd-title' }, G.title)), el('div', { class: 'k-pad' }, el('p', { id: 'gd-intro', class: 'gd-lead' }, G.intro))),
    map,
    el('section', { id: 'gd-start', class: 'k-win' }, el('div', { class: 'k-bar' }, el('h2', {}, G.start.heading)), el('div', { class: 'k-pad' }, el('p', {}, G.start.text))),
    ...magician,
    el('section', { class: 'k-win gd-pickwin' }, el('div', { class: 'k-bar' }, el('h2', {}, 'Your 2nd job at 30')), el('div', { class: 'k-pad' }, switchRow, jobLine, split, pick)),
    ...bands);

  function show(j) {
    job = j;
    for (const b of switchRow.children) b.setAttribute('aria-pressed', String(b.dataset.job === j));
    jobLine.textContent = jobOf(j).line;
    split.textContent = G.split[j] || ''; split.hidden = !G.split[j];
    pick.hidden = !G.pick[j];
    if (G.pick[j]) pills(); else pick.replaceChildren();
    for (const w of bands) w.hidden = w.dataset.job !== j;
  }
  show(jobOf(job) ? job : jobs[0].id);

  return {
    // the hash's job; called on every showView, so it does nothing when the job is the same
    setJob(j) {
      if (jobOf(j) && j !== job) show(j);
      if (pending) { const id = pending; pending = null; scrollTo(id); }
    },
  };
}

window.Guides = { mount, swapPick };
})();
