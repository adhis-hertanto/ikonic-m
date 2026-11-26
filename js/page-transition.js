/* Page transition: a plum card slides up over the page on click, then slides away on
   the next page to reveal it. The arriving slide is driven by the `pt-arriving` class,
   which the inline head script adds before first paint, so there is no flash. */
(function () {
  var LEAVE_MS = 700;  // card slides up (matches html.pt-leaving)
  var HOLD_MS = 150;   // brief pause while the page is covered
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var root = document.documentElement;

  function isInternal(a, e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
    if (!a || a.target && a.target !== '_self' || a.hasAttribute('download')) return false;
    var href = a.getAttribute('href');
    if (!href || href.charAt(0) === '#') return false;
    var url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return false;
    // Same page, only a hash change: let the browser handle it
    if (url.pathname === location.pathname && url.search === location.search && url.hash) return false;
    return true;
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!isInternal(a, e) || reduced) return;
    e.preventDefault();
    var url = a.href;
    root.classList.remove('pt-arriving');  // the arrival state must not override the next cover
    root.classList.add('pt-leaving');
    try { sessionStorage.setItem('pt-arrive', '1'); } catch (err) { /* private mode: navigate without the arrival slide */ }
    setTimeout(function () { location.href = url; }, LEAVE_MS + HOLD_MS);
  });

  // Clear the arrival state once its slide has finished, so the next click starts from the bottom
  if (root.classList.contains('pt-arriving')) {
    setTimeout(function () { root.classList.remove('pt-arriving'); }, 1100);
  }

  // Back and forward from the page cache: clear any leftover state
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) root.classList.remove('pt-leaving', 'pt-arriving');
  });
})();
