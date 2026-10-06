const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');
const { randomUUID } = require('node:crypto');

const NAMESPACE = 'rudi-household-finances-v1';
const TTL_SECONDS = 60 * 60 * 24 * 3650;
const STATE_KEY = 'shared';
const DEFAULT_EXPENSE_CATEGORIES = [
  { id: 'housing', name: 'Жильё', icon: '🏠' },
  { id: 'transport', name: 'Транспорт', icon: '🚗' },
  { id: 'food', name: 'Еда', icon: '🍽️' },
  { id: 'entertainment', name: 'Развлечения', icon: '🎉' },
  { id: 'shopping', name: 'Покупки', icon: '🛍️' },
];
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
function cleanProfile(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    reserve: cleanMoney(source.reserve || 0),
    goalTitle: cleanText(source.goalTitle, 80),
    goalTarget: cleanMoney(source.goalTarget || 0),
    goalCurrent: cleanMoney(source.goalCurrent || 0),
    updatedAt: String(source.updatedAt || '').trim(),
  };
}
function cleanCategory(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    id: cleanText(source.id || '', 100) || randomUUID(),
    name: cleanText(source.name, 40, { required: true }),
    icon: cleanText(source.icon || '💸', 12) || '💸',
    createdAt: String(source.createdAt || '').trim(),
  };
}
function cleanExpenseEntry(value = {}) {
  if (typeof value === 'number' || typeof value === 'string') {
    return { amount: cleanMoney(value || 0), limit: 0, note: '' };
  }
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    amount: cleanMoney(source.amount || 0),
    limit: cleanMoney(source.limit || 0),
    note: cleanText(source.note || '', 180),
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

  const profiles = { 'Рустам': cleanProfile(source.profiles?.['Рустам']), 'Диана': cleanProfile(source.profiles?.['Диана']) };
  const expenseCategories = { 'Рустам': [], 'Диана': [] };
  const rawCategories = source.expenseCategories && typeof source.expenseCategories === 'object' && !Array.isArray(source.expenseCategories) ? source.expenseCategories : {};
  for (const actor of Object.keys(expenseCategories)) {
    const base = DEFAULT_EXPENSE_CATEGORIES.map((row) => cleanCategory(row));
    const seenIds = new Set(base.map((row) => row.id));
    const seenNames = new Set(base.map((row) => row.name.toLocaleLowerCase('ru-RU')));
    expenseCategories[actor] = base.slice();
    for (const raw of Array.isArray(rawCategories[actor]) ? rawCategories[actor] : []) {
      try {
        const row = cleanCategory(raw);
        const nameKey = row.name.toLocaleLowerCase('ru-RU');
        if (seenIds.has(row.id) || seenNames.has(nameKey)) continue;
        seenIds.add(row.id);
        seenNames.add(nameKey);
        expenseCategories[actor].push(row);
      } catch (_) {}
    }
  }
  const expenseCategoryMonths = { 'Рустам': {}, 'Диана': {} };
  const rawCategoryMonths = source.expenseCategoryMonths && typeof source.expenseCategoryMonths === 'object' && !Array.isArray(source.expenseCategoryMonths) ? source.expenseCategoryMonths : {};
  for (const actor of Object.keys(expenseCategoryMonths)) {
    const actorRows = rawCategoryMonths[actor] && typeof rawCategoryMonths[actor] === 'object' && !Array.isArray(rawCategoryMonths[actor]) ? rawCategoryMonths[actor] : {};
    const allowed = new Set(expenseCategories[actor].map((row) => row.id));
    for (const [rawMonth, rawEntries] of Object.entries(actorRows)) {
      let month;
      try { month = cleanMonth(rawMonth); } catch (_) { continue; }
      const entries = {};
      const sourceEntries = rawEntries && typeof rawEntries === 'object' && !Array.isArray(rawEntries) ? rawEntries : {};
      for (const [categoryId, rawEntry] of Object.entries(sourceEntries)) {
        if (!allowed.has(categoryId)) continue;
        try { entries[categoryId] = cleanExpenseEntry(rawEntry); } catch (_) {}
      }
      expenseCategoryMonths[actor][month] = entries;
    }
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
    months,
    personal,
    profiles,
    expenseCategories,
    expenseCategoryMonths,
    debts,
  };
}
function viewState(state, actor = '') {
  const normalized = normalizeState(state);
  const months = Object.values(normalized.months)
    .sort((a, b) => String(b.month).localeCompare(String(a.month)))
    .map((row) => ({ ...row, ...splitAmounts(row.rent, row.utilities) }));
  const safeActor = ['Рустам', 'Диана'].includes(String(actor || '').trim()) ? String(actor).trim() : '';
  const personalMonths = safeActor
    ? Object.values(normalized.personal[safeActor] || {}).sort((a, b) => String(b.month).localeCompare(String(a.month)))
    : [];
  const debts = safeActor
    ? normalized.debts.filter((row) => row.actor === safeActor).sort((a, b) => Number(a.paid) - Number(b.paid) || String(b.updatedAt).localeCompare(String(a.updatedAt)))
    : [];
  const expenseCategories = safeActor ? normalized.expenseCategories[safeActor] : [];
  const expenseCategoryMonths = safeActor
    ? Object.entries(normalized.expenseCategoryMonths[safeActor] || {})
        .sort((a, b) => String(b[0]).localeCompare(String(a[0])))
        .map(([month, entries]) => ({ month, entries }))
    : [];
  return {
    initialized: normalized.initialized,
    version: normalized.version,
    months,
    personalMonths,
    profile: safeActor ? normalized.profiles[safeActor] : cleanProfile({}),
    expenseCategories,
    expenseCategoryMonths,
    debts,
  };
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
async function savePersonalIncome(actor, month, income, options = {}) {
  const safeActor = cleanActor(actor);
  const safeMonth = cleanMonth(month);
  const cleanIncome = cleanMoney(income);
  return enqueueMutation(async () => {
    const current = await readFinanceState(options);
    const previous = current.personal[safeActor]?.[safeMonth] || {};
    const updatedAt = new Date(options.now || Date.now()).toISOString();
    const next = normalizeState({
      ...current,
      initialized: true,
      version: current.version + 1,
      personal: {
        ...current.personal,
        [safeActor]: {
          ...(current.personal[safeActor] || {}),
          [safeMonth]: {
            month: safeMonth,
            ...personalAmounts(cleanIncome, previous.expenses || 0),
            updatedAt,
            updatedBy: safeActor,
          },
        },
      },
    });
    await writeState(next, options);
    return next;
  });
}
async function saveFinanceProfile(actor, payload = {}, options = {}) {
  const safeActor = cleanActor(actor);
  const profile = cleanProfile(payload);
  return enqueueMutation(async () => {
    const current = await readFinanceState(options);
    const updatedAt = new Date(options.now || Date.now()).toISOString();
    const next = normalizeState({
      ...current,
      initialized: true,
      version: current.version + 1,
      profiles: { ...current.profiles, [safeActor]: { ...profile, updatedAt } },
    });
    await writeState(next, options);
    return next;
  });
}
async function saveExpenseCategory(actor, payload = {}, options = {}) {
  const safeActor = cleanActor(actor);
  const name = cleanText(payload.name, 40, { required: true });
  const icon = cleanText(payload.icon || '💸', 12) || '💸';
  return enqueueMutation(async () => {
    const current = await readFinanceState(options);
    const rows = current.expenseCategories[safeActor] || [];
    if (rows.length >= 24) throw new Error('finance-category-limit');
    if (rows.some((row) => row.name.toLocaleLowerCase('ru-RU') === name.toLocaleLowerCase('ru-RU'))) throw new Error('finance-category-duplicate');
    const createdAt = new Date(options.now || Date.now()).toISOString();
    const row = cleanCategory({ id: options.id || randomUUID(), name, icon, createdAt });
    const next = normalizeState({
      ...current,
      initialized: true,
      version: current.version + 1,
      expenseCategories: { ...current.expenseCategories, [safeActor]: rows.concat(row) },
    });
    await writeState(next, options);
    return next;
  });
}
async function saveExpenseCategoryMonth(actor, month, rawEntries = {}, options = {}) {
  const safeActor = cleanActor(actor);
  const safeMonth = cleanMonth(month);
  return enqueueMutation(async () => {
    const current = await readFinanceState(options);
    const categories = current.expenseCategories[safeActor] || [];
    const allowed = new Set(categories.map((row) => row.id));
    const entries = {};
    for (const [categoryId, rawEntry] of Object.entries(rawEntries && typeof rawEntries === 'object' && !Array.isArray(rawEntries) ? rawEntries : {})) {
      if (!allowed.has(categoryId)) continue;
      entries[categoryId] = cleanExpenseEntry(rawEntry);
    }
    const totalExpenses = Math.round(Object.values(entries).reduce((sum, row) => sum + Number(row.amount || 0), 0) * 100) / 100;
    const previousPersonal = current.personal[safeActor]?.[safeMonth] || {};
    const updatedAt = new Date(options.now || Date.now()).toISOString();
    const next = normalizeState({
      ...current,
      initialized: true,
      version: current.version + 1,
      expenseCategoryMonths: {
        ...current.expenseCategoryMonths,
        [safeActor]: { ...(current.expenseCategoryMonths[safeActor] || {}), [safeMonth]: entries },
      },
      personal: {
        ...current.personal,
        [safeActor]: {
          ...(current.personal[safeActor] || {}),
          [safeMonth]: {
            month: safeMonth,
            ...personalAmounts(previousPersonal.income || 0, totalExpenses),
            updatedAt,
            updatedBy: safeActor,
          },
        },
      },
    });
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
  NAMESPACE, TTL_SECONDS, DEFAULT_EXPENSE_CATEGORIES, cleanMonth, cleanMoney, splitAmounts, personalAmounts, normalizeState, viewState,
  readFinanceState, saveFinanceMonth, savePersonalMonth, savePersonalIncome, saveFinanceProfile, saveExpenseCategory, saveExpenseCategoryMonth,
  saveDebt, toggleDebt, resetMutationQueueForTests,
};
