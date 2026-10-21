const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { snapshot, failure } = require('../api/gate-holdings.cjs');

test('Gate signs documented read-only wallet request and preserves account breakdown', async () => {
  const data = await snapshot({ apiKey: 'test-key', apiSecret: 'test-secret' }, {
    fetchImpl: async (url, init) => {
      assert.equal(url, 'https://api.gateio.ws/api/v4/wallet/total_balance?currency=USD');
      assert.equal(init.method, 'GET');
      assert.equal(init.headers['Content-Type'], 'application/json');
      assert.equal(init.headers.SIGN, crypto.createHmac('sha512', 'test-secret')
        .update(['GET', '/api/v4/wallet/total_balance', 'currency=USD',
          crypto.createHash('sha512').update('').digest('hex'), init.headers.Timestamp].join('\n'))
        .digest('hex'));
      return { ok: true, status: 200, json: async () => ({
        total: { currency: 'USD', amount: '250' },
        details: {
          spot: { currency: 'USD', amount: '200' },
          futures: { currency: 'USD', amount: '50' },
        },
      }) };
    },
  });
  assert.equal(data.balanceUsd, 250);
  assert.equal(data.sections.length, 2);
});

test('Gate rejects invalid currencies, missing totals and invalid amounts', async () => {
  for (const total of [{ currency: 'BTC', amount: '1' }, { currency: 'USD', amount: null },
    { currency: 'USD', amount: 'bad' }]) {
    await assert.rejects(() => snapshot({}, { fetchImpl: async () => ({
      ok: true, status: 200, json: async () => ({ total }),
    }) }), /crypto-gate-response-invalid/);
  }
});

test('Gate maps documented authentication, permission, time and request labels', async () => {
  const cases = [
    ['INVALID_SIGNATURE', 'crypto-gate-sign-invalid'],
    ['INVALID_KEY', 'crypto-gate-key-invalid'],
    ['INVALID_CREDENTIALS', 'crypto-gate-key-invalid'],
    ['IP_FORBIDDEN', 'crypto-gate-ip-mismatch'],
    ['FORBIDDEN', 'crypto-gate-permission-denied'],
    ['REQUEST_EXPIRED', 'crypto-gate-time-invalid'],
    ['ACCOUNT_LOCKED', 'crypto-gate-account-locked'],
    ['INVALID_PARAM_VALUE', 'crypto-gate-request-invalid'],
    ['NOT_FOUND', 'crypto-gate-endpoint-unavailable'],
    ['TOO_MANY_REQUESTS', 'crypto-gate-rate-limited'],
  ];
  const warn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);
  try {
    for (const [label, expected] of cases) {
      await assert.rejects(() => snapshot({ apiKey: 'do-not-log-key', apiSecret: 'do-not-log-secret' }, {
        fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({ label, message: 'do-not-log-secret' }) }),
      }), { message: expected });
    }
  } finally { console.warn = warn; }
  assert.equal(warnings.length, cases.length);
  assert.ok(!JSON.stringify(warnings).includes('do-not-log'));
});

test('Gate reports unknown HTTP 400 separately, does not mistake it for invalid keys', async () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    await assert.rejects(() => snapshot({}, {
      fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({ message: 'unknown' }) }),
    }), { message: 'crypto-gate-api-rejected-400' });
    await assert.rejects(() => snapshot({}, {
      fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({}) }),
    }), { message: 'crypto-gate-rate-limited' });
    await assert.rejects(() => snapshot({}, {
      fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }),
    }), { message: 'crypto-gate-network-unavailable' });
  } finally { console.warn = warn; }
  assert.equal(failure(400, 'UNEXPECTED'), 'crypto-gate-api-rejected-400');
});
