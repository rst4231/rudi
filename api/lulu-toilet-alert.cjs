const { readLuluState, recordLuluToiletAlertRecipients } = require('./lulu-store.cjs');
const { luluToiletProbability } = require('./lulu-toilet.cjs');
const { readRecipients } = require('./partner-notification-store.cjs');
const { telegramSendMessage } = require('./telegram-notifications.cjs');
const { getWorkWeek } = require('./work-calendar.cjs');

const ALERT_TEXT = '🐾 <b>Лулу хочет в туалет</b>\nВероятность: <b>100%</b>';
const TZ = 'Europe/Moscow';

function moscowDateKey(value = Date.now()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year + '-' + values.month + '-' + values.day;
}

async function resolveLuluAlertRecipient(now, options = {}) {
  try {
    const loadWorkWeek = options.getWorkWeek || getWorkWeek;
    const week = options.workWeek || await loadWorkWeek({ ...options, now, view: 'week' });
    const todayKey = moscowDateKey(now);
    const today = Array.isArray(week?.days)
      ? week.days.find((day) => String(day?.date || '') === todayKey)
      : null;
    if (week?.configured && today) {
      const working = Boolean(today.working);
      return {
        actor: working ? 'Рустам' : 'Диана',
        working,
        date: todayKey,
        fallback: false,
      };
    }
    return {
      actor: 'Рустам',
      working: null,
      date: todayKey,
      fallback: true,
      reason: 'work-calendar-unavailable',
    };
  } catch (error) {
    return {
      actor: 'Рустам',
      working: null,
      date: moscowDateKey(now),
      fallback: true,
      reason: 'work-calendar-error',
      error: String(error?.message || error),
    };
  }
}

async function runLuluToiletAlert(options = {}) {
  const now = new Date(options.now || Date.now());
  const lulu = await readLuluState(options);
  const walkedAt = String(lulu?.lastWalk?.walkedAt || '');
  if (!walkedAt) return { sent: [], skipped: 'no-walk', probability: null };

  const probability = luluToiletProbability(walkedAt, now);
  if (probability === null || probability < 100) {
    return { sent: [], skipped: 'below-threshold', probability };
  }

  const routing = await resolveLuluAlertRecipient(now, options);
  const targetActor = routing.actor;
  const already = new Set(
    lulu?.toiletAlert?.walkedAt === walkedAt
      ? (Array.isArray(lulu.toiletAlert.recipients) ? lulu.toiletAlert.recipients : [])
      : []
  );
  if (already.has(targetActor)) {
    return {
      probability,
      walkedAt,
      sent: [],
      failed: [],
      missing: [],
      alreadySent: Array.from(already),
      targetActor,
      routing,
      completed: true,
    };
  }

  const recipients = options.recipients || await readRecipients(options) || {};
  const send = options.telegramSendMessage || telegramSendMessage;
  const sent = [], failed = [], missing = [];
  const chatId = Number(recipients?.[targetActor]);

  if (!Number.isInteger(chatId) || chatId <= 0) {
    missing.push(targetActor);
  } else {
    try {
      const result = await send(chatId, ALERT_TEXT, options);
      sent.push({ actor: targetActor, ...result });
    } catch (error) {
      failed.push({ actor: targetActor, error: String(error?.message || error) });
    }
  }

  if (sent.length) {
    await recordLuluToiletAlertRecipients(walkedAt, sent.map((row) => row.actor), { ...options, now });
  }

  return {
    probability,
    walkedAt,
    sent,
    failed,
    missing,
    alreadySent: Array.from(already),
    targetActor,
    routing,
    completed: sent.some((row) => row.actor === targetActor),
  };
}

module.exports = {
  ALERT_TEXT,
  moscowDateKey,
  resolveLuluAlertRecipient,
  runLuluToiletAlert,
};
