/* News listing ("Load more") and News Article (share links, related carousel arrows). */
(function () {
  'use strict';

  var PAGE_SIZE = 3;

  function buildCard(item) {
    var li = document.createElement('li');
    var a = document.createElement('a');
    a.className = 'card';
    a.href = '../news-article/';

    var photo = document.createElement('span');
    photo.className = 'card__photo';
    var img = document.createElement('img');
    img.src = '../assets/img/' + item.img;
    img.alt = '';
    img.width = item.w;
    img.height = item.h;
    img.loading = 'lazy';
    photo.appendChild(img);

    var content = document.createElement('span');
    content.className = 'card__content';
    var text = document.createElement('span');
    text.className = 'card__text';
    var title = document.createElement('span');
    title.className = 'card__title t-subline-l';
    title.setAttribute('role', 'heading');
    title.setAttribute('aria-level', '3');
    title.textContent = item.title;
    var meta = document.createElement('span');
    meta.className = 'card__meta t-body-s';
    meta.textContent = item.meta;
    text.appendChild(title);
    text.appendChild(meta);
    var more = document.createElement('span');
    more.className = 'card__more';
    var icon = document.createElement('span');
    icon.className = 'icon icon--l';
    icon.setAttribute('aria-hidden', 'true');
    more.appendChild(icon);
    content.appendChild(text);
    content.appendChild(more);

    a.appendChild(photo);
    a.appendChild(content);
    li.appendChild(a);
    return li;
  }

  function initLoadMore() {
    var grid = document.querySelector('[data-news-grid]');
    var button = document.querySelector('[data-news-more]');
    var dataEl = document.getElementById('news-more');
    if (!grid || !button || !dataEl) return;

    var items = [];
    try { items = JSON.parse(dataEl.textContent) || []; } catch (e) { items = []; }
    var status = document.querySelector('[data-news-status]');
    var actions = button.parentNode;
    if (!items.length) { actions.hidden = true; return; }

    button.addEventListener('click', function () {
      var batch = items.splice(0, PAGE_SIZE);
      var first = null;
      batch.forEach(function (item) {
        var li = buildCard(item);
        grid.appendChild(li);
        if (!first) first = li.firstChild;
      });
      if (status) status.textContent = batch.length + ' more stories loaded.';
      if (first) first.focus({ preventScroll: false });
      if (!items.length) actions.hidden = true;
    });
  }

  function initShare() {
    var url = encodeURIComponent(window.location.href);
    var targets = {
      linkedin: 'https://www.linkedin.com/sharing/share-offsite/?url=',
      facebook: 'https://www.facebook.com/sharer/sharer.php?u='
    };
    Array.prototype.forEach.call(document.querySelectorAll('[data-share]'), function (a) {
      var base = targets[a.getAttribute('data-share')];
      if (base) a.href = base + url;
    });
  }

  function initRelated() {
    var root = document.querySelector('[data-news-rel]');
    if (!root) return;
    var viewport = root.querySelector('[data-rel-viewport]');
    var prev = root.querySelector('[data-rel-prev]');
    var next = root.querySelector('[data-rel-next]');
    var slides = Array.prototype.slice.call(viewport.querySelectorAll('.news-rel__slide'));
    if (!viewport || !prev || !next || !slides.length) return;

    function step() {
      var gap = slides.length > 1 ? slides[1].offsetLeft - slides[0].offsetLeft : slides[0].offsetWidth;
      return gap;
    }
    function update() {
      var max = viewport.scrollWidth - viewport.clientWidth;
      prev.setAttribute('aria-disabled', viewport.scrollLeft <= 1 ? 'true' : 'false');
      next.setAttribute('aria-disabled', viewport.scrollLeft >= max - 1 ? 'true' : 'false');
    }
    prev.addEventListener('click', function () {
      if (prev.getAttribute('aria-disabled') === 'true') return;
      viewport.scrollBy({ left: -step() });
    });
    next.addEventListener('click', function () {
      if (next.getAttribute('aria-disabled') === 'true') return;
      viewport.scrollBy({ left: step() });
    });
    viewport.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  function init() { initLoadMore(); initShare(); initRelated(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
