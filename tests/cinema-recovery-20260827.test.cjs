// Runtime regression coverage for Aug 27 cinema recovery.
const test = require('node:test');
const assert = require('node:assert/strict');

const recovery = require('../api/recover-20260823.js');

test('Aug 27 cinema recovery clears the false done marker and republishes once for the target date', async () => {
  const calls = [];
  const cinemaCache = {
    async delete(key) { calls.push(['delete', key]); return true; },
  };
  const publish = async (options) => {
    calls.push(['publish', options.now.toISOString()]);
    return { date: '2026-08-27', published: 5, posts: 1, complete: true };
  };

  assert.equal(typeof recovery.runCinemaRecovery, 'function');
  const result = await recovery.runCinemaRecovery('2026-08-27', { cinemaCache, publish });

  assert.deepEqual(calls[0], ['delete', 'done:2026-08-27']);
  assert.equal(calls[1][0], 'publish');
  assert.equal(result.published, 5);
});

test('incomplete cinema recovery is not treated as completed so it can be retried', () => {
  assert.equal(typeof recovery.cinemaRecoveryIsComplete, 'function');
  assert.equal(recovery.cinemaRecoveryIsComplete({ complete: false, published: 0 }), false);
  assert.equal(recovery.cinemaRecoveryIsComplete({ complete: true, published: 0 }), true);
  assert.equal(recovery.cinemaRecoveryIsComplete({ complete: true, published: 8 }), true);
});
