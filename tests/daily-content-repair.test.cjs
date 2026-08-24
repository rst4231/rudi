const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repairPath = path.join(__dirname, '..', 'api', 'daily-content-repair-20260824.cjs');

function fakeCache(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    async get(key) { return values.get(key); },
    async set(key, value) { values.set(key, value); },
  };
}

function telegramResponse(result = true, status = 200) {
  return new Response(JSON.stringify({ ok: status >= 200 && status < 300, result }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('repair deletes only supplied duplicate messages and publishes one fresh post per topic exactly once', async () => {
  assert.equal(fs.existsSync(repairPath), true, 'daily content repair module must exist');
  const { runDailyContentRepair, CHAT_ID, REPAIR_DATE } = require(repairPath);
  assert.equal(CHAT_ID, -1004476323368);
  assert.equal(REPAIR_DATE, '2026-08-24');

  const facts = { id: 'fresh-fact', type: 'facts', emoji: '💡', category: 'Тест', body: 'Новый факт.', sourceUrl: 'https://example.com/fact' };
  const lulu = { id: 'fresh-lulu', type: 'lulu', title: 'Новый совет', body: 'Новый совет для Лулу.', sourceUrl: 'https://example.com/lulu' };
  const dailyCache = fakeCache();
  const repairCache = fakeCache();
  const calls = [];
  let nextMessageId = 900;
  const fetchImpl = async (url, init) => {
    const method = String(url).split('/').pop();
    const body = JSON.parse(init.body);
    calls.push({ method, body });
    if (method === 'deleteMessage') return telegramResponse(true);
    if (method === 'sendMessage') return telegramResponse({ message_id: nextMessageId++ });
    throw new Error(`Unexpected Telegram method: ${method}`);
  };

  const first = await runDailyContentRepair({
    token: '1:testtoken',
    fetchImpl,
    dailyCache,
    repairCache,
    catalog: { facts: [facts], lulu: [lulu] },
    now: new Date('2026-08-24T07:00:00+03:00'),
  });

  assert.equal(first.completed, true);
  assert.deepEqual(
    calls.filter((call) => call.method === 'deleteMessage').map((call) => call.body),
    [
      { chat_id: CHAT_ID, message_id: 675 },
      { chat_id: CHAT_ID, message_id: 676 },
    ],
  );
  assert.deepEqual(
    calls.filter((call) => call.method === 'sendMessage').map((call) => call.body.message_thread_id),
    [72, 85],
  );
  assert.equal((await dailyCache.get('daily-content:72:history')).at(-1).dateKey, REPAIR_DATE);
  assert.equal((await dailyCache.get('daily-content:85:history')).at(-1).dateKey, REPAIR_DATE);

  const callCount = calls.length;
  const second = await runDailyContentRepair({
    token: '1:testtoken',
    fetchImpl,
    dailyCache,
    repairCache,
    catalog: { facts: [facts], lulu: [lulu] },
    now: new Date('2026-08-24T07:10:00+03:00'),
  });
  assert.equal(second.alreadyCompleted, true);
  assert.equal(calls.length, callCount);
});
