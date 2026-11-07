// The Trail Signs scene: the page's background, drawn once on one canvas at 4x (one scene pixel is 4 CSS pixels, never
// stretched). Dusk is the dark theme, morning the light one. SCENES is the palette, copied from SCENES in
// .superpowers/brainstorm/cozy-forest/dusk-mock.html; make-forest-art.js (npm run boss:forest) reads it for the little
// stage picture too. Ported from duskScene() in that mock. Everything is placed by position (rnd of the spot), so a resize
// never reshuffles the sky, and nothing in it moves. Words never go on it.
(function () {
'use strict';
const SCENES = {
  dusk: { sky: ['#211d3d', '#2c2650', '#3f3058', '#593c62', '#7a4668', '#9d526b', '#bf656a', '#d98470'],
    hill: ['#8a6272', '#6a5067', '#4f4558'], ground: ['#33503a', '#2b4632', '#243c2b', '#1d3224'], tuft: '#4a6d48', stone: ['#7a6e7c', '#544c5a'],
    leaf: ['#121f1b', '#1a2d24', '#25402c', '#375c37'], bark: ['#231a18', '#352722', '#4b382d'], wood: ['#8a5c34', '#c39462', '#3a2414'],
    wall: ['#5a4648', '#463638', '#2c2224'], roof: ['#2a3a32', '#38503f', '#1c2822'], lit: '#ffd36b', glow: 'rgba(255,190,90,.16)', flies: 16, stars: 16, dim: 'rgba(14,10,26,.16)', cap: 'red', smoke: 'rgba(214,190,200,.45)' },
  morning: { sky: ['#f6e6d0', '#f7ead2', '#f6eed3', '#f2efd2', '#ecefcf', '#e4eccb', '#dbe8c5', '#d2e4bd'],
    hill: ['#c3d5a6', '#aac791', '#92b87c'], ground: ['#88b160', '#79a455', '#6b964b', '#5e8942'], tuft: '#a4c878', stone: ['#d6cdb6', '#ab9f86'],
    leaf: ['#3f6b3a', '#4f8244', '#67994f', '#8ab866'], bark: ['#57402c', '#6e5138', '#8a6a4a'], wood: ['#9a6b3f', '#cba273', '#57361d'],
    wall: ['#ecdcc0', '#d4c2a2', '#8c7654'], roof: ['#5f8a4f', '#78a35f', '#3f6b3a'], lit: '#f7c55e', glow: 'rgba(255,240,190,.12)', flies: 0, stars: 0, rays: true, dim: 'rgba(255,250,236,.1)', cap: 'red', smoke: 'rgba(255,255,255,.6)' },
};
const THEME_SCENE = { dark: 'dusk', light: 'morning' };
const CAPS = { red: { R: '#c8452f', r: '#7a2316', W: '#fff3d6', C: '#efe0bd', c: '#c7b48a' }, teal: { R: '#3fb3a8', r: '#1b625c', W: '#d6fff2', C: '#dff3e6', c: '#97bfae' } };
const SHROOM = ['....rrrrr....', '..rrRRRRRrr..', '.rRRWWRRRRRr.', '.rRRWWRRWWRr.', 'rRRRRRRRWWRRr', 'rRRWRRRRRRRRr', 'rrRRRRRWWRRrr', '.rrrrrrrrrrr.', '....WCCCc....', '....WCCCc....', '....WCCCc....', '.....ccc.....'];
const TINY = ['..rrr..', '.rRWRr.', 'rRRRRWr', 'rrrrrrr', '..WCc..', '..WCc..', '...c...'];
const ART = 4; // CSS pixels in one scene pixel

// the same number for the same spot, so the scene is placed, not shuffled
function rnd(x, y) { let n = (x * 374761393 + y * 668265263) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967295; }

// scene(W, H, name, ctx): W by H scene pixels. Without a ctx it only says what would be in the side margins (the
// cabin needs a margin of 84 scene pixels or more, the signpost 60), which is what the tests ask; with one it draws.
function scene(W, H, name, ctx) {
  const P = SCENES[name] || SCENES.dusk, x = ctx;
  const horizon = Math.round(H * .62), gy = horizon + 12, gutter = Math.floor((W * ART - 1120) / 2 / ART);
  const hasCabin = gutter >= 84, hasPost = gutter >= 60;
  if (!x) return { hasCabin, hasPost };
  const rect = (a, b, w, h, col) => { x.fillStyle = col; x.fillRect(a, b, w, h); };
  const dot = (a, b, col) => rect(a, b, 1, 1, col);
  const blob = (cx, cy, r, col) => { x.fillStyle = col; for (let dy = -r; dy <= r; dy++) { const h = Math.floor(Math.sqrt(r * r - dy * dy)); x.fillRect(cx - h, cy + dy, h * 2 + 1, 1); } };
  const stamp = (map, pal, X, Y) => map.forEach((row, b) => [...row].forEach((k, a) => { if (k !== '.' && pal[k]) dot(X + a, Y + b, pal[k]); }));

  // Sky: flat bands with a stepped edge, nothing dithered
  rect(0, 0, W, H, P.sky[0]);
  const n = P.sky.length, bh = horizon / n;
  for (let i = 1; i < n; i++) { const base = Math.round(i * bh); for (let a = 0; a < W;) { const w = 5 + Math.floor(rnd(a, i * 7) * 8), up = Math.floor(rnd(a, i * 13) * 3); rect(a, base - up, w, H, P.sky[i]); a += w; } }
  for (let i = 0; i < P.stars; i++) dot(Math.floor(rnd(i, 71) * W), Math.floor(rnd(i, 72) * horizon * .55), i % 5 ? 'rgba(255,240,210,.55)' : '#fff3d6');
  if (P.rays) for (let i = 0; i < 5; i++) { const x0 = Math.floor(W * (.34 + i * .08)), wd = 4 + i % 3 * 3; for (let y = 0; y < horizon; y++) rect(x0 - Math.floor(y * (.5 - i * .25)), y, wd, 1, 'rgba(255,252,232,.3)'); }

  // Hills, far to near
  const hills = (base, step, rMin, rMax, col, seed) => { for (let a = -rMax; a < W + rMax; a += step) { const r = rMin + Math.floor(rnd(a + 99, seed) * (rMax - rMin)); blob(a, base - Math.floor(rnd(a + 99, seed + 1) * r * .4), r, col); } rect(0, base, W, H, col); };
  hills(horizon - 2, 30, 18, 38, P.hill[0], 3);
  hills(horizon + 3, 20, 10, 24, P.hill[1], 5);
  hills(horizon + 8, 11, 5, 11, P.hill[2], 7);

  // Ground: flat bands getting darker toward you (lighter in the morning), tufts and a few flowers
  const gh = H - gy;
  P.ground.forEach((col, i) => { const y0 = gy + Math.round(i * gh / P.ground.length); for (let a = 0; a < W;) { const w = 6 + Math.floor(rnd(a, 31 + i) * 10), up = Math.floor(rnd(a, 37 + i) * 2); rect(a, y0 - up, w, H, col); a += w; } });
  for (let i = 0; i < W / 7; i++) { const a = Math.floor(rnd(i, 41) * W), b = gy + 4 + Math.floor(rnd(i, 42) * (gh - 6)); rect(a, b, 1, 2, P.tuft); rect(a + 2, b + 1, 1, 1, P.tuft); rect(a - 1, b + 1, 1, 1, P.tuft); if (i % 5 === 0) rect(a + 5, b, 1, 1, i % 2 ? '#f0b8c8' : '#f4e6a2'); }

  // Stepping stones
  const stone = (a, b, w) => { rect(a + 1, b, w - 2, 1, P.stone[0]); rect(a, b + 1, w, 2, P.stone[0]); rect(a + 1, b + 3, w - 2, 1, P.stone[1]); };
  const trail = (x0, y0, x1, y1, count) => { for (let i = 0; i < count; i++) { const t = i / (count - 1); stone(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), 4 + Math.round(t * 5)); } };

  // A trunk, flared at the foot
  const trunk = (tx, tw, baseY, seed) => {
    rect(tx, 0, tw, baseY, P.bark[1]); rect(tx, 0, 2, baseY, P.bark[2]); rect(tx + tw - 3, 0, 3, baseY, P.bark[0]);
    for (let i = 0; i < 12; i++) rect(tx + 3 + Math.floor(rnd(i, seed) * Math.max(1, tw - 7)), Math.floor(rnd(i, seed + 1) * baseY), 2, 4 + Math.floor(rnd(i, seed + 2) * 8), P.bark[0]);
    for (let r = 0; r < 6; r++) { rect(tx - r, baseY - 6 + r, tw + r * 2, 1, P.bark[1]); dot(tx - r, baseY - 6 + r, P.bark[2]); dot(tx + tw + r - 1, baseY - 6 + r, P.bark[0]); }
  };

  // The wayside cabin and the six armed signpost live in the side margins, and only when there's room
  const cabin = (X, Y) => {
    const w = 40, h = 20, rh = 18;
    for (let i = 0; i < 4; i++) blob(X + 32 + i * 3, Y - h - rh - 6 - i * 6, 2 + i, P.smoke);
    rect(X + 28, Y - h - rh - 3, 5, 14, P.wall[2]); rect(X + 29, Y - h - rh - 3, 3, 14, P.wall[1]);
    for (let r = 0; r < rh; r++) { const inset = Math.round((rh - 1 - r) * 1.1) - 2; rect(X + inset, Y - h - rh + r, w - inset * 2, 1, r % 4 === 3 ? P.roof[2] : r % 2 ? P.roof[0] : P.roof[1]); }
    rect(X + 2, Y - h, w - 4, h, P.wall[0]); rect(X + 2, Y - h, w - 4, 2, P.wall[2]); rect(X + 2, Y - 3, w - 4, 3, P.stone[1]);
    rect(X + 2, Y - h, 2, h - 3, P.wall[2]); rect(X + w - 4, Y - h, 2, h - 3, P.wall[2]);
    rect(X + 17, Y - 13, 7, 13, P.wood[2]); rect(X + 18, Y - 12, 5, 12, P.wood[0]); rect(X + 19, Y - 12, 1, 12, P.wood[1]); dot(X + 22, Y - 6, P.lit);
    const pane = a => { rect(a, Y - 15, 8, 8, P.wall[2]); rect(a + 1, Y - 14, 6, 6, P.lit); rect(a + 4, Y - 14, 1, 6, P.wall[2]); rect(a + 1, Y - 11, 6, 1, P.wall[2]); };
    pane(X + 6); pane(X + 27);
    rect(X + 5, Y - 16, 10, 10, P.glow); rect(X + 26, Y - 16, 10, 10, P.glow);
    rect(X + 5, Y + 1, 10, 2, P.glow); rect(X + 26, Y + 1, 10, 2, P.glow);
  };
  const signpost = (X, Y) => {
    const W0 = P.wood[0], W1 = P.wood[1], W2 = P.wood[2];
    rect(X - 1, Y - 58, 5, 58, W2); rect(X, Y - 58, 3, 58, W0); rect(X, Y - 58, 1, 58, W1);
    for (let i = 0; i < 6; i++) {
      const y = Y - 56 + i * 7, right = i % 2 === 0, len = 13 + (i * 5) % 7, a = right ? X + 4 : X - 1 - len;
      rect(a, y, len, 6, W2); rect(a, y + 1, len, 4, W0); rect(a, y + 1, len, 1, W1);
      const tip = right ? a + len : a - 1, d = right ? 1 : -1;
      for (let k = 0; k < 3; k++) { rect(tip + d * k, y + k, 1, 6 - k * 2, W2); if (6 - k * 2 > 2) rect(tip + d * k, y + k + 1, 1, 4 - k * 2, W0); }
      rect(a + 1, y - 1, Math.floor(len * .6), 1, P.leaf[3]);
    }
    rect(X + 4, Y - 16, 7, 1, W2); rect(X + 8, Y - 15, 5, 7, W2); rect(X + 9, Y - 14, 3, 5, P.lit); rect(X + 7, Y - 16, 7, 9, P.glow);
  };
  if (hasCabin) trail(64, gy + 18, 92, H - 6, 6);
  if (hasPost) { const px = W - 52, py = gy + 24; trail(px - 3, py + 3, px - 24, H - 6, 5); }
  trunk(66, 9, gy + 8, 13);
  trunk(W - 92, 8, gy + 8, 17);
  if (hasCabin) cabin(46, gy + 14);
  trunk(8, 20, H - 12, 23);
  trunk(W - 28, 22, H - 10, 27);
  if (hasPost) signpost(W - 52, gy + 24);

  // Leaves in clumps: a dark mass, a middle, a lit top, no dither
  const canopy = (x0, x1, y1, seed, count) => {
    const L = P.leaf, spots = [];
    for (let i = 0; i < count; i++) { const t = rnd(i, seed + 1), cx = x0 + Math.floor(rnd(i, seed) * (x1 - x0)), cy = Math.floor(t * t * y1) - 2, r = 7 + Math.floor(rnd(i, seed + 2) * 11); spots.push([cx, cy, r]); }
    spots.forEach(s => blob(s[0], s[1], s[2] + 2, L[0]));
    spots.forEach(s => blob(s[0] - 1, s[1] - 2, s[2], L[1]));
    spots.forEach((s, i) => { for (let k = 0; k < 7; k++) { const ang = Math.PI * (.85 + rnd(k, i + seed) * 1.0), dist = rnd(k, i + seed + 3) * s[2] * .8; blob(Math.round(s[0] - 1 + Math.cos(ang) * dist), Math.round(s[1] - 2 + Math.sin(ang) * dist), 2 + Math.floor(rnd(k, i + seed + 5) * 2), L[2]); } });
    spots.forEach((s, i) => { for (let k = 0; k < 5; k++) { const ang = Math.PI * (1 + rnd(k, i + seed + 7) * .55), dist = (.45 + rnd(k, i + seed + 9) * .5) * s[2]; blob(Math.round(s[0] - 1 + Math.cos(ang) * dist), Math.round(s[1] - 2 + Math.sin(ang) * dist), 1, L[3]); } });
  };
  canopy(-14, 104, 74, 21, 34);
  canopy(W - 112, W + 14, 74, 29, 34);

  // Bushes and mushrooms at the feet of the big trees
  const cap = CAPS[P.cap] || CAPS.red;
  [[2, H - 7, 8], [24, H - 6, 6], [W - 34, H - 6, 7], [W - 6, H - 7, 8]].forEach(b => { blob(b[0], b[1], b[2], P.leaf[1]); blob(b[0] - 1, b[1] - 2, b[2] - 3, P.leaf[2]); blob(b[0] - 2, b[1] - 3, 2, P.leaf[3]); });
  stamp(SHROOM, cap, 32, H - 17); stamp(TINY, cap, 48, H - 9); stamp(TINY, cap, W - 44, H - 10);

  // Still fireflies in the dusk, in the side margins
  for (let i = 0; i < P.flies; i++) { const side = i % 2, fx = side ? W - 1 - Math.floor(rnd(i, 61) * Math.max(gutter, 30)) : Math.floor(rnd(i, 61) * Math.max(gutter, 30)), fy = Math.floor(horizon * .45) + Math.floor(rnd(i, 62) * (H - horizon * .45 - 8)); rect(fx - 1, fy - 1, 3, 3, 'rgba(255,226,124,.22)'); dot(fx, fy, '#ffe27c'); }
  rect(0, 0, W, H, P.dim);
  return { hasCabin, hasPost };
}

// mount(): the canvas behind the page. It draws once, again on resize (after 150ms) and when data-theme changes.
function mount() {
  if (typeof document === 'undefined') return null;
  let c = document.getElementById('forest-scene');
  if (c) return c;
  c = document.createElement('canvas');
  c.id = 'forest-scene'; c.setAttribute('aria-hidden', 'true');
  c.style.cssText = 'position:fixed;left:0;top:0;z-index:-1;pointer-events:none;image-rendering:pixelated';
  document.body.prepend(c);
  const draw = () => {
    const W = Math.ceil(innerWidth / ART), H = Math.ceil(innerHeight / ART), ctx = c.getContext('2d');
    if (!ctx) return;
    c.width = W; c.height = H; c.style.width = W * ART + 'px'; c.style.height = H * ART + 'px';
    scene(W, H, THEME_SCENE[document.documentElement.dataset.theme] || 'morning', ctx);
  };
  let timer = 0;
  addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(draw, 150); });
  new MutationObserver(draw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  draw();
  return c;
}
if (typeof window !== 'undefined') window.ForestScene = { SCENES, scene, mount };
if (typeof module !== 'undefined' && module.exports) module.exports = { SCENES, scene, mount };
})();
