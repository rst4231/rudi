const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const api = fs.readFileSync('api/partner-message.js','utf8');
const store = fs.readFileSync('api/rudi-auth-db.cjs','utf8');
const jwks = fs.readFileSync('api/rudi-jwks.cjs','utf8');
const index = fs.readFileSync('api/index.js','utf8');
const vercel = JSON.parse(fs.readFileSync('vercel.json','utf8'));

test('Safari PIN login hydrates the durable record before verification', () => {
  const start=api.indexOf("if (action === 'browser-auth')");
  const end=api.indexOf("if (action === 'app-auth')",start);
  assert.ok(start>=0&&end>start);
  const block=api.slice(start,end);
  assert.match(block,/operation === 'login'[\s\S]*?hydrateActorAuth\(actor, body\.backupToken, options\)/);
  assert.match(block,/if \(!hydrated\.durable\?\.pinRecord\) throw new Error\('rudi-pin-not-configured'\)/);
  assert.match(block,/pinRecord: hydrated\.durable\.pinRecord/);
});

test('durable auth hydration migrates cache first and encrypted backup second', () => {
  assert.match(api,/async function hydrateActorAuth[\s\S]*?readPinRecord\(actor, storeOptions\)[\s\S]*?saveDurablePinRecord\(actor, cachedPin, dbOptions\)/);
  assert.match(api,/async function hydrateActorAuth[\s\S]*?backupPin[\s\S]*?saveDurablePinRecord\(actor, backupPin, dbOptions\)/);
});

test('Telegram PIN creation writes the same hash into durable Postgres before reporting success', () => {
  const start=api.indexOf("operation === 'create-pin'");
  const end=api.indexOf("operation === 'status'",start);
  assert.ok(start>=0&&end>start);
  const block=api.slice(start,end);
  const hashWrite=block.indexOf("savePin(telegram.actor");
  const durableWrite=block.indexOf("saveDurablePinRecord(telegram.actor");
  const response=block.indexOf("return res.status(200)");
  assert.ok(hashWrite>=0&&durableWrite>hashWrite&&response>durableWrite);
});

test('Telegram status migrates an existing encrypted backup PIN into durable server auth', () => {
  assert.match(api,/async function hydrateActorAuth[\s\S]*?backupPin[\s\S]*?saveDurablePinRecord\(actor, backupPin, dbOptions\)/);
  assert.match(api,/operation === 'status'[\s\S]*?hydrateActorAuth\(session\.actor, body\.backupToken, options\)[\s\S]*?Boolean\(hydrated\.durable\?\.pinRecord\)/);
});

test('Face ID passkeys use the same durable server auth record', () => {
  assert.match(api,/saveDurablePasskeys\(verified\.actor, rows, durableAuthOptions\(options\)\)/);
  assert.match(api,/saveDurablePasskeys\(session\.actor, rows, durableAuthOptions\(options\)\)/);
  assert.match(api,/hydrateAllDurablePasskeys/);
});

test('durable auth store is server-only and uses signed Neon Data API requests', () => {
  assert.match(store,/signDataApiJwt/);
  assert.match(store,/authorization: 'Bearer ' \+ token/);
  assert.match(store,/rudi_browser_auth/);
  assert.doesNotMatch(store,/123456|password\s*:/i);
  assert.match(jwks,/publicJwks/);
  assert.match(index,/route === 'rudi-jwks'/);
  assert.ok(vercel.rewrites.some((row)=>row.source==='/api/rudi-jwks'&&row.destination==='/api/index?route=rudi-jwks'));
});
