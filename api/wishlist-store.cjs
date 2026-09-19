const crypto = require('node:crypto');
const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const NAMESPACE = 'rudi-wishlist-v1';
const STATE_KEY = 'wishlist';
const TTL_SECONDS = 60 * 60 * 24 * 3650;
const MAX_ITEMS = 120;
const MAX_TEXT = 180;

function cacheOf(options = {}) {
  return options.cache || createStrictRuntimeCache({ namespace: NAMESPACE, ...(options.cacheOptions || {}) });
}

function normalizeState(value) {
  const items = Array.isArray(value?.items) ? value.items : [];
  return {
    version: Number(value?.version || 0),
    items: items
      .map((item) => ({
        id: String(item?.id || ''),
        text: String(item?.text || '').trim().slice(0, MAX_TEXT),
        owner: item?.owner === 'Диана' ? 'Диана' : 'Рустам',
        done: Boolean(item?.done),
        createdAt: String(item?.createdAt || ''),
        updatedAt: String(item?.updatedAt || item?.createdAt || ''),
      }))
      .filter((item) => item.id && item.text)
      .slice(0, MAX_ITEMS),
  };
}

async function readWishlist(options = {}) {
  return normalizeState(await cacheOf(options).get(STATE_KEY));
}

async function writeWishlist(state, options = {}) {
  const next = normalizeState({ ...state, version: Date.now() });
  await cacheOf(options).set(STATE_KEY, next, { ttl: TTL_SECONDS, tags: ['rudi-wishlist'] });
  return next;
}

function normalizeWishText(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) throw new Error('wishlist-text-empty');
  if (text.length > MAX_TEXT) throw new Error('wishlist-text-too-long');
  return text;
}

async function addWish(text, owner, options = {}) {
  const state = await readWishlist(options);
  if (state.items.length >= MAX_ITEMS) throw new Error('wishlist-full');
  const now = new Date(options.now || Date.now()).toISOString();
  const item = {
    id: crypto.randomUUID(),
    text: normalizeWishText(text),
    owner,
    done: false,
    createdAt: now,
    updatedAt: now,
  };
  state.items.unshift(item);
  return { state: await writeWishlist(state, options), item };
}

async function toggleWish(id, options = {}) {
  const state = await readWishlist(options);
  const item = state.items.find((row) => row.id === String(id || ''));
  if (!item) throw new Error('wishlist-item-not-found');
  item.done = !item.done;
  item.updatedAt = new Date(options.now || Date.now()).toISOString();
  return { state: await writeWishlist(state, options), item };
}

async function removeWish(id, options = {}) {
  const state = await readWishlist(options);
  const before = state.items.length;
  state.items = state.items.filter((row) => row.id !== String(id || ''));
  if (state.items.length === before) throw new Error('wishlist-item-not-found');
  return writeWishlist(state, options);
}

module.exports = {
  NAMESPACE, MAX_ITEMS, MAX_TEXT,
  readWishlist, writeWishlist, normalizeWishText,
  addWish, toggleWish, removeWish,
};
