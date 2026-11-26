/* Case Study: gallery lightbox and related assets carousel. */
(function () {
  'use strict';

  var reduced = !!(window.IKONIC && (window.IKONIC.reducedMotion || window.IKONIC.snapshot));

  /* --- Gallery lightbox (250:949) ------------------------------------------ */
  function initGallery(grid) {
    var items = Array.prototype.slice.call(grid.querySelectorAll('[data-gallery-item]'));
    if (!items.length || typeof HTMLDialogElement === 'undefined') return;
    var index = 0;
    var opener = null;

    var dialog = document.createElement('dialog');
    dialog.className = 'cs-lightbox';
    dialog.setAttribute('aria-label', 'Project gallery');
    dialog.innerHTML =
      '<button class="cs-lightbox__btn cs-lightbox__btn--close" type="button" aria-label="Close gallery"><span class="icon" aria-hidden="true"></span></button>' +
      '<button class="cs-lightbox__btn cs-lightbox__btn--prev" type="button" aria-label="Previous image"><span class="icon" aria-hidden="true"></span></button>' +
      '<figure class="cs-lightbox__figure"><img class="cs-lightbox__img" alt="">' +
      '<figcaption class="cs-lightbox__count t-body-s" aria-live="polite"></figcaption></figure>' +
      '<button class="cs-lightbox__btn cs-lightbox__btn--next" type="button" aria-label="Next image"><span class="icon" aria-hidden="true"></span></button>';
    document.body.appendChild(dialog);
    var img = dialog.querySelector('.cs-lightbox__img');
    var count = dialog.querySelector('.cs-lightbox__count');

    function show(i) {
      index = (i + items.length) % items.length;
      var src = items[index].querySelector('img');
      img.src = src.currentSrc || src.src;
      img.alt = src.alt;
      count.textContent = (index + 1) + ' / ' + items.length;
    }
    function open(i) {
      opener = items[i];
      show(i);
      dialog.showModal();
      document.documentElement.style.overflow = 'hidden';
    }
    function close() { if (dialog.open) dialog.close(); }

    items.forEach(function (btn, i) { btn.addEventListener('click', function () { open(i); }); });
    dialog.querySelector('.cs-lightbox__btn--prev').addEventListener('click', function () { show(index - 1); });
    dialog.querySelector('.cs-lightbox__btn--next').addEventListener('click', function () { show(index + 1); });
    dialog.querySelector('.cs-lightbox__btn--close').addEventListener('click', close);
    /* click on the backdrop (the dialog itself) closes */
    dialog.addEventListener('click', function (e) { if (e.target === dialog) close(); });
    dialog.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); show(index - 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); show(index + 1); }
    });
    dialog.addEventListener('close', function () {
      document.documentElement.style.overflow = '';
      if (opener) opener.focus();
    });
  }

  /* --- Related assets carousel (250:966) ------------------------------------ */
  function initRelated(section) {
    var viewport = section.querySelector('[data-related-viewport]');
    var prev = section.querySelector('[data-related-prev]');
    var next = section.querySelector('[data-related-next]');
    if (!viewport || !prev || !next) return;
    var slides = Array.prototype.slice.call(viewport.querySelectorAll('.cs-related__slide'));

    function step() {
      if (slides.length < 2) return viewport.clientWidth;
      return slides[1].offsetLeft - slides[0].offsetLeft;
    }
    function update() {
      var max = viewport.scrollWidth - viewport.clientWidth - 1;
      prev.setAttribute('aria-disabled', viewport.scrollLeft <= 1 ? 'true' : 'false');
      next.setAttribute('aria-disabled', viewport.scrollLeft >= max ? 'true' : 'false');
    }
    function go(dir) {
      if ((dir < 0 ? prev : next).getAttribute('aria-disabled') === 'true') return;
      viewport.scrollBy({ left: dir * step(), behavior: reduced ? 'auto' : 'smooth' });
    }
    prev.addEventListener('click', function () { go(-1); });
    next.addEventListener('click', function () { go(1); });
    viewport.addEventListener('scroll', function () { window.requestAnimationFrame(update); }, { passive: true });
    window.addEventListener('resize', update);
    viewport.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    });
    update();
  }

  document.addEventListener('DOMContentLoaded', function () {
    var grid = document.querySelector('[data-gallery]');
    if (grid) initGallery(grid);
    var related = document.querySelector('[data-related]');
    if (related) initRelated(related);
  });
})();
