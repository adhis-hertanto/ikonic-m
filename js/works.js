/* Our Works: expanding asset type cards and client-side filters. */
(function () {
  'use strict';

  /* --- Expanding cards (250:664) -----------------------------------------
     One card open at a time. Hover (pointer devices) previews a card, click or
     Enter/Space makes it the selected one, arrow keys move between cards. */
  function initTypes(list) {
    var cards = Array.prototype.slice.call(list.querySelectorAll('[data-works-type]'));
    if (!cards.length) return;
    var canHover = window.matchMedia('(hover: hover) and (pointer: fine)');
    var selected = Math.max(0, cards.findIndex(function (c) { return c.classList.contains('is-open'); }));

    function show(index) {
      cards.forEach(function (card, i) {
        var open = i === index;
        card.classList.toggle('is-open', open);
        card.querySelector('.works-type__trigger').setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    }

    cards.forEach(function (card, i) {
      var trigger = card.querySelector('.works-type__trigger');
      trigger.addEventListener('click', function () { selected = i; show(i); });
      card.addEventListener('pointerenter', function (e) {
        if (e.pointerType === 'mouse' && canHover.matches) show(i);
      });
      trigger.addEventListener('keydown', function (e) {
        var next = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % cards.length;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + cards.length) % cards.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = cards.length - 1;
        if (next === null) return;
        e.preventDefault();
        selected = next;
        show(next);
        cards[next].querySelector('.works-type__trigger').focus();
      });
    });
    /* Leaving the row returns to the selected card */
    list.addEventListener('pointerleave', function (e) {
      if (e.pointerType === 'mouse' && canHover.matches) show(selected);
    });
  }

  /* --- Filters (250:698) --------------------------------------------------- */
  function initFilters(section) {
    var selects = Array.prototype.slice.call(section.querySelectorAll('[data-filter]'));
    var cards = Array.prototype.slice.call(section.querySelectorAll('.works-card'));
    var empty = section.querySelector('[data-works-empty]');
    var status = section.querySelector('[data-works-status]');
    if (!selects.length || !cards.length) return;

    function apply() {
      var active = {};
      selects.forEach(function (s) {
        active[s.getAttribute('data-filter')] = s.value;
        s.classList.toggle('is-filtered', !!s.value);
      });
      var shown = 0;
      cards.forEach(function (card) {
        var ok = Object.keys(active).every(function (key) {
          return !active[key] || card.getAttribute('data-' + key) === active[key];
        });
        card.hidden = !ok;
        if (ok) shown++;
      });
      if (empty) empty.hidden = shown !== 0;
      if (status) status.textContent = shown === 1 ? '1 work shown' : shown + ' works shown';
    }
    selects.forEach(function (s) { s.addEventListener('change', apply); });
    apply();
    if (status) status.textContent = '';
  }

  document.addEventListener('DOMContentLoaded', function () {
    var types = document.querySelector('[data-works-types]');
    if (types) initTypes(types);
    var list = document.querySelector('[data-works-list]');
    if (list) initFilters(list);
  });
})();
