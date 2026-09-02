const { loadRudiSettings, SECTION_NAMES } = require('./rudi-settings.cjs');
const { getLatestDailyRun, getLatestPublication } = require('./publication-journal.cjs');
const { listSourceHealth } = require('./source-health.cjs');
const { getEventCleanupStatus } = require('./event-active-rollover.cjs');
const { getTopicMaintenanceCache } = require('./stateful-cache.cjs');

const SOURCE_IDS = [
  'events:yandex',
  'events:stage',
  'cinema:kinopolis',
  'cinema:mirage',
  'daily-content',
  'clients-advice',
];

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

async function buildHealthPayload(options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const settingsLoader = options.settingsLoader || loadRudiSettings;
  const latestRunGetter = options.getLatestDailyRun || getLatestDailyRun;
  const latestPublicationGetter = options.getLatestPublication || getLatestPublication;
  const sourceHealthGetter = options.listSourceHealth || listSourceHealth;
  const alertStateGetter = options.getAlertState || defaultAlertState;
  const eventCleanupGetter = options.getEventCleanupStatus || defaultEventCleanupStatus;

  const loaded = await settingsLoader(options.settingsOptions || {});
  const settings = loaded.settings;
  const latestPublications = {};
  await Promise.all(SECTION_NAMES.map(async (section) => {
    latestPublications[section] = await latestPublicationGetter(section, options.journalOptions || {});
  }));

  const [lastDailyRun, sourceHealth, alerts, eventCleanup] = await Promise.all([
    latestRunGetter(options.journalOptions || {}),
    sourceHealthGetter(options.sourceIds || SOURCE_IDS, options.sourceHealthOptions || {}),
    alertStateGetter(options.alertOptions || {}),
    eventCleanupGetter(options.topicCleanupOptions || {}),
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
    },
    sections: cloneSectionState(settings),
    operationalSettings: cloneOperationalSettings(settings),
    lastDailyRun: lastDailyRun || null,
    latestPublications,
    sourceHealth: sourceHealth || [],
    topicCleanup: { events: eventCleanup || null },
    alerts: alerts || null,
    overrides: loaded.overrides || {},
  };
}

module.exports = { SOURCE_IDS, moscowDate, cloneOperationalSettings, buildHealthPayload };
