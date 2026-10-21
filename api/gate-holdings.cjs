'use strict';
const crypto = require('node:crypto');

const API_ORIGIN = 'https://api.gateio.ws';
const BALANCE_PATH = '/api/v4/wallet/total_balance';
const QUERY = 'currency=USD';
// Gate provides stable public error labels; never surface or log arbitrary upstream
// messages, request headers, API keys or secrets.
const LABEL_ERRORS = Object.freeze({
  INVALID_KEY: 'key-invalid',
  INVALID_CREDENTIALS: 'key-invalid',
  INVALID_SIGNATURE: 'sign-invalid',
  IP_FORBIDDEN: 'ip-mismatch',
  REQUEST_EXPIRED: 'time-invalid',
  MISSING_REQUIRED_HEADER: 'request-invalid',
  FORBIDDEN: 'permission-denied',
  READ_ONLY: 'permission-denied',
  ACCOUNT_LOCKED: 'account-locked',
  INVALID_PARAM_VALUE: 'request-invalid',
  INVALID_PROTOCOL: 'request-invalid',
  INVALID_ARGUMENT: 'request-invalid',
  INVALID_REQUEST_BODY: 'request-invalid',
  MISSING_REQUIRED_PARAM: 'request-invalid',
  BAD_REQUEST: 'request-invalid',
  INVALID_CONTENT_TYPE: 'request-invalid',
  NOT_ACCEPTABLE: 'request-invalid',
  METHOD_NOT_ALLOWED: 'request-invalid',
  NOT_FOUND: 'endpoint-unavailable',
  TOO_MANY_REQUESTS: 'rate-limited',
  TOO_BUSY: 'network-unavailable',
});
function errorLabel(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return '';
  const label = body.label ?? body.error?.label ?? body.data?.label;
  return typeof label === 'string' && /^[A-Z0-9_]{1,60}$/.test(label) ? label : '';
}
function failure(status, label) {
  if (Object.prototype.hasOwnProperty.call(LABEL_ERRORS, label)) return 'crypto-gate-' + LABEL_ERRORS[label];
  if (status === 401) return 'crypto-gate-key-invalid';
  if (status === 403) return 'crypto-gate-permission-denied';
  if (status === 429) return 'crypto-gate-rate-limited';
  if (status >= 500) return 'crypto-gate-network-unavailable';
  // 400 with an unrecognized/absent label is NOT necessarily a bad API key.
  if (status === 400) return 'crypto-gate-api-rejected-400';
  if (status === 404) return 'crypto-gate-endpoint-unavailable';
  return 'crypto-gate-api-rejected';
}
function usd(row) {
  if (row?.currency !== 'USD' || !['string','number'].includes(typeof row.amount) || String(row.amount).trim() === '') {
    throw Error('crypto-gate-response-invalid');
  }
  const value = Number(row.amount);
  if (!Number.isFinite(value * 100) || value < 0) throw Error('crypto-gate-response-invalid');
  return Math.round(value * 100) / 100;
}
async function snapshot(keys, options = {}) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const bodyHash = crypto.createHash('sha512').update('').digest('hex');
  const signature = crypto.createHmac('sha512', keys.apiSecret || '')
    .update(['GET', BALANCE_PATH, QUERY, bodyHash, timestamp].join('\n')).digest('hex');
  let response;
  try {
    response = await (options.fetchImpl || fetch)(API_ORIGIN + BALANCE_PATH + '?' + QUERY, {
      method: 'GET',
      headers: { KEY: keys.apiKey, Timestamp: timestamp, SIGN: signature,
        Accept: 'application/json', 'Content-Type': 'application/json' },
      redirect: 'error', cache: 'no-store',
      signal: AbortSignal.timeout(Math.max(1, Math.min(11000, (options.deadlineAt || Date.now() + 11000) - Date.now()))),
    });
  } catch (_) {
    throw Error('crypto-gate-network-unavailable');
  }
  if (!response.ok) {
    let label = '';
    try { label = errorLabel(await response.json()); } catch (_) {}
    const knownLabel = Object.prototype.hasOwnProperty.call(LABEL_ERRORS, label) ? label : 'UNKNOWN';
    // Sanitized diagnostics only: no credentials or third-party message text.
    console.warn('RUDI_GATE_WALLET_REJECTED', { status: Number(response.status) || 0, label: knownLabel });
    throw Error(failure(response.status, label));
  }
  let data;
  try { data = await response.json(); } catch (_) { throw Error('crypto-gate-response-invalid'); }
  const balanceUsd = usd(data?.total);
  const names = {
    spot: 'Спот', futures: 'Фьючерсы', finance: 'Earn', margin: 'Маржа',
    cross_margin: 'Кросс-маржа', quant: 'Боты', delivery: 'Поставочные фьючерсы',
    options: 'Опционы', payment: 'Платежи', unified: 'Единый счёт',
  };
  const sections = Object.entries(data.details || {}).map(([id, row]) =>
    ({ id, name: names[id] || id, usd: usd(row), verified: true, assets: [] }));
  return {
    balanceUsd, incomplete: false, assets: [], sections,
    scope: 'Оценка общего баланса Gate по Wallet API. Данные биржи могут кэшироваться до минуты.',
  };
}
module.exports = { snapshot, failure, errorLabel };
