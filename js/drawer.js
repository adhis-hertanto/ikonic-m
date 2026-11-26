/* Accessible modal drawer. Markup: [data-drawer] (hidden) containing
   [data-drawer-panel] (role="dialog"), [data-drawer-close] elements (scrim and
   close button) and fill targets [data-drawer-name|role|bio|photo].
   Triggers: [data-drawer-open="<id>"]. Content comes from the JSON script
   #ab-team-data, keyed by id: { name, role, photo, alt, bio }.
   Handles: focus move + trap, Escape, scrim click, focus return, scroll lock,
   inert background. */
(function () {
  'use strict';

  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
    'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function init(drawer) {
    var panel = drawer.querySelector('[data-drawer-panel]');
    var data = {};
    try {
      var source = document.getElementById('ab-team-data');
      if (source) data = JSON.parse(source.textContent);
    } catch (e) { data = {}; }

    var fields = {
      name: drawer.querySelector('[data-drawer-name]'),
      role: drawer.querySelector('[data-drawer-role]'),
      bio: drawer.querySelector('[data-drawer-bio]'),
      photo: drawer.querySelector('[data-drawer-photo]')
    };
    var root = document.documentElement;
    var lastFocus = null;
    var isOpen = false;
    var closeTimer = 0;
    var inerted = [];

    function instant() {
      var f = window.IKONIC || {};
      return !!(f.snapshot || f.reducedMotion);
    }

    function fill(id) {
      var person = data[id];
      if (!person) return false;
      fields.name.textContent = person.name;
      fields.role.textContent = person.role;
      fields.bio.textContent = person.bio;
      fields.photo.src = person.photo;
      fields.photo.alt = person.alt || '';
      return true;
    }

    function focusables() {
      return Array.prototype.filter.call(panel.querySelectorAll(FOCUSABLE), function (el) {
        return el.offsetParent !== null || el === document.activeElement;
      });
    }

    function setBackgroundInert(on) {
      if (on) {
        Array.prototype.forEach.call(document.body.children, function (el) {
          if (el === drawer || el.tagName === 'SCRIPT' || el.hasAttribute('inert')) return;
          el.setAttribute('inert', '');
          inerted.push(el);
        });
      } else {
        inerted.forEach(function (el) { el.removeAttribute('inert'); });
        inerted = [];
      }
    }

    function lockScroll(on) {
      if (on) {
        var bar = window.innerWidth - root.clientWidth;
        if (bar > 0) document.body.style.paddingRight = bar + 'px';
        root.classList.add('ab-drawer-open');
      } else {
        root.classList.remove('ab-drawer-open');
        document.body.style.paddingRight = '';
      }
    }

    function open(id, trigger) {
      if (isOpen || !fill(id)) return;
      clearTimeout(closeTimer);
      isOpen = true;
      lastFocus = trigger || document.activeElement;
      drawer.hidden = false;
      void drawer.offsetWidth;                 // commit the closed state so the slide-in animates
      drawer.classList.add('is-open');
      lockScroll(true);
      setBackgroundInert(true);
      panel.scrollTop = 0;
      var first = focusables()[0] || panel;
      first.focus({ preventScroll: true });
      document.addEventListener('keydown', onKeydown, true);
    }

    function finishClose() {
      drawer.hidden = true;
    }

    function close() {
      if (!isOpen) return;
      isOpen = false;
      document.removeEventListener('keydown', onKeydown, true);
      drawer.classList.remove('is-open');
      setBackgroundInert(false);
      lockScroll(false);
      if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus({ preventScroll: true });
      if (instant()) finishClose();
      else closeTimer = setTimeout(finishClose, 360);   // slightly over --x-dur
    }

    function onKeydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab') return;
      var items = focusables();
      if (!items.length) { event.preventDefault(); panel.focus(); return; }
      var first = items[0];
      var last = items[items.length - 1];
      var active = document.activeElement;
      if (!panel.contains(active)) { event.preventDefault(); first.focus(); }
      else if (event.shiftKey && (active === first || active === panel)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
    }

    document.querySelectorAll('[data-drawer-open]').forEach(function (btn) {
      btn.addEventListener('click', function () { open(btn.getAttribute('data-drawer-open'), btn); });
    });
    drawer.querySelectorAll('[data-drawer-close]').forEach(function (el) {
      el.addEventListener('click', close);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var drawer = document.querySelector('[data-drawer]');
    if (drawer) init(drawer);
  });
})();
