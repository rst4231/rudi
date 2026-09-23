const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const NAMESPACE = 'rudi-private-cycle-v1';
const STATE_KEY = 'diana-cycle';
const TTL_SECONDS = 60 * 60 * 24 * 3650;
const MAX_HISTORY = 24;
const DAY = 86400000;

function cacheOf(options = {}) {
  return options.cycleCache || options.cache || createStrictRuntimeCache({
    namespace: NAMESPACE,
    ...(options.cacheOptions || {}),
  });
}

function validDateKey(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  const parsed = new Date(text + 'T00:00:00Z');
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text ? '' : text;
}

function shiftDateKey(value, days) {
  const key = validDateKey(value);
  if (!key) return '';
  const date = new Date(key + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function clamp(value, min, max, fallback) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function averageCycleLength(history, fallback = 30) {
  const dates = history.map((value) => Date.parse(value + 'T00:00:00Z')).filter(Number.isFinite);
  const diffs = [];
  for (let index = 1; index < dates.length; index += 1) {
    const days = Math.round((dates[index] - dates[index - 1]) / DAY);
    if (days >= 20 && days <= 45) diffs.push(days);
  }
  const recent = diffs.slice(-6);
  return recent.length
    ? Math.round(recent.reduce((sum, value) => sum + value, 0) / recent.length)
    : fallback;
}

function normalizeCycleState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const history = [...new Set((Array.isArray(value.historyStarts) ? value.historyStarts : [])
    .map(validDateKey)
    .filter(Boolean))]
    .sort()
    .slice(-MAX_HISTORY);

  const configuredLength = clamp(value.cycleLengthDays, 20, 45, 30);
  const cycleLengthDays = averageCycleLength(history, configuredLength);
  const periodLengthDays = clamp(value.periodLengthDays, 1, 10, 5);
  const ovulationDay = clamp(value.ovulationDay, 8, Math.max(8, cycleLengthDays - 5), Math.max(10, cycleLengthDays - 14));
  const fertileWindowStartDay = clamp(value.fertileWindowStartDay, 1, cycleLengthDays, Math.max(1, ovulationDay - 4));
  const fertileWindowEndDay = clamp(value.fertileWindowEndDay, fertileWindowStartDay, cycleLengthDays, Math.min(cycleLengthDays, ovulationDay + 2));

  let nextPeriodStart = validDateKey(value.nextPeriodStart);
  if (!nextPeriodStart && history.length) nextPeriodStart = shiftDateKey(history[history.length - 1], cycleLengthDays);
  if (!history.length && !nextPeriodStart) return null;

  return {
    enabled: true,
    person: 'Диана',
    timezone: 'Europe/Moscow',
    cycleLengthDays,
    periodLengthDays,
    ovulationDay,
    fertileWindowStartDay,
    fertileWindowEndDay,
    historyStarts: history,
    nextPeriodStart,
    updatedAt: String(value.updatedAt || ''),
  };
}


function cycleViewForDate(value, dateKey) {
  const state = normalizeCycleState(value);
  const today = validDateKey(dateKey);
  if (!state || !today) return null;

  const cycleLength = state.cycleLengthDays;
  const periodLength = state.periodLengthDays;
  const ovulationDay = state.ovulationDay;
  const fertileStart = state.fertileWindowStartDay;
  const fertileEnd = state.fertileWindowEndDay;
  const todayMs = Date.parse(today + 'T00:00:00Z');
  const history = state.historyStarts
    .map((date) => Date.parse(date + 'T00:00:00Z'))
    .filter((date) => Number.isFinite(date) && date <= todayMs)
    .sort((a, b) => a - b);
  const latestActualStart = history.length ? history[history.length - 1] : null;

  let nextStartKey = validDateKey(state.nextPeriodStart);
  let nextStartMs = nextStartKey ? Date.parse(nextStartKey + 'T00:00:00Z') : NaN;
  if (!Number.isFinite(nextStartMs) && Number.isFinite(latestActualStart)) {
    nextStartMs = latestActualStart + cycleLength * DAY;
  }
  while (Number.isFinite(nextStartMs) && nextStartMs + (periodLength - 1) * DAY < todayMs) {
    nextStartMs += cycleLength * DAY;
  }

  const periodActive = Number.isFinite(nextStartMs)
    && todayMs >= nextStartMs
    && todayMs <= nextStartMs + (periodLength - 1) * DAY;
  const currentStartMs = Number.isFinite(nextStartMs)
    ? (periodActive ? nextStartMs : nextStartMs - cycleLength * DAY)
    : latestActualStart;
  const cycleDay = Number.isFinite(currentStartMs)
    ? Math.max(1, Math.min(cycleLength, Math.floor((todayMs - currentStartMs) / DAY) + 1))
    : null;

  let phase = 'Недостаточно данных';
  if (periodActive) phase = 'Месячные';
  else if (Number.isFinite(currentStartMs) && cycleDay) {
    if (cycleDay >= fertileStart && cycleDay <= fertileEnd) phase = 'Фертильное окно';
    else if (cycleDay < fertileStart) phase = 'Фолликулярная фаза';
    else phase = 'Лютеиновая фаза';
  }

  const pickStatus = (items, seed = 0) => {
    if (!Array.isArray(items) || !items.length) return '';
    const value = Number.isFinite(Number(seed)) ? Math.abs(Math.round(Number(seed))) : 0;
    return items[value % items.length];
  };
  const daysToNext = Number.isFinite(nextStartMs)
    ? Math.max(0, Math.round((nextStartMs - todayMs) / DAY))
    : null;

  let moodWord = '';
  if (phase === 'Месячные') {
    moodWord = cycleDay <= 2
      ? pickStatus(['Спокойная','Нежная','Уютная'], cycleDay)
      : pickStatus(['Нежная','Спокойная','Вдумчивая'], cycleDay);
  } else if (phase === 'Фолликулярная фаза') {
    if (cycleDay <= periodLength + 2) {
      moodWord = pickStatus(['Бодрая','Лёгкая','Собранная'], cycleDay);
    } else if (cycleDay >= fertileStart - 2) {
      moodWord = pickStatus(['Энергичная','Активная','Воодушевлённая'], cycleDay);
    } else {
      moodWord = pickStatus(['Бодрая','Активная','Собранная','Воодушевлённая'], cycleDay);
    }
  } else if (phase === 'Фертильное окно') {
    if (cycleDay === ovulationDay) {
      moodWord = pickStatus(['Яркая','Энергичная','Сияющая'], cycleDay);
    } else if (cycleDay < ovulationDay) {
      moodWord = pickStatus(['Энергичная','Яркая','Активная','Общительная'], cycleDay);
    } else {
      moodWord = pickStatus(['Уверенная','Собранная','Уравновешенная'], cycleDay);
    }
  } else if (phase === 'Лютеиновая фаза') {
    if (Number.isFinite(daysToNext) && daysToNext <= 2) {
      moodWord = pickStatus(['Нежная','Спокойная','Чувствительная'], cycleDay);
    } else if (Number.isFinite(daysToNext) && daysToNext <= 5) {
      moodWord = pickStatus(['Чувствительная','Вдумчивая','Спокойная'], cycleDay);
    } else if (cycleDay <= ovulationDay + 3) {
      moodWord = pickStatus(['Уравновешенная','Собранная','Спокойная'], cycleDay);
    } else {
      moodWord = pickStatus(['Уравновешенная','Вдумчивая','Спокойная','Собранная'], cycleDay);
    }
  }

  return {
    phase,
    moodWord,
    cycleDay,
    cycleLengthDays: cycleLength,
    nextPeriodStart: Number.isFinite(nextStartMs)
      ? new Date(nextStartMs).toISOString().slice(0, 10)
      : '',
  };
}

async function readCycleState(options = {}) {
  return normalizeCycleState(await cacheOf(options).get(STATE_KEY));
}

async function writeCycleState(value, options = {}) {
  const normalized = normalizeCycleState(value);
  if (!normalized) throw new Error('cycle-state-invalid');
  normalized.updatedAt = new Date(options.now || Date.now()).toISOString();
  await cacheOf(options).set(STATE_KEY, normalized, {
    ttl: TTL_SECONDS,
    tags: ['rudi-private-cycle'],
    name: STATE_KEY,
  });
  return normalized;
}

async function bootstrapCycleState(value, options = {}) {
  const current = await readCycleState(options);
  if (current) return { created: false, state: current };
  return { created: true, state: await writeCycleState(value, options) };
}

function cycleStateWithStart(current, value) {
  const date = validDateKey(value);
  if (!date) throw new Error('cycle-date-invalid');
  const normalized = normalizeCycleState(current);
  if (!normalized) throw new Error('cycle-not-configured');

  const history = [...new Set([...normalized.historyStarts, date])].sort().slice(-MAX_HISTORY);
  const cycleLengthDays = averageCycleLength(history, normalized.cycleLengthDays);
  const latest = history[history.length - 1];

  return normalizeCycleState({
    ...normalized,
    historyStarts: history,
    cycleLengthDays,
    nextPeriodStart: shiftDateKey(latest, cycleLengthDays),
  });
}

async function recordCycleStart(value, options = {}) {
  const current = await readCycleState(options);
  const next = cycleStateWithStart(current, value);
  return writeCycleState(next, options);
}

module.exports = {
  NAMESPACE,
  STATE_KEY,
  TTL_SECONDS,
  MAX_HISTORY,
  validDateKey,
  shiftDateKey,
  averageCycleLength,
  normalizeCycleState,
  cycleViewForDate,
  cycleStateWithStart,
  readCycleState,
  writeCycleState,
  bootstrapCycleState,
  recordCycleStart,
};
