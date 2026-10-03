const crypto = require('node:crypto');
const { signDataApiJwt } = require('./rudi-data-api-auth.cjs');
const { createD1StateClient } = require('./d1-state-client.cjs');

const MIGRATION_ID = 'neon-to-d1-2026-10-03-v1';
const DATA_API_URL = 'https://ep-square-dream-b5uavt85.apirest.c-7.us-east-2.aws.neon.tech/rudi_auth/rest/v1';
const AUTH_TABLE = 'rudi_browser_auth';
const DURABLE_TABLE = 'rudi_durable_state';
const AUTH_NAMESPACE = 'rudi-browser-auth-v1';
const SYSTEM_NAMESPACE = 'rudi-system-v1';
const MARKER_KEY = 'migration:' + MIGRATION_ID;

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}
function canonicalJson(value) { return JSON.stringify(canonicalize(value)); }
function checksum(value) { return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex'); }
function normalizeTags(tags) {
  return [...new Set((Array.isArray(tags) ? tags : []).map((value) => String(value || '').trim()).filter(Boolean))].slice(0, 32);
}
function rowContent(row) {
  return {
    namespace: String(row?.namespace || ''),
    key: String(row?.key || ''),
    value: row?.value,
    tags: normalizeTags(row?.tags),
    expires_at: row?.expires_at ? String(row.expires_at) : null,
  };
}
function authContent(row) {
  return {
    actor: String(row?.actor || ''),
    pin_record: row?.pin_record ?? null,
    passkeys: Array.isArray(row?.passkeys) ? row.passkeys : [],
    updated_at: String(row?.updated_at || ''),
  };
}
function namespaceSummary(rows) {
  const map = new Map();
  for (const row of rows) {
    const namespace = String(row?.namespace || '');
    map.set(namespace, (map.get(namespace) || 0) + 1);
  }
  return Object.fromEntries([...map.entries()].sort(([a], [b]) => a.localeCompare(b)));
}
function rowKey(row) { return String(row?.namespace || '') + '\0' + String(row?.key || ''); }

async function neonRequest(table, query, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('neon-migration-fetch-unavailable');
  const token = signDataApiJwt({ env: options.env || process.env });
  const response = await fetchImpl(DATA_API_URL + '/' + table + (query ? '?' + query : ''), {
    method: 'GET',
    headers: { authorization: 'Bearer ' + token, accept: 'application/json' },
    cache: 'no-store',
  });
  const text = await response.text();
  if (!response.ok) throw new Error('neon-migration-read-failed:' + response.status + ':' + text.slice(0, 180));
  return text ? JSON.parse(text) : [];
}

async function readAuthRows(options = {}) {
  const query = new URLSearchParams({
    select: 'actor,pin_record,passkeys,updated_at',
    order: 'actor.asc',
  }).toString();
  const rows = await neonRequest(AUTH_TABLE, query, options);
  return (Array.isArray(rows) ? rows : []).filter((row) => ['Рустам', 'Диана'].includes(String(row?.actor || '')));
}

async function readDurableRows(options = {}) {
  const all = [];
  const pageSize = 10;
  for (let offset = 0; offset < 5000; offset += pageSize) {
    const query = new URLSearchParams({
      select: 'namespace,key,value,tags,expires_at,updated_at',
      order: 'namespace.asc,key.asc',
      limit: String(pageSize),
      offset: String(offset),
    }).toString();
    const rows = await neonRequest(DURABLE_TABLE, query, options);
    const page = Array.isArray(rows) ? rows : [];
    all.push(...page);
    if (page.length < pageSize) break;
  }
  return all;
}

async function migrateNeonToD1(options = {}) {
  const client = options.client || createD1StateClient({
    env: options.env || process.env,
    fetchImpl: options.fetchImpl || globalThis.fetch,
  });

  const existing = await client.getRecord(SYSTEM_NAMESPACE, MARKER_KEY).catch(() => null);
  if (existing?.value?.status === 'complete' && options.force !== true) return existing.value;

  const health = await client.health();
  if (!health?.ok || health?.storage !== 'cloudflare-d1') throw new Error('rudi-d1-health-failed');

  const startedAt = new Date().toISOString();
  const [authRows, durableRows] = await Promise.all([readAuthRows(options), readDurableRows(options)]);
  if (authRows.length !== 2) throw new Error('neon-auth-count-unexpected:' + authRows.length);
  if (durableRows.length !== 186) throw new Error('neon-durable-count-unexpected:' + durableRows.length);

  let durableWritten = 0;
  for (const row of durableRows) {
    await client.setRecord({
      namespace: String(row.namespace || ''),
      key: String(row.key || ''),
      value: row.value,
      tags: normalizeTags(row.tags),
      expires_at: row.expires_at ? String(row.expires_at) : null,
      updated_at: String(row.updated_at || ''),
    });
    durableWritten += 1;
  }

  let authWritten = 0;
  for (const row of authRows) {
    await client.setRecord({
      namespace: AUTH_NAMESPACE,
      key: String(row.actor || ''),
      value: authContent(row),
      tags: ['rudi-auth'],
      expires_at: null,
      updated_at: String(row.updated_at || ''),
    });
    authWritten += 1;
  }

  const sourceNamespaces = namespaceSummary(durableRows);
  const sourceMap = new Map(durableRows.map((row) => [rowKey(row), row]));
  const destinationRows = [];
  for (const namespace of Object.keys(sourceNamespaces)) {
    const items = await client.list(namespace);
    for (const item of items) {
      if (sourceMap.has(rowKey(item))) destinationRows.push(item);
    }
  }

  const destinationMap = new Map(destinationRows.map((row) => [rowKey(row), row]));
  const durableMismatches = [];
  for (const source of durableRows) {
    const destination = destinationMap.get(rowKey(source));
    if (!destination) {
      durableMismatches.push(rowKey(source) + ':missing');
      continue;
    }
    if (canonicalJson(rowContent(source)) !== canonicalJson(rowContent(destination))) {
      durableMismatches.push(rowKey(source) + ':content');
    }
  }

  const authDest = [];
  const authMismatches = [];
  for (const source of authRows) {
    const destination = await client.getRecord(AUTH_NAMESPACE, source.actor);
    if (!destination) {
      authMismatches.push(String(source.actor) + ':missing');
      continue;
    }
    authDest.push(destination);
    if (canonicalJson(authContent(source)) !== canonicalJson(destination.value)) {
      authMismatches.push(String(source.actor) + ':content');
    }
  }

  const sourceContent = {
    auth: authRows.map(authContent).sort((a, b) => String(a.actor).localeCompare(String(b.actor), 'ru')),
    durable: durableRows.map(rowContent).sort((a, b) => rowKey(a).localeCompare(rowKey(b))),
  };
  const destinationContent = {
    auth: authDest.map((row) => row.value).sort((a, b) => String(a.actor).localeCompare(String(b.actor), 'ru')),
    durable: destinationRows.map(rowContent).sort((a, b) => rowKey(a).localeCompare(rowKey(b))),
  };
  const sourceChecksum = checksum(sourceContent);
  const destinationChecksum = checksum(destinationContent);
  const mismatch = durableMismatches.length + authMismatches.length;
  const complete =
    mismatch === 0 &&
    destinationRows.length === durableRows.length &&
    authDest.length === 2 &&
    sourceChecksum === destinationChecksum;

  const namespaces = sourceNamespaces;
  const result = {
    migrationId: MIGRATION_ID,
    status: complete ? 'complete' : 'verification-failed',
    startedAt,
    completedAt: new Date().toISOString(),
    source: {
      authRows: authRows.length,
      durableRows: durableRows.length,
      namespaces,
      checksum: sourceChecksum,
    },
    migrated: { authWritten, durableWritten },
    verified: {
      auth: authDest.length,
      durable: destinationRows.length,
      mismatch,
      durableMismatches: durableMismatches.slice(0, 20),
      authMismatches: authMismatches.slice(0, 20),
      sourceChecksum,
      destinationChecksum,
      habits: {
        rustam: Boolean(authRows.find((row) => row.actor === 'Рустам')?.pin_record?.__rudi_app_state?.['habits:v1']),
        diana: Boolean(authRows.find((row) => row.actor === 'Диана')?.pin_record?.__rudi_app_state?.['habits:v1']),
      },
      supplements: Number(namespaces['rudi-supplements-v1'] || 0),
      products: Number(namespaces['rudi-product-list-v1'] || 0),
      score: Number(namespaces['rudi-score-v1'] || 0),
      messenger: Number(namespaces['rudi-messenger-v1'] || 0),
      feed: Number(namespaces['rudi-feed-v1'] || 0),
    },
    sourceUpdatedAtNote: 'The current Worker assigns D1 updated_at at write time; original auth updated_at is preserved inside each auth value.',
  };

  if (complete) {
    await client.setRecord({
      namespace: SYSTEM_NAMESPACE,
      key: MARKER_KEY,
      value: result,
      tags: ['rudi-migration'],
      expires_at: null,
    });
  }
  return result;
}

module.exports = {
  MIGRATION_ID,
  AUTH_NAMESPACE,
  SYSTEM_NAMESPACE,
  MARKER_KEY,
  canonicalJson,
  checksum,
  readAuthRows,
  readDurableRows,
  migrateNeonToD1,
};
