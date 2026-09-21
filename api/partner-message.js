const crypto = require('node:crypto');
const { resolveTelegramBotToken } = require('./products-bought.cjs');
const { readPartnerMessage, writePartnerMessage } = require('./partner-message-store.cjs');
const { assertAllowedTelegramUser } = require('./rudi-access.cjs');
const { readHolidayHighlights } = require('./holiday-highlights-store.cjs');
const { getHolidayCalendar } = require('./holiday-calendar.cjs');
const { saveOAuthState, consumeOAuthState, saveToken, readToken, clearToken } = require('./ticktick-store.cjs');
const { decodeSetupKey, saveCalendarUrl, readCalendarUrl, getWorkWeek } = require('./work-calendar.cjs');
const { readWishlist, addWish, toggleWish, removeWish } = require('./wishlist-store.cjs');
const {
  readProductList,
  addProducts,
  removeProduct,
  toggleProductChecked,
  markCheckedProductsBought,
  markProductBought,
  clearProducts,
} = require('./product-list-store.cjs');
const {
  decodeSetupKey: decodeNotificationSetupKey,
  saveRecipient,
  saveRecipients,
  readRecipients,
  normalizeRecipients,
  recipientFor,
} = require('./partner-notification-store.cjs');
const {
  decodeSetupKey: decodeAlbumSetupKey,
  saveAlbumConfig,
  readAlbumConfig,
  getLatestPhotos,
} = require('./shared-album.cjs');
const { readDailyMood, setDailyMood, moodView } = require('./daily-mood-store.cjs');
const { readCycleState, bootstrapCycleState, recordCycleStart, normalizeCycleState, cycleStateWithStart, writeCycleState } = require('./cycle-store.cjs');
const { readReactions, setReaction, toggleReaction } = require('./reactions-store.cjs');
const {
  getCredentials,
  credentialsConfigured,
  buildAuthorizeUrl,
  exchangeCode,
  loadTickTickConfig,
  fetchProjectData,
  buildTickTickCalendar,
  chooseNextTask,
  resolveAssigneeName,
  tokenHasWriteScope,
  visibleChecklistItems,
  updateTaskChecklistItem,
} = require('./ticktick-client.cjs');
const {
  readChecklistAuditState,
  recordChecklistAudit,
  checklistAuditForItem,
} = require('./ticktick-checklist-audit-store.cjs');
const { createStateBackup, restoreStateBackup, openSnapshot, sealSnapshot } = require('./rudi-backup.cjs');
const { getCinemaPremieresCache, getTopicMaintenanceCache } = require('./stateful-cache.cjs');
const { resolveCinemaTopicId } = require('./cinema-topic.cjs');
const { getKnownForumChatId } = require('./topic-maintenance-base.cjs');
const { findForumChatIdInEnv } = require('./forum-chat-id.cjs');
const { loadForumTopicsConfig } = require('./forum-topics-config.cjs');

const RUDI_FORUM_CHAT_ID = '-1004476323368';
const CYCLE_BOOTSTRAP_HASH = '12818afbe0d73e63efcf5ab9f181ff8e6b9d48cdbcaf126bddeadac611818de5';
const CYCLE_BOOTSTRAP_IV = 'tEvCUig24dBX068Z';
const CYCLE_BOOTSTRAP_BLOB = 'cPfFLwwl8XVO3pdcZmjY9rT6kfpnRFNmOcoQUmehEaiOkN7OvPsUgYxCYx5aJTfxSM8xeV1Jf4E76plYDiLEdlE38-z1h6NcN3_IiSDTTWcfCijVR0jMUc_Hn6GixQvsCGpfF6fxEJ4qWUxjzdV9j8U1AQxjGfvFrmUpomnglyS_NpWeutsbdafg3cOpI6aNz4zdgD14WV4QusJzxcT90eViXplshKgiU9eesjJ0iyz65pxUQyanxROa56vxttvbC3HfBD6Uv2b7l2Iuj6w3JfagzsPgpVI9sTdKT8sA5V6EvAOYZkNFG0iPbCIdLr8_acXF_o9XNBJxtGEgBqGHIOi-biEAbRaKR_3hX33EE4i8uP6oPuLaXrg';

function decodeCycleBootstrapState(secret) {
  const raw = String(secret || '');
  const actual = crypto.createHash('sha256').update(raw).digest('hex');
  const left = Buffer.from(actual, 'hex');
  const right = Buffer.from(CYCLE_BOOTSTRAP_HASH, 'hex');
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    throw new Error('cycle-bootstrap-denied');
  }
  const key = crypto.createHash('sha256').update(raw).digest();
  const iv = Buffer.from(CYCLE_BOOTSTRAP_IV, 'base64url');
  const packed = Buffer.from(CYCLE_BOOTSTRAP_BLOB, 'base64url');
  const ciphertext = packed.subarray(0, packed.length - 16);
  const tag = packed.subarray(packed.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  return JSON.parse(plaintext);
}

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

function tickTickOAuthStateKey(options = {}) {
  const token = options.botToken || resolveTelegramBotToken(options.env || process.env);
  return crypto.createHash('sha256').update('rudi-ticktick-oauth-v2\0' + String(token || '')).digest();
}

function createTickTickOAuthState(options = {}) {
  const issuedAt = Math.floor((options.now || Date.now()) / 1000);
  const nonce = crypto.randomBytes(18).toString('base64url');
  const payload = issuedAt + '.' + nonce;
  const signature = crypto.createHmac('sha256', tickTickOAuthStateKey(options)).update(payload).digest('base64url');
  return 'v2.' + payload + '.' + signature;
}

function verifyTickTickOAuthState(value, options = {}) {
  const parts = String(value || '').split('.');
  if (parts.length !== 4 || parts[0] !== 'v2') return false;
  const issuedAt = Number(parts[1]);
  const nonce = String(parts[2] || '');
  const signature = String(parts[3] || '');
  if (!Number.isFinite(issuedAt) || !nonce || !signature) return false;
  const now = Math.floor((options.now || Date.now()) / 1000);
  if (Math.abs(now - issuedAt) > 10 * 60) return false;
  const payload = issuedAt + '.' + nonce;
  const expected = crypto.createHmac('sha256', tickTickOAuthStateKey(options)).update(payload).digest();
  let actual;
  try { actual = Buffer.from(signature, 'base64url'); } catch { return false; }
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function mergeBackupSnapshots(base, overlay) {
  if (!base) return overlay || null;
  if (!overlay) return base;
  return {
    ...base,
    ...overlay,
    partnerMessage: overlay.partnerMessage || base.partnerMessage || null,
    wishlist: overlay.wishlist || base.wishlist || null,
    products: overlay.products || base.products || null,
    ticktickChecklistAudit: overlay.ticktickChecklistAudit || base.ticktickChecklistAudit || null,
    ticktickToken: overlay.ticktickToken || base.ticktickToken || null,
    calendarUrl: overlay.calendarUrl || base.calendarUrl || '',
    albumConfig: overlay.albumConfig || base.albumConfig || null,
    cycle: overlay.cycle || base.cycle || null,
    recipients: {
      'Рустам': Number(overlay.recipients?.['Рустам'] || base.recipients?.['Рустам'] || 0) || null,
      'Диана': Number(overlay.recipients?.['Диана'] || base.recipients?.['Диана'] || 0) || null,
    },
  };
}

function backupSnapshotFromToken(value, options = {}) {
  const token = String(value || '').trim();
  if (!token) return null;
  try { return openSnapshot(token, options); } catch { return null; }
}

async function readTickTickTokenWithBackup(body, options = {}) {
  const live = await readToken(options).catch(() => null);
  if (live?.accessToken) return live;
  const saved = backupSnapshotFromToken(body?.backupToken, options)?.ticktickToken;
  return saved?.accessToken ? saved : null;
}

function mergedRecipientsWithBackup(current, snapshot) {
  return normalizeRecipients({
    'Рустам': current?.['Рустам'] || snapshot?.recipients?.['Рустам'],
    'Диана': current?.['Диана'] || snapshot?.recipients?.['Диана'],
  });
}

function correctRecipientsForSession(recipients, actor, userId) {
  const id = Number(userId);
  const result = normalizeRecipients(recipients || {});
  if (!['Рустам', 'Диана'].includes(actor) || !Number.isInteger(id) || id <= 0) return result;

  const other = actor === 'Рустам' ? 'Диана' : 'Рустам';
  const previousOwn = result[actor];
  const previousOther = result[other];

  if (previousOwn === id) return result;

  result[actor] = id;
  if (previousOther === id) {
    result[other] = previousOwn && previousOwn !== id ? previousOwn : null;
  } else if (!previousOther && previousOwn && previousOwn !== id) {
    result[other] = previousOwn;
  }

  return normalizeRecipients(result);
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
      const state = createTickTickOAuthState(options);
      const { clientId, redirectUri } = getCredentials(options.env || process.env);
      const authorizeUrl = buildAuthorizeUrl({ clientId, redirectUri, state });
      return res.status(200).json({ ok: true, authorizeUrl });
    } catch (error) {
      return res.status(statusForError(error)).json({ ok: false, error: String(error?.message || error) });
    }
  }

  if (action === 'callback') {
    const redirect = (value, handoffToken = '') => {
      res.statusCode = 302;
      const handoff = handoffToken ? '&ticktickHandoff=' + encodeURIComponent(handoffToken) : '';
      res.setHeader('Location', '/?ticktick=' + encodeURIComponent(value) + handoff);
      res.end();
    };

    if (!credentialsConfigured(options.env || process.env)) return redirect('not-configured');

    const code = String(req.query?.code || '').trim();
    const state = String(req.query?.state || '').trim();
    if (!code || !state) return redirect('invalid-callback');

    try {
      const validState = verifyTickTickOAuthState(state, options)
        || await consumeOAuthState(state, options).catch(() => false);
      if (!validState) return redirect('invalid-state');
      const token = await exchangeCode(code, { ...options, env: options.env || process.env });
      const savedToken = await saveToken(token, {
        ...options,
        cacheOptions: { ...(options.cacheOptions || {}), confirmWrites: false },
      });
      const handoffToken = sealSnapshot({
        version: 2,
        createdAt: new Date(options.now || Date.now()).toISOString(),
        ticktickToken: savedToken,
      }, options);
      return redirect('connected', handoffToken);
    } catch (error) {
      console.error('RUDI_TICKTICK_OAUTH_ERROR', String(error?.message || error));
      return redirect('error');
    }
  }

  if (action === 'next') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    let body;
    try {
      body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
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

    const token = await readTickTickTokenWithBackup(body, options);
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
      const scopeState = tokenHasWriteScope(token);
      const writable = scopeState !== false;

      if (!task) {
        return res.status(200).json({
          ok: true,
          connected: true,
          enabled: true,
          writable,
          project: data?.project?.name || 'Общий',
          task: null,
        });
      }

      const auditState = await readChecklistAuditState(options).catch(() => ({ entries: {} }));
      const checklist = visibleChecklistItems(task.items, 50).map((item) => {
        const audit = checklistAuditForItem(auditState, task.id, item?.id, false);
        return {
          id: String(item?.id || ''),
          title: String(item?.title || '').trim().slice(0, 500),
          completed: false,
          changedBy: audit?.actor || '',
          changedAt: audit?.changedAt || '',
        };
      }).filter((item) => item.title);

      return res.status(200).json({
        ok: true,
        connected: true,
        enabled: true,
        writable,
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
          checklist,
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


  if (action === 'calendar') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    let body;
    try {
      body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
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
    if (!config.enabled) {
      return res.status(200).json({
        ok: true,
        enabled: false,
        connected: true,
        view: 'month',
        days: [],
      });
    }

    const token = await readTickTickTokenWithBackup(body, options);
    if (!token?.accessToken) {
      return res.status(401).json({
        ok: false,
        connected: false,
        configured: true,
        connectUrl: '/api/ticktick/connect',
        error: 'ticktick-not-connected',
      });
    }

    const view = ['month', 'next-month'].includes(String(body.view || ''))
      ? String(body.view)
      : 'month';

    try {
      const data = await fetchProjectData(token.accessToken, config.projectId, options);
      const calendar = buildTickTickCalendar(
        data?.tasks || [],
        options.now ? new Date(options.now) : new Date(),
        view
      );
      return res.status(200).json({
        ok: true,
        connected: true,
        enabled: true,
        project: data?.project?.name || 'Общий',
        ...calendar,
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
      console.error('RUDI_TICKTICK_CALENDAR_ERROR', String(error?.message || error));
      return res.status(502).json({ ok: false, connected: true, error: 'ticktick-unavailable' });
    }
  }

  if (action === 'checklist-toggle') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });

    let actor;
    let body;
    try {
      body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      ({ actor } = authorizeInitData(body.initData, options));
    } catch (error) {
      return res.status(statusForError(error)).json({ ok: false, error: String(error?.message || error) });
    }

    if (!credentialsConfigured(options.env || process.env)) {
      return res.status(503).json({ ok: false, configured: false, error: 'ticktick-not-configured' });
    }

    const taskId = String(body.taskId || '').trim();
    const itemId = String(body.itemId || '').trim();
    if (!taskId || !itemId || typeof body.completed !== 'boolean') {
      return res.status(400).json({ ok: false, error: 'ticktick-checklist-toggle-invalid' });
    }

    const config = await loadTickTickConfig(options);
    if (!config.enabled) {
      return res.status(409).json({ ok: false, enabled: false, error: 'ticktick-disabled' });
    }

    const token = await readTickTickTokenWithBackup(body, options);
    if (!token?.accessToken) {
      return res.status(401).json({
        ok: false,
        connected: false,
        reconnectRequired: true,
        error: 'ticktick-not-connected',
      });
    }

    const scopeState = tokenHasWriteScope(token);
    if (scopeState === false) {
      return res.status(403).json({
        ok: false,
        connected: true,
        writable: false,
        reconnectRequired: true,
        error: 'ticktick-write-permission-required',
      });
    }

    try {
      const updated = await updateTaskChecklistItem(
        token.accessToken,
        config.projectId,
        taskId,
        itemId,
        body.completed,
        options
      );

      let changedAt = new Date(options.now || Date.now()).toISOString();
      let auditPersisted = false;
      try {
        const state = await recordChecklistAudit(taskId, itemId, body.completed, actor, options);
        const audit = checklistAuditForItem(state, taskId, itemId, body.completed);
        if (audit?.changedAt) changedAt = audit.changedAt;
        auditPersisted = true;
      } catch (error) {
        console.warn('RUDI_TICKTICK_CHECKLIST_AUDIT_WARN', String(error?.message || error));
      }

      return res.status(200).json({
        ok: true,
        connected: true,
        writable: true,
        auditPersisted,
        item: {
          id: itemId,
          completed: Boolean(body.completed),
          changedBy: actor,
          changedAt,
          ticktickStatus: Number(updated?.item?.status ?? (body.completed ? 1 : 0)),
        },
      });
    } catch (error) {
      const code = String(error?.message || error);
      if (code === 'ticktick-token-invalid') {
        await clearToken(options);
        return res.status(401).json({
          ok: false,
          connected: false,
          reconnectRequired: true,
          error: 'ticktick-reconnect-required',
        });
      }
      if (code === 'ticktick-write-forbidden') {
        return res.status(403).json({
          ok: false,
          connected: true,
          writable: false,
          reconnectRequired: true,
          error: 'ticktick-write-permission-required',
        });
      }
      if (code === 'ticktick-task-not-found' || code === 'ticktick-checklist-item-not-found') {
        return res.status(404).json({ ok: false, connected: true, error: code });
      }
      if (code === 'ticktick-checklist-update-invalid') {
        return res.status(400).json({ ok: false, connected: true, error: code });
      }
      console.error('RUDI_TICKTICK_CHECKLIST_UPDATE_ERROR', code);
      return res.status(502).json({ ok: false, connected: true, error: 'ticktick-update-unavailable' });
    }
  }

  return res.status(404).json({ ok: false, error: 'ticktick-route-not-found' });
}

async function handleRudiAction(req, res, action, options = {}) {
  if (action === 'cycle-bootstrap') {
    if (req.method !== 'GET' && req.method) return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    try {
      const state = decodeCycleBootstrapState(req.query?.key);
      const current = await readCycleState(options).catch(() => null);
      const stored = current || await writeCycleState(state, {
        ...options,
        cacheOptions: { ...(options.cacheOptions || {}), confirmWrites: false },
      }).catch(() => normalizeCycleState(state));
      return res.status(200).json({
        ok: true,
        configured: true,
        created: !current,
        cycleReady: Boolean(stored),
      });
    } catch (error) {
      const code = String(error?.message || error);
      return res.status(code === 'cycle-bootstrap-denied' ? 403 : 400).json({ ok: false, error: code });
    }
  }

  if (action === 'cycle') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    try {
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      const { actor } = authorizeInitData(body.initData, options);
      const operation = String(body.operation || 'get').trim();
      const backupSnapshot = backupSnapshotFromToken(body.backupToken, options);
      if (operation === 'get') {
        const liveCycle = await readCycleState(options).catch(() => null);
        const cycle = liveCycle || normalizeCycleState(backupSnapshot?.cycle);
        return res.status(200).json({ ok: true, actor, configured: Boolean(cycle), cycle });
      }
      if (operation === 'record-start') {
        if (actor !== 'Диана') return res.status(403).json({ ok: false, error: 'cycle-owner-required' });
        const liveCycle = await readCycleState(options).catch(() => null);
        const baseCycle = liveCycle || normalizeCycleState(backupSnapshot?.cycle);
        const cycle = cycleStateWithStart(baseCycle, moscowDateKey(options.now || Date.now()));
        cycle.updatedAt = new Date(options.now || Date.now()).toISOString();
        await writeCycleState(cycle, options).catch(() => false);
        const previousSnapshot = mergeBackupSnapshots(backupSnapshot, {
          version: 2,
          createdAt: new Date(options.now || Date.now()).toISOString(),
          cycle,
        });
        const backupToken = await createStateBackup({ ...options, previousSnapshot });
        return res.status(200).json({ ok: true, actor, configured: true, cycle, backupToken });
      }
      return res.status(400).json({ ok: false, error: 'cycle-operation-invalid' });
    } catch (error) {
      const code = String(error?.message || error);
      const authStatus = statusForError(error);
      const status = authStatus !== 500 ? authStatus
        : code === 'cycle-date-invalid' || code === 'cycle-not-configured' ? 400
        : 500;
      if (status === 500) console.error('RUDI_CYCLE_ERROR', code);
      return res.status(status).json({ ok: false, error: code });
    }
  }

  if (action === 'cinema-topic-link') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    try {
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      authorizeInitData(body.initData, options);

      const cinemaCache = getCinemaPremieresCache();
      const topicCache = getTopicMaintenanceCache();
      const forumConfig = await loadForumTopicsConfig();
      const [topicId, cachedChatId] = await Promise.all([
        resolveCinemaTopicId({ cache: cinemaCache, configuredTopicId: forumConfig.cinema }),
        getKnownForumChatId({ cache: topicCache }).catch(() => null),
      ]);
      const chatId = cachedChatId || findForumChatIdInEnv(options.env || process.env) || RUDI_FORUM_CHAT_ID;
      if (!topicId || !chatId) {
        return res.status(404).json({ ok: false, error: 'cinema-topic-unavailable' });
      }

      const internalChatId = String(chatId).replace(/^-100/, '');
      if (!/^\d+$/.test(internalChatId)) {
        return res.status(500).json({ ok: false, error: 'cinema-chat-invalid' });
      }

      return res.status(200).json({
        ok: true,
        url: 'https://t.me/c/' + internalChatId + '/' + Number(topicId),
      });
    } catch (error) {
      const status = statusForError(error);
      return res.status(status === 500 ? 502 : status).json({ ok: false, error: String(error?.message || error) });
    }
  }

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
      const backupSnapshot = backupSnapshotFromToken(body.backupToken, options);
      const album = await getLatestPhotos({
        ...options,
        albumConfig: backupSnapshot?.albumConfig || null,
      });
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
      const backupSnapshot = backupSnapshotFromToken(body.backupToken, options);
      const handoffSnapshot = backupSnapshotFromToken(body.ticktickHandoff, options);
      const previousSnapshot = mergeBackupSnapshots(backupSnapshot, handoffSnapshot);

      if (body.backupToken) {
        try {
          const recovery = await restoreStateBackup(body.backupToken, {
            ...options,
            cacheOptions: { ...(options.cacheOptions || {}), confirmWrites: false },
          });
          if (recovery.restored?.length) console.info('RUDI_STATE_RESTORED', recovery.restored.join(','));
        } catch (error) {
          console.warn('RUDI_STATE_BACKUP_RESTORE_WARN', String(error?.message || error));
        }
      }

      const date = moscowDateKey(options.now || Date.now());
      const holidaysPromise = readHolidayHighlights(date, options).catch(() => null);
      const recipients = correctRecipientsForSession(
        mergedRecipientsWithBackup(
          await readRecipients(options).catch(() => null),
          previousSnapshot
        ),
        actor,
        user?.id
      );
      const correctedSnapshot = mergeBackupSnapshots(previousSnapshot, {
        version: 2,
        createdAt: new Date(options.now || Date.now()).toISOString(),
        recipients,
      });
      try {
        if (recipients?.['Рустам'] && recipients?.['Диана']) {
          await saveRecipients(recipients, {
            ...options,
            cacheOptions: { ...(options.cacheOptions || {}), confirmWrites: false },
          });
        } else {
          await saveRecipient(actor, user?.id, {
            ...options,
            cacheOptions: { ...(options.cacheOptions || {}), confirmWrites: false },
          });
        }
      } catch (error) {
        console.warn('RUDI_RECIPIENT_SESSION_FIX_WARN', String(error?.message || error));
      }

      const partnerActor = actor === 'Рустам' ? 'Диана' : 'Рустам';
      const partnerId = recipientFor(actor, recipients);
      const [holidays, selfProfile, partnerProfile, backupToken] = await Promise.all([
        holidaysPromise,
        readTelegramProfile(user?.id, actor, options),
        readTelegramProfile(partnerId, partnerActor, options),
        createStateBackup({ ...options, previousSnapshot: correctedSnapshot }).catch((error) => {
          console.warn('RUDI_STATE_BACKUP_CREATE_WARN', String(error?.message || error));
          return '';
        }),
      ]);
      return res.status(200).json({
        ok: true,
        actor,
        selfProfile,
        partnerProfile,
        holidayHighlights: holidays?.items || [],
        backupToken,
      });
    } catch (error) {
      return res.status(statusForError(error)).json({ ok: false, error: String(error?.message || error) });
    }
  }

  if (action === 'state-backup') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    try {
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      const { actor, user } = authorizeInitData(body.initData, options);
      const previousSnapshot = backupSnapshotFromToken(body.backupToken, options);
      const correctedRecipients = correctRecipientsForSession(
        mergedRecipientsWithBackup(
          await readRecipients(options).catch(() => null),
          previousSnapshot
        ),
        actor,
        user?.id
      );
      try {
        if (correctedRecipients?.['Рустам'] && correctedRecipients?.['Диана']) {
          await saveRecipients(correctedRecipients, {
            ...options,
            cacheOptions: { ...(options.cacheOptions || {}), confirmWrites: false },
          });
        } else {
          await saveRecipient(actor, user?.id, {
            ...options,
            cacheOptions: { ...(options.cacheOptions || {}), confirmWrites: false },
          });
        }
      } catch {}
      const correctedSnapshot = mergeBackupSnapshots(previousSnapshot, {
        version: 2,
        createdAt: new Date(options.now || Date.now()).toISOString(),
        recipients: correctedRecipients,
      });
      const backupToken = await createStateBackup({ ...options, previousSnapshot: correctedSnapshot });
      return res.status(200).json({ ok: true, backupToken });
    } catch (error) {
      const code = String(error?.message || error);
      const status = statusForError(error);
      if (status === 500) console.error('RUDI_STATE_BACKUP_ERROR', code);
      return res.status(status).json({ ok: false, error: code });
    }
  }


  if (action === 'reactions') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    try {
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      const { actor } = authorizeInitData(body.initData, options);
      const operation = String(body.operation || 'list').trim();

      if (operation === 'list') {
        const reactions = await readReactions(body.targets, options);
        return res.status(200).json({ ok: true, actor, reactions });
      }
      if (operation === 'set') {
        const reaction = await setReaction(body.target, actor, body.liked, options);
        return res.status(200).json({ ok: true, actor, reaction });
      }
      if (operation === 'toggle') {
        const reaction = await toggleReaction(body.target, actor, options);
        return res.status(200).json({ ok: true, actor, reaction });
      }
      return res.status(400).json({ ok: false, error: 'reaction-operation-invalid' });
    } catch (error) {
      const code = String(error?.message || error);
      const authStatus = statusForError(error);
      const status = authStatus !== 500 ? authStatus : code.startsWith('reaction-') ? 400 : 500;
      if (status === 500) console.error('RUDI_REACTIONS_ERROR', code);
      return res.status(status).json({ ok: false, error: code });
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

  if (action === 'holiday-calendar') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    try {
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      authorizeInitData(body.initData, options);
      const view = ['month', 'next-month'].includes(String(body.view || ''))
        ? String(body.view)
        : 'month';
      const calendar = await getHolidayCalendar({
        ...options,
        view,
      });
      return res.status(200).json({ ok: true, ...calendar });
    } catch (error) {
      const code = String(error?.message || error);
      const authStatus = statusForError(error);
      const status = authStatus !== 500 ? authStatus : 502;
      console.error('RUDI_HOLIDAY_CALENDAR_ERROR', code);
      return res.status(status).json({ ok: false, error: code });
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
      const backupSnapshot = backupSnapshotFromToken(body.backupToken, options);
      const view = ['week','month','next-month'].includes(String(body.view || ''))
        ? String(body.view)
        : 'week';
      const week = await getWorkWeek({
        ...options,
        view,
        calendarUrl: backupSnapshot?.calendarUrl || '',
      });
      return res.status(200).json({ ok: true, ...week });
    } catch (error) {
      const code = String(error?.message || error);
      const status = statusForError(error) === 500 ? 502 : statusForError(error);
      console.error('RUDI_WORK_CALENDAR_ERROR', code);
      return res.status(status).json({ ok: false, error: code });
    }
  }

  if (action === 'products') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    try {
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      const { actor } = authorizeInitData(body.initData, options);
      const operation = String(body.operation || 'list').trim();

      if (operation === 'list') {
        const live = await readProductList(options).catch(() => ({ initialized: false, version: 0, items: [], history: [] }));
        const saved = backupSnapshotFromToken(body.backupToken, options)?.products;
        const state = live?.initialized ? live : (saved?.initialized ? saved : live);
        return res.status(200).json({ ok: true, actor, ...state });
      }
      if (operation === 'add') {
        const values = Array.isArray(body.items) && body.items.length ? body.items : [body.text];
        const state = await addProducts(values, actor, options);
        return res.status(200).json({ ok: true, actor, ...state });
      }
      if (operation === 'remove') {
        const state = await removeProduct(body.id, options);
        return res.status(200).json({ ok: true, actor, ...state });
      }
      if (operation === 'toggle') {
        const state = await toggleProductChecked(body.id, options);
        return res.status(200).json({ ok: true, actor, ...state });
      }
      if (operation === 'bought') {
        const state = await markProductBought(body.id, actor, options);
        return res.status(200).json({ ok: true, actor, ...state });
      }
      if (operation === 'buy-checked') {
        const state = await markCheckedProductsBought(actor, options);
        return res.status(200).json({ ok: true, actor, ...state });
      }
      if (operation === 'clear') {
        const state = await clearProducts(options);
        return res.status(200).json({ ok: true, actor, ...state });
      }
      return res.status(400).json({ ok: false, error: 'products-operation-invalid' });
    } catch (error) {
      const code = String(error?.message || error);
      const authStatus = statusForError(error);
      const status = authStatus !== 500 ? authStatus
        : code === 'product-item-not-found' ? 404
        : code.startsWith('product-') ? 400
        : 500;
      if (status === 500) console.error('RUDI_PRODUCTS_ERROR', code);
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
        const live = await readWishlist(options).catch(() => ({ initialized: false, version: 0, items: [] }));
        const saved = backupSnapshotFromToken(body.backupToken, options)?.wishlist;
        const state = live?.initialized ? live : (saved?.initialized ? saved : live);
        return res.status(200).json({ ok: true, owner, ...state });
      }
      if (operation === 'add') {
        const result = await addWish(body.text, body.url, owner, options);
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
      authorName: actor || authorName,
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

module.exports.correctRecipientsForSession = correctRecipientsForSession;
