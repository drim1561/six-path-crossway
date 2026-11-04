// Something off? (window.Flag): the panel behind the pill in the corner of every tab, loaded the first time someone
// presses it. One click takes a picture of the page, a few words, Send, and the report goes to functions/api/report.js,
// which passes it to Rimmah's private #bug-reports channel on Discord. Design: docs/superpowers/specs/2026-11-02-flag-button-design.md.
//
// Flag.open({ api, el, config, view, reporter, game, gameAt, session, button }) draws the page, then shows the panel.
// gameAt (ms) says game is the last picture a tab's reader read rather than the live share.
// Flag.details(ctx) is everything that goes along quietly (shown in full behind See everything); never the sign in token,
// which travels as its own field for the relay to check. Flag.capDetails(obj) keeps it under the relay's 200,000 bytes.
(function () {
  const LIB = 'https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js';
  const LIB_SRI = 'sha384-UbfRVKN3/elS1r7JcK2FhmPP+KlJ4CvYwbyYD7tH+uTkbT9bNJr9eJeQ0FoFbAgz';
  const MAX_DETAILS = 190000;   // bytes; the relay takes up to 200,000
  const MAX_PAGE = 2000000;     // bytes, the relay's cap on the page picture
  const MAX_POP = 1000000;      // and on the pop out; one bigger is left out rather than refuse the whole report
  const MAX_STRIP = 9000000;    // and on each game strip
  // drawn in place of a picture that can't load, which would otherwise sink the whole drawing
  const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  // an <img> with no src yet (Grind's Lemon tile before a potion runs down, on the page and in the pop out) would be
  // fetched as the page itself and sink the drawing, so it's left out
  const drawable = n => !(n.tagName === 'IMG' && !n.getAttribute('src'));
  const SHOT_ID = { page: 'flag-shot-page', game: 'flag-shot-game', popout: 'flag-shot-pop' };
  const PAGE_WIDTH = 1600;      // the page picture is for people to look at, so it's scaled down to about this wide
  const TOAST_MS = 8000;
  const COPY = {
    busy: 'Taking a picture…',
    title: 'Something off?',
    wrong: "Something's wrong", idea: 'An idea',
    place: { wrong: 'What looked wrong? A few words is fine', idea: 'What would make it better?' },
    also: 'Also sends which tab, your browser and screen size, and what the page was reading.',
    see: 'See everything',
    anon: 'Not signed in, so it goes without a name.',
    empty: 'Type a few words or keep a picture.',
    sending: 'Sending…', send: 'Send', cancel: 'Cancel',
    failed: "Couldn't send. Try again.",
    thanks: 'Sent, thanks!', discord: 'Join our Discord',
    gameTooBig: 'Your game window is too big to send a picture of, so that one stays on your computer.',
    open: 'Open full size',
    shots: { page: 'This page', game: 'Your game', popout: 'Pop out' },
    lastRead: 'From your last Read from game', leaveLastRead: 'Leave out the picture from your last Read from game',
  };

  // html-to-image, pinned like supabase-js, fetched the first time a picture is drawn
  let lib = null;
  function loadLib() {
    if (window.htmlToImage) return Promise.resolve(window.htmlToImage);
    if (lib) return lib;
    lib = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = LIB; s.integrity = LIB_SRI; s.crossOrigin = 'anonymous';
      s.onload = () => window.htmlToImage ? resolve(window.htmlToImage) : reject(new Error('html-to-image'));
      s.onerror = () => reject(new Error('html-to-image'));
      document.head.append(s);
    }).catch(e => { lib = null; throw e; });
    return lib;
  }
  const toBlob = (canvas, type, quality) => new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('no picture')), type, quality));

  // The page as a JPEG about 1600 wide, without the pill. Web fonts come from another site and can fail to embed, so a
  // second try goes without them; a picture still over the cap is drawn once more at half size.
  async function drawPage(skip) {
    const H = await loadLib();
    const w = Math.max(1, document.documentElement.clientWidth);
    const filter = n => !skip.includes(n) && drawable(n);
    const opts = ratio => ({ pixelRatio: ratio, filter, imagePlaceholder: BLANK, backgroundColor: getComputedStyle(document.body).backgroundColor });
    const draw = async ratio => {
      let canvas;
      try { canvas = await H.toCanvas(document.body, opts(ratio)); } catch (e) { canvas = await H.toCanvas(document.body, Object.assign({ skipFonts: true }, opts(ratio))); }
      return toBlob(canvas, 'image/jpeg', 0.85);
    };
    const ratio = Math.min(window.devicePixelRatio || 1, PAGE_WIDTH / w);
    let blob = await draw(ratio);
    if (blob.size > MAX_PAGE) blob = await draw(ratio / 2);
    if (blob.size > MAX_PAGE) throw new Error('page picture too big');
    return blob;
  }

  // The game frame as lossless PNG strips, left to right, each under the relay's cap: one for most windows, two to four
  // for a very wide one. whole is for the thumbnail; strips is null when even four won't fit.
  async function gameStrips(canvas) {
    const whole = await toBlob(canvas, 'image/png');
    if (whole.size <= MAX_STRIP) return { whole, strips: [whole] };
    for (let k = 2; k <= 4; k++) {
      const strips = [];
      for (let i = 0; i < k; i++) {
        const x0 = Math.round(canvas.width * i / k), x1 = Math.round(canvas.width * (i + 1) / k), w = x1 - x0;
        const c = document.createElement('canvas'); c.width = w; c.height = canvas.height;
        c.getContext('2d').drawImage(canvas, x0, 0, w, canvas.height, 0, 0, w, canvas.height);
        strips.push(await toBlob(c, 'image/png'));
        c.width = 0;   // let go of the pixels now, not whenever garbage is collected
      }
      if (strips.every(b => b.size <= MAX_STRIP)) return { whole, strips };
    }
    return { whole, strips: null };
  }

  // every box with an id in the tab, so the report shows what was typed
  function inputsOf(view) {
    const out = {}, root = document.getElementById('view-' + view);
    if (!root) return out;
    let n = 0;
    for (const e of root.querySelectorAll('input[id], select[id], textarea[id]')) {
      if (n >= 100) break;
      if (e.type === 'password' || e.type === 'file') continue;
      out[e.id] = e.type === 'checkbox' || e.type === 'radio' ? e.checked : String(e.value).slice(0, 200);
      n++;
    }
    return out;
  }

  function details({ kind, view, reporter, config, signedIn, pictures, when }) {
    // the address without a sign in that's still in it (Supabase hands tokens back in the hash for a moment)
    const hash = /token/i.test(location.hash) ? '' : location.hash;
    const d = {
      v: 1, kind, tab: view, url: location.origin + location.pathname + location.search + hash,
      version: (config && config.version) || 'unknown', when: (when || new Date()).toISOString(),
      // the Windows app's version when the report comes from inside it (grind-app/), else null
      app: (window.sixPathApp && window.sixPathApp.version) || null,
      browser: navigator.userAgent, screen: [screen.width, screen.height], window: [innerWidth, innerHeight], dpr: window.devicePixelRatio || 1,
      theme: document.documentElement.dataset.theme || 'light', signedIn: !!signedIn, onlyGrind: document.body.classList.contains('only-grind'),
      errors: (window.BT_ERRORS || []).slice(-20), inputs: inputsOf(view), pictures: Object.assign({}, pictures),
    };
    if (reporter && typeof reporter.report === 'function') {
      try { d.state = reporter.report(); } catch (e) { d.state = { error: String((e && e.message) || e) }; }
    }
    return d;
  }

  // Under max bytes: the tab's state goes first, then the boxes, then the errors, and stateCut says something was left out.
  function capDetails(obj, max = MAX_DETAILS) {
    const bytes = s => new TextEncoder().encode(s).length;
    const json = o => { try { return JSON.stringify(o); } catch (e) { return null; } };   // a state that won't turn into JSON is dropped like a big one
    let j = json(obj);
    if (j != null && bytes(j) <= max) return { json: j, cut: false };
    const o = Object.assign({}, obj, { stateCut: true });
    for (const k of ['state', 'inputs', 'errors']) {
      delete o[k];
      j = json(o);
      if (j != null && bytes(j) <= max) return { json: j, cut: true };
    }
    return { json: JSON.stringify({ v: obj.v, kind: obj.kind, tab: obj.tab, version: obj.version, app: obj.app, when: obj.when, stateCut: true }), cut: true };
  }

  async function open(deps) {
    const { el: E, api, config, view, reporter, button } = deps;
    if (document.getElementById('flag-panel')) return;
    const label = button.textContent;
    button.disabled = true; button.textContent = COPY.busy;
    const when = new Date(), signedIn = !!deps.session;
    // the state at the moment of the click, so the numbers match the picture
    const base = details({ kind: 'wrong', view, reporter, config, signedIn, pictures: {}, when });
    const pictures = { page: 'failed', game: 'none', popout: 'none' };
    const pics = {};   // key -> { blob, url, name }
    const keep = (key, blob, name) => { pics[key] = { blob, url: URL.createObjectURL(blob), name }; pictures[key] = 'ok'; };
    // the shared game frame grabbed at the click: a lossless PNG at its own size, never shrunk, since the reader's
    // pixel fonts are what a misread comes down to
    let strips = null, note = '';
    if (deps.game) {
      base.gameSize = [deps.game.width, deps.game.height];
      base.gameFrom = deps.gameAt ? 'last read' : 'live';
      if (deps.gameAt) base.gameAgeSec = Math.max(0, Math.round((when - deps.gameAt) / 1000));
      try {
        const g = await gameStrips(deps.game);
        if (g.strips) { strips = g.strips; keep('game', g.whole, 'game.png'); base.gameParts = strips.length; }
        else { pictures.game = 'too big'; note = COPY.gameTooBig; }
      } catch (e) { pictures.game = 'failed'; }
      deps.game.width = 0;
    }
    try { keep('page', await drawPage([button, document.getElementById('flag-toast')].filter(Boolean)), 'page.jpg'); } catch (e) { pictures.page = 'failed'; }
    // the Grind pop out lives in its own window; drawn as it is, if the library can
    const pop = reporter && typeof reporter.popout === 'function' ? reporter.popout() : null;
    if (pop) {
      try {
        const H = await loadLib();
        const opts = { pixelRatio: 1, filter: drawable, imagePlaceholder: BLANK };
        const canvas = await H.toCanvas(pop, opts).catch(() => H.toCanvas(pop, Object.assign({ skipFonts: true }, opts)));
        const blob = await toBlob(canvas, 'image/png');
        if (blob.size > MAX_POP) throw new Error('pop out picture too big');
        keep('popout', blob, 'popout.png');
      } catch (e) { pictures.popout = 'failed'; }
    }
    button.textContent = label; button.hidden = true;

    let kind = 'wrong', sending = false;
    const text = E('textarea', { id: 'flag-text', maxlength: '1000', placeholder: COPY.place.wrong, 'aria-label': COPY.place.wrong });
    const kinds = {};
    const setKind = k => {
      kind = k;
      for (const [x, b] of Object.entries(kinds)) b.setAttribute('aria-pressed', String(x === k));
      text.placeholder = COPY.place[k]; text.setAttribute('aria-label', COPY.place[k]);
    };
    for (const k of ['wrong', 'idea']) kinds[k] = E('button', { type: 'button', id: 'flag-kind-' + k, 'aria-pressed': String(k === kind), onclick: () => setKind(k) }, COPY[k]);
    const shots = E('div', { class: 'flag-shots' });
    const drop = key => {
      const fig = document.getElementById(SHOT_ID[key]);
      if (fig) fig.remove();
      URL.revokeObjectURL(pics[key].url); delete pics[key]; pictures[key] = 'dropped';
      text.focus();
    };
    for (const key of ['page', 'game', 'popout']) {
      if (!pics[key]) continue;
      const last = key === 'game' && deps.gameAt, name = last ? COPY.lastRead : COPY.shots[key];
      shots.append(E('figure', { class: 'flag-shot', id: SHOT_ID[key] },
        E('a', { href: pics[key].url, target: '_blank', rel: 'noopener', title: COPY.open }, E('img', { src: pics[key].url, alt: name })),
        E('figcaption', {}, name),
        E('button', { type: 'button', class: 'flag-drop', 'aria-label': last ? COPY.leaveLastRead : 'Leave out ' + name, title: 'Leave out', onclick: () => drop(key) }, '✕')));
    }
    const current = () => Object.assign({}, base, { kind, pictures: Object.assign({}, pictures) });
    const pre = E('pre', { id: 'flag-details', hidden: '' });
    const see = E('button', { type: 'button', id: 'flag-see', class: 'linkish', 'aria-expanded': 'false', onclick: () => {
      const show = pre.hidden;
      if (show) pre.textContent = JSON.stringify(JSON.parse(capDetails(current()).json), null, 2);
      pre.hidden = !show; see.setAttribute('aria-expanded', String(show));
    } }, COPY.see);
    const name = deps.session && deps.session.user_name;
    const msg = E('p', { id: 'flag-msg', role: 'status' });
    const say = s => { msg.textContent = s; };
    const sendBtn = E('button', { type: 'button', id: 'flag-send', onclick: () => send() }, COPY.send);
    const panel = E('div', { id: 'flag-panel', role: 'dialog', 'aria-labelledby': 'flag-h' },
      E('h2', { id: 'flag-h' }, COPY.title),
      E('div', { class: 'flag-kinds' }, kinds.wrong, kinds.idea),
      shots, text,
      E('p', { class: 'flag-small' }, COPY.also, ' ', see), pre,
      E('p', { id: 'flag-who', class: 'flag-small' }, signedIn ? 'Sending as ' + (name || 'you') : COPY.anon),
      msg,
      E('div', { class: 'flag-row' }, E('button', { type: 'button', id: 'flag-cancel', onclick: () => close() }, COPY.cancel), sendBtn));
    const lock = on => { for (const b of panel.querySelectorAll('#flag-cancel, .flag-drop, .flag-kinds button')) b.disabled = on; };
    if (note) say(note);
    const onKey = e => { if (e.key === 'Escape' && !sending) close(); };
    function close() {
      document.removeEventListener('keydown', onKey);
      for (const p of Object.values(pics)) URL.revokeObjectURL(p.url);
      panel.remove();
      button.hidden = false; button.disabled = false;
    }
    async function send() {
      if (sending) return;
      const words = text.value.trim();
      if (!words && !Object.keys(pics).length) { say(COPY.empty); return; }
      // once it's on its way nothing can be taken back, so Cancel, the ✕s and the pick wait with Send
      sending = true; sendBtn.disabled = true; sendBtn.textContent = COPY.sending; say(''); lock(true);
      let error = null;
      try {
        const fd = new FormData();
        fd.append('kind', kind);
        fd.append('text', words);
        fd.append('details', capDetails(current()).json);
        const token = typeof api.token === 'function' ? await api.token().catch(() => null) : null;
        if (token) fd.append('token', token);
        if (pics.page) fd.append('page', pics.page.blob, pics.page.name);
        if (pics.game) strips.forEach((b, i) => fd.append(i ? 'game' + (i + 1) : 'game', b, i ? 'game-' + (i + 1) + '.png' : 'game.png'));
        if (pics.popout) fd.append('popout', pics.popout.blob, pics.popout.name);
        const r = await fetch(config.reportUrl, { method: 'POST', body: fd });
        if (!r.ok) {
          let body = null;
          try { body = await r.json(); } catch (e) { /* not the relay talking */ }
          error = (body && typeof body.error === 'string' && body.error) || COPY.failed;
        }
      } catch (e) { error = COPY.failed; }
      sending = false; sendBtn.disabled = false; sendBtn.textContent = COPY.send;
      if (error) { lock(false); say(error); return; }
      close();
      thank(E, config);
    }
    document.body.append(panel);
    document.addEventListener('keydown', onKey);
    text.focus();
  }

  function thank(E, config) {
    const old = document.getElementById('flag-toast');
    if (old) old.remove();
    const toast = E('div', { id: 'flag-toast', role: 'status' }, COPY.thanks,
      config.discordInvite ? E('a', { href: config.discordInvite, target: '_blank', rel: 'noopener' }, COPY.discord) : null);
    document.body.append(toast);
    setTimeout(() => toast.remove(), TOAST_MS);
  }

  window.Flag = { open, details, capDetails };
})();
