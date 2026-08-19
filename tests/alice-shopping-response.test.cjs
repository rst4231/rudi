const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function loadSanitizer() {
  try {
    return require(path.join(__dirname, '..', 'api', 'alice-shopping-response.cjs')).sanitizeAliceShoppingPayload;
  } catch {
    return undefined;
  }
}

test('replaces the unclear Alice shopping prompt with the requested question', () => {
  const sanitizeAliceShoppingPayload = loadSanitizer();
  assert.equal(typeof sanitizeAliceShoppingPayload, 'function');
  const input = {
    response: {
      text: 'Не понял, что добавить',
      tts: 'Не понял, что добавить.',
      buttons: [{ title: 'Оставить как есть' }],
    },
    version: '1.0',
  };

  assert.deepEqual(sanitizeAliceShoppingPayload(input), {
    response: {
      text: 'Какие продукты вы хотите добавить?',
      tts: 'Какие продукты вы хотите добавить?',
      buttons: [{ title: 'Оставить как есть' }],
    },
    version: '1.0',
  });
});
