// The window the Grind panel lives in. On the site it is a Document Picture-in-Picture window; in the Windows app (app: the
// bridge) a window of its own the shell makes frameless and transparent, opened with window.open.
// window.GrindOverlay = { create({ strip, home, app, title, setTitle, hide, onClose, onResize, sizeKey, onSettingsClose, passing }) }
//   -> { open(w, h), win(), resize(w, h), fit(), close(), showSettings(el), hideSettings(), settingsOpen() }
// resize(w, h) is always the panel's own area: on the site, while Settings is open under it, the window takes Settings'
// room too. In the app Settings is a small window of its own (titled setTitle), so the overlay keeps its size; closing
// that window is the same as its ×, and onSettingsClose says so. passing() is whether the app passes clicks through to
// the game: then the mouse on one of its buttons lets it take clicks again (app.holdClicks) until the mouse moves off.
// onResize(w, h, key) is a drag on the site: the window settled at a size the page didn't ask for, key being what
// sizeKey() said when it was dragged. The app's overlay can't be dragged (only the page sizes it), so there it never comes.
// The site's pop-out lets a page resize it only just after a press in it, once a press, so a size asked for between presses
// (the first bite of Meat) waits for the next press anywhere in the pop-out. A later size replaces it, and a drag drops it.
// In the app the overlay and Settings windows close when this page goes (a Document PiP window does that by itself).
(function () {
// Settings is never narrower than this
const SET_W = 360;
// what takes a click on the overlay while the rest pass through to the game, and how long after the mouse leaves one the
// clicks go back (the way from ⇆ to its row crosses a gap)
const CLICKABLE = 'button, a, input, select, textarea, label, .g-laypick', GIVE_BACK = 400;
// a press in the pop-out gives what it asked for itself this long to go first (a layout picked resizes 150 ms after its
// click), since it's one resize a press; then a size still waiting goes
const PRESS_ROOM = 250;
// a bridge call as a promise: a method the app doesn't have, or one that throws, is a rejection
const call = (app, name, ...a) => new Promise(res => res(app[name](...a)));
function create(o) {
  const strip = o.strip;
  let pipWin = null, sizeTimer = null;
  // Settings while it's open (grind-settings.js), and the panel's size to go back to when it closes: what the window held
  // when Settings opened (dragged or not), then each size asked for while it's open (a layout picked in Settings). In the
  // app, the window Settings has to itself
  let setEl = null, panel = null, setWin = null;
  // in the app: the mouse on a button is holding the overlay's clicks
  let holding = false;
  // the panel's size the page last asked the window for: a window that settles there was sized by the page, not dragged
  let asked = null;
  // on the site, the size asked for that the window hasn't reached yet, and the press that will try it again
  let unmet = null, pressT = null;
  const reached = (win, s) => Math.abs(win.innerWidth - s[0]) <= 2 && Math.abs(win.innerHeight - s[1]) <= 2;
  // in the app the overlay and Settings are windows of their own, which (unlike the site's pop-out) stay when this page
  // goes: a reload or sign in on Discord would leave them on top of the game, frozen. They go with it (the app closes
  // them too)
  if (o.app) window.addEventListener('pagehide', () => { shutSetWin(); close(); });
  // Settings sits under the panel in the same window (the site), so the panel fits in the room left above it
  const under = () => !!setEl && !o.app;
  // the panel fits the window: as big as its natural size (each tile's text on one line) allows across and down, measured
  // as if the one thing to do weren't there, so the text doesn't change size when it comes and goes (what makes its room is
  // the page's CSS). The panel isn't linear in its font size (its frame and art pixels are whole pixels), so the size from
  // one measure is measured again, up to four times, until it holds, and the biggest size that was measured to fit wins. It
  // may wrap, so the height is checked again at the new size. Settings' room under it is left out
  function fit() {
    const w = strip.ownerDocument.defaultView;
    if (strip.hidden || !w || w === window) return;
    const H = w.innerHeight - (under() ? setEl.offsetHeight : 0), W = w.innerWidth;
    const out = (o.hide ? o.hide() : []).filter(Boolean);
    const was = out.map(e => e.hidden), size = () => strip.getBoundingClientRect();
    const clamp = v => Math.max(8, Math.min(48, v));
    strip.style.minHeight = ''; strip.style.width = 'max-content'; out.forEach(e => { e.hidden = true; });
    let f = 16, best = 0;
    for (let i = 0; i < 4; i++) {
      strip.style.fontSize = f + 'px';
      const nat = size(), next = clamp(f * Math.min(W / nat.width, H / nat.height));
      if (nat.width <= W + 0.5 && nat.height <= H + 0.5) best = Math.max(best, f);
      if (Math.abs(next - f) < 0.01) break;
      f = next;
    }
    // none of the passes measured to fit (the panel isn't smooth in its font size, so they can keep overshooting): measure where
    // it ended, and if that doesn't fit either, search down for a size that does, so a size is only kept once it was measured
    if (!best) {
      strip.style.fontSize = f + 'px';
      const fits = () => { const r = size(); return r.width <= W + 0.5 && r.height <= H + 0.5; };
      if (fits()) best = f;
      else { let lo = 8, hi = f; for (let i = 0; i < 8 && hi - lo > 0.05; i++) { const mid = (lo + hi) / 2; strip.style.fontSize = mid + 'px'; if (fits()) lo = mid; else hi = mid; } best = lo; }
    }
    strip.style.width = ''; out.forEach((e, i) => { e.hidden = was[i]; });
    f = best;
    strip.style.fontSize = f + 'px';
    // the alert's lines wrap differently at each size, so the panel's height isn't a straight line in its font size: the biggest size
    // that fits is searched for between the smallest and the one that didn't
    if (size().height > H + 0.5) {
      let lo = 8, hi = f;
      for (let i = 0; i < 7 && hi - lo > 0.05; i++) { const mid = (lo + hi) / 2; strip.style.fontSize = mid + 'px'; if (size().height <= H + 0.5) lo = mid; else hi = mid; }
      f = lo; strip.style.fontSize = f + 'px';
    }
    // a floating window is a solid rectangle, so the frame reaches its bottom edge: what the font can't use goes inside the panel
    // (spread between its rows), never as a band under it. The app's window is sized to the panel, so it needs none
    if (!o.app) strip.style.minHeight = H + 'px';
  }
  function open(w0, h0) {
    if (o.app) return openApp(w0, h0);
    if (!window.documentPictureInPicture) return Promise.reject(new Error('no-window'));
    asked = [w0, h0];
    return documentPictureInPicture.requestWindow({ width: w0, height: h0 }).then(pip => adopt(pip, 'g-pip'));
  }
  // the app: a window named sixpath-overlay, which the shell makes frameless, transparent and on top of the game. Its
  // closing is seen by pagehide, and should that not come, by the window being closed (checked every second)
  function openApp(w0, h0) {
    // already open: opening a window by the same name again would load a blank page over the panel
    if (pipWin && !pipWin.closed) return Promise.resolve(pipWin);
    let win = null;
    try { win = window.open('about:blank', 'sixpath-overlay', 'width=' + w0 + ',height=' + h0); } catch (e) { /* refused */ }
    if (!win) return Promise.reject(new Error('no-window'));
    adopt(win, 'g-ov');
    // Clicks pass through (Rimmah, 2026-11-04): the app still tells the page where the mouse is, and the mouse on a
    // button (or ⇆'s row of layouts) lets the overlay take the click; off one, the clicks go back to the game GIVE_BACK ms
    // later, so the way from ⇆ over to its pictures keeps them, and the mouse leaving gives them back at once. Alt to click
    // came first and never worked live: the game has the keyboard, so Windows never told the overlay Alt was down (and
    // Alt is the game's jump key). Asked only on a button, so passing() only reads the app's switch from there
    const d = win.document;
    let back = null;
    const giveBack = () => { clearTimeout(back); back = null; hold(false); };
    d.addEventListener('mousemove', e => {
      if (pipWin !== win) return;
      if (e.target.closest && e.target.closest(CLICKABLE) && o.passing && o.passing()) { clearTimeout(back); back = null; hold(true); }
      else if (holding && !back) back = setTimeout(giveBack, GIVE_BACK);
    });
    for (const t of [d, d.documentElement]) t.addEventListener('mouseleave', () => { if (pipWin === win) giveBack(); });
    movable(win);
    const check = setInterval(() => { if (pipWin !== win) clearInterval(check); else if (win.closed) gone(win); }, 1000);
    return Promise.resolve(win);
  }
  // the app's overlay has no frame (Rimmah, 2026-11-04: move it from anywhere): a press anywhere on it but a button, moved
  // a few pixels, takes the window with the mouse. Under that it's still a click. Ends on letting go, and on a move with no
  // button down (a press that ended where the page didn't see it, say outside the window). The app places it (app.moveOverlay; it keeps where it's left): Chromium keeps a page's own window.moveTo on its
  // screen, so the overlay stopped at the screen's edge and never reached a second one. While a move is on its way, only
  // the latest spot waits to go next. An app built before it had moveOverlay: window.moveTo
  function movable(win) {
    const d = win.document;
    let drag = null, busy = false, next = null;
    const end = () => { drag = null; strip.classList.remove('g-moving'); };
    function place(x, y) {
      if (!o.app || typeof o.app.moveOverlay !== 'function') { try { win.moveTo(x, y); } catch (err) { end(); } return; }
      next = [x, y];
      if (busy) return;
      const [a, b] = next; next = null; busy = true;
      call(o.app, 'moveOverlay', a, b).catch(() => {}).then(() => { busy = false; if (next) place(...next); });
    }
    d.addEventListener('pointerdown', e => {
      if (pipWin !== win || e.button !== 0 || !e.isPrimary || (e.target.closest && e.target.closest('button, a, input, select, textarea, label'))) return;
      drag = { x: e.screenX, y: e.screenY, wx: win.screenX, wy: win.screenY, on: false };
      try { e.target.setPointerCapture(e.pointerId); } catch (err) { /* moves still come while the button is down */ }
    });
    d.addEventListener('pointermove', e => {
      if (!drag) return;
      if (!(e.buttons & 1)) return end();
      const dx = e.screenX - drag.x, dy = e.screenY - drag.y;
      if (!drag.on && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
      drag.on = true; strip.classList.add('g-moving');
      place(drag.wx + dx, drag.wy + dy);
    });
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) d.addEventListener(t, end);
  }
  function hold(on) {
    if (on === holding) return;
    holding = on;
    if (!on) { strip.classList.remove('g-hold'); call(o.app, 'holdClicks', false).catch(() => {}); return; }
    // held (g-hold, which lets ⇆'s row show) only once the app says the overlay has the clicks: it may not (its tray
    // turned Clicks pass through off, or the call failed). It asks again once the mouse comes back to a button
    call(o.app, 'holdClicks', true).then(r => { if (r === true && holding) strip.classList.add('g-hold'); }, () => {});
  }
  // a new window takes the page's styles, and is told apart by its body's class (g-pip on the site, g-ov for
  // the app's overlay, g-setwin for the app's Settings)
  function dress(win, cls, title) {
    const d = win.document;
    for (const ss of document.styleSheets) {
      try { const s = d.createElement('style'); s.textContent = Array.from(ss.cssRules).map(r => r.cssText).join('\n'); d.head.append(s); } catch (e) { /* a stylesheet from another site */ }
    }
    // the page swaps its big (over 2 KB) --night-* pictures for blob: addresses (see index.html); the copied rules would bring the
    // data pictures back, and the report picture copies them into every node, so the new window gets the same blobs
    try { const inl = document.documentElement.style; for (let i = 0; i < inl.length; i++) if (inl[i].indexOf('--night-') === 0) d.documentElement.style.setProperty(inl[i], inl.getPropertyValue(inl[i])); } catch (e) { /* the data pictures stay */ }
    d.title = title;
    d.body.className = cls;
    return d;
  }
  // the panel moves into a new window
  function adopt(pip, cls) {
    pipWin = pip;
    const d = dress(pip, cls, o.title);
    strip.hidden = false;
    const wrap = d.createElement('div'); wrap.id = 'view-grind'; wrap.append(strip); d.body.append(wrap);
    pip.addEventListener('pagehide', () => gone(pip));
    if (!o.app) {
      const press = () => {
        clearTimeout(pressT);
        pressT = setTimeout(() => { if (pipWin === pip && unmet && !reached(pip, unmet)) sizeTo(...unmet); }, PRESS_ROOM);
      };
      d.addEventListener('pointerup', press, true);
      d.addEventListener('keydown', press, true);
    }
    // resized: fit to it. Dragged to a new size: tell the page once it has settled, with what the window showed when it
    // was dragged (a ⇆ Layout click meanwhile doesn't move it to the next layout). Not a size the page asked for (its
    // own resizes aren't drags), not while Settings is open (that size has Settings in it, and isn't the panel's), and
    // never in the app, whose overlay only the page sizes
    pip.addEventListener('resize', () => {
      fit();
      if (unmet && reached(pip, unmet)) unmet = null;
      if (o.app || !o.onResize) return;
      const key = o.sizeKey ? o.sizeKey() : null;
      clearTimeout(sizeTimer);
      sizeTimer = setTimeout(() => {
        if (pipWin !== pip || setEl) return;
        const w = pip.innerWidth, h = pip.innerHeight;
        if (asked && Math.abs(w - asked[0]) <= 2 && Math.abs(h - asked[1]) <= 2) return;
        asked = null; unmet = null;   // it's at the dragged size now
        o.onResize(w, h, key);
      }, 400);
    });
    fit();
    return pip;
  }
  // the window closed: the panel goes back to the page (once, however it was seen), and Settings closes with it
  function gone(pip) {
    if (pipWin !== pip) return;
    pipWin = null; strip.hidden = true; strip.style.fontSize = '';
    clearTimeout(sizeTimer); clearTimeout(pressT); asked = null; unmet = null;
    if (holding) { holding = false; strip.classList.remove('g-hold'); }   // its window is gone, and the app's hold with it
    if (setEl) { setEl.remove(); setEl = null; }   // it opens next time without
    shutSetWin();
    o.home.append(strip); if (o.onClose) o.onClose();
  }
  // a click lets the window resize itself; the frame around the page is added on
  function sizeWin(win, w, h) {
    const fw = Math.max(0, Math.min(40, win.outerWidth - win.innerWidth)), fh = Math.max(0, Math.min(80, win.outerHeight - win.innerHeight));
    try { win.resizeTo(w + fw, h + fh); return true; } catch (e) { return false; /* this browser won't: it can be dragged to size */ }
  }
  // the overlay at the panel's w × h (with Settings' room, while it's under it): kept as the size asked for
  const sizeTo = (w, h) => {
    asked = [w, h];
    clearTimeout(sizeTimer);   // a window settling at the size asked for before isn't a drag away from this one
    if (!o.app) unmet = reached(pipWin, asked) ? null : asked;
    return sizeWin(pipWin, w, h);
  };
  // the window for a panel of w × h with Settings under it: at least Settings' width, and Settings' height measured at the
  // width the window will have (its sections sit side by side when there's room)
  function withSettings(w, h) {
    const W = Math.max(w, SET_W);
    setEl.style.width = W + 'px';
    const sh = setEl.offsetHeight;
    setEl.style.width = '';
    return [W, h + sh];
  }
  function resize(w, h) {
    if (!pipWin) return false;
    panel = [w, h];
    return under() ? sizeTo(...withSettings(w, h)) : sizeTo(w, h);
  }
  // Settings: on the site under the panel, inside the pop-out, which grows to fit it; hideSettings() shrinks it back to
  // the panel. In the app, a window of its own
  // the app's Settings is a window of its own, so it opens with no overlay too (the main window's ⚙), and asked again it
  // comes to the front
  function showSettings(el) {
    if (!pipWin && !o.app) return false;
    if (setEl) { if (setWin && !setWin.closed) try { setWin.focus(); } catch (e) { /* it's there, just not raised */ } return true; }
    if (o.app) return openSetWin(el);
    panel = unmet || [pipWin.innerWidth, pipWin.innerHeight];
    setEl = el;
    strip.after(el);
    sizeTo(...withSettings(panel[0], panel[1]));
    fit();
    return true;
  }
  // the app's Settings window, named sixpath-settings (the shell puts it beside the overlay): as tall as Settings measures
  // on this page at its width, then as tall as it really is once its fonts are in, and again whenever that changes (the
  // version line arriving, signing in or out)
  function openSetWin(el) {
    el.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden;width:' + SET_W + 'px';
    document.body.append(el);
    const h = Math.ceil(el.getBoundingClientRect().height) || 480;
    el.remove(); el.style.cssText = '';
    let win = null;
    try { win = window.open('about:blank', 'sixpath-settings', 'width=' + SET_W + ',height=' + h); } catch (e) { /* refused */ }
    if (!win) return false;
    setWin = win; setEl = el;
    const d = dress(win, 'g-setwin', o.setTitle || o.title);
    d.body.append(el);
    const fitSet = () => {
      if (setWin !== win || setEl !== el || win.closed) return;
      const want = Math.ceil(el.getBoundingClientRect().height);
      if (want > 0 && Math.abs(want - win.innerHeight) > 1) sizeWin(win, SET_W, want);
    };
    try { new win.ResizeObserver(fitSet).observe(el); } catch (e) { /* sized once, below */ }
    try { d.fonts.ready.then(fitSet, () => {}); } catch (e) { fitSet(); }
    win.addEventListener('pagehide', () => setGone(win));
    const check = setInterval(() => { if (setWin !== win) clearInterval(check); else if (win.closed) setGone(win); }, 1000);
    return true;
  }
  // the app's Settings window closed by itself (the app, or Alt+F4): the same as its ×
  function setGone(win) {
    if (setWin !== win) return;
    setWin = null;
    hideSettings();
    if (o.onSettingsClose) o.onSettingsClose();
  }
  function shutSetWin() {
    const w = setWin;
    setWin = null;
    if (w && !w.closed) try { w.close(); } catch (e) { /* already going */ }
  }
  function hideSettings() {
    if (!setEl) return;
    try { setEl.remove(); } catch (e) { /* its window is gone */ }
    setEl = null;
    if (o.app) { shutSetWin(); return; }   // the overlay keeps its size: Settings wasn't in it
    if (pipWin && panel) sizeTo(panel[0], panel[1]);
    fit();
  }
  const close = () => { if (pipWin) { try { pipWin.close(); } catch (e) { /* already gone */ } } };
  return { open, win: () => pipWin, resize, fit, close, showSettings, hideSettings, settingsOpen: () => !!setEl };
}
window.GrindOverlay = { create };
})();
