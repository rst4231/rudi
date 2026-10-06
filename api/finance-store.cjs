const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const NAMESPACE = 'rudi-household-finances-v1';
const TTL_SECONDS = 60 * 60 * 24 * 3650;
const STATE_KEY = 'shared';
let mutationTail = Promise.resolve();

function cacheOf(options = {}) {
  return options.financeCache || options.cache || createStrictRuntimeCache({
    namespace: NAMESPACE,
    ...(options.cacheOptions || {}),
  });
}

function cleanMonth(value) {
  const month = String(value || '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('finance-month-invalid');
  const year = Number(month.slice(0, 4));
  if (year < 2020 || year > 2100) throw new Error('finance-month-invalid');
  return month;
}

function cleanMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 10000000) throw new Error('finance-amount-invalid');
  return Math.round(number * 100) / 100;
}

function splitAmounts(rent, utilities) {
  const total = Math.round((cleanMoney(rent) + cleanMoney(utilities)) * 100) / 100;
  const diana = Math.round(total * 40) / 100;
  const rustam = Math.round((total - diana) * 100) / 100;
  return { total, diana, rustam };
}

function normalizeState(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const months = {};
  const rawMonths = source.months && typeof source.months === 'object' && !Array.isArray(source.months) ? source.months : {};
  for (const [rawMonth, rawRow] of Object.entries(rawMonths)) {
    let month;
    try { month = cleanMonth(rawMonth); } catch (_) { continue; }
    const row = rawRow && typeof rawRow === 'object' && !Array.isArray(rawRow) ? rawRow : {};
    let rent = 0, utilities = 0;
    try {
      rent = cleanMoney(row.rent || 0);
      utilities = cleanMoney(row.utilities || 0);
    } catch (_) {
      continue;
    }
    const updatedAtRaw = String(row.updatedAt || '').trim();
    const updatedAtDate = updatedAtRaw ? new Date(updatedAtRaw) : null;
    months[month] = {
      month,
      rent,
      utilities,
      updatedAt: updatedAtDate && !Number.isNaN(updatedAtDate.getTime()) ? updatedAtDate.toISOString() : '',
      updatedBy: String(row.updatedBy || '').trim() === 'Рустам' ? 'Рустам' : '',
    };
  }
  return { initialized: Boolean(source.initialized), version: Math.max(0, Number(source.version || 0)), months };
}

function viewState(state) {
  const normalized = normalizeState(state);
  const months = Object.values(normalized.months)
    .sort((a, b) => String(b.month).localeCompare(String(a.month)))
    .map((row) => ({ ...row, ...splitAmounts(row.rent, row.utilities) }));
  return { initialized: normalized.initialized, version: normalized.version, months };
}

function enqueueMutation(task) {
  const run = mutationTail.then(task, task);
  mutationTail = run.catch(() => {});
  return run;
}

async function readFinanceState(options = {}) {
  const value = await cacheOf(options).get(STATE_KEY);
  return normalizeState(value);
}

async function saveFinanceMonth(actor, month, rent, utilities, options = {}) {
  if (String(actor || '').trim() !== 'Рустам') throw new Error('finance-owner-only');
  const clean = { month: cleanMonth(month), rent: cleanMoney(rent), utilities: cleanMoney(utilities) };
  return enqueueMutation(async () => {
    const current = await readFinanceState(options);
    const updatedAt = new Date(options.now || Date.now()).toISOString();
    const next = normalizeState({
      initialized: true,
      version: Math.max(0, Number(current.version || 0)) + 1,
      months: {
        ...current.months,
        [clean.month]: { ...clean, updatedAt, updatedBy: 'Рустам' },
      },
    });
    await cacheOf(options).set(STATE_KEY, next, {
      ttl: TTL_SECONDS,
      tags: ['rudi-household-finances'],
      name: STATE_KEY,
    });
    return next;
  });
}

function resetMutationQueueForTests() { mutationTail = Promise.resolve(); }

module.exports = {
  NAMESPACE, TTL_SECONDS, cleanMonth, cleanMoney, splitAmounts, normalizeState, viewState,
  readFinanceState, saveFinanceMonth, resetMutationQueueForTests,
};
