const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getPublicationRecord,
  markPublicationPending,
  markPublicationPublished,
  markPublicationFailed,
  markPublicationSkipped,
  writeDailyRunSummary,
  getLatestDailyRun,
} = require('../api/publication-journal.cjs');

function memoryCache() {
  const data = new Map();
  return {
    async get(key) { return data.has(key) ? structuredClone(data.get(key)) : null; },
    async set(key, value) { data.set(key, structuredClone(value)); return true; },
    async delete(key) { data.delete(key); return true; },
  };
}

const t0 = new Date('2026-08-30T00:00:00.000Z');
const t1 = new Date('2026-08-30T00:01:00.000Z');

test('published section is durable and automatic pending cannot reopen it', async () => {
  const cache = memoryCache();
  await markPublicationPending({ date: '2026-08-30', section: 'facts' }, { cache, now: t0 });
  await markPublicationPublished({ date: '2026-08-30', section: 'facts', messageIds: [101], sourceIds: ['daily-content'] }, { cache, now: t1 });
  const ignored = await markPublicationPending({ date: '2026-08-30', section: 'facts' }, { cache, now: t1 });
  assert.equal(ignored.status, 'published');
  const row = await getPublicationRecord('2026-08-30', 'facts', { cache });
  assert.equal(row.status, 'published');
  assert.equal(row.attempts, 1);
  assert.deepEqual(row.messageIds, [101]);
});

test('failed section can start a second attempt while preserving first start', async () => {
  const cache = memoryCache();
  await markPublicationPending({ date: '2026-08-30', section: 'cinema' }, { cache, now: t0 });
  await markPublicationFailed({ date: '2026-08-30', section: 'cinema', error: 'source failed' }, { cache, now: t1 });
  const retry = await markPublicationPending({ date: '2026-08-30', section: 'cinema' }, { cache, now: t1 });
  assert.equal(retry.status, 'pending');
  assert.equal(retry.attempts, 2);
  assert.equal(retry.startedAt, t0.toISOString());
});

test('skipped section records reason without counting as failure', async () => {
  const cache = memoryCache();
  const row = await markPublicationSkipped({ date: '2026-08-30', section: 'weekend', reason: 'insufficient-verified-items' }, { cache, now: t0 });
  assert.equal(row.status, 'skipped');
  assert.equal(row.metadata.reason, 'insufficient-verified-items');
  assert.equal(row.error, null);
});

test('latest daily run pointer returns the last written summary', async () => {
  const cache = memoryCache();
  await writeDailyRunSummary('2026-08-30', { failures: 1, sections: { cinema: 'failed' } }, { cache, now: t0 });
  const latest = await getLatestDailyRun({ cache });
  assert.equal(latest.date, '2026-08-30');
  assert.equal(latest.failures, 1);
});
