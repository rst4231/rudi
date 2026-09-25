const { readLuluState, recordLuluToiletAlertRecipients } = require('./lulu-store.cjs');
const { luluToiletProbability, localMinutes } = require('./lulu-toilet.cjs');
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

function shiftDateKey(key, days) {
  const [year, month, day] = String(key).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function clockMinutes(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function eventCoversNow(event, eventDate, now, todayKey, yesterdayKey) {
  if (!event || typeof event !== 'object') return false;
  if (event.allDay) return eventDate === todayKey;

  const start = clockMinutes(event.startTime);
  const end = clockMinutes(event.endTime);
  if (start === null || end === null) return false;
  const current = localMinutes(now);

  if (end > start) {
    return eventDate === todayKey && current >= start && current < end;
  }

  if (eventDate === todayKey) return current >= start;
  if (eventDate === yesterdayKey) return current < end;
  return false;
}

async function resolveLuluAlertRecipient(now, options = {}) {
  try {
    const loadWorkWeek = options.getWorkWeek || getWorkWeek;
    const todayKey = moscowDateKey(now);
    const yesterdayKey = shiftDateKey(todayKey, -1);
    const calendarNow = new Date(new Date(now).getTime() - 24 * 60 * 60 * 1000);
    const week = options.workWeek || await loadWorkWeek({ ...options, now: calendarNow, view: 'week' });
    const days = Array.isArray(week?.days) ? week.days : [];
    const today = days.find((day) => String(day?.date || '') === todayKey);
    const yesterday = days.find((day) => String(day?.date || '') === yesterdayKey);

    if (week?.configured && today) {
      const onShift = [today, yesterday].filter(Boolean).some((day) =>
        (Array.isArray(day.events) ? day.events : [])
          .some((event) => eventCoversNow(event, String(day.date || ''), now, todayKey, yesterdayKey))
      );
      return {
        actor: onShift ? 'Рустам' : 'Диана',
        onShift,
        date: todayKey,
        fallback: false,
      };
    }

    return {
      actor: 'Рустам',
      onShift: null,
      date: todayKey,
      fallback: true,
      reason: 'work-calendar-unavailable',
    };
  } catch (error) {
    return {
      actor: 'Рустам',
      onShift: null,
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

  const already = new Set(
    lulu?.toiletAlert?.walkedAt === walkedAt
      ? (Array.isArray(lulu.toiletAlert.recipients) ? lulu.toiletAlert.recipients : [])
      : []
  );
  if (already.size > 0) {
    return {
      probability,
      walkedAt,
      sent: [],
      failed: [],
      missing: [],
      alreadySent: Array.from(already),
      completed: true,
    };
  }

  const routing = await resolveLuluAlertRecipient(now, options);
  const targetActor = routing.actor;
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
  shiftDateKey,
  clockMinutes,
  eventCoversNow,
  resolveLuluAlertRecipient,
  runLuluToiletAlert,
};
