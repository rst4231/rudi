const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  compactEventCaption,
  compactEventTelegramRequest,
} = require('../api/event-text-sanitizer.cjs');

const root = path.join(__dirname, '..');

test('concert digest stays text-only and keeps compact spacing', () => {
  const init = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: -100123,
      text: '<b>🎤 Поп и хип-хоп концерты</b>\n\n\n📅 Среда, 26 августа\n\n\n1. Концерт',
      parse_mode: 'HTML',
    }),
  };

  const compacted = compactEventTelegramRequest(init);
  assert.equal(
    JSON.parse(compacted.body).text,
    '<b>🎤 Поп и хип-хоп концерты</b>\n📅 Среда, 26 августа\n\n1. Концерт',
  );
});

test('Stage digest remains text-only and removes price and hall duplication', () => {
  const source = [
    '<b>🎙 Stage StandUp Club</b>',
    '📅 Суббота, 29 августа',
    'Найдено событий/сеансов: 2',
    '<b>1. Два феникса / Офлайн подкаст</b>',
    '📍 Stage StandUp Club | Черный зал |, ул. Восстания, 24/27 Б',
    '💳 стоимость уточняйте на странице билетов · 18+',
    '<b>2. Динара Курбанова / Стендап-концерт</b>',
    '📍 Stage StandUp Club | Красный зал, ул. Восстания, 24/27Б',
    '💳 стоимость уточняйте на странице билетов · 18+',
  ].join('\n');

  const text = compactEventCaption(source);
  assert.doesNotMatch(text, /стоимость уточняйте/u);
  assert.doesNotMatch(text, /Черный зал|Красный зал/u);
  assert.equal((text.match(/📍/gu) || []).length, 1);
});

test('runtime no longer imports event collage or converts event messages to photos', () => {
  const source = fs.readFileSync(path.join(root, 'api', 'index.js'), 'utf8');
  assert.doesNotMatch(source, /event-collage/);
  assert.doesNotMatch(source, /maybeSendEventCollage/);
  assert.doesNotMatch(source, /sendPhoto/);
  assert.match(source, /compactEventTelegramRequest/);
});

test('text-only event sanitizer has no image-processing dependency', () => {
  const source = fs.readFileSync(path.join(root, 'api', 'event-text-sanitizer.cjs'), 'utf8');
  assert.doesNotMatch(source, /sharp/);
  assert.doesNotMatch(source, /sendPhoto/);
});

test('obsolete concert and Stage image helpers are removed', () => {
  for (const relative of [
    'api/event-collage.cjs',
    'api/event-collage-base.cjs',
    'api/stage-poster.cjs',
  ]) {
    assert.equal(fs.existsSync(path.join(root, relative)), false, `${relative} must stay removed`);
  }
});
