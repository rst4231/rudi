const {
  fingerprintContent,
  getRecentFingerprints,
  rememberFingerprints,
} = require('./content-fingerprint.cjs');
const { loadRudiSettings } = require('./rudi-settings.cjs');
const {
  markPublicationPending,
  markPublicationPublished,
  markPublicationSkipped,
  markPublicationFailed,
} = require('./publication-journal.cjs');
const { resolveTelegramBotToken } = require('./products-bought.cjs');
const { getKnownForumChatId, handleTelegramTopicRequest } = require('./topic-maintenance.cjs');

function weekdayMondayZero(dateKey) {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return (value + 6) % 7;
}

function isWeekendPublicationDay(dateKey, days = [4, 5]) {
  return days.includes(weekdayMondayZero(dateKey));
}

function normalizeCandidate(row, kind) {
  if (!row || !String(row.title || '').trim()) return null;
  return {
    kind,
    title: String(row.title).trim(),
    time: String(row.time || row.releaseDate || '').trim(),
    url: String(row.url || row.sourceUrl || '').trim(),
    venue: String(row.venue || '').trim(),
    date: String(row.date || '').trim(),
    source: String(row.source || kind).trim(),
    id: row.id || row.sourceId || null,
  };
}

function buildWeekendItems(input = {}, options = {}) {
  const seen = options.seenFingerprints || new Set();
  const candidates = [];
  for (const row of input.events || []) {
    const item = normalizeCandidate(row, 'event');
    if (item) candidates.push(item);
  }
  for (const row of input.cinema || []) {
    const item = normalizeCandidate(row, 'cinema');
    if (item) candidates.push(item);
  }

  const unique = new Map();
  for (const item of candidates) {
    const kind = item.kind === 'cinema' ? 'cinema' : 'events';
    const fingerprint = fingerprintContent(kind, item);
    if (seen.has(fingerprint) || unique.has(fingerprint)) continue;
    unique.set(fingerprint, { ...item, fingerprint });
  }

  const all = [...unique.values()];
  const picked = [];
  for (const kind of ['event', 'cinema']) {
    const row = all.find((item) => item.kind === kind && !picked.includes(item));
    if (row) picked.push(row);
  }
  for (const row of all) {
    if (picked.length >= 7) break;
    if (!picked.includes(row)) picked.push(row);
  }

  const result = picked.slice(0, 7);
  return {
    items: result,
    fingerprints: result.map((item) => item.fingerprint),
    skipped: result.length < 3 ? 'insufficient-verified-items' : null,
  };
}

function escapeHtml(value) {
  return String(value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function formatWeekendDigest(items, dateKey) {
  const lines = ['✨ <b>Куда сходить на выходных</b>', ''];
  items.forEach((item, index) => {
    const meta = [item.time, item.venue].filter(Boolean).join(' · ');
    lines.push(
      `<b>${index + 1}. ${escapeHtml(item.title)}</b>${meta ? `\n${escapeHtml(meta)}` : ''}${item.url ? `\n${escapeHtml(item.url)}` : ''}`,
      '',
    );
  });
  lines.push(`📅 Подборка на ${dateKey}`);
  return lines.join('\n').trim();
}

async function defaultPreviewProvider(dateKey, options = {}) {
  const host = String(options.previewBaseUrl || process.env.VERCEL_PROJECT_PRODUCTION_URL || 'spb-daily-guide-bot.vercel.app').replace(/^https?:\/\//, '');
  const response = await (options.fetchImpl || globalThis.fetch)(
    `https://${host}/api/preview?date=${encodeURIComponent(dateKey)}`,
    { headers: { 'user-agent': 'RUDI-Weekend/1.0' }, cache: 'no-store' },
  );
  if (!response?.ok) throw new Error(`Weekend preview HTTP ${response?.status || 0}`);
  return response.json();
}

function candidatesFromPreview(payload, dateKey) {
  const events = [];
  for (const row of payload?.results?.events?.concerts || []) events.push({ ...row, date: dateKey, source: 'yandex' });
  for (const row of payload?.results?.events?.stage || []) events.push({ ...row, date: dateKey, source: 'stage' });
  const cinema = (payload?.results?.cinema?.items || payload?.cinema || []).map((row) => ({ ...row, date: dateKey }));
  return { events, cinema };
}

async function publishWeekendDigest(options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const dateKey = options.dateKey || new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  const loaded = options.settings ? { settings: options.settings } : await loadRudiSettings(options.settingsOptions || {});
  const settings = loaded.settings;
  const manageJournal = options.manageJournal !== false;

  if (!settings.sections.weekend.enabled) return { skipped: 'disabled', date: dateKey };
  if (!isWeekendPublicationDay(dateKey, settings.publishing.weekendDays)) return { skipped: 'not-weekend-day', date: dateKey };

  if (manageJournal) await markPublicationPending({ date: dateKey, section: 'weekend' }, { cache: options.journalCache, now });
  try {
    const seen = options.seenFingerprints || await getRecentFingerprints('weekend', {
      cache: options.dedupeCache,
      days: settings.dedupe.weekendDays,
      now,
    });
    const preview = await (options.previewProvider || defaultPreviewProvider)(dateKey, options);
    const candidates = candidatesFromPreview(preview, dateKey);
    const built = buildWeekendItems(candidates, { seenFingerprints: seen });
    if (built.skipped) {
      if (manageJournal) await markPublicationSkipped({ date: dateKey, section: 'weekend', reason: built.skipped }, { cache: options.journalCache, now });
      return { date: dateKey, ...built };
    }

    const token = options.token || resolveTelegramBotToken(options.env || process.env);
    const chatId = options.chatId || await getKnownForumChatId();
    if (!chatId) throw new Error('Weekend chat id unavailable');
    const topicId = settings.sections.events.topicId;
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await handleTelegramTopicRequest(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_thread_id: topicId,
        text: formatWeekendDigest(built.items, dateKey),
        parse_mode: 'HTML',
        disable_notification: true,
      }),
    }, {
      fetchImpl: options.fetchImpl || globalThis.fetch,
      settings,
      publicationDate: dateKey,
    });
    if (!response?.ok) throw new Error(`Weekend Telegram HTTP ${response?.status || 0}`);

    let messageId = null;
    try { messageId = Number((await response.clone().json())?.result?.message_id) || null; } catch {}
    await rememberFingerprints('weekend', built.fingerprints, settings.dedupe.weekendDays, { cache: options.dedupeCache, now });
    if (manageJournal) {
      await markPublicationPublished({
        date: dateKey,
        section: 'weekend',
        messageIds: messageId ? [messageId] : [],
        sourceIds: ['events-preview', 'cinema-preview'],
        fingerprints: built.fingerprints,
      }, { cache: options.journalCache, now });
    }
    return {
      date: dateKey,
      published: built.items.length,
      messageId,
      sourceIds: ['events-preview', 'cinema-preview'],
      fingerprints: built.fingerprints,
      items: built.items,
    };
  } catch (error) {
    if (manageJournal) await markPublicationFailed({ date: dateKey, section: 'weekend', error }, { cache: options.journalCache, now });
    throw error;
  }
}

module.exports = {
  weekdayMondayZero,
  isWeekendPublicationDay,
  buildWeekendItems,
  formatWeekendDigest,
  candidatesFromPreview,
  publishWeekendDigest,
};