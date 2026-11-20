// Recipes tab (#recipes): every crafting recipe in the game with FM prices, as a List (one line a recipe) or a Shelf
// (a picture grid with the open recipe beside it), plus Most profit and Level up. data/recipes.json comes from
// npm run craft:book (crafting/tools/make-recipe-book.js). The money logic is the old Recipe Book artifact's, ported
// unchanged: costOf, make, best, plan and levelUp take the data first so tests can call them without a page.
// window.Recipes = { mount, costOf, make, best, plan, levelUp, usedIn }
(function () {
  var THIN = 10;                                   // under this many sales a price is a guess
  var NEED = [50, 166, 319, 521, 786, 1138, 1602]; // craft EXP from level 1 to 2 ... 7 to 8 (same for every craft)
  var TOP = NEED.length + 1;
  var KEY = 'bt.recipes';
  var STATS = [['STR', 'STR'], ['DEX', 'DEX'], ['INT', 'INT'], ['LUK', 'LUK'], ['WAT', 'W.ATK'], ['MAD', 'M.ATK'], ['PDD', 'W.DEF'], ['MDD', 'M.DEF'],
    ['ACC', 'Accuracy'], ['EVA', 'Avoid'], ['Speed', 'Speed'], ['Jump', 'Jump'], ['MHP', 'HP'], ['MMP', 'MP'], ['CRT', 'Crit Rate'], ['CRD', 'Crit Dmg']];

  // ---------- pure: what things cost ----------
  var ctxs = typeof WeakMap === 'function' ? new WeakMap() : null;
  function ctx(d) {
    var c = ctxs && ctxs.get(d);
    if (c) return c;
    c = { P: (d.prices && d.prices.items) || {}, byOut: {}, memo: {}, busy: {}, used: null };
    d.recipes.forEach(function (r) { (c.byOut[r.out] = c.byOut[r.out] || []).push(r); });
    if (ctxs) ctxs.set(d, c);
    return c;
  }
  function buy(d, id) { var p = ctx(d).P[id]; return p && p[0] != null ? p[0] : null; }
  function sold(d, id) { var p = ctx(d).P[id]; return p ? p[2] || 0 : 0; }
  function listed(d, id) { var p = ctx(d).P[id]; return p ? p[1] : null; }
  // one craft: materials at their best price, plus the fee (a catalyst is never counted)
  function costOf(d, r) {
    var sum = r.fee || 0;
    for (var i = 0; i < r.ing.length; i++) { var b = best(d, r.ing[i][0]); if (!b) return null; sum += b.p * r.ing[i][1]; }
    return sum;
  }
  function make(d, id) {
    var c = ctx(d);
    if (id in c.memo) return c.memo[id];
    if (c.busy[id]) return null;                    // arrows turn into each other, so don't go round
    c.busy[id] = 1;
    var m = null;
    (c.byOut[id] || []).forEach(function (r) { var k = costOf(d, r); if (k != null) { k /= r.qty; if (m == null || k < m) m = k; } });
    c.busy[id] = 0;
    return (c.memo[id] = m);
  }
  function best(d, id) {
    var b = buy(d, id), m = make(d, id);
    if (b == null && m == null) return null;
    return m != null && (b == null || m < b) ? { p: m, made: true, buy: b } : { p: b, made: false };
  }
  function usedIn(d, id) {
    var c = ctx(d);
    if (!c.used) {
      c.used = {};
      d.recipes.forEach(function (r) { r.ing.forEach(function (g) { c.used[g[0]] = (c.used[g[0]] || 0) + 1; }); if (r.cat) c.used[r.cat] = (c.used[r.cat] || 0) + 1; });
    }
    return c.used[id] || 0;
  }
  // the cheapest way up one craft level: recipes of that level only, by what a point of craft EXP costs after selling
  function plan(d, tab, lv, sell) {
    var need = NEED[lv - 1], rows = [];
    if (!need) return rows;
    d.recipes.forEach(function (r) {
      if (r.tab !== tab || r.lv !== lv || !r.exp) return;
      var cost = costOf(d, r);
      if (cost == null) return;
      var fm = buy(d, r.out), n = sold(d, r.out), base = (d.base || {})[r.out];
      var npc = (base || {}).sell || (d.sell || {})[r.out] || 0;
      var times = Math.ceil(need / r.exp);
      // the FM price counts only when Cozy has seen 5 times as many sold as this would put up (and, for non-gear, not far more listed than sold)
      var each = sell === 'fm' && fm != null && n >= Math.max(THIN, 5 * times * r.qty) && (base || (listed(d, r.out) != null && listed(d, r.out) <= 4 * n)) ? Math.max(fm, npc) : npc;
      rows.push({ r: r, times: times, spend: cost * times, back: each * r.qty * times, per: (cost - each * r.qty) / r.exp });
    });
    rows.sort(function (a, b) { return a.per - b.per; });
    return rows;
  }
  function levelUp(d, tab, sell) {
    var rows = [], total = 0;
    for (var lv = 1; lv <= NEED.length; lv++) {
      var p = plan(d, tab, lv, sell), a = p[0] || null, b = p[1] || null, net = a ? a.spend - a.back : null;
      if (a) total += net;
      rows.push({ lv: lv, a: a, b: b, net: net });
    }
    return { rows: rows, total: total };
  }

  // ---------- words ----------
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(n) { return Number(n).toLocaleString('en-US'); }
  // mesos: full under 10K, then 12.5K, 250K, 1.25M
  function mes(n) {
    var a = Math.abs(n), s = n < 0 ? '-' : '';
    if (a < 10) return s + (Math.round(a * 100) / 100).toLocaleString('en-US');
    if (a < 10000) return s + Math.round(a).toLocaleString('en-US');
    if (a < 100000) return s + String(Math.round(a / 100) / 10) + 'K';
    if (a < 1000000) return s + Math.round(a / 1000) + 'K';
    return s + String(Math.round(a / 10000) / 100) + 'M';
  }
  function dateText(iso) {
    if (!iso) return '';
    return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function mount(root, opts) {
    var d = opts.data, store = opts.store, onItem = opts.onItem || function () {};
    var P = (d.prices && d.prices.items) || {}, CZ = (d.prices && d.prices.cozy) || {}, ICONS = d.icons || {};
    var OPEN = +d.open || 9, NEXT = d.next || '';
    var NOTE = {}; for (var nl = OPEN + 1; nl <= 10; nl++) NOTE[nl] = nl === OPEN + 1 && NEXT ? 'Opens ' + NEXT : 'Not open yet';
    var byOut = ctx(d).byOut;
    function name(id) { return (d.items[id] || { n: 'Item ' + id }).n; }
    function cozyUrl(id) { return CZ[id] ? 'https://cozy.markets/items/' + CZ[id] : ''; }
    function cozyA(id, inner, cls) { var u = cozyUrl(id); return u ? '<a' + (cls ? ' class="' + cls + '"' : '') + ' href="' + u + '" target="_blank" rel="noopener" title="See ' + esc(name(id)) + ' on Cozy Markets">' + inner + '</a>' : inner; }
    function pic(id, scale) {
      var ic = ICONS[id];
      return ic ? '<img src="' + ic[0] + '" width="' + Math.round(ic[1] * scale) + '" height="' + Math.round(ic[2] * scale) + '" alt="">' : '';
    }
    function signed(n) { return (n >= 0 ? '+' : '') + mes(n); }

    // one entry per recipe, worked out once
    var cards = d.recipes.map(function (r, i) {
      var kind = (d.kinds || {})[r.out] || '', jobs = (d.jobs || {})[r.out] || [];
      var cost = costOf(d, r), fm = buy(d, r.out), n = sold(d, r.out);
      var text = [name(r.out), kind, jobs.join(' '), d.tabs[r.tab]].concat(r.ing.map(function (g) { return name(g[0]); }), r.cat ? [name(r.cat)] : []).join(' | ').toLowerCase();
      return { r: r, i: i, kind: kind, jobs: jobs, cost: cost, fm: fm, sold: n, profit: cost != null && fm != null ? fm * r.qty - cost : null, text: text };
    });
    var byI = {}; cards.forEach(function (c) { byI[c.i] = c; });
    cards.sort(function (a, b) { return a.r.lv - b.r.lv || a.r.tab - b.r.tab || a.i - b.i; });
    var levels = [];
    cards.forEach(function (c) { if (levels.indexOf(c.r.lv) < 0) levels.push(c.r.lv); });
    levels.sort(function (a, b) { return a - b; });
    var things = Object.keys(d.items).filter(function (id) { return byOut[id] || usedIn(d, id); })
      .map(function (id) { return { id: +id, n: name(id), low: name(id).toLowerCase() }; });
    var known = {}; things.forEach(function (t) { known[t.id] = 1; });

    // what the device keeps: look, view, craft and level; anything odd falls back to the defaults
    var saved = null;
    try { saved = JSON.parse(store.get(KEY)); } catch (e) { saved = null; }
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) saved = {};
    var state = {
      look: saved.look === 'shelf' ? 'shelf' : 'list',
      view: ['book', 'profit', 'level'].indexOf(saved.view) >= 0 ? saved.view : 'book',
      tab: Number.isInteger(saved.tab) && saved.tab >= 0 && saved.tab < d.tabs.length ? saved.tab : -1,
      lv: Number.isInteger(saved.lv) && levels.indexOf(saved.lv) >= 0 ? saved.lv : 0,
      sell: 'fm', q: '', item: null, open: null,
    };
    function save() { try { store.set(KEY, JSON.stringify({ look: state.look, view: state.view, tab: state.tab, lv: state.lv })); } catch (e) { /* this visit only */ } }

    root.innerHTML =
      '<div class="rc">' +
        '<div class="rc-top"><h2>Recipes</h2><p id="rc-lede"></p></div>' +
        '<div class="rc-find"><input id="rc-q" type="search" autocomplete="off" spellcheck="false" placeholder="Find an item or a material, like Garnet" aria-label="Find a recipe" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="rc-sug">' +
          '<button type="button" class="k-btn sm" id="rc-clear" hidden>Clear</button><ul id="rc-sug" role="listbox" aria-label="Items" hidden></ul></div>' +
        '<div class="rc-bar"><div class="words" id="rc-views" role="group" aria-label="Show"></div>' +
          '<div class="rc-pills" id="rc-look" role="group" aria-label="Look"></div><div class="rc-pills" id="rc-sell" role="group" aria-label="Selling"></div></div>' +
        '<div class="words" id="rc-tabs" role="group" aria-label="Craft"></div>' +
        '<div class="words" id="rc-lvs" role="group" aria-label="Craft level"></div>' +
        '<p class="rc-count" id="rc-count"></p>' +
        '<div id="rc-list"></div>' +
        '<p class="rc-foot" id="rc-credit"></p>' +
      '</div>';
    var $ = function (id) { return root.querySelector('#' + id); };
    var q = $('rc-q'), sug = $('rc-sug'), clear = $('rc-clear'), list = $('rc-list');

    function word(label, pressed, attrs) { return '<button type="button" aria-pressed="' + pressed + '" ' + attrs + '>' + label + '</button>'; }
    function pill(label, pressed, attrs) { return '<button type="button" class="k-btn sm" aria-pressed="' + pressed + '" ' + attrs + '>' + label + '</button>'; }
    function drawControls() {
      $('rc-views').innerHTML = word('The book', state.view === 'book' && state.item == null, 'data-view="book"') + word('Most profit', state.view === 'profit', 'data-view="profit"') + word('Level up', state.view === 'level', 'data-view="level"');
      $('rc-look').innerHTML = pill('List', state.look === 'list', 'data-look="list"') + pill('Shelf', state.look === 'shelf', 'data-look="shelf"');
      $('rc-sell').innerHTML = pill('On the FM', state.sell === 'fm', 'data-sell="fm"') + pill('To an NPC', state.sell === 'npc', 'data-sell="npc"');
      var lvl = state.view === 'level';
      $('rc-sell').hidden = !lvl; $('rc-look').hidden = lvl || state.view === 'profit'; $('rc-lvs').hidden = lvl;
      root.querySelector('.rc-find').hidden = lvl;
      var t = word('All crafts', state.tab < 0, 'data-tab="-1"');
      d.tabs.forEach(function (n, i) { t += word(esc(n), state.tab === i, 'data-tab="' + i + '"'); });
      $('rc-tabs').innerHTML = t;
      var l = word('Every level', !state.lv, 'data-lv="0"');
      levels.forEach(function (lv) { l += word('Level ' + lv, state.lv === lv, 'data-lv="' + lv + '"'); });
      $('rc-lvs').innerHTML = l;
      clear.hidden = !q.value && state.item == null;
    }

    // ---------- drawing ----------
    function matsLine(c) {
      return c.r.ing.map(function (g) {
        var b = best(d, g[0]);
        return '<span class="m">' + pic(g[0], 1) + '<span>' + num(g[1]) + ' ' + esc(name(g[0])) + '</span> <i>' + (b ? mes(b.p) + (b.made ? ' made' : '') : 'no price') + '</i></span>';
      }).join('');
    }
    function pfCell(c) { return c.profit == null ? '<span class="pf none"></span>' : '<span class="pf ' + (c.profit >= 0 ? 'up' : 'down') + '">' + signed(c.profit) + '</span>'; }
    function row(c) {
      var open = state.open === c.i;
      return '<div class="rc-row" data-i="' + c.i + '">' +
        '<span class="ic">' + pic(c.r.out, 1) + '</span>' +
        '<span class="nm"><button type="button" class="rc-open" aria-expanded="' + open + '"><b>' + esc(name(c.r.out)) + '</b></button><small>' + esc(c.kind || d.tabs[c.r.tab]) + (c.r.qty > 1 ? ' · makes ' + num(c.r.qty) : '') + '</small></span>' +
        '<span class="ms">' + matsLine(c) + '</span>' +
        '<span class="n cost">' + (c.cost != null ? mes(c.cost) : '<small>no price</small>') + '</span>' +
        '<span class="n sellc">' + (c.fm != null ? cozyA(c.r.out, mes(c.fm * c.r.qty)) + '<small>' + num(c.sold) + ' sold this week</small>' : '<small>no price</small>') + '</span>' +
        '<span class="n">' + pfCell(c) + '</span>' +
      '</div>' + (open ? panel(c) : '');
    }
    var HEAD = '<div class="rc-hd"><span></span><span>Recipe</span><span>Materials</span><span>Costs</span><span>Sells for</span><span>Profit</span></div>';
    function tile(c) {
      return '<button type="button" class="rc-tile" data-i="' + c.i + '" aria-pressed="' + (state.open === c.i) + '">' +
        '<span class="ic">' + pic(c.r.out, 1.35) + '</span><span class="tn">' + esc(name(c.r.out)) + '</span>' +
        (c.profit == null ? '<b class="none">no price</b>' : '<b class="' + (c.profit >= 0 ? 'up' : 'down') + '">' + signed(c.profit) + '</b>') + '</button>';
    }
    function panel(c) {
      var r = c.r, base = (d.base || {})[r.out] || {};
      var isMat = c.kind === 'Material' || c.kind === 'Arrows';
      var meta = [];
      if (c.kind) meta.push(esc(c.kind));
      if (base.req !== undefined) meta.push(c.jobs.length ? esc(c.jobs.join(', ')) : 'Any job');
      if (base.req) meta.push('Lv ' + base.req);
      meta.push(esc(d.tabs[r.tab]) + ' level ' + r.lv);
      var lacks = r.ing.filter(function (g) { return !best(d, g[0]); }).map(function (g) { return name(g[0]); });
      var words = c.profit == null ? (lacks.length ? 'no FM price for ' + esc(lacks.join(', ')) : 'nobody is selling it on the FM yet')
        : c.profit >= 0 ? (isMat ? 'a craft, cheaper to make than buy' : 'profit a craft') : (isMat ? 'a craft, cheaper to buy' : 'loss a craft');
      if (c.profit != null && c.sold < THIN) words += ' · only ' + num(c.sold) + ' sold, so the price is a guess';
      var st = STATS.filter(function (s) { return base[s[0]]; }).map(function (s) { return s[1] + ' <b>' + base[s[0]] + '</b>'; });
      if (base.slots) st.push('<b>' + base.slots + '</b> slots');
      var mats = r.ing.map(function (g) {
        var b = best(d, g[0]);
        return '<div class="rc-mat"><span class="ic">' + pic(g[0], 1) + '</span><button type="button" data-id="' + g[0] + '">' + num(g[1]) + ' ' + esc(name(g[0])) + '</button>' +
          '<span class="v">' + (b ? cozyA(g[0], mes(b.p * g[1])) + (b.made ? '<small>made</small>' : '') : '<small>no price</small>') + '</span></div>';
      }).join('');
      var cz = cozyUrl(r.out);
      return '<div class="rc-panel" aria-label="' + esc(name(r.out)) + '">' +
        '<div class="ph"><span class="well">' + pic(r.out, 2) + '</span><div><h4>' + esc(name(r.out)) + '</h4><p class="meta">' + meta.join(' · ') + (r.qty > 1 ? ' · makes ' + num(r.qty) : '') + '</p></div></div>' +
        '<p class="big">' + (c.profit == null ? '' : '<b class="' + (c.profit >= 0 ? 'up' : 'down') + '">' + signed(c.profit) + '</b> ') + '<span>' + words + '</span></p>' +
        (st.length ? '<p class="stats">' + st.join(' · ') + '</p>' : '') +
        '<div class="rows">' + mats +
          (r.cat ? '<div class="rc-mat cat"><span class="ic">' + pic(r.cat, 1) + '</span><button type="button" data-id="' + r.cat + '">Optional catalyst: ' + esc(name(r.cat)) + '</button><span class="v"><small>not counted</small></span></div>' : '') +
          '<div class="line"><span></span><span>Fee</span><span class="v">' + (r.fee ? num(r.fee) : 'none') + '</span></div>' +
          '<div class="line sum"><span></span><span>Costs to make</span><span class="v">' + (c.cost != null ? mes(c.cost) : '<small>no price</small>') + '</span></div>' +
          '<div class="line sum"><span></span><span>Sells for' + (c.fm != null ? '<small>' + num(c.sold) + ' sold this week' + (r.qty > 1 ? ', ' + mes(c.fm) + ' each' : '') + '</small>' : '') + '</span><span class="v">' + (c.fm != null ? mes(c.fm * r.qty) : '<small>no price</small>') + '</span></div>' +
        '</div>' +
        '<p class="pf-foot">' + (cz ? '<a class="cz" href="' + cz + '" target="_blank" rel="noopener">See it on Cozy Markets</a> · ' : '') + (r.exp ? num(r.exp) + ' craft EXP' : 'no craft EXP') + '</p>' +
      '</div>';
    }
    // a run of recipes in the chosen look, with optional group headers (h3 html) between them
    function drawGroups(groups, look) {
      if (look === 'shelf') {
        var openC = state.open != null && groups.some(function (g) { return g.cards.some(function (c) { return c.i === state.open; }); }) ? byI[state.open] : null;
        var tiles = groups.map(function (g) { return (g.head ? '<div class="rc-gh">' + g.head + '</div>' : '') + g.cards.map(tile).join(''); }).join('');
        return '<div class="rc-shelf"><div class="rc-tiles">' + tiles + '</div>' + (openC ? panel(openC) : '<p class="rc-hint">Tap a picture to see its recipe.</p>') + '</div>';
      }
      return '<div class="rc-led">' + HEAD + groups.map(function (g) { return (g.head || '') + g.cards.map(row).join(''); }).join('') + '</div>';
    }
    function grouphead(h3, tag, n) {
      return '<div class="rc-lvbar">' + h3 + (tag ? '<span class="tag">' + tag + '</span>' : '') + '<span class="n">' + n + (n === 1 ? ' recipe' : ' recipes') + '</span></div>';
    }

    function drawLevelUp() {
      var out = '';
      d.tabs.forEach(function (tn, tab) {
        if (state.tab >= 0 && state.tab !== tab) return;
        var u = levelUp(d, tab, state.sell), rows = '';
        u.rows.forEach(function (x) {
          var lab = '<span class="lr-l">' + x.lv + ' to ' + (x.lv + 1) + '</span>';
          if (!x.a) { rows += '<div class="rc-lr">' + lab + '<span class="ic"></span><div class="lr-m"><small>No recipe at this level has every price yet</small></div><span class="lr-n"></span></div>'; return; }
          var a = x.a, b = x.b, net = x.net;
          rows += '<div class="rc-lr">' + lab + '<span class="ic">' + pic(a.r.out, 1) + '</span><div class="lr-m">' +
            '<span><button type="button" data-id="' + a.r.out + '">' + esc(name(a.r.out)) + '</button> <b>×' + num(a.times) + '</b></span>' +
            '<small>' + num(NEED[x.lv - 1]) + ' EXP, ' + num(a.r.exp) + ' a craft · spend ' + mes(a.spend) + ', get back ' + mes(a.back) + '</small>' +
            (b ? '<small>Next best: ' + esc(name(b.r.out)) + ' ×' + num(b.times) + ' (' + (b.spend - b.back > 0 ? 'costs ' + mes(b.spend - b.back) : 'makes ' + mes(b.back - b.spend)) + ')</small>' : '') +
            '</div><span class="lr-n ' + (net < -0.5 ? 'up' : '') + '">' + (net < -0.5 ? '+' + mes(-net) : mes(Math.max(0, net))) + '<small>' + (net < -0.5 ? 'profit' : net < 0.5 ? 'even' : 'cost') + '</small></span></div>';
        });
        out += '<section class="rc-lu" aria-label="' + esc(tn) + '"><div class="rc-luh"><h3>' + esc(tn) + '</h3><span class="n">1 to ' + TOP + ' ' +
          (u.total > 0 ? 'costs about <b>' + mes(u.total) + '</b>' : 'makes about <b class="up">' + mes(-u.total) + '</b>') + '</span></div>' + rows + '</section>';
      });
      list.innerHTML = out + '<p class="rc-note">How this is worked out: for each level it looks only at recipes of that same level, since nobody has confirmed whether lower ones still give EXP. Materials come at the FM usual price, or made when that is cheaper. ' +
        (state.sell === 'fm' ? 'What you make sells at its clean price only when Cozy has seen at least 5 times as many sold in a week as you would be putting up, otherwise it goes to an NPC. That is still the hopeful case, so flip to To an NPC for the worst case. ' : 'Everything you make goes to an NPC, the worst case. ') +
        'Each craft level also needs your character at 5 times that level (10 for level 1). What ' + TOP + ' to ' + (TOP + 1) + ' needs is not known yet.</p>';
      $('rc-count').innerHTML = 'The cheapest way from craft level <b>1</b> to <b>' + TOP + '</b>' + (state.tab >= 0 ? ' in ' + esc(d.tabs[state.tab]) : ' in each craft') + '. Tap an item to see its recipe.';
    }

    function render() {
      drawControls();
      if (state.view === 'level') return drawLevelUp();
      var it = state.item, words = state.q.toLowerCase().trim().split(/\s+/).filter(Boolean);
      var shown = cards.filter(function (c) {
        if (state.tab >= 0 && c.r.tab !== state.tab) return false;
        if (state.lv && c.r.lv !== state.lv) return false;
        if (it != null) return +c.r.out === it || +c.r.cat === it || c.r.ing.some(function (g) { return +g[0] === it; });
        return words.every(function (w) { return c.text.indexOf(w) >= 0; });
      });
      if (state.view === 'profit' && it == null) {
        var open = shown.filter(function (c) { return c.r.lv <= OPEN; });
        var solid = open.filter(function (c) { return c.profit != null && c.sold >= THIN; }).sort(function (a, b) { return b.profit - a.profit; });
        var wins = solid.filter(function (c) { return c.profit > 0; }).length;
        list.innerHTML = solid.length ? drawGroups([{ cards: solid }], 'list') : '<p class="rc-empty">Nothing here has both a material price and a selling price yet.</p>';
        $('rc-count').innerHTML = '<b>' + wins + '</b> of <b>' + solid.length + '</b> recipes make a profit at the clean sold price, best first. ' + (open.length - solid.length) + ' more are left out for a missing price or under ' + THIN + ' sales.' + (OPEN < 10 ? ' Recipes above level ' + OPEN + ' are left out until they open.' : '');
        return;
      }
      if (it != null) {
        var mk = shown.filter(function (c) { return +c.r.out === it; }), us = shown.filter(function (c) { return +c.r.out !== it; }), groups = [];
        if (mk.length) groups.push({ head: grouphead('<h3>How to make ' + esc(name(it)) + '</h3>', '', mk.length), cards: mk });
        if (us.length) groups.push({ head: grouphead('<h3>Made with ' + esc(name(it)) + '</h3>', '', us.length), cards: us });
        list.innerHTML = groups.length ? drawGroups(groups, state.look) : '<p class="rc-empty">No recipe here makes or uses ' + esc(name(it)) + '.</p>';
        var bp = buy(d, it), cz = cozyUrl(it);
        $('rc-count').innerHTML = '<b>' + esc(name(it)) + '</b>' + (bp != null ? ' goes for <b>' + mes(bp) + '</b> on the FM' : '') + '. ' + (cz ? '<a href="' + cz + '" target="_blank" rel="noopener">See it on Cozy Markets</a>. ' : '') +
          (mk.length ? (mk.length === 1 ? 'One recipe makes it' : mk.length + ' recipes make it') : 'Nothing makes it, so it drops or is bought') + (us.length ? ', and ' + us.length + (us.length === 1 ? ' recipe uses it.' : ' recipes use it.') : '.');
        return;
      }
      var gs = [];
      levels.forEach(function (lv) {
        var here = shown.filter(function (c) { return c.r.lv === lv; });
        if (here.length) gs.push({ head: grouphead('<h3 class="rc-lvh">Craft level ' + lv + '</h3>', NOTE[lv] || '', here.length), cards: here });
      });
      list.innerHTML = gs.length ? drawGroups(gs, state.look) : '<p class="rc-empty">Nothing matches "' + esc(state.q) + '". Try a material like Garnet, or clear the search.</p>';
      $('rc-count').innerHTML = 'Showing <b>' + shown.length + '</b> of <b>' + cards.length + '</b> recipes. Tap a recipe to open it.';
    }

    // ---------- search ----------
    var sugList = [], sugAt = -1;
    function suggest() {
      var w = q.value.toLowerCase().trim();
      sugList = [];
      if (w && state.item == null) {
        var rank = function (t) { var i = t.low.indexOf(w); return i < 0 ? 9 : i === 0 ? 0 : t.low.charAt(i - 1) === ' ' ? 1 : 2; };
        sugList = things.map(function (t) { return [rank(t), t]; }).filter(function (x) { return x[0] < 9; })
          .sort(function (a, b) { return a[0] - b[0] || a[1].n.length - b[1].n.length || (a[1].n < b[1].n ? -1 : 1); }).slice(0, 8).map(function (x) { return x[1]; });
      }
      sugAt = -1; drawSug();
    }
    function drawSug() {
      sug.hidden = !sugList.length;
      q.setAttribute('aria-expanded', String(!!sugList.length));
      sug.innerHTML = sugList.map(function (t, i) {
        var bits = []; if (byOut[t.id]) bits.push('has a recipe'); if (usedIn(d, t.id)) bits.push('used in ' + usedIn(d, t.id));
        return '<li role="option" id="rc-sug' + i + '" data-i="' + i + '" aria-selected="' + (i === sugAt) + '"><span class="ic">' + pic(t.id, 1) + '</span><span class="sn">' + esc(t.n) + '</span><small>' + bits.join(' · ') + '</small></li>';
      }).join('');
      if (sugAt >= 0) q.setAttribute('aria-activedescendant', 'rc-sug' + sugAt); else q.removeAttribute('aria-activedescendant');
    }
    function setItem(id) {
      state.item = id; state.q = ''; state.open = null; q.value = name(id);
      state.lv = 0; state.tab = -1; if (state.view === 'level' || state.view === 'profit') state.view = 'book';
      sugList = []; drawSug(); save(); render();
    }
    function pick(id) { setItem(+id); onItem(+id); }
    function unpick() { state.item = null; state.q = ''; state.open = null; q.value = ''; }
    q.addEventListener('input', function () { var was = state.item; state.item = null; state.q = q.value; state.open = null; suggest(); render(); if (was != null) onItem(null); });
    q.addEventListener('focus', suggest);
    q.addEventListener('blur', function () { sugList = []; drawSug(); });
    q.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { if (sugList.length) { sugList = []; drawSug(); e.preventDefault(); } return; }
      if (!sugList.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sugAt = (sugAt + (e.key === 'ArrowDown' ? 1 : -1) + sugList.length + (sugAt < 0 && e.key === 'ArrowUp' ? 1 : 0)) % sugList.length; drawSug(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (sugAt >= 0) pick(sugList[sugAt].id); else { sugList = []; drawSug(); } }
    });
    sug.addEventListener('mousedown', function (e) { var li = e.target.closest('li'); if (!li) return; e.preventDefault(); pick(sugList[+li.dataset.i].id); });
    clear.addEventListener('click', function () { var was = state.item; unpick(); render(); if (was != null) onItem(null); q.focus(); });

    // ---------- clicks ----------
    root.querySelector('.rc-bar').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.view) { var was = state.item; unpick(); state.view = b.dataset.view; state.open = null; save(); render(); if (was != null) onItem(null); }
      else if (b.dataset.look) { state.look = b.dataset.look; save(); render(); }
      else if (b.dataset.sell) { state.sell = b.dataset.sell; render(); }
    });
    $('rc-tabs').addEventListener('click', function (e) { var b = e.target.closest('[data-tab]'); if (!b) return; state.tab = +b.dataset.tab; state.open = null; save(); render(); });
    $('rc-lvs').addEventListener('click', function (e) { var b = e.target.closest('[data-lv]'); if (!b) return; state.lv = +b.dataset.lv; state.open = null; save(); render(); });
    list.addEventListener('click', function (e) {
      if (e.target.closest('a')) return;
      var go = e.target.closest('button[data-id]');
      if (go) { pick(+go.dataset.id); root.scrollIntoView({ block: 'start', behavior: 'auto' }); return; }
      if (e.target.closest('.rc-panel')) return;
      var hit = e.target.closest('.rc-row, .rc-tile');
      if (!hit) return;
      var i = +hit.dataset.i;
      state.open = state.open === i ? null : i;
      render();
      var back = list.querySelector((hit.classList.contains('rc-tile') ? '.rc-tile' : '.rc-row .rc-open') + '[data-i="' + i + '"], [data-i="' + i + '"] .rc-open');
      if (back) back.focus({ preventScroll: true });
    });

    $('rc-lede').innerHTML = 'All <b>' + cards.length + '</b> recipes across ' + d.tabs.length + ' crafts. Materials are priced at the FM usual, gear at what clean copies sold for. ' +
      (NEXT ? 'Crafting stops at level ' + OPEN + ' until the ' + esc(NEXT) + ' update opens level ' + (OPEN + 1) + '.' : 'Crafting goes up to level ' + OPEN + ' right now.');
    $('rc-credit').innerHTML = (d.prices ? 'Prices from <a href="https://cozy.markets" target="_blank" rel="noopener">Cozy Markets</a>, ' + dateText(d.prices.date) +
      ': the FM usual price each for materials, and for gear the middle price of clean copies sold in the last week (gear with no clean sales has no price). A catalyst is never counted in a cost. ' : '') +
      'Recipes, stats and pictures come from the game client\'s own files' + (d.pulled ? ', pulled ' + esc(dateText(d.pulled)) : '') + '. Stats are the clean stats before any roll.';

    function show(id) {
      id = id == null ? null : +id;
      if (id != null && !known[id]) id = null;
      if (id === state.item) return;
      if (id == null) { unpick(); render(); } else setItem(id);
    }
    if (opts.item != null && known[+opts.item]) setItem(+opts.item); else render();

    return {
      show: show,
      report: function () {
        return { look: state.look, view: state.view, craft: state.tab >= 0 ? d.tabs[state.tab] : null, level: state.lv || null, search: q.value, item: state.item };
      },
    };
  }

  window.Recipes = { mount: mount, costOf: costOf, make: make, best: best, plan: plan, levelUp: levelUp, usedIn: usedIn };
})();
