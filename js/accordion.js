/* Accordion: one item open at a time. Height animates in CSS (grid rows).
   An optional [data-accordion-media] sibling crossfades to the image that
   matches the open item (same index). */
(function () {
  'use strict';

  function init(root) {
    var items = Array.prototype.slice.call(root.querySelectorAll('.accordion__item'));
    var triggers = items.map(function (item) { return item.querySelector('.accordion__trigger'); });
    var scope = root.parentElement || document;
    var media = scope.querySelector('[data-accordion-media]');
    var images = media ? Array.prototype.slice.call(media.querySelectorAll('img')) : [];

    function open(index) {
      items.forEach(function (item, i) {
        var isOpen = i === index;
        item.classList.toggle('is-open', isOpen);
        triggers[i].setAttribute('aria-expanded', String(isOpen));
      });
      images.forEach(function (img, i) { img.classList.toggle('is-active', i === index); });
    }

    triggers.forEach(function (trigger, i) {
      trigger.addEventListener('click', function () { open(i); });
      trigger.addEventListener('keydown', function (event) {
        var target = -1;
        if (event.key === 'ArrowDown') target = (i + 1) % triggers.length;
        else if (event.key === 'ArrowUp') target = (i - 1 + triggers.length) % triggers.length;
        else if (event.key === 'Home') target = 0;
        else if (event.key === 'End') target = triggers.length - 1;
        if (target < 0) return;
        event.preventDefault();
        triggers[target].focus();
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-accordion]').forEach(init);
  });
})();
