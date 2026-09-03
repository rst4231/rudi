const test = require('node:test');
const assert = require('node:assert/strict');

const { loadMiragePremieres } = require('../api/cinema-premieres.cjs');

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return body; },
  };
}

test('Mirage loader also checks current films because release-day titles can disappear from Soon after midnight', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    const value = String(url);
    calls.push(value);

    if (value === 'https://www.mirage.ru/spb/films/soon/') {
      return response('<a href="/film/9001/future.htm">Будущий фильм</a>');
    }
    if (value === 'https://www.mirage.ru/spb/films/') {
      return response('<a href="/film/8001/today.htm">Сегодняшняя премьера</a>');
    }
    if (value.includes('/film/9001/')) {
      return response('<html><body><h1>Будущий фильм</h1><div>с 03 Сентября</div><img src="https://cdn.mirage.ru/images/film/9000/big/s9001.jpg"></body></html>');
    }
    if (value.includes('/film/8001/')) {
      return response('<html><body><h1>Сегодняшняя премьера</h1><div>с 27 Августа</div><div>27.08.2026</div><img src="https://cdn.mirage.ru/images/film/8000/big/s8001.jpg"></body></html>');
    }
    return response('', 404);
  };

  const rows = await loadMiragePremieres('2026-08-27', {
    name: 'Мираж Синема Санкт-Петербург',
    url: 'https://www.mirage.ru/spb/films/soon/',
  }, { fetchImpl, attempts: 1, timeoutMs: 1000 });

  assert.ok(calls.includes('https://www.mirage.ru/spb/films/'));
  assert.deepEqual(rows, [{
    title: 'Сегодняшняя премьера',
    posterUrl: 'https://cdn.mirage.ru/images/film/8000/small/p8001.jpg',
    source: 'Мираж Синема Санкт-Петербург',
    sourceUrl: 'https://www.mirage.ru/film/8001/today.htm',
  }]);
});
