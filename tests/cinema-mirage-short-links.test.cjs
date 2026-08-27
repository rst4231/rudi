const test = require('node:test');
const assert = require('node:assert/strict');

const cinema = require('../api/cinema-premieres.cjs');

test('Mirage film link extraction accepts mirror links that end at the numeric film id', () => {
  const html = [
    '<a href="/film/7426/">Моана</a>',
    '<a href="/film/7521/">Мятеж</a>',
    '<a href="/film/7426/">Моана повтор</a>',
  ].join('');

  assert.deepEqual(cinema.extractMirageFilmLinks(html, 'https://film.mirage.ru/'), [
    { id: '7426', url: 'https://film.mirage.ru/film/7426/' },
    { id: '7521', url: 'https://film.mirage.ru/film/7521/' },
  ]);
});
