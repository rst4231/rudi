const test = require('node:test');
const assert = require('node:assert/strict');

const {
  runWithCronSecretHidden,
  installTelegramFetchGuard,
} = require('../api/runtime-guard.cjs');

test('CRON_SECRET is hidden only inside the Telegram async context', async () => {
  const old = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'production-secret';
  try {
    let telegramStart;
    let telegramEnd;
    let healthSeen;
    await Promise.all([
      runWithCronSecretHidden(async () => {
        telegramStart = process.env.CRON_SECRET;
        await new Promise((resolve) => setTimeout(resolve, 20));
        telegramEnd = process.env.CRON_SECRET;
      }),
      (async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        healthSeen = process.env.CRON_SECRET;
      })(),
    ]);
    assert.equal(telegramStart, undefined);
    assert.equal(telegramEnd, undefined);
    assert.equal(healthSeen, 'production-secret');
    assert.equal(process.env.CRON_SECRET, 'production-secret');
  } finally {
    if (old === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = old;
  }
});

test('Telegram API 429 is retried as the same API call instead of failing the webhook', async () => {
  let calls = 0;
  const fakeFetch = async () => {
    calls += 1;
    if (calls === 1) {
      return new Response(JSON.stringify({
        ok: false,
        error_code: 429,
        description: 'Too Many Requests: retry after 0.01',
        parameters: { retry_after: 0.01 },
      }), { status: 429, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const guarded = installTelegramFetchGuard(fakeFetch, { maxRetries: 2, retryPaddingMs: 0 });
  const response = await guarded('https://api.telegram.org/bot123/sendMessage', { method: 'POST' });
  assert.equal(response.status, 200);
  assert.equal(calls, 2);
});

test('Telegram API calls are serialized to avoid burst floods', async () => {
  let active = 0;
  let maxActive = 0;
  const fakeFetch = async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 15));
    active -= 1;
    return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
  };
  const guarded = installTelegramFetchGuard(fakeFetch, { maxRetries: 0 });
  await Promise.all([
    guarded('https://api.telegram.org/bot123/editMessageText', { method: 'POST' }),
    guarded('https://api.telegram.org/bot123/sendMessage', { method: 'POST' }),
    guarded('https://api.telegram.org/bot123/editMessageReplyMarkup', { method: 'POST' }),
  ]);
  assert.equal(maxActive, 1);
});

test('non-Telegram fetches are not serialized or modified', async () => {
  let calls = 0;
  const fakeFetch = async () => {
    calls += 1;
    return new Response('ok', { status: 200 });
  };
  const guarded = installTelegramFetchGuard(fakeFetch);
  const response = await guarded('https://example.com/test');
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
});
