const crypto = require('node:crypto');
const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');
const { normalizeActor } = require('./rudi-session.cjs');
const { resolveTelegramBotToken } = require('./products-bought.cjs');

const PASSKEY_TTL_SECONDS = 10 * 365 * 24 * 60 * 60;
const CHALLENGE_TTL_SECONDS = 10 * 60;
const MAX_PASSKEYS_PER_ACTOR = 5;

let webauthnPromise = null;
async function resolveWebAuthn(options = {}) {
  if (options.webauthn) return options.webauthn;
  if (!webauthnPromise) webauthnPromise = import('@simplewebauthn/server');
  return webauthnPromise;
}

function resolveCache(options = {}) {
  if (options.cache) return options.cache;
  return createStrictRuntimeCache({
    namespace: 'rudi-passkeys-v1',
    confirmWrites: false,
    ...(options.cacheOptions || {}),
  });
}

function requestOrigin(req) {
  const forwardedHost = String(req?.headers?.['x-forwarded-host'] || '').split(',')[0].trim();
  const host = forwardedHost || String(req?.headers?.host || '').trim();
  if (!host) throw new Error('rudi-passkey-host-invalid');
  const hostname = host.replace(/:\d+$/, '');
  if (!hostname) throw new Error('rudi-passkey-host-invalid');
  const forwardedProto = String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
  const proto = forwardedProto || (hostname === 'localhost' || hostname === '127.0.0.1' ? 'http' : 'https');
  if (!['http','https'].includes(proto)) throw new Error('rudi-passkey-origin-invalid');
  return {
    rpID: hostname,
    origin: proto + '://' + host,
  };
}

function passkeysKey(actor) {
  const safeActor = normalizeActor(actor);
  if (!safeActor) throw new Error('rudi-access-denied');
  return 'passkeys:' + safeActor;
}

function encodeBytes(value) {
  return Buffer.from(value || []).toString('base64url');
}

function decodeBytes(value) {
  return new Uint8Array(Buffer.from(String(value || ''), 'base64url'));
}

function normalizePasskey(row) {
  const actor = normalizeActor(row?.actor);
  const id = String(row?.id || '').trim();
  const publicKey = String(row?.publicKey || '').trim();
  const rpID = String(row?.rpID || '').trim();
  if (!actor || !id || !publicKey || !rpID) return null;
  return {
    actor,
    id,
    publicKey,
    counter: Math.max(0, Number(row?.counter || 0)),
    transports: Array.isArray(row?.transports) ? row.transports.map(String).filter(Boolean) : [],
    deviceType: String(row?.deviceType || ''),
    backedUp: Boolean(row?.backedUp),
    rpID,
    createdAt: String(row?.createdAt || ''),
    updatedAt: String(row?.updatedAt || ''),
  };
}

async function readPasskeys(actor, options = {}) {
  const cache = resolveCache(options);
  const raw = await cache.get(passkeysKey(actor));
  return (Array.isArray(raw) ? raw : []).map(normalizePasskey).filter(Boolean);
}

async function writePasskeys(actor, rows, options = {}) {
  const cache = resolveCache(options);
  const key = passkeysKey(actor);
  const value = (Array.isArray(rows) ? rows : []).map(normalizePasskey).filter(Boolean).slice(-MAX_PASSKEYS_PER_ACTOR);
  await cache.set(key, value, {
    ttl: PASSKEY_TTL_SECONDS,
    tags: ['rudi-passkeys'],
    name: key,
  });
  return value;
}

async function restorePasskeys(actor, rows, options = {}) {
  const safeActor = normalizeActor(actor);
  if (!safeActor) throw new Error('rudi-access-denied');
  const incoming = (Array.isArray(rows) ? rows : []).map(normalizePasskey).filter(row => row?.actor === safeActor);
  if (!incoming.length) return readPasskeys(safeActor, options);
  const current = await readPasskeys(safeActor, options).catch(() => []);
  const merged = new Map();
  for (const row of [...current, ...incoming]) {
    const key = row.rpID + '\0' + row.id;
    const previous = merged.get(key);
    const previousTime = Date.parse(String(previous?.updatedAt || previous?.createdAt || '')) || 0;
    const rowTime = Date.parse(String(row.updatedAt || row.createdAt || '')) || 0;
    if (!previous || rowTime >= previousTime) merged.set(key, row);
  }
  return writePasskeys(safeActor, [...merged.values()], options);
}

function actorUserId(actor) {
  return new Uint8Array(
    crypto.createHash('sha256').update('rudi-passkey-user-v1\0' + normalizeActor(actor)).digest().subarray(0, 24)
  );
}

function resolveChallengeSecret(options = {}) {
  return options.botToken || resolveTelegramBotToken(options.env || process.env);
}

function challengeSigningKey(options = {}) {
  return crypto
    .createHmac('sha256', resolveChallengeSecret(options))
    .update('rudi-passkey-challenge-v2')
    .digest();
}

function createChallengeToken(kind, actor, rp, options = {}) {
  const now = Math.floor(Number(options.now || Date.now()) / 1000);
  const payload = {
    v: 2,
    kind: String(kind || ''),
    actor: String(actor || 'any'),
    rpID: String(rp?.rpID || ''),
    origin: String(rp?.origin || ''),
    iat: now,
    exp: now + CHALLENGE_TTL_SECONDS,
    nonce: crypto.randomBytes(24).toString('base64url'),
  };
  const payloadBytes = Buffer.from(JSON.stringify(payload));
  if (payloadBytes.length > 65535) throw new Error('rudi-passkey-challenge-invalid');
  const length = Buffer.alloc(2);
  length.writeUInt16BE(payloadBytes.length, 0);
  const signature = crypto.createHmac('sha256', challengeSigningKey(options)).update(payloadBytes).digest();
  return Buffer.concat([length, payloadBytes, signature]).toString('base64url');
}

function consumeChallenge(kind, actor, challenge, rp, options = {}) {
  let packed;
  try {
    packed = Buffer.from(String(challenge || ''), 'base64url');
  } catch {
    throw new Error('rudi-passkey-challenge-invalid');
  }
  if (packed.length < 35) throw new Error('rudi-passkey-challenge-invalid');

  const payloadLength = packed.readUInt16BE(0);
  const payloadStart = 2;
  const payloadEnd = payloadStart + payloadLength;
  const signatureEnd = payloadEnd + 32;
  if (payloadLength < 2 || packed.length !== signatureEnd) throw new Error('rudi-passkey-challenge-invalid');

  const payloadBytes = packed.subarray(payloadStart, payloadEnd);
  const signature = packed.subarray(payloadEnd, signatureEnd);
  const expected = crypto.createHmac('sha256', challengeSigningKey(options)).update(payloadBytes).digest();
  if (signature.length !== expected.length || !crypto.timingSafeEqual(signature, expected)) {
    throw new Error('rudi-passkey-challenge-invalid');
  }

  let payload;
  try {
    payload = JSON.parse(payloadBytes.toString('utf8'));
  } catch {
    throw new Error('rudi-passkey-challenge-invalid');
  }

  const now = Math.floor(Number(options.now || Date.now()) / 1000);
  const expectedActor = String(actor || 'any');
  if (
    payload?.v !== 2
    || payload?.kind !== String(kind || '')
    || payload?.actor !== expectedActor
    || payload?.rpID !== String(rp?.rpID || '')
    || payload?.origin !== String(rp?.origin || '')
    || !Number.isFinite(payload?.iat)
    || !Number.isFinite(payload?.exp)
    || payload.exp < now
    || payload.iat > now + 60
    || payload.exp - payload.iat > CHALLENGE_TTL_SECONDS
  ) {
    throw new Error('rudi-passkey-challenge-invalid');
  }

  return {
    kind: payload.kind,
    actor: payload.actor,
    challenge: String(challenge || ''),
    rpID: payload.rpID,
    origin: payload.origin,
    createdAt: new Date(payload.iat * 1000).toISOString(),
  };
}

async function passkeyStatus(req, actor, options = {}) {
  const rp = requestOrigin(req);
  const rows = (await readPasskeys(actor, options)).filter(row => row.rpID === rp.rpID);
  return { configured: rows.length > 0, count: rows.length, rpID: rp.rpID };
}

async function registrationOptions(req, actor, options = {}) {
  const safeActor = normalizeActor(actor);
  if (!safeActor) throw new Error('rudi-access-denied');
  const rp = requestOrigin(req);
  const existing = (await readPasskeys(safeActor, options)).filter(row => row.rpID === rp.rpID);
  const webauthn = await resolveWebAuthn(options);
  const result = await webauthn.generateRegistrationOptions({
    rpName: 'RUDI',
    rpID: rp.rpID,
    userID: actorUserId(safeActor),
    userName: safeActor,
    userDisplayName: safeActor,
    attestationType: 'none',
    excludeCredentials: existing.map(row => ({ id: row.id, transports: row.transports })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
    preferredAuthenticatorType: 'localDevice',
    supportedAlgorithmIDs: [-8, -7, -257],
  });
  result.challenge = createChallengeToken('register', safeActor, rp, options);
  return result;
}

async function verifyRegistration(req, actor, challenge, response, options = {}) {
  const safeActor = normalizeActor(actor);
  if (!safeActor) throw new Error('rudi-access-denied');
  const rp = requestOrigin(req);
  const stored = consumeChallenge('register', safeActor, challenge, rp, options);

  const webauthn = await resolveWebAuthn(options);
  const verification = await webauthn.verifyRegistrationResponse({
    response,
    expectedChallenge: stored.challenge,
    expectedOrigin: stored.origin,
    expectedRPID: stored.rpID,
    requireUserVerification: true,
  });
  if (!verification?.verified || !verification?.registrationInfo) throw new Error('rudi-passkey-registration-failed');

  const info = verification.registrationInfo;
  const credential = info.credential;
  const now = new Date(options.now || Date.now()).toISOString();
  const next = {
    actor: safeActor,
    id: String(credential.id || ''),
    publicKey: encodeBytes(credential.publicKey),
    counter: Number(credential.counter || 0),
    transports: Array.isArray(credential.transports) ? credential.transports : [],
    deviceType: String(info.credentialDeviceType || ''),
    backedUp: Boolean(info.credentialBackedUp),
    rpID: stored.rpID,
    createdAt: now,
    updatedAt: now,
  };
  if (!next.id || !next.publicKey) throw new Error('rudi-passkey-registration-invalid');

  const existing = await readPasskeys(safeActor, options);
  const merged = [...existing.filter(row => row.id !== next.id), next];
  await writePasskeys(safeActor, merged, options);
  return { actor: safeActor, configured: true, credentialId: next.id, passkeys: merged };
}

async function authenticationOptions(req, options = {}) {
  const rp = requestOrigin(req);
  const rows = [];
  for (const actor of ['Рустам','Диана']) {
    const actorRows = await readPasskeys(actor, options);
    for (const row of actorRows) if (row.rpID === rp.rpID) rows.push(row);
  }
  if (!rows.length) throw new Error('rudi-passkey-not-configured');

  const webauthn = await resolveWebAuthn(options);
  const result = await webauthn.generateAuthenticationOptions({
    rpID: rp.rpID,
    allowCredentials: rows.map(row => ({ id: row.id, transports: row.transports })),
    userVerification: 'required',
  });
  result.challenge = createChallengeToken('authenticate', 'any', rp, options);
  return result;
}

async function findPasskeyById(id, rpID, options = {}) {
  const credentialId = String(id || '').trim();
  if (!credentialId) return null;
  for (const actor of ['Рустам','Диана']) {
    const rows = await readPasskeys(actor, options);
    const found = rows.find(row => row.id === credentialId && row.rpID === rpID);
    if (found) return found;
  }
  return null;
}

async function verifyAuthentication(req, challenge, response, options = {}) {
  const rp = requestOrigin(req);
  const stored = consumeChallenge('authenticate', 'any', challenge, rp, options);

  const passkey = await findPasskeyById(response?.id, stored.rpID, options);
  if (!passkey) throw new Error('rudi-passkey-credential-not-found');

  const webauthn = await resolveWebAuthn(options);
  const verification = await webauthn.verifyAuthenticationResponse({
    response,
    expectedChallenge: stored.challenge,
    expectedOrigin: stored.origin,
    expectedRPID: stored.rpID,
    credential: {
      id: passkey.id,
      publicKey: decodeBytes(passkey.publicKey),
      counter: passkey.counter,
      transports: passkey.transports,
    },
    requireUserVerification: true,
  });
  if (!verification?.verified) throw new Error('rudi-passkey-authentication-failed');

  const actorRows = await readPasskeys(passkey.actor, options);
  const now = new Date(options.now || Date.now()).toISOString();
  const nextRows = actorRows.map(row => row.id === passkey.id
    ? { ...row, counter: Number(verification.authenticationInfo?.newCounter || row.counter || 0), updatedAt: now }
    : row
  );
  await writePasskeys(passkey.actor, nextRows, options);
  return { actor: passkey.actor, credentialId: passkey.id, passkeys: nextRows };
}

module.exports = {
  requestOrigin,
  createChallengeToken,
  consumeChallenge,
  encodeBytes,
  decodeBytes,
  readPasskeys,
  restorePasskeys,
  passkeyStatus,
  registrationOptions,
  verifyRegistration,
  authenticationOptions,
  verifyAuthentication,
};
