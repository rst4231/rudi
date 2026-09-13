const test = require('node:test');
const assert = require('node:assert/strict');
const { compactEventCaption, fitEventCaption } = require('../api/event-collage.cjs');

test('Stage digest removes ticket-price and hall details while keeping one shared address', () => {
  const source = [
    '<b>🎙 Stage StandUp Club</b>',
    '📅 Суббота, 29 августа',
    'Найдено событий/сеансов: 2',
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
  assert.doesNotMatch(formatted, /стоимость уточняйте/u);
  assert.doesNotMatch(formatted, /Черный зал|Красный зал/u);
  assert.equal((formatted.match(/📍/gu) || []).length, 1);
  assert.match(formatted, /📍 Stage StandUp Club, ул\. Восстания, 24\/27 Б/u);
});

test('Stage digest keeps the sixth event inside a Telegram photo caption', () => {
  const events = Array.from({ length: 6 }, (_, index) => [
    `<b>${index + 1}. Алексей Квашонкин и его ученики / Стендап-концерт ${index + 1}</b>`,
    `🕘 ${String(16 + index).padStart(2, '0')}:00`,
    `📍 Stage StandUp Club | ${index % 2 ? 'Красный' : 'Основной'} зал, ул. Восстания, 24/27Б`,
    '💳 стоимость уточняйте на странице билетов · 18+',
    `<a href="https://stage.example/${index + 1}">Официальная страница →</a>`,
  ]).flat();
  const source = [
    '<b>🎙 Stage StandUp Club</b>',
    '📅 Суббота, 12 сентября',
    'Найдено событий/сеансов: 6',
    ...events,
  ].join('\n');

  const fitted = fitEventCaption(source);
  assert.match(fitted, /6\. Алексей Квашонкин/u);
  assert.doesNotMatch(fitted, /\n…$/u);
  assert.doesNotMatch(fitted, /стоимость уточняйте/u);
  assert.doesNotMatch(fitted, /Основной зал|Красный зал/u);
});
