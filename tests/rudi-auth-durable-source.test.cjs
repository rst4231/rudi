const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const api = fs.readFileSync('api/partner-message.js','utf8');
const store = fs.readFileSync('api/rudi-auth-db.cjs','utf8');
const blob = fs.readFileSync('api/blob-json-store.cjs','utf8');
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

test('durable auth hydration can restore local cache and encrypted backup into Blob', () => {
  assert.match(api,/async function hydrateActorAuth[\s\S]*?readPinRecord\(actor, storeOptions\)[\s\S]*?saveDurablePinRecord\(actor, cachedPin, dbOptions\)/);
  assert.match(api,/async function hydrateActorAuth[\s\S]*?backupPin[\s\S]*?saveDurablePinRecord\(actor, backupPin, dbOptions\)/);
});

test('Telegram PIN creation writes the same hash into durable Blob before reporting success', () => {
  const start=api.indexOf("operation === 'create-pin'");
  const end=api.indexOf("operation === 'status'",start);
  assert.ok(start>=0&&end>start);
  const block=api.slice(start,end);
  const hashWrite=block.indexOf("savePin(telegram.actor");
  const durableWrite=block.indexOf("saveDurablePinRecord(telegram.actor");
  const response=block.indexOf("return res.status(200)");
  assert.ok(hashWrite>=0&&durableWrite>hashWrite&&response>durableWrite);
});

test('Face ID passkeys use the same durable Blob auth record', () => {
  assert.match(api,/saveDurablePasskeys\(verified\.actor, rows, durableAuthOptions\(options\)\)/);
  assert.match(api,/saveDurablePasskeys\(session\.actor, rows, durableAuthOptions\(options\)\)/);
  assert.match(api,/hydrateAllDurablePasskeys/);
});

test('runtime auth and durable storage are Blob-only with no Neon integration left', () => {
  const readRuntime=store.slice(store.indexOf('async function readRawRecord'),store.indexOf('async function readAuthRecord'));
  const writeRuntime=store.slice(store.indexOf('async function writeRawBlobRecord'),store.indexOf('async function writeAuthRecord'));
  assert.match(readRuntime,/authBlobStore\(options\)\.read/);
  assert.match(writeRuntime,/authBlobStore\(options\)\.write/);
  assert.doesNotMatch(store,/neon\.tech|readLegacyRawRecord|listLegacyRawRecords|signDataApiJwt/i);
  assert.doesNotMatch(blob,/ensureMigrationReady|MIGRATION_MARKER_KEY|neon\.tech/i);
  assert.doesNotMatch(index,/neon-to-blob-migration|rudi-jwks/i);
  assert.equal(vercel.git.deploymentEnabled,false);
});
