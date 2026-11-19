/* Our Solutions: pinned scroll sequence for "Everything you need to transform retail".
   Spec: Figma 342:293.
   - Scrubbed with scroll: scene 1 image rise and scale up, the 45 degree mask, the exit.
   - Timed, triggered by scroll position: intro text in and out, card entrances, dots.
   Scroll speed is never changed; everything is read from the page's own scroll position.
   Reduced motion and ?snapshot=1 keep the stacked layout from the CSS. */
(function () {
  'use strict';

  var section = document.querySelector('[data-sx]');
  if (!section) return;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduced.matches || (window.IKONIC && window.IKONIC.snapshot)) return;

  var stage = section.querySelector('.sx__stage');
  var intro = section.querySelector('.sx__intro');
  var scenes = Array.prototype.slice.call(section.querySelectorAll('.sx__scene'));
  var medias = scenes.map(function (s) { return s.querySelector('.sx__media'); });
  var cards = scenes.map(function (s) { return s.querySelector('.sx__card'); });
  var dotsWrap = section.querySelector('.sx__dots');
  var dots = Array.prototype.slice.call(section.querySelectorAll('.sx__dot'));
  var count = scenes.length;

  /* Timeline, in stage heights of scroll (1 = one viewport).
     0 is the moment the section pins. Tune the feel here. */
  var T = {
    scale: 1,      // scene 2: image grows to full screen
    hold: 0.15,    // full screen, no card yet (about 15vh)
    read: 0.45,    // card 1 on screen before the first mask
    mask: 0.8,     // each 45 degree reveal
    rest: 0.4,     // each card on screen after its reveal
  };
  var maskStart = [];       // start of the mask that brings in scene i (i >= 1)
  var t0 = T.scale + T.hold + T.read;
  for (var i = 1; i < count; i++) maskStart[i] = t0 + (i - 1) * (T.mask + T.rest);
  var total = t0 + (count - 1) * (T.mask + T.rest);   // pinned distance, about 7.6 viewports

  var W = 0, H = 0, unit = 1;
  var REST_W = 640, REST_H = 400, CLIP = 60, RISE = 120, CUT = 96;   // design px at 1440, times unit

  section.classList.add('is-pinned');

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  function measure() {
    W = stage.clientWidth;
    H = stage.clientHeight;
    unit = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--scale')) || 1;
    // Pinned distance + one stage so the sticky stage scrolls away after the last scene
    section.style.height = Math.round((total + 1) * H) + 'px';
  }

  /* Scene 1 image: from 640 x 400 (bottom 60 clipped) to the full stage.
     The 96 cut grows with the image, then eases to 0 so it lands clean on the edges. */
  function drawScale(p) {
    var e = easeOut(clamp(p, 0, 1));
    var w0 = REST_W * unit, h0 = REST_H * unit;
    var x0 = (W - w0) / 2, y0 = H - (REST_H - CLIP) * unit;
    var rise = p < 0 ? RISE * unit * clamp(-p, 0, 1) : 0;   // scrubbed rise while the section scrolls in
    var w = w0 + (W - w0) * e;
    var h = h0 + (H - h0) * e;
    var cut = CUT * unit * (w / w0) * (1 - e);
    var m = medias[0].style;
    m.left = (x0 * (1 - e)) + 'px';
    m.top = (y0 * (1 - e) + rise) + 'px';
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

  var lastCard = -2, lastDot = -2;
  function update() {
    ticking = false;
    var p = -section.getBoundingClientRect().top / H;

    // Intro: fades in as soon as the section is mostly on screen (it already is on load,
    // under the short hero), out as soon as the image starts to grow
    intro.classList.toggle('is-in', p > -0.85);
    intro.classList.toggle('is-out', p > 0.02);

    drawScale(p);

    var progress = [];
    for (var i = 1; i < count; i++) {
      progress[i] = clamp((p - maskStart[i]) / T.mask, 0, 1);
      drawMask(i, progress[i]);
    }

    // Active card: its image has settled, and the next mask has not started
    var card = -1;
    if (p >= T.scale + T.hold) {
      card = 0;
      for (i = 1; i < count; i++) if (progress[i] >= 1) card = i;
      if (card + 1 < count && progress[card + 1] > 0) card = -1;
    }
    if (card !== lastCard) {
      cards.forEach(function (c, n) { c.classList.toggle('is-active', n === card); });
      lastCard = card;
    }

    // Dots: shown once the image fills the screen; hand over at the mask's halfway point
    dotsWrap.classList.toggle('is-visible', p >= T.scale && p < total);
    var dot = 0;
    for (i = 1; i < count; i++) if (progress[i] >= 0.5) dot = i;
    if (dot !== lastDot) {
      dots.forEach(function (d, n) { d.classList.toggle('is-active', n === dot); });
      lastDot = dot;
    }
  }

  var ticking = false;
  function request() {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }

  measure();
  update();
  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', function () { measure(); request(); });
  // If the person turns on reduced motion mid-visit, drop back to the stacked layout
  if (reduced.addEventListener) {
    reduced.addEventListener('change', function (e) { if (e.matches) window.location.reload(); });
  }
})();
