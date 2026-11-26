/* IKONIC-M prototype: search modal (Figma "UI Design / Search", six states).
   Injects its own markup into <body>; any [data-search] button opens it.
   Include on every page:  <script src="../js/search.js" defer></script>  (or js/search.js at the root)

   States (root[data-state]):  idle (empty) | typing (suggestions) | loading | results | none | error
   Index:    data/search-index.json (built by scripts/build-search-index.mjs), resolved from the site
             root, which is derived from this script's own src, so it works at / and one folder down.

   Forcing the error state (for design review):
     - open any page with  ?searcherror  : the first search fails, "Try again" then succeeds
     - or search for the term  searcherror  : always fails
     - the state also appears for real when the index cannot be fetched (e.g. offline, file://)
   Forcing "no results": search for e.g. "hotel". */
(function () {
  'use strict';

  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
    'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  var LOAD_MS = 400;          // simulated search latency
  var PAGE_SIZE = 4;          // results shown before "View all results" (Figma shows four)
  var MAX_SUGGEST = 5;
  var ERROR_TERM = 'searcherror';
  var CHIPS = ['Saigon Centre', 'Retail strategy and positioning', 'Leasing and tenant curation',
    'Asset management', 'Latest news'];
  var CATEGORY_ORDER = ['Distinctive Destinations', 'Transformative Solutions', 'News', 'Company'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  var script = document.currentScript || document.querySelector('script[src*="search.js"]');
  var BASE = new URL('../', script ? script.src : document.baseURI).href;   // site root
  var forceErrorOnce = /[?&]searcherror(=|&|$)/.test(location.search);

  var root, dialog, form, input, clearBtn, submitBtn, bodyEl, statusEl;
  var isOpen = false;
  var lastFocus = null;
  var closeTimer = 0;
  var inerted = [];
  var seq = 0;                // search token: a newer search or a stop cancels older ones
  var indexPromise = null;
  var model = { state: 'idle', query: '', results: [], tab: 'all', expanded: false, active: 0, moved: false, suggestions: [] };

  /* --- Helpers ------------------------------------------------------------ */
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function norm(s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/&/g, ' and ').replace(/[^a-z0-9À-￿]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function instant() {
    var f = window.IKONIC || {};
    return !!(f.snapshot || f.reducedMotion || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches));
  }
  function fmtDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? (parseInt(m[3], 10) + ' ' + MONTHS[parseInt(m[2], 10) - 1] + ' ' + m[1]) : '';
  }
  function urlFor(entry) { return new URL(entry.url, BASE).href; }
  var ICON_ARROW = '<span class="icon" aria-hidden="true"></span>';

  /* --- Index -------------------------------------------------------------- */
  function loadIndex() {
    if (!indexPromise) {
      indexPromise = fetch(BASE + 'data/search-index.json', { credentials: 'same-origin' })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then(function (list) {
          if (!Array.isArray(list)) throw new Error('Bad index');
          return list.map(function (e) {
            e._t = norm(e.title);
            e._h = norm([e.title, e.category, e.keywords || '', e.description || ''].join(' '));
            return e;
          });
        })
        .catch(function (err) { indexPromise = null; throw err; });   // allow "Try again" to refetch
    }
    return indexPromise;
  }

  function score(entry, qn, tokens) {
    var s = 0;
    if (entry._t === qn) s += 200;
    else if (entry._t.indexOf(qn) === 0) s += 120;
    else if (entry._t.indexOf(qn) > -1) s += 80;
    tokens.forEach(function (t) {
      if (entry._t.indexOf(' ' + t) > -1 || entry._t.indexOf(t) === 0) s += 10;
      else if (entry._t.indexOf(t) > -1) s += 5;
      else s += 1;
    });
    return s;
  }
  function search(list, q) {
    var qn = norm(q);
    if (!qn) return [];
    var tokens = qn.split(' ');
    return list
      .map(function (e, i) { return { e: e, i: i }; })
      .filter(function (x) { return tokens.every(function (t) { return x.e._h.indexOf(t) > -1; }); })
      .map(function (x) { return { e: x.e, i: x.i, s: score(x.e, qn, tokens) }; })
      .sort(function (a, b) { return b.s - a.s || a.i - b.i; })
      .map(function (x) { return x.e; });
  }
  function suggest(list, q) {
    var qn = norm(q);
    if (!qn) return [];
    var tokens = qn.split(' ');
    return list
      .map(function (e, i) { return { e: e, i: i }; })
      .filter(function (x) { return tokens.every(function (t) { return x.e._t.indexOf(t) > -1; }); })
      .map(function (x) { return { e: x.e, i: x.i, s: score(x.e, qn, tokens) }; })
      .sort(function (a, b) { return b.s - a.s || a.i - b.i; })
      .slice(0, MAX_SUGGEST)
      .map(function (x) { return x.e; });
  }

  /* --- Rendering ---------------------------------------------------------- */
  function highlight(title, q) {
    var t = title.toLowerCase();
    var needle = q.trim().toLowerCase();
    var at = needle ? t.indexOf(needle) : -1;
    if (at < 0) {
      var first = needle.split(/\s+/)[0];
      at = first ? t.indexOf(first) : -1;
      needle = first;
    }
    if (at < 0) return esc(title);
    return esc(title.slice(0, at)) + '<strong>' + esc(title.slice(at, at + needle.length)) + '</strong>' +
      esc(title.slice(at + needle.length));
  }

  function chipsHtml() {
    return '<div class="sx__try"><p class="sx__label">Try searching for</p><div class="sx__chips">' +
      CHIPS.map(function (c) { return '<button type="button" class="sx__chip" data-chip="' + esc(c) + '">' + esc(c) + '</button>'; }).join('') +
      '</div></div>';
  }

  function categories() {
    var counts = {};
    model.results.forEach(function (e) { counts[e.category] = (counts[e.category] || 0) + 1; });
    var order = CATEGORY_ORDER.filter(function (c) { return counts[c]; });
    Object.keys(counts).forEach(function (c) { if (order.indexOf(c) < 0) order.push(c); });
    return { counts: counts, order: order };
  }

  function resultsHtml() {
    var cats = categories();
    var total = model.results.length;
    var visible = model.tab === 'all' ? model.results : model.results.filter(function (e) { return e.category === model.tab; });
    var shown = model.expanded ? visible : visible.slice(0, PAGE_SIZE);
    var tabs = [{ key: 'all', label: 'All (' + total + ')' }].concat(cats.order.map(function (c) {
      return { key: c, label: c + ' (' + cats.counts[c] + ')' };
    }));
    var h = '<div class="sx__results">';
    h += '<p class="sx__count">' + total + (total === 1 ? ' result for ' : ' results for ') +
      '<strong>“' + esc(model.query) + '”</strong></p>';
    h += '<div class="sx__tabs" role="tablist" aria-label="Filter results">' + tabs.map(function (t) {
      return '<button type="button" class="sx__tab" role="tab" data-tab="' + esc(t.key) + '" aria-selected="' +
        (t.key === model.tab) + '" tabindex="' + (t.key === model.tab ? '0' : '-1') + '">' + esc(t.label) + '</button>';
    }).join('') + '</div>';
    h += '<div class="sx__list">' + shown.map(function (e) {
      var meta = e.category + (e.date ? ' · ' + fmtDate(e.date) : '');
      return '<a class="sx__result" href="' + esc(urlFor(e)) + '"><span class="sx__result-text">' +
        '<span class="sx__result-meta">' + esc(meta) + '</span>' +
        '<span class="sx__result-title">' + esc(e.title) + '</span></span>' + ICON_ARROW + '</a>';
    }).join('') + '</div>';
    if (visible.length > shown.length) {
      h += '<button type="button" class="link sx__link" data-more><span>View all results</span>' + ICON_ARROW + '</button>';
    }
    return h + '</div>';
  }

  function render() {
    var m = model;
    root.setAttribute('data-state', m.state);
    submitBtn.classList.toggle('is-empty', !m.query.trim() && m.state !== 'loading');
    submitBtn.setAttribute('aria-label', m.state === 'loading' ? 'Stop searching' : 'Search');
    clearBtn.classList.toggle('has-value', !!input.value);
    input.setAttribute('aria-expanded', String(m.state === 'typing' && m.suggestions.length > 0));
    input.removeAttribute('aria-activedescendant');

    var h = '';
    if (m.state === 'idle') {
      h = chipsHtml() + '<p class="sx__hint">Press Enter to search · Esc to close</p>';
    } else if (m.state === 'typing') {
      if (m.suggestions.length) {
        h = '<div class="sx__suggest" id="sx-suggest" role="listbox" aria-label="Suggestions">' + m.suggestions.map(function (e, i) {
          return '<div class="sx__suggest-item' + (i === m.active ? ' is-active' : '') + '" role="option" id="sx-opt-' + i +
            '" data-idx="' + i + '" aria-selected="' + (i === m.active) + '">' +
            '<span class="icon icon--search sx__suggest-icon" aria-hidden="true"></span>' +
            '<span class="sx__suggest-text">' + highlight(e.title, m.query) + '</span>' +
            '<span class="sx__suggest-cat">' + esc(e.category) + '</span></div>';
        }).join('') + '</div>';
        if (m.moved) input.setAttribute('aria-activedescendant', 'sx-opt-' + m.active);
      }
      h += '<p class="sx__hint">Press Enter to search · Esc to close</p>';
    } else if (m.state === 'loading') {
      h = '<div class="sx__results"><p class="sx__searching">Searching for “' + esc(m.query) + '”…</p>' +
        '<div class="sx__skeleton" aria-hidden="true">' +
        '<div class="sx__skel-row"><span class="sx__skel-meta"></span><span class="sx__skel-title"></span></div>'.repeat(4) +
        '</div></div>';
    } else if (m.state === 'results') {
      h = resultsHtml();
    } else if (m.state === 'none') {
      h = '<div class="sx__message"><p class="sx__message-title">No results for “' + esc(m.query) + '”</p>' +
        '<p class="sx__message-text">Check your spelling or try a more general term.</p></div>' +
        chipsHtml() +
        '<div class="sx__contact"><p>Can’t find what you’re looking for?</p>' +
        '<a class="btn" href="' + esc(BASE + 'contact/') + '"><span>Leave a request</span>' + ICON_ARROW + '</a></div>';
    } else if (m.state === 'error') {
      h = '<div class="sx__message"><p class="sx__message-title">Something went wrong</p>' +
        '<p class="sx__message-text">We couldn’t complete your search. Please try again in a moment.</p></div>' +
        '<div class="sx__actions"><button type="button" class="btn" data-retry><span>Try again</span>' + ICON_ARROW + '</button>' +
        '<a class="link sx__link" href="' + esc(BASE + 'contact/') + '"><span>Leave a request</span>' + ICON_ARROW + '</a></div>';
    }
    bodyEl.innerHTML = h;
  }

  function announce(text) { statusEl.textContent = ''; statusEl.textContent = text; }

  /* --- Search flow --------------------------------------------------------- */
  function setState(state) { model.state = state; render(); }

  function runSearch(q) {
    q = (q || '').trim();
    if (!q) return;
    input.value = q;
    model.query = q;
    model.tab = 'all';
    model.expanded = false;
    var mine = ++seq;
    setState('loading');
    announce('Searching for ' + q);
    var wait = new Promise(function (resolve) { setTimeout(resolve, LOAD_MS); });
    Promise.all([loadIndex(), wait]).then(function (r) {
      if (mine !== seq) return;
      if (norm(q) === ERROR_TERM || forceErrorOnce) {
        forceErrorOnce = false;
        throw new Error('Forced search error');
      }
      model.results = search(r[0], q);
      setState(model.results.length ? 'results' : 'none');
      announce(model.results.length ? model.results.length + ' results for ' + q : 'No results for ' + q);
    }).catch(function () {
      if (mine !== seq) return;
      setState('error');
      announce('Something went wrong. We couldn’t complete your search.');
    });
  }

  function cancelSearch() {
    seq++;
    onInput();
    input.focus({ preventScroll: true });
  }

  function onInput() {
    var q = input.value;
    model.query = q;
    model.moved = false;
    model.active = 0;
    seq++;                                          // typing cancels any search in flight
    if (!q.trim()) {
      model.suggestions = [];
      setState('idle');
      return;
    }
    model.state = 'typing';
    model.suggestions = [];
    render();
    loadIndex().then(function (list) {
      if (input.value !== q || model.state !== 'typing') return;
      model.suggestions = suggest(list, q);
      render();
    }).catch(function () { /* suggestions are optional; the search itself reports the error */ });
  }

  /* --- Open / close --------------------------------------------------------- */
  function focusables() {
    return Array.prototype.filter.call(dialog.querySelectorAll(FOCUSABLE), function (el) {
      return el.offsetParent !== null || el === document.activeElement;
    });
  }
  function setBackgroundInert(on) {
    if (on) {
      Array.prototype.forEach.call(document.body.children, function (el) {
        if (el === root || el.tagName === 'SCRIPT' || el.hasAttribute('inert')) return;
        el.setAttribute('inert', '');
        inerted.push(el);
      });
    } else {
      inerted.forEach(function (el) { el.removeAttribute('inert'); });
      inerted = [];
    }
  }
  function lockScroll(on) {
    var html = document.documentElement;
    if (on) {
      var bar = window.innerWidth - html.clientWidth;
      if (bar > 0) document.body.style.paddingRight = bar + 'px';
      html.classList.add('sx-open');
    } else {
      html.classList.remove('sx-open');
      document.body.style.paddingRight = '';
    }
  }

  function open(trigger) {
    if (isOpen) return;
    clearTimeout(closeTimer);
    isOpen = true;
    lastFocus = trigger || document.activeElement;
    input.value = '';
    model = { state: 'idle', query: '', results: [], tab: 'all', expanded: false, active: 0, moved: false, suggestions: [] };
    seq++;
    render();
    root.hidden = false;
    void root.offsetWidth;                          // commit the closed state so the open animates
    root.classList.add('is-open');
    lockScroll(true);
    setBackgroundInert(true);
    dialog.scrollTop = 0;
    input.focus({ preventScroll: true });
    document.addEventListener('keydown', onKeydown, true);
    loadIndex().catch(function () { /* reported when a search runs */ });   // warm the index
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    seq++;
    document.removeEventListener('keydown', onKeydown, true);
    root.classList.remove('is-open');
    setBackgroundInert(false);
    lockScroll(false);
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus({ preventScroll: true });
    if (instant()) root.hidden = true;
    else closeTimer = setTimeout(function () { root.hidden = true; }, 360);   // slightly over --x-dur
  }

  function onKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'Tab') {
      var items = focusables();
      if (!items.length) { e.preventDefault(); dialog.focus(); return; }
      var first = items[0];
      var last = items[items.length - 1];
      var active = document.activeElement;
      if (!dialog.contains(active)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && (active === first || active === dialog)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    }
  }

  /* --- Build + wire --------------------------------------------------------- */
  function build() {
    root = document.createElement('div');
    root.className = 'sx';
    root.hidden = true;
    root.setAttribute('data-state', 'idle');
    root.innerHTML =
      '<div class="sx__scrim" data-sx-close></div>' +
      '<div class="sx__dialog" role="dialog" aria-modal="true" aria-labelledby="sx-title" tabindex="-1">' +
        '<h2 class="sx__title" id="sx-title">What would you like to search for?</h2>' +
        '<form class="sx__field" role="search" novalidate>' +
          '<span class="icon icon--search" aria-hidden="true"></span>' +
          '<input class="sx__input" type="search" name="q" placeholder="Search projects, solutions and news" ' +
            'autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" role="combobox" ' +
            'aria-autocomplete="list" aria-controls="sx-suggest" aria-expanded="false" aria-label="Search">' +
          '<button type="button" class="sx__clear" aria-label="Clear search"><span class="icon icon--close" aria-hidden="true"></span></button>' +
          '<button type="submit" class="sx__submit is-empty" aria-label="Search">' +
            '<span class="icon" aria-hidden="true"></span><span class="sx__submit-stop" aria-hidden="true"></span></button>' +
        '</form>' +
        '<div class="sx__body"></div>' +
        '<button type="button" class="sx__close" aria-label="Close search" data-sx-close><span class="icon icon--close" aria-hidden="true"></span></button>' +
        '<p class="visually-hidden" role="status" aria-live="polite"></p>' +
      '</div>';
    document.body.appendChild(root);

    dialog = root.querySelector('.sx__dialog');
    form = root.querySelector('.sx__field');
    input = root.querySelector('.sx__input');
    clearBtn = root.querySelector('.sx__clear');
    submitBtn = root.querySelector('.sx__submit');
    bodyEl = root.querySelector('.sx__body');
    statusEl = root.querySelector('[role="status"]');

    root.addEventListener('click', function (e) {
      if (e.target.closest('[data-sx-close]')) close();
    });
    input.addEventListener('input', onInput);
    input.addEventListener('keydown', function (e) {
      if (model.state !== 'typing' || !model.suggestions.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        var n = model.suggestions.length;
        model.active = (model.active + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
        model.moved = true;
        render();
      }
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (model.state === 'loading') { cancelSearch(); return; }     // the button is "Stop" while loading
      var q = input.value;
      if (model.state === 'typing' && model.moved && model.suggestions[model.active]) q = model.suggestions[model.active].title;
      runSearch(q);
    });
    clearBtn.addEventListener('click', function () {
      input.value = '';
      onInput();
      input.focus({ preventScroll: true });
    });

    bodyEl.addEventListener('mousedown', function (e) {
      if (e.target.closest('.sx__suggest-item')) e.preventDefault();   // keep focus in the field
    });
    bodyEl.addEventListener('click', function (e) {
      var chip = e.target.closest('[data-chip]');
      if (chip) { runSearch(chip.getAttribute('data-chip')); input.focus({ preventScroll: true }); return; }
      var opt = e.target.closest('.sx__suggest-item');
      if (opt) { var s = model.suggestions[parseInt(opt.getAttribute('data-idx'), 10)]; if (s) runSearch(s.title); return; }
      var tab = e.target.closest('[data-tab]');
      if (tab) {
        model.tab = tab.getAttribute('data-tab');
        model.expanded = false;
        render();
        var again = bodyEl.querySelector('[data-tab="' + model.tab.replace(/"/g, '\\"') + '"]');
        if (again) again.focus({ preventScroll: true });
        return;
      }
      if (e.target.closest('[data-more]')) {
        model.expanded = true;
        render();
        var rows = bodyEl.querySelectorAll('.sx__result');
        if (rows[PAGE_SIZE]) rows[PAGE_SIZE].focus({ preventScroll: true });
        return;
      }
      if (e.target.closest('[data-retry]')) { runSearch(model.query); return; }
      if (e.target.closest('a[href]')) close();                        // navigating: tidy up (same-page anchors stay put)
    });
    bodyEl.addEventListener('keydown', function (e) {                  // arrow keys move between tabs
      var tab = e.target.closest && e.target.closest('[data-tab]');
      if (!tab || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
      var tabs = Array.prototype.slice.call(bodyEl.querySelectorAll('[data-tab]'));
      var i = tabs.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : -1);
      if (tabs[i]) { e.preventDefault(); tabs[i].click(); }
    });
  }

  function init() {
    build();
    document.addEventListener('click', function (e) {
      var trigger = e.target.closest && e.target.closest('[data-search]');
      if (!trigger) return;
      e.preventDefault();
      open(trigger);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
