const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildRuntime } = require('../build.cjs');

function runtimeSource() {
  buildRuntime();
  return fs.readFileSync(path.join(__dirname, '..', 'runtime', 'generated-runtime.cjs'), 'utf8');
}

test('recipes are published only on Monday, Wednesday and Friday', () => {
  const source = runtimeSource();
  assert.match(source, /weekdayMondayZero/);
  assert.match(source, /function isRecipePublicationDay\(dateKey\)\{return \[0,2,4\]\.includes\(weekdayMondayZero\(dateKey\)\);\}/);
  assert.match(source, /sections\.has\("recipe"\)&&isRecipePublicationDay\(dateKey\)/);
});

test('recipe catalog has enough new unique meals to avoid the four-day repeat loop', () => {
  const configPath = path.join(__dirname, '..', 'config', 'recipes-extra.json');
  assert.equal(fs.existsSync(configPath), true, 'config/recipes-extra.json must exist');
  const extra = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  for (const meal of ['breakfast', 'lunch', 'snack', 'dinner']) {
    assert.ok(Array.isArray(extra[meal]), `${meal} must be an array`);
    assert.ok(extra[meal].length >= 8, `${meal} needs at least 8 additional recipes`);
    const titles = extra[meal].map((recipe) => recipe[0]);
    assert.equal(new Set(titles).size, titles.length, `${meal} titles must be unique`);
    for (const recipe of extra[meal]) {
      assert.equal(recipe.length, 6, `${meal} recipe must match runtime tuple shape`);
      assert.ok(Array.isArray(recipe[5]) && recipe[5].length >= 3, `${recipe[0]} needs cooking steps`);
    }
  }
  const source = runtimeSource();
  assert.match(source, /R\.breakfast\.push\(/);
  assert.match(source, /R\.lunch\.push\(/);
  assert.match(source, /R\.snack\.push\(/);
  assert.match(source, /R\.dinner\.push\(/);
});
