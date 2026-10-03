const { signDataApiJwt } = require('./rudi-data-api-auth.cjs');
const { createBlobJsonStore, ensureMigrationReady, isBlobUnavailableError } = require('./blob-json-store.cjs');

const DATA_API_URL = 'https://ep-square-dream-b5uavt85.apirest.c-7.us-east-2.aws.neon.tech/rudi_auth/rest/v1';
const TABLE = 'rudi_browser_auth';
const ACTORS = new Set(['Рустам', 'Диана']);
const APP_STATE_FIELD = '__rudi_app_state';

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

function authBlobStore(options = {}) {
  if (options.authBlobStore) return options.authBlobStore;
  return createBlobJsonStore({
    prefix: 'rudi-state-v2',
    env: options.env || process.env,
    ...(options.blobClient ? { client: options.blobClient } : {}),
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  });
}

function authBlobKey(actor) {
  const safeActor = normalizeActor(actor);
  if (!safeActor) throw new Error('rudi-access-denied');
  return 'auth/' + actorSlug(safeActor);
}

async function request(path, init = {}, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('rudi-auth-db-unavailable');
  const token = signDataApiJwt(options);
  const response = await fetchImpl(DATA_API_URL + path, {
    ...init,
    headers: {
      authorization: 'Bearer ' + token,
      accept: 'application/json',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
    cache: 'no-store',
  });

  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }

  if (!response.ok) {
    const error = new Error('rudi-auth-db-unavailable');
    error.status = response.status;
    error.detail = data || text || '';
    throw error;
  }
  return data;
}

async function readLegacyRawRecord(actor, options = {}) {
  const safeActor = normalizeActor(actor);
  if (!safeActor) throw new Error('rudi-access-denied');
  const query = new URLSearchParams({
    actor: 'eq.' + safeActor,
    select: 'actor,pin_record,passkeys,updated_at',
    limit: '1',
  });
  const rows = await request('/' + TABLE + '?' + query.toString(), { method: 'GET' }, options);
  const row = Array.isArray(rows) ? rows[0] : null;
  return row && typeof row === 'object' && !Array.isArray(row) ? row : null;
}

async function listLegacyRawRecords(options = {}) {
  const query = new URLSearchParams({
    select: 'actor,pin_record,passkeys,updated_at',
    order: 'actor.asc',
  });
  const rows = await request('/' + TABLE + '?' + query.toString(), { method: 'GET' }, options);
  return (Array.isArray(rows) ? rows : []).filter((row) => normalizeActor(row?.actor));
}


async function readRawRecord(actor, options = {}) {
  const safeActor = normalizeActor(actor);
  if (!safeActor) throw new Error('rudi-access-denied');
  await ensureMigrationReady(options);
  const row = await authBlobStore(options).read(authBlobKey(safeActor));
  return row && typeof row === 'object' && !Array.isArray(row) ? row : null;
}

async function readAuthRecord(actor, options = {}) {
  return normalizeRow(await readRawRecord(actor, options));
}

async function writeRawBlobRecord(actor, row, options = {}) {
  const safeActor = normalizeActor(actor);
  if (!safeActor) throw new Error('rudi-access-denied');
  await ensureMigrationReady(options);
  const clean = row && typeof row === 'object' && !Array.isArray(row) ? { ...row, actor: safeActor } : null;
  if (!clean) throw new Error('rudi-auth-db-unavailable');
  await authBlobStore(options).write(authBlobKey(safeActor), clean);
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

  const raw = await writeRawBlobRecord(safeActor, {
    actor: safeActor,
    pin_record: pinRecord,
    passkeys,
    updated_at: updatedAt,
  }, options);

  const row = normalizeRow(raw);
  if (!row) throw new Error('rudi-auth-db-unavailable');
  return row;
}

async function readAppState(actor, key, options = {}) {
  const safeKey = String(key || '').trim();
  if (!safeKey || safeKey.length > 120) throw new Error('rudi-app-state-key-invalid');
  const row = await readRawRecord(actor, options);
  const appState = normalizeAppStateMap(rawPinRecord(row?.pin_record)[APP_STATE_FIELD]);
  return Object.prototype.hasOwnProperty.call(appState, safeKey) ? appState[safeKey] : null;
}

async function writeAppState(actor, key, value, options = {}) {
  const safeActor = normalizeActor(actor);
  const safeKey = String(key || '').trim();
  if (!safeActor) throw new Error('rudi-access-denied');
  if (!safeKey || safeKey.length > 120) throw new Error('rudi-app-state-key-invalid');

  const currentRaw = await readRawRecord(safeActor, options);
  const currentPin = rawPinRecord(currentRaw?.pin_record);
  const appState = normalizeAppStateMap(currentPin[APP_STATE_FIELD]);
  appState[safeKey] = value;
  const updatedAt = new Date(options.now || Date.now()).toISOString();

  await writeRawBlobRecord(safeActor, {
    actor: safeActor,
    pin_record: { ...currentPin, [APP_STATE_FIELD]: appState },
    passkeys: normalizePasskeys(currentRaw?.passkeys),
    updated_at: updatedAt,
  }, options);

  return appState[safeKey];
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
  DATA_API_URL,
  TABLE,
  normalizeActor,
  normalizePinRecord,
  normalizePasskeys,
  normalizeRow,
  readAuthRecord,
  writeAuthRecord,
  savePinRecord,
  APP_STATE_FIELD,
  readRawRecord,
  readLegacyRawRecord,
  listLegacyRawRecords,
  writeRawBlobRecord,
  readAppState,
  writeAppState,
  savePasskeys,
};
