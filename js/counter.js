/* IKONIC-M prototype: count-up for key stats (.stat__num[data-count]) when they scroll into view.
   The final value is in the HTML, so no-JS, reduced motion and snapshots show it as is. */
(function () {
  'use strict';
  var nums = Array.prototype.slice.call(document.querySelectorAll('[data-count]'));
  if (!nums.length) return;
  var ctx = window.IKONIC || {};
  if (ctx.snapshot || ctx.reducedMotion || !('IntersectionObserver' in window)) return;

  var DURATION = 1600;   // ms per counter
  var STAGGER = 150;     // ms between stats in one row

  function format(el, v) {
    var d = parseInt(el.getAttribute('data-decimals') || '0', 10);
    return v.toFixed(d) + (el.getAttribute('data-suffix') || '');
  }
  function easeOutExpo(t) { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); }

  function run(el, delay) {
    var target = parseFloat(el.getAttribute('data-count'));
    setTimeout(function () {
      var start = null;
      function frame(now) {
        if (start === null) start = now;
        var t = Math.min(1, (now - start) / DURATION);
        el.textContent = format(el, target * easeOutExpo(t));
        if (t < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }, delay);
  }

  // Reserve the final width so the unit beside the number never shifts, then start from zero.
  // Width is stored in em so it stays right when the type scale steps at a breakpoint.
  function prepare() {
    nums.forEach(function (el) {
      var fs = parseFloat(getComputedStyle(el).fontSize);
      el.style.minWidth = (el.getBoundingClientRect().width / fs).toFixed(3) + 'em';
      el.textContent = format(el, 0);
    });
  }

  var observer = new IntersectionObserver(function (entries) {
    entries.filter(function (e) { return e.isIntersecting; })
      .sort(function (a, b) { return a.boundingClientRect.left - b.boundingClientRect.left; })
      .forEach(function (entry, i) {
        run(entry.target, i * STAGGER);
        observer.unobserve(entry.target);
      });
  }, { threshold: 0.6 });
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function () {
    prepare();
    nums.forEach(function (el) { observer.observe(el); });
  });
})();
