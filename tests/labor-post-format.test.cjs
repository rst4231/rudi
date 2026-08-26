const test = require('node:test');
const assert = require('node:assert/strict');
const { LABOR_ARTICLES, allArticleVariants } = require('../api/labor-code.cjs');

const REMOVED_HELPER_BLOCKS = [
  'Что важно работнику',
  'Сохраните договоры, уведомления, расчётные листки и переписку',
  'Какие документы проверить',
  'Что важно работодателю',
  'Если возник спор',
];

test('future Labor posts contain only the article body, reference and source link', () => {
  const variants = allArticleVariants();

  assert.equal(variants.length, LABOR_ARTICLES.length, 'each legal topic should have one future post variant');
  for (const variant of variants) {
    for (const removed of REMOVED_HELPER_BLOCKS) {
      assert.equal(variant.text.includes(removed), false, `${variant.id} still contains helper block: ${removed}`);
    }
    assert.match(variant.text, /⚖️ <b>Трудовой кодекс<\/b>/);
    assert.match(variant.text, /📘 /);
    assert.match(variant.text, /Актуальная редакция ТК РФ →/);
  }
});

test('existing worker article ids remain stable so publication history does not reset', () => {
  const variants = allArticleVariants();
  assert.equal(variants[0].id, 'contract:worker');
  assert.ok(variants.every((variant) => variant.id.endsWith(':worker')));
});
