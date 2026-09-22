const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const NAMESPACE = 'rudi-car-state-v1';
const KEY = 'changan-univ-2023';
const TTL_SECONDS = 60 * 60 * 24 * 3650;

function getCarCache(options = {}) {
  return options.cache || createStrictRuntimeCache({ namespace: NAMESPACE });
}

function normalizeMileage(value) {
  const mileage = Number(value);
  if (!Number.isInteger(mileage) || mileage < 0 || mileage > 999999) return null;
  return mileage;
}

function normalizeState(value) {
  const mileage = normalizeMileage(value?.mileage);
  return {
    mileage,
    updatedAt: mileage == null ? '' : String(value?.updatedAt || ''),
  };
}

async function readCarState(options = {}) {
  const cache = getCarCache(options);
  return normalizeState(await cache.get(KEY));
}

async function writeMileage(mileage, options = {}) {
  const normalized = normalizeMileage(mileage);
  if (normalized == null) throw new Error('car-mileage-invalid');
  const cache = getCarCache(options);
  const state = {
    mileage: normalized,
    updatedAt: new Date(options.now || Date.now()).toISOString(),
  };
  await cache.set(KEY, state, {
    ttl: TTL_SECONDS,
    tags: ['rudi-car-state'],
    name: KEY,
  });
  return state;
}

module.exports = {
  NAMESPACE,
  KEY,
  TTL_SECONDS,
  normalizeMileage,
  normalizeState,
  readCarState,
  writeMileage,
};
