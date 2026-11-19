// Generates the "page coming soon" stubs from the nav and footer in index.html,
// and copies the same nav and footer into the built pages, so shared chrome is
// edited in one place. Run: node tools/build-stubs.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const home = readFileSync(join(root, 'index.html'), 'utf8');
const between = (a, b) => home.slice(home.indexOf(a), home.indexOf(b) + b.length);
// Stubs live one folder down, so every relative link or asset in the shared chrome gets a ../ prefix.
const down = (html) => html.replace(/(href|src)="(?![a-z]+:|#|data:)([^"]*)"/g, (_, attr, path) => `${attr}="../${path === './' ? '' : path}"`);
const nav = down(between('<!-- NAV:START -->', '<!-- NAV:END -->'));
const footer = down(between('<!-- FOOTER:START -->', '<!-- FOOTER:END -->'));

// Marks the primary nav link for this page, so assistive tech announces where you are
const current = (html, slug) => html.replace(
  new RegExp(`(<a class="nav__link[^"]*" href="\\.\\./${slug}/")`), '$1 aria-current="page"');

const pages = {
  'about': 'About',
  'our-works': 'Places That Ignite',
  'news': 'News',
  'contact': "Let's Connect",
  'privacy-policy': 'Privacy Policy',
  'terms': 'Terms & conditions',
};

// Built pages: only the shared chrome between the markers is replaced
const built = ['our-solutions'];
for (const slug of built) {
  const file = join(root, slug, 'index.html');
  let html = readFileSync(file, 'utf8');
  const swap = (a, b, chrome) => {
    const start = html.indexOf(a), end = html.indexOf(b) + b.length;
    html = html.slice(0, start) + chrome + html.slice(end);
  };
  swap('<!-- NAV:START -->', '<!-- NAV:END -->', current(nav, slug));
  swap('<!-- FOOTER:START -->', '<!-- FOOTER:END -->', footer);
  writeFileSync(file, html);
  console.log('synced', `${slug}/index.html`);
}

for (const [slug, title] of Object.entries(pages)) {
  const safe = title.replace(/&/g, '&amp;').replace(/'/g, '&#39;');
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safe} | IKONIC-M</title>
  <meta name="robots" content="noindex">
  <link rel="icon" href="data:,">
  <link rel="preload" href="../fonts/MonaSans-Variable.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="../css/tokens.css">
  <link rel="stylesheet" href="../css/base.css">
  <link rel="stylesheet" href="../css/components.css">
  <script>document.documentElement.classList.add('js');</script>
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>

  ${current(nav, slug)}

  <main id="main">
    <section class="stub">
      <p class="eyebrow">${safe}</p>
      <h1 class="t-h1">Page coming soon</h1>
      <a class="link" href="../"><span>Back to home</span><span class="icon" aria-hidden="true"></span></a>
    </section>
  </main>

  ${footer}

  <script src="../js/main.js" defer></script>
</body>
</html>
`;
  mkdirSync(join(root, slug), { recursive: true });
  writeFileSync(join(root, slug, 'index.html'), html);
  console.log('wrote', `${slug}/index.html`);
}
