// The Grind tab as one window (2026-11-24 in the Six Path Overlay app, on the site too since 2026-11-26): grind.js builds the nodes
// and hands them in; this only lays them out. Top to bottom: the walking strip, one bar (2026-11-25:
// the map's pick with the light and the run's length under it, EXP an hour, Profit an hour, the run buttons, a thin rule, then
// Settings and Quit as icon squares), the first time steps and the lines that need you (never the bag's Equip, Use, Etc rows: the
// overlay asks for the bag), then Drops here beside What you picked up (each scrolls by itself and keeps at least 280px, a window
// too short for that scrolls the page), a quiet More row, and the small print.
// window.GrindAppView.build({ el, parts, more, K, pic }) -> { el, update(state), live({ len, profit, tone }), open(key) }
//   parts = { strip, where, nums, share, pop, set, quit, runs, steps, view, lines, loot, foot }: grind.js's own nodes (loot is What you picked up's
//   block, cls the class picker for the Drops here head (null in the app), view the bar over a run being looked at (Back to live, Delete: it joins the buttons, the line names the run), foot the tab's own small print, which joins the drops' credit)
//   more = [{ key, label, el, show }]: blocks that open one at a time in place of the panes (show() runs as one opens; a hidden
//   el is not offered)
//   state = { session, sharing, noMap, mobs, D, cls, level, lootOn, log, total, ended }, ended = null | { empty: true, onNew } (a
//   run with no EXP ended: an idle window) | { id, head, expHr, profit, tone, small, lemons, title, lemon, rows: [{ label, value, sub, tone }], sold, onNew } (onNew
//   only for the run that just ended; null for a saved one)
(function () {
'use strict';

const COZY = 'https://cozy.markets/items/';
const fmt = n => Math.round(n).toLocaleString('en-US');
const FLOOR = 280;   // each list keeps at least this much (Rimmah, 2026-11-25)

function build({ el, parts, more, K, pic }) {
  const N = window.GrindNow;
  const strip = el('div', { class: 'ga-strip' }, parts.strip);
  const lbl = parts.where && parts.where.querySelector('h2');
  if (lbl) lbl.classList.add('ga-lbl');   // Now grinding, or Run ended at 12:08 PM
  // after End run the line keeps the run's final numbers here (the live number card stops drawing once a run is being looked at)
  const endBig = el('b', { class: 'g-gbig' }), endSmall = el('span', { class: 'g-gsmall' });
  const endNums = el('div', { class: 'ga-endnums', hidden: '' }, el('div', { class: 'g-gleadrow' }, endBig, el('span', { class: 'g-glbl' }, 'EXP an hour'), endSmall));
  // Profit an hour beside EXP an hour: live from grind.js (live()), the run's own once it has ended
  const profBig = el('b', { class: 'g-gbig' });
  const profit = el('div', { class: 'ga-profit', hidden: '' }, profBig, el('span', { class: 'g-glbl' }, 'Profit an hour'));
  const startBtn = el('button', { type: 'button', class: 'k-btn key', id: 'ga-startrun', hidden: '', onclick: () => { open(null); if (last && last.ended) last.ended.onNew(); } }, 'Start a new run');
  // the run's length beside the light, under the map's pick
  const len = el('span', { class: 'ga-len' });
  const lamp = parts.where && parts.where.querySelector('.push');
  if (lamp) lamp.append(len);
  const where = el('div', { class: 'ga-where' }, parts.where);
  // Settings and Quit as icon squares: the words stay for screen readers, and name the square on hover
  const ico = b => { if (!b) return null; const t = b.textContent.trim(); b.title = t; b.setAttribute('aria-label', t); b.classList.add('ga-ico'); return b; };
  const icons = [ico(parts.set), ico(parts.quit)].filter(Boolean);
  // New run and End run are bark buttons here, the same as Stop (on the site they're plain words)
  if (parts.runs) for (const b of parts.runs.querySelectorAll('button')) b.classList.add('k-btn');
  // Show the overlay reads Overlay so the bar keeps one row at 953: "Show the" stays for screen readers and hover
  const popWords = parts.pop && parts.pop.querySelector('span');
  if (popWords && /^Show the overlay$/.test(popWords.textContent)) {
    popWords.replaceChildren(el('span', { class: 'ga-sr' }, 'Show the '), 'Overlay');
    parts.pop.title = 'Show the overlay';
  }
  const runBtns = el('div', { class: 'ga-runbtns' }, parts.share || null, parts.runs || null, parts.pop || null, parts.view || null, startBtn);
  const line = el('div', { class: 'ga-line' }, where, parts.nums, endNums, profit,
    el('div', { class: 'ga-btns' }, runBtns, icons.length ? el('span', { class: 'ga-rule', 'aria-hidden': 'true' }) : null, ...icons));
  const needs = el('div', { class: 'ga-needs' }, parts.steps, ...(parts.lines || []));
  const pane = (id, title, small) => {
    const body = el('div', { class: 'ga-scroll' });
    const sec = el('section', { class: 'ga-pane', id }, el('div', { class: 'ga-ph' }, el('h3', {}, title), small), body);
    return { sec, body };
  };
  const dropsSmall = el('small', {});
  const total = el('small', { id: 'ga-total' }), sold = el('small', { id: 'ga-sold', hidden: '' });
  const drops = pane('ga-drops', 'Drops here', dropsSmall);
  if (parts.cls) dropsSmall.before(parts.cls);
  const picked = pane('ga-picked', 'What you picked up', el('span', {}, total, sold));
  const wentSmall = el('small', {}), went = pane('ga-went', 'How it went', wentSmall);
  went.sec.hidden = true;
  const lem = el('div', { class: 'ga-lem', role: 'img' }), wentRows = el('div', { class: 'k-rows' });
  went.body.append(lem, wentRows);
  const noLoot = el('p', { class: 'g-note ga-noloot', hidden: '' });
  picked.body.append(parts.loot, noLoot);
  const panes = el('div', { class: 'ga-panes', id: 'ga-panes' }, drops.sec, went.sec, picked.sec);
  const back = el('button', { type: 'button', class: 'linkish', id: 'ga-back', onclick: () => open(null) }, 'Back to this run');
  const holder = el('div', { class: 'ga-holder' });
  const moreView = el('div', { class: 'ga-moreview', id: 'ga-moreview', hidden: '' }, back, holder);
  const btns = {};
  const moreRow = el('nav', { class: 'ga-more', id: 'ga-more', 'aria-label': 'More' }, ...more.map(m => btns[m.key] = el('button', { type: 'button', class: 'linkish', 'data-key': m.key, 'aria-expanded': 'false', onclick: () => open(openKey === m.key ? null : m.key) }, m.label)));
  const credit = el('div', { class: 'ga-credit', hidden: '' });
  const print = el('div', { class: 'ga-print' }, credit, parts.foot || null);
  const win = el('section', { class: 'ga-win', id: 'ga-win' }, strip, line, needs, panes, moreView, moreRow, print);
  const home = new Map(more.map(m => [m.key, { parent: m.el.parentNode, next: m.el.nextSibling }]));

  let openKey = null, last = null, endId = null;
  const inBrowser = () => !document.body.classList.contains('in-app');
  function open(key) {
    if (openKey && openKey !== key) { const m = more.find(x => x.key === openKey), h = home.get(openKey); if (h && h.parent) h.parent.insertBefore(m.el, h.next && h.next.parentNode === h.parent ? h.next : null); }
    openKey = key || null;
    for (const m of more) btns[m.key].setAttribute('aria-expanded', String(m.key === openKey));
    const m = more.find(x => x.key === openKey);
    if (m) { holder.replaceChildren(m.el); if (m.show) m.show(); }
    moreView.hidden = !m; win.classList.toggle('more', !!m);   // a block from More has the room: the lines that need you come back with the panes
    if (last) update(last, true);
  }

  // a drop row: the ring (gold for the priciest FM item), the short name with its For you tag, then the lime count once one was
  // picked up this run and the price (an FM price links to Cozy, an NPC one is labeled)
  const ring = r => { const src = pic(r.id); return el('span', { class: 'k-ring' + (r.gold ? ' gold' : '') }, src ? el('img', { src, alt: '' }) : null); };
  const rowOf = r => el('div', { class: 'k-row' + (r.gold ? ' gold' : ''), 'data-item': r.id }, ring(r),
    el('span', { class: 'g-nnm' }, el('span', { class: 'g-nn' }, r.short), r.you ? el('span', { class: 'k-tag y' }, 'For you') : null, r.about ? el('small', {}, r.about) : null),
    el('span', { class: 'ga-r' }, r.n > 0 ? el('span', { class: 'ga-got' }, '×' + fmt(r.n)) : null,
      r.cozy ? el('span', { class: 'g-np' }, el('a', { href: COZY + r.cozy, target: '_blank', rel: 'noopener', 'aria-label': r.short + ' on Cozy Markets, ' + K(r.price) }, K(r.price)))
        : el('span', { class: 'g-np npc' }, r.price ? 'NPC ' + K(r.price) : '')));
  const headOf = m => el('h4', { class: 'ga-mob', 'data-mob': m.id }, el('b', {}, m.name),
    el('span', { class: 'g-mobs' }, 'Lv ' + m.level + ' · ' + fmt(m.exp) + ' EXP · ' + m.count + ' here'),
    m.undead ? el('span', { class: 'k-tag' }, 'undead · Heal hits it') : null);

  const drawn = {};
  const changed = (part, ...now) => { const k = JSON.stringify(now); if (drawn[part] === k) return false; drawn[part] = k; return true; };
  function drawDrops(x) {
    const mobs = x.mobs || [], caught = x.log && x.log.rows ? new Map(x.log.rows.map(r => [r.id, r.count])) : null;
    const L = x.D ? N.dropList(mobs.map(m => m.id), x.D, x.cls, x.level, caught) : null;
    if (!changed('drops', mobs, L, x.D && x.D.date)) return L;
    const top = drops.body.scrollTop;
    drops.body.replaceChildren(...(L && !L.any && mobs.length ? [el('p', { class: 'g-nline ga-none' }, 'No drops logged for these monsters yet.')] : []),
      ...mobs.map((m, i) => { const g = L && L.groups[i], rows = g ? g.rows : [];
        return el('div', { class: 'ga-group' }, headOf(m), rows.length ? el('div', { class: 'k-rows' }, ...rows.map(rowOf)) : L && L.any ? el('p', { class: 'g-nline' }, 'No drops logged for this one yet.') : null); }));
    drops.body.scrollTop = top;
    dropsSmall.textContent = mobs.length > 1 ? mobs.length + ' monsters' : '';
    const date = x.D && new Date(x.D.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    credit.replaceChildren(...(L && L.any ? [el('p', { class: 'g-note' }, 'Seen dropping here, no drop rates yet.' + (L.anyCozy ? ' Prices from ' : ''),
      L.anyCozy ? [el('a', { href: 'https://cozy.markets/', target: '_blank', rel: 'noopener' }, 'Cozy Markets'), ', ' + date + '.' + (L.anyGearCozy ? ' Gear varies by stats.' : '')] : null)] : []));
    return L;
  }

  // How it went: the Lemon rating, then one row each (name, one quiet line, right aligned number)
  function drawWent(E) {
    if (!changed('went', E.id, E.rows, E.lemons, E.lemon)) return;
    lem.replaceChildren(...[0, 1, 2, 3, 4].map(i => el('img', { src: E.lemon || '', alt: '', class: i >= E.lemons ? 'off' : '' })), el('span', { class: 'ga-lemt' }, E.title));
    lem.setAttribute('aria-label', E.title);
    wentRows.replaceChildren(...E.rows.map(r => el('div', { class: 'k-row' }, el('span', { class: 'g-nnm' }, el('span', { class: 'g-nl' }, r.label), r.sub ? el('small', {}, r.sub) : null),
      el('span', { class: 'g-nv' + (r.tone ? ' ' + r.tone : '') }, r.value))));
  }

  function update(x, force) {
    last = x;
    if (force) for (const k of Object.keys(drawn)) delete drawn[k];
    const E = x.ended || null, done = !!E && !E.empty;
    // a run that just ended (or one opened from Your runs) takes the window back from whatever More had open
    if (done && E.id !== endId) { endId = E.id; if (openKey) return open(null); } else if (!done) endId = null;
    win.classList.toggle('ended', !!E); win.classList.toggle('done', done);
    strip.classList.toggle('still', !!E);
    startBtn.hidden = !(E && E.onNew);   // a saved run being looked at has Back to live instead
    endNums.hidden = !done;
    if (done) { if (endBig.textContent !== E.expHr) endBig.textContent = E.expHr; if (endSmall.textContent !== E.small) endSmall.textContent = E.small; setProfit(E.profit, E.tone); if (len.textContent !== E.len) len.textContent = E.len; drawWent(E); }
    else if (E || !x.session) setProfit('', '');
    if (lbl && done && lbl.textContent !== E.head) lbl.textContent = E.head;
    const going = !!(x.session || x.sharing), live = !x.noMap && going;
    const L = live && !done ? drawDrops(x) : null;
    // in a browser the lists stay with no map known, so What you picked up is never gone: Drops here asks for the map
    const ask = inBrowser() && going && !!x.noMap && !done;
    if (ask && changed('drops', 'ask')) { drops.body.replaceChildren(el('p', { class: 'g-nline ga-none' }, 'Pick your map above to see what drops here.')); dropsSmall.textContent = ''; }
    drops.sec.hidden = done; went.sec.hidden = !done;
    sold.hidden = !done; if (done && sold.textContent !== E.sold) sold.textContent = E.sold;
    total.hidden = done;
    panes.hidden = !(live || done || ask) || !!openKey;
    credit.hidden = panes.hidden || !(L && L.any);
    print.hidden = credit.hidden && !parts.foot;
    noLoot.hidden = !parts.loot.hidden;
    const say = x.lootOn === false ? 'Turn on Count my loot under What it earned to list what you pick up.' : 'Nothing picked up yet.';
    if (noLoot.textContent !== say) noLoot.textContent = say;
    const t = x.total != null ? K(x.total) : '';
    if (total.textContent !== t) total.textContent = t;
    for (const m of more) btns[m.key].hidden = !!m.el.hidden && m.key !== openKey;
    fit();
  }

  function setProfit(v, tone) {
    profit.hidden = !v;
    if (profBig.textContent !== v) profBig.textContent = v;
    const c = 'g-gbig' + (tone ? ' ' + tone : '');
    if (profBig.className !== c) profBig.className = c;
  }
  // grind.js's live numbers for the bar, each frame: the run's length and Profit an hour (empty with no run)
  function live(v) {
    if (last && last.ended) return;   // an ended run keeps its own length and profit
    if (len.textContent !== v.len) len.textContent = v.len;
    setProfit(v.profit, v.tone);
  }

  // the window fills what the app leaves under the tabs: its height is the view's less everything else on the page, but never so
  // little that a list drops under FLOOR (then the page scrolls)
  function fit() {
    if (!win.isConnected) return;
    // in a browser a block from More is a normal part of the page: no height of its own, so it never scrolls inside a strip
    if (openKey && inBrowser()) { if (win.style.height) win.style.height = ''; return; }
    // measured around the window, never by shrinking it, so a pane's scroll is never reset
    const r = win.getBoundingClientRect(), b = document.body.getBoundingClientRect(), mb = parseFloat(getComputedStyle(document.body).marginBottom) || 0;
    let h = Math.max(320, Math.floor(innerHeight - (r.top + scrollY) - (b.bottom - r.bottom) - mb));
    // the lists grow and shrink with the window one for one (two stacked ones share it): what the window needs so the shortest has FLOOR
    const lists = panes.hidden ? [] : [...panes.querySelectorAll('.ga-pane:not([hidden]) .ga-scroll')];
    if (lists.length) {
      const stacked = lists.length > 1 && new Set(lists.map(e => Math.round(e.getBoundingClientRect().left))).size === 1;
      const short = Math.min(...lists.map(e => e.getBoundingClientRect().height));
      h = Math.max(h, Math.ceil(r.height + (FLOOR - short) * (stacked ? lists.length : 1)));
    }
    h += 'px';
    if (win.style.height !== h) win.style.height = h;
  }
  addEventListener('resize', fit);
  // and again whenever something around it changes size (a line that comes up, the foot wrapping): the window's own new height
  // measures the same, so this settles at once
  if (window.ResizeObserver) new ResizeObserver(() => fit()).observe(document.body);
  return { el: win, update, live, open, fit };
}

window.GrindAppView = { build };
})();
