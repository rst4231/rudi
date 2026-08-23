const test = require('node:test');
const assert = require('node:assert/strict');
const labor = require('../api/labor-code.cjs');

test('date selector can exclude multiple recent article ids', () => {
  assert.equal(typeof labor.selectArticleForDate, 'function');
  const variants = labor.allArticleVariants();
  const excluded = variants.slice(0, 6).map((item) => item.id);
  const selected = labor.selectArticleForDate(new Date('2026-08-20T09:00:00Z'), { excludeIds: excluded });
  assert.ok(selected);
  assert.equal(excluded.includes(selected.id), false);
});
