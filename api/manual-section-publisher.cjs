const { SECTION_NAMES, loadRudiSettings } = require('./rudi-settings.cjs');
const { normalizePreviewSections } = require('./preview-sections.cjs');
const { getContentOverride, appendFooter } = require('./section-controls.cjs');
const {
  getPublicationRecord,
  markPublicationPending,
  markPublicationPublished,
  markPublicationFailed,
} = require('./publication-journal.cjs');
const { runNativeSection } = require('./section-runners.cjs');
const { runPreview } = require('./preview.js');
const { handleTelegramTopicRequest, getKnownForumChatId } = require('./topic-maintenance.cjs');
const { resolveTelegramBotToken } = require('./products-bought.cjs');
const { findForumChatIdInEnv } = require('./forum-chat-id.cjs');
const { incrementSectionMetric } = require('./feedback-analytics.cjs');

const SECTION_SET = new Set(SECTION_NAMES);
const NATIVE_SECTIONS = new Set(['cinema', 'labor', 'weekend']);

function validDate(value) {
  const date = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('date must be YYYY-MM-DD');
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error('date must be YYYY-MM-DD');
  }
  return date;
}

function validSection(value) {
  const section = String(value || '').trim();
  if (!SECTION_SET.has(section)) throw new Error('unknown section');
  return section;
}

async function metric(section, name, options = {}) {
  try {
    const increment = options.incrementMetric || incrementSectionMetric;
    await increment(section, name, 1, {
      cache: options.analyticsCache || options.controlCache,
      now: options.now,
    });
  } catch (error) {
    console.warn('RUDI_ANALYTICS_METRIC_ERROR', section, name, String(error?.message || error));
  }
}

function responseCollector() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return payload; },
  };
}

async function defaultPreviewProvider(date, options = {}) {
  const req = { query: { date }, headers: {} };
  const res = responseCollector();
  await runPreview(req, res, {
    now: options.now,
    handler: options.previewHandler,
    fetchImpl: options.previewFetchImpl || globalThis.fetch,
  });
  if (res.statusCode >= 400 || !res.payload) throw new Error(`Preview failed for ${date}`);
  return res.payload;
}

async function resolveChatId(options = {}) {
  if (options.chatId) return options.chatId;
  try {
    const cached = await getKnownForumChatId({ cache: options.topicCache });
    if (cached) return cached;
  } catch {}
  return findForumChatIdInEnv(options.env || process.env);
}

async function defaultSendTelegram(payload, options = {}) {
  const env = options.env || process.env;
  const token = options.token || resolveTelegramBotToken(env);
  const chatId = await resolveChatId(options);
  if (!chatId) throw new Error('Telegram forum chat id is unavailable');
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const response = await handleTelegramTopicRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_thread_id: payload.topicId,
      text: payload.text,
      parse_mode: 'HTML',
      disable_notification: true,
    }),
  }, {
    fetchImpl: options.fetchImpl || globalThis.fetch,
    settings: payload.settings,
    publicationDate: payload.date,
    bypassSectionControls: true,
    bypassDailyDedupe: true,
    env,
  });
  if (!response?.ok) {
    let detail = '';
    try { detail = await response.text(); } catch {}
    throw new Error(`Telegram manual publish failed: HTTP ${response?.status || 0}${detail ? ` ${detail}` : ''}`);
  }
  let data = null;
  try { data = await response.clone().json(); } catch {}
  const messageId = Number(data?.result?.message_id);
  if (!Number.isInteger(messageId) || messageId <= 0) throw new Error('Telegram manual publish returned no message id');
  return { messageId };
}

async function publishSelectedSection(input, options = {}) {
  const section = validSection(input?.section);
  const date = validDate(input?.date);
  const force = input?.force === true;
  const retryFailedOnly = input?.retryFailedOnly === true;
  const loaded = options.settings
    ? { settings: options.settings }
    : await (options.settingsLoader || loadRudiSettings)(options.settingsOptions || {});
  const settings = loaded.settings;
  const getRecord = options.getRecord || ((d, s) => getPublicationRecord(d, s, { cache: options.journalCache }));
  const record = await getRecord(date, section);

  if (retryFailedOnly && record?.status !== 'failed') {
    return { ok: false, error: 'not-failed', section, date };
  }
  if (record?.status === 'published' && !force) {
    return { ok: false, error: 'already-published', section, date };
  }

  if (NATIVE_SECTIONS.has(section)) {
    return (options.runNative || ((name, runOptions) => runNativeSection(name, runOptions)))(section, {
      ...options,
      date,
      settings,
      force,
      retryFailedOnly,
    });
  }

  const topicId = Number(settings?.sections?.[section]?.topicId);
  if (!Number.isInteger(topicId) || topicId <= 0) {
    return { ok: false, error: 'section-has-no-topic', section, date };
  }

  const previewProvider = options.previewProvider || ((requestedDate) => defaultPreviewProvider(requestedDate, options));
  const preview = await previewProvider(date);
  const normalized = normalizePreviewSections(preview);
  const view = normalized[section];
  const getOverride = options.getOverride || ((d, s) => getContentOverride(d, s, { cache: options.controlCache }));
  const override = await getOverride(date, section);
  const parts = Array.isArray(override?.parts) && override.parts.length
    ? override.parts.map((part) => String(part).trim()).filter(Boolean)
    : (view?.parts || []);
  if (!parts.length) return { ok: false, error: 'preview-unavailable', section, date };

  const footer = String(settings?.copy?.footers?.[section] || '').trim();
  const effectiveParts = parts.map((part) => override?.includeFooter === false ? part : appendFooter(part, footer));
  const markPending = options.markPending || ((row) => markPublicationPending(row, { cache: options.journalCache, now: options.now }));
  const markPublished = options.markPublished || ((row) => markPublicationPublished(row, { cache: options.journalCache, now: options.now }));
  const markFailed = options.markFailed || ((row) => markPublicationFailed(row, { cache: options.journalCache, now: options.now }));
  const sendTelegram = options.sendTelegram || ((payload) => defaultSendTelegram(payload, options));

  await markPending({ date, section, sourceIds: ['manual-preview'], metadata: { manual: true, force } });
  const messageIds = [];
  try {
    for (const text of effectiveParts) {
      const sent = await sendTelegram({ section, date, topicId, text, settings });
      const messageId = Number(sent?.messageId);
      if (!Number.isInteger(messageId) || messageId <= 0) throw new Error('Manual sender returned no message id');
      messageIds.push(messageId);
    }
  } catch (error) {
    await markFailed({ date, section, error, messageIds, sourceIds: ['manual-preview'], metadata: { manual: true, force } });
    await metric(section, 'failures', options);
    throw error;
  }

  await markPublished({
    date,
    section,
    messageIds,
    sourceIds: ['manual-preview'],
    metadata: { manual: true, force, partCount: effectiveParts.length },
  });
  await metric(section, 'publications', options);
  await metric(section, 'successfulPublications', options);
  return { ok: true, section, date, published: effectiveParts.length, messageIds, forced: force };
}

module.exports = {
  NATIVE_SECTIONS,
  validDate,
  validSection,
  defaultPreviewProvider,
  defaultSendTelegram,
  publishSelectedSection,
};