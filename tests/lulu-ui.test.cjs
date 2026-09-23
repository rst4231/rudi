const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const app=fs.readFileSync('public/app.js','utf8');
const css=fs.readFileSync('public/app.css','utf8');
const api=fs.readFileSync('api/partner-message.js','utf8');
const backup=fs.readFileSync('api/rudi-backup.cjs','utf8');

test('Lulu is a movable non-collapsible home card with compact walk action',()=>{
  assert.match(app,/luluTile\.dataset\.homeTile='lulu'/);
  assert.match(app,/\/lulu-card\.webp\?v=1\.9\.6/);
  assert.match(app,/id="luluWalkStatus"/);
  assert.match(app,/id="luluWalkButton"/);
  assert.doesNotMatch(app,/selector:'#homeLuluTile',key:'lulu'/);
  assert.match(app,/profile\.after\(selfCard\.tile,partnerCard\.tile,luluTile,nearest\)/);
  assert.match(css,/\.lulu-card\{/);
  assert.match(css,/\.lulu-avatar\{/);
  assert.match(app,/aria-label="Отметить прогулку"/);
  assert.match(app,/Прогулка · /);
  assert.match(css,/\.lulu-walk-button\{/);
});

test('Lulu walk notifies only the other partner and keeps journal backup',()=>{
  assert.match(api,/if \(action === 'lulu'\)/);
  assert.match(api,/type: 'lulu-walk'/);
  assert.match(api,/sendLuluWalkNotificationToPartner/);
  assert.match(api,/luluWalkNotificationText/);
  assert.match(api,/readLuluState\(options\)/);
  assert.match(backup,/luluState: newerVersionState/);
  assert.match(backup,/restoreLuluState/);
});
