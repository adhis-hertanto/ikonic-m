/* DEV ONLY: press G to toggle the graphic-device guides.
   For every [data-shape] element it draws the real polygon (read from the
   computed clip-path), extends each diagonal edge as a guide line, labels the
   shape with its computed width, height and offsets from its section, and logs
   the same data to the console. window.__shapeReport() returns the raw data.
   Remove this file (and its <script> tag) for production. */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var TOLERANCE = 0.02;   // px difference allowed between dx and dy
  var overlay = null;

  function splitTopLevel(text, separator) {
    var parts = [], depth = 0, current = '';
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (depth === 0 && ch === separator) { parts.push(current.trim()); current = ''; }
      else current += ch;
    }
    if (current.trim()) parts.push(current.trim());
    return parts;
  }

  function resolveLength(token, dimension) {
    var expr = token
      .replace(/calc/g, '')
      .replace(/(-?[\d.]+(?:e-?\d+)?)%/g, '($1*' + dimension + '/100)')
      .replace(/(-?[\d.]+(?:e-?\d+)?)px/g, '($1)');
    if (!/^[\d\s.+\-*/()e]+$/.test(expr)) return NaN;
    return Function('"use strict";return (' + expr + ');')();
  }

  // Polygon vertices in the element's own box, in CSS px.
  function polygonOf(el, width, height) {
    var clip = getComputedStyle(el).clipPath;
    var match = clip && clip.match(/^polygon\((.*)\)$/);
    if (!match) return [[0, 0], [width, 0], [width, height], [0, height]];
    return splitTopLevel(match[1], ',').map(function (point) {
      var xy = splitTopLevel(point, ' ');
      return [resolveLength(xy[0], width), resolveLength(xy[1], height)];
    });
  }

  function measure() {
    return Array.prototype.map.call(document.querySelectorAll('[data-shape]'), function (el) {
      var rect = el.getBoundingClientRect();
      var section = el.closest('section, footer, header') || document.body;
      var host = section.getBoundingClientRect();
      var isGlobe = el.hasAttribute('data-globe');
      var points = isGlobe ? [] : polygonOf(el, rect.width, rect.height);
      var edges = points.map(function (p, i) {
        var q = points[(i + 1) % points.length];
        var dx = q[0] - p[0], dy = q[1] - p[1];
        var adx = Math.abs(dx), ady = Math.abs(dy);
        var angle = Math.atan2(ady, adx) * 180 / Math.PI;
        var kind = ady < TOLERANCE ? 'horizontal' : adx < TOLERANCE ? 'vertical' : 'diagonal';
        return {
          from: p, to: q, dx: dx, dy: dy,
          angle: Math.round(angle * 1000) / 1000,
          kind: kind,
          ok: kind !== 'diagonal' || Math.abs(adx - ady) < TOLERANCE
        };
      });
      var round = function (n) { return Math.round(n * 100) / 100; };
      return {
        name: el.getAttribute('data-shape'),
        section: section.className.split(' ')[0] || section.tagName.toLowerCase(),
        width: round(rect.width),
        height: round(rect.height),
        left: round(rect.left - host.left),
        top: round(rect.top - host.top),
        right: round(host.right - rect.right),
        bottom: round(host.bottom - rect.bottom),
        pageX: rect.left + window.scrollX,
        pageY: rect.top + window.scrollY,
        diagonals: edges.filter(function (e) { return e.kind === 'diagonal'; })
          .map(function (e) { return { dx: round(e.dx), dy: round(e.dy), angle: e.angle, ok: e.ok }; }),
        ok: edges.every(function (e) { return e.ok; }),
        isGlobe: isGlobe,
        edges: edges
      };
    });
  }

  function node(name, attrs, parent) {
    var el = document.createElementNS(SVG_NS, name);
    Object.keys(attrs).forEach(function (key) { el.setAttribute(key, attrs[key]); });
    if (parent) parent.appendChild(el);
    return el;
  }

  function draw() {
    remove();
    var shapes = measure();
    var doc = document.documentElement;
    overlay = document.createElement('div');
    overlay.setAttribute('data-dev-guides', '');
    overlay.style.cssText = 'position:absolute;left:0;top:0;width:100%;pointer-events:none;z-index:9999;' +
      'height:' + doc.scrollHeight + 'px;overflow:hidden;';
    var svg = node('svg', { width: '100%', height: doc.scrollHeight }, null);
    svg.style.cssText = 'position:absolute;left:0;top:0;overflow:visible;';
    overlay.appendChild(svg);

    shapes.forEach(function (shape) {
      var ox = shape.pageX, oy = shape.pageY;
      if (shape.isGlobe) {
        ['var(--color-white)', 'var(--color-black)'].forEach(function (colour, i) {
          node('rect', { x: ox, y: oy, width: shape.width, height: shape.height, fill: 'none' }, svg)
            .style.cssText = 'stroke:' + colour + ';stroke-width:' + (i ? 1 : 3) + 'px;' + (i ? 'stroke-dasharray:6 4;' : '');
        });
      } else {
        var pts = shape.edges.map(function (e) { return (ox + e.from[0]) + ',' + (oy + e.from[1]); }).join(' ');
        ['var(--color-white)', 'var(--color-black)'].forEach(function (colour, i) {
          node('polygon', { points: pts, fill: 'none' }, svg)
            .style.cssText = 'stroke:' + colour + ';stroke-width:' + (i ? 1 : 3) + 'px;';
        });
        // 45 degree guide: each diagonal edge extended past both ends
        shape.edges.filter(function (e) { return e.kind === 'diagonal'; }).forEach(function (e) {
          var len = Math.sqrt(e.dx * e.dx + e.dy * e.dy) || 1;
          var ext = 48, ux = e.dx / len, uy = e.dy / len;
          ['var(--color-white)', e.ok ? 'var(--color-black)' : 'var(--brand-coral-red)'].forEach(function (colour, i) {
            node('line', {
              x1: ox + e.from[0] - ux * ext, y1: oy + e.from[1] - uy * ext,
              x2: ox + e.to[0] + ux * ext, y2: oy + e.to[1] + uy * ext
            }, svg).style.cssText = 'stroke:' + colour + ';stroke-width:' + (i ? 1 : 3) + 'px;' + (i ? 'stroke-dasharray:8 6;' : '');
          });
        });
      }

      var label = document.createElement('div');
      label.style.cssText = 'position:absolute;padding:var(--space-4) var(--space-8);max-width:calc(100% - var(--space-16));' +
        'background:var(--color-black);color:var(--color-white);font:var(--font-weight-medium) 11px/1.4 ui-monospace,Menlo,monospace;' +
        'white-space:pre;';
      var labelLeft = Math.max(4, Math.min(ox + 4, doc.clientWidth - 260));
      label.style.left = labelLeft + 'px';
      label.style.top = Math.max(0, oy + 4) + 'px';
      var angles = shape.isGlobe ? 'circle (not a 45 degree shape)'
        : shape.diagonals.length
          ? shape.diagonals.map(function (d) { return d.angle + '° ' + (d.ok ? 'OK' : 'FAIL') + ' (dx ' + Math.abs(d.dx) + ' dy ' + Math.abs(d.dy) + ')'; }).join('\n')
          : 'no diagonal edges';
      label.textContent = shape.name + '\n' +
        shape.width + ' x ' + shape.height + '\n' +
        'L ' + shape.left + '  T ' + shape.top + '  R ' + shape.right + '  B ' + shape.bottom + '\n' + angles;
      overlay.appendChild(label);
    });

    document.body.appendChild(overlay);
    document.body.style.position = document.body.style.position || 'relative';

    if (console.table) {
      console.table(shapes.map(function (s) {
        return {
          shape: s.name, section: s.section, width: s.width, height: s.height,
          left: s.left, top: s.top, right: s.right, bottom: s.bottom,
          diagonals: s.diagonals.map(function (d) { return d.angle + '°'; }).join(', ') || '-',
          '45 OK': s.isGlobe ? 'n/a' : s.ok
        };
      }));
    }
  }

  function remove() {
    if (overlay) { overlay.remove(); overlay = null; }
  }

  window.__shapeReport = function () {
    return measure().map(function (s) { delete s.edges; return s; });
  };

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'g' && event.key !== 'G') return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    var t = event.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (overlay) remove(); else draw();
  });
  window.addEventListener('resize', function () { if (overlay) draw(); });
})();
