const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repairPath = path.join(__dirname, '..', 'api', 'repair-labor-20260823.js');

test('one-time labor repair is date-limited, protected and deletes the known duplicate before replacement', () => {
  assert.equal(fs.existsSync(repairPath), true, 'repair endpoint must exist');
  const source = fs.readFileSync(repairPath, 'utf8');
  assert.match(source, /REPAIR_DATE = '2026-08-23'/);
  assert.match(source, /DUPLICATE_MESSAGE_ID = 635/);
  assert.match(source, /EXPECTED_KEY_HASH = '[a-f0-9]{64}'/);
  assert.match(source, /deleteMessage/);
  assert.match(source, /replaceLaborArticle/);
  assert.match(source, /contract:worker/);
  assert.match(source, /status\(410\)/);
  assert.match(source, /status\(401\)/);
});
