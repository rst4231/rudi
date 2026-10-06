const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const NAMESPACE = 'rudi-ui-preferences-v1';
const TTL_SECONDS = 60 * 60 * 24 * 3650;

let mutationTail = Promise.resolve();

function cleanActor(value) {
  const actor = String(value || '').trim();
  return actor === 'Рустам' || actor === 'Диана' ? actor : '';
}

function cacheOf(options = {}) {
  return options.uiPreferencesCache || options.cache || createStrictRuntimeCache({
    namespace: NAMESPACE,
    ...(options.cacheOptions || {}),
  });
}

function stateKey(actor) {
  const clean = cleanActor(actor);
  if (!clean) throw new Error('ui-preferences-actor-invalid');
  return clean === 'Диана' ? 'diana' : 'rustam';
}

function normalizeBooleanMap(value, { limit = 128, keyLength = 96 } = {}) {
  const result = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  for (const [rawKey, rawValue] of Object.entries(value).slice(0, limit)) {
    const key = String(rawKey || '').trim().slice(0, keyLength);
    if (key) result[key] = Boolean(rawValue);
  }
  return result;
}

function normalizeStringList(value, { limit = 160, itemLength = 80 } = {}) {
  const result = [];
  for (const raw of Array.isArray(value) ? value : []) {
    const item = String(raw || '').trim().slice(0, itemLength);
    if (item && !result.includes(item)) result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function normalizeUiPreferencesState(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const homeOrder = [];
  for (const raw of Array.isArray(source.homeOrder) ? source.homeOrder : []) {
    const id = String(raw || '').trim().slice(0, 64);
    if (id && !homeOrder.includes(id) && homeOrder.length < 64) homeOrder.push(id);
  }

  const blockStates = normalizeBooleanMap(source.blockStates);
  const viewStates = normalizeBooleanMap(source.viewStates);

  const activitySeenId = String(source.activitySeenId || '').trim().slice(0, 80);
  const activityReadIds = normalizeStringList(source.activityReadIds);
  const marketTickerEnabled = Object.prototype.hasOwnProperty.call(source, 'marketTickerEnabled')
    ? Boolean(source.marketTickerEnabled)
    : true;
  const themeMode = ['system', 'light', 'dark'].includes(String(source.themeMode || '').trim())
    ? String(source.themeMode).trim()
    : 'system';
  const autoRefreshEnabled = Object.prototype.hasOwnProperty.call(source, 'autoRefreshEnabled')
    ? Boolean(source.autoRefreshEnabled)
    : true;
  const interfaceTextSize = ['small', 'normal', 'large'].includes(String(source.interfaceTextSize || '').trim())
    ? String(source.interfaceTextSize).trim()
    : 'normal';
  const contactTelegramUsername = String(source.contactTelegramUsername || '')
    .trim()
    .replace(/^@+/u, '')
    .replace(/[^A-Za-z0-9_]/gu, '')
    .slice(0, 32);
  let contactDigits = String(source.contactPhone || '').replace(/\D/gu, '').slice(0, 15);
  if (contactDigits.length === 11 && contactDigits.startsWith('8')) contactDigits = '7' + contactDigits.slice(1);
  if (contactDigits.length === 10) contactDigits = '7' + contactDigits;
  const contactPhone = contactDigits ? '+' + contactDigits : '';
  const moodNotifyPartnerEnabled = Object.prototype.hasOwnProperty.call(source, 'moodNotifyPartnerEnabled')
    ? Boolean(source.moodNotifyPartnerEnabled)
    : true;
  const moodReceivePartnerEnabled = Object.prototype.hasOwnProperty.call(source, 'moodReceivePartnerEnabled')
    ? Boolean(source.moodReceivePartnerEnabled)
    : true;
  const humidityAlertEnabled = Object.prototype.hasOwnProperty.call(source, 'humidityAlertEnabled')
    ? Boolean(source.humidityAlertEnabled)
    : true;
  const morningSummaryEnabled = Object.prototype.hasOwnProperty.call(source, 'morningSummaryEnabled')
    ? Boolean(source.morningSummaryEnabled)
    : true;
  const rewardNotificationsEnabled = Object.prototype.hasOwnProperty.call(source, 'rewardNotificationsEnabled')
    ? Boolean(source.rewardNotificationsEnabled)
    : true;
  const dailyQuestionNotificationEnabled = Object.prototype.hasOwnProperty.call(source, 'dailyQuestionNotificationEnabled')
    ? Boolean(source.dailyQuestionNotificationEnabled)
    : true;
  const sharedTaskNotificationsEnabled = Object.prototype.hasOwnProperty.call(source, 'sharedTaskNotificationsEnabled')
    ? Boolean(source.sharedTaskNotificationsEnabled)
    : true;
  const luluWalkNotificationsEnabled = Object.prototype.hasOwnProperty.call(source, 'luluWalkNotificationsEnabled')
    ? Boolean(source.luluWalkNotificationsEnabled)
    : true;
  const rawUpdatedAt = String(source.updatedAt || '').trim();
  const parsed = rawUpdatedAt ? new Date(rawUpdatedAt) : null;
  return {
    initialized: Boolean(source.initialized),
    version: Math.max(0, Number(source.version || 0)),
    syncSchemaVersion: Math.max(1, Number(source.syncSchemaVersion || 1)),
    homeOrder,
    blockStates,
    viewStates,
    activitySeenId,
    activityReadIds,
    marketTickerEnabled,
    themeMode,
    autoRefreshEnabled,
    interfaceTextSize,
    contactTelegramUsername,
    contactPhone,
    moodNotifyPartnerEnabled,
    moodReceivePartnerEnabled,
    humidityAlertEnabled,
    morningSummaryEnabled,
    rewardNotificationsEnabled,
    dailyQuestionNotificationEnabled,
    sharedTaskNotificationsEnabled,
    luluWalkNotificationsEnabled,
    updatedAt: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : '',
  };
}

function enqueueMutation(task) {
  const run = mutationTail.then(task, task);
  mutationTail = run.catch(() => {});
  return run;
}

async function readUiPreferences(actor, options = {}) {
  const value = await cacheOf(options).get(stateKey(actor));
  return normalizeUiPreferencesState(value);
}

async function persistUiPreferences(actor, value, options = {}) {
  const state = normalizeUiPreferencesState(value);
  await cacheOf(options).set(stateKey(actor), state, {
    ttl: TTL_SECONDS,
    tags: ['rudi-ui-preferences'],
    name: stateKey(actor),
  });
  return state;
}

async function saveUiPreferences(actor, value, options = {}) {
  return enqueueMutation(async () => {
    const current = await readUiPreferences(actor, options);
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const incoming = normalizeUiPreferencesState(source);
    const updatedAt = new Date(options.now || Date.now()).toISOString();
    const has = (key) => Object.prototype.hasOwnProperty.call(source, key);
    return persistUiPreferences(actor, {
      initialized: true,
      version: Math.max(0, Number(current.version || 0)) + 1,
      syncSchemaVersion: 9,
      homeOrder: has('homeOrder') ? incoming.homeOrder : current.homeOrder,
      blockStates: has('blockStates')
        ? { ...current.blockStates, ...incoming.blockStates }
        : current.blockStates,
      viewStates: has('viewStates')
        ? { ...current.viewStates, ...incoming.viewStates }
        : current.viewStates,
      activitySeenId: has('activitySeenId') ? incoming.activitySeenId : current.activitySeenId,
      activityReadIds: has('activityReadIds')
        ? normalizeStringList([...(incoming.activityReadIds || []), ...(current.activityReadIds || [])])
        : current.activityReadIds,
      marketTickerEnabled: has('marketTickerEnabled') ? incoming.marketTickerEnabled : current.marketTickerEnabled,
      themeMode: has('themeMode') ? incoming.themeMode : current.themeMode,
      autoRefreshEnabled: has('autoRefreshEnabled') ? incoming.autoRefreshEnabled : current.autoRefreshEnabled,
      interfaceTextSize: has('interfaceTextSize') ? incoming.interfaceTextSize : current.interfaceTextSize,
      contactTelegramUsername: has('contactTelegramUsername')
        ? (incoming.contactTelegramUsername || current.contactTelegramUsername)
        : current.contactTelegramUsername,
      contactPhone: has('contactPhone')
        ? (incoming.contactPhone || current.contactPhone)
        : current.contactPhone,
      moodNotifyPartnerEnabled: has('moodNotifyPartnerEnabled') ? incoming.moodNotifyPartnerEnabled : current.moodNotifyPartnerEnabled,
      moodReceivePartnerEnabled: has('moodReceivePartnerEnabled') ? incoming.moodReceivePartnerEnabled : current.moodReceivePartnerEnabled,
      humidityAlertEnabled: has('humidityAlertEnabled') ? incoming.humidityAlertEnabled : current.humidityAlertEnabled,
      morningSummaryEnabled: has('morningSummaryEnabled') ? incoming.morningSummaryEnabled : current.morningSummaryEnabled,
      rewardNotificationsEnabled: has('rewardNotificationsEnabled') ? incoming.rewardNotificationsEnabled : current.rewardNotificationsEnabled,
      dailyQuestionNotificationEnabled: has('dailyQuestionNotificationEnabled') ? incoming.dailyQuestionNotificationEnabled : current.dailyQuestionNotificationEnabled,
      sharedTaskNotificationsEnabled: has('sharedTaskNotificationsEnabled') ? incoming.sharedTaskNotificationsEnabled : current.sharedTaskNotificationsEnabled,
      luluWalkNotificationsEnabled: has('luluWalkNotificationsEnabled') ? incoming.luluWalkNotificationsEnabled : current.luluWalkNotificationsEnabled,
      updatedAt,
    }, options);
  });
}

async function seedUiPreferences(actor, value, options = {}) {
  return enqueueMutation(async () => {
    const current = await readUiPreferences(actor, options);
    if (current.initialized) return current;
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const incoming = normalizeUiPreferencesState(source);
    const has = (key) => Object.prototype.hasOwnProperty.call(source, key);
    const hasAny = incoming.homeOrder.length
      || Object.keys(incoming.blockStates).length
      || Object.keys(incoming.viewStates).length
      || incoming.activitySeenId
      || incoming.activityReadIds.length
      || has('marketTickerEnabled')
      || has('themeMode')
      || has('autoRefreshEnabled')
      || has('interfaceTextSize')
      || has('contactTelegramUsername')
      || has('contactPhone')
      || has('moodNotifyPartnerEnabled')
      || has('moodReceivePartnerEnabled')
      || has('humidityAlertEnabled')
      || has('morningSummaryEnabled')
      || has('rewardNotificationsEnabled')
      || has('dailyQuestionNotificationEnabled')
      || has('sharedTaskNotificationsEnabled')
      || has('luluWalkNotificationsEnabled');
    if (!hasAny) return current;
    return persistUiPreferences(actor, {
      initialized: true,
      version: 1,
      syncSchemaVersion: 9,
      homeOrder: incoming.homeOrder,
      blockStates: incoming.blockStates,
      viewStates: incoming.viewStates,
      activitySeenId: incoming.activitySeenId,
      activityReadIds: incoming.activityReadIds,
      marketTickerEnabled: incoming.marketTickerEnabled,
      themeMode: incoming.themeMode,
      autoRefreshEnabled: incoming.autoRefreshEnabled,
      interfaceTextSize: incoming.interfaceTextSize,
      contactTelegramUsername: incoming.contactTelegramUsername,
      contactPhone: incoming.contactPhone,
      moodNotifyPartnerEnabled: incoming.moodNotifyPartnerEnabled,
      moodReceivePartnerEnabled: incoming.moodReceivePartnerEnabled,
      humidityAlertEnabled: incoming.humidityAlertEnabled,
      morningSummaryEnabled: incoming.morningSummaryEnabled,
      rewardNotificationsEnabled: incoming.rewardNotificationsEnabled,
      dailyQuestionNotificationEnabled: incoming.dailyQuestionNotificationEnabled,
      sharedTaskNotificationsEnabled: incoming.sharedTaskNotificationsEnabled,
      luluWalkNotificationsEnabled: incoming.luluWalkNotificationsEnabled,
      updatedAt: incoming.updatedAt || new Date(options.now || Date.now()).toISOString(),
    }, options);
  });
}

function resetMutationQueueForTests() {
  mutationTail = Promise.resolve();
}

module.exports = {
  NAMESPACE,
  TTL_SECONDS,
  normalizeUiPreferencesState,
  readUiPreferences,
  saveUiPreferences,
  seedUiPreferences,
  resetMutationQueueForTests,
};
