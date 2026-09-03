const test = require('node:test');
const assert = require('node:assert/strict');

const {
  loadMiragePremieresWithFallback,
  releaseDateMatchesMiragePage,
} = require('../api/cinema-premieres-collage.cjs');

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return body; },
  };
}

test('Mirage fallback is tried when the primary source succeeds but has no premieres for the date', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    const value = String(url);
    calls.push(value);

    if (value === 'https://www.mirage.ru/spb/films/soon/' || value === 'https://www.mirage.ru/spb/films/') {
      return response('<html><body>stale primary listing</body></html>');
    }
    if (value === 'https://film.mirage.ru/') {
      return response('<a href="/film/7534/beguschaya.htm">Бегущая</a>');
    }
    if (value.includes('/film/7534/')) {
      return response('<html><body><h1>Бегущая</h1><div>с 03 Сентября</div><div>03.09.2026</div><img src="https://cdn.mirage.ru/images/film/7000/big/s7534.jpg"></body></html>');
    }
    return response('', 404);
  };

  const rows = await loadMiragePremieresWithFallback('2026-09-03', {
    name: 'Мираж Синема Санкт-Петербург',
    url: 'https://www.mirage.ru/spb/films/soon/',
    fallbackUrls: ['https://film.mirage.ru/'],
  }, { fetchImpl, attempts: 1, timeoutMs: 1000 });

  assert.ok(calls.includes('https://film.mirage.ru/'));
  assert.deepEqual(rows, [{
    title: 'Бегущая',
    posterUrl: 'https://cdn.mirage.ru/images/film/7000/big/s7534.jpg',
    source: 'Мираж Синема Санкт-Петербург',
    sourceUrl: 'https://film.mirage.ru/film/7534/beguschaya.htm',
  }]);
});

test('Mirage mirrors are combined when the first non-empty mirror has only part of the premiere list', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    const value = String(url);
    calls.push(value);

    if (value === 'https://app.mirage.ru/') {
      return response('<a href="/film/7534/beguschaya.htm">Бегущая</a>');
    }
    if (value === 'https://cloud.mirage.ru/') {
      return response('<a href="/film/7534/beguschaya.htm">Бегущая</a><a href="/film/7536/mia-i-monstry.htm">Миа и монстры</a>');
    }
    if (value.includes('/film/7534/')) {
      return response('<html><body><h1>Бегущая</h1><div>с 03 Сентября</div><img src="https://cdn.mirage.ru/images/film/7000/big/s7534.jpg"></body></html>');
    }
    if (value.includes('/film/7536/')) {
      return response('<html><body><h1>Миа и монстры</h1><div>с 03 Сентября</div><img src="https://cdn.mirage.ru/images/film/7000/big/s7536.jpg"></body></html>');
    }
    return response('', 404);
  };

  const rows = await loadMiragePremieresWithFallback('2026-09-03', {
    name: 'Мираж Синема Санкт-Петербург',
    url: 'https://app.mirage.ru/',
    fallbackUrls: ['https://cloud.mirage.ru/'],
  }, { fetchImpl, attempts: 1, timeoutMs: 1000 });

  assert.ok(calls.includes('https://cloud.mirage.ru/'));
  assert.deepEqual(rows.map((row) => row.title), ['Бегущая', 'Миа и монстры']);
});

test('Mirage textual Russian release date matches without requiring a numeric date', () => {
  assert.equal(
    releaseDateMatchesMiragePage('<html><body><div>с 03 Сентября</div></body></html>', '2026-09-03'),
    true,
  );
});
