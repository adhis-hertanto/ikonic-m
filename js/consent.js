/* Cookie consent banner (Figma 217:4679). Reusable on any page that has the [data-consent] markup.
   The choice is stored in localStorage under "ikonic-consent" as
   { status: "all" | "rejected" | "custom", analytics: bool, marketing: bool, savedAt: ISO string }.
   Every read and write is wrapped in try/catch: storage can be blocked, in which case the banner shows
   on every visit and the choice only lasts for the page view.
   Other scripts can listen for the "ikonic:consent" event on document (detail = the saved choice),
   call window.IKONIC.consent.get() or reopen the banner with window.IKONIC.consent.open() / any
   element carrying [data-consent-open]. */
(function () {
  'use strict';

  var KEY = 'ikonic-consent';

  function read() {
    try {
      var raw = window.localStorage.getItem(KEY);
      var value = raw ? JSON.parse(raw) : null;
      return value && typeof value.status === 'string' ? value : null;
    } catch (error) { return null; }
  }
  function write(value) {
    try { window.localStorage.setItem(KEY, JSON.stringify(value)); } catch (error) { /* blocked storage */ }
  }

  function init(banner) {
    var manage = banner.querySelector('[data-consent-manage]');
    var prefs = banner.querySelector('[data-consent-prefs]');
    var boxes = Array.prototype.slice.call(banner.querySelectorAll('[data-consent-category]'));
    var current = read();
    var opener = null;                 // element to give focus back to when the banner is reopened by a control

    function setPrefsOpen(open) {
      if (!prefs || !manage) return;
      prefs.hidden = !open;
      manage.setAttribute('aria-expanded', String(open));
    }
    function show() {
      banner.hidden = false;
      void banner.offsetWidth;         // so the slide-in transition runs from the closed state
      banner.classList.remove('is-closed');
      banner.inert = false;
    }
    function hide() {
      banner.classList.add('is-closed');
      banner.inert = true;             // off screen, so it must not be focusable
      setPrefsOpen(false);
      if (opener && document.contains(opener)) opener.focus();
      opener = null;
    }
    function save(status, choices) {
      current = {
        status: status,
        analytics: !!choices.analytics,
        marketing: !!choices.marketing,
        savedAt: new Date().toISOString()
      };
      write(current);
      document.dispatchEvent(new CustomEvent('ikonic:consent', { detail: current }));
      hide();
    }
    function syncBoxes() {
      boxes.forEach(function (box) { box.checked = !!(current && current[box.getAttribute('data-consent-category')]); });
    }

    banner.querySelector('[data-consent-accept]').addEventListener('click', function () {
      save('all', { analytics: true, marketing: true });
    });
    banner.querySelector('[data-consent-reject]').addEventListener('click', function () {
      save('rejected', { analytics: false, marketing: false });
    });
    if (manage) manage.addEventListener('click', function () {
      var open = manage.getAttribute('aria-expanded') !== 'true';
      setPrefsOpen(open);
      if (open && boxes[0]) boxes[0].focus();
    });
    var saveButton = banner.querySelector('[data-consent-save]');
    if (saveButton) saveButton.addEventListener('click', function () {
      var choices = {};
      boxes.forEach(function (box) { choices[box.getAttribute('data-consent-category')] = box.checked; });
      save('custom', choices);
    });
    // Escape leaves the preferences first, then closes a reopened banner without changing the stored choice
    banner.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      if (prefs && !prefs.hidden) { setPrefsOpen(false); manage.focus(); }
      else if (current) hide();
    });

    function open(trigger) {
      opener = trigger || null;
      syncBoxes();
      show();
      if (trigger && manage) manage.focus();
    }
    document.addEventListener('click', function (event) {
      var trigger = event.target.closest && event.target.closest('[data-consent-open]');
      if (!trigger) return;
      event.preventDefault();
      open(trigger);
    });

    window.IKONIC = window.IKONIC || {};
    window.IKONIC.consent = { get: function () { return current; }, open: function () { open(null); } };

    if (current) { banner.classList.add('is-closed'); banner.inert = true; banner.hidden = false; }
    else show();
  }

  document.addEventListener('DOMContentLoaded', function () {
    var banner = document.querySelector('[data-consent]');
    if (banner) init(banner);
  });
})();
