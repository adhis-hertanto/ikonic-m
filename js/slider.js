/* Capabilities slider (Figma 353:285).
   Three slides are visible: the active one (640 x 442, cut 96) in the centre and its neighbours
   (296 x 204, cut 56) at the sides. The slides loop. Everything is driven by one number, `pos`
   (the slide index as a float), so dragging, buttons, dots and keys all share the same layout.
   Dragging shows a "Drag" cursor over the stage on devices with a mouse. */
(function () {
  'use strict';

  var root = document.querySelector('[data-slider]');
  if (!root) return;

  var stage = root.querySelector('[data-slider-stage]');
  var slides = Array.prototype.slice.call(root.querySelectorAll('[data-slide]'));
  var descs = Array.prototype.slice.call(root.querySelectorAll('[data-slide-desc]'));
  var dots = Array.prototype.slice.call(root.querySelectorAll('[data-slide-dot]'));
  var prevBtn = root.querySelector('[data-slider-prev]');
  var nextBtn = root.querySelector('[data-slider-next]');
  var n = slides.length;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    (window.IKONIC && window.IKONIC.snapshot);

  /* Design values at 1440, multiplied by --scale (see tokens.css) */
  var D = { aw: 640, ah: 442, sw: 296, sh: 204, st: 119, ac: 96, sc: 56, gap: 32 };
  var SETTLE = 600;            // ms to settle after a drag or click
  var DRAG_START = 5;          // px before a press becomes a drag
  var u = 1, SW = 0, step = 1;
  var pos = 0, current = -1;
  var anim = null;

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function mod(v, m) { return ((v % m) + m) % m; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  function measure() {
    u = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--scale')) || 1;
    SW = stage.clientWidth;
    step = (SW - D.aw * u) / 2;       // how far a slide travels between two slots
    render();
  }

  /* Frame of slide i for offset d from the active position: -1 left slot, 0 centre, 1 right slot.
     Between slots it interpolates size, place and cut; past a slot it slides out and fades. */
  function render() {
    for (var i = 0; i < n; i++) {
      var d = mod(i - pos + n / 2, n) - n / 2;      // -n/2 .. n/2
      var ad = Math.abs(d), t = Math.min(ad, 1), s = Math.max(0, ad - 1);
      var x0 = (SW - D.aw * u) / 2;
      var xs = d < 0 ? 0 : SW - D.sw * u;
      var w = (D.aw + (D.sw - D.aw) * t) * u;
      var h = (D.ah + (D.sh - D.ah) * t) * u;
      var x = x0 + (xs - x0) * t + (d < 0 ? -1 : 1) * s * (D.sw + D.gap) * u;
      var y = D.st * u * t;
      var cut = (D.ac + (D.sc - D.ac) * t) * u;
      var el = slides[i], st = el.style;
      st.left = x + 'px';
      st.top = y + 'px';
      st.width = w + 'px';
      st.height = h + 'px';
      st.clipPath = 'polygon(' + cut + 'px 0, 100% 0, 100% 100%, 0 100%, 0 ' + cut + 'px)';
      st.opacity = clamp(1 - s, 0, 1);
      st.zIndex = Math.round(100 - ad * 10);
      el.classList.toggle('is-near', ad < 2);
      var fade = clamp(1 - ad * 1.6, 0, 1);          // title and scrim belong to the centre slide
      el.querySelector('.slider__title').style.opacity = fade;
      el.querySelector('.slider__scrim').style.opacity = fade;
      el.setAttribute('aria-hidden', ad < 0.5 ? 'false' : 'true');
    }
    var now = mod(Math.round(pos), n);
    if (now !== current) {
      current = now;
      descs.forEach(function (p, k) { p.classList.toggle('is-active', k === now); });
      dots.forEach(function (b, k) {
        b.classList.toggle('is-active', k === now);
        if (k === now) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
      });
    }
  }

  /* --- Moving ---------------------------------------------------------------- */
  function stop() { if (anim) { cancelAnimationFrame(anim); anim = null; } }

  function goTo(target) {
    stop();
    if (reduced) { pos = target; render(); return; }
    var from = pos, start = performance.now();
    (function frame(now) {
      var t = clamp((now - start) / SETTLE, 0, 1);
      pos = from + (target - from) * easeOut(t);
      render();
      anim = t < 1 ? requestAnimationFrame(frame) : null;
    })(start);
  }
  function by(k) { goTo(Math.round(pos) + k); }
  function toIndex(i) {
    var cur = Math.round(pos);
    var delta = mod(i - cur + n / 2, n) - n / 2;
    goTo(cur + delta);
  }

  prevBtn.addEventListener('click', function () { by(-1); });
  nextBtn.addEventListener('click', function () { by(1); });
  dots.forEach(function (b, k) { b.addEventListener('click', function () { toIndex(k); }); });
  root.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') { by(-1); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { by(1); e.preventDefault(); }
  });

  /* --- Drag -------------------------------------------------------------------- */
  var down = null, dragging = false, moved = false, samples = [];

  function onDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target.closest('.slider__btn')) return;
    stop();
    down = { x: e.clientX, y: e.clientY, pos: pos, id: e.pointerId };
    dragging = false;
    moved = false;
    samples = [{ x: e.clientX, t: performance.now() }];
  }
  function onMove(e) {
    if (!down || e.pointerId !== down.id) return;
    var dx = e.clientX - down.x;
    if (!dragging) {
      if (Math.abs(dx) < DRAG_START) return;
      dragging = true;
      moved = true;
      try { stage.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
      cursor.drag(true);
    }
    pos = down.pos - dx / step;
    samples.push({ x: e.clientX, t: performance.now() });
    if (samples.length > 6) samples.shift();
    render();
  }
  function onUp(e) {
    if (!down || e.pointerId !== down.id) return;
    var base = Math.round(down.pos);
    if (dragging) {
      var a = samples[0], b = samples[samples.length - 1];
      var v = b.t > a.t ? (b.x - a.x) / (b.t - a.t) : 0;          // px per ms, negative when dragging left
      var projected = pos - (v * 220) / step;                     // where a flick would carry it
      goTo(clamp(Math.round(projected), base - 1, base + 1));     // one slide per drag
    } else {
      // A tap on a side slide brings it to the centre
      var slide = e.target.closest && e.target.closest('[data-slide]');
      if (slide) {
        var d = mod(slides.indexOf(slide) - pos + n / 2, n) - n / 2;
        if (Math.abs(Math.round(d)) === 1) by(Math.round(d));
      }
    }
    down = null;
    dragging = false;
    cursor.drag(false);
  }
  stage.addEventListener('pointerdown', onDown);
  stage.addEventListener('pointermove', onMove);
  stage.addEventListener('pointerup', onUp);
  stage.addEventListener('pointercancel', onUp);
  // A drag must not count as a click on anything inside the stage
  stage.addEventListener('click', function (e) {
    if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; }
  }, true);

  /* --- "Drag" cursor ------------------------------------------------------------ */
  var cursor = (function () {
    var noop = { drag: function () {} };
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return noop;

    var el = document.createElement('div');
    el.className = 'drag-cursor';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<span class="drag-cursor__dot t-subline-s">Drag</span>';
    document.body.appendChild(el);
    root.classList.add('has-cursor');

    var EASE = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--x-drag-ease')) || 0.2;
    var tx = 0, ty = 0, x = 0, y = 0, shown = false, raf = 0, inside = false, overButton = false;

    function loop() {
      x += (tx - x) * EASE;
      y += (ty - y) * EASE;
      el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
      raf = (Math.abs(tx - x) > 0.1 || Math.abs(ty - y) > 0.1) ? requestAnimationFrame(loop) : 0;
    }
    function sync() {
      var on = inside && !overButton;
      if (on !== shown) { shown = on; el.classList.toggle('is-visible', on); }
    }
    stage.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      tx = e.clientX; ty = e.clientY;
      if (!inside) { inside = true; x = tx; y = ty; }   // appear where the pointer is, no glide in from the corner
      overButton = !!(e.target.closest && e.target.closest('.slider__btn'));
      sync();
      if (!raf) raf = requestAnimationFrame(loop);
    });
    stage.addEventListener('pointerleave', function (e) {
      if (e.pointerType !== 'mouse' || dragging) return;
      inside = false;
      sync();
    });
    // If the pointer is released outside the stage after a drag, hide the cursor
    window.addEventListener('pointerup', function () {
      if (inside && !stage.matches(':hover')) { inside = false; sync(); }
    });
    return { drag: function (on) { el.classList.toggle('is-dragging', on); } };
  })();

  measure();
  window.addEventListener('resize', measure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
})();
