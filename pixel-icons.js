// Pixel icons (the Trail Signs look), shared by the page (the theme button) and the Grind panel (grind.js): a bitmap of # marks, one
// SVG square per mark, crisp, taking the text color, drawn at 2 CSS pixels to the art pixel. Loaded by index.html in its head.
// window.PixelIcons = { pixelSvg, RAIL_ICONS, railIcon(name), arrowed(el, text), LINE_ICONS, lineIcon(name) }
(function () {
'use strict';
// a bitmap of # marks, one SVG square per mark, crisp, taking the text color. Drawn at 2 CSS pixels
// to the art pixel by railIcon. The bitmaps are the mock's (dusk-mock.html, M); power, close, chev and sun are drawn to match.
function pixelSvg(rows) {
  const h = rows.length, w = Math.max(...rows.map(r => r.length)), d = [];
  rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === '#') d.push('M' + x + ' ' + y + 'h1v1h-1z'); });
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true" focusable="false"><path d="' + d.join('') + '"/></svg>';
}
const RAIL_BITS = {
  pop: ['#####....', '#...#....', '#...#....', '#...#####', '#####...#', '...#....#', '...#....#', '...######', '.........'],
  reset: ['...####.#', '..#....##', '.#....###', '#........', '#........', '#.......#', '.#.....#.', '..#####..', '.........'],
  find: ['..###....', '.#...#...', '#.....#..', '#.....#..', '#.....#..', '.#...#...', '..#####..', '......##.', '.......##'],
  plus: ['...###...', '...###...', '...###...', '#########', '#########', '#########', '...###...', '...###...', '...###...'],
  frame: ['..###....', '#########', '#.......#', '#..###..#', '#..#.#..#', '#..###..#', '#.......#', '#########', '.........'],
  gear: ['...#.#...', '.#.###.#.', '..#####..', '###...###', '.##...##.', '###...###', '..#####..', '.#.###.#.', '...#.#...'],
  power: ['....#....', '....#....', '..#.#.#..', '.#..#..#.', '#...#...#', '#.......#', '.#.....#.', '..#####..', '.........'],
  swap: ['...#.....', '..##.....', '.#######.', '..##.....', '...#.#...', '.....##..', '.#######.', '.....##..', '.....#...'],
  close: ['##...##', '.##.##.', '..###..', '...#...', '..###..', '.##.##.', '##...##'],
  up: ['...#...', '..###..', '.#####.', '#######'],
  down: ['#######', '.#####.', '..###..', '...#...'],
  book: ['#########', '#...#...#', '#...#...#', '#...#...#', '#...#...#', '#...#...#', '#########', '.........'],
  save: ['.#######.', '.#.....#.', '.#.....#.', '.#.....#.', '.#..#..#.', '.#.#.#.#.', '.##...##.', '.#.....#.'],
  chev: ['##...##', '.##.##.', '..###..', '...#...'],
  flag: ['#.......', '#####...', '#######.', '#####...', '#.......', '#.......', '#.......'],
  moon: ['...###...', '..###....', '.###.....', '.###.....', '.###.....', '.####...#', '..######.', '...####..'],
  sun: ['....#....', '.#.....#.', '...###...', '..#####..', '#.#####.#', '..#####..', '...###...', '.#.....#.', '....#....'],
};
const RAIL_ICONS = {};
for (const [k, rows] of Object.entries(RAIL_BITS)) RAIL_ICONS[k] = pixelSvg(rows);
function railIcon(name) {
  const t = document.createElement('template');
  t.innerHTML = RAIL_ICONS[name] || '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true" focusable="false"></svg>';
  const s = t.content.firstChild, vb = s.getAttribute('viewBox').split(' ');
  s.setAttribute('width', String(vb[2] * 2)); s.setAttribute('height', String(vb[3] * 2));
  return s;
}
// writes text into el; a leading ▲ or ▼ becomes the pixel arrow and the rest stays as written, so the strings (and their tests) keep their text
function arrowed(el, text) {
  el.textContent = '';
  const m = /^([▲▼])([\s\S]*)$/.exec(String(text));
  if (!m) { el.textContent = String(text); return el; }
  el.appendChild(railIcon(m[1] === '▲' ? 'up' : 'down'));
  if (m[2]) el.appendChild(document.createTextNode(m[2]));
  return el;
}
// line icons (Grind refresh, 2026-11-18): thin rounded strokes on a 24 grid for our own buttons, in the text color. Game
// things (Lemons, Meat, monsters, loot) stay the game's pixel pictures; railIcon stays for everything else
const LINE_ICONS = {
  up: 'M6 14.5l6-6 6 6',
  down: 'M6 9.5l6 6 6-6',
  swap: 'M5 8h13M15 5l3 3-3 3M19 16H6M9 13l-3 3 3 3',
  close: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
  gear: 'M10.14 5.05L10.66 2.49L13.34 2.49L13.86 5.05L15.6 5.76L17.78 4.33L19.67 6.22L18.24 8.4L18.95 10.14L21.51 10.66L21.51 13.34L18.95 13.86L18.24 15.6L19.67 17.78L17.78 19.67L15.6 18.24L13.86 18.95L13.34 21.51L10.66 21.51L10.14 18.95L8.4 18.24L6.22 19.67L4.33 17.78L5.76 15.6L5.05 13.86L2.49 13.34L2.49 10.66L5.05 10.14L5.76 8.4L4.33 6.22L6.22 4.33L8.4 5.76zM15 12a3 3 0 1 1-6 0a3 3 0 1 1 6 0z',
  pop: 'M14 5h5v5M19 5l-7 7M17 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4',
  find: 'M16 10.5a5.5 5.5 0 1 1-11 0a5.5 5.5 0 1 1 11 0zM15 15l4.5 4.5',
  book: 'M12 6.5C10.5 5.3 8.3 5 5 5v13c3.3 0 5.5.3 7 1.5 1.5-1.2 3.7-1.5 7-1.5V5c-3.3 0-5.5.3-7 1.5zM12 6.5v13',
  reset: 'M19 12a7 7 0 1 1-2.05-4.95M19 5v4h-4',
  plus: 'M12 5v14M5 12h14',
  power: 'M12 4v8M7.8 6.8a7 7 0 1 0 8.4 0',
  frame: 'M4 9V5h4M16 5h4v4M20 15v4h-4M8 19H4v-4',
  end: 'M8 7h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z',
};
function lineIcon(name) {
  const NS = 'http://www.w3.org/2000/svg', s = document.createElementNS(NS, 'svg'), d = LINE_ICONS[name];
  for (const [k, v] of [['viewBox', '0 0 24 24'], ['class', 'li'], ['fill', 'none'], ['stroke', 'currentColor'], ['stroke-width', '1.8'],
    ['stroke-linecap', 'round'], ['stroke-linejoin', 'round'], ['aria-hidden', 'true'], ['focusable', 'false']]) s.setAttribute(k, v);
  if (d) { const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); s.appendChild(p); }
  return s;
}
if (typeof window !== 'undefined') window.PixelIcons = { pixelSvg, RAIL_ICONS, railIcon, arrowed, LINE_ICONS, lineIcon };
})();
