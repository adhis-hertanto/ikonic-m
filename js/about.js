/* About page: team arrows. The team row is a scroll-snap strip. At the design
   width all four people fit, so the arrows stay hidden; when the strip
   overflows they page it by one card. */
(function () {
  'use strict';

  function init(viewport) {
    var arrows = document.querySelector('[data-team-arrows]');
    var prev = document.querySelector('[data-team-prev]');
    var next = document.querySelector('[data-team-next]');
    if (!arrows || !prev || !next) return;
    var flags = window.IKONIC || {};
    var instant = flags.snapshot || flags.reducedMotion;

    function step() {
      var card = viewport.querySelector('.ab-person');
      if (!card) return viewport.clientWidth;
      var gap = parseFloat(getComputedStyle(card.parentElement).columnGap) || 0;
      return card.getBoundingClientRect().width + gap;
    }

    function update() {
      var max = viewport.scrollWidth - viewport.clientWidth;
      var overflowing = max > 2;
      arrows.hidden = !overflowing;
      prev.disabled = viewport.scrollLeft <= 1;
      next.disabled = viewport.scrollLeft >= max - 1;
    }

    function page(dir) {
      viewport.scrollBy({ left: dir * step(), behavior: instant ? 'auto' : 'smooth' });
    }

    prev.addEventListener('click', function () { page(-1); });
    next.addEventListener('click', function () { page(1); });
    viewport.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  document.addEventListener('DOMContentLoaded', function () {
    var viewport = document.querySelector('[data-team-viewport]');
    if (viewport) init(viewport);
  });
})();
