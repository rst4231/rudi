const crypto = require('node:crypto');
const { resolveTelegramBotToken } = require('./products-bought.cjs');
const { readPartnerMessage, writePartnerMessage } = require('./partner-message-store.cjs');
const { readToken, saveToken } = require('./ticktick-store.cjs');
const { readCalendarUrl, saveCalendarUrl } = require('./work-calendar.cjs');
const { readWishlist, writeWishlist } = require('./wishlist-store.cjs');
const { readProductList, readProductListRaw, restoreProductListSnapshot } = require('./product-list-store.cjs');
const { readRecipients, saveRecipient } = require('./partner-notification-store.cjs');
const { readAlbumConfig, saveAlbumConfig } = require('./shared-album.cjs');

const BACKUP_VERSION = 1;
const BACKUP_PREFIX = 'rudi-state-v1';
const MAX_BACKUP_BYTES = 2 * 1024 * 1024;

function encryptionKey(options = {}) {
  const token = options.botToken || resolveTelegramBotToken(options.env || process.env);
  return crypto.createHash('sha256').update(BACKUP_PREFIX + '\0' + String(token || '')).digest();
}

function sealSnapshot(snapshot, options = {}) {
  const raw = Buffer.from(JSON.stringify(snapshot || {}), 'utf8');
  if (!raw.length || raw.length > MAX_BACKUP_BYTES) throw new Error('rudi-backup-too-large');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(options), iv);
  const ciphertext = Buffer.concat([cipher.update(raw), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    BACKUP_PREFIX,
    iv.toString('base64url'),
    ciphertext.toString('base64url'),
    tag.toString('base64url'),
  ].join('.');
}

function openSnapshot(token, options = {}) {
  const value = String(token || '').trim();
  if (!value) return null;
  const parts = value.split('.');
  if (parts.length !== 4 || parts[0] !== BACKUP_PREFIX) throw new Error('rudi-backup-invalid');
  const iv = Buffer.from(parts[1], 'base64url');
  const ciphertext = Buffer.from(parts[2], 'base64url');
  const tag = Buffer.from(parts[3], 'base64url');
  if (iv.length !== 12 || tag.length !== 16 || !ciphertext.length || ciphertext.length > MAX_BACKUP_BYTES) {
    throw new Error('rudi-backup-invalid');
  }
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(options), iv);
    decipher.setAuthTag(tag);
    const raw = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const parsed = JSON.parse(raw.toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Number(parsed.version) !== BACKUP_VERSION) {
      throw new Error('rudi-backup-invalid');
    }
    return parsed;
  } catch (error) {
    if (String(error?.message || error) === 'rudi-backup-invalid') throw error;
    throw new Error('rudi-backup-invalid');
  }
}

async function safeRead(task, fallback = null) {
  try { return await task(); } catch { return fallback; }
}

async function createStateSnapshot(options = {}) {
  const [partnerMessage, ticktickToken, calendarUrl, wishlist, products, recipients, albumConfig] = await Promise.all([
    safeRead(() => readPartnerMessage(options)),
    safeRead(() => readToken(options)),
    safeRead(() => readCalendarUrl(options), ''),
    safeRead(() => readWishlist(options), { initialized: false, version: 0, items: [] }),
    safeRead(() => readProductList(options), { initialized: false, version: 0, items: [], history: [] }),
    safeRead(() => readRecipients(options)),
    safeRead(() => readAlbumConfig(options)),
  ]);

  return {
    version: BACKUP_VERSION,
    createdAt: new Date(options.now || Date.now()).toISOString(),
    partnerMessage,
    ticktickToken,
    calendarUrl: String(calendarUrl || ''),
    wishlist,
    products,
    recipients,
    albumConfig,
  };
}

async function createStateBackup(options = {}) {
  return sealSnapshot(await createStateSnapshot(options), options);
}

async function restoreStateBackup(token, options = {}) {
  const snapshot = openSnapshot(token, options);
  if (!snapshot) return { restored: [] };
  const restored = [];

  const currentMessage = await safeRead(() => readPartnerMessage(options));
  if (!currentMessage && snapshot.partnerMessage) {
    await writePartnerMessage(snapshot.partnerMessage, options);
    restored.push('partner-message');
  }

  const currentToken = await safeRead(() => readToken(options));
  if (!currentToken?.accessToken && snapshot.ticktickToken?.accessToken) {
    await saveToken(snapshot.ticktickToken, options);
    restored.push('ticktick');
  }

  const currentCalendar = await safeRead(() => readCalendarUrl(options), '');
  if (!currentCalendar && snapshot.calendarUrl) {
    await saveCalendarUrl(snapshot.calendarUrl, options);
    restored.push('calendar');
  }

  const currentWishlist = await safeRead(() => readWishlist(options), { initialized: false, items: [] });
  if (!currentWishlist?.initialized && snapshot.wishlist?.initialized) {
    await writeWishlist(snapshot.wishlist, options);
    restored.push('wishlist');
  }

  const currentProducts = await safeRead(() => readProductListRaw(options), { initialized: false, items: [], history: [] });
  if (!currentProducts?.initialized && snapshot.products?.initialized) {
    await restoreProductListSnapshot(snapshot.products, options);
    restored.push('products');
  }

  const currentRecipients = await safeRead(() => readRecipients(options), null);
  for (const actor of ['Рустам', 'Диана']) {
    const existing = Number(currentRecipients?.[actor]);
    const saved = Number(snapshot.recipients?.[actor]);
    if ((!Number.isInteger(existing) || existing <= 0) && Number.isInteger(saved) && saved > 0) {
      await saveRecipient(actor, saved, options);
      restored.push('recipient:' + actor);
    }
  }

  const currentAlbum = await safeRead(() => readAlbumConfig(options), null);
  if (!currentAlbum && snapshot.albumConfig?.url && snapshot.albumConfig?.token) {
    await saveAlbumConfig(snapshot.albumConfig, options);
    restored.push('shared-album');
  }

  return { restored };
}

module.exports = {
  BACKUP_VERSION,
  BACKUP_PREFIX,
  MAX_BACKUP_BYTES,
  sealSnapshot,
  openSnapshot,
  createStateSnapshot,
  createStateBackup,
  restoreStateBackup,
};
