const test = require('node:test');
const assert = require('node:assert/strict');

const catalog = require('../config/daily-content.json');
const sequence = require('../config/daily-content-sequence.json');
const settings = require('../config/rudi-settings.json');

const EXPECTED_CYCLE = [
  'Сон',
  'Психология мужчин',
  'Питание',
  'Движение',
  'Психология женщин',
  'Здоровье',
  'Наука',
];

test('Полезные факты чередуют семь тем без длинных тематических блоков', () => {
  assert.equal(settings.sources.dailyContentConfigUrl, 'https://raw.githubusercontent.com/rst4231/rudi/main/config/daily-content.json');
  assert.equal(sequence.enabled, true);
  assert.equal(sequence.startDate, '2026-09-09');
  assert.equal(sequence.luluStartId, 'lulu-booties-fit');

  const startIndex = catalog.facts.findIndex((entry) => entry.id === sequence.factsStartId);
  assert.ok(startIndex >= 0, 'factsStartId должен существовать в каталоге');

  const nextFacts = catalog.facts.slice(startIndex, startIndex + 21);
  assert.equal(nextFacts.length, 21, 'нужно минимум три полных недельных цикла');
  assert.deepEqual(
    nextFacts.map((entry) => entry.category),
    [...EXPECTED_CYCLE, ...EXPECTED_CYCLE, ...EXPECTED_CYCLE],
  );
  assert.equal(new Set(nextFacts.map((entry) => entry.id)).size, nextFacts.length, 'ID фактов не должны повторяться');

  for (const entry of nextFacts) {
    assert.match(entry.sourceUrl, /^https?:\/\//);
    assert.ok(entry.body.length >= 80, `${entry.id}: факт слишком короткий`);
  }

  const psychology = nextFacts.filter((entry) => entry.category.startsWith('Психология'));
  assert.equal(psychology.length, 6);
  for (const entry of psychology) {
    assert.match(entry.body, /(в среднем|не правило|не описыва)/i, `${entry.id}: нужна оговорка про среднюю тенденцию`);
  }
});
