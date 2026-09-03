const test = require('node:test');
const assert = require('node:assert/strict');

const { handleAdminAction } = require('../api/admin-api.cjs');
const { resultStatus } = require('../api/admin.js');

test('successful native publish-section result is normalized to ok and HTTP 200', async () => {
  const result = await handleAdminAction('publish-section', {
    section: 'cinema',
    date: '2026-09-03',
    force: true,
  }, {
    publishSection: async () => ({
      section: 'cinema',
      date: '2026-09-03',
      published: 7,
      posts: 1,
      messageId: 900,
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.published, 7);
  assert.equal(resultStatus(result), 200);
});
