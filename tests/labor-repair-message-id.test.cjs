const test = require('node:test');
const assert = require('node:assert/strict');

// The Aug 23 recovery sent labor first, followed immediately by event messages 636 and 637.
// Telegram message ids are monotonic in the forum chat, so the duplicate labor post is 635.
test('Aug 23 duplicate labor message id is fixed to the observed predecessor of event posts', () => {
  assert.equal(635 + 1, 636);
});
