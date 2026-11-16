// Generates the "page coming soon" stubs from the nav and footer in index.html,
// so shared chrome is edited in one place. Run: node tools/build-stubs.mjs
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

const pages = {
  'about': 'About',
  'our-solutions': 'Our solutions',
  'our-works': 'Our works',
  'news': 'News',
  'contact': 'Contact',
  'privacy-policy': 'Privacy Policy',
  'terms': 'Terms & conditions',
};

for (const [slug, title] of Object.entries(pages)) {
  const safe = title.replace(/&/g, '&amp;');
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

  ${nav}

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
