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
function defaultCategories() {
  return DEFAULT_CATEGORIES.map((row) => ({ ...row, note: '', monthlyLimit: 0, createdAt: '' }));
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
      personalExpenses.push({
        id, actor, month, categoryId, amount,
        note: cleanText(raw?.note, 120),
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
    months, personal, plans, categories, personalExpenses, debts,
  };
}
function expenseTotal(state, actor, month) {
  const safeActor = cleanActor(actor);
  const safeMonth = cleanMonth(month);
  return Math.round(
    (Array.isArray(state?.personalExpenses) ? state.personalExpenses : [])
      .filter((row) => row.actor === safeActor && row.month === safeMonth)
      .reduce((sum, row) => sum + Number(row.amount || 0), 0) * 100
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
  const categories = safeActor ? [...(normalized.categories[safeActor] || [])] : [];
  const personalExpenses = safeActor
    ? normalized.personalExpenses.filter((row) => row.actor === safeActor).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    : [];
  const debts = safeActor
    ? normalized.debts.filter((row) => row.actor === safeActor).sort((a, b) => Number(a.paid) - Number(b.paid) || String(b.updatedAt).localeCompare(String(a.updatedAt)))
    : [];
  const plan = safeActor ? normalized.plans[safeActor] : cleanPlan();
  return { initialized: normalized.initialized, version: normalized.version, months, personalMonths, categories, personalExpenses, debts, plan };
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
async function saveExpenseCategory(actor, payload = {}, options = {}) {
  const safeActor = cleanActor(actor);
  const name = cleanText(payload.name, 48, { required: true });
  const icon = cleanIcon(payload.icon);
  return enqueueMutation(async () => {
    const current = await readFinanceState(options);
    const rows = current.categories[safeActor] || [];
    const normalizedName = name.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
    if (rows.some((row) => row.name.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е') === normalizedName)) {
      throw new Error('finance-category-duplicate');
    }
    const row = {
      id: cleanText(options.id || randomUUID(), 100, { required: true }),
      name, icon, note: '', monthlyLimit: 0,
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
    if (!rows.some((row) => row.id === id)) throw new Error('finance-category-not-found');
    const categories = rows.map((row) => row.id === id ? {
      ...row,
      note: cleanText(payload.note, 180),
      monthlyLimit: cleanMoney(payload.monthlyLimit || 0),
    } : row);
    const next = normalizeState({
      ...current, initialized: true, version: current.version + 1,
      categories: { ...current.categories, [safeActor]: categories },
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
    const affectedMonths = [...new Set(
      current.personalExpenses
        .filter((row) => row.actor === safeActor && row.categoryId === cleanId)
        .map((row) => row.month)
    )];
    const now = new Date(options.now || Date.now()).toISOString();
    let next = normalizeState({
      ...current,
      initialized: true,
      version: current.version + 1,
      categories: {
        ...current.categories,
        [safeActor]: rows.filter((row) => row.id !== cleanId),
      },
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
  return enqueueMutation(async () => {
    const current = await readFinanceState(options);
    if (!(current.categories[safeActor] || []).some((row) => row.id === categoryId)) throw new Error('finance-category-not-found');
    const now = new Date(options.now || Date.now()).toISOString();
    const row = {
      id: cleanText(options.id || randomUUID(), 100, { required: true }),
      actor: safeActor, month, categoryId, amount, note, createdAt: now, updatedAt: now,
    };
    const base = normalizeState({
      ...current, initialized: true, version: current.version + 1,
      personalExpenses: current.personalExpenses.concat(row),
    });
    const next = normalizeState({ ...base, personal: syncPersonalMonthExpenses(base, safeActor, month, now) });
    await writeState(next, options);
    return next;
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
    const base = normalizeState({
      ...current, version: current.version + 1,
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
  NAMESPACE, TTL_SECONDS, DEFAULT_CATEGORIES, cleanMonth, cleanMoney, cleanPlan, splitAmounts, personalAmounts,
  normalizeState, viewState, expenseTotal, readFinanceState, saveFinanceMonth, savePersonalMonth, savePersonalIncome,
  saveFinancePlan, saveExpenseCategory, updateExpenseCategory, deleteExpenseCategory, savePersonalExpense, deletePersonalExpense,
  saveDebt, toggleDebt, resetMutationQueueForTests,
};
