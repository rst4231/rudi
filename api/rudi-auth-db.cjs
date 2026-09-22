const { signDataApiJwt } = require('./rudi-data-api-auth.cjs');

const DATA_API_URL = 'https://ep-square-dream-b5uavt85.apirest.c-7.us-east-2.aws.neon.tech/rudi_auth/rest/v1';
const TABLE = 'rudi_browser_auth';
const ACTORS = new Set(['Рустам', 'Диана']);

function normalizeActor(value) {
  const actor = String(value || '').trim();
  return ACTORS.has(actor) ? actor : '';
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

async function readAuthRecord(actor, options = {}) {
  const safeActor = normalizeActor(actor);
  if (!safeActor) throw new Error('rudi-access-denied');
  const query = new URLSearchParams({
    actor: 'eq.' + safeActor,
    select: 'actor,pin_record,passkeys,updated_at',
    limit: '1',
  });
  const rows = await request('/' + TABLE + '?' + query.toString(), { method: 'GET' }, options);
  return normalizeRow(Array.isArray(rows) ? rows[0] : null);
}

async function writeAuthRecord(actor, value = {}, options = {}) {
  const safeActor = normalizeActor(actor);
  if (!safeActor) throw new Error('rudi-access-denied');

  const current = await readAuthRecord(safeActor, options);
  const pinRecord = Object.prototype.hasOwnProperty.call(value, 'pinRecord')
    ? normalizePinRecord(value.pinRecord)
    : current?.pinRecord || null;
  const passkeys = Object.prototype.hasOwnProperty.call(value, 'passkeys')
    ? normalizePasskeys(value.passkeys)
    : current?.passkeys || [];
  const updatedAt = String(value.updatedAt || new Date(options.now || Date.now()).toISOString());

  const query = new URLSearchParams({ on_conflict: 'actor' });
  const rows = await request('/' + TABLE + '?' + query.toString(), {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify([{
      actor: safeActor,
      pin_record: pinRecord,
      passkeys,
      updated_at: updatedAt,
    }]),
  }, options);

  const row = normalizeRow(Array.isArray(rows) ? rows[0] : null);
  if (!row) throw new Error('rudi-auth-db-unavailable');
  return row;
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
  savePasskeys,
};
