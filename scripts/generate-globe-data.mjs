// Generates the dot-matrix globe data. Run: npm run globe:data
// Dev-only: world-atlas + topojson-client + d3-geo are used here and nowhere at runtime.
//
// Output
//   data/globe-dots.json  { meta, dots: [lat, lon, kind, lat, lon, kind, ...] }
//                         kind is an index into meta.kinds (0 ocean, 1 land, 2+ interactive countries)
//   data/locations.json   placeholder location list (only written if it does not exist, so
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
const KINDS = ['ocean', 'land', 'china', 'singapore', 'vietnam', 'australia'];
// ISO 3166-1 numeric ids in world-atlas
const COUNTRIES = {
  china: { id: 156, label: 'China', home: [108, 18] },   // home = Figma default pose (centre lon, lat)
  singapore: { id: 702, label: 'Singapore', snap: [[103.82, 1.35]] },
  vietnam: { id: 704, label: 'Vietnam' },
  australia: { id: 36, label: 'Australia' },
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

// Coordinates for China and Vietnam are the Figma red dots (node 270:157) unprojected with the
// default pose (centre 108E 18N, north up), so they land on the Figma positions. Names are the
// nearest major city. Everything is placeholder content.
const locationsPath = join(root, 'data', 'locations.json');
if (!existsSync(locationsPath)) {
  const loc = (id, country, name, lon, lat, extra = {}) => ({ id, country, name, lon, lat, placeholder: true, ...extra });
  writeFileSync(locationsPath, JSON.stringify({
    note: 'Placeholder locations. Replace name/lon/lat with real destinations and remove "placeholder". "default": true marks the pin shown when nothing is hovered.',
    locations: [
      loc('chengdu', 'china', 'Chengdu', 103.753, 30.946, { default: true }),
      loc('beijing', 'china', 'Beijing', 117.106, 40.524),
      loc('shanghai', 'china', 'Shanghai', 120.891, 31.442),
      loc('guangzhou', 'china', 'Guangzhou', 112.269, 23.033),
      loc('nanning', 'china', 'Nanning', 105.727, 21.827),
      loc('ho-chi-minh-city', 'vietnam', 'Ho Chi Minh City', 106.998, 11.103, { default: true }),
      loc('can-tho', 'vietnam', 'Can Tho', 105.19, 10.285),
      loc('orchard-road', 'singapore', 'Orchard Road', 103.832, 1.304, { default: true }),
      loc('jurong-east', 'singapore', 'Jurong East', 103.742, 1.333),
      loc('sydney', 'australia', 'Sydney', 151.209, -33.868, { default: true }),
      loc('melbourne', 'australia', 'Melbourne', 144.963, -37.814),
    ],
  }, null, 2) + '\n');
}

const counts = KINDS.map((k, i) => `${k}: ${dots.filter((d) => d.kind === i).length}`).join(', ');
console.log(`dots ${DOT_COUNT} (${counts})`);
console.table(report);
