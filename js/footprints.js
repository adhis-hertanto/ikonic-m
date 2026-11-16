/* Footprints section: market tabs, kept in sync with the globe.
   Tabs -> globe : dispatches "footprints:select" on the globe element
   Globe -> tabs : listens for "globe:select" (a country clicked on the canvas) */
(function () {
  'use strict';

  function init(section) {
    var tablist = section.querySelector('[data-tabs]');
    var globe = section.querySelector('[data-globe]');
    if (!tablist || !globe) return;
    var tabs = Array.prototype.slice.call(tablist.querySelectorAll('[role="tab"]'));

    function setActive(country, focus) {
      tabs.forEach(function (tab) {
        var active = tab.getAttribute('data-country') === country;
        tab.classList.toggle('is-active', active);
        tab.setAttribute('aria-selected', String(active));
        tab.tabIndex = active ? 0 : -1;
        if (active) {
          globe.setAttribute('aria-labelledby', tab.id);
          if (focus) tab.focus();
        }
      });
    }

    function choose(country, focus) {
      setActive(country, focus);
      globe.dispatchEvent(new CustomEvent('footprints:select', { detail: { country: country } }));
    }

    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { choose(tab.getAttribute('data-country')); });
      tab.addEventListener('keydown', function (event) {
        var target = -1;
        if (event.key === 'ArrowRight') target = (i + 1) % tabs.length;
        else if (event.key === 'ArrowLeft') target = (i - 1 + tabs.length) % tabs.length;
        else if (event.key === 'Home') target = 0;
        else if (event.key === 'End') target = tabs.length - 1;
        if (target < 0) return;
        event.preventDefault();
        choose(tabs[target].getAttribute('data-country'), true);
      });
    });

    globe.addEventListener('globe:select', function (event) { setActive(event.detail.country); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-footprints]').forEach(init);
  });
})();
