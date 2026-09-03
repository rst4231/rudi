const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');

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
  assert.deepEqual(cinema.collageGrid(5), { columns: 3, rows: 2 });
  assert.deepEqual(cinema.collageGrid(6), { columns: 3, rows: 2 });
  assert.deepEqual(cinema.collageGrid(7), { columns: 4, rows: 2 });
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

test('five-poster collage centers the two posters in its last row', async () => {
  const brightPoster = await sharp(Buffer.from(`
    <svg width="120" height="180" xmlns="http://www.w3.org/2000/svg">
      <rect width="120" height="180" fill="#f4f4f4"/>
    </svg>`)).png().toBuffer();
  const rows = Array.from({ length: 5 }, (_, index) => ({
    title: `Фильм ${index + 1}`,
    posterUrl: `https://cdn.mirage.ru/images/film/7000/small/p${7500 + index}.jpg`,
  }));
  const image = await cinema.buildCinemaCollage(rows, {
    fetchImpl: async () => new Response(brightPoster, { status: 200, headers: { 'content-type': 'image/png' } }),
    tileWidth: 120,
    tileHeight: 180,
    gap: 8,
  });
  const { data, info } = await sharp(image).raw().toBuffer({ resolveWithObject: true });
  const pixel = (x, y) => {
    const offset = (y * info.width + x) * info.channels;
    return [...data.subarray(offset, offset + 3)];
  };

  assert.equal(info.width, 376);
  assert.equal(info.height, 368);
  assert.ok(pixel(10, 278).every((value) => value < 80), `last row starts too far left: ${pixel(10, 278)}`);
  assert.ok(pixel(70, 278).every((value) => value > 150), `centered first tile missing: ${pixel(70, 278)}`);
  assert.ok(pixel(300, 278).every((value) => value > 150), `centered second tile missing: ${pixel(300, 278)}`);
  assert.ok(pixel(366, 278).every((value) => value < 80), `last row ends too far right: ${pixel(366, 278)}`);
});

test('seven-poster collage uses a compact 4 plus 3 layout', async () => {
  const poster = await sharp(Buffer.from(`
    <svg width="120" height="180" xmlns="http://www.w3.org/2000/svg">
      <rect width="120" height="180" fill="#dddddd"/>
    </svg>`)).png().toBuffer();
  const rows = Array.from({ length: 7 }, (_, index) => ({
    title: `Премьера ${index + 1}`,
    posterUrl: `https://cdn.mirage.ru/images/film/7000/small/p${7600 + index}.jpg`,
  }));
  const image = await cinema.buildCinemaCollage(rows, {
    fetchImpl: async () => new Response(poster, { status: 200, headers: { 'content-type': 'image/png' } }),
    tileWidth: 120,
    tileHeight: 180,
    gap: 8,
  });
  const info = await sharp(image).metadata();
  assert.equal(info.width, 504);
  assert.equal(info.height, 368);
});

test('cinema collage keeps the entire poster visible without black letterbox bands', async () => {
  const poster = await sharp(Buffer.from(`
    <svg width="180" height="60" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="60" height="60" fill="#ff0000"/>
      <rect x="60" y="0" width="60" height="60" fill="#00ff00"/>
      <rect x="120" y="0" width="60" height="60" fill="#0000ff"/>
    </svg>`)).png().toBuffer();

  const fetchImpl = async () => new Response(poster, {
    status: 200,
    headers: { 'content-type': 'image/png' },
  });
  const image = await cinema.buildCinemaCollage([ROWS[0]], {
    fetchImpl,
    tileWidth: 120,
    tileHeight: 180,
    gap: 0,
  });
  const { data, info } = await sharp(image).raw().toBuffer({ resolveWithObject: true });
  const pixel = (x, y) => {
    const offset = (y * info.width + x) * info.channels;
    return [...data.subarray(offset, offset + 3)];
  };

  const left = pixel(8, 90);
  const center = pixel(60, 90);
  const right = pixel(112, 90);
  const corner = pixel(112, 8);

  assert.ok(left[0] > 180 && left[1] < 100 && left[2] < 100, `left edge was cropped: ${left}`);
  assert.ok(center[1] > 140 && center[0] < 120 && center[2] < 120, `center stripe missing: ${center}`);
  assert.ok(right[2] > 180 && right[0] < 100 && right[1] < 100, `right edge was cropped: ${right}`);
  assert.ok(corner.some((value) => value > 80), `letterbox background stayed black: ${corner}`);
});
