const crypto = require('node:crypto');
const { resolveTelegramBotToken } = require('./products-bought.cjs');
const { assertAllowedTelegramUser } = require('./rudi-access.cjs');

const YANDEX_IOT_BASE = 'https://api.iot.yandex.net/v1.0';
const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60;
const MAX_FUTURE_SKEW_SECONDS = 5 * 60;

function validateTelegramInitData(rawInitData, botToken, now = Date.now()) {
  const raw = String(rawInitData || '').trim();
  const token = String(botToken || '').trim();
  if (!raw || !token) throw new Error('telegram-auth-required');

  const params = new URLSearchParams(raw);
  const receivedHash = String(params.get('hash') || '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(receivedHash)) throw new Error('telegram-auth-invalid');

  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const expectedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  const actual = Buffer.from(receivedHash, 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    throw new Error('telegram-auth-invalid');
  }

  const authDate = Number(params.get('auth_date'));
  const nowSeconds = Math.floor(Number(now) / 1000);
  if (!Number.isFinite(authDate) || authDate <= 0) throw new Error('telegram-auth-invalid');
  if (authDate > nowSeconds + MAX_FUTURE_SKEW_SECONDS) throw new Error('telegram-auth-invalid');
  if (nowSeconds - authDate > MAX_AUTH_AGE_SECONDS) throw new Error('telegram-auth-expired');

  let user;
  try { user = JSON.parse(params.get('user') || 'null'); }
  catch { throw new Error('telegram-user-invalid'); }
  if (!user || typeof user !== 'object' || !Number.isFinite(Number(user.id))) {
    throw new Error('telegram-user-invalid');
  }
  const actor = assertAllowedTelegramUser(user);
  return { user, actor };
}

function statusForError(error) {
  const code = String(error?.message || error || '');
  if (['telegram-auth-required','telegram-auth-invalid','telegram-auth-expired','telegram-user-invalid'].includes(code)) return 401;
  if (code === 'rudi-access-denied') return 403;
  if (code === 'yandex-iot-not-configured') return 503;
  if (code.startsWith('bad-')) return 400;
  return 500;
}

function yandexToken(env = process.env) {
  const token = String(env.YANDEX_IOT_TOKEN || '').trim();
  if (!token) throw new Error('yandex-iot-not-configured');
  return token;
}

async function yandexRequest(path, { method = 'GET', body = null, env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const response = await fetchImpl(YANDEX_IOT_BASE + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + yandexToken(env),
      ...(body == null ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body == null ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.status === 'error') {
    const message = String(payload?.message || payload?.error || ('HTTP ' + response.status));
    const error = new Error('yandex-iot-error:' + message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function cleanEntityId(value, field = 'id') {
  const id = String(value || '').trim();
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(id)) throw new Error('bad-' + field);
  return id;
}

function normalizeCapability(capability) {
  return {
    type: String(capability?.type || ''),
    reportable: Boolean(capability?.reportable),
    retrievable: Boolean(capability?.retrievable),
    parameters: capability?.parameters && typeof capability.parameters === 'object' ? capability.parameters : {},
    state: capability?.state && typeof capability.state === 'object' ? capability.state : null,
  };
}

function normalizeProperty(property) {
  return {
    type: String(property?.type || ''),
    reportable: Boolean(property?.reportable),
    retrievable: Boolean(property?.retrievable),
    parameters: property?.parameters && typeof property.parameters === 'object' ? property.parameters : {},
    state: property?.state && typeof property.state === 'object' ? property.state : null,
    last_updated: Number(property?.last_updated || 0),
    state_changed_at: Number(property?.state_changed_at || 0),
  };
}

function normalizeHome(payload) {
  return {
    requestId: String(payload?.request_id || ''),
    households: (Array.isArray(payload?.households) ? payload.households : []).map(item => ({
      id: String(item?.id || ''),
      name: String(item?.name || ''),
      type: String(item?.type || ''),
    })),
    rooms: (Array.isArray(payload?.rooms) ? payload.rooms : []).map(item => ({
      id: String(item?.id || ''),
      name: String(item?.name || ''),
      householdId: String(item?.household_id || ''),
      devices: Array.isArray(item?.devices) ? item.devices.map(String) : [],
    })),
    groups: (Array.isArray(payload?.groups) ? payload.groups : []).map(item => ({
      id: String(item?.id || ''),
      name: String(item?.name || ''),
      type: String(item?.type || ''),
      room: String(item?.room || ''),
      householdId: String(item?.household_id || ''),
      capabilities: (Array.isArray(item?.capabilities) ? item.capabilities : []).map(normalizeCapability),
    })),
    devices: (Array.isArray(payload?.devices) ? payload.devices : []).map(item => ({
      id: String(item?.id || ''),
      name: String(item?.name || ''),
      type: String(item?.type || ''),
      room: String(item?.room || ''),
      householdId: String(item?.household_id || ''),
      capabilities: (Array.isArray(item?.capabilities) ? item.capabilities : []).map(normalizeCapability),
      properties: (Array.isArray(item?.properties) ? item.properties : []).map(normalizeProperty),
      info: {
        manufacturer: String(item?.device_info?.manufacturer || ''),
        model: String(item?.device_info?.model || ''),
      },
    })),
    scenarios: (Array.isArray(payload?.scenarios) ? payload.scenarios : []).map(item => ({
      id: String(item?.id || ''),
      name: String(item?.name || ''),
      active: Boolean(item?.is_active),
    })),
  };
}

function normalizeAction(body) {
  const deviceId = cleanEntityId(body?.deviceId, 'device-id');
  const type = String(body?.type || '').trim();
  if (!/^devices\.capabilities\.[a-z0-9_]+$/i.test(type)) throw new Error('bad-capability');
  const state = body?.state;
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('bad-state');
  const instance = String(state.instance || '').trim();
  if (!/^[a-z0-9_]+$/i.test(instance)) throw new Error('bad-instance');
  const safeState = { instance };
  if (Object.prototype.hasOwnProperty.call(state, 'value')) safeState.value = state.value;
  if (Object.prototype.hasOwnProperty.call(state, 'relative')) safeState.relative = Boolean(state.relative);
  return { deviceId, type, state: safeState };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });

  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  let auth;
  try {
    const botToken = resolveTelegramBotToken(process.env);
    auth = validateTelegramInitData(body.initData, botToken);
  } catch (error) {
    return res.status(statusForError(error)).json({ ok: false, error: String(error?.message || error) });
  }

  const operation = String(body.operation || 'list').trim();
  try {
    if (operation === 'list') {
      const payload = await yandexRequest('/user/info');
      const home = normalizeHome(payload);
      return res.status(200).json({ ok: true, actor: auth.actor, ...home });
    }

    if (operation === 'action') {
      const action = normalizeAction(body);
      const payload = await yandexRequest('/devices/actions', {
        method: 'POST',
        body: {
          devices: [{
            id: action.deviceId,
            actions: [{ type: action.type, state: action.state }],
          }],
        },
      });
      return res.status(200).json({ ok: true, requestId: String(payload?.request_id || ''), result: payload });
    }

    if (operation === 'scenario') {
      const scenarioId = cleanEntityId(body?.scenarioId, 'scenario-id');
      const payload = await yandexRequest('/scenarios/' + encodeURIComponent(scenarioId) + '/actions', { method: 'POST' });
      return res.status(200).json({ ok: true, requestId: String(payload?.request_id || ''), result: payload });
    }

    return res.status(400).json({ ok: false, error: 'bad-operation' });
  } catch (error) {
    const status = Number(error?.status) >= 400 && Number(error?.status) < 600 ? Number(error.status) : statusForError(error);
    console.error('RUDI_SMART_HOME_ERROR', {
      actor: auth.actor,
      operation,
      status,
      message: String(error?.message || error),
    });
    return res.status(status).json({
      ok: false,
      error: String(error?.message || error),
      detail: error?.payload?.message || undefined,
    });
  }
};
