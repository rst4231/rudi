const test = require('node:test');
const assert = require('node:assert/strict');

const cinema = require('../api/cinema-premieres-collage.cjs');

const ROWS = [
  {
    title: 'Человек-паук: Новый день',
    posterUrl: 'https://cdn.mirage.ru/images/film/7000/small/p7451.jpg',
    sources: ['Мираж Синема Санкт-Петербург', 'Кинополис Мурино'],
    sourceUrls: [],
  },
  {
    title: 'Мотор Сити',
    posterUrl: 'https://cdn.mirage.ru/images/film/7000/small/p7517.jpg',
    sources: ['Мираж Синема Санкт-Петербург'],
    sourceUrls: [],
  },
];

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

test('cinema digest exposes one-post helpers', () => {
  assert.equal(typeof cinema.kinopoiskSearchUrl, 'function');
  assert.equal(typeof cinema.buildCinemaDigestCaption, 'function');
  assert.equal(typeof cinema.collageGrid, 'function');
  assert.equal(typeof cinema.buildCinemaCollage, 'function');
});

test('each title in the digest caption is a clickable Kinopoisk link', () => {
  const caption = cinema.buildCinemaDigestCaption(ROWS, '2026-08-20');
  assert.match(caption, /🎬 <b>Кинопремьеры — 20 августа<\/b>/);
  assert.match(
    caption,
    /<a href="https:\/\/www\.kinopoisk\.ru\/index\.php\?kp_query=%D0%A7%D0%B5%D0%BB%D0%BE%D0%B2%D0%B5%D0%BA-%D0%BF%D0%B0%D1%83%D0%BA%3A%20%D0%9D%D0%BE%D0%B2%D1%8B%D0%B9%20%D0%B4%D0%B5%D0%BD%D1%8C">Человек-паук: Новый день<\/a>/,
  );
  assert.match(caption, /Мираж Синема Санкт-Петербург, Кинополис Мурино/);
  assert.match(caption, /<a href="https:\/\/www\.kinopoisk\.ru\/index\.php\?kp_query=%D0%9C%D0%BE%D1%82%D0%BE%D1%80%20%D0%A1%D0%B8%D1%82%D0%B8">Мотор Сити<\/a>/);
});

test('collage layout keeps up to 12 posters inside one image', () => {
  assert.deepEqual(cinema.collageGrid(1), { columns: 1, rows: 1 });
  assert.deepEqual(cinema.collageGrid(6), { columns: 3, rows: 2 });
  assert.deepEqual(cinema.collageGrid(10), { columns: 4, rows: 3 });
  assert.deepEqual(cinema.collageGrid(12), { columns: 4, rows: 3 });
});

test('collage renderer returns one JPEG for all poster rows', async () => {
  const fetchImpl = async () => new Response(TINY_PNG, {
    status: 200,
    headers: { 'content-type': 'image/png' },
  });
  const image = await cinema.buildCinemaCollage(ROWS, { fetchImpl, tileWidth: 120, tileHeight: 180 });
  assert.equal(Buffer.isBuffer(image), true);
  assert.deepEqual([...image.subarray(0, 3)], [0xff, 0xd8, 0xff]);
});
