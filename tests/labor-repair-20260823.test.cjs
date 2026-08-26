const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repairPath = path.join(__dirname, '..', 'api', 'repair-labor-20260823.js');

test('legacy Aug 23 labor repair remains date-limited and protected', () => {
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

test('Aug 26 correction recovers the real Labor topic from the Aug 23 repair result and removes wrong Clients post 721', () => {
  const source = fs.readFileSync(repairPath, 'utf8');
  assert.match(source, /CORRECTION_DATE = '2026-08-26'/);
  assert.match(source, /WRONG_CLIENTS_TOPIC_ID = 126/);
  assert.match(source, /WRONG_MESSAGE_ID = 721/);
  assert.match(source, /labor-repair-20260823-complete/);
  assert.match(source, /replacement\?\.topicId/);
  assert.match(source, /labor-correction-20260826-complete/);
  assert.match(source, /CORRECTION_KEY_HASH = '[a-f0-9]{64}'/);
  assert.match(source, /replaceLaborArticle/);
});

test('Aug 26 correction refuses to use topic 126 as the Labor destination', () => {
  const source = fs.readFileSync(repairPath, 'utf8');
  assert.match(source, /topicId !== WRONG_CLIENTS_TOPIC_ID/);
  assert.match(source, /labor-topic-id-unavailable/);
});
