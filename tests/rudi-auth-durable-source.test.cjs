const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const api = fs.readFileSync('api/partner-message.js','utf8');
const store = fs.readFileSync('api/rudi-auth-db.cjs','utf8');
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

test('durable auth hydration can restore local cache and encrypted backup into D1', () => {
  assert.match(api,/async function hydrateActorAuth[\s\S]*?readPinRecord\(actor, storeOptions\)[\s\S]*?saveDurablePinRecord\(actor, cachedPin, dbOptions\)/);
  assert.match(api,/async function hydrateActorAuth[\s\S]*?backupPin[\s\S]*?saveDurablePinRecord\(actor, backupPin, dbOptions\)/);
});

test('Telegram PIN creation writes the same hash into durable D1 before reporting success', () => {
  const start=api.indexOf("operation === 'create-pin'");
  const end=api.indexOf("operation === 'status'",start);
  assert.ok(start>=0&&end>start);
  const block=api.slice(start,end);
  const hashWrite=block.indexOf("savePin(telegram.actor");
  const durableWrite=block.indexOf("saveDurablePinRecord(telegram.actor");
  const response=block.indexOf("return res.status(200)");
  assert.ok(hashWrite>=0&&durableWrite>hashWrite&&response>durableWrite);
});

test('Face ID passkeys use the same durable D1 auth record', () => {
  assert.match(api,/saveDurablePasskeys\(verified\.actor, rows, durableAuthOptions\(options\)\)/);
  assert.match(api,/saveDurablePasskeys\(session\.actor, rows, durableAuthOptions\(options\)\)/);
  assert.match(api,/hydrateAllDurablePasskeys/);
});

test('runtime auth and durable storage are D1-only with no Neon or Blob integration left', () => {
  const readRuntime=store.slice(store.indexOf('async function readRawRecord'),store.indexOf('async function readAuthRecord'));
  const writeRuntime=store.slice(store.indexOf('async function writeRawRecord'),store.indexOf('async function writeAuthRecord'));
  assert.match(readRuntime,/authStateClient\(options\)\.getRecord\(AUTH_NAMESPACE, safeActor\)/);
  assert.match(writeRuntime,/authStateClient\(options\)\.setRecord/);
  assert.match(store,/AUTH_NAMESPACE = 'rudi-browser-auth-v1'/);
  assert.doesNotMatch(store,/blob|neon\.tech|readLegacyRawRecord|listLegacyRawRecords|signDataApiJwt/i);
  assert.doesNotMatch(index,/neon-to-d1-migration|neon-to-blob-migration|rudi-jwks|@vercel\/blob/i);
  assert.equal(vercel.git.deploymentEnabled,false);
});
