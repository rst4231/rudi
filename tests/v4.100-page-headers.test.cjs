const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

const expectedButtons = [
  'habitBackButton', 'supplementBackButton', 'financeBackButton',
  'carPageBack', 'workCalendarBack', 'smartSavesBackButton',
  'wishlistBackButton', 'fastingBackButton', 'datesBackButton', 'forDiBackButton'
];

test('ten RUDI section headers use the same opt-in header and back control', () => {
  const html = read('public/index.html');
  assert.equal((html.match(/class="[^"]*\brudi-app-page-head\b[^"]*"/g) || []).length, 10);
  assert.equal((html.match(/class="[^"]*\brudi-app-page-back\b[^"]*"/g) || []).length, 10);
  for (const id of expectedButtons) {
    const button = html.match(new RegExp('<button\\b[^>]*\\bid="' + id + '"[^>]*>'))?.[0] || '';
    assert.ok(button, id + ' must retain its original ID');
    assert.match(button, /\brudi-app-page-back\b/, id);
  }
});

test('responsive header design keeps shared geometry, theme coloring and safe areas', () => {
  const css = read('public/rudi-design-system.css');
  for (const token of [
    '.rudi-app-page-head{', '.rudi-app-page-head > .rudi-app-page-back{',
    '--rudi-page-head-control:48px', '--rudi-page-head-control:44px',
    '--rudi-page-head-title:25px', '--rudi-page-head-title:23px',
    '--rudi-page-head-height:76px', '--rudi-page-head-height:72px',
    'var(--tg-content-safe-area-inset-top,0px)', 'body[data-app-tab="schedule"] .work-page',
    '.for-di-page-head.rudi-app-page-head'
  ]) assert.ok(css.includes(token), token);
  assert.match(css, /@media\(max-width:430px\)/);
  assert.match(css, /font-size:var\(--rudi-page-head-title\)!important/);
  assert.doesNotMatch(css.slice(css.indexOf('RUDI v4.100 — unified page headers')), /pointer-events:none!important/);
});

test('cache-bust and source version remain aligned across future RUDI releases', () => {
  const version = read('VERSION').trim();
  const cfg = JSON.parse(read('rudi-version.json'));
  const html = read('public/index.html');
  const sw = read('public/sw.js');
  assert.match(version, /^v4\\.\\d+$/);
  assert.ok(Number(version.split('.')[1]) >= 100, 'release must not revert before v4.100');
  assert.equal(cfg.current, version);
  const number = version.slice(1);
  assert.ok(html.includes('name="rudi-version" content="' + version + '"'));
  assert.ok(html.includes('/rudi-design-system.css?v=' + number));
  assert.ok(sw.includes('rudi-shell-' + version));
  assert.ok(sw.includes('/rudi-design-system.css?v=' + number));
});
