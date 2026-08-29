const { getControlPlaneCache } = require('./stateful-cache.cjs');

const ALLOWED_STATUSES = new Set(['healthy', 'empty', 'stale', 'failed']);

function resolveCache(options = {}) {
  return options.cache || getControlPlaneCache(options.cacheOptions || {});
}

function sourceKey(sourceId) {
  const id = String(sourceId || '').trim();
  if (!id || id.length > 120 || !/^[a-z0-9:_-]+$/i.test(id)) throw new Error('Invalid source id');
  return `source:${id}:latest`;
}

function classifySourceResult(input = {}) {
  if (input.ok === false || input.error) return 'failed';
  if (input.stale) return 'stale';
  const itemCount = Math.max(0, Number(input.itemCount || 0));
  if (itemCount === 0) return 'empty';
  return 'healthy';
}

function sanitizeError(value, secrets = []) {
  if (!value) return null;
  let text = String(value?.message || value).slice(0, 3000);
  text = text.replace(/Authorization:\s*Bearer\s+[^\s]+/gi, 'Authorization: Bearer [REDACTED]');
  text = text.replace(/https:\/\/api\.telegram\.org\/bot[^/\s]+/gi, 'https://api.telegram.org/bot[REDACTED]');
  for (const secret of secrets || []) {
    const raw = String(secret || '');
    if (!raw) continue;
    text = text.split(raw).join('[REDACTED]');
  }
  return text;
}

function validRequestedDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error('requestedDate must be YYYY-MM-DD');
  return text;
}

async function recordSourceHealth(input, options = {}) {
  const sourceId = String(input?.sourceId || '').trim();
  sourceKey(sourceId);
  const status = input?.status || classifySourceResult(input);
  if (!ALLOWED_STATUSES.has(status)) throw new Error(`Invalid source health status: ${status}`);
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid source health timestamp');
  const itemCount = Math.max(0, Math.floor(Number(input?.itemCount || 0)));
  const record = {
    sourceId,
    checkedAt: now.toISOString(),
    requestedDate: validRequestedDate(input?.requestedDate),
    status,
    itemCount,
    error: status === 'failed' ? sanitizeError(input?.error || 'Source failed', options.secrets) : null,
    fallbackSource: input?.fallbackSource ? String(input.fallbackSource).slice(0, 120) : null,
    metadata: input?.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
      ? structuredClone(input.metadata)
      : {},
  };
  const cache = resolveCache(options);
  await cache.set(sourceKey(sourceId), record, {
    tags: ['rudi-source-health', `rudi-source-${sourceId}`],
    name: sourceKey(sourceId),
  });
  return structuredClone(record);
}

async function getSourceHealth(sourceId, options = {}) {
  return resolveCache(options).get(sourceKey(sourceId));
}

async function listSourceHealth(sourceIds, options = {}) {
  const ids = Array.isArray(sourceIds) ? sourceIds : [];
  const rows = await Promise.all(ids.map((sourceId) => getSourceHealth(sourceId, options)));
  return rows.filter(Boolean);
}

module.exports = {
  ALLOWED_STATUSES,
  classifySourceResult,
  sanitizeError,
  recordSourceHealth,
  getSourceHealth,
  listSourceHealth,
};
