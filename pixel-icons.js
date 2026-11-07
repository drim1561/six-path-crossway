// Pixel icons (the Trail Signs look), shared by the page (the theme button) and the Grind panel (grind.js): a bitmap of # marks, one
// SVG square per mark, crisp, taking the text color, drawn at 2 CSS pixels to the art pixel. Loaded by index.html in its head.
// window.PixelIcons = { pixelSvg, RAIL_ICONS, railIcon(name), arrowed(el, text) }
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
if (typeof window !== 'undefined') window.PixelIcons = { pixelSvg, RAIL_ICONS, railIcon, arrowed };
})();
