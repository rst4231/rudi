const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const app=fs.readFileSync('public/app.js','utf8');
const api=fs.readFileSync('api/partner-message.js','utf8');
const backup=fs.readFileSync('api/rudi-backup.cjs','utf8');
const recipients=fs.readFileSync('api/partner-notification-store.cjs','utf8');
const calendar=fs.readFileSync('api/work-calendar.cjs','utf8');
const album=fs.readFileSync('api/shared-album.cjs','utf8');
const html=fs.readFileSync('public/index.html','utf8');

test('stateful client requests carry encrypted backup fallback',()=>{
  assert.match(app,/currentStateBackupToken/);
  assert.match(app,/\/api\/cycle[\s\S]*?backupToken:currentStateBackupToken/);
  assert.match(app,/\/api\/ticktick\/today[\s\S]*?backupToken:currentStateBackupToken/);
  assert.match(app,/\/api\/work-calendar[\s\S]*?backupToken:currentStateBackupToken/);
  assert.match(app,/\/api\/shared-album[\s\S]*?backupToken:currentStateBackupToken/);
  assert.match(app,/rudiAction=products[\s\S]*?backupToken:currentStateBackupToken/);
  assert.match(app,/\/api\/wishlist[\s\S]*?backupToken:currentStateBackupToken/);
});

test('server uses encrypted backup directly when runtime cache is missing',()=>{
  assert.match(api,/function backupSnapshotFromToken/);
  assert.match(api,/function readTickTickTokenWithBackup/);
  assert.match(api,/normalizeCycleState\(backupSnapshot\?\.cycle\)/);
  assert.match(api,/albumConfig: backupSnapshot\?\.albumConfig \|\| null/);
  assert.match(api,/calendarUrl: backupSnapshot\?\.calendarUrl \|\| ''/);
});

test('profile recipient ids stay private and are corrected by signed session identity',()=>{
  assert.match(recipients,/const \{ isAllowedUserId \} = require\('\.\/rudi-access\.cjs'\)/);
  assert.match(recipients,/function normalizeRecipients/);
  assert.match(api,/function correctRecipientsForSession/);
  assert.doesNotMatch(recipients,/901637773|941263519/);
});

test('new backup never discards newer previous state on cache misses',()=>{
  assert.match(backup,/function newerVersionState/);
  assert.match(backup,/function newerTimestampState/);
  assert.match(backup,/options\.previousSnapshot/);
  assert.match(backup,/ticktickToken: newerTimestampState/);
  assert.match(backup,/cycle: newerTimestampState/);
});

test('calendar and album remain usable when cache writes fail',()=>{
  assert.match(calendar,/options\.calendarUrl \? normalizeCalendarUrl/);
  assert.match(calendar,/cache\.set\(cacheKey,[\s\S]*?\.catch\(\(\) => false\)/);
  assert.match(album,/options\.albumConfig\?\.url/);
  assert.match(album,/cache\.set\(CACHE_KEY,[\s\S]*?\.catch\(\(\) => false\)/);
});

test('TickTick OAuth is stateless and immediately handed into encrypted backup',()=>{
  assert.match(api,/function createTickTickOAuthState/);
  assert.match(api,/function verifyTickTickOAuthState/);
  assert.match(api,/ticktickHandoff=/);
  assert.match(api,/sealSnapshot\(\{/);
  assert.match(app,/ticktickHandoffToken/);
  assert.match(app,/ticktickHandoff:ticktickHandoffToken/);
});

test('Diana cycle record returns a refreshed backup even if cache persistence fails',()=>{
  assert.match(api,/cycleStateWithStart/);
  assert.match(api,/await writeCycleState\(cycle, options\)\.catch\(\(\) => false\)/);
  assert.match(api,/configured: true, cycle, backupToken/);
  assert.match(app,/if\(data\.backupToken\) await storeStateBackupToken\(data\.backupToken\)/);
});

test('footer exposes current release version',()=>{
  const version=JSON.parse(fs.readFileSync('rudi-version.json','utf8')).current.replace(/\./g,'\\.');
  assert.match(html,new RegExp('id="appVersion"[^>]*>'+version+'<\\/div>'));
});
