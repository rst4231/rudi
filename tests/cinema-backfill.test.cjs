const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { validateEventsConfig } = require('../api/events-config.cjs');
const { mergePremieres } = require('../api/cinema-premieres.cjs');

const root = path.join(__dirname, '..');

function bundledConfig() {
  return JSON.parse(fs.readFileSync(path.join(root, 'config', 'events.json'), 'utf8'));
}

test('cinema sources are specifically Kinopolis Murino and Mirage Saint Petersburg', () => {
  const parsed = validateEventsConfig(bundledConfig());
  assert.equal(parsed.cinemaPremieres.kinopolis.name, 'Кинополис Мурино');
  assert.equal(parsed.cinemaPremieres.kinopolis.url, 'https://sky.kinopolis-film.ru/');
  assert.equal(parsed.cinemaPremieres.mirage.name, 'Мираж Синема Санкт-Петербург');
  assert.equal(parsed.cinemaPremieres.mirage.url, 'https://www.mirage.ru/spb/films/soon/');
});

test('20 August backfill has six unique poster cards and merges cinema overlap', () => {
  const parsed = validateEventsConfig(bundledConfig());
  const rows = parsed.cinemaPremieres.manualByDate['2026-08-20'];
  const merged = mergePremieres(rows, []);
  assert.equal(merged.length, 6);
  assert.ok(merged.every((row) => /^https:\/\//u.test(row.posterUrl)));

  const spider = merged.find((row) => row.title === 'Человек-паук: Новый день');
  assert.deepEqual(spider.sources, ['Мираж Синема Санкт-Петербург', 'Кинополис Мурино']);

  const sacrifice = merged.find((row) => row.title === 'Жертва обстоятельств');
  assert.deepEqual(sacrifice.sources, ['Мираж Синема Санкт-Петербург', 'Кинополис Мурино']);
});

test('one-time backfill is previewable, idempotent and persists sent-title dedupe', () => {
  const source = fs.readFileSync(path.join(root, 'api', 'cinema-backfill-20260820.js'), 'utf8');
  assert.match(source, /manual-backfill:\$\{DATE_KEY\}/);
  assert.match(source, /preview/);
  assert.match(source, /SENT_TITLES_KEY/);
  assert.match(source, /sendPhoto/);
  assert.match(source, /already-published/);
});
