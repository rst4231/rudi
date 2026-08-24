const test = require('node:test');
const assert = require('node:assert/strict');

test('authorized one-time production cinema replacement', async () => {
  const response = await fetch('https://spb-daily-guide-bot.vercel.app/api/cinema-replace-20260820', {
    method: 'POST',
  });
  const text = await response.text();
  console.log('RUDI_CINEMA_REPLACE_PRODUCTION_RESULT', text);
  assert.equal(response.status, 200);
  const result = JSON.parse(text);
  assert.equal(result.ok, true);
  assert.ok(result.publishedPosts === 1 || result.skipped === 'already-replaced');
});
