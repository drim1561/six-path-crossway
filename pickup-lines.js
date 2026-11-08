/* pickup-lines.js (window.PickupLines): reads the game's pickup lines (the up to 6 lines above the quickslots, right edge,
   newest at the bottom: "You have gained mesos (+41)", "Medicine With... x1 earned. (Etc)", yellow "You received EXP (+24)")
   from one cropped strip of a frame. Pure functions on image data {w, h, data} (RGBA), no DOM.
   Everything is measured at game scale (1366x768, what the client draws before it stretches): the strip is shrunk by the
   stretch k = frameH / 768 into 267 x 96 game pixels of ink first, so templates work at any window size. */
(function (root) {
  const GW = 267, GH = 96, ROWS = 6, PITCH = 14.13, YC0 = 12.5, BAND = 6;   // game px: strip size, row pitch, first row centre, half row height
  const STRIP_ABOVE = 240, STRIP_W = 267;                                  // strip top is 240 game px above the frame bottom
  let T = { words: {}, glyphs: {} };

  // The strip box in frame pixels. The client fills the frame (borderless full screen, or a 16:9 window share), so the
  // right and bottom edges of the frame are the client's. (The EXP line can't anchor it: its x moves with the EXP text.)
  function stripArea(w, h) {
    const k = h / 768;
    return { x: Math.round(w - STRIP_W * k), y: Math.round(h - STRIP_ABOVE * k), w: Math.round(STRIP_W * k), h: Math.round(GH * k) };
  }

  // ink coverage at game scale: white (min rgb > 215) and yellow, each 0..1 per game pixel
  function toGame(img) {
    const k = img.w / GW, white = new Float32Array(GW * GH), yellow = new Float32Array(GW * GH), d = img.data;
    for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
      const x0 = Math.round(gx * k), x1 = Math.max(x0 + 1, Math.round((gx + 1) * k)), y0 = Math.round(gy * k), y1 = Math.max(y0 + 1, Math.round((gy + 1) * k));
      let w = 0, y = 0, n = 0;
      for (let yy = y0; yy < y1 && yy < img.h; yy++) for (let xx = x0; xx < x1 && xx < img.w; xx++) {
        const i = (yy * img.w + xx) * 4, r = d[i], g = d[i + 1], b = d[i + 2];
        if (Math.min(r, g, b) > WHITE_T && Math.max(r, g, b) - Math.min(r, g, b) < 50) w++; else if (r > 170 && g > 170 && b < 140 && r - b > 65) y++;
        n++;
      }
      white[gy * GW + gx] = n ? w / n : 0; yellow[gy * GW + gx] = n ? y / n : 0;
    }
    return { white, yellow };
  }
  const INK = 0.3, WHITE_T = 185;
  const rowTop = i => Math.round(YC0 + PITCH * i - BAND), BH = BAND * 2;
  // boolean ink of row i from a coverage map: BH rows x GW columns, as an array of Uint8Array
  function rowInk(cov, i) {
    const y0 = rowTop(i), out = [];
    for (let y = 0; y < BH; y++) { const r = new Uint8Array(GW); for (let x = 0; x < GW; x++) r[x] = y0 + y >= 0 && y0 + y < GH && cov[(y0 + y) * GW + x] > INK ? 1 : 0; out.push(r); }
    return out;
  }
  const count = ink => ink.reduce((a, r) => a + r.reduce((p, v) => p + v, 0), 0);

  // template: { w, rows: [ '..##..', ... ] } of BH strings. Slide it over the row; score is the smaller of "template ink
  // found in the row" and "row ink under the template that the template explains", each within one pixel.
  function maskOf(t) { return t.rows.map(s => Uint8Array.from(s, c => c === '#' ? 1 : 0)); }
  function near(ink, x, y) { for (let dy = -3; dy <= 3; dy++) { const r = ink[y + dy]; if (!r) continue; for (let dx = -1; dx <= 1; dx++) if (r[x + dx]) return true; } return false; }
  // Dice overlap of the template and the row under it, best over a shift of one pixel up or down (the stretch rounds rows
  // differently): 2 * both / (template ink + row ink in the template's box). Same text scores high, other text much lower.
  function slide(ink, t, from, to) {
    const m = t.mask || (t.mask = maskOf(t)); let best = { score: 0, x: -1 };
    let n = 0; for (const r of m) for (const v of r) n += v;
    if (!n) return best;
    for (let x0 = Math.max(0, from | 0); x0 <= Math.min(GW - t.w, to == null ? GW : to); x0++) for (let dy = -3; dy <= 3; dy++) {
      let both = 0, rn = 0;
      for (let y = 0; y < BH; y++) { const r = ink[y + dy]; if (!r) continue; const mr = m[y]; for (let x = 0; x < t.w; x++) if (r[x0 + x]) { rn++; if (mr[x]) both++; } }
      const sc = 2 * both / (n + rn);
      if (sc > best.score) best = { score: sc, x: x0 };
    }
    return best;
  }
  function nearT(m, x, y) { for (let dy = -3; dy <= 3; dy++) { const r = m[y + dy]; if (!r) continue; for (let dx = -1; dx <= 1; dx++) if (r[x + dx]) return true; } return false; }

  const WHITE_MIN = 40, YELLOW_MIN = 40, WORD_OK = 0.8;
  // 6 chars, index 0 top, 5 newest: E yellow (EXP) line, I item line, M mesos line, ? ink that is none of those (a fading
  // line, another tab ending, a window over it), . nothing
  function rowsOf(img) {
    const g = toGame(img), out = [];
    for (let i = 0; i < ROWS; i++) {
      const y = rowInk(g.yellow, i), w = rowInk(g.white, i), yn = count(y), wn = count(w);
      if (yn >= YELLOW_MIN && yn > wn) { out.push('E'); continue; }
      if (wn >= WHITE_MIN) {
        const e = T.words['earned.'] ? slide(w, T.words['earned.']).score : 0, m = T.words['gained'] ? slide(w, T.words['gained']).score : 0;
        if (e >= 0.6 && e - m >= 0.06) { out.push('I'); continue; }
        if (m >= 0.65 && m - e >= 0.15) { out.push('M'); continue; }
        out.push('?'); continue;
      }
      out.push(wn + yn >= 12 ? '?' : '.');
    }
    return out.join('');
  }


  // ---- new lines vs lines that moved up ----
  // The stack scrolls up as lines arrive, so the new read is the old one shifted up by 0 to 3 rows. ? and . say nothing about a
  // row (a covered or fading line), so only the known rows vote: the shift with the most agreeing rows minus disagreeing ones
  // wins, a tie takes the smaller shift. A line of the new read is a birth where nothing known sat before it after the shift.
  const isLine = c => c === 'I' || c === 'M' || c === 'E';
  function births(prev, next) {
    const out = [];
    if (prev == null) { for (let i = 0; i < next.length; i++) if (isLine(next[i])) out.push(i); return out; }
    let best = 0, bestScore = -Infinity;
    for (let sh = 0; sh <= 3; sh++) {
      let sc = 0;
      for (let j = sh; j < prev.length; j++) { const a = prev[j], b = next[j - sh]; if (isLine(a) && isLine(b)) sc += a === b ? 1 : -1; }
      if (sc > bestScore) { bestScore = sc; best = sh; }
    }
    for (let i = 0; i < next.length; i++) {
      if (!isLine(next[i])) continue;
      const src = prev[i + best];
      if (src === undefined || src === '.' || (isLine(src) && src !== next[i])) out.push(i);
    }
    return out;
  }

  // Feeds reads in time order; a gap over 5 s means lines may have come and gone unseen, so the stack starts over.
  function createTracker() {
    let prev = null, last = -Infinity;
    return { feed(rows, tMs) {
      if (tMs - last > 5000) prev = null;
      const b = births(prev, rows); prev = rows; last = tMs; return { births: b };
    } };
  }

  // ---- mesos digits: "You have gained mesos (+38)" ----
  // The digits are cut out of the row by blank columns, after the word "mesos": ( + digits ). Each is matched to learned glyphs
  // (Dice overlap, a pixel of slack each way). Anything doubtful (a hole where a digit should be, an unknown shape) is unsure.
  const MESOS_GATE = 0.01, DIGIT_OK = 0.72, DIGIT_MARGIN = 0.06, MAX_ADVANCE = 9, FRAME_OK = 0.6;
  const inkOf = rows => rows.map(r => typeof r === 'string' ? Uint8Array.from(r, c => c === '#' ? 1 : 0) : r);
  function groupsOf(ink, x0) {
    const out = []; let s = -1;
    for (let x = x0; x <= GW; x++) {
      const on = x < GW && ink.some(r => r[x]);
      if (on && s < 0) s = x; else if (!on && s >= 0) { out.push({ x: s, w: x - s, rows: ink.map(r => Array.from(r.slice(s, x), v => v ? '#' : '.').join('')) }); s = -1; }
    }
    return out;
  }
  function dice(a, b) {   // a, b: {w, rows}; best over a shift of one pixel each way
    const ma = a.mask || (a.mask = maskOf(a)), mb = b.mask || (b.mask = maskOf(b)); let na = 0, nb = 0, best = 0;
    for (const r of ma) for (const v of r) na += v; for (const r of mb) for (const v of r) nb += v;
    if (!na || !nb) return 0;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      let both = 0;
      for (let y = 0; y < ma.length; y++) { const rb = mb[y + dy]; if (!rb) continue; for (let x = 0; x < a.w; x++) if (ma[y][x] && rb[x + dx]) both++; }
      best = Math.max(best, 2 * both / (na + nb));
    }
    return best;
  }
  function digitGroups(ink, glyphs) {   // the glyph groups between "+" and ")" after the word mesos, or null
    const mw = T.words.mesos; if (!mw) return null;
    const at = slide(ink, mw, 0, GW); if (at.score < 0.7) return null;
    const gs = groupsOf(ink, at.x + mw.w + 1);
    if (gs.length < 4) return null;
    for (let i = 1; i < gs.length; i++) if (gs[i].x - gs[i - 1].x > MAX_ADVANCE) return null;
    // the frame must really be ( + ... ): a hidden last digit or ")" would otherwise read as a shorter number
    if (glyphs) for (const [g, k] of [[gs[0], '('], [gs[1], '+'], [gs[gs.length - 1], ')']]) {
      if (!glyphs[k]) return null;
      const sc = Math.max(...glyphs[k].map(t => dice(t, g)));
      // a bare "1" looks like ")": the frame piece has to beat every digit as well
      const dg = Math.max(0, ...Object.keys(glyphs).filter(d => /\d/.test(d)).map(d => Math.max(...glyphs[d].map(t => dice(t, g)))));
      if (sc < FRAME_OK || sc - dg < 0.04) return null;
    }
    return gs.slice(2, -1);
  }
  function learnDigits(lines) {
    const glyphs = {};
    for (const l of lines) {
      const ink = inkOf(l.ink), all = digitGroups(ink), want = String(l.amount);
      if (!all || all.length !== want.length) continue;
      const mw = T.words.mesos, at = slide(ink, mw, 0, GW), gs = groupsOf(ink, at.x + mw.w + 1);
      const keep = (k, g) => { const list = glyphs[k] || (glyphs[k] = []); if (!list.some(o => dice(o, g) > 0.95) && list.length < 8) list.push({ w: g.w, rows: g.rows }); };
      keep('(', gs[0]); keep('+', gs[1]); keep(')', gs[gs.length - 1]);
      all.forEach((g, i) => keep(want[i], g));
    }
    return glyphs;
  }
  function readMesosInk(rows, glyphs) {
    glyphs = glyphs || T.glyphs;
    const gs = digitGroups(inkOf(rows), glyphs);
    if (!gs || !gs.length || gs.length > 6) return { amount: null, why: 'unsure' };
    let n = 0;
    for (const g of gs) {
      const sc = Object.keys(glyphs).filter(d => /\d/.test(d)).map(d => [d, Math.max(...glyphs[d].map(t => dice(t, g)))]).sort((a, b) => b[1] - a[1]);
      if (!sc.length || sc[0][1] < DIGIT_OK || (sc[1] && sc[0][1] - sc[1][1] < DIGIT_MARGIN)) return { amount: null, why: 'unsure' };
      n = n * 10 + +sc[0][0];
    }
    return { amount: n };
  }
  function readMesos(img, row) { return readMesosInk(rowInk(toGame(img).white, row)); }

  // ---- item lines: "<name> x<qty> earned. (<tab>)" ----
  const TABS = { '(Etc)': 'Etc', '(Use)': 'Use', '(Equip)': 'Equip' };
  function itemGroups(ink) {   // the glyph groups left of "earned." (name and "x1"), and where "earned." starts
    const ew = T.words['earned.']; if (!ew) return null;
    const at = slide(ink, ew, 0, GW); if (at.score < 0.6) return null;
    return { earnedX: at.x, groups: groupsOf(ink, 0).filter(g => g.x + g.w <= at.x) };
  }
  // quantity: the groups just before "earned." are x then the digits; a missing x or an unsure digit gives null
  function readItemInk(rows) {
    const ink = inkOf(rows), ig = itemGroups(ink), out = { tab: null, qty: null, nameImg: null };
    if (!ig) return out;
    for (const k in TABS) if (T.words[k]) { const e = slide(ink, T.words[k], ig.earnedX + T.words['earned.'].w, GW); if (e.score >= 0.8 && (!out.tab || e.score > out.score)) { out.tab = TABS[k]; out.score = e.score; } }
    delete out.score;
    const gs = ig.groups, glyphs = T.glyphs, xs = glyphs && glyphs.x;
    if (!xs || !gs.length) return out;
    const digitsOf = g => Object.keys(glyphs).filter(d => /\d/.test(d)).map(d => [d, Math.max(...glyphs[d].map(t => dice(t, g)))]).sort((a, b) => b[1] - a[1]);
    // walk back over the digit groups (advance of at most 9 between starts) while they read as digits
    let i = gs.length - 1, n = '';
    for (; i >= 0 && n.length < 5; i--) {
      const dg = digitsOf(gs[i]);
      if (!dg.length || dg[0][1] < DIGIT_OK || (dg[1] && dg[0][1] - dg[1][1] < DIGIT_MARGIN)) break;
      if (i < gs.length - 1 && gs[i + 1].x - gs[i].x > MAX_ADVANCE) break;
      n = dg[0][0] + n;
    }
    if (!n || n.length > 4) return out;
    // the x is the ink just left of the first digit (a faded x breaks into pieces, so it is cut as one piece)
    const d0 = gs[i + 1].x, x = xRegion(ink, d0);
    if (!x || Math.max(...xs.map(t => dice(t, x))) < DIGIT_OK) return out;
    out.qty = +n; out.nameImg = { w: x.x, rows: ink.map(r => Array.from(r.slice(0, x.x), v => v ? '#' : '.').join('')) };
    return out;
  }
  function xRegion(ink, d0) {   // columns d0-8 .. d0-1 as one glyph, trimmed
    const cols = []; for (let c = Math.max(0, d0 - 8); c < d0; c++) if (ink.some(r => r[c])) cols.push(c);
    if (!cols.length) return null;
    const x0 = cols[0], x1 = cols[cols.length - 1];
    return { x: x0, w: x1 - x0 + 1, rows: ink.map(r => Array.from(r.slice(x0, x1 + 1), v => v ? '#' : '.').join('')) };
  }
  function readItem(img, row, m) { return readItemInk(rowInk(toGame(img).white, row)); }

  // the one name that starts with the cut off text, ignoring case
  function matchName(start, candidates) {
    const s = String(start || '').trim().toLowerCase();
    if (!s) return { name: null, why: 'none' };
    const hits = [...new Set((candidates || []).filter(c => c.toLowerCase().startsWith(s)))];
    return hits.length === 1 ? { name: hits[0] } : { name: null, why: hits.length ? 'ambiguous' : 'none' };
  }

  function setTemplates(t) { T = { words: {}, glyphs: {}, ...t }; for (const k in T.words) delete T.words[k].mask; for (const k in T.glyphs) for (const g of T.glyphs[k]) delete g.mask; }

  // ---- for tools/make-pickup-templates.js: cut a labelled row into words ----
  function wordsOf(img, row, text) {
    const g = toGame(img), cov = img.kind === 'yellow' ? g.yellow : g.white, ink = rowInk(cov, row);
    const cols = []; for (let x = 0; x < GW; x++) cols.push(ink.some(r => r[x]) ? 1 : 0);
    const want = text.split(/\s+/);
    // the smallest gap between words that cuts the row into as many words as the label has
    const cut = minGap => { const spans = []; let s = -1, gap = 0;
      for (let x = 0; x <= GW; x++) { if (x < GW && cols[x]) { if (s < 0) s = x; gap = 0; } else if (s >= 0 && (++gap >= minGap || x === GW)) { spans.push([s, x - gap]); s = -1; gap = 0; } }
      return spans; };
    let spans = [];
    for (let g = 2; g <= 9; g++) { spans = cut(g); if (spans.length <= want.length) break; }
    if (spans.length !== want.length) return { error: 'found ' + spans.length + ' words, label has ' + want.length, spans };
    return { words: want.map((t, i) => ({ text: t, x: spans[i][0], w: spans[i][1] - spans[i][0] + 1, rows: ink.map(r => Array.from(r.slice(spans[i][0], spans[i][1] + 1), v => v ? '#' : '.').join('')) })) };
  }

  root.PickupLines = { mesosOn: () => T.mesosGate !== false, stripArea, toGame, rowsOf, setTemplates, wordsOf, births, createTracker, learnDigits, readMesosInk, readMesos, readItem, matchName, MESOS_GATE, ROWS, GW, GH, _slide: slide, _tpl: () => T, _rowInk: rowInk, _readItemInk: readItemInk, _itemGroups: (rows) => itemGroups(inkOf(rows)), _xRegion: (rows, d0) => xRegion(inkOf(rows), d0), _dice: dice };
})(typeof window !== 'undefined' ? window : globalThis);
