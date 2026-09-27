const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'app.css'), 'utf8');

test('fasting tracker remains in Kitchen and is also available from Quick Access', () => {
  assert.match(html, /id="fastingTrackerOpen"/);
  assert.match(html, /id="quickFastingButton"/);
  assert.match(app, /fastingReturnTab='products'/);
  assert.match(app, /fastingReturnTab='home'/);
  assert.match(app, /navigateToAppTab\(fastingReturnTab==='home'\?'home':'products'/);
  assert.match(css, /\.quick-access-button\.is-fasting/);
});

test('Kitchen saved recipes title and fasting benefits copy are present', () => {
  assert.match(html, /<strong>Сохраненные рецепты<\/strong>/);
  assert.match(html, /<strong>Зачем голодание<\/strong>/);
  assert.match(html, /Больше часов не значит больше пользы/);
});
