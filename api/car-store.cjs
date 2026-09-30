const crypto = require('node:crypto');
const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');
const { readAppState, writeAppState } = require('./rudi-auth-db.cjs');

const NAMESPACE = 'rudi-car-state-v1';
const KEY = 'changan-univ-2023';
const TTL_SECONDS = 60 * 60 * 24 * 3650;
const MAX_ERRORS = 50;
const MAX_REPAIR_ARCHIVE = 100;
const ERROR_TITLE_MAX = 80;
const ERROR_COMMENT_MAX = 500;
const DB_ACTOR = 'Рустам';
const DB_KEY = 'car:changan-univ-2023';

function getCarCache(options = {}) {
  return options.cache || createStrictRuntimeCache({ namespace: NAMESPACE });
}

function getCarDb(options = {}) {
  if (options.db && typeof options.db.read === 'function' && typeof options.db.write === 'function') {
    return options.db;
  }
  const dbOptions = options.dbOptions || {};
  return {
    read: () => readAppState(DB_ACTOR, DB_KEY, dbOptions),
    write: (value) => writeAppState(DB_ACTOR, DB_KEY, value, dbOptions),
  };
}

function hasStoredState(state) {
  return state.mileage != null || state.errors.length > 0 || state.repairArchive.length > 0 || Boolean(state.updatedAt);
}

async function cacheStateBestEffort(cache, state) {
  try {
    await cache.set(KEY,state,{
      ttl:TTL_SECONDS,
      tags:['rudi-car-state','rudi-durable-state'],
      name:KEY,
    });
  } catch {}
}

function normalizeMileage(value) {
  const mileage = Number(value);
  if (!Number.isInteger(mileage) || mileage < 0 || mileage > 999999) return null;
  return mileage;
}

function normalizeIso(value) {
  const time = Date.parse(String(value || ''));
  return Number.isFinite(time) ? new Date(time).toISOString() : '';
}

function normalizeErrorId(value) {
  const id = String(value || '').trim();
  return /^[A-Za-z0-9_-]{8,100}$/.test(id) ? id : '';
}

function normalizeCarError(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = normalizeErrorId(value.id);
  const title = String(value.title || '').trim().slice(0, ERROR_TITLE_MAX);
  const occurredAt = normalizeIso(value.occurredAt);
  if (!id || !title || !occurredAt) return null;
  return {
    id,
    title,
    occurredAt,
    comment:String(value.comment || '').trim().slice(0, ERROR_COMMENT_MAX),
    createdAt:normalizeIso(value.createdAt) || occurredAt,
  };
}

function normalizeErrors(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value
    .map(normalizeCarError)
    .filter(Boolean)
    .filter(row => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    })
    .sort((a,b) =>
      (Date.parse(b.occurredAt) || 0) - (Date.parse(a.occurredAt) || 0) ||
      (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)
    )
    .slice(0, MAX_ERRORS);
}

function normalizeRepairArchive(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value
    .map(item => {
      const base = normalizeCarError(item);
      const repairedAt = normalizeIso(item?.repairedAt);
      return base && repairedAt ? { ...base, repairedAt } : null;
    })
    .filter(Boolean)
    .filter(row => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    })
    .sort((a,b) => (Date.parse(b.repairedAt) || 0) - (Date.parse(a.repairedAt) || 0))
    .slice(0, MAX_REPAIR_ARCHIVE);
}

function normalizeState(value) {
  const mileage = normalizeMileage(value?.mileage);
  const legacyUpdatedAt = normalizeIso(value?.updatedAt);
  const mileageUpdatedAt = mileage == null
    ? ''
    : (normalizeIso(value?.mileageUpdatedAt) || legacyUpdatedAt);
  const errors = normalizeErrors(value?.errors);
  const repairArchive = normalizeRepairArchive(value?.repairArchive);
  const updatedAt = legacyUpdatedAt || mileageUpdatedAt || errors[0]?.createdAt || repairArchive[0]?.repairedAt || '';
  return {
    mileage,
    mileageUpdatedAt,
    errors,
    repairArchive,
    updatedAt,
  };
}

async function readCarState(options = {}) {
  const cache = getCarCache(options);
  const db = getCarDb(options);
  let durableError = null;

  try {
    const durable = normalizeState(await db.read());
    if (hasStoredState(durable)) {
      await cacheStateBestEffort(cache,durable);
      return durable;
    }
  } catch (error) {
    durableError = error;
  }

  const cached = normalizeState(await cache.get(KEY));
  if (hasStoredState(cached)) {
    try {
      const persisted = normalizeState(await db.write(cached));
      await cacheStateBestEffort(cache,persisted);
      return persisted;
    } catch (error) {
      if (durableError) throw durableError;
      throw error;
    }
  }

  if (durableError) throw durableError;
  return cached;
}

async function writeCarState(value, options = {}) {
  const state = normalizeState(value);
  const cache = getCarCache(options);
  const db = getCarDb(options);
  const persisted = normalizeState(await db.write(state));
  await cacheStateBestEffort(cache,persisted);
  return persisted;
}

function cleanErrorTitle(value) {
  const title = String(value || '').trim();
  if (!title || title.length > ERROR_TITLE_MAX) throw new Error('car-error-invalid');
  return title;
}

function cleanErrorComment(value) {
  const comment = String(value || '').trim();
  if (comment.length > ERROR_COMMENT_MAX) throw new Error('car-error-invalid');
  return comment;
}

function cleanOccurredAt(value) {
  const occurredAt = normalizeIso(value);
  if (!occurredAt) throw new Error('car-error-invalid');
  return occurredAt;
}

async function writeMileage(mileage, options = {}) {
  const normalized = normalizeMileage(mileage);
  if (normalized == null) throw new Error('car-mileage-invalid');
  const current = await readCarState(options);
  const nowIso = new Date(options.now || Date.now()).toISOString();
  return writeCarState({
    ...current,
    mileage:normalized,
    mileageUpdatedAt:nowIso,
    updatedAt:nowIso,
  },options);
}

async function addCarError(value, options = {}) {
  const current = await readCarState(options);
  const nowIso = new Date(options.now || Date.now()).toISOString();
  const error = {
    id:'err_' + crypto.randomUUID().replace(/-/g,''),
    title:cleanErrorTitle(value?.title),
    occurredAt:cleanOccurredAt(value?.occurredAt),
    comment:cleanErrorComment(value?.comment),
    createdAt:nowIso,
  };
  const state = await writeCarState({
    ...current,
    errors:[error,...current.errors],
    updatedAt:nowIso,
  },options);
  return { state, error };
}

async function removeCarError(errorId, options = {}) {
  const id = normalizeErrorId(errorId);
  if (!id) throw new Error('car-error-invalid');
  const current = await readCarState(options);
  const removed = current.errors.find(row => row.id === id);
  if (!removed) throw new Error('car-error-not-found');
  const nowIso = new Date(options.now || Date.now()).toISOString();
  const state = await writeCarState({
    ...current,
    errors:current.errors.filter(row => row.id !== id),
    updatedAt:nowIso,
  },options);
  return { state, removed };
}

async function repairCarError(errorId, options = {}) {
  const id = normalizeErrorId(errorId);
  if (!id) throw new Error('car-error-invalid');
  const current = await readCarState(options);
  const repaired = current.errors.find(row => row.id === id);
  if (!repaired) throw new Error('car-error-not-found');
  const nowIso = new Date(options.now || Date.now()).toISOString();
  const archived = { ...repaired, repairedAt:nowIso };
  const state = await writeCarState({
    ...current,
    errors:current.errors.filter(row => row.id !== id),
    repairArchive:[archived,...current.repairArchive],
    updatedAt:nowIso,
  },options);
  return { state, repaired:archived };
}

async function restoreCarState(value, options = {}) {
  const incoming = normalizeState(value);
  if (incoming.mileage == null && incoming.errors.length === 0 && incoming.repairArchive.length === 0) return readCarState(options);
  const current = await readCarState(options);
  const currentTime = Date.parse(String(current.updatedAt || '')) || 0;
  const incomingTime = Date.parse(String(incoming.updatedAt || '')) || 0;
  const currentHasData = current.mileage != null || current.errors.length > 0 || current.repairArchive.length > 0;
  if (currentHasData && currentTime >= incomingTime) return current;
  return writeCarState(incoming,options);
}

module.exports = {
  NAMESPACE,
  KEY,
  TTL_SECONDS,
  MAX_ERRORS,
  MAX_REPAIR_ARCHIVE,
  ERROR_TITLE_MAX,
  ERROR_COMMENT_MAX,
  DB_ACTOR,
  DB_KEY,
  normalizeMileage,
  normalizeCarError,
  normalizeErrors,
  normalizeRepairArchive,
  normalizeState,
  readCarState,
  writeCarState,
  writeMileage,
  addCarError,
  removeCarError,
  repairCarError,
  restoreCarState,
};
