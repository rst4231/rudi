const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const start = source.indexOf('function financeCategoryOutlineIcon(');
const end = source.indexOf('function renderFinanceCategories(', start);
const renderIcon = vm.runInNewContext('(' + source.slice(start, end).trim() + ')');
const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const select = html.match(/<select\b[^>]*id="financeCategoryIcon"[^>]*>([\s\S]*?)<\/select>/)[1];
const choices = [...select.matchAll(/<option value="([^"]+)"/g)].map(match => match[1]);

test('every category picker choice renders its own outline, including star and gamepad', () => {
  const rendered = choices.map(icon => renderIcon({name: 'Не помню', icon}));
  const receipt = renderIcon({name: 'Не помню', icon: '🧾'});
  for (let index = 0; index < choices.length; index++) {
    assert.match(rendered[index], /^<svg\b/, choices[index]);
    if (choices[index] !== '🧾') assert.notEqual(rendered[index], receipt, choices[index] + ' must not become a receipt');
  }
  assert.equal(new Set(rendered).size, choices.length, 'picker choices must not collapse into the same icon');
});

test('selected icon takes precedence over a matching category name', () => {
  for (const icon of choices) {
    const expected = renderIcon({name: 'Не помню', icon});
    for (const name of ['Жильё', 'Продукты', 'Транспорт', 'Еда', 'Досуг', 'Здоровье', 'Покупки', 'Бизнес', 'Услуги', 'Вне плана']) {
      assert.equal(renderIcon({name, icon}), expected, name + ' must respect ' + icon);
    }
  }
});

test('emoji presentation variants resolve to the same outline', () => {
  for (const icon of ['🍽️', '✈️', '🏋️', '🛠️']) {
    assert.equal(renderIcon({icon, name: 'Не помню'}), renderIcon({icon: icon.replace(/\uFE0F/g, ''), name: 'Не помню'}));
  }
});

test('categories without a saved icon retain the name-based fallback', () => {
  assert.equal(renderIcon({name: 'Жильё'}), renderIcon({name: 'Жильё', icon: '🏠'}));
  assert.equal(renderIcon({name: 'Продукты'}), renderIcon({name: 'Продукты', icon: '🛒'}));
  assert.match(renderIcon({name: 'Не помню', icon: '<script>alert(1)</script>'}), /^<svg\b/);
  assert.ok(!renderIcon({name: 'Не помню', icon: '<script>alert(1)</script>'}).includes('<script>'));
});

test('saved star and gamepad survive category readback and override the category name', async () => {
  const {saveExpenseCategory, updateExpenseCategory, readFinanceState, viewState, resetMutationQueueForTests} = require('../api/finance-store.cjs');
  resetMutationQueueForTests();
  let saved = null;
  const financeCache = {
    async get() {return structuredClone(saved);},
    async set(_key, value) {saved = structuredClone(value); return true;},
  };
  await saveExpenseCategory('Рустам', {name: 'Не помню', icon: '🎮', monthlyLimit: 5000}, {financeCache, id: 'icon-edit'});
  for (const icon of ['⭐', '🎮']) {
    await updateExpenseCategory('Рустам', {id: 'icon-edit', name: 'Кафе тест', icon}, {financeCache});
    const category = viewState(await readFinanceState({financeCache}), 'Рустам').categories.find(row => row.id === 'icon-edit');
    assert.equal(category.icon, icon);
    assert.equal(category.monthlyLimit, 5000);
    assert.equal(renderIcon(category), renderIcon({name: 'Не помню', icon}));
    assert.notEqual(renderIcon(category), renderIcon({name: 'Кафе тест', icon: '🍽️'}));
  }
});
