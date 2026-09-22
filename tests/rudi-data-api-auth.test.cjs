const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const {
  DATA_API_AUDIENCE,
  DATA_API_ROLE,
  KEY_ID,
  publicJwks,
  signDataApiJwt,
} = require('../api/rudi-data-api-auth.cjs');

function decodeJson(segment) {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
}

test('RUDI Data API JWT is ES256 and verifies with public JWKS', () => {
  const botToken = '123456:unit-test-secret';
  const now = Date.UTC(2026, 8, 22, 17, 0, 0);
  const token = signDataApiJwt({ botToken, now });
  const parts = token.split('.');
  assert.equal(parts.length, 3);
  const header = decodeJson(parts[0]);
  const payload = decodeJson(parts[1]);

  assert.equal(header.alg, 'ES256');
  assert.equal(header.kid, KEY_ID);
  assert.equal(payload.role, DATA_API_ROLE);
  assert.equal(payload.aud, DATA_API_AUDIENCE);
  assert.equal(payload.sub, 'rudi-server');

  const jwks = publicJwks({ botToken });
  assert.equal(jwks.keys.length, 1);
  assert.equal(jwks.keys[0].kty, 'EC');
  assert.equal(jwks.keys[0].crv, 'P-256');
  assert.equal(jwks.keys[0].d, undefined);

  const publicKey = crypto.createPublicKey({ key: jwks.keys[0], format: 'jwk' });
  const verified = crypto.verify(
    'sha256',
    Buffer.from(parts[0] + '.' + parts[1]),
    { key: publicKey, dsaEncoding: 'ieee-p1363' },
    Buffer.from(parts[2], 'base64url')
  );
  assert.equal(verified, true);
});

test('RUDI public signing key is stable per server secret', () => {
  const first = publicJwks({ botToken:'1:first' }).keys[0];
  const second = publicJwks({ botToken:'1:first' }).keys[0];
  const other = publicJwks({ botToken:'2:other' }).keys[0];
  assert.deepEqual(first, second);
  assert.notEqual(first.x + first.y, other.x + other.y);
});
