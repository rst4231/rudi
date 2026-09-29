const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const app=fs.readFileSync('public/app.js','utf8');
const api=fs.readFileSync('api/partner-message.js','utf8');
const css=fs.readFileSync('public/app.css','utf8');

test('startup loads compact Home data and keeps hidden tabs lazy',()=>{
  assert.match(app,/rudiAction=home-bootstrap/);
  assert.match(app,/body:JSON\.stringify\(\{initData:telegramInitData\(\)\}\)/);
  assert.match(app,/const includeHome=initialBootstrapTab\(\)===['"]home['"]/);

  const initStart=app.indexOf('      async function init(){');
  const initEnd=app.indexOf('      init().catch(',initStart);
  assert.ok(initStart>=0&&initEnd>initStart);
  const init=app.slice(initStart,initEnd);
  for(const forbidden of ['loadWorkCalendar();','loadSharedAlbum();',"loadFeed({silent:true});",'loadDianaCycle();','loadActivityJournal();']){
    assert.equal(init.includes(forbidden),false,forbidden+' must stay lazy');
  }

  const productsStart=app.indexOf('      function setupProducts(){');
  const productsEnd=app.indexOf('      let currentRecipeSet=',productsStart);
  assert.ok(productsStart>=0&&productsEnd>productsStart);
  assert.equal(app.slice(productsStart,productsEnd).includes('loadProducts();'),false);

  const wishlistStart=app.indexOf('      function setupWishlist(){');
  const wishlistEnd=app.indexOf('      function renderNearest(',wishlistStart);
  assert.ok(wishlistStart>=0&&wishlistEnd>wishlistStart);
  assert.equal(app.slice(wishlistStart,wishlistEnd).includes("wishlistRequest('list')"),false);
});

test('bootstrap does not rebuild encrypted backup unless recovery state changed',()=>{
  assert.match(api,/const shouldRefreshBackup = !backupSnapshot \|\| Boolean\(handoffSnapshot\) \|\| recipientsChanged/);
  assert.match(api,/shouldRefreshBackup[\s\S]*?createStateBackup/);
  assert.match(api,/\.\.\.\(backupToken \? \{ backupToken \} : \{\}\)/);
  assert.match(app,/stateBackupSyncFresh\(6\*60\*60\*1000\)/);
  assert.match(app,/if\(!data\.backupToken\) setTimeout\(\(\)=>refreshStateBackup\(\),250\)/);
});

test('Home bootstrap sends compact summaries rather than full hidden-tab payloads',()=>{
  assert.match(api,/if \(action === 'home-bootstrap'\)/);
  assert.match(api,/function compactFeedForHome/);
  assert.match(api,/items:\s*\(Array\.isArray\(journal\.items\)[\s\S]*?\.slice\(0, 10\)/);
  assert.match(api,/balances: score\.balances \|\| \{\}/);
  assert.doesNotMatch(api,/activity:\s*\{\s*\.\.\.journal/);
  assert.match(api,/counts:\s*\{/);
  assert.match(api,/wishlist:\s*\(wishlist\.items \|\| \[\]\)\.filter/);
  assert.match(api,/photos:/);
  assert.match(api,/workDay/);
});

test('Lulu identity uses the same visual scale as profile cards',()=>{
  assert.match(css,/\.lulu-card\{[\s\S]*?gap:7px;padding:9px 11px/);
  assert.match(css,/\.lulu-identity\{[^\n]*grid-template-columns:46px minmax\(0,1fr\)/);
  assert.match(css,/\.lulu-avatar\{width:46px;height:46px/);
  assert.match(css,/\.lulu-copy h2\{[^\n]*font-size:17px/);
  assert.match(css,/@media\(max-width:430px\)\{[\s\S]*?\.lulu-identity\{grid-template-columns:43px minmax\(0,1fr\)[\s\S]*?\.lulu-avatar\{width:43px;height:43px[\s\S]*?\.lulu-copy h2\{font-size:17px\}/);
});

test('market ticker is not fetched for direct openings of hidden tabs',()=>{
  assert.match(app,/const onHome=initialBootstrapTab\(\)===['"]home['"]/);
  assert.match(app,/if\(enabled&&onHome\) loadMarketTicker/);
});
