const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const recoveryPath = path.join(__dirname, '..', 'api', 'recover-20260823.js');
const obsoleteRecoveryPath = path.join(__dirname, '..', 'api', 'recover-events-20260826.js');

test('Aug 26 events recovery reuses the existing protected recovery function', () => {
  assert.equal(fs.existsSync(recoveryPath), true, 'existing recovery function must remain available');
  assert.equal(fs.existsSync(obsoleteRecoveryPath), false, 'must not add a 13th serverless function');
  const source = fs.readFileSync(recoveryPath, 'utf8');
  assert.match(source, /EVENTS_RECOVERY_DATE = '2026-08-26'/);
  assert.match(source, /EVENTS_EXPECTED_KEY_HASH = '[a-f0-9]{64}'/);
  assert.match(source, /events-recovery-20260826-complete/);
  assert.match(source, /status\(410\)/);
  assert.match(source, /status\(401\)/);
});

test('Aug 26 path republishes only events through the authenticated daily runtime', () => {
  const source = fs.readFileSync(recoveryPath, 'utf8');
  assert.match(source, /runEventsRecovery\(EVENTS_RECOVERY_DATE\)/);
  assert.match(source, /only: 'events'/);
  assert.match(source, /authorization: `Bearer \$\{process\.env\.CRON_SECRET\}`/);
  assert.match(source, /'x-vercel-cron-schedule': '30 21 \* \* \*'/);
  assert.match(source, /EVENTS_RECOVERY_KEY/);
});

test('Vercel stays within the Hobby serverless function limit', () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
  assert.equal(config.functions?.['api/recover-events-20260826.js'], undefined);
  const apiFiles = fs.readdirSync(path.join(__dirname, '..', 'api')).filter((name) => name.endsWith('.js'));
  assert.ok(apiFiles.length <= 12, `expected at most 12 serverless JS entrypoints, got ${apiFiles.length}`);
});
