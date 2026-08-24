const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let cinema = null;
let config = null;
try { cinema = require('../api/cinema-premieres.cjs'); } catch {}
try { config = require('../api/events-config.cjs'); } catch {}

const MIRAGE_HTML = `
<section><h2>Скоро в кино</h2>
  <article><div>с 27 Августа 18+</div><a href="/film/1">Пентхаус</a><p>триллер, драма</p></article>
  <article><div>с 27 Августа 0+</div><a href="/film/2">Лунтик. Обратная Сторона Луны</a><p>приключения</p></article>
  <article><div>с 03 Сентября 18+</div><a href="/film/3">Сыграть в ящик</a><p>триллер</p></article>
</section>`;

const SCHEDULE_HTML = `
<div class="schedule">
  <h3>Майкл</h3><div>12:30</div>
  <h3>Пентхаус</h3><div>18:40</div>
  <h3>Пентхаус</h3><div>21:10</div>
</div>`;

test('cinema premieres module exists with the intended public API', () => {
  assert.ok(cinema);
  assert.equal(typeof cinema.parseMiragePremieres, 'function');
  assert.equal(typeof cinema.extractCinemaTitles, 'function');
  assert.equal(typeof cinema.mergePremieres, 'function');
  assert.equal(typeof cinema.buildCinemaPremieresMessage, 'function');
  assert.equal(typeof cinema.publishWeeklyCinemaPremieres, 'function');
});

test('Mirage parser returns only premieres whose release date is the requested Thursday', () => {
  assert.deepEqual(cinema.parseMiragePremieres(MIRAGE_HTML, '2026-08-27'), [
    'Пентхаус',
    'Лунтик. Обратная Сторона Луны',
  ]);
});

test('cinema schedule title extraction deduplicates repeated sessions', () => {
  assert.deepEqual(cinema.extractCinemaTitles(SCHEDULE_HTML), ['Майкл', 'Пентхаус']);
});

test('merge combines the same premiere from both cinemas and never returns a previously sent film', () => {
  const rows = cinema.mergePremieres([
    { title: 'Пентхаус', source: 'Кинополис Мурино' },
    { title: 'Пентхаус', source: 'Мираж Синема' },
    { title: 'Майкл', source: 'Кинополис Мурино' },
  ], ['майкл']);
  assert.deepEqual(rows, [
    { title: 'Пентхаус', sources: ['Кинополис Мурино', 'Мираж Синема'] },
  ]);
});

test('Thursday is resolved in Moscow time at the existing 21:30 UTC cron boundary', () => {
  assert.equal(cinema.isThursdayInMoscow(new Date('2026-08-26T21:30:00Z')), true);
  assert.equal(cinema.moscowDateKey(new Date('2026-08-26T21:30:00Z')), '2026-08-27');
});

test('premiere digest is one separate Telegram message with each film listed once', () => {
  const text = cinema.buildCinemaPremieresMessage([
    { title: 'Пентхаус', sources: ['Кинополис Мурино', 'Мираж Синема'] },
  ]);
  assert.match(text, /🎬 Премьеры недели/);
  assert.match(text, /Пентхаус/);
  assert.match(text, /Кинополис Мурино, Мираж Синема/);
  assert.equal((text.match(/Пентхаус/g) || []).length, 1);
});

test('events config validates remote-editable venue blocklist and cinema settings', () => {
  assert.ok(config);
  const parsed = config.validateEventsConfig({
    version: 1,
    blockedVenueTokens: ['севкабель', 'брусницын'],
    cinemaPremieres: {
      enabled: true,
      topicId: 19,
      kinopolis: { url: 'https://sky.kinopolis-film.ru/', fallbackUrl: 'https://afisha.yandex.ru/saint-petersburg/cinema/places/kinopolis-murino-murino/schedule' },
      mirage: { url: 'https://www.mirage.ru/' },
      initialSeenTitles: { kinopolis: ['Майкл'], mirage: ['Майкл'] },
    },
  });
  assert.deepEqual(parsed.blockedVenueTokens, ['севкабель', 'брусницын']);
  assert.equal(parsed.cinemaPremieres.topicId, 19);
});

test('event runtime reads venue exclusions from events config instead of hardcoding venues', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'build.cjs'), 'utf8');
  assert.match(source, /loadEventsConfig/);
  assert.match(source, /blockedVenueTokens/);
  assert.match(source, /filter\(eventVenueAllowed\)/);
  assert.doesNotMatch(source, /EVENT_VENUE_BLOCKLIST=\["севкабель","брусницын"\]/);
});

test('daily cron publishes cinema premieres in the same run as the regular daily content', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'api', 'daily-cron.js'), 'utf8');
  assert.match(source, /publishWeeklyCinemaPremieres/);
  assert.match(source, /RUDI_CINEMA_PREMIERES_RESULT/);
});
