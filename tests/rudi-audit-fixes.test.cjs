const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('/api/admin endpoint is removed and Git deploys stay disabled', () => {
  assert.equal(fs.existsSync('api/admin.js'), false);
  const vercel = JSON.parse(fs.readFileSync('vercel.json','utf8'));
  assert.equal(vercel.git?.deploymentEnabled, false);
  assert.equal(Boolean(vercel.functions?.['api/admin.js']), false);
});

test('frontend shell is split and Telegram SDK no longer blocks the head', () => {
  const html = fs.readFileSync('public/index.html','utf8');
  assert.match(html, /href="\/(?:app\.css(?:\?v=[^"]+)?|assets\/app\.[a-f0-9]{12}\.css)"/);
  assert.match(html, /src="\/(?:app\.js(?:\?v=[^"]+)?|assets\/app\.[a-f0-9]{12}\.js)"/);
  assert.doesNotMatch(html, /<style>[\s\S]{1000}/);
  const sdk = html.indexOf('telegram-web-app.js?63');
  const mainEnd = html.indexOf('</main>');
  assert.ok(sdk > mainEnd || /<script defer src="https:\/\/telegram\.org\/js\/telegram-web-app\.js\?63"><\/script>/.test(html));
});

test('product polling is reduced to the visible products tab', () => {
  const source = fs.readFileSync('public/app.js','utf8');
  assert.match(source, /currentAppTab==='products'/);
  assert.match(source, /return 15000/);
  assert.doesNotMatch(source, /return currentAppTab==='products' \? 2000 : 10000/);
});

test('Stage output contains no price line while preserving age rating', () => {
  const { stripStagePriceLines } = require('../api/event-text-sanitizer.cjs');
  const output = stripStagePriceLines('Stage StandUp Club\nБольшой стендап\n💳 от 43 ₽ · 18+\n📍 Невский');
  assert.doesNotMatch(output, /43 ₽|💳/);
  assert.match(output, /🔞 18\+/);
  assert.match(output, /📍 Невский/);
});

test('DEP0169 noise is targeted and Vercel functions dependency is pinned', () => {
  const vercel = JSON.parse(fs.readFileSync('vercel.json','utf8'));
  const pkg = JSON.parse(fs.readFileSync('package.json','utf8'));
  assert.equal(vercel.env?.NODE_OPTIONS, '--disable-warning=DEP0169');
  assert.equal(pkg.dependencies?.['@vercel/functions'], '3.9.8');
});
