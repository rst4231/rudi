const { createRudiStateClient } = require('./rudi-state-client.cjs');

const ACTORS = new Set(['Рустам', 'Диана']);
const APP_STATE_FIELD = '__rudi_app_state';
const AUTH_NAMESPACE = 'rudi-browser-auth-v1';
const APP_STATE_NAMESPACE = 'rudi-app-state-v1';

function normalizeActor(value) {
  const actor = String(value || '').trim();
  return ACTORS.has(actor) ? actor : '';
}

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeAppStateMap(value) {
  const source = plainObject(value);
  const result = {};
  for (const [key, item] of Object.entries(source)) {
    const safeKey = String(key || '').trim();
    if (!safeKey || safeKey.length > 120) continue;
    result[safeKey] = item;
  }
  return result;
}

function rawPinRecord(value) {
  return plainObject(value);
}

function normalizePinRecord(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const salt = String(source.salt || '').trim();
  const hash = String(source.hash || '').trim();
  if (!salt || !hash) return null;
  return {
    version: 1,
    salt,
    hash,
    updatedAt: String(source.updatedAt || ''),
  };
}

function normalizePasskeys(value) {
  return (Array.isArray(value) ? value : [])
    .filter((row) => row && typeof row === 'object' && !Array.isArray(row))
    .map((row) => ({ ...row }))
    .slice(-5);
}

function normalizeRow(value) {
  const actor = normalizeActor(value?.actor);
  if (!actor) return null;
  return {
    actor,
    pinRecord: normalizePinRecord(value?.pin_record),
    passkeys: normalizePasskeys(value?.passkeys),
    updatedAt: String(value?.updated_at || ''),
  };
}

function actorSlug(actor) {
  return normalizeActor(actor) === 'Диана' ? 'diana' : 'rustam';
}

function authStateClient(options = {}) {
  return options.stateClient || createRudiStateClient({
    env: options.env || process.env,
    fetchImpl: options.fetchImpl || globalThis.fetch,
    d1Client: options.d1Client,
    vercelClient: options.vercelClient,
    pool: options.pool,
    connectionString: options.connectionString,
    d1BaseUrl: options.d1BaseUrl,
    d1Secret: options.d1Secret,
    timeoutMs: options.timeoutMs,
  });
}

async function readRawRecord(actor, options = {}) {
  const safeActor = normalizeActor(actor);
  if (!safeActor) throw new Error('rudi-access-denied');
  const record = await authStateClient(options).getRecord(AUTH_NAMESPACE, safeActor);
  const row = record?.value;
  return row && typeof row === 'object' && !Array.isArray(row) ? row : null;
}

async function readAuthRecord(actor, options = {}) {
  return normalizeRow(await readRawRecord(actor, options));
}

async function writeRawRecord(actor, row, options = {}) {
  const safeActor = normalizeActor(actor);
  if (!safeActor) throw new Error('rudi-access-denied');
  const clean = row && typeof row === 'object' && !Array.isArray(row) ? { ...row, actor: safeActor } : null;
  if (!clean) throw new Error('rudi-auth-db-unavailable');
  await authStateClient(options).setRecord({
    namespace: AUTH_NAMESPACE,
    key: safeActor,
    value: clean,
    tags: ['rudi-auth'],
    expires_at: null,
    updated_at: String(clean.updated_at || new Date(options.now || Date.now()).toISOString()),
  });
  return clean;
}

async function writeAuthRecord(actor, value = {}, options = {}) {
  const safeActor = normalizeActor(actor);
  if (!safeActor) throw new Error('rudi-access-denied');

  const currentRaw = await readRawRecord(safeActor, options);
  const currentRawPin = rawPinRecord(currentRaw?.pin_record);
  const currentAppState = normalizeAppStateMap(currentRawPin[APP_STATE_FIELD]);
  const normalizedPin = Object.prototype.hasOwnProperty.call(value, 'pinRecord')
    ? normalizePinRecord(value.pinRecord)
    : normalizePinRecord(currentRaw?.pin_record);
  const pinRecord = normalizedPin
    ? { ...currentRawPin, ...normalizedPin, [APP_STATE_FIELD]: currentAppState }
    : (Object.keys(currentAppState).length ? { [APP_STATE_FIELD]: currentAppState } : null);
  const passkeys = Object.prototype.hasOwnProperty.call(value, 'passkeys')
    ? normalizePasskeys(value.passkeys)
    : normalizePasskeys(currentRaw?.passkeys);
  const updatedAt = String(value.updatedAt || new Date(options.now || Date.now()).toISOString());

  const raw = await writeRawRecord(safeActor, {
    actor: safeActor,
    pin_record: pinRecord,
    passkeys,
    updated_at: updatedAt,
  }, options);

  const row = normalizeRow(raw);
  if (!row) throw new Error('rudi-auth-db-unavailable');
  return row;
}

function appStateRecordKey(actor, key) {
  const safeActor = normalizeActor(actor);
  const safeKey = String(key || '').trim();
  if (!safeActor) throw new Error('rudi-access-denied');
  if (!safeKey || safeKey.length > 120) throw new Error('rudi-app-state-key-invalid');
  return actorSlug(safeActor) + ':' + safeKey;
}

async function readAppState(actor, key, options = {}) {
  const safeActor = normalizeActor(actor);
  const safeKey = String(key || '').trim();
  if (!safeActor) throw new Error('rudi-access-denied');
  if (!safeKey || safeKey.length > 120) throw new Error('rudi-app-state-key-invalid');

  const client = authStateClient(options);
  const dedicated = await client.getRecord(APP_STATE_NAMESPACE, appStateRecordKey(safeActor, safeKey));
  if (dedicated) return dedicated.value ?? null;

  // Backward compatibility: older releases kept all app state inside pin_record.
  const row = await readRawRecord(safeActor, options);
  const legacy = normalizeAppStateMap(rawPinRecord(row?.pin_record)[APP_STATE_FIELD]);
  return Object.prototype.hasOwnProperty.call(legacy, safeKey) ? legacy[safeKey] : null;
}

async function writeAppState(actor, key, value, options = {}) {
  const safeActor = normalizeActor(actor);
  const safeKey = String(key || '').trim();
  if (!safeActor) throw new Error('rudi-access-denied');
  if (!safeKey || safeKey.length > 120) throw new Error('rudi-app-state-key-invalid');

  const updatedAt = new Date(options.now || Date.now()).toISOString();
  await authStateClient(options).setRecord({
    namespace: APP_STATE_NAMESPACE,
    key: appStateRecordKey(safeActor, safeKey),
    value,
    tags: ['rudi-app-state', 'actor:' + actorSlug(safeActor)],
    expires_at: null,
    updated_at: updatedAt,
  });
  return value;
}

async function savePinRecord(actor, pinRecord, options = {}) {
  const normalized = normalizePinRecord(pinRecord);
  if (!normalized) throw new Error('rudi-pin-not-configured');
  return writeAuthRecord(actor, { pinRecord: normalized, updatedAt: normalized.updatedAt }, options);
}

async function savePasskeys(actor, passkeys, options = {}) {
  return writeAuthRecord(actor, { passkeys: normalizePasskeys(passkeys) }, options);
}

module.exports = {
  AUTH_NAMESPACE,
  APP_STATE_NAMESPACE,
  normalizeActor,
  normalizePinRecord,
  normalizePasskeys,
  normalizeRow,
  readAuthRecord,
  writeAuthRecord,
  savePinRecord,
  APP_STATE_FIELD,
  readRawRecord,
  writeRawRecord,
  readAppState,
  writeAppState,
  appStateRecordKey,
  savePasskeys,
};
