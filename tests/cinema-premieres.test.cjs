const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const cinema = require('../api/cinema-premieres.cjs');
const config = require('../api/events-config.cjs');

const KINOPOLIS_HOME = `
<section>
  <a href="/release/24436?date=2026-08-27">Лунтик</a>
  <a href="/release/25066?foo=1&date=2026-08-27">Мятеж</a>
  <a href="/release/25320?date=2026-09-03">Не по-детски</a>
  <a href="/release/24436?date=2026-08-27">Лунтик повтор</a>
</section>`;

const KINOPOLIS_FILM = `
<html><head><meta property="og:title" content="Лунтик. Обратная Сторона Луны"></head>
<body><h1>Лунтик. Обратная Сторона Луны</h1>
<img src="https://s1ru1.kinoplan24.ru/903/abc/24436.jpg?mode=fit&width=999&height=999"></body></html>`;

const MIRAGE_SOON = `
<a href="/film/7426/moana.htm">Моана</a>
<a href="/film/7515/zhertva-obstoyatelstv-.htm">Жертва обстоятельств</a>
<a href="/film/7426/moana.htm">Моана повтор</a>`;

const MIRAGE_FILM = `
<html><head><title>Моана</title></head><body>
<img src="https://cdn.mirage.ru/images/film/7000/big/s7426.jpg">
<h1>МОАНА</h1><div>США, 2026</div><div>с 27 Августа</div>
<div>ВНИМАНИЕ! Вы выбираете сеансы начиная с даты премьеры фильма 27.08.2026</div>
</body></html>`;

const MIRAGE_OTHER_DATE = `
<html><body><img src="https://cdn.mirage.ru/images/film/7000/big/s7515.jpg">
<h1>Жертва обстоятельств</h1><div>с 20 Августа</div><div>20.08.2026</div></body></html>`;

test('cinema premieres module exposes poster-aware parsing and publishing API', () => {
  assert.equal(typeof cinema.extractKinopolisReleaseLinks, 'function');
  assert.equal(typeof cinema.parseKinopolisReleasePage, 'function');
  assert.equal(typeof cinema.extractMirageFilmLinks, 'function');
  assert.equal(typeof cinema.parseMirageFilmPage, 'function');
  assert.equal(typeof cinema.mergePremieres, 'function');
  assert.equal(typeof cinema.buildCinemaPremiereCaption, 'function');
  assert.equal(typeof cinema.publishWeeklyCinemaPremieres, 'function');
});

test('Kinopolis extracts only release links for the requested Thursday and deduplicates them', () => {
  assert.deepEqual(cinema.extractKinopolisReleaseLinks(KINOPOLIS_HOME, '2026-08-27'), [
    { id: '24436', url: 'https://sky.kinopolis-film.ru/release/24436?date=2026-08-27' },
    { id: '25066', url: 'https://sky.kinopolis-film.ru/release/25066?foo=1&date=2026-08-27' },
  ]);
});

test('Kinopolis release page returns the official poster and title', () => {
  assert.deepEqual(
    cinema.parseKinopolisReleasePage(
      KINOPOLIS_FILM,
      'https://sky.kinopolis-film.ru/release/24436?date=2026-08-27',
      'Кинополис Мурино',
    ),
    {
      title: 'Лунтик. Обратная Сторона Луны',
      posterUrl: 'https://s1ru1.kinoplan24.ru/903/abc/24436.jpg?mode=fit&width=999&height=999',
      source: 'Кинополис Мурино',
      sourceUrl: 'https://sky.kinopolis-film.ru/release/24436?date=2026-08-27',
    },
  );
});

test('Mirage film links are deduplicated and the film page must match the requested premiere date', () => {
  assert.deepEqual(cinema.extractMirageFilmLinks(MIRAGE_SOON, 'https://www.mirage.ru/spb/films/soon/'), [
    { id: '7426', url: 'https://www.mirage.ru/film/7426/moana.htm' },
    { id: '7515', url: 'https://www.mirage.ru/film/7515/zhertva-obstoyatelstv-.htm' },
  ]);
  assert.deepEqual(
    cinema.parseMirageFilmPage(MIRAGE_FILM, 'https://www.mirage.ru/film/7426/moana.htm', '2026-08-27', 'Мираж Синема'),
    {
      title: 'МОАНА',
      posterUrl: 'https://cdn.mirage.ru/images/film/7000/big/s7426.jpg',
      source: 'Мираж Синема',
      sourceUrl: 'https://www.mirage.ru/film/7426/moana.htm',
    },
  );
  assert.equal(
    cinema.parseMirageFilmPage(MIRAGE_OTHER_DATE, 'https://www.mirage.ru/film/7515/zhertva-obstoyatelstv-.htm', '2026-08-27', 'Мираж Синема'),
    null,
  );
});

test('merge combines the same film across cinemas and suppresses already sent titles', () => {
  const rows = cinema.mergePremieres([
    {
      title: 'Пентхаус', posterUrl: 'https://poster/kinopolis.jpg', source: 'Кинополис Мурино',
      sourceUrl: 'https://kinopolis/film',
    },
    {
      title: 'Пентхаус', posterUrl: 'https://poster/mirage.jpg', source: 'Мираж Синема',
      sourceUrl: 'https://mirage/film',
    },
    {
      title: 'Майкл', posterUrl: 'https://poster/michael.jpg', source: 'Кинополис Мурино',
      sourceUrl: 'https://kinopolis/michael',
    },
  ], ['МАЙКЛ']);
  assert.deepEqual(rows, [{
    title: 'Пентхаус',
    posterUrl: 'https://poster/kinopolis.jpg',
    sources: ['Кинополис Мурино', 'Мираж Синема'],
    sourceUrls: [
      { name: 'Кинополис Мурино', url: 'https://kinopolis/film' },
      { name: 'Мираж Синема', url: 'https://mirage/film' },
    ],
  }]);
});

test('Thursday is resolved in Moscow time at the existing 21:30 UTC cron boundary', () => {
  assert.equal(cinema.isThursdayInMoscow(new Date('2026-08-26T21:30:00Z')), true);
  assert.equal(cinema.moscowDateKey(new Date('2026-08-26T21:30:00Z')), '2026-08-27');
});

test('each premiere caption is designed for a separate Telegram photo card', () => {
  const text = cinema.buildCinemaPremiereCaption({
    title: 'Пентхаус',
    sources: ['Кинополис Мурино', 'Мираж Синема'],
    sourceUrls: [
      { name: 'Кинополис Мурино', url: 'https://kinopolis/film' },
      { name: 'Мираж Синема', url: 'https://mirage/film' },
    ],
  }, '2026-08-27');
  assert.match(text, /🎬 <b>Пентхаус<\/b>/);
  assert.match(text, /Премьера: 27 августа/);
  assert.match(text, /Кинополис Мурино, Мираж Синема/);
  assert.equal((text.match(/Пентхаус/g) || []).length, 1);
});

test('events config validates remote-editable venue exclusions and cinema sources', () => {
  const parsed = config.validateEventsConfig({
    version: 1,
    blockedVenueTokens: ['Севкабель', 'брусницын'],
    cinemaPremieres: {
      enabled: true,
      topicId: 19,
      maxItems: 12,
      kinopolis: { name: 'Кинополис Мурино', url: 'https://sky.kinopolis-film.ru/' },
      mirage: { name: 'Мираж Синема', url: 'https://www.mirage.ru/spb/films/soon/' },
    },
  });
  assert.deepEqual(parsed.blockedVenueTokens, ['севкабель', 'брусницын']);
  assert.equal(parsed.cinemaPremieres.topicId, 19);
  assert.equal(parsed.cinemaPremieres.maxItems, 12);
});

test('event runtime loads venue exclusions from remote events config before formatting messages', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'build.cjs'), 'utf8');
  assert.match(source, /EVENTS_CONFIG_URL/);
  assert.match(source, /loadEventsConfig/);
  assert.match(source, /blockedVenueTokens/);
  assert.match(source, /filter\(event=>eventVenueAllowed\(event,blockedVenueTokens\)\)/);
});

test('daily cron publishes cinema photo cards in the same scheduled run as regular content', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'api', 'daily-cron.js'), 'utf8');
  assert.match(source, /publishWeeklyCinemaPremieres/);
  assert.match(source, /RUDI_CINEMA_PREMIERES_RESULT/);
  const cinemaSource = fs.readFileSync(path.join(__dirname, '..', 'api', 'cinema-premieres.cjs'), 'utf8');
  assert.match(cinemaSource, /sendPhoto/);
  assert.match(cinemaSource, /photo: row\.posterUrl/);
});
