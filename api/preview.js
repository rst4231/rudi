const {
  loadClientsAdviceConfig,
  selectAdviceForDate,
  formatClientsAdvice,
  rewriteClientsPreviewPayloadWithAdvice,
} = require('./clients-advice.cjs');

async function runPreview(req, res, options = {}) {
  const handler = options.handler || require('./index.js');
  const config = await loadClientsAdviceConfig({
    fetchImpl: options.fetchImpl || globalThis.fetch,
    configUrl: options.configUrl,
    localConfig: options.localConfig,
  });
  const advice = formatClientsAdvice(selectAdviceForDate(config, options.now || new Date()));

  const originalJson = typeof res?.json === 'function' ? res.json.bind(res) : null;
  if (originalJson) {
    res.json = (payload) => originalJson(rewriteClientsPreviewPayloadWithAdvice(payload, advice));
  }
  req.query = { ...(req.query || {}), route: 'preview' };
  try {
    return await handler(req, res);
  } finally {
    if (originalJson) res.json = originalJson;
  }
}

module.exports = (req, res) => runPreview(req, res);
module.exports.runPreview = runPreview;
