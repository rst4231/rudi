const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.css'), 'utf8');

test('Kitchen tab exposes separate Products and recipe blocks', () => {
  assert.match(html, /id="kitchenTitle">Кухня</);
  assert.match(html, /id="productsListCard"/);
  assert.match(html, /id="recipeIdeasCard"/);
  assert.match(html, />Что можно приготовить</);
  assert.match(html, /data-app-tab="products"[\s\S]*?<span>Кухня<\/span>/);
});

test('recipe generator has manual ingredients and all requested selectors', () => {
  assert.match(html, /id="recipeIngredients"/);
  for (const value of ['oven','stove','multicooker']) assert.match(html, new RegExp('data-recipe-equipment="' + value + '"'));
  for (const value of ['breakfast','lunch','dinner']) assert.match(html, new RegExp('data-recipe-meal="' + value + '"'));
  for (const value of ['russian','italian','mexican','georgian']) assert.match(html, new RegExp('data-recipe-cuisine="' + value + '"'));
  for (const value of ['5','10','15','30','45']) assert.match(html, new RegExp('data-recipe-time="' + value + '"'));
  assert.match(js, /timeMinutes:Number\(recipeChoiceValue\('data-recipe-time'\)\|\|15\)/);
  assert.match(html, /id="recipeGenerate"/);
});

test('Kitchen blocks use persistent RUDI collapse state', () => {
  assert.match(js, /selector:'#productsListCard',key:'kitchen-products'/);
  assert.match(js, /selector:'#recipeIdeasCard',key:'kitchen-recipes'/);
  assert.match(js, /setBlockCollapsed\(key,collapsed\)/);
});

test('recipe results are rendered as text, without image generation', () => {
  assert.match(js, /function renderRecipeSuggestions\(recipes\)/);
  assert.match(js, /function renderRecipeDetails\(recipe\)/);
  assert.doesNotMatch(html, /recipeImage|recipe-image|Сгенерировать изображение/i);
  assert.match(css, /\/\* Kitchen recipe generator \*\//);
});


test('market ticker setting is visible only on Home', () => {
  assert.match(js, /marketTickerSetting\.hidden=next!=='home'/);
  assert.match(css, /body:not\(\[data-app-tab="home"\]\) \.market-ticker-setting/);
});

test('Photos taps do not scale the whole album card and memory like has a larger hit area', () => {
  assert.doesNotMatch(css, /\.daily-card:active,\.shared-album-card:active\{transform:scale\(\.992\)\}/);
  assert.match(css, /body\[data-app-tab="photos"\] \.shared-album-card:active[\s\S]*?transform:none!important/);
  assert.match(css, /body\[data-app-tab="photos"\] \.shared-album-memory-reaction \.reaction-button\{[\s\S]*?width:38px;[\s\S]*?height:38px/);
});
