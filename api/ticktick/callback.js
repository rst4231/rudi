const { consumeOAuthState, saveToken } = require('../ticktick-store.cjs');
const { exchangeCode, credentialsConfigured } = require('../ticktick-client.cjs');

function redirect(res, value) {
  res.statusCode = 302;
  res.setHeader('Location', '/?ticktick=' + encodeURIComponent(value));
  res.end();
}

module.exports = async function handler(req, res) {
  res.setHeader?.('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');

  if (!credentialsConfigured(process.env)) return redirect(res, 'not-configured');

  const code = String(req.query?.code || '').trim();
  const state = String(req.query?.state || '').trim();
  if (!code || !state) return redirect(res, 'invalid-callback');

  try {
    const validState = await consumeOAuthState(state);
    if (!validState) return redirect(res, 'invalid-state');

    const token = await exchangeCode(code);
    await saveToken(token);
    return redirect(res, 'connected');
  } catch (error) {
    console.error('RUDI_TICKTICK_OAUTH_ERROR', String(error?.message || error));
    return redirect(res, 'error');
  }
};
