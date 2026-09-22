const test = require('node:test');
const assert = require('node:assert/strict');
const jpeg = require('jpeg-js');
const { PNG } = require('pngjs');

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

function makePng(width, height, painter) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a = 255] = painter(x, y);
      const offset = (y * width + x) * 4;
      png.data[offset] = r;
      png.data[offset + 1] = g;
      png.data[offset + 2] = b;
      png.data[offset + 3] = a;
    }
  }
  return PNG.sync.write(png);
}

function solidPng(width, height, value) {
  return makePng(width, height, () => value);
}

function decodeJpeg(buffer) {
  return jpeg.decode(buffer, { useTArray: true, formatAsRGBA: true });
}

function pixel(image, x, y) {
  const offset = (y * image.width + x) * 4;
  return [...image.data.subarray(offset, offset + 3)];
}

const TINY_PNG = solidPng(1, 1, [240, 240, 240, 255]);

test('cinema digest exposes one-post helpers', () => {
  assert.equal(typeof cinema.kinopoiskSearchUrl, 'function');
  assert.equal(typeof cinema.buildCinemaDigestCaption, 'function');
  assert.equal(typeof cinema.collageGrid, 'function');
  assert.equal(typeof cinema.buildCinemaCollage, 'function');
});

test('each title in the digest caption is a clickable Kinopoisk link', () => {
  const caption = cinema.buildCinemaDigestCaption(ROWS, '2026-08-20');
  assert.match(caption, /🎬 <b>Кинопремьеры — 20 августа<\/b>/);
  assert.match(caption, /Человек-паук: Новый день<\/a>/);
  assert.match(caption, /Мираж Синема Санкт-Петербург, Кинополис Мурино/);
  assert.match(caption, /Мотор Сити<\/a>/);
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
  const brightPoster = solidPng(120, 180, [244, 244, 244, 255]);
  const rows = Array.from({ length: 5 }, (_, index) => ({
    title: `Фильм ${index + 1}`,
    posterUrl: `https://cdn.mirage.ru/images/film/7000/small/p${7500 + index}.jpg`,
  }));
  const image = decodeJpeg(await cinema.buildCinemaCollage(rows, {
    fetchImpl: async () => new Response(brightPoster, { status: 200, headers: { 'content-type': 'image/png' } }),
    tileWidth: 120,
    tileHeight: 180,
    gap: 8,
  }));

  assert.equal(image.width, 376);
  assert.equal(image.height, 368);
  assert.ok(pixel(image, 10, 278).every((value) => value < 80));
  assert.ok(pixel(image, 70, 278).every((value) => value > 150));
  assert.ok(pixel(image, 300, 278).every((value) => value > 150));
  assert.ok(pixel(image, 366, 278).every((value) => value < 80));
});

test('seven-poster collage uses a compact 4 plus 3 layout', async () => {
  const poster = solidPng(120, 180, [221, 221, 221, 255]);
  const rows = Array.from({ length: 7 }, (_, index) => ({
    title: `Премьера ${index + 1}`,
    posterUrl: `https://cdn.mirage.ru/images/film/7000/small/p${7600 + index}.jpg`,
  }));
  const image = decodeJpeg(await cinema.buildCinemaCollage(rows, {
    fetchImpl: async () => new Response(poster, { status: 200, headers: { 'content-type': 'image/png' } }),
    tileWidth: 120,
    tileHeight: 180,
    gap: 8,
  }));
  assert.equal(image.width, 504);
  assert.equal(image.height, 368);
});

test('cinema collage keeps the entire wide image visible when an unusual source is not portrait', async () => {
  const poster = makePng(180, 60, (x) => x < 60 ? [255, 0, 0, 255] : x < 120 ? [0, 255, 0, 255] : [0, 0, 255, 255]);
  const image = decodeJpeg(await cinema.buildCinemaCollage([ROWS[0]], {
    fetchImpl: async () => new Response(poster, { status: 200, headers: { 'content-type': 'image/png' } }),
    tileWidth: 120,
    tileHeight: 180,
    gap: 0,
  }));

  assert.ok(pixel(image, 8, 90)[0] > 160);
  assert.ok(pixel(image, 60, 90)[1] > 120);
  assert.ok(pixel(image, 112, 90)[2] > 160);
});

test('portrait cinema poster fills the normal tile without visible black bands', async () => {
  const poster = solidPng(120, 180, [238, 238, 238, 255]);
  const image = decodeJpeg(await cinema.buildCinemaCollage([ROWS[0]], {
    fetchImpl: async () => new Response(poster, { status: 200, headers: { 'content-type': 'image/png' } }),
    tileWidth: 120,
    tileHeight: 180,
    gap: 0,
  }));
  assert.ok(pixel(image, 112, 170).every((value) => value > 150));
});

test('cinema collage does not paint number badges over the poster artwork', async () => {
  const poster = solidPng(120, 180, [238, 238, 238, 255]);
  const image = decodeJpeg(await cinema.buildCinemaCollage([ROWS[0]], {
    fetchImpl: async () => new Response(poster, { status: 200, headers: { 'content-type': 'image/png' } }),
    tileWidth: 120,
    tileHeight: 180,
    gap: 0,
  }));
  assert.ok(pixel(image, 30, 30).every((value) => value > 150));
});
