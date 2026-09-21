const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');
const { readRecipients } = require('./partner-notification-store.cjs');
const { readPartnerMessage } = require('./partner-message-store.cjs');
const { readWishlist } = require('./wishlist-store.cjs');
const { readProductList } = require('./product-list-store.cjs');
const { readDailyMood } = require('./daily-mood-store.cjs');
const { readCycleState, cycleViewForDate } = require('./cycle-store.cjs');
const { getWorkWeek } = require('./work-calendar.cjs');
const { readToken } = require('./ticktick-store.cjs');
const {
  loadTickTickConfig,
  fetchProjectData,
  buildTickTickCalendar,
  calendarDateKey,
} = require('./ticktick-client.cjs');
const { readFeedSnapshot, moscowDateKey } = require('./feed-store.cjs');
const { telegramSendMessage, escapeTelegramHtml } = require('./telegram-notifications.cjs');

const NAMESPACE = 'rudi-morning-summary-v1';
const TTL_SECONDS = 60 * 60 * 24 * 3650;
const ACTORS = ['Рустам', 'Диана'];

function cacheOf(options = {}) {
  return options.summaryCache || createStrictRuntimeCache({
    namespace: NAMESPACE,
    ...(options.summaryCacheOptions || {}),
  });
}

function markerKey(actor) {
  return 'last:' + String(actor || '');
}

async function readSummaryMarker(actor, options = {}) {
  const value = await cacheOf(options).get(markerKey(actor)).catch(() => null);
  if (!value || typeof value !== 'object') return null;
  return {
    date: String(value.date || ''),
    sentAt: String(value.sentAt || ''),
  };
}

async function writeSummaryMarker(actor, date, sentAt, options = {}) {
  await cacheOf(options).set(markerKey(actor), {
    date: String(date || ''),
    sentAt: String(sentAt || ''),
  }, {
    ttl: TTL_SECONDS,
    tags: ['rudi-morning-summary'],
    name: 'morning-summary-' + actor,
  });
  return true;
}

function partnerFor(actor) {
  return actor === 'Рустам' ? 'Диана' : 'Рустам';
}

function assigneeFor(actor) {
  return actor === 'Рустам' ? 'RST' : 'Ди';
}

function filterTasksForActor(tasks, actor) {
  const expected = assigneeFor(actor);
  return (Array.isArray(tasks) ? tasks : []).filter((task) => {
    if (task?.completed) return false;
    if (!task?.assigned || task?.assignee === 'Не назначен') return true;
    return String(task?.assignee || '') === expected;
  });
}

function taskLine(task) {
  const title = escapeTelegramHtml(String(task?.title || 'Совместное дело').trim());
  const time = String(task?.startTime || '').trim();
  return '• ' + (time ? escapeTelegramHtml(time) + ' · ' : '') + title;
}

function moodLabel(value) {
  const mood = String(value || '');
  if (mood === 'low') return { emoji: '😔', text: 'не очень' };
  if (mood === 'ok') return { emoji: '😐', text: 'нормальное' };
  if (mood === 'great') return { emoji: '😄', text: 'отличное' };
  return null;
}

function lowerFirst(value) {
  const text = String(value || '').trim();
  return text ? text[0].toLowerCase() + text.slice(1) : '';
}

function countWord(count, one, few, many) {
  const n = Math.abs(Number(count) || 0) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return many;
  if (n1 > 1 && n1 < 5) return few;
  if (n1 === 1) return one;
  return many;
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function eventCount(value) {
  const text = stripHtml(value);
  const explicit = text.match(/Найдено[^\d]{0,40}(\d+)/iu);
  if (explicit) return Number(explicit[1]) || 0;
  const numbered = [...text.matchAll(/(?:^|\n)\s*\d+\.\s+/g)];
  return numbered.length;
}

function feedSummaryLines(feed, date) {
  if (!feed || feed.date !== date) return [];
  const lines = [];
  if (feed.sections?.facts?.parts?.length) lines.push('• новый полезный факт');

  const eventParts = Array.isArray(feed.sections?.events?.parts) ? feed.sections.events.parts : [];
  const concerts = String(eventParts[0] || '');
  if (concerts && !/не найден/iu.test(stripHtml(concerts))) {
    const count = eventCount(concerts);
    lines.push(count
      ? '• ' + count + ' ' + countWord(count, 'концерт', 'концерта', 'концертов')
      : '• концерты на сегодня');
  }

  const standup = String(eventParts[1] || '');
  if (standup && !/не найден/iu.test(stripHtml(standup))) {
    const count = eventCount(standup);
    lines.push(count
      ? '• ' + count + ' Stand Up ' + countWord(count, 'событие', 'события', 'событий')
      : '• Stand Up на сегодня');
  }

  if ((feed.changedSections || []).includes('cinema') && feed.sections?.cinema?.parts?.length) {
    lines.push('• новые кинопремьеры');
  }
  return lines;
}

function formatDate(now) {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: 'numeric',
    month: 'long',
  }).format(now);
}

function isNewAfter(value, since) {
  const time = Date.parse(String(value || ''));
  const threshold = Date.parse(String(since || ''));
  return Number.isFinite(time) && Number.isFinite(threshold) && time > threshold;
}

function wishlistLines(items, actor, since) {
  if (!since) return [];
  const partner = partnerFor(actor);
  return (Array.isArray(items) ? items : [])
    .filter((item) => item?.owner === partner && !item?.done && isNewAfter(item?.createdAt, since))
    .sort((a, b) => Date.parse(a.createdAt || 0) - Date.parse(b.createdAt || 0))
    .map((item) => String(item?.text || '').trim())
    .filter(Boolean);
}

function messageIsNewForActor(message, actor, since) {
  if (!message || !since) return false;
  return message.authorName === partnerFor(actor) && isNewAfter(message.updatedAt, since);
}

function workDayBlock(workDay) {
  if (!workDay) return '';
  if (!workDay.working) return '🛋 <b>Сегодня выходной</b>';
  const event = Array.isArray(workDay.events) ? workDay.events[0] : null;
  const range = event?.startTime && event?.endTime
    ? '\nСмена: ' + escapeTelegramHtml(event.startTime) + '–' + escapeTelegramHtml(event.endTime)
    : '';
  return '💼 <b>Сегодня рабочий день</b>' + range;
}

function buildMorningSummary(actor, data = {}) {
  const partner = partnerFor(actor);
  const blocks = [
    '☀️ <b>' + actor + ', доброе утро</b>\n' + escapeTelegramHtml(String(data.dateLabel || '')),
  ];

  if (actor === 'Диана' && data.workDay) {
    blocks.push(workDayBlock(data.workDay));
  }

  const tasks = filterTasksForActor(data.tasks, actor);
  if (tasks.length) {
    const visible = tasks.slice(0, 6);
    let body = '📅 <b>Твои дела на сегодня</b>\n' + visible.map(taskLine).join('\n');
    if (tasks.length > visible.length) body += '\n• ещё ' + (tasks.length - visible.length);
    blocks.push(body);
  } else {
    blocks.push('📅 <b>На сегодня дел нет</b>');
  }

  const partnerMood = moodLabel(data.moods?.[partner]?.mood);
  if (partnerMood) {
    blocks.push(
      '❤️ <b>' + partner + '</b>\n'
      + 'Настроение: ' + partnerMood.emoji + ' ' + partnerMood.text
    );
  }

  if (data.cycle?.moodWord) {
    const title = actor === 'Диана' ? 'Твой статус по циклу' : 'Диана по циклу';
    blocks.push(
      '🌸 <b>' + title + '</b>\n'
      + '<b>' + escapeTelegramHtml(data.cycle.moodWord) + '</b>'
      + (data.cycle.phase ? ' · ' + escapeTelegramHtml(lowerFirst(data.cycle.phase)) : '')
    );
  }

  if (data.newMessage) {
    blocks.push('💌 <b>Новое послание от ' + partner + '</b>');
  }

  const productCount = Number(data.productCount || 0);
  if (productCount > 0) {
    blocks.push(
      '🛒 <b>Продукты</b>\nВ списке ' + productCount + ' '
      + countWord(productCount, 'позиция', 'позиции', 'позиций')
    );
  }

  const wishes = Array.isArray(data.newWishlist) ? data.newWishlist : [];
  if (wishes.length) {
    const visible = wishes.slice(0, 3);
    const verb = partner === 'Диана' ? 'добавила' : 'добавил';
    let body = '🎁 <b>Вишлист</b>\n' + partner + ' ' + verb + ':\n'
      + visible.map((item) => '• ' + escapeTelegramHtml(item)).join('\n');
    if (wishes.length > visible.length) body += '\n• ещё ' + (wishes.length - visible.length);
    blocks.push(body);
  }

  if (Array.isArray(data.feedLines) && data.feedLines.length) {
    blocks.push('📰 <b>Сегодня в Ленте</b>\n' + data.feedLines.join('\n'));
  }

  blocks.push('Хорошего дня 🤍');
  return blocks.filter(Boolean).join('\n\n');
}

async function loadTodayTasks(options = {}) {
  if (typeof options.loadTasksImpl === 'function') return options.loadTasksImpl(options);
  try {
    const token = await readToken(options);
    if (!token?.accessToken) return [];
    const config = await loadTickTickConfig({
      env: options.env || process.env,
      fetchImpl: options.tickTickFetchImpl || globalThis.fetch,
    });
    if (!config.enabled) return [];
    const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
    const data = await fetchProjectData(token.accessToken, config.projectId, {
      fetchImpl: options.tickTickFetchImpl || globalThis.fetch,
    });
    const calendar = buildTickTickCalendar(data?.tasks || [], now, 'month');
    const today = calendarDateKey(now);
    return calendar.days.find((day) => day.date === today)?.events || [];
  } catch (error) {
    console.warn('RUDI_MORNING_TICKTICK_WARN', String(error?.message || error));
    return [];
  }
}

async function loadDianaWorkDay(options = {}) {
  if (typeof options.loadWorkDayImpl === 'function') return options.loadWorkDayImpl(options);
  try {
    const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
    const result = await getWorkWeek({
      now,
      fetchImpl: options.workCalendarFetchImpl || globalThis.fetch,
      ...(options.workCalendarCache ? { cache: options.workCalendarCache } : {}),
    });
    const date = moscowDateKey(now);
    return result?.days?.find((day) => day.date === date) || (result?.configured ? { date, working: false, events: [] } : null);
  } catch (error) {
    console.warn('RUDI_MORNING_WORK_CALENDAR_WARN', String(error?.message || error));
    return null;
  }
}

async function collectMorningData(options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const date = moscowDateKey(now);
  const [
    tasks,
    workDay,
    moods,
    cycleState,
    partnerMessage,
    wishlist,
    products,
    feed,
  ] = await Promise.all([
    loadTodayTasks({ ...options, now }),
    loadDianaWorkDay({ ...options, now }),
    (options.readMoodImpl || readDailyMood)(date, options).catch(() => ({ date, moods: {} })),
    (options.readCycleImpl || readCycleState)(options).catch(() => null),
    (options.readPartnerMessageImpl || readPartnerMessage)(options).catch(() => null),
    (options.readWishlistImpl || readWishlist)(options).catch(() => ({ items: [] })),
    (options.readProductsImpl || readProductList)(options).catch(() => ({ items: [] })),
    (options.readFeedImpl || readFeedSnapshot)({ ...options, now }).catch(() => ({ sections: {} })),
  ]);

  return {
    now,
    date,
    dateLabel: formatDate(now),
    tasks,
    workDay,
    moods: moods?.moods || {},
    cycle: cycleViewForDate(cycleState, date),
    partnerMessage,
    wishlistItems: wishlist?.items || [],
    productCount: Array.isArray(products?.items) ? products.items.length : 0,
    feedLines: feedSummaryLines(feed, date),
  };
}

async function sendDailyMorningSummaries(options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const date = moscowDateKey(now);
  const recipients = options.recipients || await readRecipients(options);
  const common = await collectMorningData({ ...options, now });
  const sent = [];
  const failed = [];

  for (const actor of ACTORS) {
    const chatId = Number(recipients?.[actor]);
    if (!Number.isInteger(chatId) || chatId <= 0) continue;

    const marker = await readSummaryMarker(actor, options);
    if (marker?.date === date) continue;

    const since = marker?.sentAt || '';
    const text = buildMorningSummary(actor, {
      ...common,
      newMessage: messageIsNewForActor(common.partnerMessage, actor, since),
      newWishlist: wishlistLines(common.wishlistItems, actor, since),
    });

    try {
      const result = await telegramSendMessage(chatId, text, {
        ...options,
        fetchImpl: options.telegramFetchImpl || options.fetchImpl || globalThis.fetch,
        tab: 'home',
        buttonText: 'Открыть RUDI',
      });
      await writeSummaryMarker(actor, date, now.toISOString(), options);
      sent.push({ actor, ...result });
    } catch (error) {
      failed.push({ actor, error: String(error?.message || error) });
    }
  }

  if (failed.length && !sent.length) {
    throw new Error('morning-summary-failed:' + failed.map((row) => row.actor).join(','));
  }

  return {
    sent: sent.length,
    failed,
    date,
  };
}

module.exports = {
  NAMESPACE,
  ACTORS,
  partnerFor,
  assigneeFor,
  filterTasksForActor,
  moodLabel,
  eventCount,
  feedSummaryLines,
  wishlistLines,
  messageIsNewForActor,
  workDayBlock,
  buildMorningSummary,
  loadTodayTasks,
  loadDianaWorkDay,
  collectMorningData,
  readSummaryMarker,
  writeSummaryMarker,
  sendDailyMorningSummaries,
};
