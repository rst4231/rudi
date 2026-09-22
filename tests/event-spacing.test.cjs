const test = require('node:test');
const assert = require('node:assert/strict');
const { compactEventCaption } = require('../api/event-text-sanitizer.cjs');

test('Stage digest keeps event details compact and removes ticket and hall noise', () => {
  const source = [
    '<b>🎙 Stage StandUp Club</b>',
    '', '', '',
    '📅 Суббота, 29 августа',
    '', '',
    'Найдено событий/сеансов: 2',
    '', '',
    '<b>1. Два феникса / Офлайн подкаст</b>',
    '🕘 17:00',
    '📍 Stage StandUp Club | Черный зал |, ул. Восстания, 24/27 Б',
    '💳 стоимость уточняйте на странице билетов · 18+',
    '<a href="https://stage.example/1">Официальная страница →</a>',
    '<b>2. Динара Курбанова / Стендап-концерт</b>',
    '🕘 18:30',
    '📍 Stage StandUp Club | Красный зал, ул. Восстания, 24/27Б',
    '💳 стоимость уточняйте на странице билетов · 18+',
    '<a href="https://stage.example/2">Официальная страница →</a>',
  ].join('\n');

  const formatted = compactEventCaption(source);
  assert.equal(formatted, [
    '<b>🎙 Stage StandUp Club</b>',
    '📅 Суббота, 29 августа',
    'Найдено событий/сеансов: 2',
    '📍 Stage StandUp Club, ул. Восстания, 24/27 Б',
    '',
    '<b>1. Два феникса / Офлайн подкаст</b>',
    '🕘 17:00',
    '<a href="https://stage.example/1">Официальная страница →</a>',
    '',
    '<b>2. Динара Курбанова / Стендап-концерт</b>',
    '🕘 18:30',
    '<a href="https://stage.example/2">Официальная страница →</a>',
  ].join('\n'));
  assert.doesNotMatch(formatted, /стоимость уточняйте|Черный зал|Красный зал/u);
  assert.doesNotMatch(formatted, /\n{3,}/);
});
