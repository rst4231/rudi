const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backup = require('../api/rudi-backup.cjs');

test('encrypted RUDI backup v2 round-trips safe shared state only', () => {
  const snapshot = {
    version: 2,
    createdAt: '2026-09-20T00:00:00.000Z',
    partnerMessage: { text: 'секретное послание', authorName: 'Рустам', updatedAt: '2026-09-20T00:00:00.000Z' },
    wishlist: { initialized: true, version: 1, items: [{ id: '1', text: 'Тест', owner: 'Рустам' }] },
    products: { initialized: true, version: 1, items: [{ id: 'p', text: 'Молоко' }], history: [] },
    ticktickChecklistAudit: { initialized: true, version: 1, entries: {} },
  };
  const options = { botToken: '123456:TEST_SECRET' };
  const token = backup.sealSnapshot(snapshot, options);
  assert.match(token, /^rudi-state-v2\./);
  assert.equal(token.includes('секретное послание'), false);
  assert.deepEqual(backup.openSnapshot(token, options), snapshot);
});

test('encrypted RUDI backup rejects a different bot secret', () => {
  const token = backup.sealSnapshot({ version: 2, createdAt: 'x' }, { botToken: '1:ONE' });
  assert.throws(() => backup.openSnapshot(token, { botToken: '2:TWO' }), /rudi-backup-invalid/);
});

test('client backup implementation contains no integration credentials or recipient ids', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'api', 'rudi-backup.cjs'), 'utf8');
  assert.doesNotMatch(source, /readToken|saveToken|ticktickToken/);
  assert.doesNotMatch(source, /readCalendarUrl|saveCalendarUrl|calendarUrl/);
  assert.doesNotMatch(source, /readAlbumConfig|saveAlbumConfig|albumConfig/);
  assert.doesNotMatch(source, /readRecipients|saveRecipient|recipients/);
});

test('app auth keeps safe backup restore and recipient self-registration', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'api', 'partner-message.js'), 'utf8');
  assert.match(source, /restoreStateBackup\(body\.backupToken/);
  assert.match(source, /saveRecipient\(actor, user\?\.id/);
  assert.match(source, /action === 'state-backup'/);
  assert.match(source, /backupToken/);
});

test('client mirrors backup v2 into Telegram CloudStorage and cleans v1', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.match(source, /STATE_BACKUP_STORAGE_KEY = 'rudi-state-backup-v2'/);
  assert.match(source, /LEGACY_STATE_BACKUP_STORAGE_KEY = 'rudi-state-backup-v1'/);
  assert.match(source, /clearLegacyStateBackup/);
  assert.match(source, /tg\?\.CloudStorage/);
  assert.match(source, /readCloudStateBackupToken/);
  assert.match(source, /writeCloudStateBackupToken/);
  assert.match(source, /const backupToken=await withTimeout\(readStateBackupToken\(\),1200,''\)/);
});

test('client refreshes safe backup after shared-state changes', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.match(source, /rudiAction=state-backup/);
  assert.match(source, /if\(operation!=='list'\) setTimeout\(\(\)=>refreshStateBackup\(\),250\)/);
});
