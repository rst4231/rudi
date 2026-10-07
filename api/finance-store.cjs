const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');
const { randomUUID } = require('node:crypto');

const NAMESPACE = 'rudi-household-finances-v1';
const TTL_SECONDS = 60 * 60 * 24 * 3650;
const STATE_KEY = 'shared';
const DEFAULT_CATEGORIES = Object.freeze([
  { id: 'default-housing', name: 'Жильё', icon: '🏠' },
  { id: 'default-transport', name: 'Транспорт', icon: '🚗' },
  { id: 'default-food', name: 'Еда', icon: '🍽️' },
  { id: 'default-entertainment', name: 'Развлечения', icon: '🎬' },
  { id: 'default-shopping', name: 'Покупки', icon: '🛍️' },
]);
let mutationTail = Promise.resolve();

function cacheOf(options = {}) {
  return options.financeCache || options.cache || createStrictRuntimeCache({
    namespace: NAMESPACE,
    ...(options.cacheOptions || {}),
  });
}
function cleanActor(value) {
  const actor = String(value || '').trim();
  if (!['Рустам', 'Диана'].includes(actor)) throw new Error('finance-actor-invalid');
  return actor;
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
  if (!Number.isFinite(number) || number < 0 || number > 100000000) throw new Error('finance-amount-invalid');
  return Math.round(number * 100) / 100;
}
function cleanText(value, max = 140, { required = false } = {}) {
  const text = String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
  if (required && !text) throw new Error('finance-text-required');
  return text;
}
function cleanIcon(value) {
  return String(value || '').trim().slice(0, 12) || '💳';
}
function cleanCurrency(value) {
  const code = String(value || 'RUB').trim().toUpperCase();
  if (!['RUB','USD','EUR','USDT','BTC','ETH'].includes(code)) throw new Error('finance-currency-invalid');
  return code;
}
function cleanAssetAmount(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1000000000000) throw new Error('finance-amount-invalid');
  return Math.round(number * 100000000) / 100000000;
}
function cleanOccurredAt(value, fallback = Date.now()) {
  const date = new Date(value || fallback);
  if (Number.isNaN(date.getTime())) throw new Error('finance-date-invalid');
  return date.toISOString();
}
function financeCategoryKey(value) {
  return String(value || '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/\s+/g, ' ');
}
function defaultCategories() {
  return DEFAULT_CATEGORIES.map((row) => ({ ...row, note: '', monthlyLimit: 0, currency: 'RUB', archived: false, createdAt: '' }));
}
function splitAmounts(rent, utilities) {
  const total = Math.round((cleanMoney(rent) + cleanMoney(utilities)) * 100) / 100;
  const diana = Math.round(total * 40) / 100;
  const rustam = Math.round((total - diana) * 100) / 100;
  return { total, diana, rustam };
}
function personalAmounts(income, expenses) {
  const cleanIncome = cleanMoney(income);
  const cleanExpenses = cleanMoney(expenses);
  return { income: cleanIncome, expenses: cleanExpenses, balance: Math.round((cleanIncome - cleanExpenses) * 100) / 100 };
}
function cleanPlan(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    reserve: cleanMoney(source.reserve || 0),
    goalTitle: cleanText(source.goalTitle, 80),
    goalCurrent: cleanMoney(source.goalCurrent || 0),
    goalTarget: cleanMoney(source.goalTarget || 0),
    updatedAt: String(source.updatedAt || ''),
  };
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
    try { rent = cleanMoney(row.rent || 0); utilities = cleanMoney(row.utilities || 0); } catch (_) { continue; }
    const updatedAtRaw = String(row.updatedAt || '').trim();
    const updatedAtDate = updatedAtRaw ? new Date(updatedAtRaw) : null;
    months[month] = {
      month, rent, utilities,
      updatedAt: updatedAtDate && !Number.isNaN(updatedAtDate.getTime()) ? updatedAtDate.toISOString() : '',
      updatedBy: String(row.updatedBy || '').trim() === 'Рустам' ? 'Рустам' : '',
    };
  }

  const personal = { 'Рустам': {}, 'Диана': {} };
  const rawPersonal = source.personal && typeof source.personal === 'object' && !Array.isArray(source.personal) ? source.personal : {};
  for (const actor of Object.keys(personal)) {
    const rows = rawPersonal[actor] && typeof rawPersonal[actor] === 'object' && !Array.isArray(rawPersonal[actor]) ? rawPersonal[actor] : {};
    for (const [rawMonth, rawRow] of Object.entries(rows)) {
      let month;
      try { month = cleanMonth(rawMonth); } catch (_) { continue; }
      const row = rawRow && typeof rawRow === 'object' && !Array.isArray(rawRow) ? rawRow : {};
      let amounts;
      try { amounts = personalAmounts(row.income || 0, row.expenses || 0); } catch (_) { continue; }
      const updatedAtRaw = String(row.updatedAt || '').trim();
      const updatedAtDate = updatedAtRaw ? new Date(updatedAtRaw) : null;
      personal[actor][month] = {
        month, ...amounts,
        updatedAt: updatedAtDate && !Number.isNaN(updatedAtDate.getTime()) ? updatedAtDate.toISOString() : '',
        updatedBy: actor,
      };
    }
  }

  const plans = { 'Рустам': cleanPlan(), 'Диана': cleanPlan() };
  const rawPlans = source.plans && typeof source.plans === 'object' && !Array.isArray(source.plans) ? source.plans : {};
  for (const actor of Object.keys(plans)) {
    try { plans[actor] = cleanPlan(rawPlans[actor] || {}); } catch (_) { plans[actor] = cleanPlan(); }
  }

  const wallets = { 'Рустам': [], 'Диана': [] };
  const rawWallets = source.wallets && typeof source.wallets === 'object' && !Array.isArray(source.wallets) ? source.wallets : {};
  for (const actor of Object.keys(wallets)) {
    const rows = Array.isArray(rawWallets[actor]) ? rawWallets[actor] : [];
    const seen = new Set();
    for (const raw of rows) {
      try {
        const id = cleanText(raw?.id, 100, { required: true });
        if (seen.has(id)) continue;
        const createdAtRaw = String(raw?.createdAt || '');
        const createdAt = createdAtRaw ? new Date(createdAtRaw) : null;
        wallets[actor].push({
          id,
          name: cleanText(raw?.name, 48, { required: true }),
          icon: cleanIcon(raw?.icon || '💳'),
          currency: cleanCurrency(raw?.currency || 'RUB'),
          balance: cleanAssetAmount(raw?.balance || 0),
          archived: Boolean(raw?.archived),
          importSource: cleanText(raw?.importSource, 24),
          createdAt: createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt.toISOString() : '',
        });
        seen.add(id);
      } catch (_) {}
    }
  }

  const categories = { 'Рустам': [], 'Диана': [] };
  const rawCategories = source.categories && typeof source.categories === 'object' && !Array.isArray(source.categories) ? source.categories : {};
  for (const actor of Object.keys(categories)) {
    const rows = Array.isArray(rawCategories[actor]) ? rawCategories[actor] : defaultCategories();
    const seen = new Set();
    for (const raw of rows) {
      try {
        const id = cleanText(raw?.id, 100, { required: true });
        if (seen.has(id)) continue;
        const name = cleanText(raw?.name, 48, { required: true });
        const createdAtRaw = String(raw?.createdAt || '');
        const createdAt = createdAtRaw ? new Date(createdAtRaw) : null;
        categories[actor].push({
          id,
          name,
          icon: cleanIcon(raw?.icon),
          note: cleanText(raw?.note, 180),
          monthlyLimit: cleanMoney(raw?.monthlyLimit || 0),
          currency: cleanCurrency(raw?.currency || 'RUB'),
          archived: Boolean(raw?.archived),
          importSource: cleanText(raw?.importSource, 24),
          createdAt: createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt.toISOString() : '',
        });
        seen.add(id);
      } catch (_) {}
    }
  }

  const personalExpenses = [];
  for (const raw of Array.isArray(source.personalExpenses) ? source.personalExpenses : []) {
    try {
      const actor = cleanActor(raw?.actor);
      const id = cleanText(raw?.id, 100, { required: true });
      const month = cleanMonth(raw?.month);
      const categoryId = cleanText(raw?.categoryId, 100, { required: true });
      const amount = cleanMoney(raw?.amount);
      if (amount <= 0 || !categories[actor].some((row) => row.id === categoryId)) continue;
      const createdAt = new Date(raw?.createdAt || Date.now());
      const updatedAt = new Date(raw?.updatedAt || raw?.createdAt || Date.now());
      const occurredAt = cleanOccurredAt(raw?.occurredAt || raw?.createdAt || Date.now());
      const rubAmount = cleanMoney(raw?.rubAmount || raw?.amount);
      personalExpenses.push({
        id, actor, month, categoryId, amount,
        note: cleanText(raw?.note, 120),
        walletId: cleanText(raw?.walletId, 100),
        sourceAmount: cleanAssetAmount(raw?.sourceAmount || raw?.amount),
        sourceCurrency: cleanCurrency(raw?.sourceCurrency || 'RUB'),
        targetCurrency: cleanCurrency(raw?.targetCurrency || raw?.currency || 'RUB'),
        exchangeRate: Math.max(0, Number(raw?.exchangeRate || 1)) || 1,
        rubAmount,
        importKey: cleanText(raw?.importKey, 220),
        occurredAt,
        createdAt: Number.isNaN(createdAt.getTime()) ? new Date().toISOString() : createdAt.toISOString(),
        updatedAt: Number.isNaN(updatedAt.getTime()) ? new Date().toISOString() : updatedAt.toISOString(),
      });
    } catch (_) {}
  }

  const debts = [];
  for (const raw of Array.isArray(source.debts) ? source.debts : []) {
    try {
      const actor = cleanActor(raw?.actor);
      const direction = String(raw?.direction || '') === 'owed' ? 'owed' : String(raw?.direction || '') === 'owe' ? 'owe' : '';
      if (!direction) continue;
      const counterparty = cleanText(raw?.counterparty, 80, { required: true });
      const amount = cleanMoney(raw?.amount);
      if (amount <= 0) continue;
      const id = cleanText(raw?.id || '', 100) || randomUUID();
      const createdAt = new Date(raw?.createdAt || Date.now());
      const updatedAt = new Date(raw?.updatedAt || raw?.createdAt || Date.now());
      debts.push({
        id, actor, direction, counterparty, amount,
        note: cleanText(raw?.note, 140),
        paid: Boolean(raw?.paid),
        createdAt: Number.isNaN(createdAt.getTime()) ? new Date().toISOString() : createdAt.toISOString(),
        updatedAt: Number.isNaN(updatedAt.getTime()) ? new Date().toISOString() : updatedAt.toISOString(),
      });
    } catch (_) {}
  }

  return {
    initialized: Boolean(source.initialized),
    version: Math.max(0, Number(source.version || 0)),
    months, personal, plans, wallets, categories, personalExpenses, debts,
  };
}
function expenseTotal(state, actor, month) {
  const safeActor = cleanActor(actor);
  const safeMonth = cleanMonth(month);
  return Math.round(
    (Array.isArray(state?.personalExpenses) ? state.personalExpenses : [])
      .filter((row) => row.actor === safeActor && row.month === safeMonth)
      .reduce((sum, row) => sum + Number(row.rubAmount || row.amount || 0), 0) * 100
  ) / 100;
}
function syncPersonalMonthExpenses(current, actor, month, updatedAt = new Date().toISOString()) {
  const safeActor = cleanActor(actor);
  const safeMonth = cleanMonth(month);
  const existing = current.personal[safeActor]?.[safeMonth] || {};
  const income = cleanMoney(existing.income || 0);
  const expenses = expenseTotal(current, safeActor, safeMonth);
  return {
    ...current.personal,
    [safeActor]: {
      ...(current.personal[safeActor] || {}),
      [safeMonth]: { month: safeMonth, ...personalAmounts(income, expenses), updatedAt, updatedBy: safeActor },
    },
  };
}
function viewState(state, actor = '') {
  const normalized = normalizeState(state);
  const months = Object.values(normalized.months)
    .sort((a, b) => String(b.month).localeCompare(String(a.month)))
    .map((row) => ({ ...row, ...splitAmounts(row.rent, row.utilities) }));
  const safeActor = ['Рустам', 'Диана'].includes(String(actor || '').trim()) ? String(actor).trim() : '';
  const personalMonths = safeActor
    ? Object.values(normalized.personal[safeActor] || {})
        .map((row) => ({ ...row, ...personalAmounts(row.income, expenseTotal(normalized, safeActor, row.month)) }))
        .sort((a, b) => String(b.month).localeCompare(String(a.month)))
    : [];
  const wallets = safeActor ? [...(normalized.wallets[safeActor] || [])].filter((row) => !row.archived) : [];
  const allCategories = safeActor ? [...(normalized.categories[safeActor] || [])] : [];
  const categories = allCategories.filter((row) => !row.archived);
  const archivedCategories = allCategories.filter((row) => row.archived);
  const personalExpenses = safeActor
    ? normalized.personalExpenses.filter((row) => row.actor === safeActor).sort((a, b) => String(b.occurredAt || b.createdAt).localeCompare(String(a.occurredAt || a.createdAt)))
    : [];
  const debts = safeActor
    ? normalized.debts.filter((row) => row.actor === safeActor).sort((a, b) => Number(a.paid) - Number(b.paid) || String(b.updatedAt).localeCompare(String(a.updatedAt)))
    : [];
  const plan = safeActor ? normalized.plans[safeActor] : cleanPlan();
  return { initialized: normalized.initialized, version: normalized.version, months, personalMonths, wallets, categories, archivedCategories, personalExpenses, debts, plan };
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
async function writeState(next, options = {}) {
  await cacheOf(options).set(STATE_KEY, normalizeState(next), {
    ttl: TTL_SECONDS, tags: ['rudi-household-finances'], name: STATE_KEY,
  });
}
async function saveFinanceMonth(actor, month, rent, utilities, options = {}) {
  if (String(actor || '').trim() !== 'Рустам') throw new Error('finance-owner-only');
  const clean = { month: cleanMonth(month), rent: cleanMoney(rent), utilities: cleanMoney(utilities) };
  return enqueueMutation(async () => {
    const current = await readFinanceState(options);
    const updatedAt = new Date(options.now || Date.now()).toISOString();
    const next = normalizeState({
      ...current, initialized: true, version: current.version + 1,
      months: { ...current.months, [clean.month]: { ...clean, updatedAt, updatedBy: 'Рустам' } },
    });
    await writeState(next, options);
    return next;
  });
}
async function savePersonalIncome(actor, month, income, options = {}) {
  const safeActor = cleanActor(actor);
  const safeMonth = cleanMonth(month);
  const safeIncome = cleanMoney(income);
  return enqueueMutation(async () => {
    const current = await readFinanceState(options);
    const updatedAt = new Date(options.now || Date.now()).toISOString();
    const amounts = personalAmounts(safeIncome, expenseTotal(current, safeActor, safeMonth));
    const next = normalizeState({
      ...current, initialized: true, version: current.version + 1,
      personal: {
        ...current.personal,
        [safeActor]: {
          ...(current.personal[safeActor] || {}),
          [safeMonth]: { month: safeMonth, ...amounts, updatedAt, updatedBy: safeActor },
        },
      },
    });
    await writeState(next, options);
    return next;
  });
}
async function savePersonalMonth(actor, month, income, expenses, options = {}) {
  const safeActor = cleanActor(actor);
  const clean = { month: cleanMonth(month), ...personalAmounts(income, expenses) };
  return enqueueMutation(async () => {
    const current = await readFinanceState(options);
    const updatedAt = new Date(options.now || Date.now()).toISOString();
    const next = normalizeState({
      ...current, initialized: true, version: current.version + 1,
      personal: {
        ...current.personal,
        [safeActor]: { ...(current.personal[safeActor] || {}), [clean.month]: { ...clean, updatedAt, updatedBy: safeActor } },
      },
    });
    await writeState(next, options);
    return next;
  });
}
async function saveFinancePlan(actor, payload = {}, options = {}) {
  const safeActor = cleanActor(actor);
  const plan = cleanPlan(payload);
  return enqueueMutation(async () => {
    const current = await readFinanceState(options);
    const updatedAt = new Date(options.now || Date.now()).toISOString();
    const next = normalizeState({
      ...current, initialized: true, version: current.version + 1,
      plans: { ...current.plans, [safeActor]: { ...plan, updatedAt } },
    });
    await writeState(next, options);
    return next;
  });
}
async function saveWallet(actor, payload = {}, options = {}) {
  const safeActor = cleanActor(actor);
  const name = cleanText(payload.name, 48, { required: true });
  const icon = cleanIcon(payload.icon || '💳');
  const currency = cleanCurrency(payload.currency || 'RUB');
  const balance = cleanAssetAmount(payload.balance || 0);
  const requestedId = cleanText(payload.id, 100);
  return enqueueMutation(async () => {
    const current = await readFinanceState(options);
    const rows = current.wallets[safeActor] || [];
    const id = requestedId || cleanText(options.id || randomUUID(), 100, { required: true });
    const existing = rows.find((row) => row.id === id);
    const now = new Date(options.now || Date.now()).toISOString();
    const row = {
      id, name, icon, currency, balance, archived: false,
      importSource: cleanText(existing?.importSource || payload.importSource, 24),
      createdAt: existing?.createdAt || now,
    };
    const wallets = existing ? rows.map((item) => item.id === id ? row : item) : rows.concat(row);
    const next = normalizeState({
      ...current, initialized: true, version: current.version + 1,
      wallets: { ...current.wallets, [safeActor]: wallets },
    });
    await writeState(next, options);
    return next;
  });
}
async function deleteWallet(actor, id, options = {}) {
  const safeActor = cleanActor(actor);
  const cleanId = cleanText(id, 100, { required: true });
  return enqueueMutation(async () => {
    const current = await readFinanceState(options);
    const rows = current.wallets[safeActor] || [];
    if (!rows.some((row) => row.id === cleanId && !row.archived)) throw new Error('finance-wallet-not-found');
    const referenced = current.personalExpenses.some((row) => row.actor === safeActor && row.walletId === cleanId);
    const wallets = referenced
      ? rows.map((row) => row.id === cleanId ? { ...row, archived: true } : row)
      : rows.filter((row) => row.id !== cleanId);
    const next = normalizeState({
      ...current, initialized: true, version: current.version + 1,
      wallets: { ...current.wallets, [safeActor]: wallets },
    });
    await writeState(next, options);
    return next;
  });
}
async function reorderWallets(actor, ids = [], options = {}) {
  const safeActor = cleanActor(actor);
  const cleanIds = Array.isArray(ids) ? [...new Set(ids.map((id) => cleanText(id, 100)).filter(Boolean))] : [];
  return enqueueMutation(async () => {
    const current = await readFinanceState(options);
    const rows = current.wallets[safeActor] || [];
    const visible = rows.filter((row) => !row.archived);
    const archived = rows.filter((row) => row.archived);
    const byId = new Map(visible.map((row) => [row.id, row]));
    const ordered = [];
    for (const id of cleanIds) {
      const row = byId.get(id);
      if (!row) continue;
      ordered.push(row);
      byId.delete(id);
    }
    for (const row of visible) if (byId.has(row.id)) ordered.push(row);
    const next = normalizeState({
      ...current, initialized: true, version: current.version + 1,
      wallets: { ...current.wallets, [safeActor]: ordered.concat(archived) },
    });
    await writeState(next, options);
    return next;
  });
}
async function saveExpenseCategory(actor, payload = {}, options = {}) {
  const safeActor = cleanActor(actor);
  const name = cleanText(payload.name, 48, { required: true });
  const icon = cleanIcon(payload.icon);
  const currency = cleanCurrency(payload.currency || 'RUB');
  return enqueueMutation(async () => {
    const current = await readFinanceState(options);
    const rows = current.categories[safeActor] || [];
    const normalizedName = financeCategoryKey(name);
    const existing = rows.find((row) => financeCategoryKey(row.name) === normalizedName);
    if (existing && !existing.archived) throw new Error('finance-category-duplicate');
    if (existing && existing.archived) {
      const categories = rows.map((row) => row.id === existing.id ? { ...row, archived: false, icon, monthlyLimit: cleanMoney(payload.monthlyLimit || row.monthlyLimit || 0), currency } : row);
      const next = normalizeState({
        ...current, initialized: true, version: current.version + 1,
        categories: { ...current.categories, [safeActor]: categories },
      });
      await writeState(next, options);
      return next;
    }
    const row = {
      id: cleanText(options.id || randomUUID(), 100, { required: true }),
      name, icon, note: '', monthlyLimit: cleanMoney(payload.monthlyLimit || 0), currency, archived: false,
      createdAt: new Date(options.now || Date.now()).toISOString(),
    };
    const next = normalizeState({
      ...current, initialized: true, version: current.version + 1,
      categories: { ...current.categories, [safeActor]: rows.concat(row) },
    });
    await writeState(next, options);
    return next;
  });
}
async function updateExpenseCategory(actor, payload = {}, options = {}) {
  const safeActor = cleanActor(actor);
  const id = cleanText(payload.id, 100, { required: true });
  return enqueueMutation(async () => {
    const current = await readFinanceState(options);
    const rows = current.categories[safeActor] || [];
    const found = rows.find((row) => row.id === id);
    if (!found) throw new Error('finance-category-not-found');
    const name = cleanText(payload.name ?? found.name, 48, { required: true });
    const normalizedName = financeCategoryKey(name);
    if (rows.some((row) => row.id !== id && !row.archived && financeCategoryKey(row.name) === normalizedName)) {
      throw new Error('finance-category-duplicate');
    }
    const categories = rows.map((row) => row.id === id ? {
      ...row,
      name,
      icon: cleanIcon(payload.icon ?? row.icon),
      note: cleanText(payload.note ?? row.note, 180),
      monthlyLimit: cleanMoney(payload.monthlyLimit ?? row.monthlyLimit ?? 0),
      currency: cleanCurrency(payload.currency ?? row.currency ?? 'RUB'),
    } : row);
    const next = normalizeState({
      ...current, initialized: true, version: current.version + 1,
      categories: { ...current.categories, [safeActor]: categories },
    });
    await writeState(next, options);
    return next;
  });
}
async function archiveExpenseCategory(actor, id, options = {}) {
  const safeActor = cleanActor(actor);
  const cleanId = cleanText(id, 100, { required: true });
  return enqueueMutation(async () => {
    const current = await readFinanceState(options);
    const rows = current.categories[safeActor] || [];
    if (!rows.some((row) => row.id === cleanId && !row.archived)) throw new Error('finance-category-not-found');
    const next = normalizeState({
      ...current,
      initialized: true,
      version: current.version + 1,
      categories: {
        ...current.categories,
        [safeActor]: rows.map((row) => row.id === cleanId ? { ...row, archived: true } : row),
      },
    });
    await writeState(next, options);
    return next;
  });
}
async function reorderExpenseCategories(actor, ids = [], options = {}) {
  const safeActor = cleanActor(actor);
  const cleanIds = Array.isArray(ids) ? [...new Set(ids.map((id) => cleanText(id, 100)).filter(Boolean))] : [];
  return enqueueMutation(async () => {
    const current = await readFinanceState(options);
    const rows = current.categories[safeActor] || [];
    const visible = rows.filter((row) => !row.archived);
    const archived = rows.filter((row) => row.archived);
    const byId = new Map(visible.map((row) => [row.id, row]));
    const ordered = [];
    for (const id of cleanIds) {
      const row = byId.get(id);
      if (!row) continue;
      ordered.push(row);
      byId.delete(id);
    }
    for (const row of visible) if (byId.has(row.id)) ordered.push(row);
    const next = normalizeState({
      ...current,
      initialized: true,
      version: current.version + 1,
      categories: { ...current.categories, [safeActor]: ordered.concat(archived) },
    });
    await writeState(next, options);
    return next;
  });
}
async function deleteExpenseCategory(actor, id, options = {}) {
  const safeActor = cleanActor(actor);
  const cleanId = cleanText(id, 100, { required: true });
  return enqueueMutation(async () => {
    const current = await readFinanceState(options);
    const rows = current.categories[safeActor] || [];
    if (!rows.some((row) => row.id === cleanId)) throw new Error('finance-category-not-found');

    const removedExpenses = current.personalExpenses.filter((row) => row.actor === safeActor && row.categoryId === cleanId);
    const affectedMonths = [...new Set(removedExpenses.map((row) => row.month))];
    const refundByWallet = new Map();
    for (const row of removedExpenses) {
      if (!row.walletId || Number(row.sourceAmount || 0) <= 0) continue;
      refundByWallet.set(row.walletId, (refundByWallet.get(row.walletId) || 0) + Number(row.sourceAmount || 0));
    }
    const wallets = {
      ...current.wallets,
      [safeActor]: (current.wallets[safeActor] || []).map((wallet) => refundByWallet.has(wallet.id)
        ? { ...wallet, balance: cleanAssetAmount(Number(wallet.balance || 0) + Number(refundByWallet.get(wallet.id) || 0)) }
        : wallet),
    };

    const now = new Date(options.now || Date.now()).toISOString();
    let next = normalizeState({
      ...current,
      initialized: true,
      version: current.version + 1,
      wallets,
      categories: { ...current.categories, [safeActor]: rows.filter((row) => row.id !== cleanId) },
      personalExpenses: current.personalExpenses.filter(
        (row) => !(row.actor === safeActor && row.categoryId === cleanId)
      ),
    });
    for (const month of affectedMonths) {
      next = normalizeState({ ...next, personal: syncPersonalMonthExpenses(next, safeActor, month, now) });
    }
    await writeState(next, options);
    return next;
  });
}
async function savePersonalExpense(actor, payload = {}, options = {}) {
  const safeActor = cleanActor(actor);
  const month = cleanMonth(payload.month);
  const categoryId = cleanText(payload.categoryId, 100, { required: true });
  const amount = cleanMoney(payload.amount);
  if (amount <= 0) throw new Error('finance-amount-invalid');
  const note = cleanText(payload.note, 120);
  const occurredAt = cleanOccurredAt(payload.occurredAt, options.now || Date.now());
  const walletId = cleanText(payload.walletId, 100);
  const sourceAmount = cleanAssetAmount(payload.sourceAmount ?? amount);
  const sourceCurrency = cleanCurrency(payload.sourceCurrency || 'RUB');
  const exchangeRate = Number(payload.exchangeRate ?? 1);
  if (sourceAmount <= 0) throw new Error('finance-amount-invalid');
  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) throw new Error('finance-rate-invalid');

  return enqueueMutation(async () => {
    const current = await readFinanceState(options);
    const category = (current.categories[safeActor] || []).find((row) => row.id === categoryId && !row.archived);
    if (!category) throw new Error('finance-category-not-found');
    const targetCurrency = cleanCurrency(payload.targetCurrency || category.currency || 'RUB');
    if (targetCurrency !== cleanCurrency(category.currency || 'RUB')) throw new Error('finance-wallet-currency-mismatch');
    const rubAmount = cleanMoney(
      payload.rubAmount ?? (targetCurrency === 'RUB' ? amount : sourceCurrency === 'RUB' ? sourceAmount : 0)
    );
    if (rubAmount <= 0) throw new Error('finance-rate-invalid');
    const now = new Date(options.now || Date.now()).toISOString();
    let wallets = current.wallets;

    if (walletId) {
      const rows = current.wallets[safeActor] || [];
      const wallet = rows.find((row) => row.id === walletId);
      if (!wallet) throw new Error('finance-wallet-not-found');
      if (wallet.currency !== sourceCurrency) throw new Error('finance-wallet-currency-mismatch');
      if (sourceAmount <= 0) throw new Error('finance-amount-invalid');
      if (Number(wallet.balance || 0) + 1e-9 < sourceAmount) throw new Error('finance-wallet-insufficient');
      const nextBalance = cleanAssetAmount(Number(wallet.balance || 0) - sourceAmount);
      wallets = {
        ...current.wallets,
        [safeActor]: rows.map((row) => row.id === walletId ? { ...row, balance: nextBalance } : row),
      };
    }

    const row = {
      id: cleanText(options.id || randomUUID(), 100, { required: true }),
      actor: safeActor, month, categoryId, amount, note,
      walletId, sourceAmount, sourceCurrency, targetCurrency, exchangeRate,
      rubAmount, importKey: '', occurredAt, createdAt: now, updatedAt: now,
    };
    const base = normalizeState({
      ...current, initialized: true, version: current.version + 1,
      wallets,
      personalExpenses: current.personalExpenses.concat(row),
    });
    const next = normalizeState({ ...base, personal: syncPersonalMonthExpenses(base, safeActor, month, now) });
    await writeState(next, options);
    return next;
  });
}
async function importPersonalExpenses(actor, payloadRows = [], options = {}) {
  const safeActor = cleanActor(actor);
  const payload = Array.isArray(payloadRows) ? { rows: payloadRows } : (payloadRows && typeof payloadRows === 'object' ? payloadRows : {});
  const rows = Array.isArray(payload.rows) ? payload.rows.slice(0, 5000) : [];
  const hasCurrentCategories = Array.isArray(payload.currentCategories);
  const hasCurrentWallets = Array.isArray(payload.currentWallets);
  const currentCategoryNames = hasCurrentCategories ? payload.currentCategories.slice(0, 300) : [];
  const currentWalletRows = hasCurrentWallets ? payload.currentWallets.slice(0, 100) : [];
  return enqueueMutation(async () => {
    const current = await readFinanceState(options);
    const now = new Date(options.now || Date.now()).toISOString();
    const categories = [...(current.categories[safeActor] || [])];
    const categoryMap = new Map(categories.map((row) => [financeCategoryKey(row.name), row]));
    const currentCategoryKeys = new Set(currentCategoryNames.map((name) => financeCategoryKey(cleanText(name, 48))).filter(Boolean));
    const existingKeys = new Set(
      current.personalExpenses.filter((row) => row.actor === safeActor && row.importKey).map((row) => row.importKey)
    );
    const added = [];
    const affectedMonths = new Set();
    const createdCategories = [];
    const createdWallets = [];
    let duplicates = 0, skipped = 0, entityChanges = 0;

    if (hasCurrentCategories) {
      for (let index = 0; index < categories.length; index++) {
        const row = categories[index];
        if (row.importSource !== 'coinkeeper') continue;
        const archived = !currentCategoryKeys.has(financeCategoryKey(row.name));
        if (row.archived !== archived) { categories[index] = { ...row, archived }; categoryMap.set(financeCategoryKey(row.name), categories[index]); entityChanges++; }
      }
      for (const rawName of currentCategoryNames) {
        const name = cleanText(rawName, 48);
        if (!name) continue;
        const key = financeCategoryKey(name);
        let category = categoryMap.get(key);
        if (!category) {
          category = { id: randomUUID(), name, icon: '💳', note: '', monthlyLimit: 0, currency: 'RUB', archived: false, importSource: 'coinkeeper', createdAt: now };
          categories.push(category); categoryMap.set(key, category); createdCategories.push(name); entityChanges++;
        } else if (category.archived) {
          const updated = { ...category, archived: false };
          categories[categories.findIndex((row) => row.id === category.id)] = updated;
          categoryMap.set(key, updated); entityChanges++;
        }
      }
    }

    let wallets = [...(current.wallets[safeActor] || [])];
    if (hasCurrentWallets) {
      const currentWalletKeys = new Set();
      const normalizedCurrentWallets = [];
      for (const raw of currentWalletRows) {
        try {
          const name = cleanText(raw?.name, 48, { required: true });
          const currency = cleanCurrency(raw?.currency || 'RUB');
          const balance = cleanAssetAmount(raw?.balance || 0);
          const key = financeCategoryKey(name) + '|' + currency;
          if (currentWalletKeys.has(key)) continue;
          currentWalletKeys.add(key); normalizedCurrentWallets.push({ name, currency, balance, key });
        } catch (_) {}
      }
      wallets = wallets.map((wallet) => {
        if (wallet.importSource !== 'coinkeeper') return wallet;
        const key = financeCategoryKey(wallet.name) + '|' + wallet.currency;
        const archived = !currentWalletKeys.has(key);
        if (wallet.archived !== archived) { entityChanges++; return { ...wallet, archived }; }
        return wallet;
      });
      for (const raw of normalizedCurrentWallets) {
        const existingIndex = wallets.findIndex((wallet) => financeCategoryKey(wallet.name) + '|' + wallet.currency === raw.key);
        if (existingIndex >= 0) {
          const existing = wallets[existingIndex];
          const nextWallet = { ...existing, name: raw.name, currency: raw.currency, balance: raw.balance, archived: false, importSource: existing.importSource || 'coinkeeper' };
          if (JSON.stringify(existing) !== JSON.stringify(nextWallet)) entityChanges++;
          wallets[existingIndex] = nextWallet;
        } else {
          wallets.push({ id: randomUUID(), name: raw.name, icon: '💳', currency: raw.currency, balance: raw.balance, archived: false, importSource: 'coinkeeper', createdAt: now });
          createdWallets.push(raw.name); entityChanges++;
        }
      }
    }

    for (const raw of rows) {
      try {
        const categoryName = cleanText(raw?.categoryName, 48, { required: true });
        const categoryKey = financeCategoryKey(categoryName);
        const amount = cleanMoney(raw?.amount);
        if (amount <= 0) { skipped++; continue; }
        const month = cleanMonth(raw?.month);
        const occurredAt = cleanOccurredAt(raw?.occurredAt);
        const importKey = cleanText(raw?.importKey, 220, { required: true });
        if (existingKeys.has(importKey)) { duplicates++; continue; }

        let category = categoryMap.get(categoryKey);
        if (!category) {
          const archived = hasCurrentCategories && !currentCategoryKeys.has(categoryKey);
          category = {
            id: randomUUID(), name: categoryName, icon: cleanIcon(raw?.icon || '💳'), note: '',
            monthlyLimit: 0, currency: 'RUB', archived, importSource: 'coinkeeper', createdAt: now,
          };
          categories.push(category); categoryMap.set(categoryKey, category);
          if (!archived) createdCategories.push(categoryName);
          entityChanges++;
        } else if (category.importSource === 'coinkeeper' && hasCurrentCategories) {
          const archived = !currentCategoryKeys.has(categoryKey);
          if (category.archived !== archived) {
            const updated = { ...category, archived };
            categories[categories.findIndex((row) => row.id === category.id)] = updated;
            category = updated; categoryMap.set(categoryKey, updated); entityChanges++;
          }
        }

        added.push({
          id: randomUUID(), actor: safeActor, month, categoryId: category.id, amount,
          note: cleanText(raw?.note, 120), walletId: '',
          sourceAmount: cleanAssetAmount(raw?.sourceAmount || amount),
          sourceCurrency: cleanCurrency(raw?.sourceCurrency || 'RUB'),
          targetCurrency: 'RUB', exchangeRate: Math.max(0, Number(raw?.exchangeRate || 1)) || 1,
          rubAmount: amount, importKey, occurredAt, createdAt: now, updatedAt: now,
        });
        existingKeys.add(importKey); affectedMonths.add(month);
      } catch (_) { skipped++; }
    }

    let next = normalizeState({
      ...current, initialized: true,
      version: current.version + (added.length || entityChanges ? 1 : 0),
      wallets: { ...current.wallets, [safeActor]: wallets },
      categories: { ...current.categories, [safeActor]: categories },
      personalExpenses: current.personalExpenses.concat(added),
    });
    for (const month of affectedMonths) next = normalizeState({ ...next, personal: syncPersonalMonthExpenses(next, safeActor, month, now) });
    if (added.length || entityChanges) await writeState(next, options);
    return { state: next, result: { imported: added.length, duplicates, skipped, createdCategories, createdWallets } };
  });
}
async function deletePersonalExpense(actor, id, options = {}) {
  const safeActor = cleanActor(actor);
  const cleanId = cleanText(id, 100, { required: true });
  return enqueueMutation(async () => {
    const current = await readFinanceState(options);
    const found = current.personalExpenses.find((row) => row.id === cleanId && row.actor === safeActor);
    if (!found) throw new Error('finance-expense-not-found');
    const now = new Date(options.now || Date.now()).toISOString();
    let wallets = current.wallets;
    if (found.walletId && Number(found.sourceAmount || 0) > 0) {
      const rows = current.wallets[safeActor] || [];
      if (rows.some((row) => row.id === found.walletId)) {
        wallets = {
          ...current.wallets,
          [safeActor]: rows.map((row) => row.id === found.walletId
            ? { ...row, balance: cleanAssetAmount(Number(row.balance || 0) + Number(found.sourceAmount || 0)) }
            : row),
        };
      }
    }
    const base = normalizeState({
      ...current, version: current.version + 1, wallets,
      personalExpenses: current.personalExpenses.filter((row) => row.id !== cleanId),
    });
    const next = normalizeState({ ...base, personal: syncPersonalMonthExpenses(base, safeActor, found.month, now) });
    await writeState(next, options);
    return next;
  });
}
async function saveDebt(actor, payload = {}, options = {}) {
  const safeActor = cleanActor(actor);
  const direction = String(payload.direction || '');
  if (!['owe', 'owed'].includes(direction)) throw new Error('finance-debt-direction-invalid');
  const counterparty = cleanText(payload.counterparty, 80, { required: true });
  const amount = cleanMoney(payload.amount);
  if (amount <= 0) throw new Error('finance-amount-invalid');
  const note = cleanText(payload.note, 140);
  return enqueueMutation(async () => {
    const current = await readFinanceState(options);
    const now = new Date(options.now || Date.now()).toISOString();
    const id = cleanText(payload.id, 100) || (options.id || randomUUID());
    const existing = current.debts.find((row) => row.id === id);
    if (existing && existing.actor !== safeActor) throw new Error('finance-debt-owner-invalid');
    const row = {
      id, actor: safeActor, direction, counterparty, amount, note,
      paid: existing ? existing.paid : false,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };
    const debts = current.debts.filter((item) => item.id !== id).concat(row);
    const next = normalizeState({ ...current, initialized: true, version: current.version + 1, debts });
    await writeState(next, options);
    return next;
  });
}
async function toggleDebt(actor, id, paid, options = {}) {
  const safeActor = cleanActor(actor);
  const cleanId = cleanText(id, 100, { required: true });
  return enqueueMutation(async () => {
    const current = await readFinanceState(options);
    const found = current.debts.find((row) => row.id === cleanId);
    if (!found || found.actor !== safeActor) throw new Error('finance-debt-not-found');
    const now = new Date(options.now || Date.now()).toISOString();
    const debts = current.debts.map((row) => row.id === cleanId ? { ...row, paid: Boolean(paid), updatedAt: now } : row);
    const next = normalizeState({ ...current, version: current.version + 1, debts });
    await writeState(next, options);
    return next;
  });
}
function resetMutationQueueForTests() { mutationTail = Promise.resolve(); }

module.exports = {
  NAMESPACE, TTL_SECONDS, DEFAULT_CATEGORIES, cleanMonth, cleanMoney, cleanAssetAmount, cleanCurrency, cleanPlan, splitAmounts, personalAmounts,
  normalizeState, viewState, expenseTotal, readFinanceState, saveFinanceMonth, savePersonalMonth, savePersonalIncome,
  saveFinancePlan, saveWallet, deleteWallet, reorderWallets, saveExpenseCategory, updateExpenseCategory, archiveExpenseCategory, reorderExpenseCategories, deleteExpenseCategory, savePersonalExpense, importPersonalExpenses, deletePersonalExpense,
  saveDebt, toggleDebt, resetMutationQueueForTests,
};
