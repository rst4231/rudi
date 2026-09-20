const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = ['public/index.html','public/app.css','public/app.js'].map(file=>fs.readFileSync(file,'utf8')).join('\n');

test('RUDI v0.1 shows dual calendars and app version', () => {
  assert.match(html, /График Дианы/);
  assert.match(html, /Календарь совместных дел/);
  assert.match(html, /id="appVersion"[^>]*>v0\.1</);
  assert.doesNotMatch(html, /work-calendar-legend[^>]*>[^<]*<span><\/span>\s*рабочий день/);
});

test('both calendars persist collapse state', () => {
  assert.match(html, /key:'calendar-work'/);
  assert.match(html, /key:'calendar-shared'/);
});

test('Diana work status is rendered from work calendar data', () => {
  assert.match(html, /function renderPartnerWorkStatus\(days\)/);
  assert.match(html, /status\.textContent=working\?'Рабочий день':'Выходной'/);
  assert.match(html, /renderPartnerWorkStatus\(days\)/);
});

test('Diana work status stays tied to current month when browsing next month', () => {
  assert.match(html, /if\(view==='month'\) renderPartnerWorkStatus\(days\)/);
  assert.match(html, /if\(requested==='next-month'\) refreshPartnerWorkStatus\(\)/);
});
