'use strict';
const net = require('node:net');
const crypto = require('node:crypto');
const { normalizeActor, readAppState, writeAppState } = require('./rudi-auth-db.cjs');

const STATE_KEY = 'recent-auth-sessions-v1';
const MAX_SESSIONS = 5;
const AUTH_METHODS = new Set(['pin', 'face-id', 'telegram']);

function requestIp(req) {
  const headers = req?.headers || {};
  const candidates = [
    headers['x-vercel-forwarded-for'],
    headers['x-forwarded-for'],
    headers['x-real-ip'],
    req?.socket?.remoteAddress,
  ];
  for (const value of candidates) {
    const first = String(Array.isArray(value) ? value[0] : value || '').split(',')[0].trim();
    const ip = first.startsWith('::ffff:') ? first.slice(7) : first;
    if (net.isIP(ip)) return ip;
  }
  return '';
}

function requestCountryCode(req) {
  const headers = req?.headers || {};
  for (const value of [headers['x-vercel-ip-country'], headers['cf-ipcountry']]) {
    const code = String(Array.isArray(value) ? value[0] : value || '').trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(code) && code !== 'XX' && code !== 'ZZ') return code;
  }
  return '';
}

function countryName(code) {
  if (!code) return 'Не определена';
  try {
    const label = new Intl.DisplayNames(['ru'], { type: 'region' }).of(code);
    return label && label !== code ? label : code;
  } catch {
    return code;
  }
}

function normalizeSessions(value) {
  return (Array.isArray(value) ? value : [])
    .filter(row => row && typeof row === 'object' && !Array.isArray(row))
    .map(row => {
      const createdAt = String(row.createdAt || '');
      const ip = String(row.ip || '');
      const countryCode = String(row.countryCode || '');
      const method = String(row.method || '');
      if (!Number.isFinite(Date.parse(createdAt))) return null;
      return {
        id: String(row.id || '').slice(0, 64),
        createdAt,
        ip: net.isIP(ip) ? ip : '',
        countryCode: /^[A-Z]{2}$/.test(countryCode) ? countryCode : '',
        method: AUTH_METHODS.has(method) ? method : 'pin',
      };
    })
    .filter(Boolean)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, MAX_SESSIONS);
}

function stateOptions(options) {
  return options.stateOptions || options;
}

async function listAuthSessions(actor, options = {}) {
  const safeActor = normalizeActor(actor);
  if (!safeActor) throw new Error('rudi-access-denied');
  const read = options.readState || readAppState;
  const rows = normalizeSessions(await read(safeActor, STATE_KEY, stateOptions(options)));
  return rows.map(row => ({
    ...row,
    country: countryName(row.countryCode),
  }));
}

async function recordAuthSession(req, actor, method, options = {}) {
  const safeActor = normalizeActor(actor);
  if (!safeActor) throw new Error('rudi-access-denied');
  const read = options.readState || readAppState;
  const write = options.writeState || writeAppState;
  const previous = normalizeSessions(await read(safeActor, STATE_KEY, stateOptions(options)));
  const createdAt = new Date(options.now || Date.now()).toISOString();
  const next = {
    id: crypto.randomUUID(),
    createdAt,
    ip: requestIp(req),
    countryCode: requestCountryCode(req),
    method: AUTH_METHODS.has(method) ? method : 'pin',
  };
  await write(safeActor, STATE_KEY, normalizeSessions([next, ...previous]), stateOptions(options));
  return { ...next, country: countryName(next.countryCode) };
}

module.exports = {
  STATE_KEY,
  MAX_SESSIONS,
  requestIp,
  requestCountryCode,
  normalizeSessions,
  listAuthSessions,
  recordAuthSession,
};
