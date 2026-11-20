// Box Odds on the site (#boxes, #boxes/<crate>): every Mystery Fashion Crate with its rates and FM prices, ticks for
// "any one" and "all of them" odds, and a pull log per player in Supabase (box_opens, box-opens.sql) while signed in.
// Ported from the Box Odds artifact (box-odds/index.html): the odds and the crate order are copied unchanged, the db is
// the page's api (listBoxOpens, addBoxOpen, removeBoxOpen) and ticks and filters stay on the device under bt.box.
// window.BoxOdds = { anyOdds, allOdds, statusOf, orderCrates, mount, mes, priceHtml }; the data is data/box.json from
// npm run box:items.
(function () {
  'use strict';
  var KEY = 'bt.box';
  var SLOT_ORDER = ['Hat', 'Face', 'Eye', 'Earring', 'Top', 'Overall', 'Bottom', 'Shoes', 'Gloves', 'Cape', 'Ring', 'Weapon'];
  var DEFER_STATES = 5000;   // "all of them" sets bigger than this fill in after the rest of the card
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var fmt = function (n) { return Math.round(n).toLocaleString('en-US'); };
  var pct = function (p) { return (Math.round(p * 1000) / 10) + '%'; };
  var day = function (ms) { return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
  // mesos the recipe book's way: 9,999 / 10K / 100K / 1.5M
  function mes(n) {
    var a = Math.abs(n), s = n < 0 ? '-' : '';
    if (a < 10) return s + (Math.round(a * 100) / 100).toLocaleString('en-US');
    if (a < 10000) return s + Math.round(a).toLocaleString('en-US');
    if (a < 100000) return s + String(Math.round(a / 100) / 10) + 'K';
    if (a < 1000000) return s + Math.round(a / 1000) + 'K';
    return s + String(Math.round(a / 10000) / 100) + 'M';
  }
  var cozyUrl = function (cz) { return +cz > 0 ? 'https://cozy.markets/items/' + (+cz) : ''; };
  // the slot line's price: real FM price, a rarity guess, or no price (nothing at all when the data carries no prices)
  function priceHtml(i, on) {
    if (on === false) return '';
    var inner = i.fm && +i.fm.price > 0 ? '<span class="fm">' + mes(+i.fm.price) + '</span> on the FM'
      : i.est && +i.est.lo > 0 ? 'est. ' + mes(+i.est.lo) + ' to ' + mes(+i.est.hi) : '';
    if (!inner) return ' · no price';
    var u = cozyUrl(i.cz);
    return ' · ' + (u ? '<a href="' + u + '" target="_blank" rel="noopener" title="See ' + esc(i.name) + ' on Cozy Markets">' + inner + '</a>' : inner);
  }
  function worthHtml(c, on) {
    var w = c.worth;
    if (!on || !w || !(+w.mesos > 0)) return '';
    var g = +w.guesses || 0;
    return '<p class="worth">About <b>' + mes(+w.mesos) + '</b> mesos a crate' + (g ? ', rough while ' + (g === 1 ? '1 price is a guess' : g + ' prices are guesses') : '') + '</p>';
  }

  // ---------- the odds ----------
  // any one of a set with total rate p: every crate is a fresh roll at p
  function anyOdds(p) {
    if (p >= 1 - 1e-12) return { mean: 1, half: 1, nine: 1 };
    return { mean: 1 / p, half: Math.ceil(Math.log(0.5) / Math.log(1 - p)), nine: Math.ceil(Math.log(0.1) / Math.log(1 - p)) };
  }
  // rates grouped by whole hundredths of a percent, so float noise never splits a tier
  function tiersOf(rates) {
    var g = new Map();
    rates.forEach(function (r) { var k = Math.round(r * 10000); g.set(k, (g.get(k) || 0) + 1); });
    return Array.from(g).sort(function (a, b) { return a[0] - b[0]; }).map(function (e) { return { r: e[0] / 10000, m: e[1] }; });
  }
  var tierKey = function (tiers) { return tiers.map(function (t) { return t.r + 'x' + t.m; }).join(); };
  var stateCount = function (tiers) { return tiers.reduce(function (a, t) { return a * (t.m + 1); }, 1); };
  var allCache = new Map();
  // all of a set: walk the chance of every "how many of each rate I have so far" state forward one crate at a time
  function allOdds(rates) {
    var tiers = tiersOf(rates), key = tierKey(tiers);
    if (allCache.has(key)) return allCache.get(key);
    var T = tiers.length, dims = tiers.map(function (t) { return t.m + 1; }), size = stateCount(tiers);
    var nextIdx = new Int32Array(size * T), nextQ = new Float64Array(size * T), stay = new Float64Array(size);
    for (var s = 0; s < size; s++) {
      var rem = s, st = 1, stride = 1;
      for (var k = 0; k < T; k++) {
        var c = rem % dims[k]; rem = (rem - c) / dims[k];
        var q = (tiers[k].m - c) * tiers[k].r;
        nextIdx[s * T + k] = q > 0 ? s + stride : -1; nextQ[s * T + k] = q; st -= q;
        stride *= dims[k];
      }
      stay[s] = st;
    }
    var P = new Float64Array(size), Q = new Float64Array(size), tmp;
    P[0] = 1;
    var mean = 1, half = 0, nine = 0;
    for (var n = 1; n < 200000; n++) {
      Q.fill(0);
      for (s = 0; s < size; s++) {
        var v = P[s]; if (!v) continue;
        Q[s] += v * stay[s];
        for (k = 0; k < T; k++) { var j = nextIdx[s * T + k]; if (j >= 0) Q[j] += v * nextQ[s * T + k]; }
      }
      tmp = P; P = Q; Q = tmp;
      var done = P[size - 1];
      if (!half && done >= 0.5) half = n;
      if (!nine && done >= 0.9) nine = n;
      mean += 1 - done;
      if (1 - done < 1e-9) break;
    }
    var out = { mean: mean, half: half, nine: nine };
    allCache.set(key, out);
    return out;
  }

  // ---------- crates and when they sell ----------
  function statusOf(crate, now) {
    var start = Date.parse(crate.start), end = Date.parse(crate.end);
    if (now < start) return { state: 'soon', label: 'Starts ' + day(start) };
    if (now < end) return { state: 'on', label: 'On sale until ' + day(end) };
    return { state: 'ended', label: 'Ended ' + day(end) };
  }
  // on sale by start, newest first; then not started yet, soonest first; then ended, newest first
  function orderCrates(crates, now) {
    var t = function (c, f) { return Date.parse(c[f]); };
    var by = function (st) { return crates.filter(function (c) { return statusOf(c, now).state === st; }); };
    return [].concat(
      by('on').sort(function (a, b) { return t(b, 'start') - t(a, 'start'); }),
      by('soon').sort(function (a, b) { return t(a, 'start') - t(b, 'start'); }),
      by('ended').sort(function (a, b) { return t(b, 'end') - t(a, 'end') || t(b, 'start') - t(a, 'start'); }));
  }

  // the server's own refusals (box-opens.sql's trigger) are shown as they come; any other failure gets our words
  var SERVER = ['Saving is turned off for this account.', "Slow down, that's too fast.", 'Your log is full.'];
  var TRANSIENT = ['Could not save that. Try again.', 'Could not undo that. Try again.', 'Your log did not load. Reload the page to try again.'].concat(SERVER);
  var SHELL =
    '<div class="bx">' +
    '<div class="bx-top"><h2>Box Odds</h2><p>Mystery Fashion Crate odds and FM prices. Tick what you\'re after.</p></div>' +
    '<div class="bx-crates" id="bx-crates" role="group" aria-label="Crate"></div>' +
    '<div class="bx-info" id="bx-info"></div>' +
    '<div class="bx-logbar" id="bx-logbar" hidden><span id="bx-log-line">Loading your log…</span>' +
      '<button type="button" class="bx-linkish" id="bx-undo" disabled>Undo last crate</button></div>' +
    '<p class="bx-note" id="bx-note" role="status"></p>' +
    '<section class="bx-sum" id="bx-sum" aria-live="polite"></section>' +
    '<div class="bx-tools"><div class="bx-bar-row"><div class="bx-pills" id="bx-sort" role="group" aria-label="Sort by">' +
      '<button type="button" class="k-btn sm" data-sort="rate">Rate</button><button type="button" class="k-btn sm" data-sort="name">Name</button>' +
      '<button type="button" class="k-btn sm" data-sort="slot">Slot</button></div>' +
      '<button type="button" class="bx-linkish" id="bx-clear">Clear ticks</button></div>' +
      '<div class="bx-filters"><select id="bx-slot" aria-label="Slot"></select><select id="bx-rate" aria-label="Rate"></select>' +
      '<input id="bx-q" type="search" placeholder="Find an item" aria-label="Find an item" autocomplete="off"></div></div>' +
    '<div class="bx-list" id="bx-list"></div>' +
    '<p class="bx-empty" id="bx-empty" hidden>No items match.</p>' +
    '<p class="bx-foot"><span id="bx-credit"></span>Rates from Nexon\'s rate pages, pictures from the game\'s own files. Ticks and filters stay on this device, your log is kept with your Discord sign in.</p>' +
    '</div>';

  function mount(root, o) {
    o = o || {};
    var data = o.data || {}, CRATES = Array.isArray(data.crates) ? data.crates : [];
    var api = o.api || {}, store = o.store || { get: function () { return null; }, set: function () {} };
    var HAS_PRICES = typeof data.priced === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.priced);
    if (!CRATES.length) {
      root.innerHTML = '<p class="empty">No crates to show yet.</p>';
      return { refresh: function () {}, show: function () {}, report: function () { return { crates: 0 }; } };
    }
    var ordered = orderCrates(CRATES, Date.now());
    var byKey = new Map(CRATES.map(function (c) { return [c.key, c]; }));
    root.innerHTML = SHELL;
    var $ = function (id) { return root.querySelector('#' + id); };
    if (HAS_PRICES) $('bx-credit').innerHTML = '<a href="https://cozy.markets" target="_blank" rel="noopener">Prices from Cozy Markets</a>, ' +
      new Date(data.priced + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) + '. ';

    // ---------- what this device remembers ----------
    function load() {
      var s = null;
      try { s = JSON.parse(store.get(KEY)); } catch (e) { s = null; }
      if (!s || typeof s !== 'object') s = {};
      var per = s.per && typeof s.per === 'object' ? s.per : {}, out = {
        crate: byKey.has(s.crate) ? s.crate : ordered[0].key,
        sort: ['rate', 'name', 'slot'].indexOf(s.sort) >= 0 ? s.sort : 'rate',
        per: {}
      };
      CRATES.forEach(function (c) {
        var v = per[c.key] && typeof per[c.key] === 'object' ? per[c.key] : {}, ids = new Set(c.items.map(function (i) { return i.id; }));
        var str = function (x) { return typeof x === 'string' ? x : ''; };
        out.per[c.key] = { ticks: Array.isArray(v.ticks) ? v.ticks.filter(function (id) { return ids.has(id); }) : [], slot: str(v.slot), rate: str(v.rate), q: str(v.q) };
      });
      return out;
    }
    function save() { try { store.set(KEY, JSON.stringify(state)); } catch (e) { /* this visit only */ } }
    var state = load();
    // a crate from the hash wins; one it doesn't know opens the first; no crate keeps the one remembered here
    var resolve = function (key) { return !key ? state.crate : byKey.has(key) ? key : ordered[0].key; };
    state.crate = resolve(o.crate);
    var crate = function () { return byKey.get(state.crate); };
    var mine = function () { return state.per[state.crate]; };

    // ---------- the log: the player's box_opens rows, while signed in ----------
    var session = o.session || null, logs = [], logState = 'off', busy = false, gen = 0;
    var say = function (msg) { $('bx-note').textContent = msg || ''; };
    var clearTransient = function () { var n = $('bx-note'); if (TRANSIENT.indexOf(n.textContent) >= 0 || n.querySelector('#bx-signin')) say(''); };
    var crateLogs = function () { return logs.filter(function (d) { return d.crate === state.crate; }); };
    var norm = function (r) { r = r || {}; return { id: r.id, crate: r.crate, itemId: +r.item_id, ts: Date.parse(r.created_at) }; };
    var valid = function (d) { return d.id != null && typeof d.crate === 'string' && d.itemId > 0 && isFinite(d.ts); };
    var ready = function () { return !!session && logState === 'ready' && !busy; };
    function counts() {
      var m = new Map();
      crateLogs().forEach(function (d) { m.set(d.itemId, (m.get(d.itemId) || 0) + 1); });
      return m;
    }
    function signPrompt() {
      var n = $('bx-note');
      n.textContent = 'Sign in to keep a log of what came out. ';
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'k-btn sm'; b.id = 'bx-signin'; b.textContent = 'Sign in with Discord';
      n.append(b);
    }

    // ---------- drawing ----------
    function visibleItems() {
      var c = crate(), f = mine(), q = f.q.trim().toLowerCase();
      var rows = c.items.filter(function (i) {
        return (!f.slot || i.slot === f.slot) && (!f.rate || String(i.rate) === f.rate) && (!q || i.name.toLowerCase().indexOf(q) >= 0);
      });
      var byName = function (a, b) { return a.name.localeCompare(b.name); };
      return rows.sort(state.sort === 'name' ? byName
        : state.sort === 'slot' ? function (a, b) { return SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot) || b.rate - a.rate || byName(a, b); }
        : function (a, b) { return b.rate - a.rate || byName(a, b); });
    }
    function drawCrates() {
      $('bx-crates').innerHTML = ordered.map(function (c) {
        var st = statusOf(c, Date.now());
        return '<button type="button" class="k-btn bx-crate" data-crate="' + esc(c.key) + '" aria-pressed="' + (c.key === state.crate) + '">' +
          '<img src="' + c.icon + '" alt="" width="32" height="32"><span class="c-name">' + esc(c.short) + '</span>' +
          '<span class="bx-chip ' + st.state + '">' + esc(st.label) + '</span></button>';
      }).join('');
      var c = crate(), st = statusOf(c, Date.now());
      $('bx-info').innerHTML = '<h3>' + esc(c.name) + '</h3><p class="meta">' + esc(c.price) + ' · ' + c.items.length + ' items · ' + esc(st.label) +
        ' · <a href="' + esc(c.source) + '" target="_blank" rel="noopener">' + (/nexon\.com/.test(c.source) ? 'Nexon\'s rates' : 'Rates on meowdb') + '</a></p>' + worthHtml(c, HAS_PRICES);
    }
    function fillSelect(el, values, label, every, current) {
      el.innerHTML = '<option value="">' + every + '</option>' + values.map(function (v) {
        return '<option value="' + esc(v) + '">' + esc(label(v)) + '</option>';
      }).join('');
      el.value = values.indexOf(current) >= 0 ? current : '';
      return el.value;
    }
    function drawControls() {
      var c = crate(), f = mine();
      Array.prototype.forEach.call(root.querySelectorAll('#bx-sort [data-sort]'), function (b) { b.setAttribute('aria-pressed', String(b.dataset.sort === state.sort)); });
      var slots = SLOT_ORDER.filter(function (s) { return c.items.some(function (i) { return i.slot === s; }); });
      var rates = Array.from(new Set(c.items.map(function (i) { return i.rate; }))).sort(function (a, b) { return a - b; }).map(String);
      f.slot = fillSelect($('bx-slot'), slots, function (s) { return s; }, 'Every slot', f.slot);
      f.rate = fillSelect($('bx-rate'), rates, function (r) { return r + '%'; }, 'Every rate', f.rate);
      if ($('bx-q').value !== f.q) $('bx-q').value = f.q;
    }
    // signed out, + stays pressable and asks for a sign in; signed in, it waits for the log and for the last save
    var gotOff = function () { return !!session && !ready(); };
    function drawList() {
      var ticks = new Set(mine().ticks), rows = visibleItems(), have = counts(), off = gotOff();
      $('bx-list').innerHTML = rows.map(function (i) {
        var on = ticks.has(i.id), n = have.get(i.id) || 0;
        return '<div class="bx-row' + (on ? ' on' : '') + '" data-id="' + i.id + '">' +
          '<input type="checkbox" id="bx-t-' + i.id + '"' + (on ? ' checked' : '') + '>' +
          '<img src="' + i.icon + '" alt="" width="32" height="32">' +
          '<div class="mid"><div class="line"><label class="name" for="bx-t-' + i.id + '">' + esc(i.name) + '</label>' +
          (n ? '<span class="got">got ' + n + '</span>' : '') + '</div>' +
          '<span class="slot">' + esc(i.slot) + priceHtml(i, HAS_PRICES) + '</span></div>' +
          '<div class="num">' + i.rate + '%<small>1 in ' + fmt(100 / i.rate) + '</small></div>' +
          '<button type="button" class="k-sq bx-got" id="bx-g-' + i.id + '" aria-label="Got ' + esc(i.name) + '"' + (off ? ' disabled' : '') + '>+</button></div>';
      }).join('');
      $('bx-empty').hidden = rows.length > 0;
    }
    function setGotDisabled() {
      var off = gotOff();
      Array.prototype.forEach.call(root.querySelectorAll('.bx-got'), function (b) { b.disabled = off; });
      $('bx-undo').disabled = !ready() || !crateLogs().length;
    }
    var tiles = function (o) {
      var b = function (x) { return o ? fmt(x) : '…'; };
      return '<div class="bx-tiles"><div class="bx-tile"><b>' + b(o && o.mean) + '</b><span>crates on average</span></div>' +
        '<div class="bx-tile"><b>' + b(o && o.half) + '</b><span>half the time by</span></div>' +
        '<div class="bx-tile"><b>' + b(o && o.nine) + '</b><span>9 times in 10 by</span></div></div>';
    };
    var head = function (title, odds) { return '<div class="head"><h4>' + esc(title) + '</h4> <span class="odds">' + odds + '</span></div>'; };
    var sumJob = 0;
    function drawSum() {
      var job = ++sumJob, c = crate(), ticks = new Set(mine().ticks), el = $('bx-sum');
      var sel = c.items.filter(function (i) { return ticks.has(i.id); });
      if (!sel.length) { el.innerHTML = '<p class="hint">Tick one item, or a few, to see your odds.</p>'; return; }
      var total = sel.reduce(function (a, i) { return a + i.rate; }, 0), p = total / 100;
      var odds = pct(p) + ' a crate, 1 in ' + fmt(1 / p);
      var shown = new Set(visibleItems().map(function (i) { return i.id; }));
      var hidden = sel.filter(function (i) { return !shown.has(i.id); }).length;
      var note = hidden ? '<p class="note">' + hidden + ' ticked ' + (hidden === 1 ? 'is' : 'are') + ' hidden by your filters.</p>' : '';
      // what the log says you already have: the "all of them" tiles count from here
      var have = counts(), left = sel.filter(function (i) { return !have.get(i.id); });
      if (!left.length) { el.innerHTML = '<h4>' + (sel.length === 1 ? 'You have ' + esc(sel[0].name) + '.' : 'You have all ' + sel.length + '.') + '</h4>' + note; return; }
      if (sel.length === 1) { el.innerHTML = '<div class="block">' + head(sel[0].name, odds) + tiles(anyOdds(p)) + '</div>' + note; return; }
      var rates = left.map(function (i) { return i.rate / 100; }), tiers = tiersOf(rates), all = null;
      if (allCache.has(tierKey(tiers)) || stateCount(tiers) <= DEFER_STATES) all = allOdds(rates);
      else setTimeout(function () { if (job !== sumJob) return; allOdds(rates); if (job === sumJob) drawSum(); }, 120);
      var sofar = left.length < sel.length ? (sel.length - left.length) + ' of ' + sel.length + ' so far' : 'the whole set';
      el.innerHTML = '<div class="block">' + head('Any one of these ' + sel.length, odds) + tiles(anyOdds(p)) + '</div>' +
        '<div class="block">' + head('All ' + sel.length + ' of them', sofar) + tiles(all) + '</div>' + note;
    }
    function drawLog() {
      var n = crateLogs().length;
      $('bx-logbar').hidden = !session || logState === 'failed';
      $('bx-log-line').textContent = logState !== 'ready' ? 'Loading your log…' : !n ? 'No crates logged yet. Tap + on what came out.'
        : fmt(n) + (n === 1 ? ' crate opened' : ' crates opened');
      $('bx-undo').disabled = !ready() || !n;
    }
    function render() {
      var focused = document.activeElement && root.contains(document.activeElement) && document.activeElement.id;
      drawCrates(); drawControls(); drawList(); drawSum(); drawLog();
      var back = focused && $(focused);
      if (back && back !== document.activeElement) back.focus({ preventScroll: true });
    }
    function scrollStrip() {
      var picked = root.querySelector('#bx-crates [aria-pressed="true"]'), strip = $('bx-crates');
      if (picked && picked !== strip.firstElementChild) strip.scrollLeft += picked.getBoundingClientRect().left - strip.getBoundingClientRect().left;
    }

    // ---------- doing ----------
    function setTick(id, on) {
      var f = mine(), at = f.ticks.indexOf(id);
      if (on && at < 0) f.ticks.push(id);
      if (!on && at >= 0) f.ticks.splice(at, 1);
      save();
      var row = root.querySelector('#bx-list .bx-row[data-id="' + id + '"]');
      if (row) row.classList.toggle('on', on);
      drawSum();
    }
    function logOne(id) {
      var c = crate(), it = c.items.filter(function (i) { return i.id === id; })[0];
      if (!it) return;
      if (!session) { signPrompt(); return; }
      if (!ready()) return;
      busy = true; setGotDisabled();
      var g = gen;
      Promise.resolve().then(function () { return api.addBoxOpen(c.key, id); }).then(function (row) {
        if (g !== gen) return;
        busy = false;
        var d = norm(row);
        logs.unshift(valid(d) ? d : { id: row && row.id, crate: c.key, itemId: id, ts: Date.now() });
        clearTransient(); render();
      }, function (e) {
        if (g !== gen) return;
        busy = false;
        say(e && SERVER.indexOf(e.message) >= 0 ? e.message : TRANSIENT[0]); render();
      });
    }
    function undo() {
      var list = crateLogs();
      if (!ready() || !list.length) return;
      var newest = list.reduce(function (a, d) { return d.ts > a.ts || (d.ts === a.ts && d.id > a.id) ? d : a; });
      busy = true; setGotDisabled();
      var g = gen;
      Promise.resolve().then(function () { return api.removeBoxOpen(newest.id); }).then(function () {
        if (g !== gen) return;
        busy = false; logs = logs.filter(function (d) { return d !== newest; });
        clearTransient(); render();
      }, function () {
        if (g !== gen) return;
        busy = false; say(TRANSIENT[1]); render();
      });
    }
    var uidOf = function (s) { return s && s.user && s.user.id || null; };
    // the server sends at most PAGE rows a request (Supabase's Max rows), so a long log comes in pages until a short one
    var PAGE = 1000;
    function listAll() {
      var all = [];
      var next = function () {
        return Promise.resolve(api.listBoxOpens(all.length, all.length + PAGE - 1)).then(function (rows) {
          rows = Array.isArray(rows) ? rows : [];
          all = all.concat(rows);
          return rows.length < PAGE ? all : next();
        });
      };
      return next();
    }
    function refresh(s) {
      // the same player again (a token refresh, the load's second auth event): keep the log and any save in flight
      var uid = uidOf(s);
      if (uid && uid === uidOf(session) && (logState === 'ready' || logState === 'loading')) { session = s; return; }
      session = s || null; logs = []; busy = false;
      var g = ++gen;
      if (!session) { logState = 'off'; clearTransient(); render(); return; }
      logState = 'loading'; clearTransient(); render();
      Promise.resolve().then(listAll).then(function (rows) {
        if (g !== gen) return;
        logs = rows.map(norm).filter(valid);
        logState = 'ready'; clearTransient(); render();
      }, function () {
        if (g !== gen) return;
        logState = 'failed'; say(TRANSIENT[2]); render();
      });
    }
    function show(key) {
      var k = resolve(key);
      if (k === state.crate) return;
      state.crate = k; save(); render(); scrollStrip();
    }

    root.addEventListener('click', function (e) {
      var t = e.target;
      var b = t.closest('#bx-crates [data-crate]');
      if (b) {
        if (b.dataset.crate !== state.crate) { state.crate = b.dataset.crate; save(); render(); }
        if (o.onCrate) o.onCrate(state.crate);
        return;
      }
      var s = t.closest('#bx-sort [data-sort]');
      if (s) { state.sort = s.dataset.sort; save(); render(); return; }
      if (t.closest('#bx-clear')) { mine().ticks = []; save(); render(); return; }
      if (t.closest('#bx-undo')) { undo(); return; }
      if (t.closest('#bx-signin')) { if (o.signIn) o.signIn(); return; }
      var g = t.closest('.bx-got');
      if (g) { logOne(+g.closest('.bx-row').dataset.id); return; }
      // a click anywhere else on a row ticks it
      if (t.closest('input, label, button, a')) return;
      var row = t.closest('.bx-row'); if (!row) return;
      var cb = row.querySelector('input[type=checkbox]');
      cb.checked = !cb.checked; setTick(+row.dataset.id, cb.checked);
    });
    root.addEventListener('change', function (e) {
      var t = e.target;
      if (t.id === 'bx-slot') { mine().slot = t.value; save(); render(); return; }
      if (t.id === 'bx-rate') { mine().rate = t.value; save(); render(); return; }
      var row = t.closest('.bx-row');
      if (row && t.type === 'checkbox') setTick(+row.dataset.id, t.checked);
    });
    root.addEventListener('input', function (e) {
      if (e.target.id === 'bx-q') { mine().q = e.target.value; save(); drawList(); drawSum(); }
    });

    refresh(session);
    scrollStrip();
    return {
      refresh: refresh,
      show: show,
      // for Report a problem: what's picked and how big the log is, never the rows themselves
      report: function () {
        var f = mine();
        return { crate: state.crate, sort: state.sort, ticks: f.ticks.slice(), slot: f.slot, rate: f.rate, q: f.q, signedIn: !!session, log: logState, logCount: crateLogs().length };
      }
    };
  }

  window.BoxOdds = { anyOdds: anyOdds, allOdds: allOdds, statusOf: statusOf, orderCrates: orderCrates, mount: mount, mes: mes, priceHtml: priceHtml };
})();
