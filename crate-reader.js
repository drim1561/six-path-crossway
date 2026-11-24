// Crate reader: watches a shared game window for the CASHSHOP SURPRISE window (the Mystery Fashion Crate's opening
// window) and says which items each open gave, so NX Crates (box.js) can log them by itself.
//
// The game draws the window at its own size (410 x 287) and stretches it with everything else, and the player can
// drag it anywhere. So: find the window by its own picture (data/crate-window.json, npm run box:window), measure the
// stretch on it, and place the item slots from the window. The window shows no names, only item pictures in blue
// frames: one in the middle after Use 1, five in a row after Use all. Each picture is matched in colour against the
// picked crate's item pictures, stretched up by the measured stretch.
//
// One open is on screen for under 2 seconds when the player clicks Use 1 again straight away, so tick() wants a frame
// several times a second. It counts an open once: when the frames are up and the pictures in them have stopped
// changing. The frames going away (the box spinning again) arms the next one.
//
//   CrateReader.create(art)            -> Promise of a reader (art is crate-window.json)
//   reader.setItems([{ id, icon }])    -> Promise, the picked crate's items (icon is a data URI)
//   reader.tick(src, w, h, now)        -> { state, pulls, missed }
//       src    anything drawImage takes (a VideoFrame, a video, a canvas), w x h its size, now in ms
//       state  'looking' (no Surprise window in sight), 'watching' (window up, nothing in it), 'shown' (items up)
//       pulls  the item ids of an open just counted, left to right, else null
//       missed how many pictures of an open could not be told apart (the player adds those by hand)
//   reader.reset()                     a new share: forget the window and the open in progress
(function () {
  'use strict';
  var BG_W = 410, BG_H = 287;
  var Q = 4;                       // the wide search looks at a quarter of the game's own size
  var SLOT = 52, GAP = 62;         // a frame, and frame to frame (slotSpaceX 10)
  var SLOT_X = 179, SLOT_Y = 125;  // the middle frame's corner in the window
  var T_WIDE = 40, T_WIN = 16;     // mean colour difference: the wide search, the window at full size
  var T_SLOT = 30;                 // a frame is up
  var T_STILL = 7;                 // the pictures have stopped changing
  var T_ITEM = 36, T_LEAD = 1.3;   // an item is read: close enough, and the runner up clearly further

  function canvas(w, h) {
    if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(w, h);
    var c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  }
  function ctx(c) { var g = c.getContext('2d', { willReadFrequently: true }); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; return g; }
  function decode(uri) {
    var im = new Image(); im.src = uri;
    return im.decode().then(function () { return im; });
  }
  function pixelsOf(im, w, h) {
    var c = canvas(w, h), g = ctx(c);
    g.drawImage(im, 0, 0, w, h);
    return { w: w, h: h, data: g.getImageData(0, 0, w, h).data };
  }
  // the parts of the window nothing is drawn over: the title bar, the top of the arch and its two columns. The middle
  // holds the glow, the box and the items; the bottom bar holds the buttons.
  function still(x, y) {
    if (y >= 4 && y < 27) return x >= 4 && x < 406;
    if (y < 36 || y >= 244) return false;
    if (x < 10 || x >= 400) return false;
    return y < 60 || x < 68 || x >= 342;
  }

  function create(art) {
    return Promise.all([decode(art.bg.uri), decode(art.slot.uri)]).then(function (ims) {
      var bg = pixelsOf(ims[0], BG_W, BG_H), slotPic = pixelsOf(ims[1], SLOT, SLOT);
      var sw = Math.round(BG_W / Q), sh = Math.round(BG_H / Q), small = pixelsOf(ims[0], sw, sh);
      // sample points: [x, y, r, g, b] flat, in the window's own pixels
      var pts = [], x, y, k;
      for (y = 1; y < BG_H; y += 3) for (x = 1; x < BG_W; x += 3) if (still(x, y)) { k = (y * BG_W + x) * 4; pts.push(x, y, bg.data[k], bg.data[k + 1], bg.data[k + 2]); }
      var spts = [];
      for (y = 0; y < sh; y++) for (x = 0; x < sw; x++) if (still(x * Q + 2, y * Q + 2) && still(x * Q, y * Q) && still(x * Q + 3, y * Q + 3)) { k = (y * sw + x) * 4; spts.push(x, y, small.data[k], small.data[k + 1], small.data[k + 2]); }
      // the frame's solid edge
      var fpts = [];
      for (y = 0; y < SLOT; y++) for (x = 0; x < SLOT; x++) {
        if (Math.min(x, y, SLOT - 1 - x, SLOT - 1 - y) > 3) continue;
        k = (y * SLOT + x) * 4;
        if (slotPic.data[k + 3] >= 250) fpts.push(x, y, slotPic.data[k], slotPic.data[k + 1], slotPic.data[k + 2]);
      }

      var items = [], scaled = { s: 0, list: [] };
      var win = null, lastWide = -1e9, turn = 0, lastGood = [], itemsCall = 0;
      var armed = false, counted = false, zero = 0, lastFp = null, lastN = 0, tries = 0, unread = 0;
      var full = null, fullG = null;

      function grab(src, W, H, x, y, w, h) {
        x = Math.max(0, Math.floor(x)); y = Math.max(0, Math.floor(y));
        w = Math.min(W - x, Math.ceil(w)); h = Math.min(H - y, Math.ceil(h));
        if (w < 8 || h < 8) return null;
        if (!full || full.width < w || full.height < h) { full = canvas(Math.max(w, full ? full.width : 0), Math.max(h, full ? full.height : 0)); fullG = ctx(full); }
        fullG.drawImage(src, x, y, w, h, 0, 0, w, h);
        return { x: x, y: y, w: w, h: h, data: fullG.getImageData(0, 0, w, h).data };
      }
      // mean colour difference of the window's still parts with its corner at (x, y) of the frame, stretched s
      function scoreWin(r, x, y, s, step) {
        var e = 0, n = 0, d = r.data, i, X, Y, j;
        for (i = 0; i < pts.length; i += 5 * step) {
          X = Math.floor(x + (pts[i] + 0.5) * s) - r.x; Y = Math.floor(y + (pts[i + 1] + 0.5) * s) - r.y;
          if (X < 0 || Y < 0 || X >= r.w || Y >= r.h) { e += 300; n++; continue; }
          j = (Y * r.w + X) * 4;
          e += Math.abs(pts[i + 2] - d[j]) + Math.abs(pts[i + 3] - d[j + 1]) + Math.abs(pts[i + 4] - d[j + 2]); n++;
        }
        return e / (n * 3);
      }
      // the whole frame at a quarter of the game's size, the small window slid over it
      function wide(src, W, H, s) {
        var cw = Math.round(W / (s * Q)), ch = Math.round(H / (s * Q));
        if (cw < sw || ch < sh) return null;
        var c = canvas(cw, ch), g = ctx(c);
        g.drawImage(src, 0, 0, W, H, 0, 0, cw, ch);
        var d = g.getImageData(0, 0, cw, ch).data, n = spts.length / 5, best = 1e9 * n, bx = 0, by = 0, ox, oy, i, j, e;
        for (oy = 0; oy <= ch - sh; oy++) for (ox = 0; ox <= cw - sw; ox++) {
          e = 0;
          for (i = 0; i < spts.length && e < best; i += 5) {
            j = ((oy + spts[i + 1]) * cw + ox + spts[i]) * 4;
            e += Math.abs(spts[i + 2] - d[j]) + Math.abs(spts[i + 3] - d[j + 1]) + Math.abs(spts[i + 4] - d[j + 2]);
          }
          if (e < best) { best = e; bx = ox; by = oy; }
        }
        return { e: best / (n * 3), x: bx * W / cw, y: by * H / ch };
      }
      function find(src, W, H) {
        var guesses = [H / 768, W / 1366, H / 720].filter(function (s, i, a) { return s > 0.6 && a.every(function (t, j) { return j >= i || Math.abs(t - s) / s > 0.025; }); });
        // one guess a search, in turn: a search costs time, and the first guess is nearly always the one
        var s0 = guesses[turn++ % guesses.length], best = wide(src, W, H, s0);
        if (!best || best.e > T_WIDE) return null;
        // full size: hold the middle, try stretches and small moves
        var pad = 30 * s0, r = grab(src, W, H, best.x - pad, best.y - pad, BG_W * s0 + 2 * pad, BG_H * s0 + 2 * pad);
        if (!r) return null;
        var cx = best.x + BG_W * s0 / 2, cy = best.y + BG_H * s0 / 2, top = { e: 1e9 };
        var pass = function (sA, sB, sStep, reach, step, skip) {
          var c0x = top.e < 1e9 ? top.x + BG_W * top.s / 2 : cx, c0y = top.e < 1e9 ? top.y + BG_H * top.s / 2 : cy, s, dx, dy, x, y, e;
          for (s = sA; s <= sB + 1e-9; s += sStep) for (dy = -reach; dy <= reach; dy += step) for (dx = -reach; dx <= reach; dx += step) {
            x = c0x - BG_W * s / 2 + dx; y = c0y - BG_H * s / 2 + dy;
            e = scoreWin(r, x, y, s, skip);
            if (e < top.e) top = { e: e, x: x, y: y, s: s };
          }
        };
        pass(s0 * 0.93, s0 * 1.07, s0 * 0.01, Math.ceil(5 * s0), Math.max(1, Math.round(s0 / 2)), 4);
        var s1 = top.s;
        pass(s1 * 0.992, s1 * 1.008, s1 * 0.002, 2, 1, 1);
        return top.e <= T_WIN ? top : null;
      }

      function slotsAt(n) { var a = [], i; for (i = 0; i < n; i++) a.push(SLOT_X + (i - (n - 1) / 2) * GAP); return a; }
      function frameScore(r, bx, by) {
        var e = 0, n = fpts.length / 5, d = r.data, i, X, Y, j;
        for (i = 0; i < fpts.length; i += 5) {
          X = Math.floor(win.x + (bx + fpts[i] + 0.5) * win.s) - r.x; Y = Math.floor(win.y + (by + fpts[i + 1] + 0.5) * win.s) - r.y;
          if (X < 0 || Y < 0 || X >= r.w || Y >= r.h) return 1e9;
          j = (Y * r.w + X) * 4;
          e += Math.abs(fpts[i + 2] - d[j]) + Math.abs(fpts[i + 3] - d[j + 1]) + Math.abs(fpts[i + 4] - d[j + 2]);
        }
        return e / (n * 3);
      }
      function frameUp(r, bx) { return frameScore(r, bx, SLOT_Y) <= T_SLOT; }
      // how many frames are up: five in a row, or fewer around the middle
      function shown(r) {
        for (var n = 5; n >= 1; n--) { var xs = slotsAt(n); if (xs.every(function (bx) { return frameUp(r, bx); })) return xs; }
        return [];
      }
      // a coarse print of what's inside the frames, to tell when the pictures stop changing
      function print(r, xs) {
        var fp = [], d = r.data, s = win.s;
        xs.forEach(function (bx) {
          for (var y = 6; y < SLOT - 4; y += 4) for (var x = 6; x < SLOT - 4; x += 4) {
            var X = Math.floor(win.x + (bx + x) * s) - r.x, Y = Math.floor(win.y + (SLOT_Y + y) * s) - r.y, j = (Y * r.w + X) * 4;
            fp.push(d[j], d[j + 1], d[j + 2]);
          }
        });
        return fp;
      }
      function moved(a, b) { if (!a || !b || a.length !== b.length) return 1e9; var e = 0; for (var i = 0; i < a.length; i++) e += Math.abs(a[i] - b[i]); return e / a.length; }

      function pictures(s) {
        if (scaled.s === s && scaled.items === items) return scaled.list;
        scaled = { s: s, items: items, list: items.map(function (it) {
          return stretched(it, s, 0, 0);
        }) };
        return scaled.list;
      }
      // an item's picture stretched s, starting a part of a pixel (fx, fy) in: the game's stretch doesn't land a
      // picture on whole pixels, and a thin one (a pair of shades) only lines up when ours is shifted the same way
      function stretched(it, s, fx, fy) {
        var w = Math.ceil(it.im.width * s + fx), h = Math.ceil(it.im.height * s + fy), c = canvas(w, h), g = ctx(c);
        g.drawImage(it.im, fx, fy, it.im.width * s, it.im.height * s);
        var data = g.getImageData(0, 0, w, h).data;
        // a small game gets every pixel looked at, a big one every second; solid is how many of them there are
        var step = s >= 1.6 ? 2 : 1, solid = 0;
        for (var y = 0; y < h; y += step) for (var x = 0; x < w; x += step) if (data[(y * w + x) * 4 + 3] >= 200) solid++;
        return { id: it.id, it: it, w: w, h: h, data: data, step: step, solid: solid, parts: null };
      }
      // the item in one frame: every picture slid around inside it, scored on its solid pixels in colour, leaving out
      // the cash marker (bottom right) and the count (bottom left) the game draws over it
      function match(r, bx) {
        var s = win.s, in0 = Math.round(3 * s), d = r.data;
        var ix = Math.round(win.x + bx * s) + in0 - r.x, iy = Math.round(win.y + SLOT_Y * s) + in0 - r.y, iw = Math.round(SLOT * s) - 2 * in0, ih = iw;
        var skip = function (x, y) { return y > ih - s * 16 && (x > iw - s * 17 || x < s * 8); };
        var scanner = function (t, best) {
          return function (ox0, ox1, oy0, oy1, step) {
            for (var oy = oy0; oy <= oy1; oy += step) for (var ox = ox0; ox <= ox1; ox += step) {
              var e = 0, n = 0;
              for (var y = 0; y < t.h; y += t.step) for (var x = 0; x < t.w; x += t.step) {
                var k = (y * t.w + x) * 4;
                if (t.data[k + 3] < 200) continue;
                var X = ox + x, Y = oy + y;
                if (X < 0 || Y < 0 || X >= iw || Y >= ih || skip(X, Y)) continue;
                var j = ((iy + Y) * r.w + ix + X) * 4;
                e += Math.abs(t.data[k] - d[j]) + Math.abs(t.data[k + 1] - d[j + 1]) + Math.abs(t.data[k + 2] - d[j + 2]); n++;
              }
              if (n < 12 || n < t.solid * 0.5) continue;   // most of the picture has to sit inside the frame
              e /= n * 3;
              if (e < best.e) { best.e = e; best.ox = ox; best.oy = oy; }
            }
          };
        };
        var res = pictures(s).map(function (t) {
          var best = { e: 1e9, ox: 0, oy: 0 }, scan = scanner(t, best);
          scan(-4, iw - t.w + 4, -4, ih - t.h + 4, 3);
          if (best.e < 1e9) scan(best.ox - 2, best.ox + 2, best.oy - 2, best.oy + 2, 1);
          return { id: t.id, e: best.e, ox: best.ox, oy: best.oy, t: t };
        }).sort(function (a, b) { return a.e - b.e; });
        // the three nearest again, shifted by quarters of a pixel
        res.slice(0, 3).forEach(function (m) {
          if (m.e >= 1e9) return;
          if (!m.t.parts) { m.t.parts = []; for (var fy = 0; fy < 4; fy++) for (var fx = 0; fx < 4; fx++) if (fx || fy) m.t.parts.push(stretched(m.t.it, s, fx / 4, fy / 4)); }
          m.t.parts.forEach(function (p) { var best = { e: m.e }; scanner(p, best)(m.ox - 1, m.ox + 1, m.oy - 1, m.oy + 1, 1); if (best.e < m.e) m.e = best.e; });
        });
        res.sort(function (a, b) { return a.e - b.e; });
        var a = res[0], b = res[1];
        return { id: a ? a.id : null, e: a ? a.e : 1e9, next: b ? b.e : 1e9, ok: !!a && a.e <= T_ITEM && (!b || b.e >= a.e * T_LEAD) };
      }

      function tick(src, W, H, now) {
        var out = { state: 'looking', pulls: null, missed: 0 }, r = null, seen = false;
        var region = function () { return grab(src, W, H, win.x - 2, win.y - 2, BG_W * win.s + 4, BG_H * win.s + 4); };
        if (win && (win.W !== W || win.H !== H)) win = null;
        if (win) { r = region(); seen = !!r && scoreWin(r, win.x, win.y, win.s, 2) <= T_WIN; }
        // not where it was: look everywhere, once a second. The old spot is kept meanwhile, since the opening
        // animation covers the window for a moment and the items come up right after it.
        if (!seen && now - lastWide >= 1000) {
          lastWide = now;
          var w = find(src, W, H);
          if (w) { w.W = W; w.H = H; win = w; r = region(); seen = !!r; }
        }
        if (!win) return out;
        // a look that doesn't see the window (dragged, covered, the flash) says nothing about the frames
        if (!seen) return out;
        var xs = shown(r);
        if (!xs.length) {
          out.state = 'watching';
          if (++zero >= 2) {
            // the frames are gone: the next open can count; what was read but not counted yet goes out now, the rest is owed by hand
            if (armed && !counted && unread) { out.pulls = lastGood.length ? lastGood : null; out.missed = unread - lastGood.length; }
            armed = true; counted = false; lastFp = null; lastN = 0; tries = 0; unread = 0; lastGood = [];
          }
          return out;
        }
        zero = 0; out.state = 'shown';
        if (!armed || counted) return out;
        var fp = print(r, xs), settled = lastN === xs.length && moved(fp, lastFp) <= T_STILL;
        lastFp = fp; lastN = xs.length; unread = xs.length;
        if (!settled) return out;
        var got = xs.map(function (bx) { return match(r, bx); }), good = got.filter(function (g) { return g.ok; });
        out.reads = got; lastGood = good.map(function (g) { return g.id; });
        // every picture read, or five tries on (about a second): count what did read
        if (good.length < got.length && ++tries < 5) return out;
        counted = true; unread = 0; lastGood = [];
        out.pulls = good.map(function (g) { return g.id; });
        out.missed = got.length - good.length;
        return out;
      }

      return {
        tick: tick,
        setItems: function (list) {
          var call = ++itemsCall;
          return Promise.all((list || []).map(function (it) { return decode(it.icon).then(function (im) { return { id: it.id, im: im }; }); }))
            .then(function (l) { if (call === itemsCall) items = l; });
        },
        reset: function () { win = null; lastWide = -1e9; armed = false; counted = false; zero = 0; lastFp = null; lastN = 0; tries = 0; unread = 0; lastGood = []; },
        // for tests and tuning
        window: function () { return win ? { x: win.x, y: win.y, s: win.s, e: win.e } : null; },
        probe: function (src, W, H, scan) {
          var w = find(src, W, H);
          if (!w) return null;
          var keep = win; win = w;
          var r = grab(src, W, H, w.x - 2, w.y - 2, BG_W * w.s + 4, BG_H * w.s + 4), xs = shown(r);
          var res = { win: { x: w.x, y: w.y, s: w.s, e: w.e }, slots: xs, reads: xs.map(function (bx) { return match(r, bx); }) };
          if (scan) {
            res.scan = { e: 1e9 };
            for (var by = 90; by <= 150; by += 0.5) for (var bx = 20; bx <= 340; bx += 0.5) { var e = frameScore(r, bx, by); if (e < res.scan.e) res.scan = { e: e, bx: bx, by: by }; }
            res.five = slotsAt(5).map(function (x) { return +frameScore(r, x, SLOT_Y).toFixed(1); });
          }
          win = keep;
          return res;
        }
      };
    });
  }

  window.CrateReader = { create: create };
})();
