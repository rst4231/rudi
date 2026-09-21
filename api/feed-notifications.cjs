const { readRecipients } = require('./partner-notification-store.cjs');
const {
  readFeedSnapshot,
  wasFeedNoticeSent,
  markFeedNoticeSent,
  moscowDateKey,
} = require('./feed-store.cjs');
const { telegramSendMessage } = require('./telegram-notifications.cjs');

const LABELS = {
  facts: 'интересные факты',
  events: 'мероприятия',
  cinema: 'кинопремьеры',
};

function joinRu(items) {
  const rows = items.filter(Boolean);
  if (rows.length <= 1) return rows[0] || '';
  if (rows.length === 2) return rows.join(' и ');
  return rows.slice(0, -1).join(', ') + ' и ' + rows.at(-1);
}

async function sendDailyFeedNotifications(options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const date = moscowDateKey(now);
  const feed = await readFeedSnapshot({ ...options, now });
  const changed = (feed.changedSections || []).filter((name) => feed.sections?.[name] && LABELS[name]);

  if (!feed.version || feed.date !== date || !changed.length) {
    return { sent: 0, skipped: 'nothing-new', date, version: feed.version || null };
  }

  const recipients = options.recipients || await readRecipients(options);
  const labels = joinRu(changed.map((name) => LABELS[name]));
  const sent = [];
  const failed = [];

  for (const actor of ['Рустам', 'Диана']) {
    const chatId = Number(recipients?.[actor]);
    if (!Number.isInteger(chatId) || chatId <= 0) continue;
    if (await wasFeedNoticeSent(date, feed.version, actor, options)) continue;
    const text = `📰 <b>${actor}, я обновил Ленту</b>\n<i>Добавил ${labels}.</i>\n\nПосмотри в приложении.`;
    try {
      const result = await telegramSendMessage(chatId, text, {
        ...options,
        tab: 'feed',
        buttonText: 'Открыть Ленту',
      });
      await markFeedNoticeSent(date, feed.version, actor, options);
      sent.push({ actor, ...result });
    } catch (error) {
      failed.push({ actor, error: String(error?.message || error) });
    }
  }

  if (failed.length && !sent.length) {
    throw new Error('feed-notification-failed:' + failed.map((row) => row.actor).join(','));
  }

  return {
    sent: sent.length,
    failed,
    date,
    version: feed.version,
    changedSections: changed,
  };
}

module.exports = {
  LABELS,
  joinRu,
  sendDailyFeedNotifications,
};
