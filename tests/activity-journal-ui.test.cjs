const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const app=fs.readFileSync('public/app.js','utf8');
const css=fs.readFileSync('public/app.css','utf8');
const api=fs.readFileSync('api/partner-message.js','utf8');
const backup=fs.readFileSync('api/rudi-backup.cjs','utf8');

test('home exposes activity history through notification bell',()=>{
  assert.doesNotMatch(app,/activityTile\.dataset\.homeTile='activity'/);
  assert.match(app,/homeActivityNotificationsButton/);
  assert.match(app,/homeActivityNotificationDot/);
  assert.match(app,/homeActivityNotificationsPanel/);
  assert.match(app,/Что произошло у нас/);
  assert.match(app,/function renderActivityJournal\(payload\)/);
  assert.match(app,/function loadActivityJournal/);
  assert.match(app,/function markActivityNotificationsSeen\(\)/);
  assert.match(app,/HOME_TILE_DEFAULT_ORDER = \['dashboard','rustam','diana','lulu','nearest','priority','partner','new','quick-access','smart-home','car','markets'\]/);
  assert.match(css,/\.home-activity-notifications-button/);
  assert.match(css,/\.home-activity-row/);
  assert.match(app,/luluTile\.dataset\.homeTile='lulu'/);
  assert.match(app,/renderLulu\(payload\?\.lulu\)/);
});

test('activity journal is wired to real RUDI events',()=>{
  assert.match(api,/if \(action === 'activity'\)/);
  assert.match(api,/type: 'products'/);
  assert.match(api,/type: 'wishlist'/);
  assert.match(api,/function reactionActivityView\(target\)/);
  assert.match(api,/function recordLikeActivity\(target, actor/);
  assert.match(api,/График Дианы обновился/);
  assert.match(api,/В общем альбоме появилось новое фото/);
  assert.match(api,/type: 'partner-message'/);
  assert.match(api,/type: 'task-complete'/);
  assert.match(api,/type: 'checklist-complete'/);
  assert.match(api,/type: 'mood'/);
  assert.match(api,/saved-date/);
  assert.match(api,/saved-recipe/);
  assert.match(api,/targetTab: 'saves'/);
  assert.match(api,/Грусть/);
  assert.match(api,/Скука/);
  assert.match(api,/Гнев/);
  assert.match(api,/Радость/);
  assert.match(api,/Любовь/);
  assert.match(app,/setTimeout\(\(\)=>loadActivityJournal\(\{silent:true\}\),180\)/);
});

test('activity journal is included in encrypted RUDI backup',()=>{
  assert.match(backup,/readActivityJournal/);
  assert.match(backup,/activityJournal: newerVersionState/);
  assert.match(backup,/restoreActivityJournalState/);
});


test('activity bell does not resurrect already-read items and rows are informational only',()=>{
  assert.match(app,/function parseActivitySeenMarker\(value\)/);
  assert.match(app,/function newerActivitySeenValue\(localValue,remoteValue\)/);
  assert.match(app,/function migrateLegacyActivitySeenMarker\(items,version\)/);
  assert.match(app,/homeDashboardState\.activityVersion=Math\.max/);
  assert.match(app,/const row=document\.createElement\('div'\);/);
  const renderStart=app.indexOf('function renderActivityJournal(payload)');
  const renderEnd=app.indexOf('async function loadActivityJournal',renderStart);
  const renderBlock=app.slice(renderStart,renderEnd);
  assert.doesNotMatch(renderBlock,/row\.addEventListener\('click'/);
  assert.doesNotMatch(renderBlock,/document\.createElement\(activityTab\?'button':'div'\)/);
  assert.match(css,/home-activity-notifications-panel \.home-activity-row\{[\s\S]*cursor:default!important/);
});
