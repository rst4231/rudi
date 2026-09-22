const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backup = require('../api/rudi-backup.cjs');

test('encrypted RUDI backup v2 round-trips shared state and integrations', () => {
  const snapshot = {
    version: 2,
    createdAt: '2026-09-21T00:00:00.000Z',
    partnerMessage: { text: 'секретное послание', authorName: 'Рустам', updatedAt: '2026-09-21T00:00:00.000Z' },
    wishlist: { initialized: true, version: 1, items: [{ id: '1', text: 'Тест', owner: 'Рустам' }] },
    products: { initialized: true, version: 1, items: [{ id: 'p', text: 'Молоко' }], history: [] },
    ticktickChecklistAudit: { initialized: true, version: 1, entries: {} },
    ticktickToken: { accessToken: 'secret-access', refreshToken: 'secret-refresh', savedAt: '2026-09-21T00:00:00.000Z' },
    calendarUrl: 'webcal://example.invalid/private',
    albumConfig: { url: 'https://www.icloud.com/sharedalbum/#PRIVATE', token: 'PRIVATE' },
    cycle: { enabled: true, historyStarts: ['2031-01-01'], nextPeriodStart: '2031-01-31', updatedAt: '2031-01-01T00:00:00Z' },
    recipients: { 'Рустам': 101, 'Диана': 202 },
  };
  const options = { botToken: '123456:TEST_SECRET' };
  const token = backup.sealSnapshot(snapshot, options);
  assert.match(token, /^rudi-state-v2\./);
  for(const secret of ['секретное послание','secret-access','example.invalid','PRIVATE']){
    assert.equal(token.includes(secret), false);
  }
  assert.deepEqual(backup.openSnapshot(token, options), snapshot);
});

test('encrypted RUDI backup rejects a different bot secret', () => {
  const token = backup.sealSnapshot({ version: 2, createdAt: 'x' }, { botToken: '1:ONE' });
  assert.throws(() => backup.openSnapshot(token, { botToken: '2:TWO' }), /rudi-backup-invalid/);
});

test('server backup includes persistent integration recovery paths', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'api', 'rudi-backup.cjs'), 'utf8');
  for(const name of ['readToken','saveToken','readCalendarUrl','saveCalendarUrl','readAlbumConfig','saveAlbumConfig','readCycleState','writeCycleState','readRecipients','saveRecipients']){
    assert.match(source,new RegExp(name));
  }
});

test('client stores only encrypted backup token in Telegram CloudStorage', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.match(source, /STATE_BACKUP_STORAGE_KEY = 'rudi-state-backup-v2'/);
  assert.match(source, /tg\?\.CloudStorage/);
  assert.match(source, /readCloudStateBackupToken/);
  assert.match(source, /writeCloudStateBackupToken/);
  assert.doesNotMatch(source, /secret-access|webcal:\/\/example\.invalid/);
});

test('app auth restores backup before recipient self-registration', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'api', 'partner-message.js'), 'utf8');
  const restore = source.indexOf('restoreStateBackup(body.backupToken');
  const register = source.indexOf('saveRecipient(actor, user?.id');
  assert.ok(restore >= 0 && register > restore);
});


test('cache miss does not create a newer initialized empty product list', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'api', 'product-list-store.cjs'), 'utf8');
  assert.match(source, /if \(!items\.length\) return current;[\s\S]*return writeState\(\{ \.\.\.current, items \}, options\)/);
});

test('client completes backup recovery before stateful loaders start', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.match(source, /document\.body\.classList\.add\('auth-ok'\);\s*await loadAppBootstrap\(\);\s*return true;/);
  assert.doesNotMatch(source, /setTimeout\(\(\)=>loadAppBootstrap\(\),0\)/);
});

test('previous backup slot can be previewed safely and New in RUDI stays home-only', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const api = fs.readFileSync(path.join(__dirname, '..', 'api', 'partner-message.js'), 'utf8');
  assert.match(app, /async function readPreviousCloudStateBackupToken\(\)/);
  assert.match(app, /rudiAction=state-backup-recovery/);
  assert.match(app, /tile\.hidden=currentAppTab!==['"]home['"]\|\|!entries\.length/);
  assert.match(api, /if \(action === 'state-backup-recovery'\)/);
  assert.match(api, /product-list-not-empty/);
  assert.match(api, /RUDI_PRODUCTS_BACKUP_RECOVERED/);
});
