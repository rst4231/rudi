const crypto = require('node:crypto');
const webpush = require('web-push');
const { readAppState, writeAppState } = require('./rudi-auth-db.cjs');
const { resolveTelegramBotToken } = require('./products-bought.cjs');

const ACTORS = new Set(['Рустам', 'Диана']);
const SUBSCRIPTIONS_KEY = 'push:subscriptions:v1';
const NOTIFICATIONS_KEY = 'push:notifications:v1';
const MAX_SUBSCRIPTIONS = 6;
const MAX_NOTIFICATIONS = 24;
const NOTIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const VAPID_SUBJECT = 'https://spb-daily-guide-bot.vercel.app';

function normalizeActor(value) {
  const actor = String(value || '').trim();
  return ACTORS.has(actor) ? actor : '';
}

function resolveSecret(options = {}) {
  return options.botToken || resolveTelegramBotToken(options.env || process.env);
}

function derivePrivateScalar(secret) {
  const token = String(secret || '').trim();
  if (!token) throw new Error('telegram-auth-required');
  let candidate = crypto.createHmac('sha256', token).update('rudi-web-push-v1').digest();
  for (let index = 0; index < 16; index += 1) {
    const ecdh = crypto.createECDH('prime256v1');
    try {
      ecdh.setPrivateKey(candidate);
      return candidate;
    } catch {
      candidate = crypto.createHash('sha256').update(candidate).update(Buffer.from([index + 1])).digest();
    }
  }
  throw new Error('rudi-web-push-key-invalid');
}

function vapidKeyMaterial(options = {}) {
  const privateScalar = derivePrivateScalar(resolveSecret(options));
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(privateScalar);
  const publicPoint = ecdh.getPublicKey(null, 'uncompressed');
  if (publicPoint.length !== 65 || publicPoint[0] !== 4) throw new Error('rudi-web-push-key-invalid');
  const privateJwk = {
    kty: 'EC',
    crv: 'P-256',
    x: publicPoint.subarray(1, 33).toString('base64url'),
    y: publicPoint.subarray(33, 65).toString('base64url'),
    d: privateScalar.toString('base64url'),
  };
  const privateKey = crypto.createPrivateKey({ key: privateJwk, format: 'jwk' });
  return {
    privateKey,
    privateKeyString: privateScalar.toString('base64url'),
    publicKey: publicPoint.toString('base64url'),
  };
}

function publicApplicationServerKey(options = {}) {
  return vapidKeyMaterial(options).publicKey;
}

function encodeJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function vapidAuthorization(endpoint, options = {}) {
  const url = new URL(String(endpoint || ''));
  const now = Math.floor(Number(options.now || Date.now()) / 1000);
  const header = encodeJson({ typ: 'JWT', alg: 'ES256' });
  const payload = encodeJson({
    aud: url.origin,
    exp: now + 12 * 60 * 60,
    sub: VAPID_SUBJECT,
  });
  const signingInput = header + '.' + payload;
  const material = vapidKeyMaterial(options);
  const signature = crypto.sign('sha256', Buffer.from(signingInput), {
    key: material.privateKey,
    dsaEncoding: 'ieee-p1363',
  }).toString('base64url');
  return {
    value: 'vapid t=' + signingInput + '.' + signature + ', k=' + material.publicKey,
    publicKey: material.publicKey,
  };
}

function hashDeviceToken(value) {
  const token=String(value||'').trim();
  return token ? crypto.createHash('sha256').update(token).digest('base64url') : '';
}

function normalizeSubscription(value) {
  const endpoint = String(value?.endpoint || '').trim();
  if (!/^https:\/\//i.test(endpoint) || endpoint.length > 4096) return null;
  const p256dh = String(value?.keys?.p256dh || '').trim();
  const auth = String(value?.keys?.auth || '').trim();
  return {
    id: crypto.createHash('sha256').update(endpoint).digest('base64url').slice(0, 24),
    endpoint,
    expirationTime: Number.isFinite(Number(value?.expirationTime)) ? Number(value.expirationTime) : null,
    createdAt: String(value?.createdAt || ''),
    updatedAt: String(value?.updatedAt || ''),
    userAgent: String(value?.userAgent || '').slice(0, 240),
    deviceTokenHash: String(value?.deviceTokenHash || '').trim(),
    keys: p256dh && auth ? { p256dh, auth } : null,
  };
}

function normalizeSubscriptions(value) {
  const rows = Array.isArray(value?.items) ? value.items : Array.isArray(value) ? value : [];
  const byEndpoint = new Map();
  for (const raw of rows) {
    const row = normalizeSubscription(raw);
    if (row) byEndpoint.set(row.endpoint, row);
  }

  const normalized=[...byEndpoint.values()];
  const newestByDevice=new Map();
  const withoutDeviceToken=[];
  for(const row of normalized){
    const token=String(row.deviceTokenHash||'').trim();
    if(!token){
      withoutDeviceToken.push(row);
      continue;
    }
    const previous=newestByDevice.get(token);
    if(!previous){
      newestByDevice.set(token,row);
      continue;
    }
    const previousTime=Date.parse(previous.updatedAt||previous.createdAt||0)||0;
    const rowTime=Date.parse(row.updatedAt||row.createdAt||0)||0;
    if(rowTime>=previousTime) newestByDevice.set(token,row);
  }

  return [...withoutDeviceToken,...newestByDevice.values()]
    .sort((a,b)=>(Date.parse(a.updatedAt||a.createdAt||0)||0)-(Date.parse(b.updatedAt||b.createdAt||0)||0))
    .slice(-MAX_SUBSCRIPTIONS);
}

async function readPushSubscriptions(actor, options = {}) {
  const safeActor = normalizeActor(actor);
  if (!safeActor) throw new Error('rudi-access-denied');
  const raw = await readAppState(safeActor, SUBSCRIPTIONS_KEY, options.dbOptions || options).catch(() => null);
  return normalizeSubscriptions(raw);
}

async function savePushSubscription(actor, subscription, options = {}) {
  const safeActor = normalizeActor(actor);
  if (!safeActor) throw new Error('rudi-access-denied');
  const normalized = normalizeSubscription(subscription);
  if (!normalized) throw new Error('push-subscription-invalid');
  const nowIso = new Date(options.now || Date.now()).toISOString();
  const current = await readPushSubscriptions(safeActor, options);
  const previous = current.find((row) => row.endpoint === normalized.endpoint);
  const tokenHash=hashDeviceToken(options.deviceToken);
  if(!tokenHash) throw new Error('push-device-token-required');
  const next = [
    ...current.filter((row) =>
      row.endpoint !== normalized.endpoint
      &&(!tokenHash||String(row.deviceTokenHash||'')!==tokenHash)
    ),
    {
      ...normalized,
      createdAt: previous?.createdAt || nowIso,
      updatedAt: nowIso,
      userAgent: String(options.userAgent || normalized.userAgent || '').slice(0, 240),
      deviceTokenHash: tokenHash,
    },
  ].slice(-MAX_SUBSCRIPTIONS);
  await writeAppState(safeActor, SUBSCRIPTIONS_KEY, { items: next, updatedAt: nowIso }, options.dbOptions || options);
  return next[next.length - 1];
}

async function resolvePushActor(endpoint, deviceToken, options = {}) {
  const safeEndpoint=String(endpoint||'').trim();
  const tokenHash=hashDeviceToken(deviceToken);
  if(!safeEndpoint||!tokenHash) return '';
  for(const actor of ACTORS){
    const rows=await readPushSubscriptions(actor,options).catch(()=>[]);
    const match=rows.find((row)=>row.endpoint===safeEndpoint&&row.deviceTokenHash===tokenHash);
    if(match) return actor;
  }
  return '';
}

async function removePushSubscriptions(actor, endpoints, options = {}) {
  const safeActor = normalizeActor(actor);
  if (!safeActor) throw new Error('rudi-access-denied');
  const remove = new Set((Array.isArray(endpoints) ? endpoints : [endpoints]).map((value) => String(value || '').trim()).filter(Boolean));
  if (!remove.size) return readPushSubscriptions(safeActor, options);
  const nowIso = new Date(options.now || Date.now()).toISOString();
  const current = await readPushSubscriptions(safeActor, options);
  const next = current.filter((row) => !remove.has(row.endpoint));
  await writeAppState(safeActor, SUBSCRIPTIONS_KEY, { items: next, updatedAt: nowIso }, options.dbOptions || options);
  return next;
}

function normalizePushNotification(value) {
  const createdAt = String(value?.createdAt || '');
  const createdMs = Date.parse(createdAt);
  if (!value?.id || !Number.isFinite(createdMs)) return null;
  return {
    id: String(value.id).slice(0, 96),
    kind: String(value.kind || 'show') === 'dismiss' ? 'dismiss' : 'show',
    title: String(value.title || 'RUDI').slice(0, 120),
    body: String(value.body || '').slice(0, 500),
    tag: String(value.tag || 'rudi').slice(0, 80),
    url: String(value.url || '/').slice(0, 500),
    icon: String(value.icon || '/icon-192-v176.jpg').slice(0, 500),
    badge: String(value.badge || '/icon-192-v176.jpg').slice(0, 500),
    createdAt: new Date(createdMs).toISOString(),
  };
}

function normalizeNotificationQueue(value, now = Date.now()) {
  const rows = Array.isArray(value?.items) ? value.items : Array.isArray(value) ? value : [];
  return rows
    .map(normalizePushNotification)
    .filter(Boolean)
    .filter((row) => now - Date.parse(row.createdAt) <= NOTIFICATION_TTL_MS)
    .slice(-MAX_NOTIFICATIONS);
}

async function queuePushNotification(actor, payload, options = {}) {
  const safeActor = normalizeActor(actor);
  if (!safeActor) throw new Error('rudi-access-denied');
  const now = Number(options.now || Date.now());
  const currentRaw = await readAppState(safeActor, NOTIFICATIONS_KEY, options.dbOptions || options).catch(() => null);
  const current = normalizeNotificationQueue(currentRaw, now);
  const row = normalizePushNotification({
    id: payload?.id || crypto.randomUUID(),
    kind: payload?.kind || 'show',
    title: payload?.title || 'RUDI',
    body: payload?.body || '',
    tag: payload?.tag || 'rudi',
    url: payload?.url || '/',
    icon: payload?.icon || '/icon-192-v176.jpg',
    badge: payload?.badge || '/icon-192-v176.jpg',
    createdAt: new Date(now).toISOString(),
  });
  const next = [
    ...current.filter((item) => {
      if (item.id === row.id) return false;
      if (row.kind !== 'dismiss') return true;
      return item.tag !== row.tag && item.url !== row.url;
    }),
    row,
  ].slice(-MAX_NOTIFICATIONS);
  await writeAppState(safeActor, NOTIFICATIONS_KEY, { items: next, updatedAt: row.createdAt }, options.dbOptions || options);
  return row;
}

async function readPendingPushNotifications(actor, options = {}) {
  const safeActor = normalizeActor(actor);
  if (!safeActor) throw new Error('rudi-access-denied');
  const now = Number(options.now || Date.now());
  const raw = await readAppState(safeActor, NOTIFICATIONS_KEY, options.dbOptions || options).catch(() => null);
  const seen = new Set((Array.isArray(options.seenIds) ? options.seenIds : []).map(String));
  const maxAgeMs=Math.max(0,Number(options.maxAgeMs)||0);
  return normalizeNotificationQueue(raw, now)
    .filter((row) => !seen.has(row.id))
    .filter((row) => !maxAgeMs || now-Date.parse(row.createdAt)<=maxAgeMs);
}

async function sendPushWake(endpoint, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('push-fetch-unavailable');
  const authorization = vapidAuthorization(endpoint, options);
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      TTL: String(Math.max(0, Math.min(86400, Number(options.ttlSeconds || 300)))),
      Urgency: String(options.urgency || 'normal'),
      Authorization: authorization.value,
    },
    body: null,
  });
  return { ok: Boolean(response?.ok), status: Number(response?.status || 0) };
}

async function sendPushPayload(subscription, notification, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('push-fetch-unavailable');
  const normalized = normalizeSubscription(subscription);
  if (!normalized?.keys?.p256dh || !normalized?.keys?.auth) throw new Error('push-encryption-keys-missing');
  const material = vapidKeyMaterial(options);
  const details = webpush.generateRequestDetails(
    {
      endpoint: normalized.endpoint,
      keys: normalized.keys,
    },
    JSON.stringify({ rudiPush: 1, notification }),
    {
      TTL: Math.max(0, Math.min(86400, Number(options.ttlSeconds || 300))),
      urgency: String(options.urgency || 'normal'),
      contentEncoding: 'aes128gcm',
      vapidDetails: {
        subject: VAPID_SUBJECT,
        publicKey: material.publicKey,
        privateKey: material.privateKeyString,
      },
    }
  );
  const response = await fetchImpl(details.endpoint, {
    method: details.method || 'POST',
    headers: details.headers,
    body: details.body,
  });
  return { ok: Boolean(response?.ok), status: Number(response?.status || 0) };
}


async function sendPushNotification(actor, payload, options = {}) {
  const safeActor = normalizeActor(actor);
  if (!safeActor) throw new Error('rudi-access-denied');
  const subscriptions = await readPushSubscriptions(safeActor, options);
  if (!subscriptions.length) return { sent: false, actor: safeActor, delivered: 0, reason: 'push-not-configured' };

  const notification = await queuePushNotification(safeActor, payload, options);
  const expired = [];
  let delivered = 0;
  const failures = [];
  for (const subscription of subscriptions) {
    try {
      const result = subscription?.keys?.p256dh && subscription?.keys?.auth
        ? await sendPushPayload(subscription, notification, options)
        : await sendPushWake(subscription.endpoint, options);
      if (result.ok) delivered += 1;
      else if (result.status === 404 || result.status === 410) expired.push(subscription.endpoint);
      else failures.push({ status: result.status, endpointId: subscription.id });
    } catch (error) {
      failures.push({ status: 0, endpointId: subscription.id, error: String(error?.message || error) });
    }
  }
  if (expired.length) await removePushSubscriptions(safeActor, expired, options).catch(() => null);
  return {
    sent: delivered > 0,
    actor: safeActor,
    delivered,
    expired: expired.length,
    failures,
    notification,
  };
}

function stripTelegramHtml(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

module.exports = {
  SUBSCRIPTIONS_KEY,
  NOTIFICATIONS_KEY,
  derivePrivateScalar,
  vapidKeyMaterial,
  publicApplicationServerKey,
  vapidAuthorization,
  hashDeviceToken,
  normalizeSubscription,
  normalizeSubscriptions,
  readPushSubscriptions,
  savePushSubscription,
  resolvePushActor,
  removePushSubscriptions,
  queuePushNotification,
  readPendingPushNotifications,
  sendPushWake,
  sendPushPayload,
  sendPushNotification,
  stripTelegramHtml,
};
