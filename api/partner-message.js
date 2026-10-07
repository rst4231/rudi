const crypto = require('node:crypto');
const { waitUntil } = require('@vercel/functions');
const { resolveTelegramBotToken } = require('./products-bought.cjs');
const { readPartnerMessage, writePartnerMessage, togglePartnerMessageLike } = require('./partner-message-store.cjs');
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
  setProductCheckedSelection,
  markCheckedProductsBought,
  markProductsBoughtByIds,
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
  readLuluWalkNotice,
  saveLuluWalkNotice,
  deleteLuluWalkNotice,
} = require('./partner-notification-store.cjs');
const {
  decodeSetupKey: decodeAlbumSetupKey,
  saveAlbumConfig,
  readAlbumConfig,
  getLatestPhotos,
} = require('./shared-album.cjs');
const { readDailyMood, setDailyMood, setDailyMoodReason, moodView, restoreDailyMoodState, readDailyMoodState, readMoodHistory, readMoodAnalysis, clearMoodAnalyses } = require('./daily-mood-store.cjs');
const { readLatestMoodAnalysisCache, writeMoodAnalysisCache, normalizeWindowDays, readMoodFeedback, saveMoodFeedback, readMoodAnalysisQuota, recordSuccessfulMoodAnalysis } = require('./mood-analysis-store.cjs');
const { readHabits, habitCreatedByDate } = require('./habit-tracker-store.cjs');
const { generateRecipeSuggestions, generateRecipeDetail } = require('./recipe-ai.cjs');
const { generateDateIdeas, buildDateWeatherContext } = require('./date-ai.cjs');
const { readDateGenerationQuota, readDateGenerationHistory, recordSuccessfulDateGeneration } = require('./date-generation-limit-store.cjs');
const { readDailyQuestion, answerDailyQuestion } = require('./daily-question-store.cjs');
const { generateMoodMessage } = require('./mood-notification-ai.cjs');
const { generateMoodAnalysis } = require('./mood-analysis-ai.cjs');
const { getWeather } = require('./weather.cjs');
const { readSavedItems, addSavedItem, removeSavedItem } = require('./saved-items-store.cjs');
const { readSmartSaves, addSmartSave, removeSmartSave, restoreSmartSave } = require('./smart-saves-store.cjs');
const { readForDiFeed, toggleForDiLike, saveForDiItem, removeForDiSaved } = require('./for-di-feed-store.cjs');
const { readCycleState, bootstrapCycleState, recordCycleStart, recordCycleEnd, normalizeCycleState, cycleViewForDate, cycleStateWithStart, cycleStateWithEnd, writeCycleState } = require('./cycle-store.cjs');
const { readReactions, setReaction, toggleReaction, restoreReactionState, readReactionState, mergeReactionStates } = require('./reactions-store.cjs');
const {
  readActivityJournal,
  appendActivity,
  removeActivityByDedupeKey,
  observeActivityMarker,
} = require('./activity-journal-store.cjs');
const { readLuluState, markLuluWalk, cancelLuluWalk, restoreLuluWalk, restoreLuluState } = require('./lulu-store.cjs');
const { readScoreState, awardScore, reverseScoreByDedupeKey, transferStars, redeemReward, completeReward, scoreView, restoreScoreState, pointsFromUnits } = require('./score-store.cjs');
const { readUiPreferences, saveUiPreferences, seedUiPreferences } = require('./ui-preferences-store.cjs');
const { readFastingState, startFasting, stopFasting, fastingView, fastingRewardStars } = require('./fasting-store.cjs');
const { readSupplements } = require('./supplements-store.cjs');
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
  listTickTickProjectMembers,
  tokenHasWriteScope,
  visibleChecklistItems,
  updateTaskChecklistItem,
  createTickTickTask,
  deleteTickTickTask,
  completeTickTickTask,
  fetchTask,
  calendarDateKey,
} = require('./ticktick-client.cjs');
const {
  readChecklistAuditState,
  recordChecklistAudit,
  checklistAuditForItem,
} = require('./ticktick-checklist-audit-store.cjs');
const {
  readSharedTaskMetaState,
  getSharedTaskMeta,
  setSharedTaskMeta,
  removeSharedTaskMeta,
} = require('./shared-task-meta-store.cjs');
const { createStateBackup, restoreStateBackup, openSnapshot, sealSnapshot, mergeUiPreferences, normalizeUiPreferences } = require('./rudi-backup.cjs');
const { getCinemaPremieresCache, getTopicMaintenanceCache, getLaborCache, getControlPlaneCache } = require('./stateful-cache.cjs');
const { getDailyCronState } = require('./daily-cron-state.cjs');
const { readSummaryState } = require('./morning-summary-store.cjs');
const { resolveCinemaTopicId } = require('./cinema-topic.cjs');
const { getKnownForumChatId } = require('./topic-maintenance-base.cjs');
const { findForumChatIdInEnv } = require('./forum-chat-id.cjs');
const { loadForumTopicsConfig } = require('./forum-topics-config.cjs');
const { readFeedSnapshot, updateFeedSections } = require('./feed-store.cjs');
const { searchGlobalData } = require('./global-search.cjs');
const { telegramSendMessage, telegramDeleteMessage, sendToAllRecipients, escapeTelegramHtml, appUrlForTab } = require('./telegram-notifications.cjs');
const { publicApplicationServerKey, savePushSubscription, resolvePushActor, removePushSubscriptions, readPendingPushNotifications, sendPushNotification, stripTelegramHtml } = require('./web-push.cjs');
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
  if (code === 'rudi-access-denied' || code === 'smart-save-forbidden') return 403;
  if (code === 'rudi-session-required' || code === 'rudi-session-invalid' || code === 'rudi-session-expired' || code === 'rudi-pin-invalid') return 401;
  if (code === 'rudi-pin-rate-limited') return 429;
  if (code === 'rudi-pin-not-configured') return 409;
  if (code === 'rudi-pin-format') return 400;
  if (code === 'rudi-auth-db-unavailable' || code === 'rudi-storage-migrating' || code === 'rudi-blob-unavailable') return 503;
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
  const recipientActor = actor === 'Рустам' ? 'Диана' : actor === 'Диана' ? 'Рустам' : '';
  if (!recipientActor) return { sent: false, reason: 'actor-invalid' };
  const verb = actor === 'Диана' ? 'оставила' : 'оставил';
  const sendPush=options.sendPushNotificationImpl||sendPushNotification;
  return sendPush(recipientActor, {
    title: '💌 Новое послание',
    body: actor + ' ' + verb + ' для тебя новое послание.',
    tag: 'partner-message',
    url: '/?tab=home&item=partner&fresh=1',
  }, options);
}

async function sendActivityNotification(text, _tab, options = {}) {
  try {
    return await sendToAllRecipients(text, options);
  } catch (error) {
    console.warn('RUDI_ACTIVITY_NOTIFICATION_WARN', String(error?.message || error));
    return [];
  }
}

async function sendRewardRedeemedNotification(actor, reward, options = {}) {
  try {
    const label=String(reward?.label||'Награда');
    const icon=String(reward?.icon||'🎁');
    const cost=pointsFromUnits(reward?.costUnits||0);
    const verb=activityVerb(actor,'активировал','активировала');
    const text='🎁 <b>'+escapeTelegramHtml(actor+' '+verb+' награду')+'</b>\n'
      +escapeTelegramHtml(icon+' '+label)+'\n'
      +'Списано: '+escapeTelegramHtml(cost)+' ⭐';
    return await sendToAllRecipients(text,options);
  } catch (error) {
    console.warn('RUDI_REWARD_REDEEM_NOTIFICATION_WARN', String(error?.message || error));
    return [];
  }
}

async function sendRewardCompletedNotification(actor, redemption, options = {}) {
  try {
    const label=String(redemption?.label||'Награда');
    const buyer=String(redemption?.buyerActor||'');
    const confirmVerb=activityVerb(actor,'Подтвердил','Подтвердила');
    const text='✅ <b>Награда выполнена</b>\n'
      +escapeTelegramHtml(String(redemption?.icon||'🎁')+' '+label)+'\n'
      +'Для: '+escapeTelegramHtml(buyer)+'\n'
      +escapeTelegramHtml(confirmVerb+': '+actor);
    return await sendToAllRecipients(text,options);
  } catch (error) {
    console.warn('RUDI_REWARD_COMPLETE_NOTIFICATION_WARN', String(error?.message || error));
    return [];
  }
}

function starGiftWord(points){
  const value=Math.abs(Math.trunc(Number(points)||0));
  const mod100=value%100;
  const mod10=value%10;
  if(mod100>=11&&mod100<=14) return 'звёзд';
  if(mod10===1) return 'звезду';
  if(mod10>=2&&mod10<=4) return 'звезды';
  return 'звёзд';
}

async function sendStarGiftNotification(result, options = {}) {
  try {
    const from=String(result?.from||'');
    const to=String(result?.to||'');
    const points=Number(result?.points||0);
    const verb=from==='Диана'?'подарила':'подарил';
    const toDative=to==='Диана'?'Диане':to==='Рустам'?'Рустаму':to;
    const text='⭐ <b>'+escapeTelegramHtml(from+' '+verb+' '+toDative+' '+points+' '+starGiftWord(points))+'</b>';
    return await sendToAllRecipients(text,options);
  } catch (error) {
    console.warn('RUDI_STAR_GIFT_NOTIFICATION_WARN',String(error?.message||error));
    return [];
  }
}

async function sendCycleStartNotificationToRustam(options = {}) {
  try {
    const sendPush=options.sendPushNotificationImpl||sendPushNotification;
    return await sendPush('Рустам',{
      title:'🩸 Диана отметила начало месячных',
      body:'Открыть цикл Дианы.',
      tag:'cycle-start',
      url:'/?tab=schedule&item=cycle',
    },options);
  } catch (error) {
    console.warn('RUDI_CYCLE_START_NOTIFICATION_WARN',String(error?.message||error));
    return {sent:false,error:String(error?.message||error)};
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

function luluWalkNotificationText(actor) {
  const action = actor === 'Диана' ? 'погуляла' : 'погулял';
  return `🐾 <b>${actor} ${action} с Лулу</b>`;
}

async function sendLuluWalkNotificationToPartner(actor, walkedAt, options = {}) {
  const recipient = actor === 'Рустам' ? 'Диана' : actor === 'Диана' ? 'Рустам' : '';
  if (!recipient) return { sent:false, reason:'actor-invalid' };
  const recipientPrefs=await readUiPreferences(recipient,options).catch(()=>null);
  if(recipientPrefs?.luluWalkNotificationsEnabled===false) return {sent:false,recipient,reason:'disabled'};
  try {
    const action = actor === 'Диана' ? 'погуляла' : 'погулял';
    const sendPush=options.sendPushNotificationImpl||sendPushNotification;
    const result = await sendPush(recipient, {
      title: '🐾 Прогулка с Лулу',
      body: actor + ' ' + action + ' с Лулу.',
      tag: 'lulu-walk',
      url: '/?tab=home&item=lulu',
    }, options);
    return { ...result, recipient, walkedAt };
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
    const action = owner === 'Диана' ? 'добавила' : 'добавил';
    const item = String(text || '').trim();
    const sendPush=options.sendPushNotificationImpl||sendPushNotification;
    const result = await sendPush(recipient, {
      title: '🎁 Новое в вишлисте',
      body: owner + ' ' + action + (item ? ': ' + item : ' новое желание.'),
      tag: 'wishlist',
      url: '/?tab=wishlist',
    }, options);
    return { ...result, recipient };
  } catch (error) {
    console.warn('RUDI_WISHLIST_NOTIFICATION_WARN', String(error?.message || error));
    return { sent:false, recipient, error:String(error?.message || error) };
  }
}

function dailyQuestionAnswerNotificationText(actor) {
  const action=actor==='Диана'?'Диана ответила':'Рустам ответил';
  return '💬 <b>'+action+' на вопрос дня</b>\n\n<i>Сам ответ скрыт. Он откроется в RUDI, когда ответите вы оба.</i>';
}

async function sendDailyQuestionAnswerNotification(actor,options={}) {
  const recipient=actor==='Рустам'?'Диана':actor==='Диана'?'Рустам':'';
  if(!recipient) return {sent:false,reason:'actor-invalid'};
  try{
    const readPreferences=options.readUiPreferencesImpl||readUiPreferences;
    const preferences=await readPreferences(recipient,options).catch(()=>null);
    if(preferences?.dailyQuestionNotificationEnabled===false){
      return {sent:false,recipient,reason:'disabled'};
    }
    const action=actor==='Диана'?'ответила':'ответил';
    const sendPush=options.sendPushNotificationImpl||sendPushNotification;
    const result=await sendPush(recipient,{
      title:'💬 Ответ на вопрос дня',
      body:actor+' '+action+'. Сам ответ откроется в RUDI, когда ответите вы оба.',
      tag:'daily-question',
      url:'/?tab=home&item=daily-question',
    },options);
    return {...result,recipient};
  }catch(error){
    console.warn('RUDI_DAILY_QUESTION_NOTIFICATION_WARN',String(error?.message||error));
    return {sent:false,recipient,error:String(error?.message||error)};
  }
}

async function refreshBackupToken(previousSnapshot, options = {}) {
  return createStateBackup({ ...options, previousSnapshot }).catch((error) => {
    console.warn('RUDI_STATE_BACKUP_REFRESH_WARN', String(error?.message || error));
    return '';
  });
}

async function readPartnerMessageForHome(options = {}) {
  let message = await readPartnerMessage(options).catch(() => null);
  if (message && !message.likesInitialized) {
    const targets = [
      { type:'partner-message', key:'message:' + String(message.id || '') },
      { type:'partner-message', key:'message:' + String(message.updatedAt || '') },
    ].filter((target,index,rows)=>target.key!=='message:'&&rows.findIndex(row=>row.key===target.key)===index);
    const rows = targets.length ? await readReactions(targets, options).catch(() => []) : [];
    const migrated = [...new Set(rows.flatMap(row=>Array.isArray(row?.likedBy)?row.likedBy:[]))];
    message = await writePartnerMessage({
      ...message,
      likes:migrated,
      likesInitialized:true,
    }, options).catch(() => message);
  }
  return message || null;
}

function compactFeedForHome(feed) {
  if (!feed || typeof feed !== 'object') return null;
  const sections = feed.sections && typeof feed.sections === 'object' ? feed.sections : {};
  const eventParts = Array.isArray(sections.events?.parts)
    ? sections.events.parts.slice(0, 2).map((value) => String(value || '')).filter(Boolean)
    : [];
  if (!eventParts.length && !feed.version && !feed.date) return null;
  return {
    date: String(feed.date || ''),
    version: String(feed.version || ''),
    updatedAt: String(feed.updatedAt || ''),
    sections: { events: { parts: eventParts } },
  };
}

function scheduleStateBackupRestore(token, options = {}) {
  const cleanToken = String(token || '').trim();
  if (!cleanToken) return;
  const task = restoreStateBackup(cleanToken, {
    ...options,
    cacheOptions: { ...(options.cacheOptions || {}), confirmWrites: false },
  }).then((recovery) => {
    if (recovery?.restored?.length) console.info('RUDI_STATE_RESTORED', recovery.restored.join(','));
  }).catch((error) => {
    console.warn('RUDI_STATE_BACKUP_RESTORE_WARN', String(error?.message || error));
  });
  try { waitUntil(task); }
  catch (_) { task.catch(() => {}); }
}
async function buildHomeBootstrap(actor, backupSnapshot, options = {}) {
  const now = options.now || Date.now();
  const date = moscowDateKey(now);
  const questionOptions = {
    ...options,
    env: options.env || process.env,
    fetch: options.fetch || global.fetch,
  };
  const [
    partnerMessage,
    journalLive,
    luluLive,
    scoreLive,
    moodRow,
    dailyQuestion,
    cycleLive,
    wishlistLive,
    productsLive,
    feedLive,
    workWeek,
    album,
  ] = await Promise.all([
    readPartnerMessageForHome(options),
    readActivityJournal(options).catch(() => null),
    readLuluState(options).catch(() => null),
    readScoreState(options).catch(() => null),
    readDailyMood(date, options).catch(() => null),
    readDailyQuestion(actor, questionOptions).catch(() => null),
    readCycleState(options).catch(() => null),
    readWishlist(options).catch(() => null),
    readProductList(options).catch(() => null),
    readFeedSnapshot(options).then((current) => refreshFeedFromPreviewIfNeeded(current, options)).catch(() => null),
    getWorkWeek({ ...options, view:'week' }).catch(() => null),
    getLatestPhotos(options).catch(() => null),
  ]);

  const journal = journalLive?.initialized ? journalLive : (backupSnapshot?.activityJournal || journalLive);
  const lulu = luluLive?.initialized ? luluLive : (backupSnapshot?.luluState || luluLive);
  const scoreState = scoreLive?.initialized ? scoreLive : (backupSnapshot?.scoreState || scoreLive);
  const cycle = cycleLive || normalizeCycleState(backupSnapshot?.cycle);
  const wishlist = wishlistLive?.initialized ? wishlistLive : (backupSnapshot?.wishlist?.initialized ? backupSnapshot.wishlist : null);
  const products = productsLive?.initialized ? productsLive : (backupSnapshot?.products?.initialized ? backupSnapshot.products : null);
  const workDay = workWeek?.configured && Array.isArray(workWeek.days)
    ? workWeek.days.find((day) => String(day?.date || '') === date) || null
    : undefined;
  const compactFeed = compactFeedForHome(feedLive);

  const score = scoreState ? scoreView(scoreState, { now }) : null;
  const activity = journal ? {
    initialized: Boolean(journal.initialized),
    version: Math.max(0, Number(journal.version || 0)),
    items: activityItemsForActor(journal.items, actor).slice(0, 10),
    lulu: lulu || null,
    score: score ? {
      initialized: Boolean(score.initialized),
      version: Math.max(0, Number(score.version || 0)),
      balances: score.balances || {},
      today: score.today || null,
    } : null,
  } : null;

  return {
    partnerMessage: partnerMessage || backupSnapshot?.partnerMessage || null,
    ...(activity ? { activity } : {}),
    ...(moodRow ? { mood: { ok:true, ...moodView(moodRow, actor) } } : {}),
    ...(dailyQuestion ? { dailyQuestion: { ok:true, operation:'get', ...dailyQuestion } } : {}),
    cycle: { configured: Boolean(cycle), cycle: cycle || null },
    ...(workDay !== undefined ? { workDay } : {}),
    ...(compactFeed ? { feed: compactFeed } : {}),
    counts: {
      ...(wishlist ? { wishlist: (wishlist.items || []).filter((item) => !item?.done).length } : {}),
      ...(products ? { products: (products.items || []).filter((item) => !item?.bought).length } : {}),
      ...(album?.configured ? {
        photos: Number.isFinite(Number(album.totalCount))
          ? Math.max(0, Number(album.totalCount))
          : Math.max(0, Number(album.photos?.length || 0)),
      } : {}),
    },
  };
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

function activityItemsForActor(items, actor) {
  const viewer = actor === 'Диана' ? 'Диана' : 'Рустам';
  return (Array.isArray(items) ? items : []).filter((item) => {
    const visibleTo=String(item?.visibleTo||'').trim();
    return !visibleTo || visibleTo===viewer;
  });
}

function fastingDurationDetail(durationMinutes) {
  const total = Math.max(0, Math.round(Number(durationMinutes) || 0));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (!hours) return minutes + ' мин';
  return hours + ' ч' + (minutes ? ' ' + minutes + ' мин' : '');
}

function fastingViewWithRewards(state, actor, scoreState) {
  const view = fastingView(state);
  const prefix = 'score:fasting:' + actor + ':';
  const earnedById = new Map();
  for (const row of Array.isArray(scoreState?.history) ? scoreState.history : []) {
    if (row?.actor !== actor || row?.kind !== 'earn' || row?.reversedAt) continue;
    const dedupeKey = String(row?.dedupeKey || '');
    if (!dedupeKey.startsWith(prefix)) continue;
    const id = dedupeKey.slice(prefix.length);
    if (!id) continue;
    earnedById.set(id, (earnedById.get(id) || 0) + pointsFromUnits(row?.units || 0));
  }
  return {
    ...view,
    history: (view.history || []).map((row) => ({
      ...row,
      earnedStars: earnedById.get(String(row?.id || '')) || 0,
    })),
  };
}

async function sendShopUnlockNotification(actor,rewards,options={}){
  const rows=(Array.isArray(rewards)?rewards:[]).filter(Boolean);
  if(!rows.length)return [];
  const cleanActor=actor==='Диана'?'Диана':actor==='Рустам'?'Рустам':'';
  if(!cleanActor)return [];
  const plural=rows.length>1;
  const rewardText=rows.map(row=>String(row.icon||'🎁')+' '+String(row.label||'Награда')+' — '+pointsFromUnits(row.costUnits)+' ⭐').join(', ');
  const text=(plural?'Открылись новые награды в магазине: ':'Открылась новая награда в магазине: ')+rewardText;
  const dedupe='reward-unlock:'+cleanActor+':'+rows.map(row=>String(row.id||row.label||'reward')).join('|');
  await recordActivity({
    type:'reward-unlock',
    actor:cleanActor,
    visibleTo:cleanActor,
    text,
    icon:'🔓',
    targetTab:'score',
    dedupeKey:dedupe,
  },options);
  return [{actor:cleanActor,recorded:true,push:false}];
}

function scheduleShopUnlockNotification(actor,rewards,options={}){
  if(!Array.isArray(rewards)||!rewards.length)return;
  const task=sendShopUnlockNotification(actor,rewards,options).catch(error=>{console.warn('RUDI_SHOP_UNLOCK_NOTICE_WARN',String(error?.message||error));return[]});
  try{waitUntil(task)}catch(_){task.catch(()=>{})}
}

async function awardScoreSafe(actor, units, meta = {}, options = {}) {
  try {
    const result=await awardScore(actor, units, meta, options);
    scheduleShopUnlockNotification(actor,result?.unlockedRewards,options);
    return result;
  }
  catch (error) { console.warn('RUDI_SCORE_AWARD_WARN', String(error?.message || error)); return null; }
}

function reactionActivityView(target) {
  const type = String(target?.type || '').trim();
  const key = String(target?.key || '').trim();
  if (type === 'partner-message') return { label: 'послание', targetTab: 'home' };
  if (type === 'photo-memory') return { label: 'фото-воспоминание', targetTab: 'photos' };
  if (type === 'feed') {
    if (key.startsWith('item:concerts:')) return { label: 'конкретный концерт в Ленте', targetTab: 'feed' };
    if (key.startsWith('item:standup:')) return { label: 'конкретное Stand Up-событие в Ленте', targetTab: 'feed' };
    if (key.startsWith('item:cinema:')) return { label: 'конкретный фильм в Ленте', targetTab: 'feed' };
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
  sadness: { label: 'Грусть', emoji: '😢' },
  boredom: { label: 'Скука', emoji: '🥱' },
  neutral: { label: 'Нейтрально', emoji: '😐' },
  fatigue: { label: 'Усталость', emoji: '😩' },
  anger: { label: 'Гнев', emoji: '😡' },
  joy: { label: 'Радость', emoji: '😄' },
  love: { label: 'Любовь', emoji: '🥰' },
};

const MOOD_ACTIVITY_BY_EMOJI=Object.freeze(Object.fromEntries(Object.entries(MOOD_ACTIVITY).map(([key,value])=>[value.emoji,key])));
function moodSampleAverage(samples,fallback=''){const rows=(Array.isArray(samples)?samples:[]).filter(row=>MOOD_ACTIVITY[String(row?.mood||'')]);const fallbackMood=String(fallback||'');if(!rows.length)return MOOD_ACTIVITY[fallbackMood]?fallbackMood:'';const counts=new Map();for(const row of rows){const mood=String(row.mood||'');counts.set(mood,(counts.get(mood)||0)+1)}let best=String(rows[rows.length-1]?.mood||fallbackMood),bestCount=-1,bestLatest=-1;for(const[mood,count]of counts){let latest=-1;for(let index=rows.length-1;index>=0;index--){if(String(rows[index]?.mood||'')===mood){latest=index;break}}if(count>bestCount||(count===bestCount&&latest>bestLatest)){best=mood;bestCount=count;bestLatest=latest}}return MOOD_ACTIVITY[best]?best:(MOOD_ACTIVITY[fallbackMood]?fallbackMood:'')}
function moodFromActivity(item){if(String(item?.type||'')!=='mood')return'';const icon=String(item?.icon||'').trim();if(MOOD_ACTIVITY_BY_EMOJI[icon])return MOOD_ACTIVITY_BY_EMOJI[icon];const text=String(item?.text||'');let best='',bestIndex=-1;for(const[mood,view]of Object.entries(MOOD_ACTIVITY)){const index=text.lastIndexOf(view.emoji+' '+view.label);if(index>bestIndex){best=mood;bestIndex=index}}return best}
function mergeMoodHistoryActivity(history,journal,actor){const map=new Map();for(const raw of Array.isArray(history)?history:[]){const date=String(raw?.date||'');if(!date)continue;map.set(date,{...raw,_stored:true,samples:Array.isArray(raw?.samples)?raw.samples.map(row=>({mood:String(row?.mood||''),updatedAt:String(row?.updatedAt||''),reason:String(row?.reason||''),reasonText:String(row?.reasonText||'')})).filter(row=>MOOD_ACTIVITY[row.mood]&&row.updatedAt):[]})}for(const item of Array.isArray(journal?.items)?journal.items:[]){if(item?.actor!==actor)continue;const mood=moodFromActivity(item);if(!mood)continue;const stamp=String(item?.createdAt||''),ms=Date.parse(stamp);if(!Number.isFinite(ms))continue;const date=moscowDateKey(ms),existing=map.get(date);if(existing?._stored)continue;const row=existing||{date,mood:'',latestMood:'',samples:[]};const duplicate=row.samples.some(sample=>sample.mood===mood&&Math.abs((Date.parse(sample.updatedAt)||0)-ms)<15000);if(!duplicate)row.samples.push({mood,updatedAt:stamp});row.samples.sort((a,b)=>(Date.parse(a.updatedAt)||0)-(Date.parse(b.updatedAt)||0));if(!row.latestMood||ms>=(Date.parse(row.updatedAt||0)||0)){row.latestMood=mood;row.updatedAt=stamp}map.set(date,row)}return[...map.values()].map(row=>{const{_stored,...clean}=row,fallback=clean.latestMood||clean.mood||'',average=moodSampleAverage(clean.samples,fallback);return{...clean,mood:average||fallback,averageMood:average||fallback,sampleCount:clean.samples.length||Number(clean.sampleCount)||1}}).sort((a,b)=>String(a.date).localeCompare(String(b.date)))}
function moodShiftDateKey(key,days){const value=new Date(String(key||'')+'T12:00:00Z');if(Number.isNaN(value.getTime()))return'';value.setUTCDate(value.getUTCDate()+Number(days||0));return value.toISOString().slice(0,10)}
function moodHistoryForWindow(history,date,windowDays){const days=normalizeWindowDays(windowDays),cutoff=moodShiftDateKey(date,-(days-1));return(Array.isArray(history)?history:[]).filter(row=>String(row?.date||'')>=cutoff&&String(row?.date||'')<=date)}
function moodAnalysisMinimumDays(windowDays){const days=normalizeWindowDays(windowDays);return days>=90?20:days>=30?10:5}
function moodAnalysisLevel(count){return Number(count)>=10?'full':Number(count)>=5?'preliminary':'insufficient'}
function moodMostCommon(rows){const counts=new Map(),latest=new Map();for(const row of rows){const mood=String(row?.mood||'');if(!MOOD_ACTIVITY[mood])continue;counts.set(mood,(counts.get(mood)||0)+1);latest.set(mood,String(row?.date||''))}let best='',count=-1,date='';for(const[mood,value]of counts){const d=latest.get(mood)||'';if(value>count||(value===count&&d>date)){best=mood;count=value;date=d}}return best}
function moodContextSummary(rows){
  const out=[],fasting=rows.filter(r=>r.context?.fasting?.active),plain=rows.filter(r=>!r.context?.fasting?.active);
  if(fasting.length>=3&&plain.length>=3){
    const a=moodMostCommon(fasting),b=moodMostCommon(plain);
    if(a&&b)out.push('В дни с голоданием чаще отмечалось «'+MOOD_ACTIVITY[a].label+'» ('+fasting.length+' дн.), без голодания — «'+MOOD_ACTIVITY[b].label+'» ('+plain.length+' дн.). Это связь, не доказательство причины.');
  }
  const withHabits=rows.filter(r=>Number(r.context?.habits?.total||0)>0),high=withHabits.filter(r=>Number(r.context.habits.done||0)/Math.max(1,Number(r.context.habits.total||0))>=.67),low=withHabits.filter(r=>Number(r.context.habits.done||0)/Math.max(1,Number(r.context.habits.total||0))<.67);
  if(high.length>=3&&low.length>=3){
    const a=moodMostCommon(high),b=moodMostCommon(low);
    if(a&&b)out.push('В дни, когда выполнено не меньше двух третей привычек, чаще отмечалось «'+MOOD_ACTIVITY[a].label+'» ('+high.length+' дн.), в остальные — «'+MOOD_ACTIVITY[b].label+'» ('+low.length+' дн.). Это связь, не доказательство причины.');
  }
  const supplementCounts=new Map();
  for(const row of rows){
    for(const name of Array.isArray(row.context?.supplements?.taken)?row.context.supplements.taken:[]){
      const safe=String(name||'').trim();
      if(safe)supplementCounts.set(safe,(supplementCounts.get(safe)||0)+1);
    }
  }
  const supplementCandidates=[...supplementCounts.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'ru')).slice(0,8);
  for(const [name,count] of supplementCandidates){
    if(count<3)continue;
    const withSupplement=rows.filter(r=>(Array.isArray(r.context?.supplements?.taken)?r.context.supplements.taken:[]).includes(name));
    const withoutSupplement=rows.filter(r=>!(Array.isArray(r.context?.supplements?.taken)?r.context.supplements.taken:[]).includes(name));
    if(withSupplement.length<3||withoutSupplement.length<3)continue;
    const a=moodMostCommon(withSupplement),b=moodMostCommon(withoutSupplement);
    if(a&&b&&a!==b){
      out.push('В дни, когда был отмечен приём «'+name+'», чаще отмечалось «'+MOOD_ACTIVITY[a].label+'» ('+withSupplement.length+' дн.), в дни без отмеченного приёма — «'+MOOD_ACTIVITY[b].label+'» ('+withoutSupplement.length+' дн.). Это наблюдаемая связь, не доказательство влияния БАДа.');
    }
  }
  const reasons=new Map();
  for(const row of rows)for(const sample of Array.isArray(row?.samples)?row.samples:[]){
    const reason=String(sample?.reason||'');
    if(reason)reasons.set(reason,(reasons.get(reason)||0)+1);
  }
  const labels={work:'работа',food:'еда',relationship:'отношения',money:'деньги',health:'самочувствие',sport:'спорт',fatigue:'усталость',sleep:'сон',fasting:'голодание',other:'другое'},top=[...reasons.entries()].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([r,n])=>(labels[r]||r)+' — '+n);
  if(top.length)out.push('Чаще всего вы сами указывали причины: '+top.join(', ')+'.');
  return out;
}

function moodAnalysisVisuals(rows){
  const source=Array.isArray(rows)?rows:[],reasonLabels={work:'Работа',food:'Еда',relationship:'Отношения',money:'Деньги',health:'Самочувствие',sport:'Спорт',fatigue:'Усталость',sleep:'Сон',fasting:'Голодание',other:'Другое'};
  const moodCounts=new Map(),factorCounts=new Map(),supplementCounts=new Map();
  let habitDone=0,habitTotal=0,habitDays=0,supplementDays=0;
  const fastingRows=[];
  for(const row of source){
    const mood=String(row?.mood||'');
    if(MOOD_ACTIVITY[mood])moodCounts.set(mood,(moodCounts.get(mood)||0)+1);
    for(const sample of Array.isArray(row?.samples)?row.samples:[]){
      const reason=String(sample?.reason||''),custom=String(sample?.reasonText||'').trim(),label=reason==='other'&&custom?custom:(reasonLabels[reason]||'');
      if(!label)continue;
      const current=factorCounts.get(label)||{count:0,moods:new Map()};
      current.count+=1;
      const sampleMood=MOOD_ACTIVITY[String(sample?.mood||'')]?String(sample.mood):mood;
      if(MOOD_ACTIVITY[sampleMood])current.moods.set(sampleMood,(current.moods.get(sampleMood)||0)+1);
      factorCounts.set(label,current);
    }
    const habits=row?.context?.habits;
    if(Number(habits?.total||0)>0){
      habitDays+=1;habitDone+=Number(habits.done||0);habitTotal+=Number(habits.total||0);
    }
    const fasting=row?.context?.fasting;
    if(fasting?.active)fastingRows.push(fasting);
    const taken=[...new Set((Array.isArray(row?.context?.supplements?.taken)?row.context.supplements.taken:[]).map(value=>String(value||'').trim()).filter(Boolean))];
    if(taken.length)supplementDays+=1;
    for(const name of taken)supplementCounts.set(name,(supplementCounts.get(name)||0)+1);
  }
  const moods=[...moodCounts.entries()].sort((a,b)=>b[1]-a[1]).map(([key,count])=>({key,label:MOOD_ACTIVITY[key].label,emoji:MOOD_ACTIVITY[key].emoji,count,percent:source.length?Math.round(count/source.length*100):0}));
  const factors=[...factorCounts.entries()].sort((a,b)=>b[1].count-a[1].count||a[0].localeCompare(b[0],'ru')).slice(0,5).map(([label,data])=>{
    const top=[...data.moods.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||'';
    return{label,count:data.count,mood:top,emoji:MOOD_ACTIVITY[top]?.emoji||''};
  });
  const goalTracked=fastingRows.filter(item=>typeof item?.goalReached==='boolean').length,goalsReached=fastingRows.filter(item=>item?.goalReached===true).length;
  const avgHours=fastingRows.length?Math.round(fastingRows.reduce((sum,item)=>sum+Number(item?.hours||0),0)/fastingRows.length*10)/10:0;
  return{
    days:source.length,
    moods,
    factors,
    habits:habitTotal?{done:habitDone,total:habitTotal,days:habitDays,percent:Math.round(habitDone/habitTotal*100)}:null,
    fasting:fastingRows.length?{days:fastingRows.length,avgHours,goalsReached,goalTracked}:null,
    supplements:supplementCounts.size?{days:supplementDays,top:[...supplementCounts.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'ru')).slice(0,4).map(([name,days])=>({name,days}))}:null
  };
}

async function enrichMoodHistoryContext(actor,history,date,windowDays,options={}){
  const rows=moodHistoryForWindow(history,date,windowDays);
  const [habits,fasting,supplements]=await Promise.all([
    readHabits(actor,options).catch(()=>null),
    readFastingState(actor,options).catch(()=>null),
    readSupplements(actor,options).catch(()=>null)
  ]);
  const now=Number(options.now||Date.now());
  return rows.map(row=>{
    const key=String(row?.date||''),eligible=habits?.habits?.filter(h=>habitCreatedByDate(h,key))||[],doneIds=new Set(habits?.completions?.[key]||[]),notDoneIds=new Set(habits?.failures?.[key]||[]);
    const doneHabits=eligible.filter(h=>doneIds.has(h.id)),notDoneHabits=eligible.filter(h=>notDoneIds.has(h.id));
    const habitContext={total:eligible.length,done:doneHabits.length,notDone:notDoneHabits.length,doneNames:doneHabits.map(h=>String(h.name||'').trim()).filter(Boolean),notDoneNames:notDoneHabits.map(h=>String(h.name||'').trim()).filter(Boolean)};
    const sessions=(fasting?.history||[]).filter(item=>{const start=moscowDateKey(Date.parse(item.startedAt)),end=moscowDateKey(Date.parse(item.endedAt));return start&&end&&key>=start&&key<=end});
    let fastingContext={active:false,hours:0,goalReached:null};
    if(sessions.length){
      const best=sessions.slice().sort((a,b)=>Number(b.durationMinutes||0)-Number(a.durationMinutes||0))[0];
      fastingContext={active:true,hours:Math.round(Number(best.durationMinutes||0)/6)/10,goalReached:Boolean(best.goalReached),goalHours:Number(best.goalHours||0)};
    }
    if(fasting?.active&&key===moscowDateKey(now)){
      const minutes=Math.max(0,Math.round((now-Date.parse(fasting.active.startedAt))/60000));
      if(minutes>=60)fastingContext={active:true,hours:Math.round(minutes/6)/10,goalReached:minutes>=Number(fasting.active.goalHours||0)*60,goalHours:Number(fasting.active.goalHours||0),inProgress:true};
    }
    const takenSupplements=[...new Set((supplements?.items||[])
      .filter(item=>(item.intakes||[]).some(intake=>String(intake?.date||'')===key))
      .map(item=>String(item?.name||'').trim())
      .filter(Boolean))].slice(0,20);
    return{...row,context:{habits:habitContext,fasting:fastingContext,supplements:{taken:takenSupplements}}};
  });
}
async function externalMoodAnalysis(actor,date,windowDays,options={}){const cached=await readLatestMoodAnalysisCache(actor,date,options).catch(()=>null);await clearMoodAnalyses(actor,options).catch(error=>console.warn('RUDI_MOOD_ANALYSIS_DB_CLEANUP_WARN',String(error?.message||error)));return cached||null}

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

function normalizeCompletedTaskTitle(title) {
  return String(title || '')
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .trim()
    .replace(/[.!?]+$/u, '')
    .toLocaleLowerCase('ru-RU');
}

const COMPLETED_TASK_PHRASES = new Map([
  ['регистрация брака', { male:'зарегистрировал брак', female:'зарегистрировала брак' }],
  ['посмотреть марвел мстители doomsday', { male:'посмотрел Марвел «Мстители: Doomsday»', female:'посмотрела Марвел «Мстители: Doomsday»' }],
  ['поменять фильтры в ванной', { male:'поменял фильтры в ванной', female:'поменяла фильтры в ванной' }],
  ['выбрать, куда сходить вместе', { male:'выбрал, куда сходить вместе', female:'выбрала, куда сходить вместе' }],
  ['оплатить квартиру и коммунальные услуги', { male:'оплатил квартиру и коммунальные услуги', female:'оплатила квартиру и коммунальные услуги' }],
  ['генеральная уборка', { male:'сделал генеральную уборку', female:'сделала генеральную уборку' }],
  ['оплатить интернет', { male:'оплатил интернет', female:'оплатила интернет' }],
  ['передать показания счётчиков', { male:'передал показания счётчиков', female:'передала показания счётчиков' }],
  ['почистить пылесос', { male:'почистил пылесос', female:'почистила пылесос' }],
  ['уход за машиной • чистый салон', { male:'привёл салон машины в порядок', female:'привела салон машины в порядок' }],
  ['купить продукты', { male:'купил продукты', female:'купила продукты' }],
  ['выйти куда-нибудь вечером', { male:'сходил куда-нибудь вечером', female:'сходила куда-нибудь вечером' }],
  ['поменять постельное бельё', { male:'поменял постельное бельё', female:'поменяла постельное бельё' }],
  ['стрижка когтей лулу', { male:'подстриг Лулу когти', female:'подстригла Лулу когти' }],
  ['составить список продуктов на неделю', { male:'составил список продуктов на неделю', female:'составила список продуктов на неделю' }],
  ['вынести мусор', { male:'вынес мусор', female:'вынесла мусор' }],
  ['приготовить кушать', { male:'приготовил еду', female:'приготовила еду' }],
  ['помыть посуду', { male:'помыл посуду', female:'помыла посуду' }],
]);

function completedTaskPushText(actor, title) {
  const taskTitle=String(title || 'Совместное дело').trim();
  const phrase=COMPLETED_TASK_PHRASES.get(normalizeCompletedTaskTitle(taskTitle));
  const gender=actor==='Диана'?'female':'male';
  if (phrase?.[gender]) return '✅ ' + actor + ' ' + phrase[gender];
  return '✅ ' + actor + ' ' + (actor==='Диана'?'сделала':'сделал') + ': ' + taskTitle;
}

function taskCompletedNotificationText(actor, title) {
  return '<b>' + escapeTelegramHtml(completedTaskPushText(actor,title)) + '</b>';
}

async function sendTaskCompletedNotificationToPartner(actor,title,options={}) {
  const recipient=actor==='Рустам'?'Диана':actor==='Диана'?'Рустам':'';
  if(!recipient) return {sent:false,reason:'actor-invalid'};
  const recipientPrefs=await readUiPreferences(recipient,options).catch(()=>null);
  if(recipientPrefs?.sharedTaskNotificationsEnabled===false) return {sent:false,recipient,reason:'disabled'};
  try{
    const taskTitle=String(title||'Совместное дело').trim();
    const text=completedTaskPushText(actor,taskTitle);
    const sendPush=options.sendPushNotificationImpl||sendPushNotification;
    const result=await sendPush(recipient,{
      title:text,
      body:'',
      tag:'shared-task-complete',
      url:'/?tab=home&item=priority',
    },options);
    return {...result,recipient};
  }catch(error){
    console.warn('RUDI_TASK_COMPLETE_NOTIFICATION_WARN',String(error?.message||error));
    return {sent:false,recipient,error:String(error?.message||error)};
  }
}

function checklistCompletedNotificationText(actor, itemTitle, taskTitle) {
  const action = actor === 'Диана' ? 'выполнила пункт' : 'выполнил пункт';
  const parent = String(taskTitle || '').trim();
  return `☑️ <b>${actor} ${action}</b>\n<i>${escapeTelegramHtml(String(itemTitle || 'Пункт задачи').trim())}</i>${parent ? `\nЗадача: <i>${escapeTelegramHtml(parent)}</i>` : ''}`;
}

async function sendChecklistCompletedNotificationToPartner(actor,itemTitle,taskTitle,options={}) {
  const recipient=actor==='Рустам'?'Диана':actor==='Диана'?'Рустам':'';
  if(!recipient) return {sent:false,reason:'actor-invalid'};
  const recipientPrefs=await readUiPreferences(recipient,options).catch(()=>null);
  if(recipientPrefs?.sharedTaskNotificationsEnabled===false) return {sent:false,recipient,reason:'disabled'};
  try{
    const item=String(itemTitle||'Пункт задачи').trim();
    const task=String(taskTitle||'').trim();
    const action=actor==='Диана'?'выполнила':'выполнил';
    const sendPush=options.sendPushNotificationImpl||sendPushNotification;
    const result=await sendPush(recipient,{
      title:'☑️ Выполнен пункт внутри совместной задачи',
      body:actor+' '+action+' пункт: '+item+(task?' · '+task:''),
      tag:'shared-task-checklist-complete',
      url:'/?tab=home&item=priority',
    },options);
    return {...result,recipient};
  }catch(error){
    console.warn('RUDI_CHECKLIST_COMPLETE_NOTIFICATION_WARN',String(error?.message||error));
    return {sent:false,recipient,error:String(error?.message||error)};
  }
}

const MOOD_NOTICE = {
  sadness: { phrase: 'грусть', emoji: '😢' },
  boredom: { phrase: 'скука', emoji: '🥱' },
  neutral: { phrase: 'нейтрально', emoji: '😐' },
  fatigue: { phrase: 'усталость', emoji: '😩' },
  anger: { phrase: 'гнев', emoji: '😡' },
  joy: { phrase: 'радость', emoji: '😄' },
  love: { phrase: 'любовь', emoji: '🥰' },
};

function moodNotificationText(recipient, actor, mood) {
  const moodKey = String(mood || '');
  const view = MOOD_NOTICE[moodKey];
  if (!view) return '';
  const actorDative = actor === 'Рустам' ? 'Рустаму' : actor === 'Диана' ? 'Диане' : actor;
  const stateText = moodKey === 'sadness'
    ? actor + ' сейчас грустит'
    : moodKey === 'boredom'
      ? actorDative + ' сейчас скучно'
      : moodKey === 'neutral'
        ? actor + ' сейчас без ярких эмоций'
        : moodKey === 'fatigue'
          ? actor + ' сейчас ' + (actor === 'Диана' ? 'устала' : actor === 'Рустам' ? 'устал' : 'чувствует усталость')
          : moodKey === 'anger'
        ? actor + ' сейчас злится'
        : moodKey === 'joy'
          ? actor + ' сейчас ' + (actor === 'Диана' ? 'радостна' : actor === 'Рустам' ? 'радостен' : 'радуется')
          : moodKey === 'love'
            ? actor + ' сейчас чувствует любовь'
            : '';
  if (!stateText) return '';
  return `${view.emoji} <b>${recipient}, ${stateText}</b>`;
}

async function sendMoodNotificationToPartner(actor, mood, options = {}) {
  const recipient = actor === 'Рустам' ? 'Диана' : actor === 'Диана' ? 'Рустам' : '';
  if (!recipient) return { sent: false, reason: 'actor-invalid' };
  try {
    const fallback = moodNotificationText(recipient, actor, mood);
    let text = fallback;
    let aiGenerated = false;
    try {
      text = await generateMoodMessage(
        { actor, recipient, mood },
        {
          env: options.env || process.env,
          fetch: options.fetch || options.fetchImpl || globalThis.fetch,
          timeoutMs: 7000,
        }
      );
      aiGenerated = Boolean(text);
    } catch (error) {
      console.warn('RUDI_MOOD_AI_FALLBACK', String(error?.message || error));
      text = fallback;
    }
    const item = actor === 'Диана' ? 'diana' : 'rustam';
    const sendPush=options.sendPushNotificationImpl||sendPushNotification;
    const result = await sendPush(recipient, {
      title: '🙂 Настроение партнёра',
      body: stripTelegramHtml(text),
      tag: 'partner-mood',
      url: '/?tab=home&item=' + item,
    }, options);
    return { ...result, recipient, aiGenerated };
  } catch (error) {
    console.warn('RUDI_MOOD_NOTIFICATION_WARN', String(error?.message || error));
    return { sent: false, recipient, error: String(error?.message || error) };
  }
}

const TELEGRAM_PROFILE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const telegramProfileMemoryCache = new Map();

function cachedTelegramProfile(userId, now = Date.now()) {
  const id = Number(userId);
  const row = telegramProfileMemoryCache.get(id);
  if (!row || Number(row.expiresAt || 0) <= Number(now)) {
    if (row) telegramProfileMemoryCache.delete(id);
    return null;
  }
  return row.profile || null;
}

function cacheTelegramProfile(userId, profile, now = Date.now()) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0 || !profile) return profile;
  telegramProfileMemoryCache.set(id, {
    profile,
    expiresAt: Number(now) + TELEGRAM_PROFILE_CACHE_TTL_MS,
  });
  return profile;
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
  const now = Number(options.now || Date.now());
  const cached = cachedTelegramProfile(id, now);
  if (cached) return cached;

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
    return cacheTelegramProfile(id, { name, photoDataUrl }, now);
  } catch (_) {
    return cachedTelegramProfile(id, now) || fallback;
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
    scoreState: newerVersion(base.scoreState, overlay.scoreState),
    luluState: newerVersion(base.luluState, overlay.luluState),
    carState: newerTime(base.carState, overlay.carState),
    dailyMood: newerVersion(base.dailyMood, overlay.dailyMood),
    reactions: mergeReactionStates(base.reactions, overlay.reactions),
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

function moscowMoodScoreWindow(now = Date.now()) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Moscow',
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(now)));
  if (hour < 12) return { key: 'morning', label: 'утро' };
  if (hour < 18) return { key: 'day', label: 'день' };
  return { key: 'evening', label: 'вечер' };
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

function isThursdayMoscow(now = new Date()) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Moscow',
    weekday: 'short',
  }).format(now) === 'Thu';
}

async function refreshFeedFromPreviewIfNeeded(feed, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const date = moscowDateKey(now);
  const hasToday = feed?.date === date
    && Array.isArray(feed?.sections?.events?.parts) && feed.sections.events.parts.length;
  const cinemaUpdatedDate = moscowDateKey(Date.parse(String(feed?.sections?.cinema?.updatedAt || '')) || 0);
  const cinemaFreshToday = cinemaUpdatedDate === date;
  if (hasToday && (!isThursdayMoscow(now) || cinemaFreshToday)) return feed;

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') return feed;

  const sections = {};
  try {
    const response = await fetchImpl(feedPreviewBaseUrl(options) + '/api/preview?date=' + encodeURIComponent(date), {
      method: 'GET',
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    if (response?.ok) {
      const preview = await response.json().catch(() => null);
      const events = Array.isArray(preview?.sections?.events?.parts)
        ? preview.sections.events.parts.map((value) => String(value || '').trim()).filter(Boolean)
        : [];
      if (events.length) sections.events = { parts: events, source: 'preview-bootstrap' };
    }
  } catch (error) {
    console.warn('RUDI_FEED_PREVIEW_BOOTSTRAP_WARN', String(error?.message || error));
  }

  if (isThursdayMoscow(now)) {
    try {
      const publishCinema = options.publishCinemaForFeed
        || ((runOptions) => require('./cinema-premieres-collage.cjs').publishWeeklyCinemaPremieres(runOptions));
      const cinema = await publishCinema({
        ...options,
        now,
        force: true,
        feedOnly: true,
        settings: {
          ...(options.settings || {}),
          sections: {
            ...(options.settings?.sections || {}),
            cinema: {
              ...(options.settings?.sections?.cinema || {}),
              publishToTelegram: false,
            },
          },
        },
      });
      const parts = String(cinema?.feedMessage || '').trim() ? [String(cinema.feedMessage).trim()] : [];
      const items = Array.isArray(cinema?.feedItems) ? cinema.feedItems : [];
      if (parts.length || items.length) sections.cinema = { parts, items, source: 'feed-bootstrap-cinema' };
    } catch (error) {
      console.warn('RUDI_FEED_CINEMA_BOOTSTRAP_WARN', String(error?.message || error));
    }
  }

  if (!Object.keys(sections).length) return feed;
  return updateFeedSections(sections, { ...options, date, now });
}


function sharedTaskResponsibility(task, meta = null) {
  const metaPresent = Boolean(meta && typeof meta === 'object');
  if (metaPresent) {
    const responsible = ['Рустам','Диана'].includes(String(meta.responsible || '').trim())
      ? String(meta.responsible).trim()
      : '';
    return { responsible, known: true, common: !responsible, source: 'rudi' };
  }

  const assigneeTag = resolveAssigneeName(task?.assigneeUsername);
  const hasAssignee = Boolean(String(task?.assigneeUsername || '').trim());
  if (!hasAssignee) return { responsible: '', known: true, common: true, source: 'ticktick' };
  if (assigneeTag === 'RST') return { responsible: 'Рустам', known: true, common: false, source: 'ticktick' };
  if (assigneeTag === 'Ди') return { responsible: 'Диана', known: true, common: false, source: 'ticktick' };
  return { responsible: '', known: false, common: false, source: 'ticktick' };
}

function sharedTaskAssigneePayload(task, meta = null) {
  const responsibility = sharedTaskResponsibility(task, meta);
  return {
    responsibility,
    assignee: responsibility.responsible === 'Рустам'
      ? 'RST'
      : responsibility.responsible === 'Диана'
        ? 'Ди'
        : responsibility.known
          ? 'Не назначен'
          : 'Назначен',
    assigned: Boolean(responsibility.responsible) || !responsibility.known,
  };
}

function sharedTaskCanDelete(actor, task, meta = null) {
  const responsibility = sharedTaskResponsibility(task, meta);
  return responsibility.known && (!responsibility.responsible || responsibility.responsible === actor);
}

function tickTickRepeatFlag(value, count) {
  const repeat = String(value || 'none').trim().toLowerCase();
  if (!repeat || repeat === 'none') return '';
  const total = Math.max(2, Math.min(365, Math.round(Number(count) || 2)));
  const suffix = ';COUNT=' + total;
  if (repeat === 'daily') return 'RRULE:FREQ=DAILY;INTERVAL=1' + suffix;
  if (repeat === 'weekdays') return 'RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR' + suffix;
  if (repeat === 'weekly') return 'RRULE:FREQ=WEEKLY;INTERVAL=1' + suffix;
  if (repeat === 'monthly') return 'RRULE:FREQ=MONTHLY;INTERVAL=1' + suffix;
  if (repeat === 'yearly') return 'RRULE:FREQ=YEARLY;INTERVAL=1' + suffix;
  throw new Error('ticktick-task-repeat-invalid');
}

function tickTickTaskDateTime(date, time = '') {
  const day = String(date || '').trim();
  const clock = String(time || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('ticktick-task-date-invalid');
  if (clock && !/^([01]\d|2[0-3]):[0-5]\d$/.test(clock)) throw new Error('ticktick-task-time-invalid');
  return day + 'T' + (clock || '00:00') + ':00+0300';
}

function tickTickTaskSnapshot(task, meta = null) {
  const source = task && typeof task === 'object' ? task : {};
  const responsibility = sharedTaskResponsibility(source, meta);
  return {
    title: String(source.title || '').trim().slice(0,500),
    projectId: String(source.projectId || '').trim(),
    isAllDay: Boolean(source.isAllDay),
    startDate: String(source.startDate || '').trim(),
    dueDate: String(source.dueDate || '').trim(),
    timeZone: String(source.timeZone || '').trim(),
    content: String(source.content || '').trim().slice(0,5000),
    desc: String(source.desc || '').trim().slice(0,5000),
    repeatFlag: String(source.repeatFlag || '').trim(),
    repeatFrom: Number.isFinite(Number(source.repeatFrom)) ? Number(source.repeatFrom) : 0,
    priority: Number.isFinite(Number(source.priority)) ? Number(source.priority) : 0,
    reminders: Array.isArray(source.reminders) ? source.reminders.slice(0,20) : [],
    tags: Array.isArray(source.tags) ? source.tags.slice(0,50) : [],
    items: Array.isArray(source.items) ? source.items.slice(0,100) : [],
    responsible: responsibility.responsible,
    createdBy: String(meta?.createdBy || '').trim(),
  };
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


  if (action === 'task-create') {
    if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'method-not-allowed' });
    let body;
    let actor;
    try {
      body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      ({ actor } = authorizeRequest(req, body.initData, options));
    } catch (error) {
      return res.status(statusForError(error)).json({ ok:false, error:String(error?.message || error) });
    }

    if (!credentialsConfigured(options.env || process.env)) return res.status(503).json({ok:false,error:'ticktick-not-configured'});
    const config = await loadTickTickConfig(options);
    if (!config.enabled) return res.status(409).json({ok:false,error:'ticktick-disabled'});
    const token = await readTickTickTokenWithBackup(body, options);
    if (!token?.accessToken) return res.status(401).json({ok:false,connected:false,error:'ticktick-not-connected'});
    if (tokenHasWriteScope(token) === false) return res.status(403).json({ok:false,writable:false,error:'ticktick-write-permission-required'});

    try {
      const title = String(body.title || '').trim().slice(0,500);
      if (!title) return res.status(400).json({ok:false,error:'ticktick-task-title-required'});
      const responsibleValue = String(body.responsible || '').trim();
      const responsible = ['Рустам','Диана'].includes(responsibleValue) ? responsibleValue : '';
      const date = String(body.date || '').trim();
      const time = String(body.time || '').trim();
      const dateTime = tickTickTaskDateTime(date, time);
      const repeatFlag = tickTickRepeatFlag(body.repeat, body.repeatCount);
      let assigneeUsername='';
      if (responsible) {
        const wanted=responsible==='Рустам'?'RST':'Ди';
        const members=await listTickTickProjectMembers(token.accessToken,config.projectId,options);
        assigneeUsername=String(members.find(row=>String(row?.displayName||'').trim()===wanted)?.username||'').trim();
        if(!assigneeUsername) throw new Error('ticktick-assignee-not-found:'+wanted);
      }
      const task = await createTickTickTask(token.accessToken, {
        title,
        projectId: config.projectId,
        isAllDay: !time,
        startDate: dateTime,
        dueDate: dateTime,
        timeZone: 'Europe/Moscow',
        desc: String(body.description || '').trim().slice(0,5000),
        ...(assigneeUsername ? { assigneeUsername } : {}),
        ...(repeatFlag ? { repeatFlag, repeatFrom: 0 } : {}),
      }, options);
      const taskId = String(task?.id || '').trim();
      if (!taskId) throw new Error('ticktick-task-create-unresolved');
      await setSharedTaskMeta(taskId, {
        responsible,
        createdBy: actor,
        source: 'rudi',
      }, options);
      return res.status(200).json({
        ok:true,connected:true,writable:true,
        task:{
          id:taskId,
          title,
          date,
          startTime:time || null,
          allDay:!time,
          responsible,
          assignee:responsible==='Рустам'?'RST':responsible==='Диана'?'Ди':'Не назначен',
          assigned:Boolean(responsible),
          canDelete:!responsible||responsible===actor,
          description:String(body.description || '').trim().slice(0,5000),
          repeat:String(body.repeat || 'none'),
          repeatCount:repeatFlag?Math.max(2,Math.min(365,Math.round(Number(body.repeatCount)||2))):1,
        }
      });
    } catch (error) {
      const code = String(error?.message || error);
      if (code === 'ticktick-token-invalid') {
        await clearToken(options);
        return res.status(401).json({ok:false,connected:false,error:'ticktick-reconnect-required'});
      }
      if (code === 'ticktick-write-forbidden') return res.status(403).json({ok:false,writable:false,error:'ticktick-write-permission-required'});
      if (/^(ticktick-task-(?:date|time|repeat)-invalid|ticktick-task-create-invalid)$/.test(code)) return res.status(400).json({ok:false,error:code});
      console.error('RUDI_TICKTICK_TASK_CREATE_ERROR',code);
      return res.status(502).json({ok:false,error:'ticktick-create-unavailable'});
    }
  }

  if (action === 'task-delete') {
    if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'method-not-allowed' });
    let body;
    let actor;
    try {
      body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      ({ actor } = authorizeRequest(req, body.initData, options));
    } catch (error) {
      return res.status(statusForError(error)).json({ ok:false, error:String(error?.message || error) });
    }
    const taskId = String(body.taskId || '').trim();
    if (!taskId) return res.status(400).json({ok:false,error:'ticktick-task-delete-invalid'});
    const config = await loadTickTickConfig(options);
    const token = await readTickTickTokenWithBackup(body, options);
    if (!token?.accessToken) return res.status(401).json({ok:false,error:'ticktick-not-connected'});
    if (tokenHasWriteScope(token) === false) return res.status(403).json({ok:false,writable:false,error:'ticktick-write-permission-required'});

    try {
      const task = await fetchTask(token.accessToken, config.projectId, taskId, options);
      const taskMeta = await getSharedTaskMeta(taskId, options).catch(() => null);
      if (!sharedTaskCanDelete(actor, task, taskMeta)) return res.status(403).json({ok:false,error:'ticktick-task-delete-forbidden'});
      const snapshot = tickTickTaskSnapshot(task, taskMeta);
      await deleteTickTickTask(token.accessToken, config.projectId, taskId, options);
      await removeSharedTaskMeta(taskId, options).catch(() => null);
      const deletedAt = Date.now();
      const undoToken = sealSnapshot({
        type:'ticktick-task-delete-undo-v1',
        actor,
        deletedAt,
        expiresAt:deletedAt + 30000,
        task:snapshot,
      }, options);
      return res.status(200).json({ok:true,taskId,undoToken,undoExpiresInMs:30000});
    } catch (error) {
      const code=String(error?.message || error);
      if (code === 'ticktick-token-invalid') {
        await clearToken(options);
        return res.status(401).json({ok:false,error:'ticktick-reconnect-required'});
      }
      if (code === 'ticktick-task-not-found') return res.status(404).json({ok:false,error:code});
      if (code === 'ticktick-write-forbidden') return res.status(403).json({ok:false,writable:false,error:'ticktick-write-permission-required'});
      console.error('RUDI_TICKTICK_TASK_DELETE_ERROR',code);
      return res.status(502).json({ok:false,error:'ticktick-delete-unavailable'});
    }
  }

  if (action === 'task-restore') {
    if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'method-not-allowed' });
    let body;
    let actor;
    try {
      body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      ({ actor } = authorizeRequest(req, body.initData, options));
    } catch (error) {
      return res.status(statusForError(error)).json({ ok:false, error:String(error?.message || error) });
    }
    const config = await loadTickTickConfig(options);
    const token = await readTickTickTokenWithBackup(body, options);
    if (!token?.accessToken) return res.status(401).json({ok:false,error:'ticktick-not-connected'});
    if (tokenHasWriteScope(token) === false) return res.status(403).json({ok:false,writable:false,error:'ticktick-write-permission-required'});

    try {
      const snapshot = openSnapshot(String(body.undoToken || ''), options);
      if (snapshot?.type !== 'ticktick-task-delete-undo-v1' || snapshot?.actor !== actor) throw new Error('ticktick-task-undo-invalid');
      if (Number(snapshot?.expiresAt || 0) < Date.now()) throw new Error('ticktick-task-undo-expired');
      const source = snapshot.task && typeof snapshot.task === 'object' ? snapshot.task : {};
      const restoredResponsible=String(source.responsible || '').trim();
      let restoredAssigneeUsername='';
      if (restoredResponsible === 'Рустам' || restoredResponsible === 'Диана') {
        const wanted=restoredResponsible==='Рустам'?'RST':'Ди';
        const members=await listTickTickProjectMembers(token.accessToken,config.projectId,options);
        restoredAssigneeUsername=String(members.find(row=>String(row?.displayName||'').trim()===wanted)?.username||'').trim();
        if(!restoredAssigneeUsername) throw new Error('ticktick-assignee-not-found:'+wanted);
      }
      const task = await createTickTickTask(token.accessToken, {
        ...source,
        projectId: config.projectId,
        ...(restoredAssigneeUsername ? { assigneeUsername: restoredAssigneeUsername } : {}),
      }, options);
      const taskId=String(task?.id || '').trim();
      if (!taskId) throw new Error('ticktick-task-create-unresolved');
      await setSharedTaskMeta(taskId, {
        responsible:restoredResponsible,
        createdBy:String(source.createdBy || actor).trim(),
        source:'rudi',
      }, options);
      return res.status(200).json({ok:true,taskId});
    } catch (error) {
      const code=String(error?.message || error);
      if (code === 'ticktick-task-undo-expired') return res.status(410).json({ok:false,error:code});
      if (code === 'ticktick-task-undo-invalid') return res.status(400).json({ok:false,error:code});
      if (code === 'ticktick-token-invalid') {
        await clearToken(options);
        return res.status(401).json({ok:false,error:'ticktick-reconnect-required'});
      }
      if (code === 'ticktick-write-forbidden') return res.status(403).json({ok:false,writable:false,error:'ticktick-write-permission-required'});
      console.error('RUDI_TICKTICK_TASK_RESTORE_ERROR',code);
      return res.status(502).json({ok:false,error:'ticktick-restore-unavailable'});
    }
  }

  if (action === 'today') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    let body;
    let actor;
    try {
      body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      ({ actor } = authorizeRequest(req, body.initData, options));
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
      const [auditState, sharedTaskMetaState] = await Promise.all([
        readChecklistAuditState(options).catch(() => ({ entries: {} })),
        readSharedTaskMetaState(options).catch(() => ({ entries: {} })),
      ]);
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
          const meta = sharedTaskMetaState.entries?.[String(event?.id || '')] || null;
          const assignee = sharedTaskAssigneePayload(source, meta);
          return {
            ...event,
            date: today,
            assignee: assignee.assignee,
            assigned: assignee.assigned,
            responsible: assignee.responsibility.responsible,
            responsibilityKnown: assignee.responsibility.known,
            canDelete: sharedTaskCanDelete(actor, source, meta),
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

    const previousSnapshot = backupSnapshotFromToken(body.backupToken, options);
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
      const taskMeta = await getSharedTaskMeta(taskId, options).catch(() => null);
      const responsibility = sharedTaskResponsibility(task, taskMeta);
      const responsibleActor = responsibility.responsible;
      if (!responsibility.known) {
        return res.status(409).json({ ok:false, connected:true, error:'ticktick-task-assignee-unknown' });
      }
      if (responsibleActor && actor !== responsibleActor) {
        return res.status(403).json({
          ok:false, connected:true, error:'ticktick-task-assignee-forbidden',
          assignee:responsibleActor==='Рустам'?'RST':responsibleActor==='Диана'?'Ди':'Не назначен',
        });
      }

      await completeTickTickTask(token.accessToken, config.projectId, taskId, options);
      if (wasOpen) {
        await sendTaskCompletedNotificationToPartner(actor,task?.title,options);
        await recordActivity({
          type: 'task-complete',
          actor,
          text: actor + ' ' + activityVerb(actor, 'выполнил', 'выполнила') + ' задачу: ' + String(task?.title || 'Совместное дело').trim(),
          icon: '✅',
          targetTab: 'schedule',
        }, options);
      }

      // Award on every completion request, not only the first one. awardScore is
      // idempotent by dedupeKey, so a retry can repair a reward write that failed
      // after TickTick had already accepted the completion.
      const scoreActors = responsibleActor ? [responsibleActor] : ['Рустам', 'Диана'];
      const completedAt = String(task?.completedTime || '').trim();
      const scoreDate = completedAt ? moscowDateKey(completedAt) : moscowDateKey(options.now || Date.now());
      let scoreState = null;
      for (const scoreActor of scoreActors) {
        const award = await awardScore(scoreActor, 20, {
          label: responsibleActor ? 'Задача' : 'Общая задача',
          detail: String(task?.title || 'Совместное дело').trim(),
          icon: '✅',
          dedupeKey: 'score:task:' + taskId + ':' + scoreDate + ':' + scoreActor,
        }, options);
        scoreState = award?.state || scoreState;
        scheduleShopUnlockNotification(scoreActor, award?.unlockedRewards, options);
      }

      const backupToken = await refreshBackupToken(previousSnapshot, options);
      return res.status(200).json({
        ok:true,connected:true,writable:true,taskId,completed:true,
        title:String(task?.title||'').trim(),
        ...(scoreState ? {score:scoreView(scoreState,{now:options.now||Date.now()})} : {}),
        backupToken,
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
      const sourceTasks = Array.isArray(data?.tasks) ? data.tasks : [];
      const sourceById = new Map(sourceTasks.map((task) => [String(task?.id || ''), task]));
      const sharedTaskMetaState = await readSharedTaskMetaState(options).catch(() => ({ entries: {} }));
      const calendar = buildTickTickCalendar(
        sourceTasks,
        options.now ? new Date(options.now) : new Date(),
        view
      );
      for (const day of calendar.days || []) {
        for (const event of day.events || []) {
          const source = sourceById.get(String(event?.id || '')) || {};
          const meta = sharedTaskMetaState.entries?.[String(event?.id || '')] || null;
          const assignee = sharedTaskAssigneePayload(source, meta);
          event.assignee = assignee.assignee;
          event.assigned = assignee.assigned;
          event.responsible = assignee.responsibility.responsible;
        }
      }
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
        await sendChecklistCompletedNotificationToPartner(
          actor,
          updated?.item?.title,
          updated?.task?.title,
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
  if (['push-config','push-subscribe','push-unsubscribe','push-pending'].includes(action)) {
    if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'method-not-allowed' });
    try {
      const body=req.body&&typeof req.body==='object'&&!Array.isArray(req.body)?req.body:{};
      let actor='';
      if(action==='push-pending'){
        actor=await resolvePushActor(body.endpoint,body.deviceToken,options);
        if(!actor){
          try{ actor=authorizeRequest(req,body.initData,options).actor; }catch(_){}
        }
        if(!actor) return res.status(401).json({ok:false,error:'push-device-unauthorized'});
      }else{
        actor=authorizeRequest(req,body.initData,options).actor;
      }

      if(action==='push-config'){
        return res.status(200).json({ok:true,actor,publicKey:publicApplicationServerKey(options)});
      }
      if(action==='push-subscribe'){
        const subscription=await savePushSubscription(actor,body.subscription,{
          ...options,
          userAgent:String(req.headers?.['user-agent']||''),
          deviceToken:String(body.deviceToken||''),
        });
        return res.status(200).json({ok:true,actor,subscription:{id:subscription.id,updatedAt:subscription.updatedAt}});
      }
      if(action==='push-unsubscribe'){
        const endpoint=String(body.endpoint||'').trim();
        const subscriptions=await removePushSubscriptions(actor,endpoint,options);
        return res.status(200).json({ok:true,actor,count:subscriptions.length});
      }
      const pending=await readPendingPushNotifications(actor,{
        ...options,
        seenIds:Array.isArray(body.seenIds)?body.seenIds:[],
        maxAgeMs:5*60*1000,
      });

      const notifications=(Array.isArray(pending)?pending:[])
        .filter(row=>String(row?.kind||'show')!=='dismiss')
        .sort((a,b)=>Date.parse(a?.createdAt||0)-Date.parse(b?.createdAt||0));

      return res.status(200).json({ok:true,actor,notifications});
    } catch (error) {
      const code=String(error?.message||error);
      const status=['push-subscription-invalid','push-device-token-required'].includes(code)?400:statusForError(error);
      return res.status(status).json({ok:false,error:code});
    }
  }

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
        const lulu = await markLuluWalk(actor, {
          peed: body.peed === true,
          pooped: body.pooped === true,
        }, options);
        const walkedAt = String(lulu?.lastWalk?.walkedAt || new Date(options.now || Date.now()).toISOString());
        const actionWord = actor === 'Диана' ? 'погуляла' : 'погулял';
        await recordActivity({
          type: 'lulu-walk',actor,text: actor + ' ' + actionWord + ' с Лулу',icon:'🐾',targetTab:'home',
          dedupeKey:'lulu-walk:'+walkedAt,createdAt:walkedAt,
        }, options);
        const walkRewardUnits=actor==='Рустам'?20:10;
        await awardScoreSafe(actor,walkRewardUnits,{label:'Прогулка с Лулу',detail:activityVerb(actor,'Погулял с Лулу','Погуляла с Лулу'),icon:'🐾',dedupeKey:'score:lulu:'+walkedAt},options);

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

      if (operation === 'cancel-walk') {
        const walkedAtDate = new Date(String(body.walkedAt || '').trim());
        if (Number.isNaN(walkedAtDate.getTime())) throw new Error('lulu-walk-invalid');
        const walkedAt = walkedAtDate.toISOString();
        const beforeCancel = await readLuluState(options);
        const removedWalk = (Array.isArray(beforeCancel?.walksToday) ? beforeCancel.walksToday : [])
          .find((row) => row?.walkedAt === walkedAt)
          || (beforeCancel?.lastWalk?.walkedAt === walkedAt ? beforeCancel.lastWalk : null);
        if (!removedWalk) throw new Error('lulu-walk-not-found');
        if (String(removedWalk.actor || '') !== actor) throw new Error('lulu-walk-owner-required');
        const notice = await readLuluWalkNotice(walkedAt, options).catch(() => null);
        const lulu = await cancelLuluWalk(walkedAt, options);

        await removeActivityByDedupeKey('lulu-walk:' + walkedAt, options).catch((error) => {
          console.warn('RUDI_LULU_ACTIVITY_DELETE_WARN', String(error?.message || error));
        });
        await reverseScoreByDedupeKey('score:lulu:'+walkedAt,{label:'Отмена прогулки',detail:'Отменена отметка прогулки с Лулу',icon:'↩️',clearDedupe:true},options).catch((error)=>{
          console.warn('RUDI_LULU_SCORE_REVERSE_WARN',String(error?.message||error));
        });

        let telegramDeleted = false;
        if (notice?.chatId && notice?.messageId) {
          try {
            telegramDeleted = Boolean(await telegramDeleteMessage(notice.chatId, notice.messageId, options));
          } catch (error) {
            console.warn('RUDI_LULU_NOTIFICATION_DELETE_WARN', String(error?.message || error));
          }
          await deleteLuluWalkNotice(walkedAt, options).catch(() => false);
        }

        const undoToken = removedWalk ? sealSnapshot({
          version:2,
          createdAt:new Date(options.now || Date.now()).toISOString(),
          luluUndo:{canceledBy:actor,walk:removedWalk},
        }, options) : '';
        const backupToken = await refreshBackupToken(previousSnapshot, options);
        return res.status(200).json({
          ok: true,
          actor,
          lulu,
          backupToken,
          undoToken,
          canceledWalkedAt: walkedAt,
          telegramDeleted,
        });
      }

      if (operation === 'restore-walk') {
        let undoSnapshot=null;
        try { undoSnapshot=openSnapshot(String(body.undoToken||''),options); }
        catch { throw new Error('lulu-undo-invalid'); }
        const createdAt=Date.parse(String(undoSnapshot?.createdAt||''));
        const nowMs=Number(options.now||Date.now());
        if(!Number.isFinite(createdAt)||Math.abs(nowMs-createdAt)>30*1000) throw new Error('lulu-undo-expired');
        if(String(undoSnapshot?.luluUndo?.canceledBy||'')!==actor) throw new Error('lulu-undo-forbidden');
        const input=undoSnapshot?.luluUndo?.walk;
        if(!input||typeof input!=='object'||Array.isArray(input)) throw new Error('lulu-undo-invalid');

        const restoredActor=String(input.actor||'').trim();
        if(restoredActor!=='Рустам'&&restoredActor!=='Диана') throw new Error('lulu-actor-invalid');
        if(restoredActor!==actor) throw new Error('lulu-undo-forbidden');
        const walkedAtDate=new Date(String(input.walkedAt||'').trim());
        if(Number.isNaN(walkedAtDate.getTime())) throw new Error('lulu-walk-invalid');
        const walkedAt=walkedAtDate.toISOString();

        const beforeRestore=await readLuluState(options);
        const alreadyPresent=(Array.isArray(beforeRestore?.walksToday)?beforeRestore.walksToday:[])
          .some((row)=>row?.walkedAt===walkedAt);
        if(alreadyPresent) throw new Error('lulu-undo-used');

        const lulu=await restoreLuluWalk({
          actor:restoredActor,
          walkedAt,
          peed:input.peed===true,
          pooped:input.pooped===true,
          previousPeeAt:String(input.previousPeeAt||''),
          previousPoopAt:String(input.previousPoopAt||''),
        },options);

        const actionWord=restoredActor==='Диана'?'погуляла':'погулял';
        await recordActivity({
          type:'lulu-walk',actor:restoredActor,text:restoredActor+' '+actionWord+' с Лулу',icon:'🐾',targetTab:'home',
          dedupeKey:'lulu-walk:'+walkedAt,createdAt:walkedAt,
        },options);
        const walkRewardUnits=restoredActor==='Рустам'?20:10;
        await awardScoreSafe(restoredActor,walkRewardUnits,{
          label:'Прогулка с Лулу',detail:activityVerb(restoredActor,'Погулял с Лулу','Погуляла с Лулу'),icon:'🐾',dedupeKey:'score:lulu:'+walkedAt
        },options);

        const notificationTask=sendLuluWalkNotificationToPartner(restoredActor,walkedAt,options);
        try { waitUntil(notificationTask); } catch (_) { notificationTask.catch(()=>{}); }

        const backupToken=await refreshBackupToken(previousSnapshot,options);
        return res.status(200).json({
          ok:true,actor,lulu,backupToken,restoredWalkedAt:walkedAt,
          notification:{sent:false,pending:true},
        });
      }

      return res.status(400).json({ ok: false, error: 'lulu-operation-invalid' });
    } catch (error) {
      const code = String(error?.message || error);
      const authStatus = statusForError(error);
      const status = authStatus !== 500 ? authStatus
        : code === 'lulu-walk-owner-required' || code === 'lulu-undo-forbidden' ? 403
        : code.startsWith('lulu-') ? 400
        : 500;
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
        const startDate=moscowDateKey(options.now || Date.now());
        const alreadyRecorded=Array.isArray(baseCycle?.historyStarts)&&baseCycle.historyStarts.includes(startDate);
        const cycle = cycleStateWithStart(baseCycle, startDate);
        cycle.updatedAt = new Date(options.now || Date.now()).toISOString();
        await writeCycleState(cycle, options).catch(() => false);
        if(!alreadyRecorded){
          const notificationTask=sendCycleStartNotificationToRustam(options).catch(()=>null);
          try{waitUntil(notificationTask)}catch(_){notificationTask.catch(()=>{})}
        }
        const previousSnapshot = mergeBackupSnapshots(backupSnapshot, {
          version: 2,
          createdAt: new Date(options.now || Date.now()).toISOString(),
          cycle,
        });
        const backupToken = await createStateBackup({ ...options, previousSnapshot });
        return res.status(200).json({ ok: true, actor, configured: true, cycle, backupToken });
      }
      if (operation === 'record-end') {
        if (actor !== 'Диана') return res.status(403).json({ ok: false, error: 'cycle-owner-required' });
        const liveCycle = await readCycleState(options).catch(() => null);
        const baseCycle = liveCycle || normalizeCycleState(backupSnapshot?.cycle);
        const endDate=moscowDateKey(options.now || Date.now());
        const cycle = cycleStateWithEnd(baseCycle, endDate);
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


  if (action === 'system-health') {
    if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'method-not-allowed' });
    try {
      const body=req.body&&typeof req.body==='object'&&!Array.isArray(req.body)?req.body:{};
      const { actor }=authorizeRequest(req,body.initData,options);
      return res.status(200).json(await buildSystemHealth(actor,options));
    } catch (error) {
      const code=String(error?.message||error);
      const status=code==='rudi-health-owner-only'?403:statusForError(error);
      return res.status(status).json({ok:false,error:code});
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
        const rows = Array.isArray(verified.passkeys) ? verified.passkeys : await readPasskeys(verified.actor, storeOptions);
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
        const rows = Array.isArray(result.passkeys) ? result.passkeys : await readPasskeys(session.actor, storeOptions);
        await saveDurablePasskeys(session.actor, rows, durableAuthOptions(options));
        const previousSnapshot = backupSnapshotFromToken(body.backupToken, options);
        const backupToken = await createStateBackup({ ...options, previousSnapshot });
        const { passkeys: _passkeys, ...publicResult } = result;
        return res.status(200).json({ ok: true, ...publicResult, backupToken });
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

      if (operation === 'change-pin') {
        const session = authorizeRequest(req, body.initData, options);
        const hydrated = await hydrateActorAuth(session.actor, body.backupToken, options);
        if (!hydrated.durable?.pinRecord) throw new Error('rudi-pin-not-configured');
        await verifyPin(req, session.actor, body.currentPin, {
          ...browserAuthStoreOptions(options),
          pinRecord: hydrated.durable.pinRecord,
        });
        const previousSnapshot = backupSnapshotFromToken(body.backupToken, options);
        const result = await savePin(session.actor, body.newPin, browserAuthStoreOptions(options));
        await saveDurablePinRecord(session.actor, result.record, durableAuthOptions(options));
        setSessionCookie(res, session.actor, botToken, { now: options.now || Date.now() });
        const backupToken = await createStateBackup({
          ...options,
          previousSnapshot: backupSnapshotWithPin(previousSnapshot, session.actor, result.record),
        });
        return res.status(200).json({ ok: true, actor: session.actor, configured: true, updatedAt: result.updatedAt, backupToken });
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

  if (action === 'home-bootstrap') {
    if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'method-not-allowed' });
    try {
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      const { actor } = authorizeRequest(req, body.initData, options);
      const home = await buildHomeBootstrap(actor, null, options);
      return res.status(200).json({ ok:true, actor, home });
    } catch (error) {
      return res.status(statusForError(error)).json({ ok:false, error:String(error?.message || error) });
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


      const date = moscowDateKey(options.now || Date.now());
      const holidaysPromise = readHolidayHighlights(date, options).catch(() => null);
      const liveRecipients = await readRecipients(options).catch(() => null);
      const recipients = correctRecipientsForSession(
        mergedRecipientsWithBackup(liveRecipients, previousSnapshot),
        actor,
        user?.id
      );
      const recipientsChanged = ['Рустам','Диана'].some((name) =>
        Number(liveRecipients?.[name] || 0) !== Number(recipients?.[name] || 0)
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
      const partnerUiPreferencesPromise = readUiPreferences(partnerActor, options).catch(() => null);
      const selfId = Number(user?.id) || Number(recipients?.[actor]) || 0;
      const partnerId = recipientFor(actor, recipients);
      const includeProfiles = body.includeProfiles !== false;
      const includeHome = body.includeHome === true;
      const shouldRefreshBackup = !backupSnapshot || Boolean(handoffSnapshot) || recipientsChanged;
      const [holidays, selfProfile, partnerProfile, partnerUiPreferences, backupToken, home] = await Promise.all([
        holidaysPromise,
        includeProfiles ? readTelegramProfile(selfId, actor, options) : Promise.resolve(null),
        includeProfiles ? readTelegramProfile(partnerId, partnerActor, options) : Promise.resolve(null),
        partnerUiPreferencesPromise,
        shouldRefreshBackup
          ? createStateBackup({ ...options, previousSnapshot: correctedSnapshot }).catch((error) => {
              console.warn('RUDI_STATE_BACKUP_CREATE_WARN', String(error?.message || error));
              return '';
            })
          : Promise.resolve(''),
        includeHome ? buildHomeBootstrap(actor, correctedSnapshot, options) : Promise.resolve(null),
      ]);
      const response = res.status(200).json({
        ok: true,
        actor,
        ...(selfProfile ? { selfProfile } : {}),
        ...(partnerProfile ? { partnerProfile } : {}),
        holidayHighlights: holidays?.items || [],
        uiPreferences: effectiveUiPreferences || null,
        partnerUiPreferences: partnerUiPreferences?.initialized ? partnerUiPreferences : null,
        ...(backupToken ? { backupToken } : {}),
        ...(includeHome && home ? { home } : {}),
      });
      scheduleStateBackupRestore(body.backupToken, options);
      return response;
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

      if (operation === 'restore-all') {
        const result = await restoreStateBackup(body.backupToken, options);
        return res.status(200).json({ ok: true, restored: Array.isArray(result?.restored) ? result.restored : [] });
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
      if (body.uiPreferences && typeof body.uiPreferences === 'object' && !Array.isArray(body.uiPreferences)) {
        uiPreferences = await saveUiPreferences(actor, body.uiPreferences, {
          ...options,
          cacheOptions: { ...(options.cacheOptions || {}), confirmWrites: false },
        });
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


  if (action === 'smart-saves') {
    if (req.method !== 'POST') return res.status(405).json({ ok:false,error:'method-not-allowed' });
    try {
      const body=req.body&&typeof req.body==='object'&&!Array.isArray(req.body)?req.body:{};
      const { actor }=authorizeRequest(req,body.initData,options),operation=String(body.operation||'list').trim();
      if(operation==='list'){const state=await readSmartSaves(options);return res.status(200).json({ok:true,actor,items:state.items||[]})}
      if(operation==='add'){
        const input=body.item&&typeof body.item==='object'&&!Array.isArray(body.item)?body.item:{};
        const result=await addSmartSave({...input,actor},options);
        return res.status(200).json({ok:true,actor,duplicate:result.duplicate,item:result.item,items:result.state.items||[]});
      }
      if(operation==='remove'){const result=await removeSmartSave(body.id,{...options,actor});return res.status(200).json({ok:true,actor,removed:result.removed,item:result.item,items:result.state.items||[]})}
      if(operation==='restore'){const result=await restoreSmartSave(body.item,{...options,actor});return res.status(200).json({ok:true,actor,restored:result.restored,item:result.item,items:result.state.items||[]})}
      return res.status(400).json({ok:false,error:'smart-save-operation-invalid'});
    } catch(error) {return res.status(statusForError(error)).json({ok:false,error:String(error?.message||error)})}
  }

  if (action === 'activity') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    try {
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      const { actor } = authorizeRequest(req, body.initData, options);
      const [journal,lulu,scoreState]=await Promise.all([readActivityJournal(options),readLuluState(options),readScoreState(options)]);
      const visibleJournal={...journal,items:activityItemsForActor(journal?.items,actor)};
      return res.status(200).json({ok:true,actor,...visibleJournal,lulu,score:scoreView(scoreState,{now:options.now||Date.now()})});
    } catch (error) {
      return res.status(statusForError(error)).json({ ok: false, error: String(error?.message || error) });
    }
  }

  if (action === 'score') {
    if (req.method !== 'POST') return res.status(405).json({ok:false,error:'method-not-allowed'});
    try {
      const body=req.body&&typeof req.body==='object'&&!Array.isArray(req.body)?req.body:{};
      const {actor}=authorizeRequest(req,body.initData,options);
      const previousSnapshot=backupSnapshotFromToken(body.backupToken,options);
      if(previousSnapshot?.scoreState?.initialized) await restoreScoreState(previousSnapshot.scoreState,{...options,cacheOptions:{...(options.cacheOptions||{}),confirmWrites:false}}).catch(()=>null);
      const operation=String(body.operation||'state').trim();
      if(operation==='state'){
        const state=await readScoreState(options);
        return res.status(200).json({ok:true,actor,score:scoreView(state,{now:options.now||Date.now()})});
      }
      if(operation==='gift'){
        const result=await transferStars(actor,body.amount,options);
        const clientEventId=String(body.clientEventId||'').trim().slice(0,96);
        const notificationOptions=clientEventId?{...options,clientEventId}:options;
        const notificationTask=Promise.all([
          sendStarGiftNotification(result,notificationOptions),
          sendShopUnlockNotification(result.to,result.unlockedRewards,options),
        ]).catch(()=>[]);
        try{waitUntil(notificationTask)}catch(_){notificationTask.catch(()=>{})}
        const backupToken=await refreshBackupToken(previousSnapshot,options);
        return res.status(200).json({
          ok:true,actor,gift:{from:result.from,to:result.to,points:result.points,remaining:result.remainingPoints,clientEventId},
          score:scoreView(result.state,{now:options.now||Date.now()}),backupToken,
          notification:{pending:true},
        });
      }
      if(operation==='redeem'){
        const result=await redeemReward(actor,body.rewardId,options);
        const notificationTask=sendRewardRedeemedNotification(actor,result.reward,options).catch(()=>[]);
        try{waitUntil(notificationTask)}catch(_){notificationTask.catch(()=>{})}
        const backupToken=await refreshBackupToken(previousSnapshot,options);
        return res.status(200).json({
          ok:true,actor,reward:result.reward,redemption:result.redemption,
          score:scoreView(result.state,{now:options.now||Date.now()}),backupToken,
          notification:{pending:true},
        });
      }
      if(operation==='complete-reward'){
        const result=await completeReward(actor,body.redemptionId,options);
        const notificationTask=sendRewardCompletedNotification(actor,result.redemption,options).catch(()=>[]);
        try{waitUntil(notificationTask)}catch(_){notificationTask.catch(()=>{})}
        const backupToken=await refreshBackupToken(previousSnapshot,options);
        return res.status(200).json({
          ok:true,actor,redemption:result.redemption,
          score:scoreView(result.state,{now:options.now||Date.now()}),backupToken,
          notification:{pending:true},
        });
      }
      return res.status(400).json({ok:false,error:'score-operation-invalid'});
    } catch(error) {
      const code=String(error?.message||error); const authStatus=statusForError(error);
      const status=authStatus!==500?authStatus
        :code==='score-balance-insufficient'||code==='score-reward-active'||code==='score-gift-weekly-limit'?409
        :code==='score-reward-self-complete-forbidden'?403
        :code==='score-reward-not-found'?404
        :code.startsWith('score-')?400:500;
      return res.status(status).json({ok:false,error:code});
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
      const windowDays=normalizeWindowDays(body.windowDays);
      let row;
      let backupToken='';

      if (operation === 'set') {
        const before = await readDailyMood(date, options).catch(() => null);
        const previousMood = before?.moods?.[actor]?.mood || '';
        row = await setDailyMood(date, actor, body.mood, options);
        const nextMood = row?.moods?.[actor]?.mood || '';
        if (nextMood && nextMood !== previousMood) {
          const recipientActor = actor === 'Рустам' ? 'Диана' : actor === 'Диана' ? 'Рустам' : '';
          if (recipientActor) {
            const [senderUiPreferences, recipientUiPreferences] = await Promise.all([
              readUiPreferences(actor, options).catch(() => null),
              readUiPreferences(recipientActor, options).catch(() => null),
            ]);
            if (
              senderUiPreferences?.moodNotifyPartnerEnabled === true
              && recipientUiPreferences?.moodReceivePartnerEnabled === true
            ) {
              await sendMoodNotificationToPartner(actor, nextMood, options);
            }
          }
          const activityText = moodActivityText(actor, previousMood, nextMood);
          if (activityText) {
            await recordActivity({type:'mood',actor,text:activityText,icon:MOOD_ACTIVITY[nextMood]?.emoji||'🙂',targetTab:'home'},options);
          }
          const moodScoreWindow = moscowMoodScoreWindow(options.now || Date.now());
          await awardScoreSafe(actor,1,{
            label:'Настроение',
            detail:(MOOD_ACTIVITY[nextMood]?.emoji||'🙂')+' '+(MOOD_ACTIVITY[nextMood]?.label||'Выбор настроения')+' · '+moodScoreWindow.label,
            icon:MOOD_ACTIVITY[nextMood]?.emoji||'🙂',
            dedupeKey:'score:mood:'+actor+':'+date+':'+moodScoreWindow.key,
          },options);
        }
        backupToken=await refreshBackupToken(previousSnapshot,options);
      } else if (operation === 'reason') {
        row=await setDailyMoodReason(date,actor,body.reason,{...options,reasonText:body.reasonText});
        backupToken=await refreshBackupToken(previousSnapshot,options);
      } else if (operation === 'get') {
        row = await readDailyMood(date, options);
      } else if (operation === 'history') {
        const [storedHistory,journal]=await Promise.all([readMoodHistory(actor,options),readActivityJournal(options).catch(()=>({items:[]}))]);
        const history=mergeMoodHistoryActivity(storedHistory,journal,actor);
        const selected=moodHistoryForWindow(history,date,windowDays),level=moodAnalysisLevel(selected.length),minAnalysisDays=moodAnalysisMinimumDays(windowDays);
        const analysis=await externalMoodAnalysis(actor,date,windowDays,options);
        const analysisVisuals=analysis?.text?moodAnalysisVisuals(await enrichMoodHistoryContext(actor,history,date,Number(analysis.windowDays)||windowDays,options)):null;
        const feedback=analysis?.createdAt?await readMoodFeedback(actor,analysis.createdAt,windowDays,options).catch(()=>null):null;
        const analysisQuota=await readMoodAnalysisQuota(actor,date,options).catch(()=>({max:3,used:0,available:3,date}));
        return res.status(200).json({ok:true,actor,date,history,analysis,analysisVisuals,feedback,analysisQuota,windowDays,selectedDays:selected.length,minAnalysisDays,analysisLevel:level,canAnalyze:selected.length>=minAnalysisDays&&analysisQuota.available>0,retentionDays:180});
      } else if (operation === 'analyze') {
        const [storedHistory,journal]=await Promise.all([readMoodHistory(actor,options),readActivityJournal(options).catch(()=>({items:[]}))]);
        const history=mergeMoodHistoryActivity(storedHistory,journal,actor),selected=moodHistoryForWindow(history,date,windowDays),minAnalysisDays=moodAnalysisMinimumDays(windowDays);
        if(selected.length<minAnalysisDays) throw new Error('mood-analysis-insufficient-data');
        const quotaBefore=await readMoodAnalysisQuota(actor,date,options);
        if(quotaBefore.available<=0) throw new Error('mood-analysis-daily-limit');
        const level=moodAnalysisLevel(selected.length);
        let analysis=null,cycle=null,cycleState=null,reused=false;
        if(actor==='Диана'){cycleState=await readCycleState(options).catch(()=>null);cycle=cycleViewForDate(cycleState,date)}
        let enriched=await enrichMoodHistoryContext(actor,history,date,windowDays,options);
        if(actor==='Диана'&&cycleState)enriched=enriched.map(row=>({...row,context:{...(row.context||{}),cycle:cycleViewForDate(cycleState,String(row.date||''))}}));
        const contextSummary=moodContextSummary(enriched);
        const generated=await generateMoodAnalysis({actor,history:enriched,cycle,windowDays,level,contextSummary},{...options,env:options.env||process.env,fetch:options.fetch||global.fetch});
        const analysisQuota=await recordSuccessfulMoodAnalysis(actor,date,options);
        analysis=await writeMoodAnalysisCache(actor,date,windowDays,{...generated,windowDays,level,historyCount:selected.length,cycle,createdAt:new Date(options.now||Date.now()).toISOString()},options);
        const analysisVisuals=moodAnalysisVisuals(enriched);
        const feedback=analysis?.createdAt?await readMoodFeedback(actor,analysis.createdAt,windowDays,options).catch(()=>null):null;
        return res.status(200).json({ok:true,actor,date,history,analysis,analysisVisuals,feedback,analysisQuota,cycle:analysis?.cycle||cycle,windowDays,selectedDays:selected.length,minAnalysisDays,analysisLevel:level,canAnalyze:analysisQuota.available>0,reused,retentionDays:180});
      } else if (operation === 'feedback') {
        const analysis=await externalMoodAnalysis(actor,date,windowDays,options);
        if(!analysis?.createdAt)throw new Error('mood-feedback-no-analysis');
        const feedback=await saveMoodFeedback(actor,{analysisCreatedAt:analysis.createdAt,windowDays,value:body.value},options);
        return res.status(200).json({ok:true,actor,date,windowDays,feedback});
      } else {
        return res.status(400).json({ ok: false, error: 'mood-operation-invalid' });
      }

      return res.status(200).json({ ok: true, ...moodView(row, actor), backupToken });
    } catch (error) {
      const code = String(error?.message || error);
      const authStatus = statusForError(error);
      const status = authStatus !== 500 ? authStatus
        : code === 'mood-value-invalid' || code === 'mood-actor-invalid' || code === 'mood-date-invalid' ? 400
        : code === 'mood-analysis-no-data' || code === 'mood-analysis-insufficient-data' ? 409
        : code === 'mood-reason-invalid' || code === 'mood-reason-no-mood' || code === 'mood-feedback-invalid' || code === 'mood-feedback-no-analysis' ? 400
        : code === 'mood-analysis-quota' || code === 'mood-analysis-daily-limit' ? 429
        : code === 'groq-api-key-missing' ? 503
        : code.startsWith('mood-analysis-') ? 502
        : 500;
      if(status>=500) console.error('RUDI_MOOD_ERROR',code);
      return res.status(status).json({ ok: false, error: code });
    }
  }

  if (action === 'daily-question') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    try {
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      const { actor } = authorizeRequest(req, body.initData, options);
      const operation = String(body.operation || 'get').trim();
      const questionOptions = {
        ...options,
        env: options.env || process.env,
        fetch: options.fetch || global.fetch,
      };

      if (operation === 'get') {
        const view = await readDailyQuestion(actor, questionOptions);
        return res.status(200).json({ ok:true, operation, ...view });
      }

      if (operation === 'answer') {
        const view = await answerDailyQuestion(actor, body.answer, questionOptions);
        const activityRow={
          type:'daily-question',
          actor,
          text:actor+' '+activityVerb(actor,'ответил','ответила')+' на вопрос дня',
          icon:'💬',
          targetTab:'home',
          dedupeKey:'daily-question:'+actor+':'+view.date,
        };
        let journalRecorded=false;
        for(let attempt=0;attempt<2&&!journalRecorded;attempt+=1){
          try{
            await appendActivity(activityRow,options);
            journalRecorded=true;
          }catch(error){
            console.warn('RUDI_DAILY_QUESTION_ACTIVITY_WARN',String(error?.message||error));
          }
        }
        const notification=await sendDailyQuestionAnswerNotification(actor,options);
        return res.status(200).json({
          ok:true,
          operation,
          ...view,
          reward:{stars:0,awarded:false},
          activity:{recorded:journalRecorded},
          notification,
        });
      }

      return res.status(400).json({ ok:false, error:'daily-question-operation-invalid' });
    } catch (error) {
      const code=String(error?.message||error);
      const authStatus=statusForError(error);
      const status=authStatus!==500?authStatus
        : code==='daily-question-answer-empty'||code==='daily-question-answer-too-long'||code==='daily-question-actor-invalid' ? 400
        : code==='daily-question-already-answered' ? 409
        : code==='daily-question-ai-quota' ? 429
        : code==='groq-api-key-missing' ? 503
        : code.startsWith('daily-question-ai-')||code==='daily-question-missing' ? 502
        : 500;
      if(status>=500) console.error('RUDI_DAILY_QUESTION_ERROR',code);
      return res.status(status).json({ok:false,error:code});
    }
  }

  if (action === 'partner-message-like') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    try {
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      const { actor } = authorizeRequest(req, body.initData, options);
      const previousSnapshot = backupSnapshotFromToken(body.backupToken, options);
      const live = await readPartnerMessage(options).catch(() => null);
      if (!live && previousSnapshot?.partnerMessage) {
        await restoreStateBackup(body.backupToken, {
          ...options,
          cacheOptions: { ...(options.cacheOptions || {}), confirmWrites: false },
        }).catch(() => null);
      }
      const before = await readPartnerMessage(options);
      const message = await togglePartnerMessageLike(actor, options);
      const likedNow = message?.likes?.includes(actor);
      if (likedNow && !before?.likes?.includes(actor)) {
        await recordLikeActivity({ type:'partner-message', key:'current' }, actor, options).catch(() => null);
        // Лайк послания остаётся реакцией, но звёзды за него больше не начисляются.
      }
      const backupToken = await refreshBackupToken(previousSnapshot, options);
      return res.status(200).json({ ok:true, actor, message, backupToken });
    } catch (error) {
      const code = String(error?.message || error);
      const status = statusForError(error);
      return res.status(status === 500 && code.startsWith('partner-message-') ? 400 : status).json({ ok:false, error:code });
    }
  }

  if (action === 'partner-message-read') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    try {
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      authorizeRequest(req, body.initData, options);
      const previousSnapshot=backupSnapshotFromToken(body.backupToken,options);
      let message = await readPartnerMessageForHome(options);
      if(!message&&previousSnapshot?.partnerMessage){
        await restoreStateBackup(body.backupToken,{...options,cacheOptions:{...(options.cacheOptions||{}),confirmWrites:false}}).catch(()=>null);
        message = await readPartnerMessageForHome(options);
      }
      return res.status(200).json({ ok: true, message });
    } catch (error) {
      return res.status(statusForError(error)).json({ ok: false, error: String(error?.message || error) });
    }
  }

  if (action === 'search') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    try {
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      const { actor } = authorizeRequest(req, body.initData, options);
      const query = String(body.query || '').trim().slice(0, 240);
      const backupSnapshot = backupSnapshotFromToken(body.backupToken, options);
      const results = await searchGlobalData(query, {
        ...options,
        backupSnapshot,
        calendarUrl: backupSnapshot?.calendarUrl || '',
      });
      return res.status(200).json({ ok: true, actor, query, results });
    } catch (error) {
      const status = statusForError(error);
      if (status === 500) console.error('RUDI_GLOBAL_SEARCH_ERROR', String(error?.message || error));
      return res.status(status).json({ ok: false, error: String(error?.message || error) });
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



  if (action === 'for-di-feed') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    try {
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      const { actor } = authorizeRequest(req, body.initData, options);
      const operation = String(body.operation || 'list').trim();
      const previousSnapshot = backupSnapshotFromToken(body.backupToken, options);

      if (previousSnapshot?.forDiFeed?.initialized) {
        const liveBefore = await readForDiFeed(options).catch(() => ({ initialized:false, version:0, items:[] }));
        if (!liveBefore?.initialized || !(liveBefore.items || []).length) {
          await restoreStateBackup(body.backupToken, {
            ...options,
            cacheOptions: { ...(options.cacheOptions || {}), confirmWrites: false },
          }).catch(() => null);
        }
      }

      if (operation === 'list') {
        let live = await readForDiFeed(options).catch(() => ({ initialized:false, version:0, items:[] }));
        const todayKey=moscowDateKey(options.now||Date.now());
        const hasTodayLabor=(live.items||[]).some(item=>String(item?.source||'')==='labor'&&String(item?.dateKey||'')===todayKey);
        if(!hasTodayLabor){
          try{
            const { publishLaborArticle }=require('./labor-code.cjs');
            const { publishForDiToRudi }=require('./for-di-private.cjs');
            const now=new Date(options.now||Date.now());
            await publishLaborArticle({queueOnly:true,force:true,now,cache:getLaborCache(),fetchImpl:options.fetch||globalThis.fetch});
            await publishForDiToRudi({now,cacheOptions:options.cacheOptions});
            live=await readForDiFeed(options).catch(()=>live);
          }catch(error){
            console.warn('RUDI_FOR_DI_LABOR_SELF_HEAL_WARN',String(error?.message||error));
          }
        }
        const saved = previousSnapshot?.forDiFeed;
        const state = live?.initialized ? live : (saved?.initialized ? saved : live);
        return res.status(200).json({ ok:true, actor, ...state });
      }

      if (operation === 'save') {
        const result = await saveForDiItem(body.id, actor, options);
        const backupToken = await refreshBackupToken(previousSnapshot, options);
        return res.status(200).json({
          ok:true,
          actor,
          ...result.state,
          item:result.item,
          duplicate:result.duplicate,
          backupToken,
        });
      }

      if (operation === 'remove-saved') {
        const result = await removeForDiSaved(body.id, actor, options);
        const backupToken = await refreshBackupToken(previousSnapshot, options);
        return res.status(200).json({
          ok:true,
          actor,
          ...result.state,
          item:result.item,
          backupToken,
        });
      }

      if (operation === 'toggle-like') {
        const result = await toggleForDiLike(body.id, actor, options);
        const backupToken = await refreshBackupToken(previousSnapshot, options);
        await recordLikeActivity({ type:'feed', key:'for-di:' + String(body.id || '') }, actor, options).catch(() => null);
        return res.status(200).json({
          ok:true,
          actor,
          ...result.state,
          item:result.item,
          backupToken,
        });
      }

      return res.status(400).json({ ok:false, error:'for-di-operation-invalid' });
    } catch (error) {
      const code = String(error?.message || error);
      const authStatus = statusForError(error);
      const status = authStatus !== 500 ? authStatus
        : code === 'for-di-item-not-found' ? 404
        : code.startsWith('for-di-') ? 400
        : 500;
      if (status === 500) console.error('RUDI_FOR_DI_FEED_ERROR', code);
      return res.status(status).json({ ok:false, error:code });
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
        if (!result.duplicate && result.item) {
          const type = String(result.item.type || body.type || '').trim();
          const title = String(result.item.payload?.title || body.payload?.title || '').replace(/\s+/g, ' ').trim();
          const savedLabel = type === 'recipe' ? 'рецепт' : type === 'date' ? 'свидание' : 'сохранение';
          const savedVerb = activityVerb(actor, 'сохранил', 'сохранила');
          await recordActivity({
            type: type === 'recipe' ? 'saved-recipe' : type === 'date' ? 'saved-date' : 'saved-item',
            actor,
            text: actor + ' ' + savedVerb + ' ' + savedLabel + (title ? ': ' + title : ''),
            icon: type === 'recipe' ? '🍳' : type === 'date' ? '💞' : '🔖',
            targetTab: type === 'recipe' ? 'products' : type === 'date' ? 'dates' : 'home',
            dedupeKey: 'saved:' + String(result.item.id || activityDigest(result.item)),
          }, options);
        }
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
        const before=await readSavedItems(options);
        const target=before.items.find((row)=>row.id===String(body.id||'').trim())||null;
        if(target?.savedBy&&target.savedBy!==actor){
          return res.status(403).json({ok:false,error:'saved-item-owner-required'});
        }
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
      if (quotaBefore?.unlimited !== true && quotaBefore.available <= 0) {
        return res.status(429).json({ ok: false, error: 'date-generation-limit', quota: quotaBefore });
      }

      const [history, weatherRaw] = await Promise.all([
        readDateGenerationHistory(actor, options).catch(() => []),
        Promise.resolve().then(() => (options.getWeather || getWeather)()).catch(() => null),
      ]);
      const result = await generateDateIdeas({
        period: body.period,
        exclude: body.exclude,
        history,
        weather: buildDateWeatherContext(weatherRaw),
      }, {
        env: options.env || process.env,
        fetch: options.fetch || global.fetch,
      });
      const quota = await recordSuccessfulDateGeneration(actor, { ...options, ideas: result.ideas });
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
        dishType: body.dishType,
        taste: body.taste,
        cuisine: body.cuisine,
        timeMinutes: body.timeMinutes,
        excludeTitles: body.excludeTitles,
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
          || code === 'recipe-type-invalid'
          || code === 'recipe-taste-invalid'
          || code === 'recipe-cuisine-invalid'
          || code === 'recipe-time-invalid'
          || code === 'recipe-title-required' ? 400
        : code === 'recipe-ai-busy' || code === 'recipe-ai-rate-limited' ? 503
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
        // An initialized empty list is a valid state after the user clears products.
        // Restore from backup only on a real cache miss, never just because items is empty.
        if(!liveBefore?.initialized) {
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
        const values=Array.isArray(body.items)&&body.items.length?body.items:[body.text];
        const before=await readProductList(options); const beforeIds=new Set((before.items||[]).map((item)=>String(item.id||'')));
        const state=await addProducts(values,actor,options);
        const addedItems=(state.items||[]).filter((item)=>!beforeIds.has(String(item.id||'')));
        const added=compactActivityValues(addedItems.map((item)=>item.text));
        if(added){
          await recordActivity({type:'products',actor,text:actor+' '+activityVerb(actor,'добавил','добавила')+' в список продуктов: '+added,icon:'🛒',targetTab:'products'},options);
        }
        const backupToken=await refreshBackupToken(previousSnapshot,options);
        return res.status(200).json({ok:true,actor,...state,backupToken});
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
        const state = Array.isArray(body.checkedIds)
          ? await setProductCheckedSelection(body.checkedIds, options)
          : await toggleProductChecked(body.id, options);
        const backupToken=await refreshBackupToken(previousSnapshot,options);
        return res.status(200).json({ ok: true, actor, ...state, backupToken });
      }
      if (operation === 'bought') {
        const state = await markProductBought(body.id, actor, options);
        const backupToken=await refreshBackupToken(previousSnapshot,options);
        return res.status(200).json({ ok: true, actor, ...state, backupToken });
      }
      if (operation === 'buy-checked') {
        const state = Array.isArray(body.checkedIds)
          ? await markProductsBoughtByIds(body.checkedIds, actor, options)
          : await markCheckedProductsBought(actor, options);
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


  if (action === 'fasting') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
    try {
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      const { actor } = authorizeRequest(req, body.initData, options);
      const operation = String(body.operation || 'state').trim();

      if (operation === 'state') {
        const [state, scoreState] = await Promise.all([
          readFastingState(actor, options),
          readScoreState(options),
        ]);
        return res.status(200).json({ ok: true, actor, fasting: fastingViewWithRewards(state, actor, scoreState) });
      }
      if (operation === 'overview') {
        const [rustam, diana] = await Promise.all([
          readFastingState('Рустам', options),
          readFastingState('Диана', options),
        ]);
        return res.status(200).json({
          ok: true,
          actor,
          fastingOverview: {
            'Рустам': { active: fastingView(rustam).active },
            'Диана': { active: fastingView(diana).active },
          },
        });
      }
      if (operation === 'start') {
        const state = await startFasting(actor, {
          startedAt: body.startedAt,
          goalHours: body.goalHours,
        }, options);
        const activeId = String(state.active?.id || '').trim();
        await recordActivity({
          type: 'fasting-start',
          actor,
          text: actor + ' ' + activityVerb(actor, 'начал', 'начала') + ' голодание',
          icon: '⏱️',
          targetTab: 'fasting',
          dedupeKey: activeId ? 'fasting-start:' + actor + ':' + activeId : '',
          createdAt: state.active?.startedAt || new Date(options.now || Date.now()).toISOString(),
        }, options);
        const scoreState = await readScoreState(options).catch(() => null);
        return res.status(200).json({ ok: true, actor, fasting: fastingViewWithRewards(state, actor, scoreState) });
      }
      if (operation === 'stop') {
        const beforeStop = await readFastingState(actor, options);
        const stoppedId = String(beforeStop.active?.id || '').trim();
        const state = await stopFasting(actor, options);
        const completed = stoppedId
          ? (state.history || []).find((row) => String(row?.id || '') === stoppedId) || null
          : null;
        const rewardStars = fastingRewardStars(completed?.durationMinutes);
        let scoreAward = null;
        if (rewardStars > 0 && completed?.id) {
          scoreAward = await awardScoreSafe(actor, rewardStars * 10, {
            label: 'Голодание',
            detail: 'Завершено ' + fastingDurationDetail(completed.durationMinutes),
            icon: '⏱️',
            dedupeKey: 'score:fasting:' + actor + ':' + completed.id,
          }, options);
        }
        if (completed?.id) {
          await recordActivity({
            type: 'fasting-stop',
            actor,
            text: actor + ' ' + activityVerb(actor, 'завершил', 'завершила') + ' голодание: ' + fastingDurationDetail(completed.durationMinutes),
            icon: '⏱️',
            targetTab: 'fasting',
            dedupeKey: 'fasting-stop:' + actor + ':' + completed.id,
            createdAt: completed.endedAt || new Date(options.now || Date.now()).toISOString(),
          }, options);
        }
        const finalScoreState = scoreAward?.state || await readScoreState(options);
        return res.status(200).json({
          ok: true,
          actor,
          fasting: fastingViewWithRewards(state, actor, finalScoreState),
          savedToHistory: Boolean(completed),
          reward: {
            earnedStars: pointsFromUnits(scoreAward?.awardedUnits || 0),
            requestedStars: rewardStars,
            capped: Boolean(scoreAward?.capped),
          },
        });
      }
      return res.status(400).json({ ok: false, error: 'fasting-operation-invalid' });
    } catch (error) {
      const code = String(error?.message || error);
      const authStatus = statusForError(error);
      const status = authStatus !== 500 ? authStatus
        : code === 'fasting-already-active' || code === 'fasting-not-active' ? 409
        : code.startsWith('fasting-') ? 400
        : 500;
      if (status === 500) console.error('RUDI_FASTING_ERROR', code);
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
        const before=await readWishlist(options); const item=(before.items||[]).find((row)=>row.id===String(body.id||''))||null;
        if(!item) throw new Error('wishlist-item-not-found');
        if(item.owner===owner) throw new Error('wishlist-own-toggle-forbidden');
        const result=await toggleWish(body.id,options);
        if(!item.done&&result.item?.done) await awardScoreSafe(owner,50,{label:'Желание партнёра',detail:'Выполнено: '+String(item.text||'').trim(),icon:'🎁',dedupeKey:'score:wishlist-partner:'+owner+':'+String(item.id||'')},options);
        const backupToken=await refreshBackupToken(previousSnapshot,options);
        return res.status(200).json({ok:true,owner,...result.state,backupToken});
      }
      if (operation === 'remove') {
        const before = await readWishlist(options);
        const removedItem = (before.items || []).find((item) => item.id === String(body.id || '')) || null;
        if (!removedItem) throw new Error('wishlist-item-not-found');
        if (removedItem.owner !== owner) throw new Error('wishlist-owner-forbidden');
        const state = await removeWish(body.id, options);
        const backupToken=await refreshBackupToken(previousSnapshot,options);
        return res.status(200).json({ ok: true, owner, ...state, removedItem, backupToken });
      }
      if (operation === 'restore') {
        const item = body.item && typeof body.item === 'object' ? body.item : null;
        if (item?.owner && item.owner !== owner) throw new Error('wishlist-owner-forbidden');
        const state = await restoreWish({ ...(item || {}), owner }, options);
        const backupToken=await refreshBackupToken(previousSnapshot,options);
        return res.status(200).json({ ok: true, owner, ...state, backupToken });
      }
      return res.status(400).json({ ok: false, error: 'wishlist-operation-invalid' });
    } catch (error) {
      const code = String(error?.message || error);
      const authStatus = statusForError(error);
      const status = authStatus !== 500 ? authStatus
        : code === 'wishlist-item-not-found' ? 404
        : code === 'wishlist-owner-forbidden' || code === 'wishlist-own-toggle-forbidden' ? 403
        : 400;
      return res.status(status).json({ ok: false, error: code });
    }
  }

  return res.status(404).json({ ok: false, error: 'rudi-route-not-found' });
}

function systemHealthRow(id,label,status,detail,startedAt){
  return {
    id,
    label,
    status:['ok','warning','error'].includes(status)?status:'warning',
    detail:String(detail||''),
    latencyMs:Math.max(0,Date.now()-startedAt),
  };
}

async function runSystemHealthProbe(id,label,probe){
  const startedAt=Date.now();
  try{
    const result=await probe();
    if(result&&typeof result==='object'&&result.status){
      return systemHealthRow(id,label,result.status,result.detail,startedAt);
    }
    return systemHealthRow(id,label,'ok',String(result||'Работает'),startedAt);
  }catch(error){
    return systemHealthRow(id,label,'error',String(error?.message||error||'Недоступно'),startedAt);
  }
}

async function buildSystemHealth(actor,options={}){
  if(actor!=='Рустам') throw new Error('rudi-health-owner-only');
  const now=new Date(options.now||Date.now());
  const checks=await Promise.all([
    runSystemHealthProbe('database','База данных',async()=>{
      await readAuthRecord(actor,durableAuthOptions(options));
      return {status:'ok',detail:'Neon отвечает'};
    }),
    runSystemHealthProbe('cache','Кэш',async()=>{
      await getControlPlaneCache(options.cacheOptions||{}).get('daily-cron:last-attempt');
      return {status:'ok',detail:'Runtime Cache отвечает'};
    }),
    runSystemHealthProbe('ticktick','TickTick',async()=>{
      const config=await loadTickTickConfig(options);
      if(!config?.enabled) return {status:'warning',detail:'Интеграция выключена'};
      const token=await readToken(options);
      if(!token?.accessToken) return {status:'warning',detail:'Нужно подключить TickTick'};
      const expiresAt=Date.parse(token.expiresAt||'');
      if(Number.isFinite(expiresAt)&&expiresAt<=now.getTime()) return {status:'warning',detail:'Токен требует обновления'};
      return {status:'ok',detail:'Подключён'};
    }),
    runSystemHealthProbe('telegram','Telegram',async()=>{
      const token=resolveTelegramBotToken(options.env||process.env);
      if(!token) return {status:'error',detail:'Токен бота не настроен'};
      const recipients=await readRecipients(options).catch(()=>({}));
      const count=Object.values(recipients||{}).filter(Boolean).length;
      return count
        ? {status:'ok',detail:'Бот и получатели настроены'}
        : {status:'warning',detail:'Бот настроен, получатели не найдены'};
    }),
    runSystemHealthProbe('ai','AI',async()=>{
      const key=String((options.env||process.env).GROQ_API_KEY||'').trim();
      return key
        ? {status:'ok',detail:'Groq настроен'}
        : {status:'warning',detail:'Ключ Groq не найден'};
    }),
    runSystemHealthProbe('jobs','Фоновые задачи',async()=>{
      const [cron,rustamSummary,dianaSummary]=await Promise.all([
        getDailyCronState({cacheOptions:options.cacheOptions}),
        readSummaryState('Рустам',options),
        readSummaryState('Диана',options),
      ]);
      if(cron?.status==='failed') return {status:'error',detail:'Последний daily cron завершился ошибкой'};
      if(!cron) return {status:'warning',detail:'Нет данных о последнем daily cron'};
      const stamp=Date.parse(cron.finishedAt||cron.startedAt||'');
      if(Number.isFinite(stamp)&&now.getTime()-stamp>36*60*60*1000){
        return {status:'warning',detail:'Daily cron давно не запускался'};
      }
      const summaries=[rustamSummary?.sentAt,dianaSummary?.sentAt].filter(Boolean).length;
      return {status:'ok',detail:'Daily cron работает · утренние сводки: '+summaries+'/2'};
    }),
  ]);
  const overall=checks.some(row=>row.status==='error')
    ?'error'
    :checks.some(row=>row.status==='warning')?'warning':'ok';
  return {ok:true,overall,generatedAt:now.toISOString(),checks};
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
      id: 'msg-' + crypto.randomUUID(),
      text,
      authorName: actor || authorName,
      updatedAt: new Date(options.now || Date.now()).toISOString(),
      likes: [],
      likesInitialized: true,
    }, options);

    await recordActivity({type:'partner-message',actor,text:actor+' '+activityVerb(actor,'оставил','оставила')+' послание',icon:'💌',targetTab:'home',dedupeKey:'message:'+String(message?.updatedAt||'')},options);
    const messageScoreDate=moscowDateKey(options.now||Date.now());
    await awardScoreSafe(actor,1,{
      label:'Послание',
      detail:'Оставлено послание партнёру',
      icon:'💌',
      dedupeKey:'score:message:'+actor+':'+messageScoreDate,
    },options);

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
module.exports.dailyQuestionAnswerNotificationText = dailyQuestionAnswerNotificationText;
module.exports.sendDailyQuestionAnswerNotification = sendDailyQuestionAnswerNotification;
module.exports.sendRewardRedeemedNotification = sendRewardRedeemedNotification;
module.exports.sendRewardCompletedNotification = sendRewardCompletedNotification;
module.exports.moodNotificationText = moodNotificationText;
module.exports.sendMoodNotificationToPartner = sendMoodNotificationToPartner;
module.exports.taskCompletedNotificationText = taskCompletedNotificationText;
module.exports.sendTaskCompletedNotificationToPartner = sendTaskCompletedNotificationToPartner;
module.exports.checklistCompletedNotificationText = checklistCompletedNotificationText;
module.exports.sendChecklistCompletedNotificationToPartner = sendChecklistCompletedNotificationToPartner;
module.exports.sendCycleStartNotificationToRustam = sendCycleStartNotificationToRustam;
module.exports.luluWalkStatusLabel = luluWalkStatusLabel;
module.exports.luluWalkNotificationText = luluWalkNotificationText;
module.exports.sendLuluWalkNotificationToPartner = sendLuluWalkNotificationToPartner;
module.exports.activityItemsForActor = activityItemsForActor;
module.exports.feedPreviewBaseUrl = feedPreviewBaseUrl;
module.exports.refreshFeedFromPreviewIfNeeded = refreshFeedFromPreviewIfNeeded;

module.exports.correctRecipientsForSession = correctRecipientsForSession;
module.exports.authorizeRequest = authorizeRequest;
module.exports.sendShopUnlockNotification = sendShopUnlockNotification;
