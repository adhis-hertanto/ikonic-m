/* Hero carousel: 3 slides, progress segments, autoplay ~6s, pause on hover/focus.
   Timing is driven by the CSS fill animation (--x-carousel-interval), so pausing
   the animation pauses the carousel and they can never drift apart. */
(function () {
  'use strict';

  // Figma shows segment 1 at 131 of 224px. Used only in ?snapshot=1 mode.
  var SNAPSHOT_PROGRESS = 131 / 224;

  function init(root) {
    var slides = Array.prototype.slice.call(root.querySelectorAll('[data-slide]'));
    var segs = Array.prototype.slice.call(root.querySelectorAll('.carousel__seg'));
    if (slides.length < 2 || segs.length !== slides.length) return;

    var flags = window.IKONIC || {};
    var isStatic = flags.snapshot || flags.reducedMotion;
    var current = 0;
    if (isStatic) root.classList.add('is-static');

    function go(index, restart) {
      var next = (index + slides.length) % slides.length;
      if (next === current && !restart) return;
      current = next;
      slides.forEach(function (slide, i) { slide.classList.toggle('is-active', i === current); });
      segs.forEach(function (seg, i) {
        var active = i === current;
        seg.classList.remove('is-active');
        if (active) {
          void seg.offsetWidth;           // restart the fill animation
          seg.classList.add('is-active');
          seg.setAttribute('aria-current', 'true');
        } else {
          seg.removeAttribute('aria-current');
        }
      });
    }

    segs.forEach(function (seg, i) {
      seg.addEventListener('click', function () { go(i, true); });
      seg.addEventListener('keydown', function (event) {
        var dir = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        if (!dir) return;
        event.preventDefault();
        go(current + dir);
        segs[current].focus();
      });
      seg.querySelector('.carousel__fill').addEventListener('animationend', function () {
        if (i === current && !isStatic) go(current + 1);
      });
    });

    function setPaused(paused) { root.classList.toggle('is-paused', paused); }
    root.addEventListener('mouseenter', function () { setPaused(true); });
    root.addEventListener('mouseleave', function () { setPaused(false); });
    // Keyboard focus pauses too; a mouse click on a segment must not leave it paused.
    root.addEventListener('focusin', function (event) {
      if (event.target.matches(':focus-visible')) setPaused(true);
    });
    root.addEventListener('focusout', function () {
      if (!root.matches(':hover')) setPaused(false);
    });
    document.addEventListener('visibilitychange', function () { setPaused(document.hidden); });

    if (flags.snapshot) {
      segs[0].querySelector('.carousel__fill').style.transform = 'scaleX(' + SNAPSHOT_PROGRESS + ')';
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-carousel]').forEach(init);
  });
})();
