/* Footprints section: market tabs and project panel, kept in sync with the globe.
   Tabs  -> globe : dispatches "footprints:select" on the globe element
   Globe -> tabs  : listens for "globe:select" (a country clicked on the canvas)
   Panel          : flag + country, a tab per project status that exists for that country, and a chip
                    per project. Everything is derived from data/projects.json. */
(function () {
  'use strict';

  function init(section) {
    var tablist = section.querySelector('[data-tabs]');
    var globe = section.querySelector('[data-globe]');
    if (!tablist || !globe) return;
    var tabs = Array.prototype.slice.call(tablist.querySelectorAll('[role="tab"]'));

    var panel = section.querySelector('[data-fp-panel]');
    var flag = section.querySelector('[data-fp-flag]');
    var nameEl = section.querySelector('[data-fp-name]');
    var statusList = section.querySelector('[data-fp-status]');
    var chips = section.querySelector('[data-fp-chips]');

    var data = null;                 // data/projects.json once loaded
    var country = null;              // selected country key, or null when nothing is selected
    var status = null;               // active status tab

    /* --- Market tabs (unchanged behaviour) ---------------------------------------- */
    function setActive(key, focus) {
      tabs.forEach(function (tab) {
        var active = tab.getAttribute('data-country') === key;
        tab.classList.toggle('is-active', active);
        tab.setAttribute('aria-selected', String(active));
        tab.tabIndex = active ? 0 : -1;
        if (active) {
          globe.setAttribute('aria-labelledby', tab.id);
          if (focus) tab.focus();
        }
      });
    }

    function choose(key, focus) {
      setActive(key, focus);
      showCountry(key);
      globe.dispatchEvent(new CustomEvent('footprints:select', { detail: { country: key } }));
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

    globe.addEventListener('globe:select', function (event) {
      setActive(event.detail.country);
      showCountry(event.detail.country);
    });

    /* --- Project panel --------------------------------------------------------------- */
    function projectsOf(key) {
      return data.projects.filter(function (p) { return p.country === key; });
    }
    // Statuses that exist for this country, in the order set by data.statuses
    function statusesOf(list) {
      return data.statuses.filter(function (s) { return list.some(function (p) { return p.status === s; }); });
    }
    function el(tag, className, text) {
      var node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    }

    function renderStatusTabs(list, available) {
      statusList.innerHTML = '';
      available.forEach(function (name) {
        var count = list.filter(function (p) { return p.status === name; }).length;
        var tab = el('button', 'fp-status__tab');
        tab.type = 'button';
        tab.setAttribute('role', 'tab');
        tab.setAttribute('data-status', name);
        tab.id = 'fp-status-' + name.toLowerCase();
        tab.setAttribute('aria-controls', chips.id);
        tab.appendChild(el('span', 'fp-status__badge', String(count)));
        tab.appendChild(el('span', '', name));
        tab.addEventListener('click', function () { setStatus(name); });
        tab.addEventListener('keydown', function (event) {
          var all = Array.prototype.slice.call(statusList.children), i = all.indexOf(tab), target = -1;
          if (event.key === 'ArrowRight') target = (i + 1) % all.length;
          else if (event.key === 'ArrowLeft') target = (i - 1 + all.length) % all.length;
          else if (event.key === 'Home') target = 0;
          else if (event.key === 'End') target = all.length - 1;
          if (target < 0) return;
          event.preventDefault();
          setStatus(all[target].getAttribute('data-status'), true);
        });
        statusList.appendChild(tab);
      });
    }

    function renderChips() {
      var list = projectsOf(country).filter(function (p) { return p.status === status; });
      chips.innerHTML = '';
      list.forEach(function (p) {
        var item = el('li', 'fp-chip');
        item.appendChild(el('span', 'fp-chip__name', p.name));
        item.appendChild(el('span', 'fp-chip__loc', p.location));
        chips.appendChild(item);
      });
    }

    function setStatus(name, focus) {
      status = name;
      Array.prototype.forEach.call(statusList.children, function (tab) {
        var active = tab.getAttribute('data-status') === name;
        tab.classList.toggle('is-active', active);
        tab.setAttribute('aria-selected', String(active));
        tab.tabIndex = active ? 0 : -1;
        if (active) {
          chips.setAttribute('aria-labelledby', tab.id);
          if (focus) tab.focus();
        }
      });
      renderChips();
    }

    // Select a country (or null to hide the panel). Always resets to the default status tab.
    function showCountry(key) {
      if (!data || !panel) return;
      var meta = key && data.countries[key];
      if (!meta) { country = null; panel.classList.remove('is-open'); return; }
      var changed = key !== country;
      country = key;
      if (changed || !status) {
        var list = projectsOf(key), available = statusesOf(list);
        flag.src = meta.flag;
        nameEl.textContent = meta.label;
        renderStatusTabs(list, available);
        setStatus(available.indexOf('Current') >= 0 ? 'Current' : available[0]);
      }
      panel.classList.add('is-open');
    }

    if (panel) {
      chips.id = chips.id || 'fp-chips';
      fetch('data/projects.json')
        .then(function (r) { return r.json(); })
        .then(function (json) {
          data = json;
          var active = tablist.querySelector('[role="tab"].is-active');
          showCountry(active ? active.getAttribute('data-country') : null);
        })
        .catch(function (error) { console.error('[footprints]', error); });
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-footprints]').forEach(init);
  });
})();
