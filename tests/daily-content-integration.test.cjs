const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'api', 'topic-maintenance.cjs'), 'utf8');

test('Telegram transport retires built-in facts and Lulu through external nonrepeating content', () => {
  assert.match(source, /wrapDailyContentDedupe/);
  assert.match(source, /loadDailyContentCatalog/);
  assert.match(source, /getDailyContentCache/);
  assert.match(source, /alwaysReplace:\s*true/);
});
