const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeLegacyVenueDigest,
  shouldSuppressLegacyVenueDigest,
  syntheticTelegramSuccess,
  maybeSuppressLegacyVenueDigest,
  resetLegacyVenueDigestMemo,
} = require('../api/legacy-venue-digest-guard.cjs');
const { maybeSendEventCollage } = require('../api/event-collage.cjs');

const disabledConfig = {
  legacyVenueDigest: {
    enabled: false,
    titleTokens: ['севкабель порт + брусницын', 'севкабель порт', 'брусницын'],
  },
};

test('dedicated Sevkabel and Brusnitsyn digest is suppressed when external switch is disabled', () => {
  const config = normalizeLegacyVenueDigest(disabledConfig);
  const text = '⚓️ <b>Севкабель Порт + Брусницын</b>\n\n<b>Сегодня</b>\n🌊 Севкабель Порт';
  assert.equal(shouldSuppressLegacyVenueDigest(text, config), true);
});

test('ordinary concert digest is not suppressed when Sevkabel appears only inside the body', () => {
  const config = normalizeLegacyVenueDigest(disabledConfig);
  const text = '🎤 <b>Поп и хип-хоп концерты</b>\n\n1. Артист\n📍 Севкабель Порт';
  assert.equal(shouldSuppressLegacyVenueDigest(text, config), false);
});

test('legacy venue digest is allowed when external switch is enabled', () => {
  const config = normalizeLegacyVenueDigest({ legacyVenueDigest: { enabled: true } });
  assert.equal(shouldSuppressLegacyVenueDigest('⚓️ <b>Севкабель Порт + Брусницын</b>', config), false);
});

test('synthetic Telegram response is successful and uses a zero message id sentinel', async () => {
  const response = syntheticTelegramSuccess();
  assert.equal(response.ok, true);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.result.message_id, 0);
});

test('Telegram sendMessage for the legacy venue digest is intercepted before Telegram is called', async () => {
  resetLegacyVenueDigestMemo();
  let telegramCalls = 0;
  const response = await maybeSuppressLegacyVenueDigest(
    'https://api.telegram.org/botTEST/sendMessage',
    { method: 'POST', body: JSON.stringify({ text: '⚓️ <b>Севкабель Порт + Брусницын</b>\nСегодня' }) },
    {
      configUrl: '',
      cacheMs: 0,
      localConfig: disabledConfig,
      fetchImpl: async () => { telegramCalls += 1; throw new Error('should not call network'); },
    },
  );
  assert.equal(response?.ok, true);
  assert.equal(telegramCalls, 0);
});

test('event collage wrapper returns suppression response for the dedicated legacy venue post', async () => {
  resetLegacyVenueDigestMemo();
  const response = await maybeSendEventCollage(
    'https://api.telegram.org/botTEST/sendMessage',
    { method: 'POST', body: JSON.stringify({ text: '⚓️ <b>Севкабель Порт + Брусницын</b>\nСегодня' }) },
    {
      configUrl: '',
      cacheMs: 0,
      localConfig: disabledConfig,
      fetchImpl: async () => { throw new Error('network should not be reached'); },
    },
  );
  assert.equal(response?.ok, true);
  assert.equal((await response.json()).result.message_id, 0);
});
