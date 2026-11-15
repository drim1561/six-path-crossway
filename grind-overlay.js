// The window the Grind panel lives in. On the site it is a Document Picture-in-Picture window; in the Windows app (app: the
// bridge) a window of its own the shell makes frameless and transparent, opened with window.open.
// window.GrindOverlay = { create({ strip, home, app, title, setTitle, width, room, font, wide, hide, alert, onClose, onSettingsClose, passing }) }
//   -> { open(), win(), resize(w, h), fit(), close(), showSettings(el), hideSettings(), swapSettings(el), settingsOpen(), solid() }
// The window fits what's showing (round 2): fit() measures the panel as it is now, open or closed, at the width width()
// asks for (its text sized so its longest lines fill it), and the window becomes the panel plus room, a fixed space above
// it for the mushroom and its bubble (the room is the page's own, above the panel: on the site the pop-out's body color,
// in the app see-through). Nothing in it is kept: a window dragged to another size goes back to the panel's on the next
// fit. resize(w, h) is the panel's own area: on the site, while Settings is open under it, the window takes Settings' room
// too. In the app Settings is a small window of its own (titled setTitle), so the overlay keeps its size; closing that
// window is the same as its ×, and onSettingsClose says so. passing() is whether the app passes clicks through to the
// game: then the mouse on one of its buttons lets it take clicks again (app.holdClicks) until the mouse moves off
// (passing(false) only looks, without asking the app). In the app the panel is g-solid while the mouse or keyboard focus is
// in the overlay, so See-through rests only while it's left alone; never while clicks pass through, since then the mouse
// can't be seen there. solid() looks again, after the page's pass setting changes.
// The site's pop-out lets a page resize it only just after a press in it, once a press, so a size asked for between presses
// (the first bite of Meat) waits for the next press anywhere in the pop-out, and a later size replaces it. Until it comes,
// a panel taller than its window takes a smaller font rather than being cut off.
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
  const strip = o.strip, room = Math.max(0, Math.round(o.room || 0));
  let pipWin = null;
  // Settings while it's open (grind-settings.js), and in the app the window Settings has to itself
  let setEl = null, setWin = null;
  // in the app: the mouse on a button is holding the overlay's clicks
  let holding = false;
  // in the app: puts g-solid on the panel or takes it off (a no-op while no app window is open)
  let solidNow = () => {};
  // on the site, the size asked for that the window hasn't reached yet, and the press that will try it again. onWay is a
  // size the window took the ask for (resizeTo didn't refuse) and hasn't reached yet: a real pop-out resizes a moment later,
  // so the panel keeps its font for it rather than squeezing into the old size first, and isn't asked again for the same
  // size meanwhile (in the app every render fits). On the site, if the window still hasn't got there PRESS_ROOM later
  // (waitT), it squeezes after all
  let unmet = null, pressT = null, onWay = null, waitT = null;
  const reached = (win, s) => Math.abs(win.innerWidth - s[0]) <= 2 && Math.abs(win.innerHeight - s[1]) <= 2;
  const same = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1];
  // in the app the overlay and Settings are windows of their own, which (unlike the site's pop-out) stay when this page
  // goes: a reload or sign in on Discord would leave them on top of the game, frozen. They go with it (the app closes
  // them too)
  if (o.app) window.addEventListener('pagehide', () => { shutSetWin(); close(); });
  // Settings sits under the panel in the same window (the site), so the window holds both
  const under = () => !!setEl && !o.app;
  const size = () => strip.getBoundingClientRect();
  // the panel's natural size, in whichever page holds it: the font that makes its longest lines (each tile's text on one
  // line, the hide() parts left out, laid out the way wide() sets it and puts back) as wide as width() asks, never over
  // font(), then its height at that font as it is now, laid out as wide as its window will be, measured as if the one thing
  // to do (alert()) weren't there, so the window and the text keep their size when it comes and goes (what makes its room
  // is the page's CSS; one that needs more than that gets it). The panel isn't linear in its font size (its frame and art
  // pixels are whole pixels), so the size from one measure is measured again, up to four times, until it holds, and the
  // biggest size that was measured to fit wins. Leaves the panel at that font, at least as tall as without the alert.
  // -> [w, h]
  function measure() {
    const W = Math.max(1, Math.round(o.width ? o.width() : strip.ownerDocument.defaultView.innerWidth));
    const out = (o.hide ? o.hide() : []).filter(Boolean), was = out.map(e => e.hidden), undo = o.wide ? o.wide() : null;
    const top = Math.max(8, Math.min(48, o.font ? o.font() : 48)), clamp = v => Math.max(8, Math.min(top, v));
    strip.style.minHeight = ''; strip.style.width = 'max-content'; out.forEach(e => { e.hidden = true; });
    let f = Math.min(16, top), best = 0;
    for (let i = 0; i < 4; i++) {
      strip.style.fontSize = f + 'px';
      const nat = size(), next = clamp(f * W / nat.width);
      if (nat.width <= W + 0.5) best = Math.max(best, f);
      if (Math.abs(next - f) < 0.01) break;
      f = next;
    }
    // none of the passes measured to fit (the panel isn't smooth in its font size, so they can keep overshooting): measure where
    // it ended, and if that doesn't fit either, search down for a size that does, so a size is only kept once it was measured
    if (!best) {
      strip.style.fontSize = f + 'px';
      const fits = () => size().width <= W + 0.5;
      if (fits()) best = f;
      else { let lo = 8, hi = f; for (let i = 0; i < 8 && hi - lo > 0.05; i++) { const mid = (lo + hi) / 2; strip.style.fontSize = mid + 'px'; if (fits()) lo = mid; else hi = mid; } best = lo; }
    }
    out.forEach((e, i) => { e.hidden = was[i]; });
    if (undo) undo();
    strip.style.fontSize = best + 'px';
    strip.style.width = (under() ? Math.max(W, SET_W) : W) + 'px';
    const al = o.alert ? o.alert() : null, alWas = al ? al.hidden : true;
    if (al) al.hidden = true;
    const h0 = Math.ceil(size().height);
    if (al) al.hidden = alWas;
    const h = Math.max(h0, Math.ceil(size().height));
    strip.style.width = '';
    strip.style.minHeight = h0 + 'px';
    return [W, h];
  }
  // the panel fits its window, and the window the panel: as wide as width() asks, as tall as the panel, open or closed, with
  // the room above it (and Settings under it on the site)
  function fit() {
    const w = strip.ownerDocument.defaultView;
    if (!pipWin || strip.hidden || !w || w === window) return;
    const [pw, ph] = measure(), want = outer(pw, ph);
    if (reached(pipWin, want)) { unmet = null; onWay = null; }
    else if (!same(onWay, want) && !same(unmet, want)) sizeTo(...want);
    if (unmet && !same(onWay, unmet)) squeeze();
  }
  // the site's pop-out short of its size (waiting for a press, or dragged smaller): the panel takes a smaller font until it
  // fits what the window has across (its longest lines, the hide() parts left out) and down, rather than being cut off
  function squeeze() {
    const W = pipWin.innerWidth, H = pipWin.innerHeight - room - (under() ? setEl.offsetHeight : 0);
    const out = (o.hide ? o.hide() : []).filter(Boolean), was = out.map(e => e.hidden);
    const across = () => {
      strip.style.width = 'max-content'; out.forEach(e => { e.hidden = true; });
      const w = size().width;
      strip.style.width = ''; out.forEach((e, i) => { e.hidden = was[i]; });
      return w;
    };
    const over = () => across() > W + 0.5 || size().height > H + 0.5;
    if (!over()) return;
    strip.style.minHeight = '';
    if (!over()) return;
    let lo = 8, hi = parseFloat(strip.style.fontSize) || 16;
    for (let i = 0; i < 7 && hi - lo > 0.05; i++) { const mid = (lo + hi) / 2; strip.style.fontSize = mid + 'px'; if (over()) hi = mid; else lo = mid; }
    strip.style.fontSize = lo + 'px';
  }
  // the window's first size, measured on this page before it opens (the site's pop-out can only be sized again after a press in
  // it): the panel laid out off screen for a moment. Where it can't be (the Grind tab not showing) it opens at width() and a
  // guess, then fits itself (in the app at once, on the site at the first press)
  function firstSize() {
    const keep = strip.hidden, st = strip.style, pos = [st.position, st.left, st.top, st.visibility];
    let s = null;
    strip.hidden = false;
    st.position = 'absolute'; st.left = '-10000px'; st.top = '0'; st.visibility = 'hidden';
    try { if (strip.getClientRects().length) s = measure(); } catch (e) { s = null; }
    [st.position, st.left, st.top, st.visibility] = pos;
    strip.hidden = keep; st.fontSize = ''; st.minHeight = '';
    const W = Math.round(o.width ? o.width() : 300);
    return s && s[1] > 0 ? outer(s[0], s[1]) : [W, Math.round(W * 1.6) + room];
  }
  function open() {
    if (o.app) return openApp();
    if (!window.documentPictureInPicture) return Promise.reject(new Error('no-window'));
    const [w0, h0] = firstSize();
    return documentPictureInPicture.requestWindow({ width: w0, height: h0 }).then(pip => adopt(pip, 'g-pip'));
  }
  // the app: a window named sixpath-overlay, which the shell makes frameless, transparent and on top of the game. Its
  // closing is seen by pagehide, and should that not come, by the window being closed (checked every second)
  function openApp() {
    // already open: opening a window by the same name again would load a blank page over the panel
    if (pipWin && !pipWin.closed) return Promise.resolve(pipWin);
    const [w0, h0] = firstSize();
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
    // solid under the mouse or keyboard focus (only focus the keyboard moved, not a button's leftover focus after a click),
    // and at rest while clicks pass through whatever the page last saw. The focus is looked up each time, not kept, so a
    // focused button that goes (a tile redrawn, Settings closed) can't leave the panel solid
    let over = false;
    const focused = () => { const a = d.activeElement; return !!a && a !== d.body && strip.contains(a) && !!a.matches && a.matches(':focus-visible'); };
    solidNow = () => {
      const pass = !!(o.passing && o.passing(false));
      if (pass) over = false;
      strip.classList.toggle('g-solid', pipWin === win && !pass && (over || focused()));
    };
    d.addEventListener('mousemove', e => {
      if (pipWin !== win) return;
      if (e.target.closest && e.target.closest(CLICKABLE) && o.passing && o.passing()) { clearTimeout(back); back = null; hold(true); }
      else if (holding && !back) back = setTimeout(giveBack, GIVE_BACK);
      if (!over) { over = true; solidNow(); }
    });
    for (const t of [d, d.documentElement]) t.addEventListener('mouseleave', () => { if (pipWin === win) { giveBack(); over = false; solidNow(); } });
    // (during focusout the focus is on its way, so activeElement is the body: the focusin after it looks again)
    for (const t of ['focusin', 'focusout']) d.addEventListener(t, () => { if (pipWin === win) solidNow(); });
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
    // the room above the panel is the page's own: on the site the pop-out's body color shows through it, in the app it's clear
    // (--room tells the mushroom's box how tall the room is)
    const wrap = d.createElement('div'); wrap.id = 'view-grind'; wrap.style.paddingTop = room + 'px'; wrap.style.setProperty('--room', room + 'px');
    wrap.append(strip); d.body.append(wrap);
    pip.addEventListener('pagehide', () => gone(pip));
    if (!o.app) {
      const press = () => {
        clearTimeout(pressT);
        pressT = setTimeout(() => { if (pipWin === pip && unmet && !reached(pip, unmet)) sizeTo(...unmet); }, PRESS_ROOM);
      };
      d.addEventListener('pointerup', press, true);
      d.addEventListener('keydown', press, true);
    }
    // resized (by the page, or dragged): fit again. A drag isn't kept: the window goes back to the panel's size (on the
    // site at the next press, the panel squeezed into the dragged window until then)
    // A resize on the site clears onWay only once it reaches it (waitT covers one that never does); in the app any resize does,
    // so a window dragged or held short is asked again
    pip.addEventListener('resize', () => {
      if (unmet && reached(pip, unmet)) unmet = null;
      if (onWay && (o.app || reached(pip, onWay))) onWay = null;
      fit();
    });
    fit();
    return pip;
  }
  // the window closed: the panel goes back to the page (once, however it was seen), and Settings closes with it
  function gone(pip) {
    if (pipWin !== pip) return;
    pipWin = null; strip.hidden = true; strip.style.fontSize = ''; strip.style.minHeight = '';
    clearTimeout(pressT); clearTimeout(waitT); unmet = null; onWay = null;
    if (holding) { holding = false; strip.classList.remove('g-hold'); }   // its window is gone, and the app's hold with it
    strip.classList.remove('g-solid'); solidNow = () => {};
    if (setEl) { setEl.remove(); setEl = null; }   // it opens next time without
    shutSetWin();
    o.home.append(strip); if (o.onClose) o.onClose();
  }
  // a click lets the window resize itself; the frame around the page is added on
  function sizeWin(win, w, h) {
    const fw = Math.max(0, Math.min(40, win.outerWidth - win.innerWidth)), fh = Math.max(0, Math.min(80, win.outerHeight - win.innerHeight));
    try { win.resizeTo(w + fw, h + fh); return true; } catch (e) { return false; /* this browser won't: it can be dragged to size */ }
  }
  // the window at w × h, the whole of it: on the site kept as the size still to reach until the window has it, and while an
  // ask it took is on its way, kept as onWay (on the site with waitT, which squeezes if it never comes)
  const sizeTo = (w, h) => {
    const pip = pipWin, s = [w, h];
    if (!o.app) unmet = reached(pip, s) ? null : s;
    const ok = sizeWin(pip, w, h);
    if (reached(pip, s)) { unmet = null; onWay = null; }
    else onWay = ok ? s : null;
    if (onWay && !o.app) {
      clearTimeout(waitT);
      waitT = setTimeout(() => { if (pipWin === pip && same(onWay, s)) { onWay = null; fit(); } }, PRESS_ROOM);
    }
    return ok;
  };
  // the window for a panel of w × h: the room above it, and on the site with Settings under it, at least Settings' width and
  // Settings' height measured at the width the window will have (its sections sit side by side when there's room)
  function outer(w, h) {
    if (!under()) return [w, h + room];
    const W = Math.max(w, SET_W);
    setEl.style.width = W + 'px';
    const sh = setEl.offsetHeight;
    setEl.style.width = '';
    return [W, h + sh + room];
  }
  function resize(w, h) {
    if (!pipWin) return false;
    return sizeTo(...outer(w, h));
  }
  // Settings: on the site under the panel, inside the pop-out, which grows to fit it; hideSettings() shrinks it back to
  // the panel. In the app, a window of its own
  // the app's Settings is a window of its own, so it opens with no overlay too (the main window's ⚙), and asked again it
  // comes to the front
  function showSettings(el) {
    if (!pipWin && !o.app) return false;
    if (setEl) { if (setWin && !setWin.closed) try { setWin.focus(); } catch (e) { /* it's there, just not raised */ } return true; }
    if (o.app) return openSetWin(el);
    setEl = el;
    strip.after(el);
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
    fit();
  }
  // el takes the place of what's open under the panel (Feeling wonky?'s form for Settings) in one go: on the site with one
  // fit, since the pop-out takes one resize a press, and a fit for Settings closing first would spend it on the panel alone
  // and leave el squeezed. In the app, or with nothing open, it's hideSettings() then showSettings(el)
  function swapSettings(el) {
    if (!setEl || o.app) { hideSettings(); return showSettings(el); }
    try { setEl.remove(); } catch (e) { /* gone already */ }
    setEl = el;
    strip.after(el);
    fit();
    return true;
  }
  const close = () => { if (pipWin) { try { pipWin.close(); } catch (e) { /* already gone */ } } };
  return { open, win: () => pipWin, resize, fit, close, showSettings, hideSettings, swapSettings, settingsOpen: () => !!setEl, solid: () => solidNow() };
}
window.GrindOverlay = { create };
})();
