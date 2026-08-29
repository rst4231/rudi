const {
  loadClientsAdviceConfig,
  selectAdviceForDate,
  formatClientsAdvice,
  rewriteClientsPreviewPayloadWithAdvice,
} = require('./clients-advice.cjs');
const { resolvePreviewDate } = require('./preview-date.cjs');

async function runPreview(req, res, options = {}) {
  const handler = options.handler || require('./index.js');
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const requestedDate = resolvePreviewDate(req?.query?.date || 'today', now);
  const config = await loadClientsAdviceConfig({
    fetchImpl: options.fetchImpl || globalThis.fetch,
    configUrl: options.configUrl,
    localConfig: options.localConfig,
  });
  const advice = formatClientsAdvice(selectAdviceForDate(config, now));

  const originalJson = typeof res?.json === 'function' ? res.json.bind(res) : null;
  if (originalJson) {
    res.json = (payload) => {
      const rewritten = rewriteClientsPreviewPayloadWithAdvice(payload, advice);
      const warnings = Array.isArray(rewritten?.warnings) ? [...rewritten.warnings] : [];
      if (rewritten?.date && rewritten.date !== requestedDate) {
        warnings.push({ code: 'runtime-date-mismatch', expected: requestedDate, actual: rewritten.date });
      }
      return originalJson({
        ...rewritten,
        requestedDate,
        generatedAt: now.toISOString(),
        warnings,
      });
    };
  }
  req.query = { ...(req.query || {}), route: 'preview', date: requestedDate };
  try {
    return await handler(req, res);
  } finally {
    if (originalJson) res.json = originalJson;
  }
}

module.exports = (req, res) => runPreview(req, res);
module.exports.runPreview = runPreview;
