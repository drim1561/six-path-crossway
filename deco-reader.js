// My Deco's reader (docs/superpowers/specs/2026-11-28-my-deco-design.md): names what sits in the bag's Deco tab.
// screen.js readBag finds the tab and gives each slot (empty or not, the badge, the recolour prism); this matches each
// filled slot's picture against every crate item picture in data/box.json with the crate reader's matcher
// (crate-reader.js, CrateReader.matcher). A weak match, or two pictures too close, gives no name: a blank beats a
// wrong one.
//
//   DecoReader.create(items)        -> Promise of a reader; items [{ id, icon }] (icon a data URI), every crate's
//   reader.name(src, bag, opts)     -> bag.slots with { id, e, next } on each filled one (id null when unsure, and then
//                                      pic: the slot as a 32 px data URI)
//     opts.budget: ms to spend on slots not seen before (a slot is about 170 ms at 1440p); the rest come back
//     { pending: true } and a later call goes on from the cache, so a Grind tick stays short
(function () {
  'use strict';
  // The slot is 31 base px; a picture can stand a little past it (a tall hat, a flame), so the area is the slot and
  // 3 base px round it. Left out: the badge (bottom right) and the count's 1 (bottom left), in slot base px.
  var PAD = 3;
  var SKIP = { badgeX: 18.5, badgeY: 17.5, countX: 7, countY: 17 };
  // sure: mean colour difference a name needs; lead: how much further the runner up must be. Set from Rimmah's two
  // screenshots (tests/deco-reader.test.js prints every slot's nearest and runner up). Shape scores (light and dark
  // from their own average) run lower, so they have their own bar
  // On those 54 slots every right name scored 27 or under and its runner up was at least 1.77 times further
  var SURE = 30, LEAD = 1.5, SHAPE_SURE = 14, SHAPE_LEAD = 1.25;

  function grab(src, x, y, w, h) {
    x = Math.max(0, Math.round(x)); y = Math.max(0, Math.round(y)); w = Math.round(w); h = Math.round(h);
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(src, x, y, w, h, 0, 0, w, h);
    return { x: x, y: y, w: w, h: h, data: g.getImageData(0, 0, w, h).data };
  }
  function picOf(src, rect) {
    try {
      var c = document.createElement('canvas'); c.width = 32; c.height = 32;
      c.getContext('2d').drawImage(src, Math.round(rect.x), Math.round(rect.y), Math.round(rect.w), Math.round(rect.h), 0, 0, 32, 32);
      return c.toDataURL('image/png');
    } catch (e) { return null; }
  }
  // a coarse print of a slot, to know it hasn't changed since the last look
  function print(r) {
    var fp = [], d = r.data;
    for (var y = 2; y < r.h; y += 5) for (var x = 2; x < r.w; x += 5) { var k = (y * r.w + x) * 4; fp.push(d[k], d[k + 1], d[k + 2]); }
    return fp.join(',');
  }

  function create(items) {
    var m = window.CrateReader.matcher(), cache = {};
    return m.setItems(items).then(function () {
      var until = 0;
      function nameOne(src, q, s) {
        var p = PAD * s, r = grab(src, q.rect.x - p, q.rect.y - p, q.rect.w + 2 * p, q.rect.h + 2 * p), fp = print(r);
        var key = fp + (q.prism ? 'P' : '');
        if (cache[key]) return cache[key];
        if (until && performance.now() > until) return { pending: true };
        var skip = function (x, y) {
          var bx = x / s - PAD, by = y / s - PAD;
          return (bx > SKIP.badgeX && by > SKIP.badgeY) || (bx < SKIP.countX && by > SKIP.countY);
        };
        var got = m.match(r, { x: 0, y: 0, w: r.w, h: r.h }, s, skip, { shape: q.prism });
        var sure = q.prism ? SHAPE_SURE : SURE, lead = q.prism ? SHAPE_LEAD : LEAD;
        var out = { id: got.id != null && got.e <= sure && got.next >= got.e * lead ? got.id : null, e: +got.e.toFixed(1), next: +got.next.toFixed(1), top: got.top };
        // no name: My Deco shows the picture cut from the bag instead ("not in a crate we know")
        if (out.id == null) out.pic = picOf(src, q.rect);
        var keys = Object.keys(cache); if (keys.length > 400) delete cache[keys[0]];
        cache[key] = out;
        return out;
      }
      return {
        name: function (src, bag, opts) {
          var s = bag.win.s; until = opts && opts.budget ? performance.now() + opts.budget : 0;
          return bag.slots.map(function (q) { return q.empty ? q : Object.assign({}, q, nameOne(src, q, s)); });
        }
      };
    });
  }

  window.DecoReader = { create: create };
})();
