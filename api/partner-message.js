const crypto = require('node:crypto');
const { resolveTelegramBotToken } = require('./products-bought.cjs');
const { readPartnerMessage, writePartnerMessage } = require('./partner-message-store.cjs');
const { assertAllowedTelegramUser } = require('./rudi-access.cjs');
const { readHolidayHighlights } = require('./holiday-highlights-store.cjs');
const { saveOAuthState, consumeOAuthState, saveToken, readToken, clearToken } = require('./ticktick-store.cjs');
const { decodeSetupKey, saveCalendarUrl, readCalendarUrl, getWorkWeek } = require('./work-calendar.cjs');
const { readWishlist, addWish, toggleWish, removeWish } = require('./wishlist-store.cjs');
const {
  decodeSetupKey: decodeNotificationSetupKey,
  saveRecipients,
  readRecipients,
  recipientFor,
} = require('./partner-notification-store.cjs');
const {
  decodeSetupKey: decodeAlbumSetupKey,
  saveAlbumConfig,
  readAlbumConfig,
  getLatestPhotos,
} = require('./shared-album.cjs');
const { readDailyMood, setDailyMood, moodView } = require('./daily-mood-store.cjs');
const {
  getCredentials,
  credentialsConfigured,
  buildAuthorizeUrl,
  exchangeCode,
  loadTickTickConfig,
  fetchProjectData,
  chooseNextTask,
  resolveAssigneeName,
} = require('./ticktick-client.cjs');

const MAX_MESSAGE_LENGTH = 1000;
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

  const authorName = String(user.first_name || '').trim()
    || String(user.last_name || '').trim()
    || String(user.username || '').trim()
    || 'Telegram';

  return { user, authorName };
}

function normalizeMessageText(value) {
  const text = String(value || '').replace(/\r\n?/g, '\n').trim();
  if (!text) throw new Error('message-empty');
  if (text.length > MAX_MESSAGE_LENGTH) throw new Error('message-too-long');
  return text;
}

function statusForError(error) {
  const code = String(error?.message || error || '');
  if (code === 'telegram-auth-required' || code === 'telegram-auth-invalid' || code === 'telegram-auth-expired' || code === 'telegram-user-invalid') return 401;
  if (code === 'rudi-access-denied') return 403;
  if (code === 'message-empty' || code === 'message-too-long') return 400;
  return 500;
}

function authorizeInitData(rawInitData, options = {}) {
  const token = options.botToken || resolveTelegramBotToken(options.env || process.env);
  const auth = validateTelegramInitData(rawInitData, token, options.now || Date.now());
  const actor = assertAllowedTelegramUser(auth.user);
  return { ...auth, actor };
}

async function sendPartnerMessageNotification(actor, options = {}) {
  const recipients = await readRecipients(options);
  const chatId = recipientFor(actor, recipients);
  if (!chatId) return { sent: false, reason: 'recipient-not-configured' };

  const token = options.botToken || resolveTelegramBotToken(options.env || process.env);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: '💌 Для вас оставлено новое послание в RUDI.\n\nОткройте приложение, чтобы прочитать его.',
      disable_notification: false,
    }),
  });
  if (!response?.ok) throw new Error(`partner-notification-http-${response?.status || 0}`);
  return { sent: true };
}

async function telegramBotCall(method, payload, options = {}) {
  const token = options.botToken || resolveTelegramBotToken(options.env || process.env);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const response = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  const data = await response.json().catch(() => null);
  if (!response?.ok || !data?.ok) throw new Error(`telegram-${method}-unavailable`);
  return data.result;
}

async function telegramPhotoDataUrl(fileId, options = {}) {
  const id = String(fileId || '').trim();
  if (!id) return '';
  const token = options.botToken || resolveTelegramBotToken(options.env || process.env);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const file = await telegramBotCall('getFile', { file_id: id }, options);
  const path = String(file?.file_path || '').trim();
  if (!path) return '';

  const response = await fetchImpl(`https://api.telegram.org/file/bot${token}/${path}`, { cache: 'no-store' });
  if (!response?.ok) return '';
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 512 * 1024) return '';

  const contentType = String(response.headers?.get?.('content-type') || '').split(';')[0].trim();
  const mime = /^image\//i.test(contentType)
    ? contentType
    : /\.png$/i.test(path) ? 'image/png'
    : /\.webp$/i.test(path) ? 'image/webp'
    : 'image/jpeg';
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

async function readTelegramProfile(userId, fallbackName, options = {}) {
  const id = Number(userId);
  const fallback = { name: String(fallbackName || 'Партнёр'), photoDataUrl: '' };
  if (!Number.isInteger(id) || id <= 0) return fallback;

  try {
    const chat = await telegramBotCall('getChat', { chat_id: id }, options);
    const name = String(chat?.first_name || '').trim()
      || String(chat?.title || '').trim().split(/\s+/)[0]
      || String(fallback.name || '').trim().split(/\s+/)[0]
      || 'Партнёр';

    let fileId = String(chat?.photo?.small_file_id || '').trim();
    if (!fileId) {
      const photos = await telegramBotCall('getUserProfilePhotos', { user_id: id, offset: 0, limit: 1 }, options)
        .catch(() => null);
      const firstSet = Array.isArray(photos?.photos) ? photos.photos[0] : null;
      if (Array.isArray(firstSet) && firstSet.length) {
        fileId = String(firstSet[0]?.file_id || '').trim();
      }
    }

    const photoDataUrl = fileId
      ? await telegramPhotoDataUrl(fileId, options).catch(() => '')
      : '';
    return { name, photoDataUrl };
  } catch (_) {
    return fallback;
  }
}

function moscowDateKey(now = Date.now()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Moscow',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(now))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );
  return [parts.year, parts.month, parts.day].join('-');
}

async function handleTickTick(req, res, action, options = {}) {
  if (action === 'connect') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    try {
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      authorizeInitData(body.initData, options);
      if (!credentialsConfigured(options.env || process.env)) {
        return res.status(503).json({ ok: false, error: 'ticktick-not-configured' });
      }
      const state = crypto.randomBytes(24).toString('base64url');
      await saveOAuthState(state, options);
      const { clientId, redirectUri } = getCredentials(options.env || process.env);
      const authorizeUrl = buildAuthorizeUrl({ clientId, redirectUri, state });
      return res.status(200).json({ ok: true, authorizeUrl });
    } catch (error) {
      return res.status(statusForError(error)).json({ ok: false, error: String(error?.message || error) });
    }
  }

  if (action === 'callback') {
    const redirect = (value) => {
      res.statusCode = 302;
      res.setHeader('Location', '/?ticktick=' + encodeURIComponent(value));
      res.end();
    };

    if (!credentialsConfigured(options.env || process.env)) return redirect('not-configured');

    const code = String(req.query?.code || '').trim();
    const state = String(req.query?.state || '').trim();
    if (!code || !state) return redirect('invalid-callback');

    try {
      const validState = await consumeOAuthState(state, options);
      if (!validState) return redirect('invalid-state');
      const token = await exchangeCode(code, { ...options, env: options.env || process.env });
      await saveToken(token, options);
      return redirect('connected');
    } catch (error) {
      console.error('RUDI_TICKTICK_OAUTH_ERROR', String(error?.message || error));
      return redirect('error');
    }
  }

  if (action === 'next') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    try {
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      authorizeInitData(body.initData, options);
    } catch (error) {
      return res.status(statusForError(error)).json({ ok: false, error: String(error?.message || error) });
    }

    if (!credentialsConfigured(options.env || process.env)) {
      return res.status(503).json({
        ok: false,
        connected: false,
        configured: false,
        error: 'ticktick-not-configured',
      });
    }

    const config = await loadTickTickConfig(options);
    if (!config.enabled) return res.status(200).json({ ok: true, enabled: false, connected: true, task: null });

    const token = await readToken(options);
    if (!token?.accessToken) {
      return res.status(401).json({
        ok: false,
        connected: false,
        configured: true,
        connectUrl: '/api/ticktick/connect',
        error: 'ticktick-not-connected',
      });
    }

    try {
      const data = await fetchProjectData(token.accessToken, config.projectId, options);
      const task = chooseNextTask(data?.tasks || [], options.now ? new Date(options.now) : new Date());
      if (!task) {
        return res.status(200).json({
          ok: true,
          connected: true,
          enabled: true,
          project: data?.project?.name || 'Общий',
          task: null,
        });
      }

      return res.status(200).json({
        ok: true,
        connected: true,
        enabled: true,
        project: data?.project?.name || 'Общий',
        task: {
          id: task.id,
          title: String(task.title || '').trim(),
          startDate: task.startDate || task.dueDate || null,
          dueDate: task.dueDate || null,
          isAllDay: Boolean(task.isAllDay),
          assignee: resolveAssigneeName(task.assigneeUsername),
          assigned: Boolean(String(task.assigneeUsername || '').trim()),
          description: String(task.desc || task.content || '').trim().slice(0, 5000),
          checklist: (Array.isArray(task.items) ? task.items : []).slice(0, 50).map((item) => ({
            id: String(item?.id || ''),
            title: String(item?.title || '').trim().slice(0, 500),
            completed: Number(item?.status || 0) === 1,
          })).filter((item) => item.title),
        },
      });
    } catch (error) {
      if (String(error?.message || '') === 'ticktick-token-invalid') {
        await clearToken(options);
        return res.status(401).json({
          ok: false,
          connected: false,
          configured: true,
          connectUrl: '/api/ticktick/connect',
          error: 'ticktick-reconnect-required',
        });
      }
      console.error('RUDI_TICKTICK_NEXT_ERROR', String(error?.message || error));
      return res.status(502).json({ ok: false, connected: true, error: 'ticktick-unavailable' });
    }
  }

  return res.status(404).json({ ok: false, error: 'ticktick-route-not-found' });
}

async function handleRudiAction(req, res, action, options = {}) {
  if (action === 'partner-notification-setup') {
    if (req.method !== 'GET' && req.method !== 'POST' && req.method) {
      return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    }
    try {
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      const key = req.method === 'POST' ? body.key : req.query?.key;
      const existing = await readRecipients(options);
      if (!existing) {
        await saveRecipients(decodeNotificationSetupKey(key), options);
      } else if (key) {
        decodeNotificationSetupKey(key);
      }
      return res.status(200).json({ ok: true, configured: true, alreadyConfigured: Boolean(existing) });
    } catch (error) {
      return res.status(400).json({ ok: false, error: String(error?.message || error) });
    }
  }

  if (action === 'shared-album-setup') {
    if (req.method !== 'GET' && req.method !== 'POST' && req.method) {
      return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    }
    try {
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      const key = req.method === 'POST' ? body.key : req.query?.key;
      const existing = await readAlbumConfig(options);
      if (!existing) {
        await saveAlbumConfig(decodeAlbumSetupKey(key), options);
      } else if (key) {
        decodeAlbumSetupKey(key);
      }
      const album = await getLatestPhotos(options);
      return res.status(200).json({ ok: true, configured: true, alreadyConfigured: Boolean(existing), photoCount: album.photos?.length || 0 });
    } catch (error) {
      console.error('RUDI_SHARED_ALBUM_SETUP_ERROR', String(error?.message || error));
      return res.status(400).json({ ok: false, error: String(error?.message || error) });
    }
  }

  if (action === 'shared-album') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    try {
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      authorizeInitData(body.initData, options);
      const album = await getLatestPhotos(options);
      return res.status(200).json({ ok: true, ...album });
    } catch (error) {
      const status = statusForError(error) === 500 ? 502 : statusForError(error);
      console.error('RUDI_SHARED_ALBUM_ERROR', String(error?.message || error));
      return res.status(status).json({ ok: false, error: String(error?.message || error) });
    }
  }

  if (action === 'app-auth') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    try {
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      const { actor, user } = authorizeInitData(body.initData, options);
      const date = moscowDateKey(options.now || Date.now());
      const holidaysPromise = readHolidayHighlights(date, options).catch(() => null);
      const recipients = await readRecipients(options).catch(() => null);
      const partnerActor = actor === 'Рустам' ? 'Диана' : 'Рустам';
      const partnerId = recipientFor(actor, recipients);
      const [holidays, selfProfile, partnerProfile] = await Promise.all([
        holidaysPromise,
        readTelegramProfile(user?.id, actor, options),
        readTelegramProfile(partnerId, partnerActor, options),
      ]);
      return res.status(200).json({
        ok: true,
        actor,
        selfProfile,
        partnerProfile,
        holidayHighlights: holidays?.items || [],
      });
    } catch (error) {
      return res.status(statusForError(error)).json({ ok: false, error: String(error?.message || error) });
    }
  }

  if (action === 'mood') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    try {
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      const { actor } = authorizeInitData(body.initData, options);
      const date = moscowDateKey(options.now || Date.now());
      const operation = String(body.operation || 'get').trim();
      let row;

      if (operation === 'set') {
        row = await setDailyMood(date, actor, body.mood, options);
      } else if (operation === 'get') {
        row = await readDailyMood(date, options);
      } else {
        return res.status(400).json({ ok: false, error: 'mood-operation-invalid' });
      }

      return res.status(200).json({ ok: true, ...moodView(row, actor) });
    } catch (error) {
      const code = String(error?.message || error);
      const authStatus = statusForError(error);
      const status = authStatus !== 500 ? authStatus
        : code === 'mood-value-invalid' || code === 'mood-actor-invalid' ? 400
        : 500;
      return res.status(status).json({ ok: false, error: code });
    }
  }

  if (action === 'partner-message-read') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    try {
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      authorizeInitData(body.initData, options);
      const message = await readPartnerMessage(options);
      return res.status(200).json({ ok: true, message });
    } catch (error) {
      return res.status(statusForError(error)).json({ ok: false, error: String(error?.message || error) });
    }
  }

  if (action === 'holidays') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    try {
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      authorizeInitData(body.initData, options);
      const date = moscowDateKey(options.now || Date.now());
      const row = await readHolidayHighlights(date, options);
      if (!row?.items?.length) return res.status(404).json({ ok: false, error: 'holiday-highlights-not-ready' });
      return res.status(200).json({ ok: true, ...row });
    } catch (error) {
      return res.status(statusForError(error)).json({ ok: false, error: String(error?.message || error) });
    }
  }

  if (action === 'work-calendar-setup') {
    if (req.method !== 'GET' && req.method !== 'POST' && req.method) {
      return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    }
    try {
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      const key = req.method === 'POST' ? body.key : req.query?.key;
      const existing = await readCalendarUrl(options);
      if (!existing) {
        const url = decodeSetupKey(key);
        await saveCalendarUrl(url, options);
      } else if (key) {
        decodeSetupKey(key);
      }
      const week = await getWorkWeek({ ...options, weekOffset: 0 });
      return res.status(200).json({
        ok: true,
        configured: true,
        alreadyConfigured: Boolean(existing),
        verified: Array.isArray(week?.days) && week.days.length === 7,
        weekStart: week?.weekStart || null,
        days: (week?.days || []).map((day) => ({
          date: day.date,
          working: Boolean(day.working),
          eventCount: Array.isArray(day.events) ? day.events.length : 0,
        })),
      });
    } catch (error) {
      return res.status(400).json({ ok: false, error: String(error?.message || error) });
    }
  }

  if (action === 'work-calendar') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    try {
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      authorizeInitData(body.initData, options);
      const view = ['week','month','next-month'].includes(String(body.view || ''))
        ? String(body.view)
        : 'week';
      const week = await getWorkWeek({ ...options, view });
      return res.status(200).json({ ok: true, ...week });
    } catch (error) {
      const code = String(error?.message || error);
      const status = statusForError(error) === 500 ? 502 : statusForError(error);
      console.error('RUDI_WORK_CALENDAR_ERROR', code);
      return res.status(status).json({ ok: false, error: code });
    }
  }

  if (action === 'wishlist') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    try {
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      const { actor: owner } = authorizeInitData(body.initData, options);
      const operation = String(body.operation || 'list').trim();

      if (operation === 'list') {
        return res.status(200).json({ ok: true, owner, ...(await readWishlist(options)) });
      }
      if (operation === 'add') {
        const result = await addWish(body.text, owner, options);
        return res.status(200).json({ ok: true, owner, ...result.state });
      }
      if (operation === 'toggle') {
        const result = await toggleWish(body.id, options);
        return res.status(200).json({ ok: true, owner, ...result.state });
      }
      if (operation === 'remove') {
        const state = await removeWish(body.id, options);
        return res.status(200).json({ ok: true, owner, ...state });
      }
      return res.status(400).json({ ok: false, error: 'wishlist-operation-invalid' });
    } catch (error) {
      const code = String(error?.message || error);
      const authStatus = statusForError(error);
      const status = authStatus !== 500 ? authStatus
        : code === 'wishlist-item-not-found' ? 404
        : 400;
      return res.status(status).json({ ok: false, error: code });
    }
  }

  return res.status(404).json({ ok: false, error: 'rudi-route-not-found' });
}

async function handler(req, res, options = {}) {
  res.setHeader?.('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');

  const rudiAction = String(req.query?.rudiAction || '').trim();
  if (rudiAction) return handleRudiAction(req, res, rudiAction, options);

  const ticktickAction = String(req.query?.ticktickAction || '').trim();
  if (ticktickAction) return handleTickTick(req, res, ticktickAction, options);

  if (req.method === 'GET' || !req.method) {
    return res.status(404).json({ ok: false, error: 'route-not-found' });
  }

  if (req.method !== 'POST') {
    res.setHeader?.('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'method-not-allowed' });
  }

  try {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const { authorName, actor } = authorizeInitData(body.initData, options);
    const text = normalizeMessageText(body.text);

    const message = await writePartnerMessage({
      text,
      authorName,
      updatedAt: new Date(options.now || Date.now()).toISOString(),
    }, options);

    let notification = { sent: false };
    try {
      notification = await sendPartnerMessageNotification(actor, options);
    } catch (error) {
      console.error('RUDI_PARTNER_NOTIFICATION_ERROR', String(error?.message || error));
      notification = { sent: false, error: 'notification-failed' };
    }

    return res.status(200).json({ ok: true, message, notification });
  } catch (error) {
    const status = statusForError(error);
    if (status === 500) console.error('RUDI_PARTNER_MESSAGE_ERROR', error);
    return res.status(status).json({ ok: false, error: String(error?.message || error) });
  }
}

module.exports = handler;
module.exports.validateTelegramInitData = validateTelegramInitData;
module.exports.normalizeMessageText = normalizeMessageText;
module.exports.statusForError = statusForError;
module.exports.handleTickTick = handleTickTick;
module.exports.handleRudiAction = handleRudiAction;
module.exports.sendPartnerMessageNotification = sendPartnerMessageNotification;
