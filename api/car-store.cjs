const crypto = require('node:crypto');
const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');
const { readAppState, writeAppState } = require('./rudi-auth-db.cjs');

const NAMESPACE = 'rudi-car-state-v1';
const KEY = 'changan-univ-2023';
const TTL_SECONDS = 60 * 60 * 24 * 3650;
const MAX_ERRORS = 50;
const MAX_REPAIR_ARCHIVE = 100;
const MAX_NOTES = 100;
const MAX_MILEAGE_HISTORY = 180;
const NOTE_TEXT_MAX = 3000;
const ERROR_TITLE_MAX = 80;
const ERROR_COMMENT_MAX = 500;
const REPAIR_COST_MAX = 99999999;
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
  return state.mileage != null
    || state.errors.length > 0
    || state.repairArchive.length > 0
    || state.notes.length > 0
    || state.mileageHistory.length > 0
    || Boolean(state.tyreSeasonInstalled)
    || Boolean(state.lastServiceAt)
    || Boolean(state.updatedAt);
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

function normalizeDateKey(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const date = new Date(raw + 'T12:00:00Z');
  if (!Number.isFinite(date.getTime())) return '';
  return date.toISOString().slice(0,10) === raw ? raw : '';
}

function normalizeTyreSeason(value) {
  const season = String(value || '').trim().toLowerCase();
  return season === 'summer' || season === 'winter' ? season : '';
}

function normalizeMileagePoint(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const mileage = normalizeMileage(value.mileage);
  const at = normalizeIso(value.at || value.createdAt || value.updatedAt);
  if (mileage == null || !at) return null;
  return { mileage, at };
}

function normalizeMileageHistory(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value
    .map(normalizeMileagePoint)
    .filter(Boolean)
    .filter((row) => {
      const key = row.mileage + ':' + row.at;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a,b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0))
    .slice(0, MAX_MILEAGE_HISTORY);
}

function normalizeErrorId(value) {
  const id = String(value || '').trim();
  return /^[A-Za-z0-9_-]{8,100}$/.test(id) ? id : '';
}

function normalizeRepairCost(value) {
  if (value === '' || value == null) return null;
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount < 0 || amount > REPAIR_COST_MAX) return null;
  return amount;
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
      const repairCost = normalizeRepairCost(item?.repairCost);
      return base && repairedAt ? { ...base, repairedAt, repairCost } : null;
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

function normalizeCarNote(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = normalizeErrorId(value.id);
  const text = String(value.text || '').trim().slice(0, NOTE_TEXT_MAX);
  const createdAt = normalizeIso(value.createdAt);
  if (!id || !text || !createdAt) return null;
  return { id, text, createdAt };
}

function normalizeNotes(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value
    .map(normalizeCarNote)
    .filter(Boolean)
    .filter(note => {
      if (seen.has(note.id)) return false;
      seen.add(note.id);
      return true;
    })
    .sort((a,b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0))
    .slice(0, MAX_NOTES);
}

function normalizeState(value) {
  const mileage = normalizeMileage(value?.mileage);
  const legacyUpdatedAt = normalizeIso(value?.updatedAt);
  const mileageUpdatedAt = mileage == null
    ? ''
    : (normalizeIso(value?.mileageUpdatedAt) || legacyUpdatedAt);
  const errors = normalizeErrors(value?.errors);
  const repairArchive = normalizeRepairArchive(value?.repairArchive);
  const notes = normalizeNotes(value?.notes);
  const mileageHistory = normalizeMileageHistory(value?.mileageHistory);
  const tyreSeasonInstalled = normalizeTyreSeason(value?.tyreSeasonInstalled);
  const lastServiceAt = normalizeDateKey(value?.lastServiceAt);
  const updatedAt = legacyUpdatedAt
    || mileageUpdatedAt
    || mileageHistory[0]?.at
    || errors[0]?.createdAt
    || repairArchive[0]?.repairedAt
    || notes[0]?.createdAt
    || '';
  return {
    mileage,
    mileageUpdatedAt,
    mileageHistory,
    tyreSeasonInstalled,
    lastServiceAt,
    errors,
    repairArchive,
    notes,
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

function cleanRepairCost(value) {
  if (value === '' || value == null) return null;
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount < 0 || amount > REPAIR_COST_MAX) {
    throw new Error('car-repair-cost-invalid');
  }
  return amount;
}

async function writeMileage(mileage, options = {}) {
  const normalized = normalizeMileage(mileage);
  if (normalized == null) throw new Error('car-mileage-invalid');
  const current = await readCarState(options);
  const nowIso = new Date(options.now || Date.now()).toISOString();
  const history = [...current.mileageHistory];
  if (
    current.mileage != null
    && current.mileageUpdatedAt
    && !history.some((row) => row.mileage === current.mileage && row.at === current.mileageUpdatedAt)
  ) {
    history.push({ mileage:current.mileage, at:current.mileageUpdatedAt });
  }
  if (
    current.mileage !== normalized
    || !history.some((row) => row.mileage === normalized)
  ) {
    history.push({ mileage:normalized, at:nowIso });
  }
  return writeCarState({
    ...current,
    mileage:normalized,
    mileageUpdatedAt:nowIso,
    mileageHistory:history,
    updatedAt:nowIso,
  },options);
}

async function setTyreSeasonInstalled(value, options = {}) {
  const season = normalizeTyreSeason(value);
  if (!season) throw new Error('car-tyre-season-invalid');
  const current = await readCarState(options);
  const nowIso = new Date(options.now || Date.now()).toISOString();
  return writeCarState({
    ...current,
    tyreSeasonInstalled:season,
    updatedAt:nowIso,
  },options);
}

async function setLastServiceAt(value, options = {}) {
  const raw = String(value || '').trim();
  const lastServiceAt = raw ? normalizeDateKey(raw) : '';
  if (raw && !lastServiceAt) throw new Error('car-service-date-invalid');
  const current = await readCarState(options);
  const nowIso = new Date(options.now || Date.now()).toISOString();
  return writeCarState({
    ...current,
    lastServiceAt,
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
  const repairCost = cleanRepairCost(options.repairCost);
  const current = await readCarState(options);
  const repaired = current.errors.find(row => row.id === id);
  if (!repaired) throw new Error('car-error-not-found');
  const nowIso = new Date(options.now || Date.now()).toISOString();
  const archived = { ...repaired, repairedAt:nowIso, repairCost };
  const state = await writeCarState({
    ...current,
    errors:current.errors.filter(row => row.id !== id),
    repairArchive:[archived,...current.repairArchive],
    updatedAt:nowIso,
  },options);
  return { state, repaired:archived };
}

async function removeRepairArchiveEntry(errorId, options = {}) {
  const id = normalizeErrorId(errorId);
  if (!id) throw new Error('car-repair-archive-invalid');
  const current = await readCarState(options);
  const removed = current.repairArchive.find(row => row.id === id);
  if (!removed) throw new Error('car-repair-archive-not-found');
  const nowIso = new Date(options.now || Date.now()).toISOString();
  const state = await writeCarState({
    ...current,
    repairArchive:current.repairArchive.filter(row => row.id !== id),
    updatedAt:nowIso,
  },options);
  return { state, removed };
}

async function removeMileageHistoryEntry(value, options = {}) {
  const mileage = normalizeMileage(value?.mileage);
  const at = normalizeIso(value?.at);
  if (mileage == null || !at) throw new Error('car-mileage-history-invalid');
  const current = await readCarState(options);
  const index = current.mileageHistory.findIndex(row => row.mileage === mileage && row.at === at);
  if (index < 0) throw new Error('car-mileage-history-not-found');
  const removed = current.mileageHistory[index];
  const nowIso = new Date(options.now || Date.now()).toISOString();
  const state = await writeCarState({
    ...current,
    mileageHistory:current.mileageHistory.filter((_, rowIndex) => rowIndex !== index),
    updatedAt:nowIso,
  },options);
  return { state, removed };
}

async function addCarNote(text, options = {}) {
  const value = String(text || '').trim();
  if (!value || value.length > NOTE_TEXT_MAX) throw new Error('car-note-invalid');
  const current = await readCarState(options);
  const nowIso = new Date(options.now || Date.now()).toISOString();
  const note = {
    id:'note_' + crypto.randomUUID().replace(/-/g,''),
    text:value,
    createdAt:nowIso,
  };
  const state = await writeCarState({
    ...current,
    notes:[note,...current.notes],
    updatedAt:nowIso,
  },options);
  return { state, note };
}

async function removeCarNote(noteId, options = {}) {
  const id = normalizeErrorId(noteId);
  if (!id) throw new Error('car-note-invalid');
  const current = await readCarState(options);
  const note = current.notes.find(row => row.id === id);
  if (!note) throw new Error('car-note-not-found');
  const nowIso = new Date(options.now || Date.now()).toISOString();
  const state = await writeCarState({
    ...current,
    notes:current.notes.filter(row => row.id !== id),
    updatedAt:nowIso,
  },options);
  return { state, note };
}

async function restoreCarNote(value, options = {}) {
  const note = normalizeCarNote(value);
  if (!note) throw new Error('car-note-invalid');
  const current = await readCarState(options);
  if (current.notes.some(row => row.id === note.id)) return { state:current, note, restored:false };
  const nowIso = new Date(options.now || Date.now()).toISOString();
  const state = await writeCarState({
    ...current,
    notes:[note,...current.notes],
    updatedAt:nowIso,
  },options);
  return { state, note, restored:true };
}

async function restoreCarState(value, options = {}) {
  const incoming = normalizeState(value);
  if (!hasStoredState(incoming)) return readCarState(options);
  const current = await readCarState(options);
  const currentTime = Date.parse(String(current.updatedAt || '')) || 0;
  const incomingTime = Date.parse(String(incoming.updatedAt || '')) || 0;
  const currentHasData = hasStoredState(current);
  if (currentHasData && currentTime >= incomingTime) return current;
  return writeCarState(incoming,options);
}

module.exports = {
  NAMESPACE,
  KEY,
  TTL_SECONDS,
  MAX_ERRORS,
  MAX_REPAIR_ARCHIVE,
  MAX_NOTES,
  MAX_MILEAGE_HISTORY,
  NOTE_TEXT_MAX,
  ERROR_TITLE_MAX,
  ERROR_COMMENT_MAX,
  REPAIR_COST_MAX,
  DB_ACTOR,
  DB_KEY,
  normalizeMileage,
  normalizeRepairCost,
  normalizeDateKey,
  normalizeTyreSeason,
  normalizeMileagePoint,
  normalizeMileageHistory,
  normalizeCarError,
  normalizeErrors,
  normalizeRepairArchive,
  normalizeCarNote,
  normalizeNotes,
  normalizeState,
  readCarState,
  writeCarState,
  writeMileage,
  setTyreSeasonInstalled,
  setLastServiceAt,
  addCarError,
  removeCarError,
  repairCarError,
  removeRepairArchiveEntry,
  removeMileageHistoryEntry,
  addCarNote,
  removeCarNote,
  restoreCarNote,
  restoreCarState,
};
