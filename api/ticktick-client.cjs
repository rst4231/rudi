const crypto = require('node:crypto');

const AUTH_URL = 'https://ticktick.com/oauth/authorize';
const TOKEN_URL = 'https://ticktick.com/oauth/token';
const API_BASE_URL = 'https://api.ticktick.com/open/v1';
const DEFAULT_REDIRECT_URI = 'https://spb-daily-guide-bot.vercel.app/api/ticktick/callback';
const DEFAULT_PROJECT_ID = '6a97b9e80a2d51030e185acf';
const CONFIG_URL = 'https://raw.githubusercontent.com/rst4231/rudi/main/rudi-config.json';

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
  url.searchParams.set('scope', 'tasks:read');
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
    scope: 'tasks:read',
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

module.exports = {
  AUTH_URL,
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
  fetchProjectData,
};
