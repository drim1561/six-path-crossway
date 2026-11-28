// NX Crates on the site (#boxes, #boxes/<crate>): tap what each Mystery Fashion Crate gave, Done, and see the round's worth at
// Cozy Markets prices. Rounds live in Supabase (box_opens, box_rounds; box-opens.sql and box-rounds.sql) under the Discord
// sign in. Rates come from Nexon only; the data is data/box.json from npm run box:items.
// window.BoxOdds = { priceOf, madeWord, parseMesos, rounds, roundTotal, result, allItems, suggestCost, ageOf, statusOf,
// orderCrates, popView, mount, mes }.
(function () {
  'use strict';
  var CRATE_KEY = 'box-crate-v1', ROUND_KEY = 'box-round-v1', OFF_KEY = 'box-off-v1';
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var fmt = function (n) { return Math.round(n).toLocaleString('en-US'); };
  var day = function (ms) { return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
  // mesos the recipe book's way: 9,999 / 10K / 100K / 1.5M
  function mes(n) {
    var a = Math.abs(n), s = n < 0 ? '-' : '';
    if (a < 10) return s + (Math.round(a * 100) / 100).toLocaleString('en-US');
    if (a < 10000) return s + Math.round(a).toLocaleString('en-US');
    if (a < 100000) return s + String(Math.round(a / 100) / 10) + 'K';
    if (a < 999500) return s + Math.round(a / 1000) + 'K';
    return s + String(Math.round(a / 10000) / 100) + 'M';
  }
  var cozyUrl = function (cz) { return +cz > 0 ? 'https://cozy.markets/items/' + (+cz) : ''; };
  // a price as the rows print it: 125K, est. 60K, or nothing
  var priceText = function (price, est) { return price == null ? '' : (est ? 'est. ' : '') + mes(price); };

  // the pop-out's inside: this round's pulls, newest on top (picture, name, chance, the price saved with the pull), then
  // how many crates and their worth by the round's own rules (roundTotal), and a line for pulls the reader couldn't read.
  // Rows come with a Done button beside the title. over: the round is finished, so only its foot stays, with a line
  // asking for the next crate (the window with no Grind run, one pop-out 2026-11-26). close: a Close button too, for the
  // app's overlay while Grind's panel, which has the overlay's own close, is not in it
  function popView(pulls, c, missed, over, close, pick) {
    var byId = {};
    (c ? c.items : []).forEach(function (i) { byId[i.id] = i; });
    var list = (pulls || []).slice().sort(function (a, b) { return b.ts - a.ts; });
    var rows = list.length && !over;
    var html = '<div class="bx-pop-top"><h3 class="bx-pop-h">' + esc(c ? c.name || c.short : 'NX Crates') + '</h3>' +
      (rows ? '<button type="button" class="k-btn sm" id="bx-pop-done">Done</button>' : '') +
      (close ? '<button type="button" class="k-btn sm" id="bx-pop-x" title="Stop sharing and close">Close</button>' : '') + '</div>';
    if (!rows) html += '<p class="bx-pop-wait">' + (list.length ? 'Open a crate to start another.' : 'Open a crate in the game.') + '</p>';
    else html += '<div class="bx-pop-rows">' + list.map(function (p) {
      var it = byId[p.itemId];
      var price = p.mine != null ? 'yours ' + mes(p.mine) : priceText(p.price, p.est === true);
      return '<div class="bx-pop-r">' + (it && it.icon ? '<img src="' + it.icon + '" alt="" width="32" height="32">' : '<i></i>') +
        '<span class="name">' + esc(it ? it.name : 'Unknown item') + '<small>' + (it ? esc(it.rate) + '% chance' : '') + '</small></span>' +
        '<span class="num">' + esc(price) + '</span></div>';
    }).join('') + '</div>';
    if (missed && !over) html += '<p class="bx-pop-miss">Couldn\'t read ' + missed + '. Tap ' + (missed === 1 ? 'it' : 'them') + ' on the site.</p>';
    if (rows) html += pickRow(costChoices(c, list.length), pick, '<div class="bx-pop-cost"><span>Cost</span>', '</div>');
    if (list.length) {
      var t = roundTotal(list, byId, false), n = list.length;
      html += '<p class="bx-pop-foot"><span>' + n + (n === 1 ? ' crate' : ' crates') + '</span><span>worth <b>' + esc(mes(t.total)) + '</b></span></p>';
    }
    return html;
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
    '<div class="bx-top"><h2>NX Crates</h2><p>Log what your crates give you and see what it was worth.</p></div>' +
    '<div class="bx-crates" id="bx-crates" role="group" aria-label="Crate"></div>' +
    '<div class="bx-info"><p id="bx-info"></p><p id="bx-nx" hidden></p><p id="bx-trend" hidden></p></div>' +
    '<section class="bx-read" id="bx-read" hidden><div id="bx-read-bar"></div><p id="bx-read-note" role="status"></p></section>' +
    '<p class="bx-note" id="bx-note" role="status"></p>' +
    '<section class="bx-round" id="bx-round" aria-live="polite" hidden>' +
      '<h3 id="bx-round-head"></h3><div id="bx-round-list"></div><p class="bx-foot-sum" id="bx-round-foot"></p>' +
      '<div class="bx-costbar" id="bx-cost" hidden><div class="bx-cost-edit">' +
        '<span class="bx-costlab">What did these cost?<small>optional</small></span>' +
        '<div class="bx-costrow"><input id="bx-cost-in" type="text" inputmode="text" autocomplete="off" aria-label="What these crates cost" placeholder="35,000">' +
        '<span class="bx-units" id="bx-cost-unit" role="group" aria-label="Unit"></span><span class="bx-picks" id="bx-cost-picks" role="group" aria-label="Crate price"></span></div>' +
        '<p class="bx-bad" id="bx-cost-bad" role="alert" hidden></p></div></div>' +
      '<div class="bx-donebar" id="bx-donebar"></div></section>' +
    '<section class="bx-deco" id="bx-deco" hidden></section>' +
    '<section class="bx-past" id="bx-past" hidden><h3>Past rounds</h3>' +
      '<div class="bx-views" id="bx-past-view" role="group" aria-label="View"></div><p class="bx-past-head" id="bx-past-head"></p>' +
      '<div id="bx-past-list"></div><div class="bx-morerow" id="bx-morerow"></div></section>' +
    '<input id="bx-q" type="search" placeholder="Find an item" aria-label="Find an item" autocomplete="off">' +
    '<div class="bx-list" id="bx-list"></div>' +
    '<p class="bx-empty" id="bx-empty" hidden>No items match.</p>' +
    '<div class="bx-prices"><a id="bx-prices" href="https://cozy.markets" target="_blank" rel="noopener"></a>' +
    '<details id="bx-how"><summary>How prices are made</summary><p>The middle of what each item sold for over the last day.</p>' +
    '<p>When a day is too thin, the last 3 days or the week.</p>' +
    '<p>When nothing sold, the listed price, shown as estimated. Cozy remakes them every 6 hours.</p></details></div>' +
    '<p class="bx-foot">Rates from Nexon\'s rate pages, pictures from the game\'s own files. Your log is kept with your Discord sign in.</p>' +
    '</div>';

  function mount(root, o) {
    o = o || {};
    var data = o.data || {}, CRATES = Array.isArray(data.crates) ? data.crates : [];
    var api = o.api || {}, store = o.store || { get: function () { return null; }, set: function () {} };
    if (!CRATES.length) {
      root.innerHTML = '<p class="empty">No crates to show yet.</p>';
      return { refresh: function () {}, show: function () {}, report: function () { return { crates: 0 }; } };
    }
    var ordered = orderCrates(CRATES, Date.now());
    var byKey = new Map(CRATES.map(function (c) { return [c.key, c]; }));
    root.innerHTML = SHELL;
    var $ = function (id) { return root.querySelector('#' + id); };
    var rd = function (k) { try { return store.get(k); } catch (e) { return null; } };
    var wr = function (k, v) { try { store.set(k, v); } catch (e) { /* this visit only */ } };
    var drop = function (k) { try { if (store.remove) store.remove(k); else store.set(k, ''); } catch (e) { /* this visit only */ } };

    // ---------- what this device remembers ----------
    var state = { crate: byKey.has(rd(CRATE_KEY)) ? rd(CRATE_KEY) : ordered[0].key };
    var round = null;   // { crate, round } while a round is open
    try {
      var r0 = JSON.parse(rd(ROUND_KEY));
      if (r0 && byKey.has(r0.crate) && +r0.round >= 1600000000000) round = { crate: r0.crate, round: +r0.round };
    } catch (e) { round = null; }
    if (!round) drop(ROUND_KEY);
    var saveCrate = function () { wr(CRATE_KEY, state.crate); };
    var saveRound = function () { if (round) wr(ROUND_KEY, JSON.stringify(round)); else drop(ROUND_KEY); };
    // a crate from the hash wins; one it doesn't know opens the first; no crate keeps the one remembered here
    var resolve = function (key) { return !key ? state.crate : byKey.has(key) ? key : ordered[0].key; };
    state.crate = resolve(o.crate);
    if (o.crate) saveCrate();
    var crate = function () { return byKey.get(state.crate); };
    var HAS_PRICES = isFinite(Date.parse(data.priced));
    var priceFor = function (it) { return HAS_PRICES ? priceOf(it) : { price: null, est: null, basis: null, win: null }; };

    // ---------- the log: the player's box_opens rows, while signed in ----------
    var session = o.session || null, logs = [], logState = 'off', busy = false, gen = 0, lastRound = 0;
    var adding = false, waiting = [];   // one save at a time: taps made during a save wait their turn
    var costs = new Map();                                   // round -> { cost, unit }, the player's box_rounds rows
    var costPick = null, pickFor = null;                     // 'buy' or 'pack': the tapped price, following the count of round pickFor
    var costUnit = 'nx', BAD = "That doesn't look like a number.";
    var past = { view: 'rounds', rounds: 5, items: 20, fresh: null, open: new Set(), edit: null, editUnit: 'nx', editText: '', editErr: '', pe: null, del: null, join: null, thanks: null };
    var say = function (msg) { $('bx-note').textContent = msg || ''; };
    var clearTransient = function () { var n = $('bx-note'); if (TRANSIENT.indexOf(n.textContent) >= 0 || n.querySelector('#bx-signin') || n.querySelector('#bx-done')) say(''); };
    var num = function (x) { return x == null || x === '' || !isFinite(+x) ? null : +x; };
    var norm = function (r) {
      r = r || {};
      return { id: r.id, crate: r.crate, itemId: +r.item_id, ts: Date.parse(r.created_at), round: num(r.round), price: num(r.price),
        est: typeof r.est === 'boolean' ? r.est : null, basis: r.basis || null, win: r.win || null, mine: num(r.mine) };
    };
    var valid = function (d) { return d.id != null && typeof d.crate === 'string' && d.itemId > 0 && isFinite(d.ts); };
    var ready = function () { return !!session && logState === 'ready' && !busy; };
    // a round is a past round once it's Done: the open one stays in its own panel
    var doneLogs = function () { return round ? logs.filter(function (d) { return d.round !== round.round; }) : logs; };
    var roundPulls = function () { return round ? logs.filter(function (d) { return d.round === round.round; }) : []; };
    function button(id, text, cls) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = cls || 'k-btn sm'; b.id = id; b.textContent = text;
      return b;
    }
    function signPrompt() {
      var n = $('bx-note');
      n.textContent = 'Sign in to keep a log of what came out. ';
      n.append(button('bx-signin', 'Sign in with Discord'));
    }
    function finishPrompt() {
      var n = $('bx-note');
      n.textContent = 'Finish your ' + day(round.round) + ' round first. ';
      n.append(button('bx-done', 'Done'));
    }

    // ---------- drawing ----------
    function drawCrates() {
      $('bx-crates').innerHTML = ordered.map(function (c) {
        var st = statusOf(c, Date.now());
        return '<button type="button" class="k-btn bx-crate" data-crate="' + esc(c.key) + '" aria-pressed="' + (c.key === state.crate) + '">' +
          '<img src="' + c.icon + '" alt="" width="32" height="32"><span class="c-name">' + esc(c.short) + '</span>' +
          '<span class="bx-chip ' + st.state + '">' + esc(st.label) + '</span></button>';
      }).join('');
    }
    function drawInfo() {
      var c = crate(), st = statusOf(c, Date.now());
      $('bx-info').innerHTML = esc(c.price) + ' · ' + c.items.length + ' items · ' + esc(st.label) +
        ' · <a href="' + esc(c.source) + '" target="_blank" rel="noopener">Nexon\'s rates</a>';
      var nx = $('bx-nx'); nx.hidden = !(+c.nx1k > 0);
      nx.textContent = +c.nx1k > 0 ? '1,000 NX is about ' + mes(+c.nx1k) + ' mesos here, on average' : '';
      var tr = (Array.isArray(c.trend) ? c.trend : []).filter(function (t) { return t && +t.nx1k > 0; }).slice(-5), tl = $('bx-trend');
      tl.hidden = tr.length < 2;
      tl.textContent = tr.length < 2 ? '' : tr.map(function (t) {
        return new Date(t.date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) + ' ' + mes(+t.nx1k);
      }).join(' · ');
    }
    function drawPrices() {
      var a = $('bx-prices'), ms = Date.parse(data.priced);
      if (!a) return;
      if (!isFinite(ms)) { if (a.parentNode) a.remove(); return; }
      var age = ageOf(data.priced, Date.now());
      a.className = age.old ? 'old' : '';
      a.textContent = 'Prices from Cozy Markets, made ' + new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) +
        (age.old ? ' · ' + age.days + (age.days === 1 ? ' day old' : ' days old') : '');
    }
    function visibleItems() {
      var q = $('bx-q').value.trim().toLowerCase();
      return crate().items.filter(function (i) { return !q || i.name.toLowerCase().indexOf(q) >= 0; })
        .sort(function (a, b) { return a.rate - b.rate || a.name.localeCompare(b.name); });
    }
    var listOff = function () { return busy || logState === 'loading'; };
    function drawList() {
      var rows = visibleItems(), el = $('bx-list');
      el.classList.toggle('busy', listOff());
      el.setAttribute('aria-busy', String(listOff()));
      el.innerHTML = rows.map(function (i) {
        var p = priceFor(i), u = cozyUrl(i.cz);
        return '<div class="bx-row" data-id="' + i.id + '"><button type="button" class="bx-log" id="bx-l-' + i.id + '" aria-label="Got ' + esc(i.name) + '" title="' + esc(i.name) + '">' +
          '<img src="' + i.icon + '" alt="" width="32" height="32"><span class="mid"><span class="name">' + esc(i.name) + '</span>' +
          '<span class="made">' + esc(madeWord(p.basis, p.win)) + '</span></span>' +
          '<span class="num">' + esc(priceText(p.price, p.est)) + '</span></button>' +
          (u ? '<a class="bx-cozy bx-cz" href="' + u + '" target="_blank" rel="noopener" title="See ' + esc(i.name) + ' on Cozy Markets">Cozy ↗</a>' : '') + '</div>';
      }).join('');
      $('bx-empty').hidden = rows.length > 0;
    }
    function drawUnits(el, unit) {
      el.innerHTML = ['nx', 'mesos'].map(function (u) {
        return '<button type="button" class="k-btn sm bx-unit" data-unit="' + u + '" aria-pressed="' + (u === unit) + '">' + (u === 'nx' ? 'NX' : 'Mesos') + '</button>';
      }).join('');
    }
    // the tapped price for the round as it stands now: { id, cost } or null. A pick is its own round's only. A pack
    // pick on full packs, where the pack price is the buy price, is that one price
    function picked() {
      if (!costPick || !round || round.round !== pickFor) return null;
      var all = costChoices(byKey.get(round.crate), roundPulls().length);
      return all.filter(function (ch) { return ch.id === costPick; })[0] || (costPick === 'pack' && all[0]) || null;
    }
    function pickedCost() { var hit = picked(); return hit ? hit.cost : null; }
    // the pick goes, and the price it put in the tab's box with it
    function dropPick() { costPick = null; pickFor = null; $('bx-cost-in').value = ''; }
    // a tap on a price: it lights and fills the tab's box in NX; a tap on the lit one takes it off again
    function setPick(id) {
      if (!round) return;
      var lit = picked();
      if (lit && lit.id === id) dropPick();
      else { costPick = id; pickFor = round.round; costUnit = 'nx'; }
      var bad = $('bx-cost-bad'); bad.hidden = true; bad.textContent = '';
      render();
    }
    // typed cost: { none } for empty or 0, { bad }, or { cost }
    function costOf(text) {
      text = String(text == null ? '' : text).trim();
      if (!text) return { none: true };
      var n = parseMesos(text);
      if (n == null) return { bad: true };
      return n === 0 ? { none: true } : { cost: n };
    }
    function resultLine(total, cost, c) {
      var line = 'Worth ' + mes(total), r = result(total, cost, c && +c.nx1k > 0 ? +c.nx1k : null);
      if (cost && cost.unit === 'mesos') {
        line += ' · Cost ' + mes(cost.cost) + ' · Profit <span class="' + (r.profit >= 0 ? 'up' : 'dn') + '">' + (r.profit >= 0 ? '+' : '') + mes(r.profit) + '</span>';
      } else if (cost && cost.unit === 'nx') {
        line += ' · Cost ' + fmt(cost.cost) + ' NX';
        if (r.per1k != null) line += ' · <span class="' + (r.above ? 'up' : '') + '">' + mes(r.per1k) + ' per 1,000 NX</span>' + (r.avg != null ? " · the crate's average is " + mes(r.avg) : '');
      }
      return line;
    }
    var findPull = function (id) { return logs.filter(function (d) { return String(d.id) === String(id); })[0] || null; };
    var cozyLink = function (it) {
      var u = it ? cozyUrl(it.cz) : '';
      return u ? '<a class="bx-cz" href="' + u + '" target="_blank" rel="noopener" title="See ' + esc(it.name) + ' on Cozy Markets">Cozy ↗</a>' : '';
    };
    // one item's row in a round: the price is a button that opens the edit line; an item out twice edits its newest pull
    function pullRow(x, it, byId, early) {
      var n = x.pulls.length, newest = x.pulls[n - 1], t = roundTotal(x.pulls, byId, early), pe = past.pe;
      var cp = early ? priceOf(it) : { price: newest.price, est: newest.est === true };
      var shown = newest.mine != null
        ? '<span class="mine">yours ' + esc(mes(newest.mine)) + '</span> <s>' + esc(priceText(cp.price, cp.est)) + '</s>'
        : esc(t.missing === n ? 'set price' : priceText(t.total, t.estimated > 0));
      var html = '<div class="bx-pull" data-pid="' + esc(newest.id) + '"><span class="name">' + esc(it ? it.name : 'Unknown item') + (n > 1 ? ' ×' + n : '') + '</span>' +
        '<span class="rate">' + (it ? it.rate + '%' : '') + '</span>' +
        '<button type="button" class="bx-price num" aria-label="Your price for ' + esc(it ? it.name : 'this item') + '">' + shown + '</button>' + cozyLink(it);
      if (past.thanks != null && String(past.thanks) === String(newest.id)) html += '<span class="bx-thanks" role="status">Thanks, sent.</span>';
      if (pe && String(pe.id) === String(newest.id)) {
        html += '<div class="bx-edit"><label class="bx-editlab">Your price <input id="bx-mine" class="bx-mine" type="text" autocomplete="off" value="' + esc(pe.text) + '"></label>' +
          '<span class="bx-editbtns"><button type="button" class="k-btn sm key bx-save">Save</button><button type="button" class="k-btn sm bx-clear">Clear</button>' +
          '<button type="button" class="k-btn sm bx-remove">Remove</button></span>' +
          '<label class="bx-offl"><input type="checkbox" class="bx-off"' + (pe.on ? ' checked' : '') + '> Tell us Cozy\'s price looks off</label></div>';
      }
      return html + '</div>';
    }
    // before: the round under it in the list (the next older one), for Join
    function pastRound(g, before) {
      var c = byKey.get(g.crate), byId = {};
      (c ? c.items : []).forEach(function (i) { byId[i.id] = i; });
      var key = g.early ? 'e:' + g.crate : String(g.round), n = g.pulls.length;
      var t = roundTotal(g.pulls, byId, g.early), cost = g.early ? null : costs.get(g.round);
      var r = cost ? result(t.total, cost, c && +c.nx1k > 0 ? +c.nx1k : null) : {};
      var groups = [], seen = {};
      g.pulls.forEach(function (p) {
        var x = seen[p.itemId];
        if (!x) { x = seen[p.itemId] = { itemId: p.itemId, pulls: [] }; groups.push(x); }
        x.pulls.push(p);
      });
      groups.forEach(function (x) { x.t = roundTotal(x.pulls, byId, g.early); });
      groups.sort(function (a, b) { return b.t.total - a.t.total; });
      var crates = n + (n === 1 ? ' crate' : ' crates'), who = c ? c.short : 'Unknown crate';
      var title = g.early ? 'Earlier pulls · ' + who + ' · ' + crates : day(g.round) + ' · ' + who + ' crate · ' + crates;
      var html = '<details class="bx-pr' + (past.fresh === key ? ' fresh' : '') + '" data-key="' + esc(key) + '"' + (past.open.has(key) ? ' open' : '') + '><summary>' +
        '<span class="bx-pr-t">' + esc(title) + '</span>' +
        '<span class="num">' + esc(t.missing === n ? '' : priceText(t.total, t.estimated > 0)) + '</span>' +
        (r.profit != null ? '<span class="num ' + (r.profit >= 0 ? 'up' : 'dn') + '">' + (r.profit >= 0 ? '+' : '') + mes(r.profit) + '</span>' : '') +
        (g.early ? '<span class="bx-pr-s">at today\'s prices</span>' : '') + '</summary><div class="bx-pr-b">' +
        '<p class="bx-result">' + resultLine(t.total, cost, c) + '</p>';
      html += groups.map(function (x) {
        return pullRow(x, byId[x.itemId], byId, g.early);
      }).join('');
      if (!g.early) {
        // a round the quiet minute split in two goes back together: only onto the same crate's round just under it
        var canJoin = typeof api.moveBoxRoundOpens === 'function' && before && !before.early && before.crate === g.crate;
        if (canJoin && past.join === key) {
          html += '<div class="bx-delrow"><span class="bx-joinq">Join these ' + crates + ' with the ' + esc(day(before.round)) + ' round?</span>' +
            '<button type="button" class="k-btn sm bx-join-yes" data-into="' + before.round + '">Join</button><button type="button" class="k-btn sm bx-join-no">Keep apart</button></div>';
        } else if (past.del === key) {
          html += '<div class="bx-delrow"><span class="bx-delq">Delete this round of ' + n + "? This can't be undone.</span>" +
            '<button type="button" class="k-btn sm bx-del-yes">Delete</button><button type="button" class="k-btn sm bx-del-no">Keep</button></div>';
        } else {
          html += '<div class="bx-delrow">' + (canJoin ? '<button type="button" class="k-btn sm bx-join">Join with the round before</button>' : '') +
            '<button type="button" class="k-btn sm bx-del">Delete round</button></div>';
        }
        if (past.edit === key) {
          html += '<div class="bx-cost-edit"><span class="bx-costlab">What did these cost?</span><div class="bx-costrow">' +
            '<input class="bx-costin" type="text" autocomplete="off" aria-label="What these crates cost" value="' + esc(past.editText) + '">' +
            '<span class="bx-units">' + ['nx', 'mesos'].map(function (u) {
              return '<button type="button" class="k-btn sm bx-unit" data-unit="' + u + '" aria-pressed="' + (u === past.editUnit) + '">' + (u === 'nx' ? 'NX' : 'Mesos') + '</button>';
            }).join('') + '</span>' + pickRow(costChoices(c, n), null, '<span class="bx-picks">', '</span>') + '<button type="button" class="k-btn sm key bx-cost-save">Save</button><button type="button" class="k-btn sm bx-cost-cancel">Cancel</button></div>' +
            '<p class="bx-bad" role="alert"' + (past.editErr ? '' : ' hidden') + '>' + esc(past.editErr) + '</p></div>';
        } else {
          html += '<div class="bx-chgrow"><button type="button" class="k-btn sm bx-chg">' + (cost ? 'Change cost' : 'Add cost') + '</button></div>';
        }
      }
      return html + '</div></details>';
    }
    function drawPast() {
      var done = doneLogs(), sec = $('bx-past'), has = !!session && done.length > 0;
      sec.hidden = !has;
      if (!has) { $('bx-past-list').innerHTML = ''; $('bx-morerow').innerHTML = ''; return; }
      var view = past.view, list = $('bx-past-list'), head = $('bx-past-head'), more = $('bx-morerow');
      var v = $('bx-past-view');
      v.innerHTML = [['rounds', 'Rounds'], ['items', 'All items']].map(function (x) {
        return '<button type="button" class="k-btn sm" data-view="' + x[0] + '" aria-pressed="' + (x[0] === view) + '">' + x[1] + '</button>';
      }).join('');
      var total = 0, shown = 0, all = 0;
      if (view === 'rounds') {
        var gs = rounds(done), real = gs.filter(function (g) { return !g.early; });
        var nx = { cost: 0, worth: 0 }, mesosSpent = 0, worth = 0, crates = 0;
        real.forEach(function (g) {
          var c = byKey.get(g.crate), byId = {}, cost = costs.get(g.round);
          (c ? c.items : []).forEach(function (i) { byId[i.id] = i; });
          var t = roundTotal(g.pulls, byId, false);
          worth += t.total; crates += g.pulls.length;
          if (cost && cost.unit === 'nx' && cost.cost > 0) { nx.cost += cost.cost; nx.worth += t.total; }
          else if (cost && cost.unit === 'mesos') mesosSpent += cost.cost;
        });
        var spent = [];
        if (nx.cost > 0) spent.push(fmt(nx.cost) + ' NX');
        if (mesosSpent > 0) spent.push(mes(mesosSpent));
        head.textContent = real.length + (real.length === 1 ? ' round, ' : ' rounds, ') + crates + (crates === 1 ? ' crate' : ' crates') + ' · worth ' + mes(worth) +
          (spent.length ? ' · spent ' + spent.join(' and ') : '') +
          (nx.cost > 0 ? ' · your NX rounds average ' + mes(Math.round(nx.worth / (nx.cost / 1000))) + ' per 1,000 NX' : '');
        all = gs.length; shown = Math.min(all, past.rounds);
        list.innerHTML = gs.slice(0, shown).map(function (g, i) { return pastRound(g, gs[i + 1]); }).join('');
      } else {
        var items = allItems(done, CRATES), wsum = 0, cn = 0;
        items.forEach(function (x) { wsum += x.worth; cn += x.count; });
        head.textContent = cn + (cn === 1 ? ' crate' : ' crates') + ' · ' + items.length + ' different items · worth ' + mes(wsum);
        all = items.length; shown = Math.min(all, past.items);
        list.innerHTML = items.slice(0, shown).map(function (x) {
          var c = byKey.get(x.crate);
          return '<div class="bx-it"><span class="name">' + esc(x.name) + (x.count > 1 ? ' ×' + x.count : '') + '</span>' +
            '<span class="rate">' + esc(c ? c.short : '') + '</span><span class="num">' + esc(priceText(x.worth, x.estimated)) + '</span>' +
            cozyLink({ cz: x.cz, name: x.name }) + '</div>';
        }).join('');
      }
      more.innerHTML = '';
      if (shown < all) more.append(button('bx-more', 'Show more', 'k-btn sm'));
    }
    function drawRound() {
      var panel = $('bx-round');
      panel.hidden = !session;
      if (!session) return;
      var pulls = roundPulls(), c = round && byKey.get(round.crate), byId = {};
      (c ? c.items : []).forEach(function (i) { byId[i.id] = i; });
      var n = pulls.length;
      $('bx-round-head').textContent = 'This round · ' + n + (n === 1 ? ' crate' : ' crates');
      var groups = [], seen = {};
      pulls = pulls.slice().reverse().sort(function (a, b) { return a.ts - b.ts; });
      pulls.forEach(function (p) {
        var g = seen[p.itemId];
        if (!g) { g = seen[p.itemId] = { itemId: p.itemId, pulls: [] }; groups.push(g); }
        g.pulls.push(p);
      });
      var list = $('bx-round-list');
      var costBox = $('bx-cost'), bar = $('bx-donebar');
      bar.innerHTML = '';
      if (!groups.length) {
        list.innerHTML = '<p class="hint">Tap what came out to start a round.</p>';
        $('bx-round-foot').textContent = '';
        costBox.hidden = true;
        return;
      }
      list.innerHTML = groups.map(function (g) {
        return pullRow(g, byId[g.itemId], byId, false);
      }).join('');
      bar.append(button('bx-done', 'Done', 'k-btn key'));
      costBox.hidden = false;
      drawUnits($('bx-cost-unit'), costUnit);
      var hit = picked();
      if (hit) $('bx-cost-in').value = fmt(hit.cost);
      $('bx-cost-picks').innerHTML = pickRow(costChoices(c, n), hit && hit.id, '', '');
      var tot = roundTotal(pulls, byId, false);
      $('bx-round-foot').textContent = 'So far ' + mes(tot.total) +
        (tot.estimated ? ', ' + tot.estimated + (tot.estimated === 1 ? ' price is' : ' prices are') + ' estimated' : '') +
        (tot.missing ? ', ' + tot.missing + ' with no price' : '');
    }
    function render() {
      var focused = document.activeElement && root.contains(document.activeElement) && document.activeElement.id;
      if (costPick && !picked()) dropPick();   // its round went another way than Done (emptied, deleted, not in the log)
      drawCrates(); drawInfo(); drawPrices(); drawList(); drawRound(); drawPast(); drawPop();
      var back = focused && $(focused);
      if (back && back !== document.activeElement) back.focus({ preventScroll: true });
    }
    function scrollStrip() {
      var picked = root.querySelector('#bx-crates [aria-pressed="true"]'), strip = $('bx-crates');
      if (picked && picked !== strip.firstElementChild) strip.scrollLeft += picked.getBoundingClientRect().left - strip.getBoundingClientRect().left;
    }

    // ---------- doing ----------
    // fin (optional) hears true once the pull is saved and false if it wasn't (the crate reader counts by it)
    function logOne(id, fin) {
      var no = function () { if (fin) fin(false); };
      var c = crate(), it = c.items.filter(function (i) { return i.id === id; })[0];
      if (!it) return no();
      if (!session) { signPrompt(); return no(); }
      if (adding) { if (waiting.length < 30) waiting.push({ id: id, crate: c.key, fin: fin }); else no(); return; }
      if (!ready()) return no();
      if (round && round.crate !== c.key) { finishPrompt(); return no(); }
      var fresh = !round;
      if (fresh) { round = { crate: c.key, round: Math.max(Date.now(), lastRound + 1) }; lastRound = round.round; }
      saveRound();
      var pr = priceFor(it), rnd = round.round;
      busy = true; adding = true; render();
      var g = gen;
      Promise.resolve().then(function () { return api.addBoxOpen(c.key, id, rnd, pr.price, pr.est, pr.basis, pr.win); }).then(function (row) {
        if (g !== gen) return;
        busy = false; adding = false;
        var d = norm(row);
        logs.unshift(valid(d) && d.round != null ? d : { id: row && row.id, crate: c.key, itemId: id, ts: Date.now(), round: rnd, price: pr.price, est: pr.est, basis: pr.basis, win: pr.win, mine: null });
        $('bx-q').value = '';
        clearTransient(); render();
        if (fin) fin(true);
        var nx = waiting.shift();
        while (nx && nx.crate !== crate().key) { if (nx.fin) nx.fin(false); nx = waiting.shift(); }
        if (nx) logOne(nx.id, nx.fin);
      }, function (e) {
        if (g !== gen) return;
        busy = false; adding = false; no(); waiting.forEach(function (w) { if (w.fin) w.fin(false); }); waiting = [];
        if (fresh && round && round.round === rnd && !roundPulls().length) { round = null; saveRound(); }
        say(e && SERVER.indexOf(e.message) >= 0 ? e.message : TRANSIENT[0]); render();
      });
    }
    function finish(rnd) {
      // a round the reader filled stays on show in the window once it's done (crates with no Grind run)
      if (pop.pulled === rnd) pop.last = { pulls: roundPulls(), crate: round ? round.crate : state.crate };
      round = null; saveRound(); past.fresh = String(rnd); past.open.add(String(rnd)); past.view = 'rounds';
      $('bx-cost-in').value = ''; costUnit = 'nx'; costPick = null; pickFor = null;
      var bad = $('bx-cost-bad'); bad.hidden = true; bad.textContent = '';
      clearTransient(); render();
    }
    // quiet: Done from the window, the quiet minute or the window closing. A cost typed on the tab goes with it; one
    // that can't be read is left out, since nobody is at the tab to fix it
    function done(quiet) {
      if (!round || busy) return;
      var tapped = pickedCost();
      var typed = tapped != null ? { cost: tapped } : costOf($('bx-cost-in').value), bad = $('bx-cost-bad'), rnd = round.round;
      if (typed.bad && quiet) typed = { none: true };
      if (typed.bad) { bad.textContent = BAD; bad.hidden = false; return; }
      bad.hidden = true; bad.textContent = '';
      if (typed.none) { finish(rnd); return; }
      var unit = tapped != null ? 'nx' : costUnit, g = gen;
      busy = true; render();
      Promise.resolve().then(function () { return api.setBoxRound(rnd, typed.cost, unit); }).then(function () {
        if (g !== gen) return;
        busy = false; costs.set(rnd, { cost: typed.cost, unit: unit }); finish(rnd);
      }, function (e) {
        if (g !== gen) return;
        busy = false;
        say(e && SERVER.indexOf(e.message) >= 0 ? e.message : TRANSIENT[0]); render();
      });
    }
    function saveEdit() {
      var key = past.edit, rnd = +key, typed = costOf(past.editText), g = gen;
      if (typed.bad) { past.editErr = BAD; render(); return; }
      past.editErr = '';
      var had = costs.has(rnd);
      if (typed.none && !had) { past.edit = null; render(); return; }
      var cost = typed.none ? null : typed.cost, unit = typed.none ? null : past.editUnit;
      Promise.resolve().then(function () { return api.setBoxRound(rnd, cost, unit); }).then(function () {
        if (g !== gen) return;
        if (cost == null) costs.delete(rnd); else costs.set(rnd, { cost: cost, unit: unit });
        past.edit = null; render();
      }, function (e) {
        if (g !== gen) return;
        past.editErr = e && SERVER.indexOf(e.message) >= 0 ? e.message : TRANSIENT[0]; render();
      });
    }
    var fail = function (e) { say(e && SERVER.indexOf(e.message) >= 0 ? e.message : TRANSIENT[0]); };
    var today = function () { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); };
    var offMap = function () { try { var m = JSON.parse(rd(OFF_KEY)); return m && typeof m === 'object' ? m : {}; } catch (e) { return {}; } };
    // one "looks off" note a day per item per device; a failed send is not recorded, so the next Save tries again
    function sendOff(d, n) {
      if (typeof o.report !== 'function') return;
      var c = byKey.get(d.crate), it = c && c.items.filter(function (i) { return i.id === d.itemId; })[0];
      if (!it) return;
      var key = d.crate + ':' + d.itemId, map = offMap();
      if (map[key] === today()) return;
      var p = priceOf(it), g = gen;
      var words = 'NX Crates price looks off: ' + it.name + ' in ' + c.short + '. Ours ' + (p.price == null ? 'no price' : priceText(p.price, p.est)) +
        ' (' + (madeWord(p.basis, p.win) || 'no price') + ', Cozy file ' + (data.priced || 'unknown') + '). Player says ' + mes(n) + '.';
      var details = JSON.stringify({ tab: 'boxes', crate: d.crate, itemId: d.itemId, ours: p.price, basis: p.basis, window: p.win, priced: data.priced || null, mine: n });
      Promise.resolve().then(function () { return o.report(words, details); }).then(function () {
        map = offMap(); map[key] = today(); wr(OFF_KEY, JSON.stringify(map));
        if (g !== gen) return;
        past.thanks = d.id; render();
      }, function () { /* the saved price stands; the next Save tries again */ });
    }
    function setMine(d, n, tick) {
      var g = gen;
      Promise.resolve().then(function () { return api.setBoxOpenMine(d.id, n); }).then(function () {
        if (g !== gen) return;
        d.mine = n; past.pe = null; past.thanks = null; clearTransient(); render();
        if (n != null && tick) sendOff(d, n);
      }, function (e) { if (g !== gen) return; fail(e); render(); });
    }
    function savePrice() {
      var pe = past.pe, d = pe && findPull(pe.id);
      if (!d) { past.pe = null; render(); return; }
      var typed = costOf(pe.text);
      if (typed.bad) { say(BAD); render(); return; }
      if (typed.none) { if (d.mine == null) { past.pe = null; render(); } else setMine(d, null, false); return; }
      setMine(d, typed.cost, pe.on);
    }
    function removePull() {
      var pe = past.pe, d = pe && findPull(pe.id), g = gen;
      if (!d) { past.pe = null; render(); return; }
      Promise.resolve().then(function () { return api.removeBoxOpen(d.id); }).then(function () {
        if (g !== gen) return;
        logs = logs.filter(function (x) { return x !== d; });
        if (round && d.round === round.round && !roundPulls().length) { round = null; saveRound(); }
        past.pe = null; clearTransient(); render();
      }, function (e) { if (g !== gen) return; fail(e); render(); });
    }
    function deleteRound() {
      var rnd = +past.del, g = gen;
      if (!isFinite(rnd)) { past.del = null; render(); return; }
      Promise.resolve().then(function () { return api.removeBoxRoundOpens(rnd); }).then(function () {
        if (g !== gen) return;
        logs = logs.filter(function (x) { return x.round !== rnd; });
        costs.delete(rnd);
        if (round && round.round === rnd) { round = null; saveRound(); }
        past.open.delete(String(rnd)); past.del = null; past.pe = null;
        // the cost row is tidied too; if that fails the round is already gone from the list
        if (typeof api.setBoxRound === 'function') Promise.resolve().then(function () { return api.setBoxRound(rnd, null, null); }).catch(function () {});
        clearTransient(); render();
      }, function (e) { if (g !== gen) return; fail(e); render(); });
    }
    // Join: the later round's pulls move into the earlier one. The cost: the earlier round's stays; only the later one
    // has a cost, it's carried over; both in the same unit, they add up. The later round's cost row goes either way
    function joinRound(into) {
      var from = +past.join, g = gen;
      past.join = null;
      if (!isFinite(from) || !isFinite(into)) { render(); return; }
      var a = costs.get(into), b = costs.get(from);
      var next = !b ? null : !a ? b : a.unit === b.unit ? { cost: a.cost + b.cost, unit: a.unit } : null;
      Promise.resolve().then(function () { return api.moveBoxRoundOpens(from, into); }).then(function () {
        if (g !== gen) return;
        logs.forEach(function (d) { if (d.round === from) d.round = into; });
        past.open.delete(String(from)); past.open.add(String(into)); past.pe = null; past.del = null; past.edit = null;
        clearTransient(); render();
        if (!b || typeof api.setBoxRound !== 'function') return;
        Promise.resolve().then(function () { return next ? api.setBoxRound(into, next.cost, next.unit) : null; }).then(function () {
          if (g !== gen) return;
          if (next) costs.set(into, next);
          costs.delete(from); render();
          return api.setBoxRound(from, null, null);
        }).then(null, function (e) { if (g !== gen) return; fail(e); render(); });
      }, function (e) { if (g !== gen) return; fail(e); render(); });
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
      if (costPick) dropPick();
      session = s || null; logs = []; costs = new Map(); past.edit = null; past.pe = null; past.del = null; past.join = null; past.thanks = null; past.fresh = null; past.open = new Set(); busy = false; adding = false; waiting.forEach(function (w) { if (w.fin) w.fin(false); }); waiting = [];
      var g = ++gen;
      if (!session) { logState = 'off'; clearTransient(); render(); return; }
      logState = 'loading'; clearTransient(); render();
      // a player whose box_rounds table isn't there yet still gets the log; costs just stay empty
      var loadCosts = function () {
        return typeof api.listBoxRounds !== 'function' ? [] : Promise.resolve(api.listBoxRounds()).then(function (r) { return Array.isArray(r) ? r : []; }, function () { return []; });
      };
      Promise.resolve().then(function () { return Promise.all([listAll(), loadCosts()]); }).then(function (both) {
        if (g !== gen) return;
        var rows = both[0];
        both[1].forEach(function (r) {
          var rd = num(r && r.round), cs = num(r && r.cost);
          if (rd != null && cs != null && cs > 0 && (r.unit === 'nx' || r.unit === 'mesos')) costs.set(rd, { cost: cs, unit: r.unit });
        });
        logs = rows.map(norm).filter(valid);
        logs.forEach(function (d) { if (d.round != null && d.round > lastRound) lastRound = d.round; });
        // a remembered round the log doesn't hold is dropped
        if (round && !roundPulls().length) { round = null; saveRound(); }
        logState = 'ready'; clearTransient(); render();
      }, function () {
        if (g !== gen) return;
        logState = 'failed'; say(TRANSIENT[2]); render();
      });
    }
    function show(key) {
      var k = resolve(key);
      if (k === state.crate) return;
      state.crate = k; saveCrate(); render(); scrollStrip();
    }

    root.addEventListener('click', function (e) {
      var t = e.target;
      var b = t.closest('#bx-crates [data-crate]');
      if (b) {
        if (b.dataset.crate !== state.crate) { state.crate = b.dataset.crate; saveCrate(); render(); }
        if (o.onCrate) o.onCrate(state.crate);
        return;
      }
      if (t.closest('#bx-signin')) { if (o.signIn) o.signIn(); return; }
      if (t.closest('#bx-done')) { done(); return; }
      var u = t.closest('.bx-unit');
      if (u) {
        if (u.closest('#bx-cost-unit')) { costUnit = u.dataset.unit; if (costUnit !== 'nx' && costPick) { dropPick(); render(); } else drawUnits($('bx-cost-unit'), costUnit); }
        else { past.editUnit = u.dataset.unit; render(); }
        return;
      }
      var pk = t.closest('.bx-pick');
      if (pk) {
        if (pk.closest('#bx-cost-picks')) { setPick(pk.dataset.pick); return; }
        // a past round's box: the price fills it, Save as ever
        past.editText = pk.dataset.cost; past.editUnit = 'nx'; past.editErr = ''; render(); return;
      }
      var pv = t.closest('#bx-past-view [data-view]');
      if (pv) { past.view = pv.dataset.view; drawPast(); return; }
      if (t.closest('#bx-more')) { if (past.view === 'rounds') past.rounds += 5; else past.items += 20; drawPast(); return; }
      var chg = t.closest('.bx-chg');
      if (chg) {
        var key = chg.closest('.bx-pr').dataset.key, cur = costs.get(+key);
        past.edit = key; past.editUnit = cur ? cur.unit : 'nx'; past.editText = cur ? String(cur.cost) : ''; past.editErr = '';
        render(); return;
      }
      if (t.closest('.bx-cost-save')) { saveEdit(); return; }
      if (t.closest('.bx-cost-cancel')) { past.edit = null; past.editErr = ''; render(); return; }
      var pb = t.closest('.bx-price');
      if (pb) {
        var pid = pb.closest('.bx-pull').dataset.pid, pd = findPull(pid);
        past.thanks = null;
        if (past.pe && String(past.pe.id) === String(pid)) past.pe = null;
        else if (pd) past.pe = { id: pd.id, text: pd.mine != null ? String(pd.mine) : '', on: false };
        render(); return;
      }
      if (t.closest('.bx-save')) { savePrice(); return; }
      if (t.closest('.bx-clear')) { var pc = past.pe && findPull(past.pe.id); if (pc && pc.mine != null) setMine(pc, null, false); else { past.pe = null; render(); } return; }
      if (t.closest('.bx-remove')) { removePull(); return; }
      if (t.closest('.bx-join-yes')) { joinRound(+t.closest('.bx-join-yes').dataset.into); return; }
      if (t.closest('.bx-join-no')) { past.join = null; render(); return; }
      if (t.closest('.bx-join')) { past.join = t.closest('.bx-pr').dataset.key; past.del = null; render(); return; }
      if (t.closest('.bx-del-yes')) { deleteRound(); return; }
      if (t.closest('.bx-del-no')) { past.del = null; render(); return; }
      if (t.closest('.bx-del')) { past.del = t.closest('.bx-pr').dataset.key; past.join = null; render(); return; }
      var g = t.closest('.bx-log');
      if (g) { logOne(+g.closest('.bx-row').dataset.id); return; }
    });
    root.addEventListener('input', function (e) {
      if (e.target.id === 'bx-q') drawList();
      else if (e.target.id === 'bx-cost-in') { var b = $('bx-cost-bad'); b.hidden = true; b.textContent = ''; if (costPick) { costPick = null; pickFor = null; $('bx-cost-picks').innerHTML = pickRow(costChoices(round && byKey.get(round.crate), roundPulls().length), null, '', ''); drawPop(); } }
      else if (e.target.classList && e.target.classList.contains('bx-costin')) past.editText = e.target.value;
      else if (e.target.classList && e.target.classList.contains('bx-mine') && past.pe) {
        past.pe.text = e.target.value;
        if (e.target.value.trim()) { past.pe.on = true; var ob = root.querySelector('.bx-off'); if (ob) ob.checked = true; }
      } else if (e.target.classList && e.target.classList.contains('bx-off') && past.pe) past.pe.on = e.target.checked;
    });
    // a round the player opened stays open when the page redraws
    root.addEventListener('toggle', function (e) {
      var d = e.target;
      if (!d.classList || !d.classList.contains('bx-pr')) return;
      if (d.open) past.open.add(d.dataset.key); else past.open.delete(d.dataset.key);
    }, true);

    // ---------- the crate reader: while the game is shared, every pull logs itself (crate-reader.js) ----------
    // o.reader is a promise of { capture: Reader.capture, reader: a CrateReader }; without it the share area stays away
    var deco = null;   // My Deco, once the share is set up (readSetup)
    var read = { on: false, reader: null, crate: null, set: false, count: 0, missed: 0, state: 'looking', seen: -1e9 };
    var readSay = function (msg) { $('bx-read-note').textContent = msg; };
    function readNote() {
      if (!read.on) { readSay(canPop ? 'Press Start opening and pick the game. Every crate you open shows over the game with its chance and price.' : 'Share the game and every crate you open logs itself.'); return; }
      var said = [];
      if (read.count) said.push('Read ' + read.count + (read.count === 1 ? ' pull.' : ' pulls.'));
      if (read.missed) said.push("Couldn't read " + read.missed + '. Check the crate picked above, then tap what came out.');
      if (!said.length) said.push(read.state === 'looking' ? 'Open a crate in the game. Looking for the Surprise window.' : 'Found the Surprise window. Open away.');
      readSay(said.join(' '));
      drawPop();
    }

    // ---------- the window over the game (one pop-out, 2026-11-26) ----------
    // The rows are a guest in Grind's window (o.pop, from grind.js: can, open, isOpen, show, hide, close, grinding,
    // onGone); this file opens no window of its own. Start opening shares the game and, in the same click, opens the
    // window if none is up. What it shows:
    //   Grind sharing: Grind, until a pull is read in a round; then the rows with Done; Grind again after Done
    //   no Grind run:  "Open a crate in the game.", then the rows with Done, then the finished round's foot
    // With Grind sharing, a round the reader filled finishes itself after a quiet wait (no Surprise window for o.quiet ms,
    // five minutes); crates alone wait for Done. Closing the
    // window: with Grind sharing nothing here changes; crates alone, the share stops and the round is finished as Done.
    // pulled: the round a pull was read into during this share. last: that round once finished. mine: opened for crates alone
    var P = null, canPop = false, QUIET = +o.quiet > 0 ? +o.quiet : 300000;
    var pop = { el: null, up: false, failed: false, pulled: null, last: null, mine: false, html: '', leaving: false, quiet: 0 };
    var taken = function () { return !!round && pop.pulled === round.round && roundPulls().length > 0; };
    function drawPop() {
      if (!P || !pop.el || !P.isOpen()) { pop.up = false; return; }
      if (pop.mine && P.grinding()) pop.mine = false;   // Grind joined: the window is Grind's from here on
      // mine: opened for crates alone, so it has the rows from the start, while the browser still asks for the game
      var on = (read.on || pop.mine) && (taken() || !P.grinding());
      if (!on) { if (pop.up) { pop.up = false; P.hide(); } return; }
      // the app's overlay has no frame: without Grind's panel in it, the rows carry its Close
      var x = !!o.app && !P.grinding();
      var h = taken() ? popView(roundPulls(), byKey.get(round.crate), read.missed, false, x, (picked() || {}).id)
        : pop.last ? popView(pop.last.pulls, byKey.get(pop.last.crate), 0, true, x)
        : popView([], byKey.get(state.crate), read.missed, false, x);
      var body = pop.el.firstChild;
      if (h !== pop.html) { body.innerHTML = h; pop.html = h; }
      if (!pop.up) pop.up = P.show(pop.el) !== false;
    }
    function openPop() {
      if (!canPop) return;
      pop.failed = false;
      var was = P.isOpen(), fail = function () { pop.failed = true; popButton(); };
      var w; try { w = P.open(pop.el); } catch (e) { fail(); return; }
      Promise.resolve(w).then(function (ok) {
        if (!ok) { fail(); return; }
        if (!was && !P.grinding()) pop.mine = true;
        drawPop(); popButton();
      }, fail);
    }
    // crates left the share: a window opened for crates alone goes, Grind's own window only gets its panel back
    function closePop() {
      if (!P || !P.isOpen()) { pop.up = false; pop.mine = false; return; }
      var shut = pop.mine && !P.grinding();
      pop.mine = false;
      if (shut) { pop.up = false; P.close(); }
      else if (pop.up) { pop.up = false; P.hide(); }
    }
    // the player closed the window
    function popGone() {
      pop.up = false; pop.mine = false; pop.html = '';
      if (pop.el) pop.el.firstChild.innerHTML = '';
      if (P.grinding() || !read.on) { popButton(); return; }
      if (read.share) read.share.stop();   // crates alone: the share ends with it, and the round below (onState)
      popButton();
    }
    // while sharing with no window up, an amber Pop out opens it
    function popButton() {
      var bar = $('bx-read-bar'), b = $('bx-pop-btn');
      var want = canPop && read.on && !P.isOpen();
      if (want && !b && bar) { b = button('bx-pop-btn', 'Pop out over the game', 'k-btn sm key'); b.onclick = openPop; bar.querySelector('.r-bar').append(b); }
      if (b) b.hidden = !want;
    }
    function popSetup(p) {
      if (!p || !p.can || typeof p.open !== 'function') return;
      P = p; canPop = true;
      pop.el = document.createElement('div'); pop.el.className = 'bx-guest';
      pop.el.innerHTML = '<div class="bx-pop" id="bx-pop"></div>';
      pop.el.addEventListener('click', function (e) {
        if (!e.target.closest) return;
        if (e.target.closest('#bx-pop-done')) { done(true); drawPop(); }
        else if (e.target.closest('.bx-pick')) setPick(e.target.closest('.bx-pick').dataset.pick);
        // Close: the window goes, and popGone ends the crates' share and the round with it
        else if (e.target.closest('#bx-pop-x')) P.close();
      });
      P.onGone(popGone);
      window.addEventListener('pagehide', function () { pop.leaving = true; }, { once: true });
    }
    // a pull read off the game goes in like a tap; a save of another kind in flight (an undo) is waited out
    function readIn(id, key, tries) {
      if (key !== state.crate) { read.missed++; readNote(); return; }
      if (session && !adding && !ready() && tries < 20) { setTimeout(function () { readIn(id, key, tries + 1); }, 300); return; }
      logOne(id, function (saved) { if (saved) { read.count++; if (read.on && round) { pop.pulled = round.round; pop.last = null; } } else read.missed++; readNote(); });
    }
    function readFrame(src, m) {
      if (deco) { try { deco.frame(src); } catch (e) { /* My Deco never stops the crate read */ } }
      if (read.crate !== state.crate) {
        var key = read.crate = state.crate;
        read.set = false;
        read.reader.setItems(crate().items.filter(function (i) { return i.icon; }).map(function (i) { return { id: i.id, icon: i.icon }; }))
          .then(function () { if (read.crate === key) read.set = true; }, function () {});
      }
      if (!read.set) return;
      var r, now = performance.now();
      try { r = read.reader.tick(src, m.w, m.h, now); } catch (e) { return; }
      // the opening animation covers the window for a moment: it only counts as gone after three seconds without it
      if (r.state !== 'looking') read.seen = now;
      read.state = now - read.seen < 3000 ? 'watching' : 'looking';
      read.missed += r.missed || 0;
      if (r.pulls) { r.pulls.forEach(function (id) { readIn(id, state.crate, 0); }); }
      // the quiet wait: with Grind sharing too, a round the reader filled finishes itself after five minutes with no Surprise
      // window, so Grind's panel comes back (a Done that didn't take, a save in flight or a cost that wouldn't save, waits
      // another five). Crates shared alone never finish on their own: Done, Stop sharing or closing the window does it,
      // since a trip to buy more crates split one round in two (2026-11-28, 11 opens as 1 and 10)
      if (P && P.grinding() && taken() && read.state === 'looking') { if (!pop.quiet) pop.quiet = now; else if (now - pop.quiet >= QUIET) { pop.quiet = now; done(true); } }
      else pop.quiet = 0;
      readNote();
    }
    function readSetup(dep) {
      var app = o.app || null;
      if (!dep || !dep.capture || !dep.reader || (app && typeof app.findGame !== 'function')) return;
      read.reader = dep.reader;
      $('bx-read').hidden = false;
      // My Deco (deco.js): reads the bag's Deco tab off the same share; its button starts the share without the pop-out
      if (o.deco && window.MyDeco) {
        $('bx-deco').hidden = false;
        deco = window.MyDeco.mount($('bx-deco'), { crates: CRATES, priceOf: priceFor, store: store, deps: o.deco,
          start: function () { var b = $('bx-share'); if (!b || read.on) return; read.decoStart = true; try { b.click(); } finally { read.decoStart = false; } } });
      }
      readNote();
      read.share = dep.capture($('bx-read-bar'), { prefix: 'bx-', raw: true, limit: 0, keepWhenHidden: true, full: true, drop: false, every: 200,
        el: function (t, a) { var k = [].slice.call(arguments, 2); return o.el.apply(null, [t, t === 'button' ? Object.assign({}, a, { class: 'k-btn sm' }) : a].concat(k)); },
        join: true,   // one share with Grind: whichever starts second reads the same stream, with no picker
        copy: { share: canPop ? 'Start opening' : 'Share game window', stop: 'Stop sharing', failed: "Couldn't start sharing the game window. Try again." },
        // the Windows app finds the game itself; a browser asks the player
        beforeStart: function () {
          if (!session) { signPrompt(); return false; }
          if (!app) return true;
          var none = function () { readSay("Can't find MapleStory. Open the game, then try again."); return false; };
          return Promise.resolve().then(function () { return app.findGame(); }).then(function (wins) {
            if (!wins || !wins.length) return none();
            return Promise.resolve(app.pickGame(wins[0].id)).then(function () { return true; }, none);
          }, none);
        },
        onImage: readFrame, say: function (t) { if (t) readSay(t); },
        onState: function (s, why) {
          read.on = s === 'sharing';
          if (deco) deco.sharing(read.on);
          if (read.on) { read.count = 0; read.missed = 0; read.state = 'looking'; read.seen = -1e9; read.crate = null; read.set = false; read.reader.reset(); pop.pulled = null; pop.last = null; pop.quiet = 0; }
          if (read.on || (why !== 'denied' && why !== 'failed')) readNote();
          // the app: the overlay opens once the game is found and shared, as Grind's does (a window opened in the
          // click would be left over the screen when the game isn't running)
          if (read.on && app && canPop && !P.isOpen()) openPop();
          if (!read.on) {
            // crates alone: the share is over, so a round the reader filled is finished as Done (the page itself
            // closing leaves it open). With Grind sharing the round stays open on the tab. The game going away ends the
            // share for Grind too, whichever of the two hears it first, so that counts as alone
            var alone = !P || !P.grinding() || why === 'ended', live = taken();
            closePop();
            if (alone && live && !pop.leaving) done(true);
            pop.pulled = null; pop.last = null; pop.html = '';
          }
          popButton();
        } });
      // Start opening: on the site the window opens in the same click that asks for the game (signed out, only the sign
      // in shows); in the app the overlay opens once sharing (onState)
      if (canPop) {
        var sb = $('bx-share');
        if (sb) sb.classList.add('key');
        $('bx-read-bar').addEventListener('click', function (e) {
          if (e.target.closest && e.target.closest('#bx-share') && session && !read.on && !app && !P.isOpen() && !read.decoStart) openPop();
        }, true);
      }
    }
    // the window comes with Grind's code, which may still be loading or fail: the share waits for the answer either way
    if (o.reader && o.el) Promise.resolve(o.pop).then(popSetup, function () {}).then(function () { return o.reader; }).then(readSetup, function () {});

    refresh(session);
    scrollStrip();
    return {
      refresh: function (s) { refresh(s); if (!s && read.on && read.share) { read.share.stop(); readSay('Signed out, so the share stopped. Sign in and share again.'); } },
      show: show,
      // for Report a problem: what's picked and how big the log is, never the rows themselves
      report: function () {
        return { crate: state.crate, signedIn: !!session, logState: logState, logCount: logs.length, roundOpen: !!round, roundSize: roundPulls().length };
      }
    };
  }

  // ---- NX Crates round maths (pure) ----
  // what an item is worth today, and how Cozy made that number
  function priceOf(item) {
    var fm = item && item.fm, est = item && item.est;
    if (fm && +fm.price > 0) return fm.basis === 'listed' ? { price: +fm.price, est: true, basis: 'listed', win: fm.window || null } : { price: +fm.price, est: false, basis: 'sold', win: fm.window || null };
    if (est && +est.mid > 0) return { price: +est.mid, est: true, basis: 'peers', win: null };
    return { price: null, est: null, basis: null, win: null };
  }
  function madeWord(basis, win) {
    if (basis === 'sold') return win === 'day' ? 'sold today' : win === '3d' ? 'sold, last 3 days' : win === 'week' ? 'sold this week' : 'sold';
    if (basis === 'listed') return 'listed, not sold';
    if (basis === 'peers') return 'from similar items';
    return '';
  }
  // 250k, 1.5m, 2b, commas and spaces -> whole mesos, or null for anything that is not a sane amount
  function parseMesos(text) {
    var m = /^(\d+(?:\.\d+)?|\.\d+)([kmb])?$/i.exec(String(text == null ? '' : text).replace(/[,\s]/g, ''));
    if (!m) return null;
    var n = parseFloat(m[1]) * ({ k: 1e3, m: 1e6, b: 1e9 }[(m[2] || '').toLowerCase()] || 1);
    n = Math.round(n);
    return isFinite(n) && n >= 0 && n <= 1000000000000 ? n : null;
  }
  // real rounds newest first, then one early group per crate (pulls logged before rounds existed)
  function rounds(pulls) {
    var by = {}, list = [], early = {}, order = [];
    var cmp = function (a, b) { return (a.ts - b.ts) || (a.id - b.id); };
    (pulls || []).forEach(function (p) {
      if (p.round != null) { var g = by[p.round] || (by[p.round] = { round: p.round, crate: p.crate, early: false, pulls: [] }); g.pulls.push(p); }
      else { if (!early[p.crate]) { early[p.crate] = { round: null, crate: p.crate, early: true, pulls: [] }; order.push(p.crate); } early[p.crate].pulls.push(p); }
    });
    Object.keys(by).forEach(function (k) { list.push(by[k]); });
    list.sort(function (a, b) { return b.round - a.round; });
    list.forEach(function (g) { g.pulls.sort(cmp); });
    order.forEach(function (c) { early[c].pulls.sort(cmp); list.push(early[c]); });
    return list;
  }
  // what a pull counts as: your own price, else the price saved with it, else (early pulls) today's
  function countedPrice(p, itemsById, today) {
    if (p.mine != null) return { price: +p.mine, est: false };
    if (today) { var pr = priceOf(itemsById && itemsById[p.itemId]); return { price: pr.price, est: pr.est === true }; }
    if (p.price != null) return { price: +p.price, est: p.est === true };
    return { price: null, est: false };
  }
  function roundTotal(pulls, itemsById, today) {
    var total = 0, estimated = 0, missing = 0;
    (pulls || []).forEach(function (p) {
      var c = countedPrice(p, itemsById, today);
      if (c.price == null) { missing++; return; }
      total += c.price; if (c.est) estimated++;
    });
    return { total: total, estimated: estimated, missing: missing };
  }
  function result(total, cost, nx1k) {
    if (!cost || !(+cost.cost >= 0)) return {};
    if (cost.unit === 'mesos') return { profit: total - cost.cost };
    if (cost.unit === 'nx' && cost.cost > 0) {
      var per1k = Math.round(total / (cost.cost / 1000));
      return { per1k: per1k, avg: nx1k, above: nx1k != null && per1k > nx1k };
    }
    return {};
  }
  // every item you have pulled, per crate, highest worth first; early pulls are worth today's price
  function allItems(pulls, crates) {
    var byCrate = {}, map = {}, out = [];
    (crates || []).forEach(function (c) { var m = {}; (c.items || []).forEach(function (i) { m[i.id] = i; }); byCrate[c.key] = m; });
    (pulls || []).forEach(function (p) {
      var key = p.crate + ':' + p.itemId, item = (byCrate[p.crate] || {})[p.itemId];
      var c = countedPrice(p, byCrate[p.crate], p.round == null);
      var r = map[key] || (map[key] = { crate: p.crate, itemId: p.itemId, name: item ? item.name : 'Unknown item', cz: item ? item.cz : null, count: 0, worth: 0, estimated: false });
      r.count++; if (c.price != null) r.worth += c.price; if (c.est) r.estimated = true;
    });
    Object.keys(map).forEach(function (k) { out.push(map[k]); });
    out.sort(function (a, b) { return (b.worth - a.worth) || String(a.name).localeCompare(String(b.name)); });
    return out;
  }
  // the NX for a number of crates: 11 for the pack price, the rest one by one
  function suggestCost(crate, count) {
    var nx = crate && crate.nx;
    if (!nx || !(count > 0)) return null;
    return Math.floor(count / 11) * nx.pack + (count % 11) * nx.each;
  }
  // the prices to tap for a round of count crates (2026-11-26): buy is what buying exactly that many costs, pack is
  // their share of packs of 11, left out when it comes to the same
  function costChoices(crate, count) {
    var buy = suggestCost(crate, count);
    if (buy == null) return [];
    var pack = Math.round(count * crate.nx.pack / 11), out = [{ id: 'buy', cost: buy }];
    if (pack !== buy) out.push({ id: 'pack', cost: pack });
    return out;
  }
  function pickRow(choices, pick, open, shut) {
    if (!choices.length) return '';
    return open + choices.map(function (ch) {
      return '<button type="button" class="k-btn sm bx-pick" data-pick="' + ch.id + '" data-cost="' + ch.cost + '" aria-pressed="' + (ch.id === pick) + '">' + (ch.id === 'pack' ? 'Pack ' : '') + fmt(ch.cost) + ' NX</button>';
    }).join('') + shut;
  }
  function ageOf(priced, now) {
    var ms = now - Date.parse(priced);
    return { days: Math.max(0, Math.floor(ms / 86400000)), old: ms > 86400000 };
  }

  window.BoxOdds = { priceOf: priceOf, madeWord: madeWord, parseMesos: parseMesos, rounds: rounds, roundTotal: roundTotal, result: result, allItems: allItems, suggestCost: suggestCost, costChoices: costChoices, ageOf: ageOf, statusOf: statusOf, orderCrates: orderCrates, popView: popView, mount: mount, mes: mes };
})();
