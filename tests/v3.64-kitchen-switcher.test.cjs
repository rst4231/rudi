const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('public/index.html','utf8');
const client=fs.readFileSync('public/app.js','utf8');
const css=fs.readFileSync('public/app.css','utf8');

test('kitchen has exactly three top section buttons',()=>{
  const buttons=[...html.matchAll(/data-kitchen-view="([^"]+)"/g)].map(match=>match[1]);
  assert.deepEqual(buttons,['products','recipes','saves']);
  assert.match(html,/>Продукты<\/button>/);
  assert.match(html,/>Рецепты<\/button>/);
  assert.match(html,/>Сохранения<\/button>/);
});

test('kitchen has one panel for each section and old recipe collapse toggle is gone',()=>{
  const panels=[...html.matchAll(/data-kitchen-panel="([^"]+)"/g)].map(match=>match[1]);
  assert.deepEqual(panels,['products','recipes','saves']);
  assert.doesNotMatch(html,/data-saves-toggle="recipe"/);
});

test('products and recipe cards are no longer registered as collapsible blocks',()=>{
  assert.doesNotMatch(client,/selector:'#productsListCard'/);
  assert.doesNotMatch(client,/selector:'#recipeIdeasCard'/);
});

test('kitchen switcher shows only selected panel',()=>{
  const start=client.indexOf('function setKitchenView');
  const end=client.indexOf('function setupKitchenSwitcher',start);
  const block=client.slice(start,end);
  assert.match(block,/panel\.hidden=!active/);
  assert.match(block,/button\.setAttribute\('aria-pressed',active\?'true':'false'\)/);
  assert.match(css,/\[data-kitchen-panel\]\[hidden\]\{display:none!important\}/);
});

test('saved recipe activity opens the Saves kitchen panel',()=>{
  assert.match(client,/saved-recipe[\s\S]*?setKitchenView\('saves',\{scroll:true\}\)/);
});
