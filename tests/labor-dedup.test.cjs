const test = require('node:test');
const assert = require('node:assert/strict');

const labor = require('../api/labor-code.cjs');

test('labor article selection is stable by Moscow date and does not restart at first article when cache history is lost', () => {
  assert.equal(typeof labor.selectArticleForDate, 'function');
  const aug20 = labor.selectArticleForDate(new Date('2026-08-20T09:00:00Z'));
  const aug23 = labor.selectArticleForDate(new Date('2026-08-23T09:00:00Z'));
  const aug23Again = labor.selectArticleForDate(new Date('2026-08-23T20:00:00Z'));
  assert.equal(aug20.id, 'contract:worker');
  assert.notEqual(aug23.id, aug20.id);
  assert.equal(aug23Again.id, aug23.id);
});

test('publisher can explicitly exclude a duplicate article id when replacing a bad post', async () => {
  assert.equal(typeof labor.selectArticleForDate, 'function');
  const candidate = labor.selectArticleForDate(new Date('2026-08-23T09:00:00Z'), { excludeIds: ['contract:worker'] });
  assert.notEqual(candidate.id, 'contract:worker');
});
