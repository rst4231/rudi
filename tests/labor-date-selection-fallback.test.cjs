const test = require('node:test');
const assert = require('node:assert/strict');
const labor = require('../api/labor-code.cjs');

test('date selector walks forward when the deterministic article is excluded', () => {
  assert.equal(typeof labor.selectArticleForDate, 'function');
  const first = labor.selectArticleForDate(new Date('2026-08-23T09:00:00Z'));
  const next = labor.selectArticleForDate(new Date('2026-08-23T09:00:00Z'), { excludeIds: [first.id] });
  assert.notEqual(next.id, first.id);
});
