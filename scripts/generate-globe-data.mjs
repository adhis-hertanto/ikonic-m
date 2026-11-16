// Generates the dot-matrix globe data. Run: npm run globe:data
// Dev-only: world-atlas + topojson-client + d3-geo are used here and nowhere at runtime.
//
// Output
//   data/globe-dots.json  { meta, dots: [lat, lon, kind, lat, lon, kind, ...] }
//                         kind is an index into meta.kinds (0 ocean, 1 land, 2+ interactive countries)
//   data/locations.json   city pins (only written if it does not exist, so
//                         real content is never overwritten)
//
// Lattice: Fibonacci (golden-angle) spiral about the geographic polar axis, which is what the
// Figma globe (node 270:152) uses. DOT_COUNT was measured from the Figma export: 1080 dots inside
// a 250px radius of the 446px disc => ~12,500 dots on the full sphere (pitch ~13.4px at centre).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { feature } from 'topojson-client';
import { geoContains, geoBounds, geoCentroid, geoDistance } from 'd3-geo';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const topo = JSON.parse(readFileSync(require.resolve('world-atlas/countries-50m.json'), 'utf8'));

const DOT_COUNT = 12500;
const MIN_COUNTRY_DOTS = 5;
const KINDS = ['ocean', 'land', 'china', 'singapore', 'vietnam', 'australia', 'malaysia', 'philippines'];
// ISO 3166-1 numeric ids in world-atlas
const COUNTRIES = {
  china: { id: 156, label: 'China', home: [108, 18] },   // home = Figma default pose (centre lon, lat)
  singapore: { id: 702, label: 'Singapore', snap: [[103.82, 1.35]] },
  vietnam: { id: 704, label: 'Vietnam' },
  australia: { id: 36, label: 'Australia' },
  malaysia: { id: 458, label: 'Malaysia', home: [109, 4] },        // centred so Peninsular and Borneo both show
  philippines: { id: 608, label: 'Philippines', home: [122, 12.5] },
};

const features = feature(topo, topo.objects.countries).features.map((f) => ({ f, id: Number(f.id), bounds: geoBounds(f) }));
const inBounds = (b, lon, lat) =>
  lat >= b[0][1] && lat <= b[1][1] &&
  (b[0][0] <= b[1][0] ? lon >= b[0][0] && lon <= b[1][0] : lon >= b[0][0] || lon <= b[1][0]);
const countryAt = (lon, lat) => {
  for (const c of features) if (inBounds(c.bounds, lon, lat) && geoContains(c.f, [lon, lat])) return c.id;
  return null;
};
const kindOfId = new Map(Object.entries(COUNTRIES).map(([key, c]) => [c.id, KINDS.indexOf(key)]));

// 1. Fibonacci lattice
const GOLDEN_ANGLE = 180 * (3 - Math.sqrt(5));
const dots = [];
for (let i = 0; i < DOT_COUNT; i++) {
  const lat = (Math.asin(1 - (2 * i + 1) / DOT_COUNT) * 180) / Math.PI;
  const lon = ((((i * GOLDEN_ANGLE) % 360) + 540) % 360) - 180;
  const id = countryAt(lon, lat);
  dots.push({ lat, lon, kind: id === null ? 0 : kindOfId.get(id) ?? 1 });
}

// 2. Small countries: make sure each interactive country is present and has enough dots
const nearestDots = (lon, lat, filter) =>
  dots.map((d, i) => [geoDistance([lon, lat], [d.lon, d.lat]), i]).filter(([, i]) => filter(dots[i])).sort((a, b) => a[0] - b[0]);
const report = {};
for (const [key, c] of Object.entries(COUNTRIES)) {
  const kind = KINDS.indexOf(key);
  const feat = features.find((x) => x.id === c.id);
  const natural = dots.filter((d) => d.kind === kind).length;
  let snapped = 0, tagged = 0;
  // 2a. Snap the nearest dot onto explicit coordinates (countries smaller than one dot pitch)
  for (const [lon, lat] of c.snap || []) {
    const [, i] = nearestDots(lon, lat, (d) => d.kind !== kind)[0];
    dots[i] = { lat, lon, kind };
    snapped++;
    const next = nearestDots(lon, lat, (d) => d.kind !== kind && d.kind < 2)[0];   // second dot for visibility
    dots[next[1]].kind = kind; tagged++;
  }
  // 2b. Top up to MIN_COUNTRY_DOTS with the dots that sit closest to the country's area
  if (!c.snap && dots.filter((d) => d.kind === kind).length < MIN_COUNTRY_DOTS) {
    const tally = new Map();
    const [[w, s], [e, n]] = feat.bounds;
    for (let lat = s; lat <= n; lat += 0.25) for (let lon = w; lon <= e; lon += 0.25) {
      if (!geoContains(feat.f, [lon, lat])) continue;
      const [, i] = nearestDots(lon, lat, (d) => d.kind < 2)[0];
      tally.set(i, (tally.get(i) || 0) + 1);
    }
    for (const [i] of [...tally].sort((a, b) => b[1] - a[1])) {
      if (dots.filter((d) => d.kind === kind).length >= MIN_COUNTRY_DOTS) break;
      dots[i].kind = kind; tagged++;
    }
  }
  const centroid = geoCentroid(feat.f);
  c.home = c.home || [Math.round(centroid[0] * 10) / 10, Math.round(centroid[1] * 10) / 10];
  report[key] = { natural, snapped, tagged, total: dots.filter((d) => d.kind === kind).length, home: c.home };
}

// 3. Write
mkdirSync(join(root, 'data'), { recursive: true });
const flat = [];
for (const d of dots) flat.push(Math.round(d.lat * 100) / 100, Math.round(d.lon * 100) / 100, d.kind);
const meta = {
  generated: 'scripts/generate-globe-data.mjs',
  source: 'world-atlas countries-50m (Natural Earth)',
  lattice: 'fibonacci',
  count: DOT_COUNT,
  kinds: KINDS,
  countries: Object.fromEntries(Object.entries(COUNTRIES).map(([key, c]) => [key, { id: c.id, label: c.label, kind: KINDS.indexOf(key), home: c.home }])),
};
writeFileSync(join(root, 'data', 'globe-dots.json'), JSON.stringify({ meta, dots: flat }));

// Location pins: one red dot per city that has a project in data/projects.json (the single source
// of truth for the project list, counts and tables). Coordinates are city centres. The file is only
// written if it does not exist, so hand edits are never overwritten.
const locationsPath = join(root, 'data', 'locations.json');
if (!existsSync(locationsPath)) {
  const loc = (id, country, name, lon, lat) => ({ id, country, name, lon, lat });
  writeFileSync(locationsPath, JSON.stringify({
    note: 'One pin per city with a project in data/projects.json. Pins are visual only; hover and selection work on the country.',
    locations: [
      loc('beijing', 'china', 'Beijing', 116.407, 39.904),
      loc('chengdu', 'china', 'Chengdu', 104.066, 30.573),
      loc('shanghai', 'china', 'Shanghai', 121.474, 31.230),
      loc('wuxi', 'china', 'Wuxi', 120.312, 31.491),
      loc('tianjin', 'china', 'Tianjin', 117.201, 39.084),
      loc('guangzhou', 'china', 'Guangzhou', 113.264, 23.129),
      loc('ho-chi-minh-city', 'vietnam', 'Ho Chi Minh City', 106.660, 10.762),
      loc('hanoi', 'vietnam', 'Hanoi', 105.854, 21.028),
      loc('singapore', 'singapore', 'Singapore', 103.820, 1.350),
      loc('johor-bahru', 'malaysia', 'Johor Bahru', 103.741, 1.492),
      loc('manila', 'philippines', 'Manila', 120.984, 14.599),
      loc('sydney', 'australia', 'Sydney', 151.209, -33.868),
    ],
  }, null, 2) + '\n');
}

const counts = KINDS.map((k, i) => `${k}: ${dots.filter((d) => d.kind === i).length}`).join(', ');
console.log(`dots ${DOT_COUNT} (${counts})`);
console.table(report);
