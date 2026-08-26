const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const recoveryPath = path.join(__dirname, '..', 'api', 'recover-20260823.js');
const obsoleteRecoveryPath = path.join(__dirname, '..', 'api', 'recover-events-20260826.js');
const recovery = require('../api/recover-20260823.js');

function memoryCache(seed = {}) {
  const map = new Map(Object.entries(seed));
  const deleted = [];
  return {
    map,
    deleted,
    async get(key) { return map.has(key) ? map.get(key) : null; },
    async set(key, value) { map.set(key, value); return true; },
    async delete(key) { deleted.push(key); map.delete(key); return true; },
  };
}

test('Aug 26 events recovery reuses the existing protected recovery function', () => {
  assert.equal(fs.existsSync(recoveryPath), true, 'existing recovery function must remain available');
  assert.equal(fs.existsSync(obsoleteRecoveryPath), false, 'must not add a 13th serverless function');
  const source = fs.readFileSync(recoveryPath, 'utf8');
  assert.match(source, /EVENTS_RECOVERY_DATE = '2026-08-26'/);
  assert.match(source, /EVENTS_EXPECTED_KEY_HASH = '[a-f0-9]{64}'/);
  assert.match(source, /events-recovery-20260826-finalized/);
  assert.match(source, /status\(410\)/);
  assert.match(source, /status\(401\)/);
});

test('finalizer deletes all tracked Aug 26 event messages before sending fresh preview posts', async () => {
  assert.equal(typeof recovery.finalizeEventsRecovery, 'function');

  const topicCache = memoryCache({
    'topic:19:2026-08-26:messages': [700, 722, 723],
    'topic:19:chat-id': -100123,
    'topic:19:2026-08-26:cleanup-target': true,
  });
  const telegramCalls = [];
  const fetchImpl = async (url, init) => {
    const method = String(url).split('/').at(-1);
    const body = JSON.parse(init.body);
    telegramCalls.push({ method, body });
    if (method === 'deleteMessages') {
      return new Response(JSON.stringify({ ok: true, result: true }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }
    if (method === 'sendMessage') {
      return new Response(JSON.stringify({ ok: true, result: { message_id: 800 + telegramCalls.length } }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`unexpected Telegram method ${method}`);
  };
  const runRuntime = async (req, res) => {
    assert.equal(req.query.route, 'preview');
    assert.equal(req.query.date, '2026-08-26');
    assert.equal(req.query.only, 'events');
    return res.status(200).json({
      ok: true,
      results: {
        events: {
          preview: {
            concerts: '<b>concerts</b>',
            stage: '<b>stage</b>',
          },
        },
      },
    });
  };

  const result = await recovery.finalizeEventsRecovery('2026-08-26', {
    topicCache,
    chatId: -100123,
    token: '1:test',
    fetchImpl,
    runRuntime,
  });

  assert.deepEqual(result.trackedBefore, [700, 722, 723]);
  assert.equal(result.deleted, 3);
  assert.equal(result.sentMessageIds.length, 2);
  const deletion = telegramCalls.find((call) => call.method === 'deleteMessages');
  assert.deepEqual(deletion.body.message_ids, [700, 722, 723]);
  assert.equal(telegramCalls.filter((call) => call.method === 'sendMessage').length, 2);
  assert.ok(topicCache.deleted.includes('topic:19:2026-08-26:cleanup-target'));
});

test('Vercel stays within the Hobby serverless function limit', () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
  assert.equal(config.functions?.['api/recover-events-20260826.js'], undefined);
  const apiFiles = fs.readdirSync(path.join(__dirname, '..', 'api')).filter((name) => name.endsWith('.js'));
  assert.ok(apiFiles.length <= 12, `expected at most 12 serverless JS entrypoints, got ${apiFiles.length}`);
});
