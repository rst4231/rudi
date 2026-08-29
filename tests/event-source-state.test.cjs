const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { recordEventSourceState } = require('../api/event-source-state.cjs');

test('fulfilled empty event source records empty health', async () => {
  const rows = [];
  await recordEventSourceState('events:yandex', '2026-08-30', { status: 'fulfilled', value: [] }, {
    recordHealth: async (row) => { rows.push(row); return row; },
  });
  assert.deepEqual(rows[0], {
    sourceId: 'events:yandex', requestedDate: '2026-08-30', status: 'empty', itemCount: 0, error: null,
  });
});

test('rejected event source records failed health without throwing', async () => {
  const rows = [];
  await recordEventSourceState('events:stage', '2026-08-30', { status: 'rejected', reason: new Error('down') }, {
    recordHealth: async (row) => { rows.push(row); return row; },
  });
  assert.equal(rows[0].status, 'failed');
  assert.equal(rows[0].itemCount, 0);
  assert.match(String(rows[0].error), /down/);
});

test('generated runtime patch calls event source bridge and index installs it', () => {
  const build = fs.readFileSync(path.join(__dirname, '..', 'build.cjs'), 'utf8');
  const index = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');
  assert.match(build, /__RUDI_RECORD_EVENT_SOURCE_STATE__/);
  assert.match(build, /events:yandex/);
  assert.match(build, /events:stage/);
  assert.match(index, /__RUDI_RECORD_EVENT_SOURCE_STATE__/);
  assert.match(index, /recordEventSourceState/);
});