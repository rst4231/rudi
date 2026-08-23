const test = require('node:test');
const assert = require('node:assert/strict');
const author = require('../api/products-update-author.cjs');

test('collapses legacy HTML and duplicate update footers into one current line', () => {
  const text = 'Список продуктов\nСыр\n<i>Обновлен: 22.08.2026 в 21:54</i>\nОбновлено: СТАРОЕ · 21:53';
  const out = author.withLatestProductsUpdateAuthor(text, 'РУСТАМ', new Date('2026-08-22T18:54:00Z'));
  assert.equal((out.match(/Обновлено:/gu) || []).length, 1);
  assert.match(out, /Обновлено: РУСТАМ · 21:54/u);
  assert.doesNotMatch(out, /22\.08\.2026/u);
  assert.doesNotMatch(out, /СТАРОЕ/u);
});
