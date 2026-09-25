const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  normalizeStoredMessage,
} = require('../api/partner-message-store.cjs');

test('legacy partner messages get a stable reaction id independent of updatedAt', () => {
  const a = normalizeStoredMessage({
    text: 'Одно и то же послание',
    authorName: 'Рустам',
    updatedAt: '2026-09-25T06:00:00.000Z',
  });
  const b = normalizeStoredMessage({
    text: 'Одно и то же послание',
    authorName: 'Рустам',
    updatedAt: '2026-09-25T06:30:00.000Z',
  });
  assert.ok(a.id.startsWith('legacy-'));
  assert.equal(a.id, b.id);
});

test('explicit partner message id survives normalization and backup restore shape', () => {
  const message = normalizeStoredMessage({
    id: 'msg-123e4567-e89b-12d3-a456-426614174000',
    text: 'Тест',
    authorName: 'Диана',
    updatedAt: '2026-09-25T06:00:00.000Z',
  });
  assert.equal(message.id, 'msg-123e4567-e89b-12d3-a456-426614174000');
});

test('partner message reaction uses the same stable target mechanism as feed reactions', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const api = fs.readFileSync(path.join(__dirname, '..', 'api', 'partner-message.js'), 'utf8');
  assert.match(app, /currentPartnerReactionKey='message:'\+String\(message\.id\|\|''\)\.trim\(\)/);
  assert.doesNotMatch(app, /currentPartnerReactionKey='message:'\+String\(message\.updatedAt/);
  assert.match(api, /stableTarget=\{type:'partner-message',key:'message:'\+String\(message\.id\)\}/);
  assert.match(api, /legacyTarget=\{type:'partner-message',key:'message:'\+String\(message\.updatedAt\)\}/);
});
