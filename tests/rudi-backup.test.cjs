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
