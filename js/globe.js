/* Dot-matrix globe: Canvas 2D, orthographic projection, no libraries.
   Data comes from scripts/generate-globe-data.mjs (data/globe-dots.json, data/locations.json).

   Brand rule: every dot is a diamond whose edges are at exactly 45 degrees in SCREEN space.
   Diamonds are never rotated with the globe and never squashed: each one is built from a
   single half-diagonal h as (x, y-h) (x+h, y) (x, y+h) (x-h, y).

   Orientation (north-up globe)
     The view is described by a centre longitude and latitude (lon, lat). Roll is always zero,
     so north stays up and the globe can never turn upside down.
     Horizontal drag spins the globe around its own polar axis (changes lon).
     Vertical drag tilts it toward or away from the viewer (changes lat, clamped to +/- 30).
     Longitude is clamped to LON_MIN..LON_MAX so the view stays over APAC.
     Auto-rotation ping-pongs between those two ends.

   Tooltip
     A label "<Country> • <n> locations" (n comes from data/projects.json) sits fixed on the centre
     of the selected country. Hovering another country moves it there until the pointer leaves.
     Touch has no hover: tap selects.

   Nothing is selected on load: only the location diamonds are coloured.

   Events (on the [data-globe] element)
     listens  footprints:select  { country }            -> select + ease to centre the country (null clears)
     emits    globe:select       { country, source }    -> so the tabs can sync */
(function () {
  'use strict';

  /* --- Calibrated against Figma node 270:152 (see build report) -------------- */
  var DESIGN = 893;                 // globe frame, design px
  var CENTER = 447.0546;            // disc centre inside the frame
  var RADIUS = 445.9453;            // disc radius
  var FIGMA_POSE = { lon: 108, lat: 18, roll: 0 };   // view centre 108E 18N, north up
  // Dot half-diagonal (design px) = SIZE_A * cos(angle from FALLOFF_AXIS) - SIZE_B.
  // Uniform scale only. The Figma falloff axis leans to the upper left, not straight at the viewer.
  var FALLOFF_AXIS = normalize([-2.22, 2.44, 6.86]);
  var SIZE_A = 7.61;
  var SIZE_B = 0.79;
  var MIN_HALF = 1.0;               // smaller dots are dropped (Figma minimum is 1.09)
  var LOCATION_SCALE = 1.41;        // red location dots relative to a grid dot

  // How far the globe may tilt toward or away from the viewer. Matches onramper.com, which limits
// its orbit to a polar angle of 60-120 degrees (+/-30 latitude). Every country home point sits
// inside this range (China 18N, Vietnam 16.5N, Singapore 1.4N, Australia 25.8S), so each one can
// always be centred, and the far pole never comes into view.
var PITCH_LIMIT_DEG = 30;
// Horizontal limits for the centre longitude. All locations are in APAC (103.7E to 151.2E), so
// the view is kept between these bounds and can never be turned toward Africa, the Americas, etc.
// Every country home point (103.8E to 134.3E) sits inside this range.
var LON_MIN = 95, LON_MAX = 145;
var EDGE_EASE_DEG = 12;           // auto-rotation slows down over this distance before each end
var EDGE_MIN_SPEED = 0.12;        // fraction of full speed right at an end
  var DRAG_THRESHOLD = 3;           // css px before a press becomes a drag
  var HIT_DOT = 10;                 // design px
  var HIT_LOCATION = 12;
  var HIT_SMALL_COUNTRY = 20;       // Singapore
  var RESUME_AFTER_DRAG = 2000;
  var RESUME_AFTER_TAB = 3000;
  var TRANSITION_MS = 1200;
  var COLOUR_MS = 300;
  var HOVER_MS = 150;
  var INERTIA_TAU = 0.7;            // seconds
  var INERTIA_MAX = 70;             // deg / s, keeps the coast gentle
  var RAMP_MS = 1500;               // auto-rotation eases in over this time

  /* --- Small math helpers ------------------------------------------------------ */
  function normalize(v) { var l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }
  // Geographic -> view matrix for a north-up globe centred on (lon, lat), degrees. Row-major 3x3.
  function poseMatrix(lonDeg, latDeg) {
    var l = lonDeg * Math.PI / 180, p = latDeg * Math.PI / 180;
    var sl = Math.sin(l), cl = Math.cos(l), sp = Math.sin(p), cp = Math.cos(p);
    return [-sl, cl, 0, -sp * cl, -sp * sl, cp, cp * cl, cp * sl, sp];
  }
  function geoVector(lonDeg, latDeg) {
    var l = lonDeg * Math.PI / 180, p = latDeg * Math.PI / 180;
    return [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)];
  }
  var DEG = Math.PI / 180;
  var ROOT_HALF = Math.SQRT1_2;     // cos 45 = sin 45
  var probe = document.createElement('canvas').getContext('2d');
  function toRgb(cssColour) {       // any CSS colour (from a token) -> [r, g, b]
    probe.fillStyle = cssColour;
    var hex = probe.fillStyle;      // normalised to #rrggbb
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  }
  function mix(a, b, t) {
    var r = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    return r;
  }
  function toCss(c) { return 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')'; }
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function cssNumber(style, name, fallback) { var v = parseFloat(style.getPropertyValue(name)); return isNaN(v) ? fallback : v; }

  function createGlobe(root, dotData, locationData, projectData) {
    var canvas = root.querySelector('canvas');
    var ctx = canvas.getContext('2d');
    var section = root.closest('section') || root.parentElement;
    var tooltip = section.querySelector('[data-globe-tooltip]');
    var tooltipLabel = tooltip.querySelector('[data-globe-tooltip-label]');
    var list = root.querySelector('[data-globe-locations]');
    var listTitle = root.querySelector('[data-globe-locations-title]');

    var flags = window.IKONIC || {};
    var params = new URLSearchParams(window.location.search);
    var frozen = params.get('pose') === 'figma' || !!flags.snapshot;   // no auto-rotation, for diffing
    var reduced = !!flags.reducedMotion;
    var logFrames = params.has('globe-debug');

    /* --- Tokens: colours and motion come from CSS custom properties ------------ */
    var style = getComputedStyle(root);
    var colour = {
      disc: style.getPropertyValue('--globe-disc').trim(),
      ocean: style.getPropertyValue('--globe-ocean').trim(),
      land: style.getPropertyValue('--globe-land').trim(),
      selected: style.getPropertyValue('--globe-selected').trim(),
      hover: style.getPropertyValue('--globe-hover').trim(),
      location: style.getPropertyValue('--globe-location').trim()
    };
    var period = cssNumber(style, '--globe-rotation-period', 120);
    var autoSpeed = 360 / period;                                // deg / s, eastward

    /* --- Data -------------------------------------------------------------------- */
    var meta = dotData.meta, flat = dotData.dots, count = flat.length / 3;
    var gx = new Float32Array(count), gy = new Float32Array(count), gz = new Float32Array(count);
    var kind = new Uint8Array(count);
    var sx = new Float32Array(count), sy = new Float32Array(count), sh = new Float32Array(count);
    for (var i = 0; i < count; i++) {
      var g = geoVector(flat[i * 3 + 1], flat[i * 3]);
      gx[i] = g[0]; gy[i] = g[1]; gz[i] = g[2]; kind[i] = flat[i * 3 + 2];
    }
    var kinds = meta.kinds;                       // ['ocean','land',<countries>]
    var countries = meta.countries;               // key -> { kind, home, label }
    var countryKeys = Object.keys(countries);
    var keyOfKind = {};
    countryKeys.forEach(function (key) { keyOfKind[countries[key].kind] = key; });
    var smallKind = countries.singapore ? countries.singapore.kind : -1;
    var kindCount = new Array(kinds.length).fill(0);
    for (i = 0; i < count; i++) kindCount[kind[i]]++;
    var buffers = kindCount.map(function (n) { return new Float32Array(n * 3); });   // u, v, side per dot
    var fill = new Array(kinds.length).fill(0);
    var rgb = { land: toRgb(colour.land), hover: toRgb(colour.hover), selected: toRgb(colour.selected) };

    var locations = locationData.locations.filter(function (l) { return countries[l.country]; }).map(function (l) {
      return { id: l.id, name: l.name, country: l.country, g: geoVector(l.lon, l.lat), x: 0, y: 0, half: 0, visible: false, depth: 0 };
    });

    // Location count per country = number of projects in data/projects.json, all statuses.
    var projectCount = {};
    projectData.projects.forEach(function (p) { projectCount[p.country] = (projectCount[p.country] || 0) + 1; });
    function tooltipText(key) {
      var n = projectCount[key] || 0;
      return countries[key].label + ' \u2022 ' + n + (n === 1 ? ' location' : ' locations');
    }

    /* --- State ------------------------------------------------------------------- */
    var lon = FIGMA_POSE.lon, lat = FIGMA_POSE.lat;   // view centre shown on screen, degrees
    var tLon = lon, tLat = lat;                       // where the pointer and inertia want it to be
    var dampTau = cssNumber(style, '--x-globe-damping', 160) / 1000;   // seconds, eases lon/lat toward the target
    var velLon = 0, velLat = 0;                       // inertia, deg / s
    var view = poseMatrix(lon, lat);
    var transition = null;                         // { from, to, start, dur, target }
    var selected = root.getAttribute('data-country') || null;   // none until the visitor picks one
    var selAlpha = {}, hoverAlpha = {};
    countryKeys.forEach(function (key) { selAlpha[key] = key === selected ? 1 : 0; hoverAlpha[key] = 0; });
    var hoverCountry = null, hoverLocation = null, focusLocation = null, shownCountry = null;
    var drag = null, dragging = false;
    var autoDir = 1;                                  // +1 sweeps east (centre lon decreases), -1 sweeps back west
    var resumeAt = 0, rampStart = 0;
    var cssSize = 0, unit = 1, scale = 1, dpr = 1;
    var visible = true, raf = 0, last = 0, dirty = true, debug = false;
    var frameTimes = [], frameGaps = [], logTimer = 0;

    function home(key) { return countries[key].home; }      // [lon, lat]
    function composeView() { view = poseMatrix(lon, lat); }
    function wrap180(d) { return ((d + 540) % 360 + 360) % 360 - 180; }
    function clampLat(p) { return clamp(p, -PITCH_LIMIT_DEG, PITCH_LIMIT_DEG); }
    function clampLon(l) { return clamp(l, LON_MIN, LON_MAX); }
    // Jump straight to a pose (transitions, reduced motion, tests)
    function setPose(newLon, newLat) {
      lon = tLon = clampLon(newLon);
      lat = tLat = clampLat(newLat);
      composeView();
    }
    // Set where the view should go; the displayed pose eases there
    function setTarget(newLon, newLat) {
      tLon = clampLon(newLon);
      tLat = clampLat(newLat);
    }

    /* --- Sizing: CSS size uses --u, backing store uses devicePixelRatio (max 2) --- */
    function resize() {
      var rect = canvas.getBoundingClientRect();
      if (!rect.width) return;
      cssSize = rect.width;
      unit = cssSize / DESIGN;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      var px = Math.round(cssSize * dpr);
      if (canvas.width !== px) { canvas.width = px; canvas.height = px; }
      scale = px / DESIGN;
      invalidate();
    }

    /* --- Render --------------------------------------------------------------------- */
    function draw() {
      var t0 = performance.now();
      var m = view, s = scale;
      var lx = FALLOFF_AXIS[0], ly = FALLOFF_AXIS[1], lz = FALLOFF_AXIS[2];
      var k;
      for (k = 0; k < kinds.length; k++) fill[k] = 0;

      // Project. Each visible dot is stored as a square in a frame rotated by exactly 45 degrees:
      // (u, v) = centre in that frame, side = h * sqrt(2). Drawn under one rotate(45deg) transform
      // that square is the diamond (x, y-h) (x+h, y) (x, y+h) (x-h, y) in screen space.
      for (var i = 0; i < count; i++) {
        var x = gx[i], y = gy[i], z = gz[i];
        var vz = m[6] * x + m[7] * y + m[8] * z;
        if (vz <= 0) { sh[i] = 0; continue; }                       // back-face cull
        var vx = m[0] * x + m[1] * y + m[2] * z;
        var vy = m[3] * x + m[4] * y + m[5] * z;
        var h = SIZE_A * (vx * lx + vy * ly + vz * lz) - SIZE_B;    // uniform falloff
        if (h < MIN_HALF) { sh[i] = 0; continue; }
        var px = (CENTER + vx * RADIUS) * s, py = (CENTER - vy * RADIUS) * s, hs = h * s;
        sx[i] = px; sy[i] = py; sh[i] = hs;
        var kd = kind[i], buf = buffers[kd], n = fill[kd];
        buf[n] = (px + py) * ROOT_HALF; buf[n + 1] = (py - px) * ROOT_HALF; buf[n + 2] = hs * Math.SQRT2;
        fill[kd] = n + 3;
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = colour.disc;
      ctx.beginPath(); ctx.arc(CENTER * s, CENTER * s, RADIUS * s, 0, Math.PI * 2); ctx.fill();

      // One batch per colour, drawn in order: ocean, land, countries, locations.
      ctx.setTransform(ROOT_HALF, ROOT_HALF, -ROOT_HALF, ROOT_HALF, 0, 0);
      for (k = 0; k < kinds.length; k++) {
        var key = keyOfKind[k];
        ctx.fillStyle = k === 0 ? colour.ocean : !key ? colour.land
          : toCss(mix(mix(rgb.land, rgb.hover, hoverAlpha[key]), rgb.selected, selAlpha[key]));
        var data = buffers[k], end = fill[k];
        for (var j = 0; j < end; j += 3) { var side = data[j + 2]; ctx.fillRect(data[j] - side / 2, data[j + 1] - side / 2, side, side); }
      }

      ctx.fillStyle = colour.location;
      locations.forEach(function (loc) {
        var x = loc.g[0], y = loc.g[1], z = loc.g[2];
        var vz = m[6] * x + m[7] * y + m[8] * z;
        var vx = m[0] * x + m[1] * y + m[2] * z, vy = m[3] * x + m[4] * y + m[5] * z;
        var h = (SIZE_A * (vx * lx + vy * ly + vz * lz) - SIZE_B) * LOCATION_SCALE;
        loc.depth = vz;
        loc.visible = vz > 0 && h >= MIN_HALF;
        if (!loc.visible) return;
        if (loc === hoverLocation || loc === focusLocation) h *= 1.2;   // PLACEHOLDER active state: uniform scale only
        loc.x = (CENTER + vx * RADIUS) * unit; loc.y = (CENTER - vy * RADIUS) * unit; loc.half = h * unit;
        var px = loc.x * dpr, py = loc.y * dpr, side = h * s * Math.SQRT2;
        ctx.fillRect((px + py) * ROOT_HALF - side / 2, (py - px) * ROOT_HALF - side / 2, side, side);
      });
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      if (debug) drawDebug();
      positionTooltip();

      var cost = performance.now() - t0;
      frameTimes.push(cost); if (frameTimes.length > 240) frameTimes.shift();
    }

    /* --- Debug overlay (press G): outlines every visible diamond and checks its edges --- */
    function measureEdges() {
      // Rebuilds each visible diamond exactly as it is drawn (a square pushed through the
      // 45 degree transform) and measures the angle of all four edges.
      var worst = 0, n = 0, c = ROOT_HALF;
      for (var i = 0; i < count; i++) {
        var h = sh[i]; if (!h) continue; n++;
        var u = (sx[i] + sy[i]) * c, v = (sy[i] - sx[i]) * c, half = h * Math.SQRT2 / 2;
        var sq = [[u - half, v - half], [u + half, v - half], [u + half, v + half], [u - half, v + half]]
          .map(function (q) { return [c * q[0] - c * q[1], c * q[0] + c * q[1]]; });
        for (var e = 0; e < 4; e++) {
          var a = sq[e], b = sq[(e + 1) % 4];
          var angle = Math.atan2(Math.abs(b[1] - a[1]), Math.abs(b[0] - a[0])) * 180 / Math.PI;
          worst = Math.max(worst, Math.abs(angle - 45));
        }
      }
      return { dots: n, edges: n * 4, maxDeviationDeg: +worst.toFixed(9) };
    }
    function drawDebug() {
      var s = scale, outline = new Path2D();
      for (var i = 0; i < count; i++) {
        var h = sh[i]; if (!h) continue;
        outline.moveTo(sx[i], sy[i] - h); outline.lineTo(sx[i] + h, sy[i]); outline.lineTo(sx[i], sy[i] + h); outline.lineTo(sx[i] - h, sy[i]); outline.closePath();
      }
      ctx.lineWidth = Math.max(1, dpr * 0.75);
      ctx.strokeStyle = getComputedStyle(root).getPropertyValue('--color-black').trim();
      ctx.stroke(outline);
      // 45 degree reference lines through the disc
      ctx.setLineDash([8 * dpr, 6 * dpr]);
      ctx.beginPath();
      for (var o = -3; o <= 3; o++) {
        var off = o * 120 * s;
        ctx.moveTo(off, 0); ctx.lineTo(off + DESIGN * s, DESIGN * s);
        ctx.moveTo(off + DESIGN * s, 0); ctx.lineTo(off, DESIGN * s);
      }
      ctx.stroke(); ctx.setLineDash([]);
      var r = measureEdges();
      var text = r.dots + ' dots, ' + r.edges + ' edges, max deviation from 45°: ' + r.maxDeviationDeg.toFixed(4) + '°';
      ctx.font = (12 * dpr) + 'px ui-monospace, Menlo, monospace';
      var w = ctx.measureText(text).width;
      ctx.fillStyle = ctx.strokeStyle; ctx.fillRect(8 * dpr, 8 * dpr, w + 16 * dpr, 24 * dpr);
      ctx.fillStyle = colour.disc; ctx.fillText(text, 16 * dpr, 25 * dpr);
    }

    /* --- Country label: fixed on the centre of a country, not on the cursor ----------------
       Shows the selected country, or the hovered one while the pointer is over another country.
       The centre is the average screen position of the country's visible dots, so it follows the
       globe as it turns and the label hides once the country rotates out of view. */
    function countryCentre(key) {
      var k = countries[key].kind, n = 0, ax = 0, ay = 0;
      for (var i = 0; i < count; i++) {
        if (kind[i] !== k || !sh[i]) continue;
        ax += sx[i]; ay += sy[i]; n++;
      }
      return n ? [ax / n / dpr, ay / n / dpr] : null;      // css px inside the canvas
    }
    function positionTooltip() {
      var key = hoverCountry || selected;
      var centre = key && projectCount[key] && !transition ? countryCentre(key) : null;
      if (!centre) { tooltip.classList.remove('is-visible'); shownCountry = null; return; }
      if (key !== shownCountry) { tooltipLabel.textContent = tooltipText(key); shownCountry = key; }
      var host = section.getBoundingClientRect(), box = canvas.getBoundingClientRect();
      var size = tooltip.getBoundingClientRect(), w = size.width, h = size.height, pad = 4 * unit;
      var x = clamp(box.left - host.left + centre[0], w / 2 + pad, host.width - w / 2 - pad);
      var y = clamp(box.top - host.top + centre[1], h / 2 + pad, host.height - h / 2 - pad);
      tooltip.style.transform = 'translate(' + (x - w / 2).toFixed(2) + 'px,' + (y - h / 2).toFixed(2) + 'px)';
      tooltip.classList.add('is-visible');
    }

    /* --- Animation loop ------------------------------------------------------------------ */
    function autoAllowed(now) {
      return !frozen && !reduced && !dragging && !transition && !hoverCountry && !focusLocation && now >= resumeAt;
    }
    function fading() {
      for (var i = 0; i < countryKeys.length; i++) {
        var key = countryKeys[i];
        if (Math.abs(selAlpha[key] - (key === selected ? 1 : 0)) > 0.001) return true;
        if (Math.abs(hoverAlpha[key] - (key === hoverCountry && key !== selected ? 1 : 0)) > 0.001) return true;
      }
      return false;
    }
    function update(dt, now) {
      if (transition) {
        var t = clamp((now - transition.start) / transition.dur, 0, 1), e = easeInOut(t);
        setPose(transition.fromLon + transition.dLon * e, transition.fromLat + (transition.toLat - transition.fromLat) * e);
        if (t >= 1) { transition = null; resumeAt = now + RESUME_AFTER_TAB; rampStart = resumeAt; }
      } else if (!dragging) {
        var auto = 0;
        if (autoAllowed(now)) {
          if (!rampStart || rampStart < resumeAt) rampStart = Math.max(resumeAt, now);
          var r = clamp((now - rampStart) / RAMP_MS, 0, 1);
          auto = autoSpeed * r * r * (3 - 2 * r);                 // eased acceleration, deg / s
          // Sweep to one end, then back to the other. Slow down gently approaching each end.
          if (tLon <= LON_MIN + 1e-6) autoDir = -1; else if (tLon >= LON_MAX - 1e-6) autoDir = 1;
          var toEnd = autoDir > 0 ? tLon - LON_MIN : LON_MAX - tLon;
          var ease = clamp(toEnd / EDGE_EASE_DEG, 0, 1);
          auto *= autoDir * (EDGE_MIN_SPEED + (1 - EDGE_MIN_SPEED) * ease * ease * (3 - 2 * ease));
        } else { rampStart = 0; }
        if (velLon || velLat) {                                   // release coast, decays smoothly
          var decay = Math.exp(-dt / INERTIA_TAU);
          velLon *= decay; velLat *= decay;
          if (Math.abs(velLon) < 0.05) velLon = 0;
          if (Math.abs(velLat) < 0.05) velLat = 0;
        }
        // Eastward is to the right on a north-up globe, so the centre longitude moves left (-).
        var nLon = tLon - auto * dt + velLon * dt, nLat = tLat + velLat * dt;
        if (nLon < LON_MIN || nLon > LON_MAX) velLon = 0;         // stop coasting into a wall
        if (nLat < -PITCH_LIMIT_DEG || nLat > PITCH_LIMIT_DEG) velLat = 0;
        setTarget(nLon, nLat);
      }
      if (!transition) {
        // Damping, like OrbitControls.enableDamping: the view eases toward the target, so drags
        // and releases glide, and the latitude limit is approached rather than snapped to.
        var k = reduced || frozen ? 1 : 1 - Math.exp(-dt / dampTau);
        lon = wrap180(lon + wrap180(tLon - lon) * k);
        lat += (tLat - lat) * k;
        if (Math.abs(lat - tLat) < 1e-4) lat = tLat;
        composeView();
      }
      var kc = reduced ? 1 : dt * 1000 / COLOUR_MS, kh = reduced ? 1 : dt * 1000 / HOVER_MS;
      countryKeys.forEach(function (key) {
        var st = key === selected ? 1 : 0, ht = key === hoverCountry && key !== selected ? 1 : 0;
        selAlpha[key] += clamp(st - selAlpha[key], -kc, kc);
        hoverAlpha[key] += clamp(ht - hoverAlpha[key], -kh, kh);
      });
    }
    function settling() {
      return Math.abs(wrap180(tLon - lon)) > 1e-4 || Math.abs(tLat - lat) > 1e-4;
    }
    function active(now) {
      if (dirty || transition || dragging || velLon || velLat || fading() || settling()) return true;
      if (frozen || reduced) return false;
      return !(hoverCountry || focusLocation);      // waiting to resume, or auto-rotating
    }
    function frame(now) {
      raf = 0;
      var gap = last ? now - last : 16.7;
      var dt = Math.min(gap, 100) / 1000;
      last = now;
      frameGaps.push(gap); if (frameGaps.length > 240) frameGaps.shift();
      dirty = false;
      update(dt, now);
      draw();
      if (logFrames && now - logTimer > 2000) { logTimer = now; console.log('[globe] frame', stats()); }
      if (visible && !document.hidden && active(now)) schedule(); else last = 0;
    }
    function schedule() { if (!raf) raf = requestAnimationFrame(frame); }
    function invalidate() { dirty = true; if (visible && !document.hidden) schedule(); }
    function stats() {
      var avg = function (a) { return a.length ? a.reduce(function (s, v) { return s + v; }, 0) / a.length : 0; };
      var sorted = frameGaps.slice().sort(function (a, b) { return a - b; });
      return {
        drawMs: +avg(frameTimes).toFixed(2),
        frameMs: +avg(frameGaps).toFixed(2),
        p95FrameMs: +(sorted[Math.floor(sorted.length * 0.95)] || 0).toFixed(2),
        fps: +(1000 / (avg(frameGaps) || 16.7)).toFixed(1),
        backingPx: canvas.width, dpr: dpr
      };
    }

    /* --- Selection ---------------------------------------------------------------------- */
    function renderList() {
      if (!list) return;
      if (listTitle) listTitle.textContent = selected ? 'Locations in ' + countries[selected].label : 'All locations';
      list.innerHTML = '';
      locations.filter(function (l) { return !selected || l.country === selected; }).forEach(function (loc) {
        var item = document.createElement('li');
        var button = document.createElement('button');
        button.type = 'button';
        button.textContent = loc.name;
        button.addEventListener('focus', function () {
          focusLocation = loc;
          if (!loc.visible || loc.depth < 0.25) centre(loc.country);   // bring it to the front
          invalidate();
        });
        button.addEventListener('blur', function () { if (focusLocation === loc) focusLocation = null; resumeSoon(300); invalidate(); });
        item.appendChild(button); list.appendChild(item);
      });
    }
    function centre(key) {
      var h = home(key);
      velLon = velLat = 0;
      if (reduced || frozen) { setPose(h[0], h[1]); resumeAt = performance.now() + RESUME_AFTER_TAB; invalidate(); return; }
      var dLon = ((h[0] - lon + 540) % 360 + 360) % 360 - 180;     // shortest way round
      transition = { fromLon: lon, dLon: dLon, fromLat: lat, toLat: h[1], start: performance.now(), dur: TRANSITION_MS };
      invalidate();
    }
    function select(key, options) {
      if (key !== null && !countries[key]) return;
      options = options || {};
      var changed = key !== selected;
      selected = key;
      if (key) root.setAttribute('data-country', key); else root.removeAttribute('data-country');
      if (changed) { focusLocation = null; renderList(); }
      if (options.centre && key) centre(key);
      if (options.emit !== false) {
        root.dispatchEvent(new CustomEvent('globe:select', { bubbles: true, detail: { country: key, source: options.source || 'globe' } }));
      }
      invalidate();
    }
    function resumeSoon(ms) { resumeAt = Math.max(resumeAt, performance.now() + ms); rampStart = 0; }

    /* --- Hit testing: nearest visible dot / location under the pointer ------------------- */
    function pick(cx, cy) {                      // css px inside the canvas
      var best = null, bestD = Infinity, i;
      for (i = 0; i < locations.length; i++) {
        var l = locations[i]; if (!l.visible) continue;
        var d = Math.hypot(l.x - cx, l.y - cy), reach = Math.max(HIT_LOCATION * unit, l.half);
        if (d <= reach && d < bestD) { best = l; bestD = d; }
      }
      if (best) return { location: best, country: best.country };
      var px = cx * dpr, py = cy * dpr;
      var rDot = HIT_DOT * scale, rSmall = HIT_SMALL_COUNTRY * scale;
      var hit = -1, hitD = Infinity, small = -1, smallD = Infinity;
      for (i = 0; i < count; i++) {
        if (!sh[i]) continue;
        var dx = sx[i] - px, dy = sy[i] - py;
        if (dx > rSmall || dx < -rSmall || dy > rSmall || dy < -rSmall) continue;
        var dd = Math.sqrt(dx * dx + dy * dy);
        if (kind[i] === smallKind && dd <= rSmall && dd < smallD) { small = i; smallD = dd; }
        if (dd <= rDot && dd < hitD) { hit = i; hitD = dd; }
      }
      if (hit >= 0 && kind[hit] >= 2) return { country: keyOfKind[kind[hit]] };
      if (small >= 0) return { country: keyOfKind[smallKind] };
      return null;
    }
    function insideDisc(cx, cy) { return Math.hypot(cx - CENTER * unit, cy - CENTER * unit) <= RADIUS * unit; }
    function local(event) { var r = canvas.getBoundingClientRect(); return [event.clientX - r.left, event.clientY - r.top]; }

    var hoverPending = null, hoverRaf = 0;
    function applyHover() {
      hoverRaf = 0;
      if (!hoverPending || dragging) return;
      var hit = insideDisc(hoverPending[0], hoverPending[1]) ? pick(hoverPending[0], hoverPending[1]) : null;
      var loc = hit && hit.location ? hit.location : null;
      var country = hit ? hit.country : null;
      if (loc !== hoverLocation || country !== hoverCountry) {
        if (hoverCountry && !country) resumeSoon(300);
        hoverLocation = loc; hoverCountry = country;
        invalidate();
      }
      canvas.style.cursor = hit ? 'pointer' : insideDisc(hoverPending[0], hoverPending[1]) ? 'grab' : '';
    }
    function clearHover() {
      hoverPending = null;
      if (hoverCountry) resumeSoon(300);
      if (hoverLocation || hoverCountry) { hoverLocation = null; hoverCountry = null; invalidate(); }
      if (!dragging) canvas.style.cursor = '';
    }

    /* --- Pointer: drag to rotate (mouse + touch). The wheel is never touched. ------------ */
    canvas.addEventListener('pointerdown', function (event) {
      if (event.button !== 0 && event.pointerType === 'mouse') return;
      var p = local(event);
      if (!insideDisc(p[0], p[1])) return;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, t: performance.now(), v: 0, moved: false };
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', function (event) {
      if (drag && event.pointerId === drag.id) {
        var dx = event.clientX - drag.x, dy = event.clientY - drag.y;
        if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_THRESHOLD) return;
        if (!drag.moved) {
          drag.moved = true; dragging = true; velLon = velLat = 0;
          if (transition) transition = null;
          hoverLocation = null; hoverCountry = null;
          canvas.style.cursor = 'grabbing';
          root.classList.add('is-dragging');
        }
        // The surface follows the pointer: dragging right moves the centre longitude left,
        // dragging down tilts the globe so its near side moves down.
        var now = performance.now(), perPx = 1 / (RADIUS * unit * DEG);
        var dLon = -dx * perPx, dLat = dy * perPx;
        setTarget(tLon + dLon, tLat + dLat);
        var dt = Math.max((now - drag.t) / 1000, 0.001);
        drag.v = drag.v * 0.6 + (dLon / dt) * 0.4;
        drag.vLat = (drag.vLat || 0) * 0.6 + (dLat / dt) * 0.4;
        drag.x = event.clientX; drag.y = event.clientY; drag.t = now;
        invalidate();
        return;
      }
      if (event.pointerType === 'touch') return;      // touch has no hover: tap selects
      hoverPending = local(event);
      if (!hoverRaf) hoverRaf = requestAnimationFrame(applyHover);
    });
    function endDrag(event) {
      if (!drag || event.pointerId !== drag.id) return;
      var wasDrag = drag.moved, now = performance.now();
      if (canvas.hasPointerCapture(drag.id)) canvas.releasePointerCapture(drag.id);
      if (wasDrag) {
        var idle = now - drag.t > 80;                                   // pointer rested before release
        velLon = reduced || idle ? 0 : clamp(drag.v, -INERTIA_MAX, INERTIA_MAX);
        velLat = reduced || idle ? 0 : clamp(drag.vLat || 0, -INERTIA_MAX, INERTIA_MAX);
        resumeAt = now + RESUME_AFTER_DRAG; rampStart = 0;
      } else if (event.type === 'pointerup') {
        var p = local(event), hit = pick(p[0], p[1]);
        if (hit && hit.country) select(hit.country, { source: 'globe' });
      }
      drag = null; dragging = false;
      root.classList.remove('is-dragging');
      hoverPending = local(event);
      if (event.pointerType === 'mouse') applyHover(); else clearHover();
      invalidate();
    }
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('pointerleave', function () { if (!drag) clearHover(); });

    /* --- External control ------------------------------------------------------------------ */
    root.addEventListener('footprints:select', function (event) {
      select(event.detail.country, { centre: true, emit: false });
    });
    document.addEventListener('keydown', function (event) {
      if ((event.key !== 'g' && event.key !== 'G') || event.metaKey || event.ctrlKey || event.altKey) return;
      var t = event.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      debug = !debug;
      if (debug) console.log('[globe] 45 degree check', measureEdges());
      invalidate();
    });

    /* --- Lifecycle: resize, off-screen pause, hidden tab pause ------------------------------- */
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
    window.addEventListener('resize', resize);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible) invalidate();
      }, { rootMargin: '100px' }).observe(section);
    }
    document.addEventListener('visibilitychange', function () { if (!document.hidden) invalidate(); });
    window.matchMedia('(resolution: 1dppx)').addEventListener('change', resize);

    renderList();
    resize();
    root.setAttribute('data-ready', '');

    // Test / debug hooks
    window.__globe = {
      stats: stats,
      edges: measureEdges,
      state: function () {
        return {
          selected: selected, lon: lon, lat: lat, targetLon: tLon, targetLat: tLat, spin: lon, pitch: lat, dragging: dragging, inertia: velLon, transition: !!transition,
          running: !!raf, hoverCountry: hoverCountry, hoverLocation: hoverLocation && hoverLocation.id,
          tooltip: shownCountry && tooltipText(shownCountry), view: view.slice(), cssSize: cssSize, backing: canvas.width,
          locations: locations.map(function (l) { return { id: l.id, country: l.country, x: l.x, y: l.y, half: l.half, visible: l.visible }; })
        };
      },
      rotate: function (dLon, dLat) { setTarget(tLon + (dLon || 0), tLat + (dLat || 0)); invalidate(); },
      countryPoint: function (key) {          // a visible dot of this country, css px inside the canvas
        var k = countries[key].kind, bestI = -1, bestZ = -1;
        for (var i = 0; i < count; i++) if (kind[i] === k && sh[i] > bestZ) { bestZ = sh[i]; bestI = i; }
        return bestI < 0 ? null : [sx[bestI] / dpr, sy[bestI] / dpr];
      },
      dots: function () {                     // visible dots: [x, y, half, kind] in css px
        var out = [];
        for (var i = 0; i < count; i++) if (sh[i]) out.push([sx[i] / dpr, sy[i] / dpr, sh[i] / dpr, kind[i]]);
        return out;
      },
      pose: FIGMA_POSE
    };
  }

  document.addEventListener('DOMContentLoaded', function () {
    var root = document.querySelector('[data-globe]');
    if (!root) return;
    Promise.all([
      fetch('data/globe-dots.json').then(function (r) { return r.json(); }),
      fetch('data/locations.json').then(function (r) { return r.json(); }),
      fetch('data/projects.json').then(function (r) { return r.json(); })
    ]).then(function (data) { createGlobe(root, data[0], data[1], data[2]); })
      .catch(function (error) { root.setAttribute('data-ready', 'error'); console.error('[globe]', error); });
  });
})();
