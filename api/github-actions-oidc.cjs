const crypto = require('node:crypto');

const ISSUER = 'https://token.actions.githubusercontent.com';
const AUDIENCE = 'rudi-lulu-toilet';
const REPOSITORY = 'rst4231/rudi';
const WORKFLOW_REF = 'rst4231/rudi/.github/workflows/lulu-toilet-alert.yml@refs/heads/main';
const JWKS_URL = ISSUER + '/.well-known/jwks';

let cachedJwks = null;
let cachedJwksExpiresAt = 0;

function decodeJson(segment) {
  try { return JSON.parse(Buffer.from(String(segment || ''), 'base64url').toString('utf8')); }
  catch { return null; }
}

async function loadJwks(options = {}) {
  if (options.jwks) return options.jwks;
  const now = Number(options.now || Date.now());
  if (cachedJwks && cachedJwksExpiresAt > now) return cachedJwks;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const response = await fetchImpl(JWKS_URL, { cache: 'no-store' });
  if (!response?.ok) throw new Error('github-oidc-jwks-unavailable');
  const jwks = await response.json();
  if (!Array.isArray(jwks?.keys)) throw new Error('github-oidc-jwks-invalid');
  cachedJwks = jwks;
  cachedJwksExpiresAt = now + 6 * 60 * 60 * 1000;
  return jwks;
}

function audienceMatches(aud) {
  return Array.isArray(aud) ? aud.includes(AUDIENCE) : String(aud || '') === AUDIENCE;
}

async function verifyGitHubActionsToken(token, options = {}) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const [headerPart, payloadPart, signaturePart] = parts;
  const header = decodeJson(headerPart);
  const payload = decodeJson(payloadPart);
  if (!header || !payload || header.alg !== 'RS256' || !header.kid) return null;

  const nowSeconds = Math.floor(Number(options.now || Date.now()) / 1000);
  if (payload.iss !== ISSUER || !audienceMatches(payload.aud)) return null;
  if (payload.repository !== REPOSITORY || payload.ref !== 'refs/heads/main') return null;
  if (!['schedule', 'workflow_dispatch'].includes(String(payload.event_name || ''))) return null;
  if (String(payload.workflow_ref || '') !== WORKFLOW_REF) return null;
  if (!Number.isFinite(Number(payload.exp)) || Number(payload.exp) < nowSeconds - 5) return null;
  if (Number.isFinite(Number(payload.nbf)) && Number(payload.nbf) > nowSeconds + 30) return null;
  if (Number.isFinite(Number(payload.iat)) && Number(payload.iat) > nowSeconds + 60) return null;

  const jwks = await loadJwks(options);
  const jwk = jwks.keys.find((key) => key?.kid === header.kid && key?.kty === 'RSA');
  if (!jwk) return null;

  try {
    const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    const valid = crypto.verify(
      'RSA-SHA256',
      Buffer.from(headerPart + '.' + payloadPart),
      key,
      Buffer.from(signaturePart, 'base64url')
    );
    return valid ? payload : null;
  } catch {
    return null;
  }
}

async function isGitHubActionsRequestAuthorized(req, options = {}) {
  const raw = String(req?.headers?.authorization || req?.headers?.Authorization || '');
  const match = raw.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  return Boolean(await verifyGitHubActionsToken(match[1], options));
}

function resetJwksCacheForTests() {
  cachedJwks = null;
  cachedJwksExpiresAt = 0;
}

module.exports = {
  ISSUER,
  AUDIENCE,
  REPOSITORY,
  WORKFLOW_REF,
  verifyGitHubActionsToken,
  isGitHubActionsRequestAuthorized,
  resetJwksCacheForTests,
};
