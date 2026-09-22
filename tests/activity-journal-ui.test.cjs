const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const app=fs.readFileSync('public/app.js','utf8');
const css=fs.readFileSync('public/app.css','utf8');
const api=fs.readFileSync('api/partner-message.js','utf8');
const backup=fs.readFileSync('api/rudi-backup.cjs','utf8');

test('home contains a shared activity journal tile',()=>{
  assert.match(app,/data\.homeTile='activity'/);
  assert.match(app,/Что произошло у нас/);
  assert.match(app,/function renderActivityJournal\(payload\)/);
  assert.match(app,/function loadActivityJournal/);
  assert.match(app,/HOME_TILE_DEFAULT_ORDER = \['dashboard','cycle','activity','new','priority','partner','daily'\]/);
  assert.match(css,/\.home-activity-tile/);
  assert.match(css,/\.home-activity-row/);
});

test('activity journal is wired to real RUDI events',()=>{
  assert.match(api,/if \(action === 'activity'\)/);
  assert.match(api,/type: 'products'/);
  assert.match(api,/type: 'wishlist'/);
  assert.match(api,/type: 'photo-like'/);
  assert.match(api,/График Дианы обновился/);
  assert.match(api,/В общем альбоме появилось новое фото/);
  assert.match(api,/type: 'partner-message'/);
});

test('activity journal is included in encrypted RUDI backup',()=>{
  assert.match(backup,/readActivityJournal/);
  assert.match(backup,/activityJournal: newerVersionState/);
  assert.match(backup,/restoreActivityJournalState/);
});
