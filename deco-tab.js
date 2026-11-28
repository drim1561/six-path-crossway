// My Deco (docs/superpowers/specs/2026-11-28-my-deco-design.md): lines up the pages of the bag's Deco tab into one
// list, the way the Grind bag count lines up Equip, Use and Etc (grind-session.js fit and join), so a slot is counted
// once however the scroll stops and two of the same item in two slots count as two. Plain logic, no screen: deco-reader.js
// names the slots, box.js shows the list. Runs in the page (window.DecoTab) and in node (tests/deco-tab.test.js).
//
//   DecoTab.pageOf(slots, scroll, pics) -> a page: 6 rows, each slot 'id.badge' ('' empty, '?' for what isn't known),
//                                          '.r' after it when recoloured
//   DecoTab.create(saved)               -> a tab: take(page), state() ({ strips }, to keep), items(), done()
(function (root) {
  'use strict';
  var ROWS = 6, COLS = 5, EMPTY = '||||';
  // At either end of the track the game draws the thumb shorter (22.4 base px at the very top, 24.5 one row down,
  // about 25.4 in the middle; Rimmah's scroll clip), and screen.js calls a thumb within 2 px of the end top or bottom,
  // which one row in still is. So an end only counts here with the short thumb
  var END_LEN = 23.4;

  function slotKey(q) {
    if (!q || q.empty) return '';
    var id = q.pending || q.id == null ? '?' : String(q.id), b = q.badge === 'coin' ? 'c' : q.badge === 'blue' ? 'a' : '?';
    return id + '.' + b + (q.prism ? '.r' : '');
  }
  // a slot with neither a name nor a badge is something over it (the mouse, a tooltip): its row isn't known on this look
  function covered(q) { return q && !q.empty && !q.pending && q.id == null && !q.badge; }

  function pageOf(slots, scroll, pics) {
    var rows = [], bad = {}, i, c;
    for (i = 0; i < ROWS; i++) { rows.push([]); for (c = 0; c < COLS; c++) rows[i].push(''); }
    (slots || []).forEach(function (q) {
      if (q.r >= ROWS || q.c >= COLS) return;
      if (covered(q)) bad[q.r] = true;
      rows[q.r][q.c] = slotKey(q);
    });
    var end = function (k) { return !!(scroll && scroll[k] && scroll.a != null && scroll.b - scroll.a <= END_LEN); };
    return {
      rows: rows.map(function (r, i) { return bad[i] ? null : r.join('|'); }),
      pics: rows.map(function (_, i) { return (pics && pics[i]) || null; }),
      top: end('top'), bottom: end('bottom')
    };
  }

  // two reads of one slot agree when both are empty or both hold something, and the name and the badge agree or one of
  // them isn't known
  function slotAlike(x, y) {
    if (!x || !y) return !x && !y;
    var a = x.split('.'), b = y.split('.');
    return (a[0] === b[0] || a[0] === '?' || b[0] === '?') && (a[1] === b[1] || a[1] === '?' || b[1] === '?');
  }
  function alike(x, y) {
    if (x === y) return true;
    var a = x.split('|'), b = y.split('|');
    for (var c = 0; c < a.length; c++) if (!slotAlike(a[c], b[c])) return false;
    return true;
  }
  // a row with a slot named for sure: something to line pages up by (a row of empty slots, or only unknowns, isn't)
  function solid(x) { return x.split('|').some(function (q) { return q && q.charAt(0) !== '?'; }); }
  // two reads of one row as one: what either knows is kept, the newer read (y) winning
  function mergeSlot(x, y) {
    if (!x || !y) return y || x;
    var a = x.split('.'), b = y.split('.');
    return (b[0] !== '?' ? b[0] : a[0]) + '.' + (b[1] !== '?' ? b[1] : a[1]) + (b[2] || a[2] ? '.r' : '');
  }
  function mergeRow(x, y) {
    if (x == null || y == null || x === y) return y != null ? y : x;
    var b = y.split('|');
    return x.split('|').map(function (q, c) { return mergeSlot(q, b[c]); }).join('|');
  }
  function mergePics(x, y) { return x || y ? Object.assign({}, x || {}, y || {}) : null; }

  // where b's first row sits among a's rows, or null unless there's exactly one place: every shared row alike, at
  // least one of them solid (or both pinned to the same end), never past a known top or bottom
  function fit(a, b) {
    var found = null, n = 0, loose = [];
    for (var k = 1 - b.rows.length; k <= a.rows.length - 1; k++) {
      var aEnd = a.rows.length, bEnd = k + b.rows.length;
      if ((a.top && k < 0) || (b.top && k > 0) || (a.bottom && bEnd > aEnd) || (b.bottom && bEnd < aEnd)) continue;
      if (a.top && b.top && k !== 0) continue;
      var same = true, sure = false;
      for (var i = Math.max(0, k); i < Math.min(aEnd, bEnd); i++) {
        var x = a.rows[i], y = b.rows[i - k];
        if (x == null || y == null) continue;
        if (!alike(x, y)) { same = false; break; }
        if (solid(x) || solid(y)) sure = true;
      }
      if (same && (sure || (a.top && b.top) || (a.bottom && b.bottom))) { found = k; n++; }
      else if (same) loose.push(k);
    }
    if (n === 1) return found;
    // no one place, but every place left gives the same list (a page of empty rows under the last items): any will do
    if (n === 0 && loose.length && loose.every(function (k) { return listKey(join(a, b, k)) === listKey(join(a, b, loose[0])); })) return loose[0];
    return null;
  }
  function join(a, b, k) {
    var rows = [], pics = [];
    for (var i = Math.min(0, k); i < Math.max(a.rows.length, k + b.rows.length); i++) {
      var inA = i >= 0 && i < a.rows.length, inB = i - k >= 0 && i - k < b.rows.length;
      rows.push(mergeRow(inA ? a.rows[i] : null, inB ? b.rows[i - k] : null));
      pics.push(mergePics(inA ? a.pics[i] : null, inB ? b.pics[i - k] : null));
    }
    return { rows: rows, pics: pics, top: a.top || b.top, bottom: a.bottom || b.bottom };
  }
  // the list a strip gives: every slot's key, sorted (a row not known makes it differ from any other)
  function listKey(s) {
    var all = [];
    s.rows.forEach(function (r) { if (r == null) all.push('null'); else if (r !== EMPTY) r.split('|').forEach(function (q) { if (q) all.push(q); }); });
    return all.sort().join(',');
  }
  // the same page on two looks in a row (a page caught mid scroll, or with a tooltip coming in, isn't taken)
  function samePage(a, b) {
    if (!a || a.top !== b.top || a.bottom !== b.bottom) return false;
    for (var i = 0; i < ROWS; i++) if (a.rows[i] != null && b.rows[i] != null && a.rows[i] !== b.rows[i]) return false;
    return true;
  }
  // a page pinned to an end that doesn't fit: the tab changed (an item put on or taken off) and the newer look wins
  function overwrite(a, b) {
    var k = b.top ? 0 : a.rows.length - b.rows.length, s = { rows: a.rows.slice(), pics: a.pics.slice(), top: a.top, bottom: a.bottom };
    for (var j = 0; j < b.rows.length; j++) {
      var i = k + j; if (i < 0) continue;
      s.rows[i] = b.rows[j] != null ? b.rows[j] : s.rows[i];
      s.pics[i] = b.rows[j] != null ? b.pics[j] : s.pics[i];
    }
    return s;
  }

  // The looks are kept as stretches of the tab (strips): a look that shares rows with one goes into it, one that shares
  // none (a fast scroll skipped rows) starts its own, and two stretches that come to share rows become one. The list is
  // whole when one stretch runs from the top to the bottom
  function copy(x) { return { rows: x.rows.slice(), pics: (x.pics || x.rows.map(function () { return null; })).slice(), top: !!x.top, bottom: !!x.bottom }; }
  function create(saved) {
    var strips = saved && Array.isArray(saved.strips) ? saved.strips.map(copy) : saved && saved.rows ? [copy(saved)] : [];
    var last = null;
    var key = function () { return strips.map(function (x) { return listKey(x) + x.top + x.bottom; }).join(';'); };
    function done() { return strips.length === 1 && strips[0].top && strips[0].bottom && strips[0].rows.every(function (r) { return r != null; }); }
    // stretches that now share rows (or meet at a known end) become one
    function knit() {
      for (var i = 0; i < strips.length; i++) for (var j = 0; j < strips.length; j++) {
        if (i === j) continue;
        var k = fit(strips[i], strips[j]);
        if (k == null) continue;
        strips[i] = join(strips[i], strips[j], k); strips.splice(j, 1);
        return knit();
      }
    }
    return {
      // a look at the open Deco tab; true when it changed the list
      take: function (pg) {
        var still = samePage(last, pg); last = pg;
        if (!still) return false;
        // every row covered (a tooltip over the whole page): nothing to place, and a stretch of it could never be joined
        if (pg.rows.every(function (r) { return r == null; })) return false;
        var was = key(), i, k = null;
        for (i = 0; i < strips.length; i++) if ((k = fit(strips[i], pg)) != null) break;
        if (k != null) strips[i] = join(strips[i], pg, k);
        else {
          // a look pinned to an end that doesn't fit the stretch at that end: the tab changed (something put on or taken
          // off) and the newer look wins
          var end = -1;
          for (i = 0; i < strips.length && end < 0; i++) if ((pg.top && strips[i].top) || (pg.bottom && strips[i].bottom)) end = i;
          if (end >= 0) strips[end] = overwrite(strips[end], pg); else strips.push(copy(pg));
        }
        knit();
        return key() !== was;
      },
      done: done,
      state: function () { return { strips: strips.map(copy) }; },
      // what's in the tab: one entry per id and badge with how many slots hold it; an item with no name gets one entry
      // per slot, with its picture when the page gave one ({ id: null, badge, n: 1, pic }). recoloured: the prism was on it
      items: function () {
        var by = {}, out = [];
        strips.forEach(function (st) {
          st.rows.forEach(function (r, i) {
            if (r == null) return;
            r.split('|').forEach(function (q, c) {
              if (!q) return;
              var p = q.split('.'), badge = p[1] === 'c' ? 'coin' : p[1] === 'a' ? 'blue' : null;
              if (p[0] === '?') { out.push({ id: null, badge: badge, recoloured: p[2] === 'r', n: 1, pic: (st.pics[i] || {})[c] || null }); return; }
              if (!by[q]) { by[q] = { id: isNaN(+p[0]) ? p[0] : +p[0], badge: badge, recoloured: p[2] === 'r', n: 0 }; out.push(by[q]); }
              by[q].n++;
            });
          });
        });
        return out;
      }
    };
  }

  var api = { pageOf: pageOf, create: create, END_LEN: END_LEN };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DecoTab = api;
})(typeof window !== 'undefined' ? window : this);
