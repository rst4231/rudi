const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('personal task footer has no extra translucent background', () => {
  const css = read('public/personal-task-editor.css');
  assert.match(css, /\.rudi-personal-task-modal \.ticktick-task-form-actions\{[^}]*background:transparent;/s);
  assert.doesNotMatch(css, /\.rudi-personal-task-modal \.ticktick-task-form-actions\{[^}]*background:var\(--surface\)/s);
});

test('personal editor style and offline cache use the same release version', () => {
  const html = read('public/index.html');
  const sw = read('public/sw.js');
  const version = read('VERSION').trim();
  assert.equal(version, 'v4.374');
  assert.ok(html.includes('/personal-task-editor.css?v=4.374'));
  assert.ok(sw.includes('/personal-task-editor.css?v=4.374'));
  assert.ok(sw.includes("rudi-shell-v4.374"));
  assert.ok(html.includes('name="rudi-version" content="v4.374"'));
});
