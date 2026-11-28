// My Deco on NX Crates (docs/superpowers/specs/2026-11-28-my-deco-design.md): while the game is shared and the bag's
// Deco tab is open, what's in it is listed with one total at the Cozy price, a quiet line splitting what can sell from
// what's worn, and one list sorted by price. screen.js readBag finds the tab, deco-reader.js names the slots, deco-tab.js
// lines the pages up; this file keeps the list on the device and draws it. box.js mounts it and hands it the frames.
//
//   MyDeco.build(entries, crates, priceOf) -> { rows, total, sell, worn, apart, count }   (pure, for tests)
//   MyDeco.mount(el, o)                    -> { frame(src), sharing(on) }
//     o: crates, priceOf, store ({ get, set }), deps (a promise of { screen: MapleScreen, reader: a DecoReader, tab: DecoTab }),
//        start() (starts the share, in the click), now()
(function () {
  'use strict';
  var KEY = 'box-deco-v1', LOOK_MS = 1000, NAMING_MS = 250, BUDGET = 60, GONE_MS = 3000;
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var mes = function (n) { return window.BoxOdds ? window.BoxOdds.mes(n) : String(Math.round(n)); };
  var priceText = function (price, est) { return price == null ? '' : (est ? 'est. ' : '') + mes(price); };
  var rateText = function (r) { return (Math.round(r * 100) / 100) + '%'; };

  // every crate item by id: the crate with its lowest chance, and the others it's also in
  function indexOf(crates) {
    var by = {};
    (crates || []).forEach(function (c) {
      (c.items || []).forEach(function (i) {
        var e = by[i.id] || (by[i.id] = { item: i, crate: c, rate: i.rate, all: [] });
        e.all.push(c);
        if (i.rate < e.rate) { e.item = i; e.crate = c; e.rate = i.rate; }
      });
    });
    Object.keys(by).forEach(function (k) { var e = by[k]; e.also = e.all.filter(function (c) { return c !== e.crate; }).map(function (c) { return c.short; }); });
    return by;
  }

  // entries: DecoTab items ({ id, badge, n, recoloured, pic }). A ring's red coin proves nothing (a White Label Ring in
  // the bag shows it and says Untradable), so a ring is never "can sell" and sits in neither side of the split, like a
  // slot whose mark couldn't be read. Every row counts in the total
  function build(entries, crates, priceOf) {
    var idx = indexOf(crates), rows = [], total = 0, est = false, sell = { n: 0, sum: 0 }, worn = { n: 0, sum: 0 }, apart = { n: 0, sum: 0 }, count = 0;
    (entries || []).forEach(function (en) {
      var hit = en.id != null ? idx[en.id] : null, it = hit && hit.item;
      var p = it ? priceOf(it) : { price: null, est: null }, ring = !!(it && it.slot === 'Ring');
      var side = ring || !en.badge ? 'apart' : en.badge === 'coin' ? 'sell' : 'worn';
      var marks = [];
      if (ring) marks.push('ring, hover to check');
      else if (en.badge === 'coin') marks.push('can sell');
      else if (en.badge === 'blue') marks.push('worn');
      if (en.recoloured) marks.push('recoloured');
      // a recoloured item is priced as the plain one, so its price is an estimate
      var price = p.price != null ? +p.price : null, isEst = price != null && (p.est === true || !!en.recoloured);
      var row = { id: it ? it.id : null, name: it ? it.name : null, icon: it ? it.icon : en.pic || null, cz: it ? it.cz : null, n: en.n,
        rate: hit ? hit.rate : null, crate: hit ? hit.crate.short : null, also: hit ? hit.also : [], mark: marks.join(', '), side: side, price: price, est: isEst };
      rows.push(row);
      count += en.n;
      var worth = price != null ? price * en.n : 0;
      total += worth; if (isEst) est = true;
      var s = side === 'sell' ? sell : side === 'worn' ? worn : apart;
      s.n += en.n; s.sum += worth;
    });
    // highest price first, no price last; the same price by name
    rows.sort(function (a, b) {
      if ((a.price == null) !== (b.price == null)) return a.price == null ? 1 : -1;
      return (b.price || 0) - (a.price || 0) || String(a.name || '~').localeCompare(String(b.name || '~'));
    });
    return { rows: rows, total: total, est: est, sell: sell, worn: worn, apart: apart, count: count };
  }

  function day(ts, now) {
    var d = new Date(ts), n = new Date(now);
    if (d.toDateString() === n.toDateString()) return 'today';
    var y = new Date(now - 86400000); if (d.toDateString() === y.toDateString()) return 'yesterday';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function rowHtml(r) {
    var pic = r.icon ? '<img src="' + esc(r.icon) + '" alt="" width="32" height="32">' : '<i></i>';
    var where = r.crate ? rateText(r.rate) + ' in ' + r.crate + (r.also.length ? ', also in ' + r.also.join(', ') : '') : 'not in a crate we know';
    var line = [where, r.mark].filter(Boolean).join(', ');
    var num = r.price == null ? '' : priceText(r.price, r.est) + (r.n > 1 ? ' each' : '');
    return '<div class="bx-dr">' + pic + '<span class="mid"><span class="name">' + (r.name ? esc(r.name) : 'Something from your bag') + (r.n > 1 ? ' ×' + r.n : '') + '</span>' +
      '<span class="made">' + esc(line) + '</span></span><span class="num">' + esc(num) + '</span></div>';
  }

  // what the part shows: b from build (or null before anything was read), whole: top and bottom both seen
  function view(b, o) {
    var head = '<div class="bx-dhead"><h3>My Deco</h3><span class="bx-dwhen">' + (b ? esc((o.when ? 'read ' + o.when + ', ' : '') + b.count + (b.count === 1 ? ' item' : ' items')) : '') + '</span></div>';
    var btn = o.sharing ? '' : '<div class="bx-dbar"><button type="button" class="k-btn sm" id="bx-deco-read">Read my Deco tab</button></div>';
    if (!b) {
      return head + '<p class="bx-dnote">' + esc(o.sharing ? "Open your bag's Deco tab and scroll it from the top to the bottom." : 'Share the game, open your bag on its Deco tab and scroll it from the top to the bottom. Everything in it gets listed with its price.') + '</p>' + btn;
    }
    // rings and marks that couldn't be read sit in neither side: said as a third part, so the line adds up to the total
    var split = b.sell.n + ' can sell, about ' + mes(b.sell.sum) + '. ' + b.worn.n + ' worn, about ' + mes(b.worn.sum) + '.' +
      (b.apart.n ? ' ' + b.apart.n + ' to check, about ' + mes(b.apart.sum) + '.' : '');
    var notes = [];
    if (!o.whole) notes.push('Scroll to the bottom to finish.');
    notes.push("Open your equipment window's Deco tab to count what you have on.");
    return head +
      '<div class="bx-dsum"><span class="name">All of it</span><span class="num">about ' + esc(mes(b.total)) + '</span></div>' +
      '<p class="bx-dsplit">' + esc(split) + '</p>' +
      notes.map(function (t) { return '<p class="bx-dnote">' + esc(t) + '</p>'; }).join('') +
      '<div class="bx-dlist">' + b.rows.map(rowHtml).join('') + '</div>' + btn;
  }

  function mount(el, o) {
    o = o || {};
    var now = o.now || function () { return Date.now(); };
    var rd = function () { try { return JSON.parse(o.store.get(KEY)); } catch (e) { return null; } };
    var wr = function (v) { try { o.store.set(KEY, JSON.stringify(v)); } catch (e) { /* this visit only */ } };
    // kept: the last read { state, ts, whole, n }, a whole one when there is one, else the fullest half one (the bottom
    // may never be seen: the mouse on the scroll bar hides the thumb); cur: the read going on now, a DecoTab
    var kept = rd(), deps = null, cur = null, sharing = false, last = 0, seen = -1e9, html = '';
    if (kept && kept.whole == null) kept.whole = true;   // saved before halves were kept: only whole reads were
    if (!kept || !kept.state || !(Array.isArray(kept.state.strips) || Array.isArray(kept.state.rows))) kept = null;
    Promise.resolve(o.deps).then(function (d) { deps = d; draw(); }, function () {});

    function draw() {
      var T = deps && deps.tab, b = null, whole = false, when = null;
      // while a read goes on it shows, unless a whole one is kept and this one has nothing yet
      var live = cur && cur.state().strips.length && (cur.done() || !(kept && kept.whole)) ? cur : null;
      if (live) { b = build(live.items(), o.crates, o.priceOf); whole = live.done(); when = 'now'; }
      else if (kept && T) { var k = T.create(kept.state); b = build(k.items(), o.crates, o.priceOf); whole = k.done(); when = day(kept.ts, now()); }
      var h = view(b, { sharing: sharing, whole: whole, when: when });
      if (h !== html) { el.innerHTML = h; html = h; }
    }
    el.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('#bx-deco-read') && o.start) o.start();
    });

    function frame(src) {
      if (!deps || !deps.screen || !deps.reader) return;
      var t = performance.now();
      if (t - last < (cur && cur.naming ? NAMING_MS : LOOK_MS)) return;
      last = t;
      var bag; try { bag = deps.screen.readBag(src); } catch (e) { return; }
      if (!bag || !bag.ok || bag.tab !== 'Deco') {
        // the Deco tab was shut: the next opening is a new read
        if (cur && t - seen > GONE_MS) { cur = null; draw(); }
        return;
      }
      seen = t;
      if (!cur) cur = deps.tab.create();
      var slots = deps.reader.name(src, bag, { budget: BUDGET });
      cur.naming = slots.some(function (q) { return q.pending; });
      if (cur.naming) return;   // a page goes in once every slot on it is named (or known not to be)
      var pics = [0, 1, 2, 3, 4, 5].map(function () { return null; });
      slots.forEach(function (q) { if (q.pic) (pics[q.r] || (pics[q.r] = {}))[q.c] = q.pic; });
      if (!cur.take(deps.tab.pageOf(slots, bag.scroll, pics))) return;
      // a whole read replaces the kept one; a half one is kept only until there's a whole one, and never over a fuller half
      var whole = cur.done(), n = cur.items().reduce(function (a, i) { return a + i.n; }, 0);
      if (whole || !kept || (!kept.whole && n >= (kept.n || 0))) { kept = { state: cur.state(), ts: now(), whole: whole, n: n }; wr(kept); }
      draw();
    }
    draw();
    return { frame: frame, sharing: function (on) { sharing = !!on; if (!on) cur = null; draw(); } };
  }

  window.MyDeco = { build: build, view: view, mount: mount, KEY: KEY };
})();
