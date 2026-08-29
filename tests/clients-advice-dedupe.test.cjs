const test = require('node:test');
const assert = require('node:assert/strict');
const { fingerprintContent } = require('../api/content-fingerprint.cjs');
const { selectAdviceForDate, selectUnseenAdviceForDate } = require('../api/clients-advice.cjs');

const fixedDate = new Date('2026-08-30T08:00:00+03:00');
const items = [
  { id: 'a', title: 'A', body: 'A body', action: 'A action' },
  { id: 'b', title: 'B', body: 'B body', action: 'B action' },
  { id: 'c', title: 'C', body: 'C body', action: 'C action' },
];

test('client advice chooses next unseen item when deterministic item is recent', async () => {
  const deterministic = selectAdviceForDate(items, fixedDate);
  const selected = await selectUnseenAdviceForDate(items, fixedDate, {
    seenFingerprints: new Set([fingerprintContent('clients', deterministic)]),
  });
  assert.notEqual(selected.item.id, deterministic.id);
  assert.equal(selected.exhausted, false);
  assert.equal(selected.fingerprint, fingerprintContent('clients', selected.item));
});

test('client advice falls back deterministically when every item is recent', async () => {
  const deterministic = selectAdviceForDate(items, fixedDate);
  const selected = await selectUnseenAdviceForDate(items, fixedDate, {
    seenFingerprints: new Set(items.map((item) => fingerprintContent('clients', item))),
  });
  assert.equal(selected.item.id, deterministic.id);
  assert.equal(selected.exhausted, true);
});