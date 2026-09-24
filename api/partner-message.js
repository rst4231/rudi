const crypto = require('node:crypto');
const { waitUntil } = require('@vercel/functions');
const { resolveTelegramBotToken } = require('./products-bought.cjs');
const { readPartnerMessage, writePartnerMessage } = require('./partner-message-store.cjs');
const { assertAllowedTelegramUser } = require('./rudi-access.cjs');
const { authorizeWithSession, setSessionCookie, clearSessionCookie, savePin, verifyPin, restorePinRecord, readPinRecord } = require('./rudi-session.cjs');
const { passkeyStatus, registrationOptions, verifyRegistration, authenticationOptions, verifyAuthentication, restorePasskeys, readPasskeys } = require('./rudi-passkeys.cjs');
const { readAuthRecord, savePinRecord: saveDurablePinRecord, savePasskeys: saveDurablePasskeys } = require('./rudi-auth-db.cjs');
const { readHolidayHighlights } = require('./holiday-highlights-store.cjs');
const { getHolidayCalendar } = require('./holiday-calendar.cjs');
const { saveOAuthState, consumeOAuthState, saveToken, readToken, clearToken } = require('./ticktick-store.cjs');
const { decodeSetupKey, saveCalendarUrl, readCalendarUrl, getWorkWeek } = require('./work-calendar.cjs');
const { readWishlist, addWish, toggleWish, removeWish, restoreWish } = require('./wishlist-store.cjs');
const {
  readProductList,
  readProductListRaw,
  restoreProductListSnapshot,
  normalizeProductListState,
  addProducts,
  removeProduct,
  toggleProductChecked,
  markCheckedProductsBought,
  markProductBought,
  clearProducts,
  restoreProducts,
} = require('./product-list-store.cjs');
const {
  decodeSetupKey: decodeNotificationSetupKey,
  saveRecipient,
  saveRecipients,
  readRecipients,
  normalizeRecipients,
  recipientFor,
  readMessageNotice,
  saveMessageNotice,
} = require('./partner-notification-store.cjs');
const {
  decodeSetupKey: decodeAlbumSetupKey,
  saveAlbumConfig,
  readAlbumConfig,
  getLatestPhotos,
} = require('./shared-album.cjs');
const { readDailyMood, setDailyMood, moodView, restoreDailyMoodState, readDailyMoodState } = require('./daily-mood-store.cjs');
const { generateRecipeSuggestions, generateRecipeDetail } = require('./recipe-ai.cjs');
const { generateDateIdeas } = require('./date-ai.cjs');
const { readDateGenerationQuota, recordSuccessfulDateGeneration } = require('./date-generation-limit-store.cjs');
const { readSavedItems, addSavedItem, removeSavedItem } = require('./saved-items-store.cjs');
const { readCycleState, bootstrapCycleState, recordCycleStart, normalizeCycleState, cycleStateWithStart, writeCycleState } = require('./cycle-store.cjs');
const { readReactions, setReaction, toggleReaction, restoreReactionState, readReactionState } = require('./reactions-store.cjs');
const {
  readActivityJournal,
  appendActivity,
  observeActivityMarker,
} = require('./activity-journal-store.cjs');
const { readLuluState, markLuluWalk, restoreLuluState } = require('./lulu-store.cjs');
const { readUiPreferences, saveUiPreferences, seedUiPreferences } = require('./ui-preferences-store.cjs');
const { readMarketTicker } = require('./market-ticker.cjs');
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
  completeTickTickTask,
  fetchTask,
  calendarDateKey,
} = require('./ticktick-client.cjs');
const {
  readChecklistAuditState,
  recordChecklistAudit,
  checklistAuditForItem,
} = require('./ticktick-checklist-audit-store.cjs');
const { createStateBackup, restoreStateBackup, openSnapshot, sealSnapshot, mergeUiPreferences, normalizeUiPreferences } = require('./rudi-backup.cjs');
const { getCinemaPremieresCache, getTopicMaintenanceCache } = require('./stateful-cache.cjs');
const { resolveCinemaTopicId } = require('./cinema-topic.cjs');
const { getKnownForumChatId } = require('./topic-maintenance-base.cjs');
const { findForumChatIdInEnv } = require('./forum-chat-id.cjs');
const { loadForumTopicsConfig } = require('./forum-topics-config.cjs');
const { readFeedSnapshot, updateFeedSections } = require('./feed-store.cjs');
const { telegramSendMessage, telegramDeleteMessage, sendToAllRecipients, escapeTelegramHtml } = require('./telegram-notifications.cjs');

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
  if (code === 'rudi-session-required' || code === 'rudi-session-invalid' || code === 'rudi-session-expired' || code === 'rudi-pin-invalid') return 401;
  if (code === 'rudi-pin-rate-limited') return 429;
  if (code === 'rudi-pin-not-configured') return 409;
  if (code === 'rudi-pin-format') return 400;
  if (code === 'rudi-auth-db-unavailable') return 503;
  if (code === 'rudi-passkey-not-configured') return 409;
  if (code === 'rudi-passkey-challenge-invalid' || code === 'rudi-passkey-origin-mismatch' || code === 'rudi-passkey-credential-not-found' || code === 'rudi-passkey-registration-failed' || code === 'rudi-passkey-registration-invalid' || code === 'rudi-passkey-authentication-failed') return 400;
  if (code === 'rudi-passkey-host-invalid' || code === 'rudi-passkey-origin-invalid') return 400;
  if (code === 'message-empty' || code === 'message-too-long') return 400;
  return 500;
}

function authorizeInitData(rawInitData, options = {}) {
  const token = options.botToken || resolveTelegramBotToken(options.env || process.env);
  const auth = validateTelegramInitData(rawInitData, token, options.now || Date.now());
  const actor = assertAllowedTelegramUser(auth.user);
  return { ...auth, actor };
}

function authorizeRequest(req, rawInitData, options = {}) {
  const botToken = options.botToken || resolveTelegramBotToken(options.env || process.env);
  return authorizeWithSession(
    req,
    rawInitData,
    (value) => authorizeInitData(value, { ...options, botToken }),
    { botToken, now: options.now || Date.now() }
  );
}

function browserAuthStoreOptions(options = {}) {
  return {
    cache: options.authCache,
    cacheOptions: options.authCacheOptions,
    now: options.now || Date.now(),
  };
}

function durableAuthOptions(options = {}) {
  return {
    fetchImpl: options.fetchImpl || globalThis.fetch,
    botToken: options.botToken || resolveTelegramBotToken(options.env || process.env),
    now: options.now || Date.now(),
  };
}

async function hydrateActorAuth(actor, backupToken, options = {}) {
  const storeOptions = browserAuthStoreOptions(options);
  const dbOptions = durableAuthOptions(options);
  const snapshot = backupSnapshotFromToken(backupToken, options);
  let durable = await readAuthRecord(actor, dbOptions);

  if (!durable?.pinRecord) {
    const cachedPin = await readPinRecord(actor, storeOptions).catch(() => null);
    if (cachedPin?.salt && cachedPin?.hash) {
      durable = await saveDurablePinRecord(actor, cachedPin, dbOptions);
    }
  }

  const backupPin = snapshot?.browserAuth?.pins?.[actor] || null;
  if (!durable?.pinRecord && backupPin?.salt && backupPin?.hash) {
    durable = await saveDurablePinRecord(actor, backupPin, dbOptions);
  }

  if (!(durable?.passkeys?.length)) {
    const cachedPasskeys = await readPasskeys(actor, storeOptions).catch(() => []);
    if (cachedPasskeys.length) {
      durable = await saveDurablePasskeys(actor, cachedPasskeys, dbOptions);
    }
  }

  const backupPasskeys = Array.isArray(snapshot?.browserAuth?.passkeys?.[actor])
    ? snapshot.browserAuth.passkeys[actor]
    : [];
  if (!(durable?.passkeys?.length) && backupPasskeys.length) {
    durable = await saveDurablePasskeys(actor, backupPasskeys, dbOptions);
  }

  if (durable?.pinRecord) {
    await restorePinRecord(actor, durable.pinRecord, storeOptions).catch(() => null);
  }
  if (durable?.passkeys?.length) {
    await restorePasskeys(actor, durable.passkeys, storeOptions).catch(() => null);
  }

  return { durable, snapshot };
}

async function hydrateAllDurablePasskeys(backupToken, options = {}) {
  const result = {};
  for (const actor of ['Рустам', 'Диана']) {
    result[actor] = await hydrateActorAuth(actor, backupToken, options);
  }
  return result;
}

function backupSnapshotWithPin(snapshot, actor, record) {
  const base = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const pins = {
    ...(base.browserAuth?.pins || {}),
    [actor]: record,
  };
  return {
    ...base,
    browserAuth: {
      ...(base.browserAuth || {}),
      pins,
    },
  };
}

async function sendPartnerMessageNotification(actor, options = {}) {
  const recipients = await readRecipients(options);
  const recipientActor = actor === 'Рустам' ? 'Диана' : actor === 'Диана' ? 'Рустам' : '';
  const chatId = recipientFor(actor, recipients);
  if (!recipientActor || !chatId) return { sent: false, reason: 'recipient-not-configured' };

  const previous = await readMessageNotice(recipientActor, options).catch(() => null);

  const sent = await telegramSendMessage(
    chatId,
    `💌 <b>${recipientActor}, для вас оставлено новое послание</b>\n\n<i>Откройте RUDI, чтобы прочитать.</i>`,
    {
      ...options,
      tab: 'home',
      buttonText: 'Открыть RUDI',
    }
  );
  if (previous?.messageId && previous.messageId !== sent.messageId) {
    try {
      await telegramDeleteMessage(previous.chatId || chatId, previous.messageId, options);
    } catch (error) {
      console.warn('RUDI_PARTNER_NOTIFICATION_DELETE_WARN', String(error?.message || error));
    }
  }
  if (sent.messageId) {
    await saveMessageNotice(recipientActor, { chatId, messageId: sent.messageId }, options);
  }
  return { sent: true, messageId: sent.messageId || null };
}

async function sendActivityNotification(text, _tab, options = {}) {
  try {
    return await sendToAllRecipients(text, options);
  } catch (error) {
    console.warn('RUDI_ACTIVITY_NOTIFICATION_WARN', String(error?.message || error));
    return [];
  }
}

function luluWalkStatusLabel(value, now = Date.now()) {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return 'время не указано';
  const time = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
  const key = moscowDateKey(date.getTime());
  const today = moscowDateKey(now);
  const yesterday = moscowDateKey(Number(now) - 24 * 60 * 60 * 1000);
  if (key === today) return 'сегодня в ' + time;
  if (key === yesterday) return 'вчера в ' + time;
  const day = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: 'numeric',
    month: 'short',
  }).format(date).replace('.', '');
  return day + ' в ' + time;
}

function luluWalkNotificationText(actor, walkedAt, now = Date.now()) {
  const action = actor === 'Диана' ? 'погуляла' : 'погулял';
  return `🐾 <b>${actor} ${action} с Lulu</b>\nПоследняя прогулка: <b>${escapeTelegramHtml(luluWalkStatusLabel(walkedAt, now))}</b>`;
}

async function sendLuluWalkNotificationToPartner(actor, walkedAt, options = {}) {
  const recipient = actor === 'Рустам' ? 'Диана' : actor === 'Диана' ? 'Рустам' : '';
  if (!recipient) return { sent:false, reason:'actor-invalid' };
  try {
    const recipients = options.recipients || await readRecipients(options);
    const chatId = Number(recipients?.[recipient]);
    if (!Number.isInteger(chatId) || chatId <= 0) {
      return { sent:false, recipient, reason:'recipient-not-configured' };
    }
    const result = await telegramSendMessage(
      chatId,
      luluWalkNotificationText(actor, walkedAt, options.now || Date.now()),
      {
        ...options,
        tab:'home',
        buttonText:'Открыть RUDI',
      }
    );
    return { sent:true, recipient, ...result };
  } catch (error) {
    console.warn('RUDI_LULU_NOTIFICATION_WARN', String(error?.message || error));
    return { sent:false, recipient, error:String(error?.message || error) };
  }
}

function boughtNotificationText(actor) {
  return `🛒 <b>${actor === 'Диана' ? 'Диана купила продукты' : 'Рустам купил продукты'}</b>`;
}

function wishlistNotificationText(owner, text) {
  const action = owner === 'Диана' ? 'добавила' : 'добавил';
  return `🎁 <b>${owner} ${action} в вишлист</b>\n<i>${escapeTelegramHtml(String(text || '').trim())}</i>`;
}

async function sendWishlistNotificationToPartner(owner, text, options = {}) {
  const recipient = owner === 'Рустам' ? 'Диана' : owner === 'Диана' ? 'Рустам' : '';
  if (!recipient) return { sent:false, reason:'actor-invalid' };
  try {
    const recipients = options.recipients || await readRecipients(options);
    const chatId = Number(recipients?.[recipient]);
    if (!Number.isInteger(chatId) || chatId <= 0) return { sent:false, reason:'recipient-not-configured' };
    const result = await telegramSendMessage(chatId, wishlistNotificationText(owner,text), {
      ...options,
      tab:'wishlist',
      buttonText:'Открыть вишлист',
    });
    return { sent:true, recipient, ...result };
  } catch (error) {
    console.warn('RUDI_WISHLIST_NOTIFICATION_WARN', String(error?.message || error));
    return { sent:false, recipient, error:String(error?.message || error) };
  }
}

async function refreshBackupToken(previousSnapshot, options = {}) {
  return createStateBackup({ ...options, previousSnapshot }).catch((error) => {
    console.warn('RUDI_STATE_BACKUP_REFRESH_WARN', String(error?.message || error));
    return '';
  });
}

function activityVerb(actor, male, female) {
  return actor === 'Диана' ? female : male;
}

function compactActivityValues(values) {
  const rows = (Array.isArray(values) ? values : [values])
    .map((value) => String(value || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (!rows.length) return '';
  const visible = rows.slice(0, 3).join(', ');
  return rows.length > 3 ? visible + ' +' + (rows.length - 3) : visible;
}

function activityDigest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex').slice(0, 24);
}

async function recordActivity(input, options = {}) {
  try {
    return await appendActivity(input, options);
  } catch (error) {
    console.warn('RUDI_ACTIVITY_JOURNAL_WARN', String(error?.message || error));
    return null;
  }
}

function reactionActivityView(target) {
  const type = String(target?.type || '').trim();
  const key = String(target?.key || '').trim();
  if (type === 'partner-message') return { label: 'послание', targetTab: 'home' };
  if (type === 'photo-memory') return { label: 'фото-воспоминание', targetTab: 'photos' };
  if (type === 'feed') {
    if (key.startsWith('facts:')) return { label: 'факты в Ленте', targetTab: 'feed' };
    if (key.startsWith('concerts:')) return { label: 'концерты в Ленте', targetTab: 'feed' };
    if (key.startsWith('standup:')) return { label: 'стендап в Ленте', targetTab: 'feed' };
    if (key.startsWith('cinema:')) return { label: 'кино в Ленте', targetTab: 'feed' };
    return { label: 'материал в Ленте', targetTab: 'feed' };
  }
  return { label: 'материал', targetTab: 'home' };
}

async function recordLikeActivity(target, actor, options = {}) {
  const view = reactionActivityView(target);
  return recordActivity({
    type: 'like',
    actor,
    text: actor + ' ' + activityVerb(actor, 'лайкнул', 'лайкнула') + ' ' + view.label,
    icon: '❤️',
    targetTab: view.targetTab,
  }, options);
}

const MOOD_ACTIVITY = {
  low: { label: 'Не очень', emoji: '😔' },
  ok: { label: 'Нормально', emoji: '😐' },
  great: { label: 'Отлично', emoji: '😄' },
};

function moodActivityText(actor, previousMood, nextMood) {
  const next = MOOD_ACTIVITY[nextMood];
  if (!next) return '';
  const previous = MOOD_ACTIVITY[previousMood];
  if (!previous) {
    return actor + ' ' + activityVerb(actor, 'отметил', 'отметила') + ' настроение: ' + next.emoji + ' ' + next.label;
  }
  return actor + ' ' + activityVerb(actor, 'изменил', 'изменила') + ' настроение: '
    + previous.emoji + ' ' + previous.label + ' → ' + next.emoji + ' ' + next.label;
}

function taskCompletedNotificationText(actor, title) {
  const action = actor === 'Диана' ? 'выполнила задачу' : 'выполнил задачу';
  return `✅ <b>${actor} ${action}</b>\n<i>${escapeTelegramHtml(String(title || 'Совместное дело').trim())}</i>`;
}

function checklistCompletedNotificationText(actor, itemTitle, taskTitle) {
  const action = actor === 'Диана' ? 'выполнила пункт' : 'выполнил пункт';
  const parent = String(taskTitle || '').trim();
  return `☑️ <b>${actor} ${action}</b>\n<i>${escapeTelegramHtml(String(itemTitle || 'Пункт задачи').trim())}</i>${parent ? `\nЗадача: <i>${escapeTelegramHtml(parent)}</i>` : ''}`;
}

const MOOD_NOTICE = {
  low: { phrase: 'настроение не очень', emoji: '😔' },
  ok: { phrase: 'нормальное настроение', emoji: '😐' },
  great: { phrase: 'отличное настроение', emoji: '😄' },
};

function moodNotificationText(recipient, actor, mood) {
  const view = MOOD_NOTICE[String(mood || '')];
  if (!view) return '';
  const actorGenitive = actor === 'Рустам' ? 'Рустама' : actor === 'Диана' ? 'Дианы' : actor;
  return `${view.emoji} <b>${recipient}, у ${actorGenitive} сейчас ${view.phrase}</b>\n<i>${view.emoji} Настроение обновлено в RUDI</i>`;
}

async function sendMoodNotificationToPartner(actor, mood, options = {}) {
  const recipient = actor === 'Рустам' ? 'Диана' : actor === 'Диана' ? 'Рустам' : '';
  if (!recipient) return { sent: false, reason: 'actor-invalid' };
  try {
    const recipients = options.recipients || await readRecipients(options);
    const chatId = Number(recipients?.[recipient]);
    if (!Number.isInteger(chatId) || chatId <= 0) {
      return { sent: false, reason: 'recipient-not-configured' };
    }
    const result = await telegramSendMessage(
      chatId,
      moodNotificationText(recipient, actor, mood),
      options
    );
    return { sent: true, recipient, ...result };
  } catch (error) {
    console.warn('RUDI_MOOD_NOTIFICATION_WARN', String(error?.message || error));
    return { sent: false, recipient, error: String(error?.message || error) };
  }
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

  const newerVersion=(left,right)=>{
    if(!left) return right||null;
    if(!right) return left;
    return Number(right?.version||0)>Number(left?.version||0)?right:left;
  };
  const newerTime=(left,right,field='updatedAt')=>{
    if(!left) return right||null;
    if(!right) return left;
    const a=Date.parse(String(left?.[field]||''))||0;
    const b=Date.parse(String(right?.[field]||''))||0;
    return b>a?right:left;
  };

  return {
    ...base,
    ...overlay,
    partnerMessage: newerTime(base.partnerMessage, overlay.partnerMessage),
    wishlist: newerVersion(base.wishlist, overlay.wishlist),
    products: newerVersion(base.products, overlay.products),
    savedItems: newerVersion(base.savedItems, overlay.savedItems),
    ticktickChecklistAudit: newerVersion(base.ticktickChecklistAudit, overlay.ticktickChecklistAudit),
    ticktickToken: overlay.ticktickToken || base.ticktickToken || null,
    calendarUrl: overlay.calendarUrl || base.calendarUrl || '',
    albumConfig: overlay.albumConfig || base.albumConfig || null,
    cycle: newerVersion(base.cycle, overlay.cycle),
    activityJournal: newerVersion(base.activityJournal, overlay.activityJournal),
    luluState: newerVersion(base.luluState, overlay.luluState),
    carState: newerTime(base.carState, overlay.carState),
    dailyMood: newerVersion(base.dailyMood, overlay.dailyMood),
    reactions: newerVersion(base.reactions, overlay.reactions),
    uiPreferences: mergeUiPreferences(base.uiPreferences, overlay.uiPreferences),
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

function feedPreviewBaseUrl(options = {}) {
  const env = options.env || process.env;
  const explicit = String(options.appBaseUrl || env.RUDI_APP_URL || '').trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const vercelHost = String(env.VERCEL_PROJECT_PRODUCTION_URL || env.VERCEL_URL || '').trim();
  if (vercelHost) return /^https?:\/\//i.test(vercelHost)
    ? vercelHost.replace(/\/+$/, '')
    : ('https://' + vercelHost.replace(/\/+$/, ''));
  return 'https://spb-daily-guide-bot.vercel.app';
}

async function refreshFeedFromPreviewIfNeeded(feed, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const date = moscowDateKey(now);
  const hasToday = feed?.date === date
    && Array.isArray(feed?.sections?.facts?.parts) && feed.sections.facts.parts.length
    && Array.isArray(feed?.sections?.events?.parts) && feed.sections.events.parts.length;
  if (hasToday) return feed;

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') return feed;

  try {
    const response = await fetchImpl(feedPreviewBaseUrl(options) + '/api/preview?date=' + encodeURIComponent(date), {
      method: 'GET',
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response?.ok) return feed;
    const preview = await response.json().catch(() => null);
    const sections = {};
    const facts = Array.isArray(preview?.sections?.facts?.parts)
      ? preview.sections.facts.parts.map((value) => String(value || '').trim()).filter(Boolean)
      : [];
    const events = Array.isArray(preview?.sections?.events?.parts)
      ? preview.sections.events.parts.map((value) => String(value || '').trim()).filter(Boolean)
      : [];
    if (facts.length) sections.facts = { parts: facts, source: 'preview-bootstrap' };
    if (events.length) sections.events = { parts: events, source: 'preview-bootstrap' };
    if (!Object.keys(sections).length) return feed;
    return await updateFeedSections(sections, { ...options, date, now });
  } catch (error) {
    console.warn('RUDI_FEED_PREVIEW_BOOTSTRAP_WARN', String(error?.message || error));
    return feed;
  }
}

async function handleTickTick(req, res, action, options = {}) {
  if (action === 'connect') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    try {
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      authorizeRequest(req, body.initData, options);
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
      authorizeRequest(req, body.initData, options);
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


  if (action === 'today') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    let body;
    try {
      body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      authorizeRequest(req, body.initData, options);
    } catch (error) {
      return res.status(statusForError(error)).json({ ok: false, error: String(error?.message || error) });
    }

    if (!credentialsConfigured(options.env || process.env)) {
      return res.status(503).json({ ok: false, connected: false, configured: false, tasks: [], error: 'ticktick-not-configured' });
    }
    const config = await loadTickTickConfig(options);
    if (!config.enabled) return res.status(200).json({ ok: true, enabled: false, connected: true, writable: false, tasks: [] });

    const token = await readTickTickTokenWithBackup(body, options);
    if (!token?.accessToken) {
      return res.status(401).json({
        ok: false, connected: false, configured: true, tasks: [],
        connectUrl: '/api/ticktick/connect', error: 'ticktick-not-connected',
      });
    }

    try {
      const now = options.now ? new Date(options.now) : new Date();
      const data = await fetchProjectData(token.accessToken, config.projectId, options);
      const sourceTasks = Array.isArray(data?.tasks) ? data.tasks : [];
      const sourceById = new Map(sourceTasks.map((task) => [String(task?.id || ''), task]));
      const auditState = await readChecklistAuditState(options).catch(() => ({ entries: {} }));
      const calendar = buildTickTickCalendar(sourceTasks, now, 'month');
      const today = calendarDateKey(now);
      const tasks = (calendar.days.find((day) => day.date === today)?.events || [])
        .filter((event) => !event.completed)
        .map((event) => {
          const source = sourceById.get(String(event?.id || '')) || {};
          const checklist = visibleChecklistItems(source.items, 50).map((item) => {
            const audit = checklistAuditForItem(auditState, source.id, item?.id, false);
            return {
              id: String(item?.id || ''),
              title: String(item?.title || '').trim().slice(0, 500),
              completed: false,
              changedBy: audit?.actor || '',
              changedAt: audit?.changedAt || '',
            };
          }).filter((item) => item.title);
          return {
            ...event,
            date: today,
            description: String(source.desc || source.content || '').trim().slice(0, 5000),
            checklist,
          };
        });
      return res.status(200).json({
        ok: true, connected: true, enabled: true,
        writable: tokenHasWriteScope(token) !== false,
        project: data?.project?.name || 'Общий',
        date: today, tasks,
      });
    } catch (error) {
      if (String(error?.message || '') === 'ticktick-token-invalid') {
        await clearToken(options);
        return res.status(401).json({
          ok: false, connected: false, configured: true, tasks: [],
          connectUrl: '/api/ticktick/connect', error: 'ticktick-reconnect-required',
        });
      }
      console.error('RUDI_TICKTICK_TODAY_ERROR', String(error?.message || error));
      return res.status(502).json({ ok: false, connected: true, tasks: [], error: 'ticktick-unavailable' });
    }
  }

  if (action === 'task-complete') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    let body;
    let actor;
    try {
      body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      ({ actor } = authorizeRequest(req, body.initData, options));
    } catch (error) {
      return res.status(statusForError(error)).json({ ok: false, error: String(error?.message || error) });
    }

    const taskId = String(body.taskId || '').trim();
    if (!taskId) return res.status(400).json({ ok: false, error: 'ticktick-task-complete-invalid' });
    if (!credentialsConfigured(options.env || process.env)) {
      return res.status(503).json({ ok: false, configured: false, error: 'ticktick-not-configured' });
    }

    const config = await loadTickTickConfig(options);
    if (!config.enabled) return res.status(409).json({ ok: false, enabled: false, error: 'ticktick-disabled' });
    const token = await readTickTickTokenWithBackup(body, options);
    if (!token?.accessToken) {
      return res.status(401).json({ ok: false, connected: false, reconnectRequired: true, error: 'ticktick-not-connected' });
    }
    if (tokenHasWriteScope(token) === false) {
      return res.status(403).json({
        ok: false, connected: true, writable: false,
        reconnectRequired: true, error: 'ticktick-write-permission-required',
      });
    }

    try {
      const task = await fetchTask(token.accessToken, config.projectId, taskId, options);
      const wasOpen = Number(task?.status ?? 0) === 0;
      await completeTickTickTask(token.accessToken, config.projectId, taskId, options);
      if (wasOpen) {
        await sendActivityNotification(
          taskCompletedNotificationText(actor, task?.title),
          'schedule',
          options
        );
        await recordActivity({
          type: 'task-complete',
          actor,
          text: actor + ' ' + activityVerb(actor, 'выполнил', 'выполнила') + ' задачу: ' + String(task?.title || 'Совместное дело').trim(),
          icon: '✅',
          targetTab: 'schedule',
        }, options);
      }
      return res.status(200).json({
        ok: true,
        connected: true,
        writable: true,
        taskId,
        completed: true,
        title: String(task?.title || '').trim(),
      });
    } catch (error) {
      const code = String(error?.message || error);
      if (code === 'ticktick-token-invalid') {
        await clearToken(options);
        return res.status(401).json({ ok: false, connected: false, reconnectRequired: true, error: 'ticktick-reconnect-required' });
      }
      if (code === 'ticktick-write-forbidden') {
        return res.status(403).json({
          ok: false, connected: true, writable: false,
          reconnectRequired: true, error: 'ticktick-write-permission-required',
        });
      }
      if (code === 'ticktick-task-not-found') return res.status(404).json({ ok: false, connected: true, error: code });
      if (code === 'ticktick-task-complete-invalid') return res.status(400).json({ ok: false, connected: true, error: code });
      console.error('RUDI_TICKTICK_TASK_COMPLETE_ERROR', code);
      return res.status(502).json({ ok: false, connected: true, error: 'ticktick-update-unavailable' });
    }
  }


  if (action === 'calendar') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    let body;
    try {
      body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      authorizeRequest(req, body.initData, options);
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
        writable: tokenHasWriteScope(token) !== false,
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
      ({ actor } = authorizeRequest(req, body.initData, options));
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

      const wasCompleted = Number(updated?.previousItem?.status || 0) === 1;
      if (body.completed && !wasCompleted) {
        await sendActivityNotification(
          checklistCompletedNotificationText(actor, updated?.item?.title, updated?.task?.title),
          'schedule',
          options
        );
        const itemTitle = String(updated?.item?.title || 'Пункт задачи').trim();
        const taskTitle = String(updated?.task?.title || '').trim();
        await recordActivity({
          type: 'checklist-complete',
          actor,
          text: actor + ' ' + activityVerb(actor, 'выполнил', 'выполнила') + ' пункт: ' + itemTitle + (taskTitle ? ' · ' + taskTitle : ''),
          icon: '☑️',
          targetTab: 'schedule',
        }, options);
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

  if (action === 'lulu') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    try {
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      const { actor } = authorizeRequest(req, body.initData, options);
      const operation = String(body.operation || 'get').trim();
      const previousSnapshot = backupSnapshotFromToken(body.backupToken, options);

      if (previousSnapshot?.luluState?.initialized) {
        await restoreLuluState(previousSnapshot.luluState, {
          ...options,
          cacheOptions: { ...(options.cacheOptions || {}), confirmWrites: false },
        }).catch(() => null);
      }

      if (operation === 'get') {
        const lulu = await readLuluState(options);
        return res.status(200).json({ ok: true, actor, lulu });
      }

      if (operation === 'walk') {
        const lulu = await markLuluWalk(actor, options);
        const walkedAt = String(lulu?.lastWalk?.walkedAt || new Date(options.now || Date.now()).toISOString());
        const actionWord = actor === 'Диана' ? 'погуляла' : 'погулял';
        await recordActivity({
          type: 'lulu-walk',
          actor,
          text: actor + ' ' + actionWord + ' с Lulu',
          icon: '🐾',
          targetTab: 'home',
          dedupeKey: 'lulu-walk:' + walkedAt,
          createdAt: walkedAt,
        }, options);

        const notificationTask = sendLuluWalkNotificationToPartner(
          actor,
          walkedAt,
          options
        );
        try { waitUntil(notificationTask); } catch (_) { notificationTask.catch(() => {}); }

        const backupToken = await refreshBackupToken(previousSnapshot, options);
        return res.status(200).json({
          ok: true,
          actor,
          lulu,
          backupToken,
          notification: { sent: false, pending: true },
        });
      }

      return res.status(400).json({ ok: false, error: 'lulu-operation-invalid' });
    } catch (error) {
      const code = String(error?.message || error);
      const authStatus = statusForError(error);
      const status = authStatus !== 500 ? authStatus : code.startsWith('lulu-') ? 400 : 500;
      if (status === 500) console.error('RUDI_LULU_ERROR', code);
      return res.status(status).json({ ok: false, error: code });
    }
  }

  if (action === 'cycle') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    try {
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      const { actor } = authorizeRequest(req, body.initData, options);
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
      authorizeRequest(req, body.initData, options);

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
      authorizeRequest(req, body.initData, options);
      const backupSnapshot = backupSnapshotFromToken(body.backupToken, options);
      const album = await getLatestPhotos({
        ...options,
        albumConfig: backupSnapshot?.albumConfig || null,
      });
      if (album?.configured) {
        const signature = [
          Number(album.totalCount || album.photos?.length || 0),
          String(album.photos?.[0]?.id || ''),
        ].join(':');
        await observeActivityMarker(
          'shared-album',
          signature,
          {
            type: 'photo',
            text: 'В общем альбоме появилось новое фото',
            icon: '📷',
            targetTab: 'photos',
            dedupeKey: 'photo:' + signature,
          },
          options
        ).catch(() => null);
      }
      return res.status(200).json({ ok: true, ...album });
    } catch (error) {
      const status = statusForError(error) === 500 ? 502 : statusForError(error);
      console.error('RUDI_SHARED_ALBUM_ERROR', String(error?.message || error));
      return res.status(status).json({ ok: false, error: String(error?.message || error) });
    }
  }

  if (action === 'passkey') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const operation = String(body.operation || 'status').trim();
    const botToken = options.botToken || resolveTelegramBotToken(options.env || process.env);
    const storeOptions = browserAuthStoreOptions(options);
    try {
      if (operation === 'auth-options') {
        await hydrateAllDurablePasskeys(body.backupToken, options);
        const publicKey = await authenticationOptions(req, storeOptions);
        return res.status(200).json({ ok: true, publicKey });
      }

      if (operation === 'auth-verify') {
        await hydrateAllDurablePasskeys(body.backupToken, options);
        const verified = await verifyAuthentication(req, body.challenge, body.response, storeOptions);
        const rows = await readPasskeys(verified.actor, storeOptions);
        await saveDurablePasskeys(verified.actor, rows, durableAuthOptions(options));
        setSessionCookie(res, verified.actor, botToken, { now: options.now || Date.now() });
        const previousSnapshot = backupSnapshotFromToken(body.backupToken, options);
        const backupToken = await createStateBackup({ ...options, previousSnapshot });
        return res.status(200).json({ ok: true, actor: verified.actor, source: 'passkey', backupToken });
      }

      const session = authorizeRequest(req, body.initData, options);
      await hydrateActorAuth(session.actor, body.backupToken, options);

      if (operation === 'status') {
        const status = await passkeyStatus(req, session.actor, storeOptions);
        return res.status(200).json({ ok: true, actor: session.actor, ...status });
      }

      if (operation === 'register-options') {
        const publicKey = await registrationOptions(req, session.actor, storeOptions);
        return res.status(200).json({ ok: true, actor: session.actor, publicKey });
      }

      if (operation === 'register-verify') {
        const result = await verifyRegistration(req, session.actor, body.challenge, body.response, storeOptions);
        const rows = await readPasskeys(session.actor, storeOptions);
        await saveDurablePasskeys(session.actor, rows, durableAuthOptions(options));
        const previousSnapshot = backupSnapshotFromToken(body.backupToken, options);
        const backupToken = await createStateBackup({ ...options, previousSnapshot });
        return res.status(200).json({ ok: true, ...result, backupToken });
      }

      return res.status(400).json({ ok: false, error: 'passkey-operation-invalid' });
    } catch (error) {
      return res.status(statusForError(error)).json({ ok: false, error: String(error?.message || error) });
    }
  }

  if (action === 'browser-auth') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const operation = String(body.operation || 'status').trim();
    const botToken = options.botToken || resolveTelegramBotToken(options.env || process.env);
    try {
      if (operation === 'login') {
        const actor = String(body.actor || '');
        const hydrated = await hydrateActorAuth(actor, body.backupToken, options);
        if (!hydrated.durable?.pinRecord) throw new Error('rudi-pin-not-configured');
        const verified = await verifyPin(req, actor, body.pin, {
          ...browserAuthStoreOptions(options),
          pinRecord: hydrated.durable.pinRecord,
        });
        setSessionCookie(res, verified.actor, botToken, { now: options.now || Date.now() });
        return res.status(200).json({ ok: true, actor: verified.actor, source: 'pin' });
      }

      if (operation === 'logout') {
        clearSessionCookie(res);
        return res.status(200).json({ ok: true });
      }

      if (operation === 'create-pin') {
        const telegram = authorizeInitData(body.initData, options);
        const previousSnapshot = backupSnapshotFromToken(body.backupToken, options);
        const result = await savePin(telegram.actor, body.pin, browserAuthStoreOptions(options));
        await saveDurablePinRecord(telegram.actor, result.record, durableAuthOptions(options));
        setSessionCookie(res, telegram.actor, botToken, { now: options.now || Date.now() });
        const backupToken = await createStateBackup({
          ...options,
          previousSnapshot: backupSnapshotWithPin(previousSnapshot, telegram.actor, result.record),
        });
        return res.status(200).json({ ok: true, actor: telegram.actor, configured: true, updatedAt: result.updatedAt, backupToken });
      }

      if (operation === 'status') {
        const session = authorizeRequest(req, body.initData, options);
        const hydrated = await hydrateActorAuth(session.actor, body.backupToken, options);
        const configured = Boolean(hydrated.durable?.pinRecord);
        return res.status(200).json({ ok: true, actor: session.actor, source: session.source, pinConfigured: configured });
      }

      return res.status(400).json({ ok: false, error: 'browser-auth-operation-invalid' });
    } catch (error) {
      return res.status(statusForError(error)).json({ ok: false, error: String(error?.message || error) });
    }
  }

  if (action === 'app-auth') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    try {
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      const session = authorizeRequest(req, body.initData, options);
      if (session.source === 'telegram') {
        const botToken = options.botToken || resolveTelegramBotToken(options.env || process.env);
        setSessionCookie(res, session.actor, botToken, { now: options.now || Date.now() });
      }
      return res.status(200).json({ ok: true, actor: session.actor, source: session.source });
    } catch (error) {
      return res.status(statusForError(error)).json({ ok: false, error: String(error?.message || error) });
    }
  }

  if (action === 'app-bootstrap') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    try {
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      const { actor, user } = authorizeRequest(req, body.initData, options);
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
      const backupUiPreferences = normalizeUiPreferences(previousSnapshot?.uiPreferences)?.[actor] || null;
      let sharedUiPreferences = await readUiPreferences(actor, options).catch(() => null);
      if (!sharedUiPreferences?.initialized && backupUiPreferences) {
        sharedUiPreferences = await seedUiPreferences(actor, backupUiPreferences, {
          ...options,
          cacheOptions: { ...(options.cacheOptions || {}), confirmWrites: false },
        }).catch(() => sharedUiPreferences);
      }
      const effectiveUiPreferences = sharedUiPreferences?.initialized
        ? sharedUiPreferences
        : backupUiPreferences;

      const correctedSnapshot = mergeBackupSnapshots(previousSnapshot, {
        version: 2,
        createdAt: new Date(options.now || Date.now()).toISOString(),
        recipients,
        uiPreferences: effectiveUiPreferences ? { [actor]: effectiveUiPreferences } : null,
      });
      try {
        if (recipients?.['Рустам'] && recipients?.['Диана']) {
          await saveRecipients(recipients, {
            ...options,
            cacheOptions: { ...(options.cacheOptions || {}), confirmWrites: false },
          });
        } else if (user?.id) {
          await saveRecipient(actor, user?.id, {
            ...options,
            cacheOptions: { ...(options.cacheOptions || {}), confirmWrites: false },
          });
        }
      } catch (error) {
        console.warn('RUDI_RECIPIENT_SESSION_FIX_WARN', String(error?.message || error));
      }

      const partnerActor = actor === 'Рустам' ? 'Диана' : 'Рустам';
      const selfId = Number(user?.id) || Number(recipients?.[actor]) || 0;
      const partnerId = recipientFor(actor, recipients);
      const [holidays, selfProfile, partnerProfile, backupToken] = await Promise.all([
        holidaysPromise,
        readTelegramProfile(selfId, actor, options),
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
        uiPreferences: effectiveUiPreferences || null,
        backupToken,
      });
    } catch (error) {
      return res.status(statusForError(error)).json({ ok: false, error: String(error?.message || error) });
    }
  }

  if (action === 'state-backup-recovery') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    try {
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      authorizeRequest(req, body.initData, options);
      const snapshot = backupSnapshotFromToken(body.backupToken, options);
      if (!snapshot) return res.status(400).json({ ok: false, error: 'backup-invalid' });

      const saved = snapshot.products;
      const savedItems = Array.isArray(saved?.items) ? saved.items : [];
      const savedHistory = Array.isArray(saved?.history) ? saved.history : [];
      const operation = String(body.operation || 'preview').trim();

      if (operation === 'preview') {
        return res.status(200).json({
          ok: true,
          available: Boolean(saved?.initialized && savedItems.length),
          itemCount: savedItems.length,
          historyCount: savedHistory.length,
          createdAt: String(snapshot.createdAt || ''),
        });
      }

      if (operation === 'restore-products') {
        if (!saved?.initialized || !savedItems.length) {
          return res.status(400).json({ ok: false, error: 'backup-products-empty' });
        }
        const current = await readProductListRaw(options).catch(() => ({ initialized: false, version: 0, items: [], history: [] }));
        if (Array.isArray(current?.items) && current.items.length) {
          return res.status(409).json({ ok: false, error: 'product-list-not-empty' });
        }
        const restored = await restoreProductListSnapshot(saved, options);
        console.info('RUDI_PRODUCTS_BACKUP_RECOVERED', savedItems.length);
        return res.status(200).json({ ok: true, restored: true, ...restored });
      }

      return res.status(400).json({ ok: false, error: 'backup-recovery-operation-invalid' });
    } catch (error) {
      const code = String(error?.message || error);
      const status = statusForError(error);
      if (status === 500) console.error('RUDI_STATE_BACKUP_RECOVERY_ERROR', code);
      return res.status(status === 500 ? 400 : status).json({ ok: false, error: code });
    }
  }

  if (action === 'market-ticker') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    try {
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      const { actor } = authorizeRequest(req, body.initData, options);
      const ticker = await readMarketTicker({
        ...options,
        marketTickerCache: options.marketTickerCache,
      });
      return res.status(200).json({ ok: true, actor, ...ticker });
    } catch (error) {
      const code = String(error?.message || error);
      console.warn('RUDI_MARKET_TICKER_WARN', code);
      return res.status(502).json({ ok: false, error: 'market-ticker-unavailable' });
    }
  }

  if (action === 'ui-preferences') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    try {
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      const { actor } = authorizeRequest(req, body.initData, options);
      const previousSnapshot = backupSnapshotFromToken(body.backupToken, options);
      const backupUiPreferences = normalizeUiPreferences(previousSnapshot?.uiPreferences)?.[actor] || null;
      let uiPreferences = await readUiPreferences(actor, options).catch(() => null);
      if (!uiPreferences?.initialized && backupUiPreferences) {
        uiPreferences = await seedUiPreferences(actor, backupUiPreferences, {
          ...options,
          cacheOptions: { ...(options.cacheOptions || {}), confirmWrites: false },
        }).catch(() => uiPreferences);
      }
      return res.status(200).json({
        ok: true,
        actor,
        uiPreferences: uiPreferences?.initialized ? uiPreferences : backupUiPreferences,
      });
    } catch (error) {
      const code = String(error?.message || error);
      return res.status(statusForError(error)).json({ ok: false, error: code });
    }
  }

  if (action === 'state-backup') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    try {
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      const { actor, user } = authorizeRequest(req, body.initData, options);
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
        } else if (user?.id) {
          await saveRecipient(actor, user?.id, {
            ...options,
            cacheOptions: { ...(options.cacheOptions || {}), confirmWrites: false },
          });
        }
      } catch {}
      let sharedUiPreferences;
      if (body.uiPreferences && typeof body.uiPreferences === 'object') {
        sharedUiPreferences = await saveUiPreferences(actor, body.uiPreferences, {
          ...options,
          cacheOptions: { ...(options.cacheOptions || {}), confirmWrites: false },
        });
      } else {
        sharedUiPreferences = await readUiPreferences(actor, options).catch(() => null);
      }
      const incomingUi = sharedUiPreferences?.initialized
        ? { [actor]: sharedUiPreferences }
        : null;
      const correctedSnapshot = mergeBackupSnapshots(previousSnapshot, {
        version: 2,
        createdAt: new Date(options.now || Date.now()).toISOString(),
        recipients: correctedRecipients,
        uiPreferences: incomingUi,
      });
      const backupToken = await createStateBackup({ ...options, previousSnapshot: correctedSnapshot });
      return res.status(200).json({
        ok: true,
        backupToken,
        uiPreferences: sharedUiPreferences?.initialized ? sharedUiPreferences : null,
      });
    } catch (error) {
      const code = String(error?.message || error);
      const status = statusForError(error);
      if (status === 500) console.error('RUDI_STATE_BACKUP_ERROR', code);
      return res.status(status).json({ ok: false, error: code });
    }
  }


  if (action === 'activity') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    try {
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      const { actor } = authorizeRequest(req, body.initData, options);
      const [journal, lulu] = await Promise.all([
        readActivityJournal(options),
        readLuluState(options),
      ]);
      return res.status(200).json({ ok: true, actor, ...journal, lulu });
    } catch (error) {
      return res.status(statusForError(error)).json({ ok: false, error: String(error?.message || error) });
    }
  }

  if (action === 'reactions') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    try {
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      const { actor } = authorizeRequest(req, body.initData, options);
      const operation = String(body.operation || 'list').trim();
      const previousSnapshot = backupSnapshotFromToken(body.backupToken, options);
      if (previousSnapshot?.reactions?.initialized) {
        await restoreReactionState(previousSnapshot.reactions, options).catch(()=>null);
      }

      if (operation === 'list') {
        const reactions = await readReactions(body.targets, options);
        return res.status(200).json({ ok: true, actor, reactions });
      }
      if (operation === 'set') {
        const before = (await readReactions([body.target], options).catch(() => []))[0];
        const reaction = await setReaction(body.target, actor, body.liked, options);
        if (body.liked === true && !before?.likedBy?.includes(actor) && reaction?.likedBy?.includes(actor)) {
          await recordLikeActivity(body.target, actor, options);
        }
        const backupToken=await refreshBackupToken(previousSnapshot,options);
        return res.status(200).json({ ok: true, actor, reaction, backupToken });
      }
      if (operation === 'toggle') {
        const before = (await readReactions([body.target], options).catch(() => []))[0];
        const reaction = await toggleReaction(body.target, actor, options);
        if (!before?.likedBy?.includes(actor) && reaction?.likedBy?.includes(actor)) {
          await recordLikeActivity(body.target, actor, options);
        }
        const backupToken=await refreshBackupToken(previousSnapshot,options);
        return res.status(200).json({ ok: true, actor, reaction, backupToken });
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
      const { actor } = authorizeRequest(req, body.initData, options);
      const previousSnapshot = backupSnapshotFromToken(body.backupToken, options);
      if (previousSnapshot?.dailyMood?.initialized) {
        await restoreDailyMoodState(previousSnapshot.dailyMood, options).catch(()=>null);
      }
      const date = moscowDateKey(options.now || Date.now());
      const operation = String(body.operation || 'get').trim();
      let row;
      let backupToken='';

      if (operation === 'set') {
        const before = await readDailyMood(date, options).catch(() => null);
        const previousMood = before?.moods?.[actor]?.mood || '';
        row = await setDailyMood(date, actor, body.mood, options);
        const nextMood = row?.moods?.[actor]?.mood || '';
        if (nextMood && nextMood !== previousMood) {
          await sendMoodNotificationToPartner(actor, nextMood, options);
          const activityText = moodActivityText(actor, previousMood, nextMood);
          if (activityText) {
            await recordActivity({
              type: 'mood',
              actor,
              text: activityText,
              icon: MOOD_ACTIVITY[nextMood]?.emoji || '🙂',
              targetTab: 'home',
            }, options);
          }
        }
        backupToken=await refreshBackupToken(previousSnapshot,options);
      } else if (operation === 'get') {
        row = await readDailyMood(date, options);
      } else {
        return res.status(400).json({ ok: false, error: 'mood-operation-invalid' });
      }

      return res.status(200).json({ ok: true, ...moodView(row, actor), backupToken });
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
      authorizeRequest(req, body.initData, options);
      const previousSnapshot=backupSnapshotFromToken(body.backupToken,options);
      if(previousSnapshot?.partnerMessage){
        await restoreStateBackup(body.backupToken,{...options,cacheOptions:{...(options.cacheOptions||{}),confirmWrites:false}}).catch(()=>null);
      }
      const message = await readPartnerMessage(options);
      return res.status(200).json({ ok: true, message });
    } catch (error) {
      return res.status(statusForError(error)).json({ ok: false, error: String(error?.message || error) });
    }
  }

  if (action === 'feed') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    try {
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      const { actor } = authorizeRequest(req, body.initData, options);
      const current = await readFeedSnapshot(options);
      const feed = await refreshFeedFromPreviewIfNeeded(current, options);
      return res.status(200).json({ ok: true, actor, ...feed });
    } catch (error) {
      const status = statusForError(error);
      if (status === 500) console.error('RUDI_FEED_ERROR', String(error?.message || error));
      return res.status(status).json({ ok: false, error: String(error?.message || error) });
    }
  }

  if (action === 'holidays') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    try {
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      authorizeRequest(req, body.initData, options);
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
      authorizeRequest(req, body.initData, options);
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
      authorizeRequest(req, body.initData, options);
      const backupSnapshot = backupSnapshotFromToken(body.backupToken, options);
      const view = ['week','month','next-month'].includes(String(body.view || ''))
        ? String(body.view)
        : 'week';
      const week = await getWorkWeek({
        ...options,
        view,
        calendarUrl: backupSnapshot?.calendarUrl || '',
      });
      if (view === 'month' && week?.configured && Array.isArray(week.days)) {
        const signature = activityDigest(week.days.map((day) => ({
          date: day.date,
          working: Boolean(day.working),
          events: (day.events || []).map((event) => ({
            title: event.title,
            allDay: Boolean(event.allDay),
            startTime: event.startTime || '',
            endTime: event.endTime || '',
          })),
        })));
        await observeActivityMarker(
          'work-calendar:' + String(week.weekStart || ''),
          signature,
          {
            type: 'calendar',
            text: 'График Дианы обновился',
            icon: '📅',
            targetTab: 'schedule',
            dedupeKey: 'calendar:' + String(week.weekStart || '') + ':' + signature,
          },
          options
        ).catch(() => null);
      }
      return res.status(200).json({ ok: true, ...week });
    } catch (error) {
      const code = String(error?.message || error);
      const status = statusForError(error) === 500 ? 502 : statusForError(error);
      console.error('RUDI_WORK_CALENDAR_ERROR', code);
      return res.status(status).json({ ok: false, error: code });
    }
  }



  if (action === 'saves') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    try {
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      const { actor } = authorizeRequest(req, body.initData, options);
      const operation = String(body.operation || 'list').trim();
      const previousSnapshot = backupSnapshotFromToken(body.backupToken, options);

      if (previousSnapshot?.savedItems?.initialized) {
        const liveBefore = await readSavedItems(options).catch(() => ({ initialized: false, version: 0, items: [] }));
        if (!liveBefore?.initialized || !(liveBefore.items || []).length) {
          await restoreStateBackup(body.backupToken, {
            ...options,
            cacheOptions: { ...(options.cacheOptions || {}), confirmWrites: false },
          }).catch(() => null);
        }
      }

      if (operation === 'list') {
        const live = await readSavedItems(options).catch(() => ({ initialized: false, version: 0, items: [] }));
        const saved = previousSnapshot?.savedItems;
        const state = live?.initialized ? live : (saved?.initialized ? saved : live);
        return res.status(200).json({ ok: true, actor, ...state });
      }
      if (operation === 'add') {
        const result = await addSavedItem(body.type, body.payload, actor, options);
        const backupToken = await refreshBackupToken(previousSnapshot, options);
        return res.status(200).json({
          ok: true,
          actor,
          ...result.state,
          item: result.item,
          duplicate: result.duplicate,
          backupToken,
        });
      }
      if (operation === 'remove') {
        const result = await removeSavedItem(body.id, options);
        const backupToken = await refreshBackupToken(previousSnapshot, options);
        return res.status(200).json({
          ok: true,
          actor,
          ...result.state,
          removedItem: result.item,
          backupToken,
        });
      }
      return res.status(400).json({ ok: false, error: 'saves-operation-invalid' });
    } catch (error) {
      const code = String(error?.message || error);
      const authStatus = statusForError(error);
      const status = authStatus !== 500 ? authStatus
        : code === 'saved-item-not-found' ? 404
        : code.startsWith('saved-') ? 400
        : 500;
      if (status === 500) console.error('RUDI_SAVES_ERROR', code);
      return res.status(status).json({ ok: false, error: code });
    }
  }

  if (action === 'dates') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    try {
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      const { actor } = authorizeRequest(req, body.initData, options);
      const operation = String(body.operation || 'generate').trim();

      if (operation === 'status') {
        const quota = await readDateGenerationQuota(actor, options);
        return res.status(200).json({ ok: true, actor, operation, quota });
      }

      const quotaBefore = await readDateGenerationQuota(actor, options);
      if (quotaBefore.available <= 0) {
        return res.status(429).json({ ok: false, error: 'date-generation-limit', quota: quotaBefore });
      }

      const result = await generateDateIdeas({
        period: body.period,
        exclude: body.exclude,
      }, {
        env: options.env || process.env,
        fetch: options.fetch || global.fetch,
      });
      const quota = await recordSuccessfulDateGeneration(actor, options);
      return res.status(200).json({
        ok: true,
        actor,
        operation: 'generate',
        period: String(body.period || ''),
        quota,
        ...result,
      });
    } catch (error) {
      const code = String(error?.message || error);
      const authStatus = statusForError(error);
      const status = authStatus !== 500 ? authStatus
        : code === 'date-period-invalid' ? 400
        : code === 'date-ai-quota' || code === 'date-generation-limit' ? 429
        : code === 'groq-api-key-missing' ? 503
        : 502;
      if (status >= 500) console.error('RUDI_DATE_AI_ERROR', code);
      return res.status(status).json({ ok: false, error: code, quota: error?.quota || null });
    }
  }

  if (action === 'recipes') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    try {
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      const { actor } = authorizeRequest(req, body.initData, options);
      const operation = String(body.operation || 'suggestions').trim();

      const common = {
        ingredients: body.ingredients,
        equipment: body.equipment,
        meal: body.meal,
        cuisine: body.cuisine,
        timeMinutes: body.timeMinutes,
      };

      const result = operation === 'detail'
        ? await generateRecipeDetail({
            ...common,
            title: body.title,
            summary: body.summary,
          }, {
            env: options.env || process.env,
            fetch: options.fetch || global.fetch,
          })
        : await generateRecipeSuggestions(common, {
            env: options.env || process.env,
            fetch: options.fetch || global.fetch,
          });

      return res.status(200).json({ ok: true, actor, operation, ...result });
    } catch (error) {
      const code = String(error?.message || error);
      const authStatus = statusForError(error);
      const status = authStatus !== 500 ? authStatus
        : code === 'recipe-ingredients-required'
          || code === 'recipe-equipment-invalid'
          || code === 'recipe-meal-invalid'
          || code === 'recipe-cuisine-invalid'
          || code === 'recipe-time-invalid'
          || code === 'recipe-title-required' ? 400
        : code === 'recipe-ai-quota' ? 429
        : code === 'groq-api-key-missing' ? 503
        : 502;
      if (status >= 500) console.error('RUDI_RECIPE_AI_ERROR', code);
      return res.status(status).json({ ok: false, error: code });
    }
  }

  if (action === 'products') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    try {
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      const { actor } = authorizeRequest(req, body.initData, options);
      const operation = String(body.operation || 'list').trim();
      const previousSnapshot = backupSnapshotFromToken(body.backupToken, options);
      if (previousSnapshot?.products?.initialized) {
        const liveBefore=await readProductListRaw(options).catch(()=>({initialized:false,items:[]}));
        if(!liveBefore?.initialized || !(liveBefore.items||[]).length) {
          await restoreProductListSnapshot(previousSnapshot.products,options).catch(()=>null);
        }
      }

      if (operation === 'list') {
        const live = await readProductList(options).catch(() => ({ initialized: false, version: 0, items: [], history: [] }));
        const saved = backupSnapshotFromToken(body.backupToken, options)?.products;
        const state = normalizeProductListState(live?.initialized ? live : (saved?.initialized ? saved : live));
        return res.status(200).json({ ok: true, actor, ...state });
      }
      if (operation === 'add') {
        const values = Array.isArray(body.items) && body.items.length ? body.items : [body.text];
        const state = await addProducts(values, actor, options);
        const added = compactActivityValues(values);
        if (added) {
          await recordActivity({
            type: 'products',
            actor,
            text: actor + ' ' + activityVerb(actor, 'добавил', 'добавила') + ' в продукты: ' + added,
            icon: '🛒',
            targetTab: 'products',
          }, options);
        }
        const backupToken=await refreshBackupToken(previousSnapshot,options);
        return res.status(200).json({ ok: true, actor, ...state, backupToken });
      }
      if (operation === 'remove') {
        const before = await readProductList(options);
        const removedItem = (before.items || []).find((item) => item.id === String(body.id || '')) || null;
        const state = await removeProduct(body.id, options);
        const backupToken=await refreshBackupToken(previousSnapshot,options);
        return res.status(200).json({ ok: true, actor, ...state, removedItem, backupToken });
      }
      if (operation === 'restore') {
        const state = await restoreProducts(body.items || body.item, options);
        const backupToken=await refreshBackupToken(previousSnapshot,options);
        return res.status(200).json({ ok: true, actor, ...state, backupToken });
      }
      if (operation === 'toggle') {
        const state = await toggleProductChecked(body.id, options);
        const backupToken=await refreshBackupToken(previousSnapshot,options);
        return res.status(200).json({ ok: true, actor, ...state, backupToken });
      }
      if (operation === 'bought') {
        const state = await markProductBought(body.id, actor, options);
        await sendActivityNotification(boughtNotificationText(actor), 'products', options);
        const backupToken=await refreshBackupToken(previousSnapshot,options);
        return res.status(200).json({ ok: true, actor, ...state, backupToken });
      }
      if (operation === 'buy-checked') {
        const before = await readProductList(options);
        const checkedCount = (before.items || []).filter((item) => Boolean(item.checked)).length;
        const state = await markCheckedProductsBought(actor, options);
        if (checkedCount > 0) {
          await sendActivityNotification(boughtNotificationText(actor), 'products', options);
        }
        const backupToken=await refreshBackupToken(previousSnapshot,options);
        return res.status(200).json({ ok: true, actor, ...state, backupToken });
      }
      if (operation === 'clear') {
        const before = await readProductList(options);
        const removedItems = Array.isArray(before.items) ? before.items : [];
        const state = await clearProducts(options);
        const backupToken=await refreshBackupToken(previousSnapshot,options);
        return res.status(200).json({ ok: true, actor, ...state, removedItems, backupToken });
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
      const { actor: owner } = authorizeRequest(req, body.initData, options);
      const operation = String(body.operation || 'list').trim();
      const previousSnapshot = backupSnapshotFromToken(body.backupToken, options);
      if (previousSnapshot?.wishlist?.initialized) {
        const liveBefore=await readWishlist(options).catch(()=>({initialized:false,items:[]}));
        if(!liveBefore?.initialized || !(liveBefore.items||[]).length) {
          // readWishlist currently returns normalized state; the add/toggle/remove functions will reuse restored cache after app bootstrap.
          await restoreStateBackup(body.backupToken,{...options,cacheOptions:{...(options.cacheOptions||{}),confirmWrites:false}}).catch(()=>null);
        }
      }

      if (operation === 'list') {
        const live = await readWishlist(options).catch(() => ({ initialized: false, version: 0, items: [] }));
        const saved = backupSnapshotFromToken(body.backupToken, options)?.wishlist;
        const state = live?.initialized ? live : (saved?.initialized ? saved : live);
        return res.status(200).json({ ok: true, owner, ...state });
      }
      if (operation === 'add') {
        const result = await addWish(body.text, body.url, owner, options);
        await sendWishlistNotificationToPartner(owner, result.item?.text, {
          ...options,
          item: result.item?.id,
        });
        await recordActivity({
          type: 'wishlist',
          actor: owner,
          text: owner + ' ' + activityVerb(owner, 'добавил', 'добавила') + ' желание: ' + String(result.item?.text || '').trim(),
          icon: '🎁',
          targetTab: 'wishlist',
        }, options);
        const backupToken=await refreshBackupToken(previousSnapshot,options);
        return res.status(200).json({ ok: true, owner, ...result.state, backupToken });
      }
      if (operation === 'toggle') {
        const result = await toggleWish(body.id, options);
        const backupToken=await refreshBackupToken(previousSnapshot,options);
        return res.status(200).json({ ok: true, owner, ...result.state, backupToken });
      }
      if (operation === 'remove') {
        const before = await readWishlist(options);
        const removedItem = (before.items || []).find((item) => item.id === String(body.id || '')) || null;
        const state = await removeWish(body.id, options);
        const backupToken=await refreshBackupToken(previousSnapshot,options);
        return res.status(200).json({ ok: true, owner, ...state, removedItem, backupToken });
      }
      if (operation === 'restore') {
        const state = await restoreWish(body.item, options);
        const backupToken=await refreshBackupToken(previousSnapshot,options);
        return res.status(200).json({ ok: true, owner, ...state, backupToken });
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
    const { authorName, actor } = authorizeRequest(req, body.initData, options);
    const previousSnapshot=backupSnapshotFromToken(body.backupToken,options);
    if(previousSnapshot?.partnerMessage){
      await restoreStateBackup(body.backupToken,{...options,cacheOptions:{...(options.cacheOptions||{}),confirmWrites:false}}).catch(()=>null);
    }
    const text = normalizeMessageText(body.text);

    const message = await writePartnerMessage({
      text,
      authorName: actor || authorName,
      updatedAt: new Date(options.now || Date.now()).toISOString(),
    }, options);

    await recordActivity({
      type: 'partner-message',
      actor,
      text: actor + ' ' + activityVerb(actor, 'оставил', 'оставила') + ' послание',
      icon: '💌',
      targetTab: 'home',
      dedupeKey: 'message:' + String(message?.updatedAt || ''),
    }, options);

    const notificationTask = sendPartnerMessageNotification(actor, options).catch((error) => {
      console.error('RUDI_PARTNER_NOTIFICATION_ERROR', String(error?.message || error));
      return { sent: false, error: 'notification-failed' };
    });
    try {
      waitUntil(notificationTask);
    } catch (_) {
      notificationTask.catch(() => {});
    }

    const backupToken=await refreshBackupToken(previousSnapshot,options);
    return res.status(200).json({ ok: true, message, backupToken, notification: { sent: false, pending: true } });
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
module.exports.boughtNotificationText = boughtNotificationText;
module.exports.wishlistNotificationText = wishlistNotificationText;
module.exports.sendWishlistNotificationToPartner = sendWishlistNotificationToPartner;
module.exports.moodNotificationText = moodNotificationText;
module.exports.sendMoodNotificationToPartner = sendMoodNotificationToPartner;
module.exports.taskCompletedNotificationText = taskCompletedNotificationText;
module.exports.checklistCompletedNotificationText = checklistCompletedNotificationText;
module.exports.luluWalkStatusLabel = luluWalkStatusLabel;
module.exports.luluWalkNotificationText = luluWalkNotificationText;
module.exports.sendLuluWalkNotificationToPartner = sendLuluWalkNotificationToPartner;
module.exports.feedPreviewBaseUrl = feedPreviewBaseUrl;
module.exports.refreshFeedFromPreviewIfNeeded = refreshFeedFromPreviewIfNeeded;

module.exports.correctRecipientsForSession = correctRecipientsForSession;
