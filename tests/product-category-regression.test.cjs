const test = require('node:test');
const assert = require('node:assert/strict');
const { categorizeProduct, estimateWeeklyAmount, normalizeProductListState } = require('../api/product-list-store.cjs');

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


test('Greek yogurt is dairy and stale saved categories are corrected on read', () => {
  assert.equal(categorizeProduct('Греческий йогурт'), 'Молочное и яйца');
  assert.equal(estimateWeeklyAmount('Греческий йогурт'), '8 шт.');

  const normalized = normalizeProductListState({
    initialized: true,
    version: 123,
    items: [{
      id: '1',
      text: 'Греческий йогурт',
      addedBy: 'Диана',
      category: 'Овощи и зелень',
      weeklyAmount: '1–1,5 кг',
      checked: false,
      createdAt: '2026-09-22T04:00:00.000Z',
    }],
    history: [],
  });

  assert.equal(normalized.items[0].category, 'Молочное и яйца');
  assert.equal(normalized.items[0].weeklyAmount, '8 шт.');
});


test('substring collisions stay in their real categories', () => {
  assert.equal(categorizeProduct('йогурт'), 'Молочное и яйца');
  assert.equal(categorizeProduct('сливки'), 'Молочное и яйца');
  assert.equal(categorizeProduct('масло сливочное'), 'Молочное и яйца');
  assert.equal(categorizeProduct('лимонад'), 'Напитки');
  assert.equal(categorizeProduct('батончик'), 'Сладкое и снеки');
  assert.equal(categorizeProduct('паста зубная'), 'Гигиена');
});
