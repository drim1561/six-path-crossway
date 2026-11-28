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

  // ink coverage at game scale: white (min rgb > 185) and yellow, each 0..1 per game pixel. The game draws every line with a
  // dark outline, so a bright pixel counts only with the outline on both sides of it within R frame pixels, left and right or
  // above and below: a sunlit rock (yellow) or mist (white) behind the lines has no outline round it and stays out.
  // edge is white with a dark pixel within R on any one side: the outline is see through, so over pale sand only the inside of
  // a digit (where two outlines overlap) and its drop shadow stay dark, and a digit's outer strokes have dark on one side only.
  // The mesos digits read from it; the row kinds and item lines keep white.
  function toGame(img) {
    const k = img.w / GW, white = new Float32Array(GW * GH), yellow = new Float32Array(GW * GH), edge = new Float32Array(GW * GH), yedge = new Float32Array(GW * GH), faint = new Float32Array(GW * GH), d = img.data;
    const W = img.w, H = img.h, n = W * H, R = Math.ceil(k) + 1, kind = new Uint8Array(n), dark = new Uint8Array(n), bright = new Uint8Array(n), gold = new Uint8Array(n), dim = new Uint8Array(n);
    for (let p = 0; p < n; p++) {
      const i = p * 4, r = d[i], g = d[i + 1], b = d[i + 2], mn = Math.min(r, g, b), mx = Math.max(r, g, b);
      if (r > 160 && g > 140 && b < 160 && r - b > 50) gold[p] = 1;   // yellow edge ink: the EXP and bonus digits
      if ((r > 120 && g > 100 && r - b > 30) || (mn > 130 && mx - mn < 60)) dim[p] = 1;   // faint ink: a second look at EXP digits
      if (mn > WHITE_T) bright[p] = 1;   // edge ink takes any bright pixel: the video's colour bleed tints white strokes over sand
      if (mx < DARK) dark[p] = 1; else if (mn > WHITE_T && mx - mn < 50) kind[p] = 1; else if (r > 170 && g > 170 && b < 140 && r - b > 65) kind[p] = 2;
    }
    // framed[p]: the nearest dark pixel left and right (or up and down) are each within R
    // edged[p]: a dark pixel within R on any side (framed is always edged too)
    const near = new Uint8Array(n), framed = new Uint8Array(n), edged = new Uint8Array(n);
    for (let y = 0; y < H; y++) {
      let last = -1e9; for (let x = 0; x < W; x++) { const p = y * W + x; if (dark[p]) last = x; else if (x - last <= R) near[p] = edged[p] = 1; }
      last = 1e9; for (let x = W - 1; x >= 0; x--) { const p = y * W + x; if (dark[p]) last = x; else if (last - x <= R) { edged[p] = 1; if (near[p]) framed[p] = 1; } }
    }
    near.fill(0);
    for (let x = 0; x < W; x++) {
      let last = -1e9; for (let y = 0; y < H; y++) { const p = y * W + x; if (dark[p]) last = y; else if (y - last <= R) near[p] = edged[p] = 1; }
      last = 1e9; for (let y = H - 1; y >= 0; y--) { const p = y * W + x; if (dark[p]) last = y; else if (last - y <= R) { edged[p] = 1; if (near[p]) framed[p] = 1; } }
    }
    for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
      const x0 = Math.round(gx * k), x1 = Math.max(x0 + 1, Math.round((gx + 1) * k)), y0 = Math.round(gy * k), y1 = Math.max(y0 + 1, Math.round((gy + 1) * k));
      let w = 0, y = 0, s = 0, ys = 0, fs = 0, c = 0;
      for (let yy = y0; yy < y1 && yy < H; yy++) for (let xx = x0; xx < x1 && xx < W; xx++) {
        const p = yy * W + xx; c++;
        if (bright[p] && edged[p]) s++;
        if (gold[p] && edged[p]) ys++;
        if (dim[p] && edged[p]) fs++;
        if (!framed[p]) continue;
        if (kind[p] === 1) w++; else if (kind[p] === 2) y++;
      }
      white[gy * GW + gx] = c ? w / c : 0; yellow[gy * GW + gx] = c ? y / c : 0; edge[gy * GW + gx] = c ? s / c : 0; yedge[gy * GW + gx] = c ? ys / c : 0; faint[gy * GW + gx] = c ? fs / c : 0;
    }
    return { white, yellow, edge, yedge, faint };
  }
  const INK = 0.3, WHITE_T = 185, DARK = 150;
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

  // YELLOW_MIN: the faintest real EXP line in the fixtures has 63 yellow pixels; an item line over sand scaled down picks up 49
  const WHITE_MIN = 40, YELLOW_MIN = 55, WORD_OK = 0.8, PAIR_OK = 0.44, PAIR_GAP = 41;
  // how well 'gained' and 'mesos' fit side by side, PAIR_GAP apart (give or take 3): each word's best spot, the other
  // looked for beside it, and the better of the two pairs' average
  function pairOf(w) {
    const g = T.words.gained, ms = T.words.mesos; if (!g || !ms) return 0;
    const a = slide(w, ms), b = slide(w, g);
    return Math.max(a.score + slide(w, g, a.x - PAIR_GAP - 3, a.x - PAIR_GAP + 3).score, b.score + slide(w, ms, b.x + PAIR_GAP - 3, b.x + PAIR_GAP + 3).score) / 2;
  }
  // 6 chars, index 0 top, 5 newest: E an EXP or bonus line (yellow, or a white EXP line), I item line, M mesos line, ? ink that is none of those (a fading
  // line, another tab ending, a window over it), . nothing
  // rows: the 6 letters; sig: each row's ink as white or yellow pixels per column (6 arrays of GW counts, 0 to BH), which
  // the tracker compares between reads to tell how far the stack moved
  function readRows(img) {
    const g = toGame(img), out = [], sig = [];
    for (let i = 0; i < ROWS; i++) {
      const y = rowInk(g.yellow, i), w = rowInk(g.white, i), yn = count(y), wn = count(w), s = new Uint8Array(GW);
      for (let x = 0; x < GW; x++) for (let r = 0; r < BH; r++) if (w[r][x] || y[r][x]) s[x]++;
      sig.push(s);
      if (yn >= YELLOW_MIN && yn > wn) { out.push('E'); continue; }
      if (wn >= WHITE_MIN) {
        // a mesos line: 'gained' or 'mesos' fits well and clearly better than an item line's 'earned.'
        // (over Excavation's bright sand a clean mesos line scores 0.55 to 0.65; no other line reaches a 0.15 lead).
        // Checked before the tab, since a mesos line over sand can come near an item line's tab score but never its lead.
        // The two words must also sit 41 apart, as in "gained mesos": a white "You received EXP (+35)" line over sand fits
        // 'mesos' alone at 0.56, but as a pair 0.41 at most, where every real mesos line pairs at 0.46 or more.
        const sc = n => T.words[n] ? slide(w, T.words[n]).score : 0, e = sc('earned.'), m = Math.max(sc('gained'), sc('mesos'));
        if (m >= 0.55 && m - e >= 0.15 && pairOf(w) >= PAIR_OK) { out.push('M'); continue; }
        if (tabOf(w)) { out.push('I'); continue; }
        // a white EXP line (your own killing hit): its right end reads as "EXP (+n)"
        const x = readExpInk(bothInk(rowInk(g.edge, i), rowInk(g.yedge, i)), undefined, rowInk(g.faint, i));
        out.push(x && x.word === 'EXP' ? 'E' : '?'); continue;
      }
      out.push(wn + yn >= 12 ? '?' : '.');
    }
    return { rows: out.join(''), sig };
  }
  const rowsOf = img => readRows(img).rows;


  // ---- new lines vs lines that moved up ----
  // The stack scrolls up as lines arrive, so the new read is the old one shifted up by 0 to 5 rows (a kill can drop four lines
  // in half a second). With each row's ink (sig, see readRows) the shift is the one where the most rows keep the same ink: a
  // row pair whose column profiles match (SIG_SAME, within a column) scores 1, one that clearly differs (under SIG_DIFF) -1.
  // Two mesos lines differ only in their digits, so they must match closer (SIG_SAME_M) before they say the stack held. A line
  // can fade between reads (SIG_FADE, a small cost) but ink never appears in a row the stack moved onto (SIG_APPEAR, a full
  // vote against). A row with less than SIG_MIN ink is empty (specks of sand or mist that change between
  // reads would otherwise vote the stack up and birth a line that never moved). Ink sees a ?
  // row and tells two item lines apart, which letters can't (quick double pickups read as too small a shift). Without ink only
  // the known letters vote: agreeing rows minus disagreeing ones. A tie takes the smaller shift. A line of the new read is a
  // birth where no known line sat before it after the shift (nothing, a row never read, a different line, or the same letter
  // with clearly different ink). prev is what each row was last known as (see shiftKnown); ps and ns are the two reads' ink.
  const isLine = c => c === 'I' || c === 'M' || c === 'E';
  const SIG_SAME = 0.6, SIG_SAME_M = 0.8, SIG_DIFF = 0.35, SIG_FADE = -0.25, SIG_APPEAR = -1, SIG_MIN = 40;
  const sumOf = a => { let n = 0; for (let i = 0; i < a.length; i++) n += a[i]; return n; };
  // how alike two rows' column profiles are: 2 * shared ink / both inks, best over a shift of one column
  function sigSim(a, b) {
    const na = sumOf(a), nb = sumOf(b); if (!na || !nb) return 0; let best = 0;
    for (let dx = -1; dx <= 1; dx++) { let m = 0; for (let x = 0; x < a.length; x++) { const v = b[x + dx]; if (v) m += Math.min(a[x], v); } best = Math.max(best, 2 * m / (na + nb)); }
    return best;
  }
  function shiftOf(prev, next, ps, ns) {
    // a tie (sand can score two shifts the same) goes to the shift that lines up more mesos lines with like ink
    let best = 0, bestScore = -Infinity, bestM = -1;
    for (let sh = 0; sh < prev.length; sh++) {
      let sc = 0, mm = 0;
      for (let j = sh; j < prev.length; j++) {
        if (ps && ns) {
          const a = ps[j], b = ns[j - sh], ia = sumOf(a) >= SIG_MIN, ib = sumOf(b) >= SIG_MIN;
          if (ia && ib) {
            const s = sigSim(a, b), both = prev[j] === 'M' && next[j - sh] === 'M';
            sc += s >= (both ? SIG_SAME_M : SIG_SAME) ? 1 : s < SIG_DIFF ? -1 : 0;
            if (both && s >= SIG_SAME) mm++;
          } else if (ia) sc += SIG_FADE; else if (ib) sc += SIG_APPEAR;
        } else { const a = prev[j], b = next[j - sh]; if (isLine(a) && isLine(b)) sc += a === b ? 1 : -1; }
      }
      if (sc > bestScore + 1e-9 || (Math.abs(sc - bestScore) < 1e-9 && mm > bestM)) { bestScore = sc; best = sh; bestM = mm; }
    }
    return best;
  }
  function births(prev, next, ps, ns) {
    const out = [];
    if (prev == null) { for (let i = 0; i < next.length; i++) if (isLine(next[i])) out.push(i); return out; }
    const best = shiftOf(prev, next, ps, ns), ink = ps && ns;
    for (let i = 0; i < next.length; i++) {
      if (!isLine(next[i])) continue;
      const src = prev[i + best];
      if (!isLine(src) || src !== next[i] || (ink && sigSim(ps[i + best], ns[i]) < SIG_DIFF)) out.push(i);
    }
    return out;
  }
  // what each row is known as after this read: a line or nothing as read, a ? keeps what its row was known as (moved with the
  // stack), so a line that blurs for a read and comes back is not new
  function shiftKnown(prev, next, sh) {
    if (prev == null) return next;
    let out = '';
    for (let i = 0; i < next.length; i++) out += next[i] === '?' ? (prev[i + sh] || '?') : next[i];
    return out;
  }

  // Feeds reads in time order, with the read's ink (readRows' sig) when there is one. Lines on screen at the first read were
  // there before tracking started, so none of them is new. A gap over 5 s means lines may have come and gone unseen, so the
  // stack starts over and every line on it counts as new.
  function createTracker() {
    let known = null, kSig = null, last = null;
    return { feed(rows, tMs, sig) {
      let b, sh = 0;
      if (last == null) b = [];
      else if (tMs - last > 5000) { b = births(null, rows); known = null; }
      else { const ps = sig && kSig, ns = ps && sig; sh = shiftOf(known, rows, ps, ns); b = births(known, rows, ps, ns); }
      known = shiftKnown(known, rows, sh); kSig = sig || null; last = tMs; return { births: b };
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
  function mesosInk(img, row) { return rowInk(toGame(img).edge, row); }   // a mesos line's row, from the one sided edge ink
  function readMesos(img, row) { return readMesosInk(mesosInk(img, row)); }

  // ---- EXP and bonus lines: "You received EXP (+47)" and "Bonus EXP for PARTY (+14)" ----
  // Both are right aligned like every pickup line, so the number is read from the right end: ")" last, the digits, "+" and "("
  // before them, each matched to the mesos glyphs (white and yellow digits are one font). The word just left of "(" says the
  // kind: "EXP" (caps, about 21 game px) or "PARTY" (caps, about 33), so a line whose left end is covered by a window still
  // reads. The colour is the ink of that right end: white (Rimmah landed the killing hit) or yellow (a party member did); the
  // bonus line is always yellow. Anything doubtful is left out (null), never guessed.
  const EXP_W = [17, 26], PARTY_W = [29, 37], CAPS_OK = 0.6, COLOUR_LEAD = 2;
  const digitScores = (glyphs, g) => Object.keys(glyphs).filter(d => /\d/.test(d)).map(d => [d, Math.max(...glyphs[d].map(t => dice(t, g)))]).sort((a, b) => b[1] - a[1]);
  function framePiece(glyphs, g, k) {   // g is the frame piece k: it fits k well and clearly better than any digit
    if (!glyphs[k]) return false;
    const sc = Math.max(...glyphs[k].map(t => dice(t, g))), dg = digitScores(glyphs, g);
    return sc >= FRAME_OK && sc - (dg.length ? dg[0][1] : 0) >= 0.04;
  }
  // Thick yellow strokes often join a glyph to its neighbour ("14)" as one group). A group wider than any one glyph is split
  // at the column where both halves fit some glyph best, as long as both fit well (DIGIT_OK); otherwise it stays whole.
  const GLYPH_W = 7, DIGIT_H = 8, DIGIT_W = 4;
  const bestFit = (glyphs, g) => Math.max(0, ...Object.keys(glyphs).filter(k => k !== 'x').map(k => Math.max(...glyphs[k].map(t => dice(t, g)))));
  function cutGroup(g, a, b) {   // columns a..b-1 of group g, trimmed to its ink
    const on = x => g.rows.some(r => r[x] === '#'); while (a < b && !on(a)) a++; while (b > a && !on(b - 1)) b--;
    return a < b ? { x: g.x + a, w: b - a, rows: g.rows.map(r => r.slice(a, b)) } : null;
  }
  function splitGroup(glyphs, g, depth) {
    if (g.w <= GLYPH_W || depth > 3) return [g];
    let best = null;
    for (let c = 2; c <= g.w - 2; c++) {
      const L = cutGroup(g, 0, c), R = cutGroup(g, c, g.w); if (!L || !R || L.w > GLYPH_W + 2 || R.w > 3 * GLYPH_W) continue;
      const sc = Math.min(bestFit(glyphs, L), R.w <= GLYPH_W ? bestFit(glyphs, R) : 1);
      if (!best || sc > best.sc) best = { sc, L, R };
    }
    if (!best || best.sc < DIGIT_OK) return [g];
    const rest = splitGroup(glyphs, best.R, depth + 1);
    return rest.length === 1 && best.R.w > GLYPH_W ? [g] : [best.L, ...rest];
  }
  // ink: BH rows of the line's number ink (white and yellow edge ink together). { amount, word: 'EXP' | 'PARTY' | null,
  // x0: where that word starts } or null
  function readExpInk(rows, glyphs, faintRows) {
    glyphs = glyphs || T.expAll || T.glyphs; const ink = inkOf(rows), gs = [], faint = faintRows && inkOf(faintRows);
    for (const g of groupsOf(ink, 0)) gs.push(...(g.x >= GW - 60 ? splitGroup(glyphs, g, 0) : [g]));
    if (gs.length < 5 || !framePiece(glyphs, gs[gs.length - 1], ')')) return null;
    let i = gs.length - 2; const ds = [];
    for (; i >= 1 && ds.length <= 6; i--) {
      if (gs[i + 1].x - gs[i].x > MAX_ADVANCE) return null;
      if (framePiece(glyphs, gs[i], '+')) break;
      ds.unshift(gs[i]);
    }
    if (i < 1 || !ds.length || ds.length > 6 || gs[i].x - gs[i - 1].x > MAX_ADVANCE || !framePiece(glyphs, gs[i - 1], '(')) return null;
    let n = 0;
    for (const g of ds) {
      // a digit stands the full height (9 rows): the top half of a 2 is the top half of a 3, so a line caught half in this
      // row (mid scroll) or half covered must not read
      const tall = g.rows.reduce((a, r, y) => r.includes('#') ? [Math.min(a[0], y), Math.max(a[1], y)] : a, [BH, -1]);
      if (tall[1] - tall[0] + 1 < DIGIT_H) return null;
      const sc = digitScores(glyphs, g);
      if (!sc.length || sc[0][1] < DIGIT_OK || (sc[1] && sc[0][1] - sc[1][1] < DIGIT_MARGIN)) return null;
      // and every digit but 1 is about 5 wide: the right half of a broken 8 is a 3 narrowed to 3 columns
      if (sc[0][0] !== '1' && g.w < DIGIT_W) return null;
      // a second look in the faint ink: a thin 8 whose left strokes are lost reads as a 3 (a 3 is an 8 less two strokes,
      // a 9 an 8 less one), so the faint ink of the same columns must not fit another digit clearly better
      if (faint) {
        const fg = cutGroup({ x: g.x - 1, w: g.w + 2, rows: faint.map(r => Array.from(r.slice(Math.max(0, g.x - 1), g.x + g.w + 1), v => v ? '#' : '.').join('')) }, 0, g.w + 2);
        if (fg) { const fsc = digitScores(glyphs, fg), mine = (fsc.find(d => d[0] === sc[0][0]) || [0, 0])[1]; if (fsc[0][0] !== sc[0][0] && fsc[0][1] - mine >= DIGIT_MARGIN) return null; }
      }
      n = n * 10 + +sc[0][0];
    }
    const left = gs[i - 1].x;
    // the word left of "(": groups closer than a space, after a space's gap
    let j = i - 2;
    if (j < 0 || left - (gs[j].x + gs[j].w) < SPACE_GAPS[0]) return { amount: n, word: null };
    let x0 = gs[j].x; const x1 = gs[j].x + gs[j].w;
    for (j--; j >= 0 && x0 - (gs[j].x + gs[j].w) < SPACE_GAPS[0]; j--) x0 = gs[j].x;
    // capitals: ink in the top rows across most of the word ("mesos" is all x height)
    let top = 0, cols = 0;
    for (let x = x0; x < x1; x++) { if (!ink.some(r => r[x])) continue; cols++; if (ink[0][x] || ink[1][x] || ink[2][x]) top++; }
    const w = x1 - x0, caps = cols && top / cols >= CAPS_OK;
    const word = !caps ? null : w >= EXP_W[0] && w <= EXP_W[1] ? 'EXP' : w >= PARTY_W[0] && w <= PARTY_W[1] ? 'PARTY' : null;
    return { amount: n, word, x0 };
  }
  // the EXP and bonus lines of a strip: 6 rows, top to bottom, each null or { kind: 'E' (You received EXP) or 'B' (Bonus EXP
  // for PARTY), colour: 'white' or 'yellow', amount }
  const bothInk = (e, y) => e.map((row, j) => row.map((v, x) => v || y[j][x] ? 1 : 0));
  function expInk(img, row) { const g = toGame(img); return bothInk(rowInk(g.edge, row), rowInk(g.yedge, row)); }
  function expFaint(img, row) { return rowInk(toGame(img).faint, row); }
  // glyphs for EXP and bonus lines: the mesos glyphs and the ones learned from EXP lines (yellow strokes come out a little
  // thicker than white ones), up to 8 of each
  function mergeGlyphs(a, b) {
    const out = {}; for (const src of [a || {}, b || {}]) for (const k in src) { const l = out[k] || (out[k] = []); for (const g of src[k]) if (l.length < 16) l.push(g); }
    return out;
  }
  // learn glyphs from labelled EXP and bonus lines ({ ink: expInk rows, amount }): only a line whose right end cuts by blank
  // columns into exactly ( + digits ), with a space before "(", teaches its shapes
  const LEARN_OK = 0.75;
  function learnExpDigits(lines, base) {
    const glyphs = {}; base = base === undefined ? T.glyphs : base;
    const keep = (k, g) => { const list = glyphs[k] || (glyphs[k] = []); if (!list.some(o => dice(o, g) > 0.95) && list.length < 8) list.push({ w: g.w, rows: g.rows }); };
    for (const l of lines) {
      const ink = inkOf(l.ink), gs = groupsOf(ink, 0), want = String(l.amount), n = want.length + 3;
      if (gs.length < n + 1) continue;
      const tail = gs.slice(-n), before = gs[gs.length - n - 1];
      if (tail.some(g => g.w > GLYPH_W) || tail[0].x - (before.x + before.w) < SPACE_GAPS[0]) continue;
      if (tail.some((g, i) => i && g.x - tail[i - 1].x > MAX_ADVANCE)) continue;
      // every piece must already look like what the label says (by the mesos glyphs), so a thin or broken stroke never
      // teaches a shape that half of another digit could fit
      const keys = ['(', '+', ...want, ')'];
      if (base && tail.some((g, i) => !base[keys[i]] || Math.max(...base[keys[i]].map(t => dice(t, g))) < LEARN_OK)) continue;
      tail.forEach((g, i) => keep(keys[i], g));
    }
    return glyphs;
  }
  function readExp(img, glyphs) {
    const g = toGame(img), out = [];
    glyphs = glyphs || T.expAll;
    for (let r = 0; r < ROWS; r++) {
      const e = rowInk(g.edge, r), y = rowInk(g.yedge, r), ink = bothInk(e, y);
      const got = readExpInk(ink, glyphs, rowInk(g.faint, r));
      if (!got || !got.word) { out.push(null); continue; }
      let wn = 0, yn = 0;
      for (let j = 0; j < BH; j++) for (let x = got.x0; x < GW; x++) { if (e[j][x]) wn++; if (y[j][x]) yn++; }
      const colour = yn >= COLOUR_LEAD * wn ? 'yellow' : wn >= COLOUR_LEAD * yn ? 'white' : null;
      // the bonus line is only ever yellow: a white "PARTY" is not a line we know
      if (!colour || (got.word === 'PARTY' && colour !== 'yellow')) { out.push(null); continue; }
      out.push({ kind: got.word === 'EXP' ? 'E' : 'B', colour, amount: got.amount });
    }
    return out;
  }

  // ---- item lines: "<name> x<qty> earned. (<tab>)" ----
  // Item lines are right aligned, so "earned." starts at a set spot for each tab ending and the ending sits 45 to its right.
  // A row is an item line when "earned." plus the ending at one tab's spot clearly beat the other two spots (a faded or
  // covered ending still counts when "earned." is plain there, and a stray "earned." look alike elsewhere never does).
  // Over Excavation's sand and mist a real item line's two scores add to 0.76 to 0.9 with "earned." near 0.4, while the
  // closest other line (a mesos line) leads the next tab by at most 0.18, so the lead is what keeps them apart.
  const TAB_AT = { Etc: 192, Use: 186, Equip: 177 }, TAB_SUM = 0.8, TAB_E = 0.35, TAB_MARGIN = 0.2;
  function tabOf(ink) {
    const ew = T.words['earned.']; if (!ew) return null;
    const sc = [];
    for (const k in TAB_AT) {
      const tw = T.words['(' + k + ')']; if (!tw) continue;
      const e = slide(ink, ew, TAB_AT[k] - 2, TAB_AT[k] + 2), s = slide(ink, tw, e.x + 43, e.x + 47);
      sc.push({ tab: k, x: e.x, e: e.score, sum: e.score + s.score });
    }
    sc.sort((a, b) => b.sum - a.sum); const b = sc[0];
    if (!b || b.sum < TAB_SUM || b.e < TAB_E || (sc[1] && b.sum - sc[1].sum < TAB_MARGIN)) return null;
    return b;
  }
  function itemGroups(ink) {   // the glyph groups left of "earned." (name and "x1"), where "earned." starts, and the tab
    const t = tabOf(ink); if (!t) return null;
    return { earnedX: t.x, tab: t.tab, groups: groupsOf(ink, 0).filter(g => g.x + g.w <= t.x) };
  }
  // quantity: the groups just before "earned." are x then the digits; a missing x or an unsure digit gives null
  function readItemInk(rows) {
    const ink = inkOf(rows), ig = itemGroups(ink), out = { tab: null, qty: null, nameImg: null };
    if (!ig) return out;
    out.tab = ig.tab;
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

  // ---- item names ----
  // A name is read from its own ink: each game pixel's centre sampled from the frame (bilinear), white (min rgb over 170,
  // grey) with a dark outline pixel (max rgb under 150) among its 8 neighbours. The coverage ink above blurs a stretched
  // name's letters together; the centre sample keeps the 1 to 2 px gaps inside a word. NH rows, from one above the row's top.
  const NH = 14, NAME_WHITE = 170, NAME_OK = 0.8, NAME_MARGIN = 0.06, X_OK = 0.7, REF_W = 36, NAME_GAP = 6;   // a gap wider than a space ends the name (scenery further left is not text)
  const SPACE_GAPS = [4, 5], LETTER_GAPS = [1, 2], X_AT = [[15, 17], [19, 23], [24, 29]];   // x1, x10, x100: the x starts this far left of "earned."
  const NAME_LINE = /^(.+) x\d+ earned\. \((\w+)\)$/;
  function nameInk(img, row, white) {   // white: a lower floor for a labelled line from a soft recording (the templates tool only)
    const W = img.w, H = img.h, d = img.data, k = W / GW, top = rowTop(row) - 2, n = NH + 2, mn = [], mx = [];
    const px = (x, y, c) => d[((y < 0 ? 0 : y >= H ? H - 1 : y) * W + (x < 0 ? 0 : x >= W ? W - 1 : x)) * 4 + c];
    for (let j = 0; j < n; j++) {
      const a = new Float32Array(GW), m = new Float32Array(GW), fy = (top + j + 0.5) * k - 0.5, y0 = Math.floor(fy), ay = fy - y0;
      for (let x = 0; x < GW; x++) {
        const fx = (x + 0.5) * k - 0.5, x0 = Math.floor(fx), ax = fx - x0; let lo = 255, hi = 0;
        for (let c = 0; c < 3; c++) {
          const v = (px(x0, y0, c) * (1 - ax) + px(x0 + 1, y0, c) * ax) * (1 - ay) + (px(x0, y0 + 1, c) * (1 - ax) + px(x0 + 1, y0 + 1, c) * ax) * ay;
          if (v < lo) lo = v; if (v > hi) hi = v;
        }
        a[x] = lo; m[x] = hi;
      }
      mn.push(a); mx.push(m);
    }
    const dark = (x, y) => y >= 0 && y < n && x >= 0 && x < GW && mx[y][x] < DARK, out = [];
    for (let y = 1; y <= NH; y++) {
      let s = '';
      for (let x = 0; x < GW; x++) {
        const w = mn[y][x] > (white || NAME_WHITE) && mx[y][x] - mn[y][x] < 60;
        s += w && (dark(x - 1, y) || dark(x + 1, y) || dark(x, y - 1) || dark(x, y + 1) || dark(x - 1, y - 1) || dark(x + 1, y + 1) || dark(x - 1, y + 1) || dark(x + 1, y - 1)) ? '#' : '.';
      }
      out.push(s);
    }
    return out;
  }
  const colOn = (b, x) => { for (let y = 1; y < 13; y++) if (b[y] && b[y][x]) return true; return false; };
  function nameGroups(b, e) {   // [start, width] of each run of inked columns left of e
    const g = []; let s = -1;
    for (let x = 0; x <= e; x++) { const on = x < e && colOn(b, x); if (on && s < 0) s = x; if (!on && s >= 0) { g.push([s, x - s]); s = -1; } }
    return g;
  }
  function nameWords(g) {   // groups closer than a space (4 px) are one word
    const w = [];
    for (const q of g) { const l = w[w.length - 1], p = l && l[l.length - 1]; if (p && q[0] - (p[0] + p[1]) < SPACE_GAPS[0]) l.push(q); else w.push([q]); }
    return w;
  }
  function diceAt(A, B, ax, ay, bx, by, w, h) {
    let i = 0, a = 0, b = 0;
    for (let y = 0; y < h; y++) { const ra = A[ay + y], rb = B[by + y]; for (let x = 0; x < w; x++) { const p = ra && ra[ax + x] || 0, q = rb && rb[bx + x] || 0; a += p; b += q; i += p & q; } }
    return a + b ? 2 * i / (a + b) : 0;
  }
  const cutCols = (b, s, w) => b.map(r => r.slice(s, s + w));
  // the stretch can round a line a pixel or two up or down: line it up with the reference "earned." at its tab spot
  function lineUp(raw, ex, ref) {
    let best = -1, dy0 = 0;
    for (let dy = -2; dy <= 2; dy++) { const s = diceAt(ref, raw, 0, 1, ex, 1 + dy, REF_W, 12); if (s > best) { best = s; dy0 = dy; } }
    const o = []; for (let y = 0; y < NH; y++) o.push(raw[y + dy0] || new Uint8Array(GW));
    return o;
  }
  // letters from labelled item lines ({ ink: nameInk, text: "Red Potion x1 earned. (Use)" }): a word gives its letters only
  // when it splits into exactly one group per character (so letters that touch never teach a wrong shape); the x of "x1"
  // comes from every line. touch: ['ry'] on a line names letter pairs the game draws touching (the y tucks under the r of
  // Fairy's); the pair is learned as one shape under its two letter key. Up to 8 shapes per character. 'earned.' is the reference that lines rows up.
  function learnLetters(lines) {
    const L = {}; let ref = null;
    const add = (ch, g) => { const v = L[ch] || (L[ch] = []); if (v.length < 8 && !v.some(t => t[0].length === g[0].length && diceAt(t, g, 0, 0, 0, 0, g[0].length, NH) > 0.95)) v.push(g); };
    for (const l of lines) {
      const m = NAME_LINE.exec(l.text || ''); if (!m || !TAB_AT[m[2]]) continue;
      const ex = TAB_AT[m[2]], raw = inkOf(l.ink);
      if (!ref) ref = cutCols(raw, ex, REF_W);
      const b = lineUp(raw, ex, ref), W = nameWords(nameGroups(b, ex - 2)), nw = m[1].split(' ');
      if (W.length - 1 === nw.length) nw.forEach((w, i) => { const tk = []; for (let j = 0; j < w.length; j++) { if ((l.touch || []).includes(w.slice(j, j + 2))) { tk.push(w.slice(j, j + 2)); j++; } else tk.push(w[j]); }
        if (W[i].length === tk.length) tk.forEach((ch, j) => add(ch, cutCols(b, W[i][j][0], W[i][j][1]))); });
      const xw = W[W.length - 1]; if (xw && xw.length >= 2 && xw[0][1] <= 7) add('x', cutCols(b, xw[0][0], xw[0][1]));
    }
    if (ref) L['earned.'] = [ref];
    const out = {}; for (const k in L) out[k] = L[k].map(g => g.map(r => Array.from(r, v => v ? '#' : '.').join('')));
    return out;
  }
  const LETTER_MASKS = new WeakMap();
  function lettersMask(letters) {
    let m = LETTER_MASKS.get(letters);
    if (!m) { m = {}; for (const k in letters) m[k] = letters[k].map(inkOf); LETTER_MASKS.set(letters, m); }
    return m;
  }
  function xAt(b, ex, xs) {
    for (const [lo, hi] of X_AT) {
      let best = 0, at = -1;
      for (const t of xs) for (let o = lo; o <= hi; o++) { const x = ex - o, s = diceAt(t, b, 0, 0, x, 0, t[0].length, NH); if (s > best + 1e-9) { best = s; at = x; } }
      if (best >= X_OK) return at;
    }
    return -1;
  }
  // the name as it could show: whole, or cut to its first n letters and "..."
  function formsOf(name) { const f = [name]; for (let n = 3; n < name.length; n++) { const p = name.slice(0, n); if (!p.endsWith(' ')) f.push(p + '...'); } return f; }
  // draw s from its letters right to left, ending a space before the x, each letter at the spot (1 or 2 px after the next,
  // 4 or 5 after a space) where it best fits the ink; then the Dice overlap of the drawing and the ink, from the name's
  // first ink (so a candidate that is only the end of the name leaves ink unexplained) to the x. -1 when a letter is unknown.
  // A name with a learned touching pair is drawn both ways (letters apart, pair as one shape) and the better one counts.
  function placeName(b, s, xpos, L, left, pairs) {
    if (pairs === undefined) { const one = placeName(b, s, xpos, L, left, false); for (let i = 1; i < s.length; i++) if (L[s[i - 1] + s[i]]) return Math.max(one, placeName(b, s, xpos, L, left, true)); return one; }
    const P = b.map(r => new Uint8Array(r.length)); let next = xpos, gaps = SPACE_GAPS, first = xpos;
    for (let i = s.length - 1; i >= 0; i--) {
      const ch = s[i]; if (ch === ' ') { gaps = SPACE_GAPS; continue; }
      const pr = pairs && i > 0 && L[s[i - 1] + ch], vs = pr || L[ch]; if (!vs) return -1; if (pr) i--;   // a touching pair is one shape
      let best = -1e9, bs = 0, bv = null;
      for (const v of vs) for (const g of gaps) {
        const w = v[0].length, st = next - g - w; if (st < 0) continue;
        let sc = 0; for (let y = 0; y < NH; y++) { const vr = v[y], br = b[y]; for (let x = 0; x < w; x++) if (vr[x]) sc += br[st + x] ? 1 : -1; }
        if (sc > best) { best = sc; bs = st; bv = v; }
      }
      if (!bv) return -1;
      for (let y = 0; y < NH; y++) for (let x = 0; x < bv[0].length; x++) if (bv[y][x]) P[y][bs + x] = 1;
      next = bs; first = bs; gaps = LETTER_GAPS;
    }
    const a = Math.max(0, Math.min(first - 6, left)), e = xpos - 3; let i = 0, p = 0, q = 0;
    for (let y = 0; y < NH; y++) for (let x = a; x < e; x++) { p += P[y][x]; q += b[y][x]; i += P[y][x] & b[y][x]; }
    return p + q ? 2 * i / (p + q) : 0;
  }
  // The item an item line names, out of the names it could be (the map's drops, what the bag has shown), or null. Every
  // candidate is drawn from the letter templates; the best must score NAME_OK and beat the next by NAME_MARGIN (the digit
  // reader's margins). A candidate with a letter no template has is drawn only in its cut off forms that skip that letter,
  // so it can name a cut line ("Medicine With...") but a whole one scores low and stays null.
  function nameOf(img, row, candidates, letters) {
    letters = letters || T.letters; if (!letters || !candidates || !candidates.length) return null;
    const L = lettersMask(letters), ref = L['earned.'] && L['earned.'][0]; if (!ref || !L.x) return null;
    const t = tabOf(rowInk(toGame(img).white, row)); if (!t) return null;
    const ex = TAB_AT[t.tab], raw = inkOf(nameInk(img, row)), b = lineUp(raw, ex, ref), xpos = xAt(b, ex, L.x); if (xpos < 0) return null;
    const on = x => b.some(r => r[x]);
    let edge = xpos - 3; while (edge > 0 && !on(edge - 1)) edge--;   // the name's right end
    let left = edge, gap = 0; for (let x = edge - 1; x >= 0 && gap <= NAME_GAP; x--) { if (on(x)) { left = x; gap = 0; } else gap++; }
    const out = [];
    for (const c of new Set(candidates)) {
      let best = -1; for (const f of formsOf(c)) { const d = placeName(b, f, xpos, L, left); if (d > best) best = d; }
      if (best >= 0) out.push({ c, d: best });
    }
    out.sort((a, b) => b.d - a.d); const [a, s] = out;
    return a && a.d >= NAME_OK && (!s || a.d - s.d >= NAME_MARGIN) ? a.c : null;
  }

  function setTemplates(t) {
    T = { words: {}, glyphs: {}, ...t }; for (const k in T.words) delete T.words[k].mask;
    for (const set of [T.glyphs, T.expGlyphs || {}]) for (const k in set) for (const g of set[k]) delete g.mask;
    T.expAll = mergeGlyphs(T.glyphs, T.expGlyphs);
  }

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

  root.PickupLines = { mesosOn: () => T.mesosGate !== false, stripArea, toGame, rowsOf, readRows, setTemplates, wordsOf, births, createTracker, learnDigits, readMesosInk, mesosInk, readMesos, readExp, readExpInk, expInk, expFaint, learnExpDigits, mergeGlyphs, readItem, matchName, nameInk, learnLetters, nameOf, MESOS_GATE, ROWS, GW, GH, _slide: slide, _tpl: () => T, _rowInk: rowInk, _readItemInk: readItemInk, _itemGroups: (rows) => itemGroups(inkOf(rows)), _xRegion: (rows, d0) => xRegion(inkOf(rows), d0), _dice: dice, _groupsOf: groupsOf };
})(typeof window !== 'undefined' ? window : globalThis);
