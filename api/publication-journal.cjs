const { getControlPlaneCache } = require('./stateful-cache.cjs');
const { SECTION_NAMES } = require('./rudi-settings.cjs');

const SECTION_SET = new Set(SECTION_NAMES);

function resolveCache(options = {}) {
  return options.cache || getControlPlaneCache(options.cacheOptions || {});
}

function nowIso(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid journal timestamp');
  return date.toISOString();
}

function validDate(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error('Journal date must be YYYY-MM-DD');
  const parsed = new Date(`${text}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    throw new Error('Journal date must be YYYY-MM-DD');
  }
  return text;
}

function validSection(value) {
  const section = String(value || '').trim();
  if (!SECTION_SET.has(section)) throw new Error(`Unknown journal section: ${section || '<empty>'}`);
  return section;
}

function journalKey(date, section) {
  return `journal:${validDate(date)}:${validSection(section)}`;
}

function latestKey(section) {
  return `journal:latest:${validSection(section)}`;
}

function normalizeArray(input, mapper = (value) => value) {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.map(mapper).filter((value) => value !== null && value !== undefined && value !== ''))];
}

function normalizeMessageIds(input) {
  return normalizeArray(input, (value) => {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : null;
  });
}

function normalizeStrings(input) {
  return normalizeArray(input, (value) => String(value || '').trim());
}

function mergeMetadata(current, extra) {
  return {
    ...(current && typeof current === 'object' && !Array.isArray(current) ? current : {}),
    ...(extra && typeof extra === 'object' && !Array.isArray(extra) ? extra : {}),
  };
}

async function getPublicationRecord(date, section, options = {}) {
  return resolveCache(options).get(journalKey(date, section));
}

async function writeRecord(record, options = {}) {
  const cache = resolveCache(options);
  await cache.set(journalKey(record.date, record.section), record, {
    tags: ['rudi-publication-journal', `rudi-publication-${record.section}`],
    name: `journal:${record.date}:${record.section}`,
  });
  await cache.set(latestKey(record.section), record, {
    tags: ['rudi-publication-journal', `rudi-publication-${record.section}`],
    name: `journal:latest:${record.section}`,
  });
  return structuredClone(record);
}

async function markPublicationPending(input, options = {}) {
  const date = validDate(input?.date);
  const section = validSection(input?.section);
  const current = await getPublicationRecord(date, section, options);
  if (current?.status === 'published' || current?.status === 'pending') return structuredClone(current);
  const timestamp = nowIso(options.now || new Date());
  const record = {
    date,
    section,
    status: 'pending',
    attempts: Math.max(0, Number(current?.attempts || 0)) + 1,
    startedAt: current?.startedAt || timestamp,
    finishedAt: null,
    messageIds: normalizeMessageIds(current?.messageIds),
    sourceIds: normalizeStrings(input?.sourceIds ?? current?.sourceIds),
    fingerprints: normalizeStrings(input?.fingerprints ?? current?.fingerprints),
    error: null,
    metadata: mergeMetadata(current?.metadata, input?.metadata),
  };
  return writeRecord(record, options);
}

async function markPublicationPublished(input, options = {}) {
  const date = validDate(input?.date);
  const section = validSection(input?.section);
  const current = await getPublicationRecord(date, section, options);
  const timestamp = nowIso(options.now || new Date());
  const record = {
    date,
    section,
    status: 'published',
    attempts: Math.max(1, Number(current?.attempts || input?.attempts || 1)),
    startedAt: current?.startedAt || timestamp,
    finishedAt: timestamp,
    messageIds: normalizeMessageIds(input?.messageIds ?? current?.messageIds),
    sourceIds: normalizeStrings(input?.sourceIds ?? current?.sourceIds),
    fingerprints: normalizeStrings(input?.fingerprints ?? current?.fingerprints),
    error: null,
    metadata: mergeMetadata(current?.metadata, input?.metadata),
  };
  return writeRecord(record, options);
}

async function markPublicationFailed(input, options = {}) {
  const date = validDate(input?.date);
  const section = validSection(input?.section);
  const current = await getPublicationRecord(date, section, options);
  const timestamp = nowIso(options.now || new Date());
  const record = {
    date,
    section,
    status: 'failed',
    attempts: Math.max(1, Number(current?.attempts || input?.attempts || 1)),
    startedAt: current?.startedAt || timestamp,
    finishedAt: timestamp,
    messageIds: normalizeMessageIds(input?.messageIds ?? current?.messageIds),
    sourceIds: normalizeStrings(input?.sourceIds ?? current?.sourceIds),
    fingerprints: normalizeStrings(input?.fingerprints ?? current?.fingerprints),
    error: String(input?.error?.message || input?.error || 'Publication failed').slice(0, 2000),
    metadata: mergeMetadata(current?.metadata, input?.metadata),
  };
  return writeRecord(record, options);
}

async function markPublicationSkipped(input, options = {}) {
  const date = validDate(input?.date);
  const section = validSection(input?.section);
  const current = await getPublicationRecord(date, section, options);
  if (current?.status === 'published') return structuredClone(current);
  const timestamp = nowIso(options.now || new Date());
  const record = {
    date,
    section,
    status: 'skipped',
    attempts: Math.max(0, Number(current?.attempts || 0)),
    startedAt: current?.startedAt || timestamp,
    finishedAt: timestamp,
    messageIds: normalizeMessageIds(current?.messageIds),
    sourceIds: normalizeStrings(input?.sourceIds ?? current?.sourceIds),
    fingerprints: normalizeStrings(input?.fingerprints ?? current?.fingerprints),
    error: null,
    metadata: mergeMetadata(current?.metadata, {
      ...(input?.metadata || {}),
      ...(input?.reason ? { reason: String(input.reason).slice(0, 500) } : {}),
    }),
  };
  return writeRecord(record, options);
}

async function getLatestPublication(section, options = {}) {
  return resolveCache(options).get(latestKey(section));
}

async function writeDailyRunSummary(dateInput, summary = {}, options = {}) {
  const date = validDate(dateInput);
  const cache = resolveCache(options);
  const record = {
    ...structuredClone(summary || {}),
    date,
    finishedAt: nowIso(options.now || new Date()),
  };
  await cache.set(`daily-run:${date}`, record, {
    tags: ['rudi-daily-runs'],
    name: `daily-run:${date}`,
  });
  await cache.set('daily-run:latest', record, {
    tags: ['rudi-daily-runs'],
    name: 'daily-run:latest',
  });
  return structuredClone(record);
}

async function getLatestDailyRun(options = {}) {
  return resolveCache(options).get('daily-run:latest');
}

module.exports = {
  journalKey,
  getPublicationRecord,
  getLatestPublication,
  markPublicationPending,
  markPublicationPublished,
  markPublicationFailed,
  markPublicationSkipped,
  writeDailyRunSummary,
  getLatestDailyRun,
};
