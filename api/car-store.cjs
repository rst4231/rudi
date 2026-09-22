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

async function writeCarState(value, options = {}) {
  const state=normalizeState(value);
  if(state.mileage==null) throw new Error('car-mileage-invalid');
  const cache=getCarCache(options);
  await cache.set(KEY,state,{
    ttl:TTL_SECONDS,
    tags:['rudi-car-state','rudi-durable-state'],
    name:KEY,
  });
  return state;
}

async function writeMileage(mileage, options = {}) {
  const normalized = normalizeMileage(mileage);
  if (normalized == null) throw new Error('car-mileage-invalid');
  return writeCarState({
    mileage:normalized,
    updatedAt:new Date(options.now || Date.now()).toISOString(),
  },options);
}

async function restoreCarState(value, options = {}) {
  const incoming=normalizeState(value);
  if(incoming.mileage==null) return readCarState(options);
  const current=await readCarState(options);
  const currentTime=Date.parse(String(current.updatedAt||''))||0;
  const incomingTime=Date.parse(String(incoming.updatedAt||''))||0;
  if(current.mileage!=null&&currentTime>=incomingTime) return current;
  return writeCarState(incoming,options);
}

module.exports = {
  NAMESPACE,
  KEY,
  TTL_SECONDS,
  normalizeMileage,
  normalizeState,
  readCarState,
  writeCarState,
  writeMileage,
  restoreCarState,
};
