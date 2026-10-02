const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  normalizeState,
  writeMileage,
  setTyreSeasonInstalled,
  setLastServiceAt,
} = require('../api/car-store.cjs');
const {
  isCarTask,
  cleanCarTaskTitle,
  cleanCarTaskDate,
} = require('../api/car-client.cjs');
const { createTickTickTask } = require('../api/ticktick-client.cjs');

function memoryState(initial = null) {
  let value = initial;
  const cache = {
    get: async () => null,
    set: async () => true,
    delete: async () => true,
  };
  const db = {
    read: async () => value,
    write: async (next) => {
      value = next;
      return next;
    },
  };
  return {
    options: { cache, db },
    read: () => value,
  };
}

test('car state keeps mileage history, tyre season and last service date', () => {
  const state = normalizeState({
    mileage: 47000,
    mileageUpdatedAt: '2026-10-01T09:00:00.000Z',
    mileageHistory: [
      { mileage: 47000, at: '2026-10-01T09:00:00.000Z' },
      { mileage: 45500, at: '2026-09-01T09:00:00.000Z' },
    ],
    tyreSeasonInstalled: 'summer',
    lastServiceAt: '2026-04-15',
  });
  assert.equal(state.tyreSeasonInstalled, 'summer');
  assert.equal(state.lastServiceAt, '2026-04-15');
  assert.equal(state.mileageHistory.length, 2);
  assert.equal(state.mileageHistory[0].mileage, 47000);
});

test('writeMileage records durable history without duplicate current point', async () => {
  const memory = memoryState();
  await writeMileage(45000, { ...memory.options, now: '2026-09-01T09:00:00.000Z' });
  await writeMileage(47000, { ...memory.options, now: '2026-10-01T09:00:00.000Z' });
  const state = normalizeState(memory.read());
  assert.equal(state.mileage, 47000);
  assert.deepEqual(state.mileageHistory.map((row) => row.mileage), [47000, 45000]);
});

test('tyre season and last service setters persist car state', async () => {
  const memory = memoryState();
  await setTyreSeasonInstalled('winter', { ...memory.options, now: '2026-10-02T09:00:00.000Z' });
  await setLastServiceAt('2026-04-15', { ...memory.options, now: '2026-10-02T09:01:00.000Z' });
  const state = normalizeState(memory.read());
  assert.equal(state.tyreSeasonInstalled, 'winter');
  assert.equal(state.lastServiceAt, '2026-04-15');
});

test('car task helpers recognize explicit car tasks and validate inputs', () => {
  const config = { taskKeywords: ['машин'], taskColumnKeywords: [] };
  assert.equal(isCarTask({ title: '🚗 Переобуться' }, config, new Set()), true);
  assert.equal(cleanCarTaskTitle('🚗 Проверить давление'), 'Проверить давление');
  assert.equal(cleanCarTaskDate('2026-10-02'), '2026-10-02');
  assert.throws(() => cleanCarTaskDate('02.10.2026'), /car-task-date-invalid/);
});

test('createTickTickTask sends a create-task payload', async () => {
  let captured = null;
  const result = await createTickTickTask('token', {
    projectId: 'project-1',
    title: '🚗 Переобуться',
    isAllDay: true,
    startDate: '2026-10-02T00:00:00+0300',
    dueDate: '2026-10-02T00:00:00+0300',
    timeZone: 'Europe/Moscow',
  }, {
    fetchImpl: async (url, init) => {
      captured = { url, init, body: JSON.parse(init.body) };
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 'task-1', ...captured.body }),
      };
    },
  });
  assert.match(captured.url, /\/open\/v1\/task$/);
  assert.equal(captured.init.method, 'POST');
  assert.equal(captured.body.projectId, 'project-1');
  assert.equal(captured.body.isAllDay, true);
  assert.equal(result.id, 'task-1');
});

test('car card collapse state listens for synced UI preferences', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'car.js'), 'utf8');
  assert.match(source, /rudi:ui-preferences-applied/);
  assert.match(source, /syncCarCardCollapseStates/);
  assert.match(source, /RUDI_UI_PREFERENCES\.setViewState/);
});
