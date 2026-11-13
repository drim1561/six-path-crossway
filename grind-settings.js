// Settings for the Grind panel: one panel, opened by ⚙ Settings on the panel's top strip. Shared code: on the site it sits
// under the panel inside the pop-out (grind-overlay.js grows the window to fit it and shrinks it back); the Windows app
// opens the same panel in its own small window and adds its own rows (o.app). It keeps no state of its own: grind.js owns
// the layout, Count my loot, the map, who is signed in, See-through, Size and the app's two switches, and hands them in
// through update(), so Settings and the page always agree. Approved look: .superpowers/brainstorm/132005-1793697090/content/overlay-settings.html
// window.GrindSettings = { build(o), picture(layout), updateLine(r) } -> build: { el, update({ layout, loot, user, see, scale, onTop, pass }) };
//   picture: the little SVG of a layout (⇆ Layout's row on the panel uses them too)
//   updateLine: the app's update check in words (the main window's version line)
//   o = { el, app, layouts, onLayout(l), onLoot(on), onSignIn(), onSignOut(), onProfile(),
//         links: { builds }, onClose(), onSee(v), onSize(scale), onTop(on), onPass(on) }; user { name, avatar }
//   or null. With o.app (the app's bridge): See-through (25 to 100%), Size (60 to 160% by 10), Always on top of the game
//   and Clicks pass through to the game. This map and the app's version are on the page (Rimmah, 2026-11-04)
(function () {
'use strict';

// a little picture of each layout as the panel draws it: [x, y, width, height, corner, what it is]. e is EXP an hour, l a
// timer tile, and nothing is the top strip's bits and the little columns
const PICS = {
  // the top strip across, EXP an hour with the four columns under it on the left, the timers stacked on the right
  tile: [[2, 3, 24, 3, 1], [48, 3, 14, 3, 1], [2, 8, 42, 11, 2, 'e'], [2, 21, 9, 11, 2], [13, 21, 9, 11, 2], [24, 21, 9, 11, 2], [35, 21, 9, 11, 2], [46, 8, 16, 11, 2, 'l'], [46, 21, 16, 11, 2, 'l']],
  // one slim row: EXP an hour, the four columns, the timers, the buttons at the right end
  bar: [[2, 12, 13, 12, 2, 'e'], [17, 14, 6, 8, 1], [24, 14, 6, 8, 1], [31, 14, 6, 8, 1], [38, 14, 6, 8, 1], [46, 12, 6, 12, 2, 'l'], [53, 12, 6, 12, 2, 'l'], [60, 13, 3, 3, 1], [60, 17, 3, 3, 1], [60, 21, 3, 3, 1]],
  // stacked down the side: the top strip, EXP an hour, the timers, the numbers as rows
  column: [[22, 1, 20, 2, 1], [22, 4, 20, 7, 2, 'e'], [22, 12, 20, 5, 1, 'l'], [22, 18, 20, 5, 1, 'l'], [22, 24, 20, 2, 1], [22, 27, 20, 2, 1], [22, 30, 20, 2, 1], [22, 33, 20, 2, 1]],
};
const NS = 'http://www.w3.org/2000/svg';
function picture(l) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 64 36'); svg.setAttribute('aria-hidden', 'true');
  for (const [x, y, width, height, rx, what] of PICS[l] || []) {
    const r = document.createElementNS(NS, 'rect');
    for (const [k, v] of Object.entries({ x, y, width, height, rx })) r.setAttribute(k, v);
    if (what) r.setAttribute('class', what);
    svg.append(r);
  }
  return svg;
}
const nameOf = l => l.charAt(0).toUpperCase() + l.slice(1);
// the app's update check, in words
function updateLine(r) {
  const v = r && r.version ? 'Version ' + r.version : 'A new version';
  switch (r && r.state) {
    case 'latest': return 'Up to date, checks each time it starts';
    case 'available': return v + ' is downloading';
    case 'ready': return v + ' is ready, it installs when you close the app';
    case 'dev': return 'Not an installed copy, updates are off';
    default: return "Couldn't check for updates";
  }
}

function build(o) {
  const el = o.el, app = o.app || null;
  const btn = (label, onclick, cls) => el('button', { type: 'button', class: 'g-set-btn k-btn sm' + (cls === 'k' ? ' key k' : cls ? ' ' + cls : ''), onclick }, label);
  const section = (cls, title, ...kids) => el('section', { class: 'g-set-sec ' + cls }, title ? el('h3', {}, title) : null, ...kids);
  const sw = (id, label, onclick) => el('button', { type: 'button', id, class: 'g-set-sw', 'aria-pressed': 'false', 'aria-label': label, onclick });
  const flip = b => b.getAttribute('aria-pressed') !== 'true';

  // Overlay: the layouts as pictures, the one showing pressed
  const pics = o.layouts.map(l => el('button', { type: 'button', class: 'g-set-pic', 'data-l': l, 'aria-pressed': 'false', onclick: () => o.onLayout(l) }, picture(l), nameOf(l)));

  // the app's rows under the pictures: See-through and Size (kept on the device), and the app's two switches
  const A = {};
  const appRows = [];
  if (app) {
    A.see = el('input', { type: 'range', id: 'g-set-see', class: 'g-set-see', min: '25', max: '100', step: '5', value: '100', oninput: () => o.onSee(+A.see.value) });
    A.seeN = el('span', { class: 'g-set-num' }, '100%');
    A.scale = 100;
    A.smaller = el('button', { type: 'button', id: 'g-set-smaller', class: 'g-set-btn g-set-step k-sq', 'aria-label': 'Smaller', onclick: () => o.onSize(Math.max(60, A.scale - 10)) }, '−');
    A.sizeN = el('span', { class: 'g-set-num' }, '100%');
    A.bigger = el('button', { type: 'button', id: 'g-set-bigger', class: 'g-set-btn g-set-step k-sq', 'aria-label': 'Bigger', onclick: () => o.onSize(Math.min(160, A.scale + 10)) }, '+');
    A.top = sw('g-set-top', 'Always on top of the game', () => o.onTop(flip(A.top)));
    A.pass = sw('g-set-pass', 'Clicks pass through to the game', () => o.onPass(flip(A.pass)));
    appRows.push(
      el('div', { class: 'g-set-row' }, el('label', { class: 'g-set-lbl g-set-tight', for: 'g-set-see' }, 'See-through'), A.see, A.seeN),
      el('div', { class: 'g-set-row' }, el('span', { class: 'g-set-lbl' }, 'Size'), A.smaller, A.sizeN, A.bigger),
      el('div', { class: 'g-set-row' }, el('span', { class: 'g-set-lbl' }, 'Always on top of the game'), A.top),
      el('div', { class: 'g-set-row' }, el('span', { class: 'g-set-lbl' }, 'Clicks pass through to the game', el('small', {}, 'Its buttons still take clicks')), A.pass));
  }

  // Tracking: Count my loot, the same switch as the page's Count my loot button. This map stays on the page only (Rimmah,
  // 2026-11-04: not needed here)
  const loot = el('button', { type: 'button', id: 'g-set-loot', class: 'g-set-sw', 'aria-pressed': 'false', 'aria-label': 'Count my loot',
    onclick: () => o.onLoot(loot.getAttribute('aria-pressed') !== 'true') });

  // You: who is signed in (the Discord picture, or the name's first letter), then the way to your record and the other tabs
  const who = el('div', { class: 'g-set-row g-set-who' });
  const open = url => () => window.open(url, '_blank');
  function drawYou(user) {
    if (!user) {
      who.replaceChildren(el('span', { class: 'g-set-lbl' }, 'Not signed in. Sessions stay on this device'), btn('Sign in with Discord', () => o.onSignIn()));
      return;
    }
    const letter = (user.name || '?').trim().charAt(0).toUpperCase() || '?';
    const av = el('span', { class: 'g-set-av', 'aria-hidden': 'true' });
    if (user.avatar) av.append(el('img', { src: user.avatar, alt: '', referrerpolicy: 'no-referrer', onerror: () => av.replaceChildren(letter) }));
    else av.append(letter);
    who.replaceChildren(av, el('span', { class: 'g-set-lbl' }, user.name, el('small', {}, 'Signed in with Discord')), btn('Sign out', () => o.onSignOut()));
  }

  // (the app's version and its update check are on the main window: grind.js, with updateLine)
  const root = el('div', { id: 'g-set', class: 'g-set', role: 'dialog', 'aria-label': 'Settings' },
    el('header', { class: 'g-set-h' }, el('h2', {}, 'Settings'),
      el('button', { type: 'button', class: 'g-set-x k-sq', title: 'Close Settings', 'aria-label': 'Close Settings', onclick: () => o.onClose() }, (window.Grind && window.Grind.railIcon && window.Grind.railIcon('close')) || '×')),
    el('div', { class: 'g-set-body' },
      section('g-set-ov', 'Overlay', el('div', { class: 'g-set-pics' }, pics), ...appRows),
      section('g-set-tr', 'Tracking',
        el('div', { class: 'g-set-row' }, el('span', { class: 'g-set-lbl' }, 'Count my loot', el('small', {}, 'Flip through Equip, Use and Etc at the start and the end')), loot)),
      section('g-set-you', 'You', who,
        el('div', { class: 'g-set-links' }, btn('Open my profile', () => o.onProfile(), 'k'), btn('Builds ↗', open(o.links.builds))))));

  let userKey;   // who You was last drawn for, so a picture isn't fetched again on every update
  function update(s) {
    for (const p of pics) p.setAttribute('aria-pressed', String(p.dataset.l === s.layout));
    loot.setAttribute('aria-pressed', String(!!s.loot));
    const key = s.user ? s.user.name + '\n' + (s.user.avatar || '') : '';
    if (key !== userKey) { userKey = key; drawYou(s.user); }
    if (app) {
      if (s.see != null) { if (+A.see.value !== s.see) A.see.value = String(s.see); A.seeN.textContent = s.see + '%'; }
      if (s.scale != null) { A.scale = s.scale; A.sizeN.textContent = s.scale + '%'; A.smaller.disabled = s.scale <= 60; A.bigger.disabled = s.scale >= 160; }
      A.top.setAttribute('aria-pressed', String(!!s.onTop));
      A.pass.setAttribute('aria-pressed', String(!!s.pass));
    }
  }
  return { el: root, update };
}

window.GrindSettings = { build, picture, updateLine };
})();
