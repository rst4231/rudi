const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'app.css'), 'utf8');

test('fasting tracker leaves Kitchen and opens from profile emoji or Quick Access', () => {
  assert.doesNotMatch(html, /id="fastingTrackerOpen"/);
  assert.match(html, /id="fastingProfileButton"/);
  assert.match(html, /id="quickFastingButton"/);
  assert.match(app, /profileButton\?\.addEventListener\('click',navigateOwnFasting\)/);
  assert.match(app, /fastingReturnTab='home'/);
  assert.match(css, /#fastingProfileButton/);
});

test('Kitchen saved recipes title and fasting benefits copy are present', () => {
  assert.match(html, /<strong>Сохраненные рецепты<\/strong>/);
  assert.match(html, /<strong>Зачем голодание<\/strong>/);
  assert.match(html, /Больше часов не значит больше пользы/);
});

test('home hero shows smart sunrise or sunset line under moon phase',()=>{
  assert.match(app,/function homeSunEventLabel\(/);
  assert.match(app,/Восход завтра в/);
  assert.match(app,/Закат в/);
  assert.match(app,/daily=sunrise,sunset/);
  assert.match(css,/\.home-dashboard-sun/);
});
