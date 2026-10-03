const crypto = require('node:crypto');
const net = require('node:net');
const tls = require('node:tls');
const { derivePrivateScalar } = require('./rudi-data-api-auth.cjs');
const { resolveTelegramBotToken } = require('./products-bought.cjs');
const { createD1StateClient } = require('./d1-state-client.cjs');

const MIGRATION_ID = 'neon-to-d1-2026-10-03-v2';
const AUTH_NAMESPACE = 'rudi-browser-auth-v1';
const SYSTEM_NAMESPACE = 'rudi-system-v1';
const MARKER_KEY = 'migration:' + MIGRATION_ID;
const ECIES_CONTEXT = Buffer.from('rudi-neon-migration-v1');
const ENCRYPTED_NEON_URI = Object.freeze({
  v: 1,
  x: 'xgKL-MH3wddRhHqIb63OZ5X_gP-QlRGY6fAHX-W1TmY',
  y: 'qrEMrozjL3MfI_EjN9saFfJwPNoN86lhEgLMsrBTLhY',
  iv: 'Af8KHRa4HhRVwjC4',
  ct: 'rrjGKwnveNGKOaIEnTjH73OPQFfhJozU5mLKeo_N3TmmBn7qKCvDmCqceB5Mmg-2MvoWN_e2LKpXVoytp3ifWHbU2gL3ZGjDNZugZ5hm-pVxg0GsYiyUuP1zEvS6yECHatceYaullEmS6TmVV0ql-b_uJumYcKryenoAB8LnNWY61GOMAeWJGaAEFlZK0WcJN5NKwSEqsvYyQsw',
  tag: '228NtBcteYXIcZ50BcM4fQ',
});

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

function decryptNeonUri(env = process.env) {
  const secret = resolveTelegramBotToken(env);
  const privateScalar = derivePrivateScalar(secret);
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(privateScalar);
  const ephemeralPublic = Buffer.concat([
    Buffer.from([4]),
    Buffer.from(ENCRYPTED_NEON_URI.x, 'base64url'),
    Buffer.from(ENCRYPTED_NEON_URI.y, 'base64url'),
  ]);
  const shared = ecdh.computeSecret(ephemeralPublic);
  const key = crypto.createHash('sha256').update(shared).update(ECIES_CONTEXT).digest();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ENCRYPTED_NEON_URI.iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(ENCRYPTED_NEON_URI.tag, 'base64url'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ENCRYPTED_NEON_URI.ct, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
  if (!plaintext.startsWith('postgresql://')) throw new Error('neon-migration-uri-invalid');
  return plaintext;
}

function i32(value) { const b = Buffer.alloc(4); b.writeInt32BE(value); return b; }
function cstr(value) { return Buffer.concat([Buffer.from(String(value), 'utf8'), Buffer.from([0])]); }
function pgMessage(type, payload = Buffer.alloc(0)) {
  return Buffer.concat([Buffer.from(type), i32(payload.length + 4), payload]);
}
function xorBuffers(left, right) {
  const out = Buffer.alloc(left.length);
  for (let index = 0; index < left.length; index += 1) out[index] = left[index] ^ right[index];
  return out;
}
function pgHmac(key, value) { return crypto.createHmac('sha256', key).update(value).digest(); }
function pgSha(value) { return crypto.createHash('sha256').update(value).digest(); }
function pgError(payload) {
  const fields = {};
  let index = 0;
  while (index < payload.length && payload[index] !== 0) {
    const code = String.fromCharCode(payload[index]);
    index += 1;
    let end = index;
    while (end < payload.length && payload[end] !== 0) end += 1;
    fields[code] = payload.subarray(index, end).toString('utf8');
    index = end + 1;
  }
  return fields.M || fields.S || 'postgres-error';
}
function pgReader(socket) {
  let buffer = Buffer.alloc(0);
  const waiters = [];
  function rejectAll(error) { while (waiters.length) waiters.shift().reject(error); }
  function drain() {
    while (waiters.length && buffer.length >= 5) {
      const length = buffer.readInt32BE(1);
      if (length < 4 || buffer.length < length + 1) return;
      const type = String.fromCharCode(buffer[0]);
      const payload = buffer.subarray(5, length + 1);
      buffer = buffer.subarray(length + 1);
      waiters.shift().resolve({ type, payload });
    }
  }
  socket.on('data', (chunk) => { buffer = Buffer.concat([buffer, chunk]); drain(); });
  socket.on('error', rejectAll);
  socket.on('end', () => rejectAll(new Error('postgres-ended')));
  return () => new Promise((resolve, reject) => { waiters.push({ resolve, reject }); drain(); });
}

async function pgConnect(uri) {
  const parsed = new URL(uri);
  const host = parsed.hostname;
  const port = Number(parsed.port || 5432);
  const user = decodeURIComponent(parsed.username);
  const password = decodeURIComponent(parsed.password);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));

  const raw = net.createConnection({ host, port });
  await new Promise((resolve, reject) => {
    raw.once('connect', resolve);
    raw.once('error', reject);
  });
  raw.write(Buffer.concat([i32(8), i32(80877103)]));
  const sslResponse = await new Promise((resolve, reject) => {
    raw.once('data', (chunk) => resolve(chunk.subarray(0, 1).toString('utf8')));
    raw.once('error', reject);
  });
  if (sslResponse !== 'S') throw new Error('postgres-ssl-refused');

  const socket = tls.connect({ socket: raw, servername: host, rejectUnauthorized: true });
  await new Promise((resolve, reject) => {
    socket.once('secureConnect', resolve);
    socket.once('error', reject);
  });
  const read = pgReader(socket);
  const startupPayload = Buffer.concat([
    i32(196608),
    cstr('user'), cstr(user),
    cstr('database'), cstr(database),
    cstr('client_encoding'), cstr('UTF8'),
    Buffer.from([0]),
  ]);
  socket.write(Buffer.concat([i32(startupPayload.length + 4), startupPayload]));

  let scram = null;
  while (true) {
    const message = await read();
    if (message.type === 'E') throw new Error(pgError(message.payload));
    if (message.type === 'R') {
      const code = message.payload.readInt32BE(0);
      if (code === 0) continue;
      if (code === 10) {
        const mechanisms = message.payload.subarray(4).toString('utf8').split('\0').filter(Boolean);
        if (!mechanisms.includes('SCRAM-SHA-256')) throw new Error('postgres-scram-unavailable');
        const nonce = crypto.randomBytes(18).toString('base64');
        const escapedUser = user.replace(/=/g, '=3D').replace(/,/g, '=2C');
        const clientFirstBare = `n=${escapedUser},r=${nonce}`;
        const clientFirst = `n,,${clientFirstBare}`;
        scram = { nonce, clientFirstBare };
        socket.write(pgMessage('p', Buffer.concat([
          cstr('SCRAM-SHA-256'),
          i32(Buffer.byteLength(clientFirst)),
          Buffer.from(clientFirst),
        ])));
        continue;
      }
      if (code === 11) {
        if (!scram) throw new Error('postgres-scram-state');
        const serverFirst = message.payload.subarray(4).toString('utf8');
        const parts = Object.fromEntries(serverFirst.split(',').map((item) => [item[0], item.slice(2)]));
        if (!parts.r || !parts.r.startsWith(scram.nonce)) throw new Error('postgres-scram-nonce');
        const saltedPassword = crypto.pbkdf2Sync(
          Buffer.from(password), Buffer.from(parts.s, 'base64'), Number(parts.i), 32, 'sha256'
        );
        const clientKey = pgHmac(saltedPassword, 'Client Key');
        const storedKey = pgSha(clientKey);
        const finalWithoutProof = `c=biws,r=${parts.r}`;
        const authMessage = `${scram.clientFirstBare},${serverFirst},${finalWithoutProof}`;
        const clientSignature = pgHmac(storedKey, authMessage);
        const clientProof = xorBuffers(clientKey, clientSignature).toString('base64');
        scram.serverSignature = pgHmac(pgHmac(saltedPassword, 'Server Key'), authMessage).toString('base64');
        socket.write(pgMessage('p', Buffer.from(`${finalWithoutProof},p=${clientProof}`)));
        continue;
      }
      if (code === 12) {
        if (!scram) throw new Error('postgres-scram-state');
        const serverFinal = message.payload.subarray(4).toString('utf8');
        const parts = Object.fromEntries(serverFinal.split(',').map((item) => [item[0], item.slice(2)]));
        if (parts.v && parts.v !== scram.serverSignature) throw new Error('postgres-scram-signature');
        continue;
      }
      throw new Error('postgres-auth-' + code);
    }
    if (message.type === 'Z') break;
  }
  return { socket, read };
}

async function pgQueryJson(uri, sql) {
  const { socket, read } = await pgConnect(uri);
  try {
    socket.write(pgMessage('Q', cstr(sql)));
    let result = null;
    while (true) {
      const message = await read();
      if (message.type === 'E') throw new Error(pgError(message.payload));
      if (message.type === 'D') {
        const fieldCount = message.payload.readInt16BE(0);
        if (fieldCount !== 1) throw new Error('postgres-result-shape');
        const length = message.payload.readInt32BE(2);
        if (length >= 0) result = message.payload.subarray(6, 6 + length).toString('utf8');
      }
      if (message.type === 'Z') break;
    }
    if (!result) throw new Error('postgres-empty-result');
    return JSON.parse(result);
  } finally {
    try { socket.write(pgMessage('X')); } catch {}
    try { socket.end(); } catch {}
  }
}

async function readNeonSnapshot(options = {}) {
  const uri = decryptNeonUri(options.env || process.env);
  const sql = `SELECT jsonb_build_object(
    'auth', (SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.actor), '[]'::jsonb) FROM public.rudi_browser_auth a),
    'durable', (SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.namespace, d.key), '[]'::jsonb) FROM public.rudi_durable_state d)
  )::text`;
  const snapshot = await pgQueryJson(uri, sql);
  return {
    auth: Array.isArray(snapshot?.auth) ? snapshot.auth : [],
    durable: Array.isArray(snapshot?.durable) ? snapshot.durable : [],
  };
}

async function readAuthRows(options = {}) { return (await readNeonSnapshot(options)).auth; }
async function readDurableRows(options = {}) { return (await readNeonSnapshot(options)).durable; }

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
  const snapshot = await readNeonSnapshot(options);
  const authRows = snapshot.auth.filter((row) => ['Рустам', 'Диана'].includes(String(row?.actor || '')));
  const durableRows = snapshot.durable;
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
    source: { authRows: authRows.length, durableRows: durableRows.length, namespaces, checksum: sourceChecksum },
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
  decryptNeonUri,
  pgQueryJson,
  readAuthRows,
  readDurableRows,
  migrateNeonToD1,
};
