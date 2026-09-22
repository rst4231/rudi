const crypto = require('node:crypto');
const { resolveTelegramBotToken } = require('./products-bought.cjs');

const DATA_API_AUDIENCE = 'rudi-data-api';
const DATA_API_ROLE = 'rudi_api';
const KEY_ID = 'rudi-data-api-v1';

function b64url(value) {
  return Buffer.from(value).toString('base64url');
}

function derivePrivateScalar(secret) {
  const token = String(secret || '').trim();
  if (!token) throw new Error('telegram-auth-required');
  let candidate = crypto.createHmac('sha256', token).update('rudi-data-api-es256-v1').digest();
  for (let index = 0; index < 16; index += 1) {
    const ecdh = crypto.createECDH('prime256v1');
    try {
      ecdh.setPrivateKey(candidate);
      return candidate;
    } catch {
      candidate = crypto.createHash('sha256').update(candidate).update(Buffer.from([index + 1])).digest();
    }
  }
  throw new Error('rudi-data-api-key-invalid');
}

function keyMaterial(secret) {
  const privateScalar = derivePrivateScalar(secret);
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(privateScalar);
  const publicPoint = ecdh.getPublicKey(null, 'uncompressed');
  if (publicPoint.length !== 65 || publicPoint[0] !== 4) throw new Error('rudi-data-api-key-invalid');

  const privateJwk = {
    kty: 'EC',
    crv: 'P-256',
    x: publicPoint.subarray(1, 33).toString('base64url'),
    y: publicPoint.subarray(33, 65).toString('base64url'),
    d: privateScalar.toString('base64url'),
  };
  const privateKey = crypto.createPrivateKey({ key: privateJwk, format: 'jwk' });
  const publicKey = crypto.createPublicKey(privateKey);
  const exported = publicKey.export({ format: 'jwk' });
  const publicJwk = {
    kty: exported.kty,
    crv: exported.crv,
    x: exported.x,
    y: exported.y,
    use: 'sig',
    alg: 'ES256',
    kid: KEY_ID,
  };
  return { privateKey, publicKey, publicJwk };
}

function resolveSigningSecret(options = {}) {
  return options.botToken || resolveTelegramBotToken(options.env || process.env);
}

function publicJwks(options = {}) {
  return { keys: [keyMaterial(resolveSigningSecret(options)).publicJwk] };
}

function signDataApiJwt(options = {}) {
  const secret = resolveSigningSecret(options);
  const now = Math.floor(Number(options.now || Date.now()) / 1000);
  const lifetime = Math.min(600, Math.max(60, Number(options.lifetimeSeconds || 300)));
  const header = { alg: 'ES256', typ: 'JWT', kid: KEY_ID };
  const payload = {
    sub: 'rudi-server',
    role: DATA_API_ROLE,
    aud: DATA_API_AUDIENCE,
    iat: now,
    exp: now + lifetime,
  };
  const encodedHeader = b64url(JSON.stringify(header));
  const encodedPayload = b64url(JSON.stringify(payload));
  const signingInput = encodedHeader + '.' + encodedPayload;
  const signature = crypto.sign('sha256', Buffer.from(signingInput), {
    key: keyMaterial(secret).privateKey,
    dsaEncoding: 'ieee-p1363',
  });
  return signingInput + '.' + signature.toString('base64url');
}

module.exports = {
  DATA_API_AUDIENCE,
  DATA_API_ROLE,
  KEY_ID,
  derivePrivateScalar,
  keyMaterial,
  publicJwks,
  signDataApiJwt,
};
