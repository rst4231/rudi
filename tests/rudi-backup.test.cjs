const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backup = require('../api/rudi-backup.cjs');

test('encrypted RUDI backup round-trips without exposing plaintext', () => {
  const snapshot = {
    version: 1,
    createdAt: '2026-09-20T00:00:00.000Z',
    partnerMessage: { text: 'секретное послание', authorName: 'Рустам', updatedAt: '2026-09-20T00:00:00.000Z' },
    ticktickToken: { accessToken: 'ticktick-secret' },
    calendarUrl: 'webcal://calendar-secret',
    wishlist: { initialized: true, version: 1, items: [{ id: '1', text: 'Тест', owner: 'Рустам' }] },
    products: { initialized: true, version: 1, items: [{ id: 'p', text: 'Молоко' }], history: [] },
    recipients: { 'Рустам': 1, 'Диана': 2 },
    albumConfig: { url: 'https://www.icloud.com/sharedalbum/#secret', token: 'secret' },
  };
  const options = { botToken: '123456:TEST_SECRET' };
  const token = backup.sealSnapshot(snapshot, options);
  assert.match(token, /^rudi-state-v1\./);
  assert.equal(token.includes('секретное послание'), false);
  assert.equal(token.includes('ticktick-secret'), false);
  assert.deepEqual(backup.openSnapshot(token, options), snapshot);
});

test('encrypted RUDI backup rejects a different bot secret', () => {
  const token = backup.sealSnapshot({ version: 1, createdAt: 'x' }, { botToken: '1:ONE' });
  assert.throws(() => backup.openSnapshot(token, { botToken: '2:TWO' }), /rudi-backup-invalid/);
});

test('app auth wires encrypted backup restore and recipient self-registration', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'api', 'partner-message.js'), 'utf8');
  assert.match(source, /restoreStateBackup\(body\.backupToken/);
  assert.match(source, /saveRecipient\(actor, user\?\.id/);
  assert.match(source, /action === 'state-backup'/);
  assert.match(source, /backupToken/);
});

test('client keeps an encrypted state token and refreshes it after shared-state changes', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.match(source, /STATE_BACKUP_STORAGE_KEY = 'rudi-state-backup-v1'/);
  assert.match(source, /backupToken:readStateBackupToken\(\)/);
  assert.match(source, /rudiAction=state-backup/);
  assert.match(source, /if\(operation!=='list'\) setTimeout\(\(\)=>refreshStateBackup\(\),250\)/);
});
