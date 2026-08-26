const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const recoveryPath = path.join(__dirname, '..', 'api', 'recover-events-20260826.js');

test('Aug 26 events recovery is date-limited and one-time', () => {
  assert.equal(fs.existsSync(recoveryPath), true, 'api/recover-events-20260826.js must exist');
  const source = fs.readFileSync(recoveryPath, 'utf8');
  assert.match(source, /RECOVERY_DATE = '2026-08-26'/);
  assert.match(source, /events-recovery-20260826-complete/);
  assert.match(source, /getRecoveryCache/);
  assert.match(source, /status\(410\)/);
});

test('Aug 26 events recovery republishes only events through the authenticated daily runtime', () => {
  const source = fs.readFileSync(recoveryPath, 'utf8');
  assert.match(source, /route: 'daily'/);
  assert.match(source, /only: 'events'/);
  assert.match(source, /date: RECOVERY_DATE/);
  assert.match(source, /authorization: `Bearer \$\{process\.env\.CRON_SECRET\}`/);
  assert.match(source, /'x-vercel-cron-schedule': '30 21 \* \* \*'/);
  assert.doesNotMatch(source, /publishDailyLaborArticle/);
  assert.doesNotMatch(source, /only: 'morning'/);
});
