const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const recoveryPath = path.join(__dirname, '..', 'api', 'recover-20260823.js');

test('recovery endpoint is date-limited, key-protected and one-time', () => {
  assert.equal(fs.existsSync(recoveryPath), true, 'api/recover-20260823.js must exist');
  const source = fs.readFileSync(recoveryPath, 'utf8');
  assert.match(source, /RECOVERY_DATE = '2026-08-23'/);
  assert.match(source, /EXPECTED_KEY_HASH = '[a-f0-9]{64}'/);
  assert.match(source, /getRecoveryCache/);
  assert.match(source, /recovery-20260823-complete/);
  assert.match(source, /status\(410\)/);
  assert.match(source, /status\(401\)/);
});

test('recovery sends labor and only the events section', () => {
  const source = fs.readFileSync(recoveryPath, 'utf8');
  assert.match(source, /publishDailyLaborArticle\(\)/);
  assert.match(source, /route: 'daily'/);
  assert.match(source, /only: 'events'/);
  assert.match(source, /'x-vercel-cron-schedule': '30 21 \* \* \*'/);
  assert.doesNotMatch(source, /only: 'morning'/);
});
