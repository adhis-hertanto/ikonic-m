// Builds data/search-index.json for the search modal (js/search.js).
// Titles and descriptions come from each page's <title> / meta description;
// pages that are still "coming soon" stubs use the fallbacks below.
// Projects come from data/projects.json. Run: node scripts/build-search-index.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');

function meta(file) {
  if (!existsSync(join(root, file))) return {};
  const html = read(file);
  const t = html.match(/<title>([^<]*)<\/title>/);
  const d = html.match(/<meta name="description" content="([^"]*)"/);
  return {
    title: t ? decode(t[1]).replace(/\s*\|\s*IKONIC-M\s*$/, '').trim() : '',
    description: d ? decode(d[1]).trim() : ''
  };
}

const DD = 'Distinctive Destinations';
const TS = 'Transformative Solutions';
const NEWS = 'News';
const CO = 'Company';

const pages = [
  { file: 'index.html', url: './', category: CO, title: 'Home', keywords: 'ikonic-m keppel retail transformation' },
  { file: 'about/index.html', url: 'about/', category: CO, title: 'About', keywords: 'team leadership keppel' },
  { file: 'our-solutions/index.html', url: 'our-solutions/', category: TS, title: 'Transformative Solutions' },
  { file: 'our-works/index.html', url: 'our-works/', category: DD, title: 'Places That Ignite', keywords: 'projects destinations malls globe' },
  { file: 'case-study/index.html', url: 'case-study/', category: DD, title: 'Saigon Centre', keywords: 'ho chi minh city vietnam case study' },
  { file: 'news/index.html', url: 'news/', category: NEWS, title: 'News', description: 'Latest news, project milestones and market perspectives from IKONIC-M.', keywords: 'insights press' },
  { file: 'contact/index.html', url: 'contact/', category: CO, title: "Let's Connect", description: 'Get in touch with the IKONIC-M team and leave a request.', keywords: 'contact enquiry request office' },
  { file: 'privacy-policy/index.html', url: 'privacy-policy/', category: CO, title: 'Privacy Policy', description: 'How IKONIC-M collects, uses and protects your personal data.', keywords: 'legal data cookies' },
  { file: 'terms/index.html', url: 'terms/', category: CO, title: 'Terms & conditions', description: 'The terms and conditions for using the IKONIC-M website.', keywords: 'legal terms of use' }
];

const index = [];
for (const p of pages) {
  const m = meta(p.file);
  const title = p.title === 'Home' ? 'Home' : (m.title || p.title);
  index.push({
    title: p.title === 'Home' || p.title === 'About' || p.title === 'News' ? p.title : title,
    category: p.category,
    description: m.description || p.description || '',
    url: p.url,
    ...(p.keywords ? { keywords: p.keywords } : {})
  });
  // Our Solutions: anchors for the page sections, then the six services
  if (p.url === 'our-solutions/') {
    const anchors = [
      ['Retail Transformation', 'retail-transformation', 'Everything you need to transform retail, from strategy and concept to leasing, operations and asset enhancement.'],
      ['Retail Investments', 'retail-investments', 'Partnerships that unlock greater possibilities, from strategic advisory to operating and investment partnerships.'],
      ['Retail Experiences', 'retail-experiences', 'Creating experiences people want to be a part of, with IKONIC rewards and curated experiences.']
    ];
    for (const [title, id, description] of anchors) {
      index.push({ title, category: TS, description, url: `our-solutions/#${id}` });
    }
    const html = read('our-solutions/index.html');
    const titles = [...html.matchAll(/<h3 class="slider__title t-h4">([^<]*)<\/h3>/g)].map((m) => decode(m[1]));
    const descs = [...html.matchAll(/<p class="t-body-l" data-slide-desc>([^<]*)<\/p>/g)].map((m) => decode(m[1]));
    titles.forEach((title, i) => index.push({ title, category: TS, description: descs[i] || '', url: 'our-solutions/#retail-transformation' }));
  }
}

// News article (page is built separately; copy kept in step with the Figma search examples)
index.push({
  title: 'Why the next decade of retail belongs to places, not just stores',
  category: NEWS,
  description: 'Perspective on how destinations, not stand-alone stores, will define the next decade of retail.',
  url: 'news-article/',
  date: '2026-09-18'
});

// Projects (data/projects.json). Saigon Centre has its own case study page.
const projects = JSON.parse(read('data/projects.json')).projects;
for (const pr of projects) {
  if (pr.name === 'Saigon Centre') continue; // already indexed as the case study
  index.push({
    title: pr.name,
    category: DD,
    description: `${pr.location}, ${pr.country[0].toUpperCase() + pr.country.slice(1)}. ${pr.status} project.`,
    url: 'our-works/'
  });
}

writeFileSync(join(root, 'data/search-index.json'), JSON.stringify(index, null, 2) + '\n');
console.log(`search-index.json: ${index.length} entries`);
