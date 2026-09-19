const crypto = require('node:crypto');
const { saveOAuthState } = require('../ticktick-store.cjs');
const { getCredentials, credentialsConfigured, buildAuthorizeUrl } = require('../ticktick-client.cjs');

module.exports = async function handler(req, res) {
  res.setHeader?.('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  if (!credentialsConfigured(process.env)) {
    return res.status(503).json({ ok: false, error: 'ticktick-not-configured' });
  }

  const state = crypto.randomBytes(24).toString('base64url');
  await saveOAuthState(state);
  const { clientId, redirectUri } = getCredentials(process.env);
  const url = buildAuthorizeUrl({ clientId, redirectUri, state });
  res.statusCode = 302;
  res.setHeader('Location', url);
  res.end();
};
