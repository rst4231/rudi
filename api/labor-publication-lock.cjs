const { randomUUID } = require('node:crypto');

const CACHE_NAMESPACE = 'rudi-labor-publication-lock-v1';
const DEFAULT_LEASE_MS = 2 * 60 * 1000;
const DEFAULT_SETTLE_MS = 25;

function getLeaseCache() {
  const { getCache } = require('@vercel/functions');
  return getCache({ namespace: CACHE_NAMESPACE });
}

function moscowDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function sleep(ms) {
  if (!(ms > 0)) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function releaseLease(cache, key, owner) {
  try {
    const current = await cache.get(key);
    if (current?.owner === owner) await cache.delete(key);
  } catch (error) {
    console.warn('RUDI_LABOR_LEASE_RELEASE_ERROR', String(error?.message || error));
  }
}

async function withLaborPublicationLease(task, options = {}) {
  if (typeof task !== 'function') throw new TypeError('labor publication task must be a function');
  const cache = options.cache || getLeaseCache();
  const dateKey = options.dateKey || moscowDateKey(options.now || new Date());
  const leaseMs = Number.isFinite(options.leaseMs) ? Math.max(1000, options.leaseMs) : DEFAULT_LEASE_MS;
  const settleMs = Number.isFinite(options.settleMs) ? Math.max(0, options.settleMs) : DEFAULT_SETTLE_MS;
  const nowMs = options.now instanceof Date ? options.now.getTime() : Date.now();
  const key = `labor:publication-lease:${dateKey}`;
  const existing = await cache.get(key);
  if (existing?.expiresAt && Number(existing.expiresAt) > nowMs) return null;

  const owner = options.owner || randomUUID();
  const lease = { owner, expiresAt: nowMs + leaseMs };
  await cache.set(key, lease, {
    ttl: Math.max(1, Math.ceil(leaseMs / 1000)),
    tags: ['rudi-labor-publication-lock'],
  });

  await sleep(settleMs);
  const confirmed = await cache.get(key);
  if (confirmed?.owner !== owner) return null;

  try {
    return await task();
  } finally {
    await releaseLease(cache, key, owner);
  }
}

module.exports = {
  moscowDateKey,
  withLaborPublicationLease,
};
