/* IKONIC-M prototype: shared behaviour (reveal, language toggle, newsletter, back to top) */
(function () {
  'use strict';

  var root = document.documentElement;
  var params = new URLSearchParams(window.location.search);

  // ?snapshot=1 freezes all motion so sections can be pixel-compared with Figma.
  var snapshot = params.has('snapshot');
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (snapshot) root.classList.add('is-snapshot');

  window.IKONIC = { snapshot: snapshot, reducedMotion: reducedMotion };

  /* --- Scroll reveal: fade + rise, staggered, once per element ------------- */
  function initReveal() {
    var items = Array.prototype.slice.call(document.querySelectorAll('[data-reveal]'));
    if (!items.length) return;
    if (snapshot || reducedMotion || !('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('is-revealed'); });
      return;
    }
    var STAGGER = 90;
    var observer = new IntersectionObserver(function (entries) {
      var batch = entries.filter(function (e) { return e.isIntersecting; });
      batch
        .sort(function (a, b) {
          var ra = a.boundingClientRect, rb = b.boundingClientRect;
          return ra.top - rb.top || ra.left - rb.left;
        })
        .forEach(function (entry, i) {
          entry.target.style.setProperty('--reveal-delay', (i * STAGGER) + 'ms');
          entry.target.classList.add('is-revealed');
          observer.unobserve(entry.target);
        });
    }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
    // Anything already on screen at load (the hero, including its progress bars near the bottom edge)
    // reveals straight away, in reading order. The observer's bottom margin would otherwise hold it back until scroll.
    var visibleNow = items.filter(function (el) { return el.getBoundingClientRect().top < window.innerHeight; })
      .sort(function (a, b) {
        var ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
        return ra.top - rb.top || ra.left - rb.left;
      });
    visibleNow.forEach(function (el, i) {
      el.style.setProperty('--reveal-delay', (i * STAGGER) + 'ms');
      el.classList.add('is-revealed');
    });
    items.forEach(function (el) { if (visibleNow.indexOf(el) < 0) observer.observe(el); });
  }

  /* --- Snap auto-width labels up to a whole unit --------------------------
     Figma rounds auto-width text boxes up to whole pixels; the browser keeps
     fractions, which add up along a row (nav, tabs). Snapping to a multiple
     of --u reproduces the Figma positions at every breakpoint. */
  var SNAP = '.nav__main .nav__link:not(.nav__link--dropdown), .nav__link--dropdown > span:not(.icon), ' +
    '.nav__lang .nav__link, .nav__lang > span, [data-search], .tab, ' +
    '.btn > span:not(.icon), .link > span:not(.icon)';
  function snapWidths() {
    var scale = parseFloat(getComputedStyle(root).getPropertyValue('--scale')) || 1;
    var items = Array.prototype.slice.call(document.querySelectorAll(SNAP));
    items.forEach(function (el) { el.style.width = ''; });
    var widths = items.map(function (el) { return el.getBoundingClientRect().width; });
    items.forEach(function (el, i) {
      el.style.width = (Math.ceil(widths[i] / scale - 0.01) * scale) + 'px';
    });
  }
  function initSnap() {
    var timer;
    var run = function () { snapWidths(); };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(run); else run();
    window.addEventListener('resize', function () {
      clearTimeout(timer);
      timer = setTimeout(run, 120);
    });
  }

  /* --- Language toggle (visual state only, no translation yet) ------------- */
  function initLanguage() {
    var buttons = document.querySelectorAll('[data-lang]');
    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)); });
      });
    });
  }

  /* --- Newsletter: client-side validation only, no backend ----------------- */
  function initNewsletter() {
    var form = document.querySelector('[data-newsletter]');
    if (!form) return;
    var input = form.querySelector('input[type="email"]');
    var message = form.querySelector('.field-message');
    var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    function show(text, isError) {
      message.textContent = text;
      message.hidden = !text;
      message.classList.toggle('is-error', !!isError);
      if (isError) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var value = input.value.trim();
      // PLACEHOLDER copy: error and success messages are not in Figma.
      if (!value) { show('Please enter your email address.', true); input.focus(); return; }
      if (!EMAIL.test(value)) { show('Please enter a valid email address.', true); input.focus(); return; }
      show('Thank you. You are subscribed.', false);
      form.classList.add('is-success');
      input.value = '';
    });

    input.addEventListener('input', function () {
      if (input.getAttribute('aria-invalid') === 'true' || form.classList.contains('is-success')) {
        form.classList.remove('is-success');
        show('', false);
      }
    });
  }

  /* --- Back to top ---------------------------------------------------------- */
  function initBackToTop() {
    var btn = document.querySelector('[data-back-to-top]');
    if (!btn) return;
    btn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
      var target = document.querySelector('.nav__logo');
      if (target) target.focus({ preventScroll: true });
    });
  }

  /* --- Top nav: slides off on scroll down, back on scroll up --------------- */
  function initNavHide() {
    var nav = document.querySelector('[data-nav]');
    if (!nav) return;
    var lastY = window.pageYOffset;
    var ticking = false;
    var DELTA = 6;   // ignore jitter smaller than this

    function update() {
      ticking = false;
      var y = Math.max(0, window.pageYOffset);
      var dy = y - lastY;
      if (y <= 0) nav.classList.remove('is-hidden');
      else if (dy > DELTA && y > nav.offsetHeight) nav.classList.add('is-hidden');
      else if (dy < -DELTA) nav.classList.remove('is-hidden');
      if (Math.abs(dy) > DELTA || y <= 0) lastY = y;
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    // Keyboard users tabbing into the nav always get it back
    nav.addEventListener('focusin', function () { nav.classList.remove('is-hidden'); });
  }

  // Project cards: a click anywhere on the card follows its "Read more" link.
  // Clicks on the link itself, disabled links and text selections are left alone.
  function initCardLinks() {
    document.addEventListener('click', function (e) {
      var card = e.target.closest && e.target.closest('.works-card');
      if (!card || e.target.closest('a, button')) return;
      var link = card.querySelector('.works-card__link');
      if (!link || link.getAttribute('aria-disabled') === 'true') return;
      if (String(window.getSelection ? window.getSelection() : '').length) return;
      if (e.metaKey || e.ctrlKey || e.button === 1) window.open(link.href, '_blank', 'noopener');
      else link.click();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initCardLinks();
    initNavHide();
    initSnap();
    initReveal();
    initLanguage();
    initNewsletter();
    initBackToTop();
    // Search: intentionally opens nothing yet (unresolved, see report).
  });
})();
