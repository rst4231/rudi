const test = require('node:test');
const assert = require('node:assert/strict');

const { getDailyContentCache } = require('../api/stateful-cache.cjs');

test('daily content history accepts successful Runtime Cache writes without immediate read-after-write visibility', async () => {
  let setCalls = 0;
  let getCalls = 0;
  const cache = getDailyContentCache({
    env: {},
    attempts: 2,
    retryDelayMs: 0,
    runtimeCache: {
      async get() {
        getCalls += 1;
        return null;
      },
      async set() {
        setCalls += 1;
      },
      async delete() {},
    },
  });

  await cache.set('daily-content:72:history', [{ id: 'fresh' }], { ttl: 3600 });

  assert.equal(setCalls, 1);
  assert.equal(getCalls, 0);
});
