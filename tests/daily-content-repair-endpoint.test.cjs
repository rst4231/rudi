const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const endpointPath = path.join(__dirname, '..', 'api', 'repair-daily-content-20260824.js');
const VALID_KEY = 'cEc4oxDMSKokHr5LqilCOfWncAbuia8K';

function captureResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return payload; },
  };
}

test('repair endpoint is date-limited, secret-protected and runs repair only when authorized', async () => {
  assert.equal(fs.existsSync(endpointPath), true, 'repair endpoint must exist');
  const { createRepairHandler, securelyMatchesRepairKey } = require(endpointPath);
  assert.equal(securelyMatchesRepairKey(VALID_KEY), true);
  assert.equal(securelyMatchesRepairKey('wrong-key'), false);

  let runs = 0;
  const runRepair = async () => { runs += 1; return { completed: true }; };

  const expired = createRepairHandler({
    now: () => new Date('2026-08-25T07:00:00+03:00'),
    runRepair,
    token: '1:testtoken',
  });
  const expiredRes = captureResponse();
  await expired({ query: { key: VALID_KEY } }, expiredRes);
  assert.equal(expiredRes.statusCode, 410);
  assert.equal(runs, 0);

  const handler = createRepairHandler({
    now: () => new Date('2026-08-24T07:00:00+03:00'),
    runRepair,
    token: '1:testtoken',
  });
  const unauthorizedRes = captureResponse();
  await handler({ query: { key: 'wrong-key' } }, unauthorizedRes);
  assert.equal(unauthorizedRes.statusCode, 401);
  assert.equal(runs, 0);

  const authorizedRes = captureResponse();
  await handler({ query: { key: VALID_KEY } }, authorizedRes);
  assert.equal(authorizedRes.statusCode, 200);
  assert.equal(authorizedRes.payload.ok, true);
  assert.equal(runs, 1);
});
