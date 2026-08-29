const test = require('node:test');
const assert = require('node:assert/strict');
const { resolvePreviewDate } = require('../api/preview-date.cjs');

test('today and tomorrow follow Moscow calendar', () => {
  const now = new Date('2026-08-29T21:30:00Z');
  assert.equal(resolvePreviewDate('today', now), '2026-08-30');
  assert.equal(resolvePreviewDate('tomorrow', now), '2026-08-31');
  assert.equal(resolvePreviewDate('2026-09-02', now), '2026-09-02');
  assert.throws(() => resolvePreviewDate('next-week', now), /preview date/i);
});
