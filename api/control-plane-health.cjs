const { loadRudiSettings, SECTION_NAMES } = require('./rudi-settings.cjs');
const { getLatestDailyRun, getLatestPublication } = require('./publication-journal.cjs');
const { listSourceHealth } = require('./source-health.cjs');
const { getEventCleanupStatus, getEventTrackingState } = require('./event-active-rollover.cjs');
const { getDailyCronState } = require('./daily-cron-state.cjs');
const { getTopicMaintenanceCache } = require('./stateful-cache.cjs');

const SOURCE_IDS = [
  'events:yandex',
  'events:stage',
  'cinema:kinopolis',
  'cinema:mirage',
  'daily-content',
  'clients-advice',
];
const STALE_PUBLICATION_PENDING_MS = 10 * 60 * 1000;


function moscowParts(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid health timestamp');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function moscowDate(value = new Date()) {
  const parts = moscowParts(value);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function normalizeHealthCronState(state) {
  if (!state || typeof state !== 'object') return null;
  if (state.status === 'unauthorized' && state.authorized !== true) return null;
  return structuredClone(state);
}

function normalizeHealthPublication(record, now = new Date(), stalePendingMs = STALE_PUBLICATION_PENDING_MS) {
  if (!record || typeof record !== 'object') return record || null;
  const normalized = structuredClone(record);
  if (normalized.status !== 'pending') return normalized;

  const startedAt = Date.parse(normalized.startedAt || '');
  const currentTime = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const staleAfter = Math.max(60 * 1000, Number(stalePendingMs) || STALE_PUBLICATION_PENDING_MS);
  if (!Number.isFinite(startedAt) || !Number.isFinite(currentTime) || currentTime - startedAt <= staleAfter) {
    return normalized;
  }

  normalized.status = 'stale';
  normalized.metadata = {
    ...(normalized.metadata && typeof normalized.metadata === 'object' ? normalized.metadata : {}),
    healthDerivedStatus: 'stale-pending',
  };
  return normalized;
}

function cloneSectionState(settings) {
  const result = {};
  for (const section of SECTION_NAMES) result[section] = structuredClone(settings.sections[section]);
  return result;
}

function cloneOperationalSettings(settings) {
  return {
    publishing: structuredClone(settings.publishing),
    dedupe: structuredClone(settings.dedupe),
    alerts: structuredClone(settings.alerts),
    sources: structuredClone(settings.sources),
    copy: structuredClone(settings.copy),
  };
}

async function defaultAlertState() {
  try {
    const { getAlertState } = require('./alert-service.cjs');
    return await getAlertState();
  } catch {
    return null;
  }
}

async function defaultEventCleanupStatus(options = {}) {
  try {
    const cache = options.cache || getTopicMaintenanceCache(options.cacheOptions || {});
    return await getEventCleanupStatus(cache);
  } catch {
    return null;
  }
}

async function defaultEventTrackingState(options = {}) {
  try {
    const cache = options.cache || getTopicMaintenanceCache(options.cacheOptions || {});
    return await getEventTrackingState(cache);
  } catch {
    return null;
  }
}

async function defaultDailyCronState(options = {}) {
  try { return await getDailyCronState(options); }
  catch { return null; }
}


// Health checks must never mutate Telegram forum topics.
async function syncForumTopicNamesSafe() { return null; }

async function buildHealthPayload(options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const settingsLoader = options.settingsLoader || loadRudiSettings;
  const latestRunGetter = options.getLatestDailyRun || getLatestDailyRun;
  const latestPublicationGetter = options.getLatestPublication || getLatestPublication;
  const sourceHealthGetter = options.listSourceHealth || listSourceHealth;
  const alertStateGetter = options.getAlertState || defaultAlertState;
  const eventCleanupGetter = options.getEventCleanupStatus || defaultEventCleanupStatus;
  const eventTrackingGetter = options.getEventTrackingState || defaultEventTrackingState;
  const dailyCronGetter = options.getDailyCronState || defaultDailyCronState;

  const loaded = await settingsLoader(options.settingsOptions || {});
  const settings = loaded.settings;
  const latestPublications = {};
  await Promise.all(SECTION_NAMES.map(async (section) => {
    const record = await latestPublicationGetter(section, options.journalOptions || {});
    latestPublications[section] = normalizeHealthPublication(record, now, options.stalePendingMs);
  }));

  const [lastDailyRun, sourceHealth, alerts, eventCleanup, eventTracking, dailyCronState] = await Promise.all([
    latestRunGetter(options.journalOptions || {}),
    sourceHealthGetter(options.sourceIds || SOURCE_IDS, options.sourceHealthOptions || {}),
    alertStateGetter(options.alertOptions || {}),
    eventCleanupGetter(options.topicCleanupOptions || {}),
    eventTrackingGetter(options.topicCleanupOptions || {}),
    dailyCronGetter(options.cronStateOptions || {}),
  ]);

  return {
    ok: true,
    service: 'spb-daily-guide-bot',
    date: moscowDate(now),
    generatedAt: now.toISOString(),
    timezone: settings.timezone,
    settingsVersion: settings.version,
    settingsSource: loaded.source,
    cron: {
      path: '/api/daily',
      schedule: '30 21 * * *',
      description: settings.publishing.dailyCronDescription,
      lastAttempt: normalizeHealthCronState(dailyCronState),
    },
    sections: cloneSectionState(settings),
    operationalSettings: cloneOperationalSettings(settings),
    lastDailyRun: lastDailyRun || null,
    latestPublications,
    sourceHealth: sourceHealth || [],
    topicCleanup: { events: eventCleanup || null },
    eventTracking: {
      activeDate: eventTracking?.active?.dateKey || null,
      activeMessages: eventTracking?.active?.messageIds?.length || 0,
      pendingBatches: eventTracking?.pendingBatches || 0,
      pendingMessages: eventTracking?.pendingMessages || 0,
    },
    alerts: alerts || null,
    overrides: loaded.overrides || {},
  };
}

module.exports = {
  SOURCE_IDS,
  STALE_PUBLICATION_PENDING_MS,
  moscowDate,
  normalizeHealthCronState,
  normalizeHealthPublication,
  cloneOperationalSettings,
  syncForumTopicNamesSafe,
  buildHealthPayload,
};
