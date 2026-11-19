/* Our Solutions: pinned scroll sequence for "Everything you need to transform retail".
   Spec: Figma 342:293, plus feedback after review.

   The sequence has anchors at whole numbers of stage heights of scroll (p):
     p 0     intro: empty stage, copy fades in, then the image rises from below
     p 1     image is full screen, card 1
     p 2..6  a 45 degree mask reveals the next image, card 2..6
   The page always comes to rest on an anchor. One gesture (wheel swipe, key press or
   touch swipe) moves one anchor, and further input is ignored until the card has had
   time to appear. The movement between anchors is still real scrolling: the scale-up and
   the mask are scrubbed by the scroll position, so they follow it exactly.
   Outside the sequence (above the section and after the last card) scrolling is native.
   Reduced motion and ?snapshot=1 keep the stacked layout from the CSS. */
(function () {
  'use strict';

  var section = document.querySelector('[data-sx]');
  if (!section) return;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduced.matches || (window.IKONIC && window.IKONIC.snapshot)) return;

  var stage = section.querySelector('.sx__stage');
  var scenes = Array.prototype.slice.call(section.querySelectorAll('.sx__scene'));
  var medias = scenes.map(function (s) { return s.querySelector('.sx__media'); });
  var cards = scenes.map(function (s) { return s.querySelector('.sx__card'); });
  var dotsWrap = section.querySelector('.sx__dots');
  var dots = Array.prototype.slice.call(section.querySelectorAll('.sx__dot'));
  var count = scenes.length;            // 6 scenes, anchors 0..6

  /* Feel. Tune here. */
  var TWEEN = 1000;         // ms to travel one anchor (the mask sweep)
  var DWELL = 1000;         // ms after arriving before the next step is accepted (card in: 300 delay + 500)
  var INTRO_DWELL = 1500;   // after arriving at the intro (copy fades in, then the image rises)
  var GAP = 120;            // ms without input that ends a gesture (trackpad momentum counts as one)
  var EPS = 0.02;           // how close to a whole number counts as "on the anchor"

  var REST_W = 640, REST_H = 400, CLIP = 60, CUT = 96;   // design px at 1440, times unit

  var W = 0, H = 0, unit = 1;
  var tweening = false, busyUntil = 0, consumed = false, lastInput = 0;
  var settleTimer = 0, ticking = false;
  var lastCard = -2, lastDot = -2;

  section.classList.add('is-pinned');

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function pos() { return -section.getBoundingClientRect().top / H; }

  function measure() {
    W = stage.clientWidth;
    H = stage.clientHeight;
    unit = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--scale')) || 1;
    // Pinned distance (count stage heights) + one stage so it scrolls away after the last card
    section.style.height = Math.round((count + 1) * H) + 'px';
  }

  /* Scene 1 image: 640 x 400 with 60 clipped by the bottom edge, growing to the full stage.
     The 96 cut grows with the image, then eases to 0 so it lands clean on the edges. */
  function drawScale(p) {
    var e = easeOut(clamp(p, 0, 1));
    var w0 = REST_W * unit, h0 = REST_H * unit;
    var x0 = (W - w0) / 2, y0 = H - (REST_H - CLIP) * unit;
    var w = w0 + (W - w0) * e;
    var h = h0 + (H - h0) * e;
    var cut = CUT * unit * (w / w0) * (1 - e);
    var m = medias[0].style;
    m.left = (x0 * (1 - e)) + 'px';
    m.top = (y0 * (1 - e)) + 'px';
    m.width = w + 'px';
    m.height = h + 'px';
    m.clipPath = 'polygon(' + cut + 'px 0, 100% 0, 100% 100%, 0 100%, 0 ' + cut + 'px)';
  }

  /* 45 degree mask: the edge runs from bottom right to top left, linear with scroll.
     Everything right of / below the line x + y = d is revealed; d goes from W + H to 0. */
  function drawMask(i, t) {
    var m = medias[i].style;
    if (t <= 0) { m.visibility = 'hidden'; return; }
    m.visibility = 'visible';
    var d = (1 - t) * (W + H);
    m.clipPath = 'polygon(' + d + 'px 0, ' + (W + H) + 'px 0, ' + (W + H) + 'px ' + H + 'px, ' + (d - H) + 'px ' + H + 'px)';
  }

  function update() {
    ticking = false;
    var p = pos();

    // Intro: arrives with the pinned, empty stage; copy fades in, image follows (CSS delay).
    // Both go as soon as the image starts to grow.
    section.classList.toggle('is-in', p > -0.12);
    section.classList.toggle('is-out', p > EPS);

    drawScale(p);

    var progress = [];
    for (var i = 1; i < count; i++) {
      progress[i] = clamp(p - i, 0, 1);
      drawMask(i, progress[i]);
    }

    // Card k belongs to anchor k + 1. It shows once its image has landed and leaves as the next mask starts
    var card = -1;
    for (i = 0; i < count; i++) {
      var a = i + 1;
      if (p >= a - 0.01 && (i === count - 1 || p < a + 0.2)) card = i;
    }
    if (card !== lastCard) {
      cards.forEach(function (c, n) { c.classList.toggle('is-active', n === card); });
      lastCard = card;
    }

    // Dots: shown once the image fills the screen; hand over at the mask's halfway point
    dotsWrap.classList.toggle('is-visible', p >= 0.95);
    var dot = 0;
    for (i = 1; i < count; i++) if (progress[i] >= 0.5) dot = i;
    if (dot !== lastDot) {
      dots.forEach(function (d, n) { d.classList.toggle('is-active', n === dot); });
      lastDot = dot;
    }
  }

  function request() {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }

  /* --- Moving between anchors ------------------------------------------------ */
  function go(k) {
    var rect = section.getBoundingClientRect();
    var from = window.pageYOffset;
    var to = Math.round(from + rect.top + k * H);
    var root = document.documentElement;
    if (Math.abs(to - from) < 1) { busyUntil = performance.now() + (k === 0 ? INTRO_DWELL : DWELL); return; }
    tweening = true;
    root.style.scrollBehavior = 'auto';     // the page has smooth scrolling on; it must not fight the tween
    var start = performance.now();
    (function frame(now) {
      var t = clamp((now - start) / TWEEN, 0, 1);
      window.scrollTo(0, from + (to - from) * easeInOut(t));
      if (t < 1) { requestAnimationFrame(frame); return; }
      window.scrollTo(0, to);
      root.style.scrollBehavior = '';
      tweening = false;
      busyUntil = performance.now() + (k === 0 ? INTRO_DWELL : DWELL);
    })(start);
  }

  /* What should an input of this direction and size do right now?
     Returns null for "let the browser scroll", or the anchor to go to. */
  function decide(dir, dyPx) {
    var p = pos();
    var dp = dyPx / H;
    var r = Math.round(p);
    var onAnchor = Math.abs(p - r) < EPS;
    if (dir > 0) {
      if (p < -EPS) return (p + dp >= 0) ? 0 : null;           // arriving from above: stop on the intro
      if (p < count - EPS) return clamp(onAnchor ? r + 1 : Math.ceil(p), 0, count);
      return null;                                              // leaving after the last card
    }
    if (p > count + EPS) return (p + dp <= count) ? count : null; // arriving from below: stop on the last card
    if (p > EPS) return clamp(onAnchor ? r - 1 : Math.floor(p), 0, count);
    return null;                                                // leaving above the intro
  }

  function handle(e, dir, dyPx, isNewGesture) {
    if (isNewGesture) consumed = false;
    var target = decide(dir, dyPx);
    if (target === null) return;
    e.preventDefault();
    var now = performance.now();
    var arriving = (target === 0 && pos() < -EPS) || (target === count && pos() > count + EPS);
    if (tweening || now < busyUntil) return;
    if (consumed && !arriving) return;
    consumed = true;
    go(target);
  }

  function onWheel(e) {
    if (e.ctrlKey || !e.deltaY || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
    var dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * H : e.deltaY;
    var now = performance.now();
    var fresh = now - lastInput > GAP;
    lastInput = now;                       // dropped events still count, so momentum never starts a new gesture
    handle(e, dy > 0 ? 1 : -1, dy, fresh);
  }

  function onKey(e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    var t = e.target;
    if (t && /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(t.tagName) && e.key === ' ') return;
    var dir = 0, dy = 0;
    if (e.key === 'ArrowDown') { dir = 1; dy = 48; }
    else if (e.key === 'ArrowUp') { dir = -1; dy = 48; }
    else if (e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) { dir = 1; dy = H * 0.9; }
    else if (e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) { dir = -1; dy = H * 0.9; }
    if (!dir) return;
    handle(e, dir, dy, !e.repeat);
  }

  var touchY = null, touchDone = false;
  function onTouchStart(e) {
    touchY = e.touches.length === 1 ? e.touches[0].clientY : null;
    touchDone = false;
    consumed = false;
  }
  function onTouchMove(e) {
    if (touchY === null) return;
    var dy = touchY - e.touches[0].clientY;      // positive: finger moves up, page scrolls down
    var dir = dy > 0 ? 1 : -1;
    if (decide(dir, dy) === null) return;        // native scroll outside the sequence
    e.preventDefault();
    if (touchDone || Math.abs(dy) < 28) return;
    touchDone = true;
    handle(e, dir, dy, false);
  }

  // Anything else that moves the page (scrollbar drag, find in page, anchor links) is settled onto the nearest anchor
  function settle() {
    if (tweening || performance.now() < busyUntil) return;
    var p = pos();
    if (p <= EPS || p >= count - EPS) return;
    var r = Math.round(p);
    if (Math.abs(p - r) > EPS) go(r);
  }
  function onScroll() {
    request();
    clearTimeout(settleTimer);
    settleTimer = setTimeout(settle, 180);
  }

  measure();
  update();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function () { measure(); request(); });
  window.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', function () { consumed = false; });
  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  // If the person turns on reduced motion mid-visit, drop back to the stacked layout
  if (reduced.addEventListener) {
    reduced.addEventListener('change', function (e) { if (e.matches) window.location.reload(); });
  }
})();
