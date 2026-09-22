const test = require('node:test');
const assert = require('node:assert/strict');
const { categorizeProduct, estimateWeeklyAmount } = require('../api/product-list-store.cjs');

test('frozen fish and seafood are not classified as ice cream', () => {
  assert.equal(categorizeProduct('минтай замороженный'), 'Мясо и рыба');
  assert.equal(categorizeProduct('кальмар замороженный'), 'Мясо и рыба');
  assert.equal(estimateWeeklyAmount('минтай замороженный'), '1–1,2 кг');
  assert.equal(estimateWeeklyAmount('кальмар замороженный'), '800 г–1 кг');
});

test('ice cream still stays in sweets', () => {
  assert.equal(categorizeProduct('мороженое'), 'Сладкое и снеки');
  assert.equal(estimateWeeklyAmount('мороженое'), '4 шт.');
});
