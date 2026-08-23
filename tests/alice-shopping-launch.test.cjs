const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  isAliceShoppingLaunch,
  buildAliceShoppingLaunchResponse,
} = require('../api/alice-shopping-response.cjs');

test('new Alice session with blank command is treated as launch', () => {
  const req = { body: { session: { new: true }, request: { command: '', original_utterance: '' }, version: '1.0' } };
  assert.equal(isAliceShoppingLaunch(req), true);
});

test('new Alice session with a spoken product reaches the products chat flow', () => {
  const req = { body: { session: { new: true }, request: { command: 'молоко', original_utterance: 'молоко' }, version: '1.0' } };
  assert.equal(isAliceShoppingLaunch(req), false);
});

test('launch response asks for products and keeps Alice session open', () => {
  assert.deepEqual(buildAliceShoppingLaunchResponse({ body: { version: '1.0' } }), {
    response: {
      text: 'Какие продукты вы хотите добавить?',
      tts: 'Какие продукты вы хотите добавить?',
      end_session: false,
    },
    version: '1.0',
  });
});

test('Alice route short-circuits blank launch before sending a Telegram product message', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');
  const launchIndex = source.indexOf('if (isAliceShoppingLaunch(req))');
  const sendIndex = source.indexOf('sendAliceProductMessage(req', launchIndex);
  assert.ok(launchIndex > -1);
  assert.ok(sendIndex > launchIndex);
});
