const crypto = require('node:crypto');

const AUTH_URL = 'https://ticktick.com/oauth/authorize';
const TOKEN_URL = 'https://ticktick.com/oauth/token';
const API_BASE_URL = 'https://api.ticktick.com/open/v1';
const DEFAULT_REDIRECT_URI = 'https://spb-daily-guide-bot.vercel.app/api/ticktick/callback';
const DEFAULT_PROJECT_ID = '6a97b9e80a2d51030e185acf';
const CONFIG_URL = 'https://raw.githubusercontent.com/rst4231/rudi/main/rudi-config.json';
const OAUTH_SCOPE = 'tasks:read tasks:write';

const ASSIGNEE_HASH_TO_NAME = new Map([
  ['d1e4b6a1e31e8b555a1385990b4811855848d84be631bc3c999acec09e7d43a0', 'RST'],
  ['796be56752d88c6ee7c17e6e9d7cd9323dbd81142b9ab201f5f028ec53a6b2f9', 'Ди'],
]);

function getCredentials(env = process.env) {
  const clientId = String(env.TICKTICK_CLIENT_ID || '').trim();
  const clientSecret = String(env.TICKTICK_CLIENT_SECRET || '').trim();
  const redirectUri = String(env.TICKTICK_REDIRECT_URI || DEFAULT_REDIRECT_URI).trim();
  return { clientId, clientSecret, redirectUri };
}

function credentialsConfigured(env = process.env) {
  const { clientId, clientSecret } = getCredentials(env);
  return Boolean(clientId && clientSecret);
}

function buildAuthorizeUrl({ clientId, redirectUri, state }) {
  const url = new URL(AUTH_URL);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('scope', OAUTH_SCOPE);
  url.searchParams.set('state', state);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  return url.toString();
}

async function exchangeCode(code, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const { clientId, clientSecret, redirectUri } = getCredentials(options.env || process.env);
  if (!clientId || !clientSecret) throw new Error('ticktick-credentials-missing');

  const body = new URLSearchParams({
    code: String(code || ''),
    grant_type: 'authorization_code',
    scope: OAUTH_SCOPE,
    redirect_uri: redirectUri,
  });

  const auth = Buffer.from(clientId + ':' + clientSecret).toString('base64');
  const response = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + auth,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  });

  if (!response.ok) throw new Error('ticktick-token-exchange-failed:' + response.status);
  return response.json();
}

async function loadTickTickConfig(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  try {
    const response = await fetchImpl(CONFIG_URL + '?t=' + Date.now(), {
      cache: 'no-store',
      headers: { accept: 'application/json', 'user-agent': 'RUDI-TickTick/1.0' },
    });
    if (!response.ok) throw new Error('config');
    const config = await response.json();
    return {
      enabled: config?.ticktick?.enabled !== false,
      projectId: String(config?.ticktick?.projectId || DEFAULT_PROJECT_ID).trim(),
    };
  } catch {
    return { enabled: true, projectId: DEFAULT_PROJECT_ID };
  }
}

function hashAssignee(value) {
  return crypto.createHash('sha256').update(String(value || '').trim().toLowerCase()).digest('hex');
}

function resolveAssigneeName(username) {
  const value = String(username || '').trim();
  if (!value) return 'Не назначен';
  return ASSIGNEE_HASH_TO_NAME.get(hashAssignee(value)) || 'Назначен';
}

function taskTimestamp(task) {
  const raw = task?.startDate || task?.dueDate;
  const value = raw ? Date.parse(raw) : NaN;
  return Number.isFinite(value) ? value : null;
}

function startOfMoscowDay(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Moscow',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value])
  );
  return Date.parse(parts.year + '-' + parts.month + '-' + parts.day + 'T00:00:00+03:00');
}

function chooseNextTask(tasks, now = new Date()) {
  const floor = startOfMoscowDay(now);
  return (Array.isArray(tasks) ? tasks : [])
    .filter((task) => Number(task?.status ?? 0) === 0)
    .map((task) => ({ task, timestamp: taskTimestamp(task) }))
    .filter((row) => row.timestamp !== null && row.timestamp >= floor)
    .sort((a, b) => a.timestamp - b.timestamp || Number(a.task?.sortOrder || 0) - Number(b.task?.sortOrder || 0))[0]?.task || null;
}

function visibleChecklistItems(items, limit = 50) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => Number(item?.status || 0) !== 1)
    .slice(0, Math.max(0, Number(limit) || 0));
}

function tokenHasWriteScope(token) {
  const raw = String(token?.scope || '').trim();
  if (!raw) return null;
  const scope = raw
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
  return scope.includes('tasks:write');
}

function tickTickCompletedTime(now = new Date()) {
  return new Date(now).toISOString().replace(/\.\d{3}Z$/, '+0000');
}

async function fetchTask(accessToken, projectId, taskId, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const response = await fetchImpl(
    API_BASE_URL + '/project/' + encodeURIComponent(projectId) + '/task/' + encodeURIComponent(taskId),
    {
      headers: {
        Authorization: 'Bearer ' + accessToken,
        Accept: 'application/json',
        'user-agent': 'RUDI-TickTick/1.0',
      },
      cache: 'no-store',
    }
  );
  if (response.status === 401) {
    const error = new Error('ticktick-token-invalid');
    error.status = response.status;
    throw error;
  }
  if (response.status === 403) {
    const error = new Error('ticktick-write-forbidden');
    error.status = response.status;
    throw error;
  }
  if (response.status === 404) throw new Error('ticktick-task-not-found');
  if (!response.ok) throw new Error('ticktick-api-failed:' + response.status);
  return response.json();
}

function checklistUpdateBody(task, itemId, completed, now = new Date()) {
  const id = String(task?.id || '').trim();
  const projectId = String(task?.projectId || '').trim();
  const title = String(task?.title || '').trim();
  const targetId = String(itemId || '').trim();
  if (!id || !projectId || !title || !targetId) throw new Error('ticktick-checklist-update-invalid');

  let found = false;
  const items = (Array.isArray(task?.items) ? task.items : []).map((item) => {
    const row = { ...item };
    if (String(item?.id || '').trim() === targetId) {
      found = true;
      row.status = completed ? 1 : 0;
      if (completed) row.completedTime = tickTickCompletedTime(now);
      else delete row.completedTime;
    }
    return row;
  });
  if (!found) throw new Error('ticktick-checklist-item-not-found');

  return {
    id,
    projectId,
    title,
    items,
  };
}

async function updateTaskChecklistItem(accessToken, projectId, taskId, itemId, completed, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const task = await fetchTask(accessToken, projectId, taskId, options);
  const body = checklistUpdateBody(task, itemId, completed, options.now || new Date());
  const response = await fetchImpl(API_BASE_URL + '/task/' + encodeURIComponent(taskId), {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'user-agent': 'RUDI-TickTick/1.0',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (response.status === 401) {
    const error = new Error('ticktick-token-invalid');
    error.status = response.status;
    throw error;
  }
  if (response.status === 403) {
    const error = new Error('ticktick-write-forbidden');
    error.status = response.status;
    throw error;
  }
  if (response.status === 404) throw new Error('ticktick-task-not-found');
  if (!response.ok) throw new Error('ticktick-update-failed:' + response.status);

  const updated = await response.json().catch(() => null);
  const source = updated && typeof updated === 'object' ? updated : { ...task, ...body };
  const previousItem = (Array.isArray(task?.items) ? task.items : [])
    .find((row) => String(row?.id || '').trim() === String(itemId || '').trim());
  const item = (Array.isArray(source.items) ? source.items : body.items)
    .find((row) => String(row?.id || '').trim() === String(itemId || '').trim());
  return {
    task: source,
    previousItem: previousItem || null,
    item: item || null,
  };
}

async function completeTickTickTask(accessToken, projectId, taskId, options = {}) {
  const id = String(taskId || '').trim();
  const project = String(projectId || '').trim();
  if (!id || !project) throw new Error('ticktick-task-complete-invalid');

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const response = await fetchImpl(
    API_BASE_URL + '/project/' + encodeURIComponent(project) + '/task/' + encodeURIComponent(id) + '/complete',
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        Accept: 'application/json',
        'user-agent': 'RUDI-TickTick/1.0',
      },
      cache: 'no-store',
    }
  );
  if (response.status === 401) {
    const error = new Error('ticktick-token-invalid');
    error.status = response.status;
    throw error;
  }
  if (response.status === 403) {
    const error = new Error('ticktick-write-forbidden');
    error.status = response.status;
    throw error;
  }
  if (response.status === 404) throw new Error('ticktick-task-not-found');
  if (!response.ok) throw new Error('ticktick-complete-failed:' + response.status);
  return true;
}

async function fetchProjectData(accessToken, projectId, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const response = await fetchImpl(API_BASE_URL + '/project/' + encodeURIComponent(projectId) + '/data', {
    headers: {
      Authorization: 'Bearer ' + accessToken,
      Accept: 'application/json',
      'user-agent': 'RUDI-TickTick/1.0',
    },
    cache: 'no-store',
  });
  if (response.status === 401 || response.status === 403) {
    const error = new Error('ticktick-token-invalid');
    error.status = response.status;
    throw error;
  }
  if (!response.ok) throw new Error('ticktick-api-failed:' + response.status);
  return response.json();
}


const CALENDAR_TIMEZONE = 'Europe/Moscow';

function calendarDateKey(date, timeZone = CALENDAR_TIMEZONE) {
  const value = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(value.getTime())) return '';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(value)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );
  return [parts.year, parts.month, parts.day].join('-');
}

function calendarTime(date, timeZone = CALENDAR_TIMEZONE) {
  const value = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(value.getTime())) return null;
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(value);
}

function tickTickMonthRange(now = new Date(), view = 'month', timeZone = CALENDAR_TIMEZONE) {
  const today = calendarDateKey(now, timeZone);
  const [year, month] = today.split('-').map(Number);
  const offset = view === 'next-month' ? 1 : 0;
  const first = new Date(Date.UTC(year, month - 1 + offset, 1));
  const rangeYear = first.getUTCFullYear();
  const rangeMonth = first.getUTCMonth() + 1;
  const dayCount = new Date(Date.UTC(rangeYear, rangeMonth, 0)).getUTCDate();
  return {
    view: offset ? 'next-month' : 'month',
    year: rangeYear,
    month: rangeMonth,
    dayCount,
    startKey: [
      rangeYear,
      String(rangeMonth).padStart(2, '0'),
      '01',
    ].join('-'),
  };
}

function tickTickTaskDateKeys(task, timeZone = CALENDAR_TIMEZONE) {
  const rawValues = [task?.startDate, task?.dueDate]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  const keys = [];

  for (const raw of rawValues) {
    let key = '';
    if (task?.isAllDay) {
      const taskTimeZone = String(task?.timeZone || '').trim();
      if (taskTimeZone) {
        try {
          key = calendarDateKey(raw, taskTimeZone);
        } catch {}
      }
      if (!key) {
        const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
        if (match) key = match[1];
      }
    }
    if (!key) key = calendarDateKey(raw, timeZone);
    if (key && !keys.includes(key)) keys.push(key);
  }

  return keys;
}

function tickTickTaskDateKey(task, timeZone = CALENDAR_TIMEZONE) {
  return tickTickTaskDateKeys(task, timeZone)[0] || '';
}

function buildTickTickCalendar(tasks, now = new Date(), view = 'month', timeZone = CALENDAR_TIMEZONE) {
  const range = tickTickMonthRange(now, view, timeZone);
  const days = Array.from({ length: range.dayCount }, (_, index) => {
    const date = new Date(Date.UTC(range.year, range.month - 1, index + 1));
    const key = [
      date.getUTCFullYear(),
      String(date.getUTCMonth() + 1).padStart(2, '0'),
      String(date.getUTCDate()).padStart(2, '0'),
    ].join('-');
    return { date: key, events: [] };
  });
  const byDate = new Map(days.map((day) => [day.date, day]));

  for (const task of Array.isArray(tasks) ? tasks : []) {
    const keys = tickTickTaskDateKeys(task, timeZone);
    if (!keys.length) continue;

    const rawStart = String(task?.startDate || task?.dueDate || '').trim();
    const rawDue = String(task?.dueDate || '').trim();
    const allDay = Boolean(task?.isAllDay);

    for (const key of keys) {
      const day = byDate.get(key);
      if (!day) continue;

      const startTime = allDay || !rawStart || calendarDateKey(rawStart, timeZone) !== key
        ? null
        : calendarTime(rawStart, timeZone);
      let endTime = null;
      if (!allDay && rawDue && calendarDateKey(rawDue, timeZone) === key) {
        endTime = calendarTime(rawDue, timeZone);
      }

      if (day.events.some((event) => event.id && event.id === String(task?.id || ''))) continue;
      day.events.push({
        id: String(task?.id || ''),
        title: String(task?.title || '').trim() || 'Совместное дело',
        allDay,
        startTime,
        endTime,
        assignee: resolveAssigneeName(task?.assigneeUsername),
        assigned: Boolean(String(task?.assigneeUsername || '').trim()),
        completed: Number(task?.status || 0) !== 0,
      });
    }
  }

  for (const day of days) {
    day.events.sort((left, right) => {
      const leftTime = left.startTime || '99:99';
      const rightTime = right.startTime || '99:99';
      return leftTime.localeCompare(rightTime) || left.title.localeCompare(right.title, 'ru');
    });
    day.hasEvents = day.events.length > 0;
  }

  return {
    view: range.view,
    monthStart: range.startKey,
    days,
  };
}

module.exports = {
  AUTH_URL,
  OAUTH_SCOPE,
  TOKEN_URL,
  API_BASE_URL,
  DEFAULT_REDIRECT_URI,
  DEFAULT_PROJECT_ID,
  getCredentials,
  credentialsConfigured,
  buildAuthorizeUrl,
  exchangeCode,
  loadTickTickConfig,
  resolveAssigneeName,
  taskTimestamp,
  startOfMoscowDay,
  chooseNextTask,
  tokenHasWriteScope,
  visibleChecklistItems,
  fetchTask,
  checklistUpdateBody,
  updateTaskChecklistItem,
  completeTickTickTask,
  fetchProjectData,
  CALENDAR_TIMEZONE,
  calendarDateKey,
  calendarTime,
  tickTickMonthRange,
  tickTickTaskDateKeys,
  tickTickTaskDateKey,
  buildTickTickCalendar,
};
