const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

function getTopicMaintenanceCache(options = {}) {
  return createStrictRuntimeCache({ namespace: 'rudi-topic-maintenance-v1', ...options });
}

function getDailyContentCache(options = {}) {
  return createStrictRuntimeCache({ namespace: 'rudi-daily-content-v1', confirmWrites: false, ...options });
}

function getLaborCache(options = {}) {
  return createStrictRuntimeCache({ namespace: 'rudi-labor-code-v1', ...options });
}

function getLaborLeaseCache(options = {}) {
  return createStrictRuntimeCache({ namespace: 'rudi-labor-publication-lock-v1', ...options });
}

function getRecoveryCache(options = {}) {
  return createStrictRuntimeCache({ namespace: 'rudi-one-time-recovery-v1', ...options });
}

function getCinemaPremieresCache(options = {}) {
  return createStrictRuntimeCache({ namespace: 'rudi-cinema-premieres-v1', ...options });
}

module.exports = {
  getTopicMaintenanceCache,
  getDailyContentCache,
  getLaborCache,
  getLaborLeaseCache,
  getRecoveryCache,
  getCinemaPremieresCache,
};
