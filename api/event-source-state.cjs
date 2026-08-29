const { recordSourceHealth } = require('./source-health.cjs');

async function recordEventSourceState(sourceId, dateKey, result, options = {}) {
  const fulfilled = result?.status === 'fulfilled';
  const itemCount = fulfilled && Array.isArray(result?.value) ? result.value.length : 0;
  const row = {
    sourceId: String(sourceId || ''),
    requestedDate: String(dateKey || ''),
    status: fulfilled ? (itemCount > 0 ? 'healthy' : 'empty') : 'failed',
    itemCount,
    error: fulfilled ? null : (result?.reason || 'Event source failed'),
  };
  const recordHealth = options.recordHealth || recordSourceHealth;
  return recordHealth(row, {
    cache: options.cache || options.controlCache,
    now: options.now,
    secrets: options.secrets,
  });
}

module.exports = { recordEventSourceState };