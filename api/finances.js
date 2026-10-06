const { authorizeRequest, statusForError } = require('./rudi-request-auth.cjs');
const {
  readFinanceState, saveFinanceMonth, savePersonalMonth, savePersonalIncome, saveFinanceProfile,
  saveExpenseCategory, saveExpenseCategoryMonth, saveDebt, toggleDebt, viewState,
} = require('./finance-store.cjs');
const { getFinanceLiteracyArticle, getFinanceMonthlyInsight, getFinanceAnalyst } = require('./finance-ai.cjs');

function statusFor(code, error) {
  const auth = statusForError(error);
  if (auth !== 500) return auth;
  if (code === 'finance-owner-only') return 403;
  if (['finance-debt-not-found'].includes(code)) return 404;
  if ([
    'finance-month-invalid','finance-amount-invalid','finance-operation-invalid','finance-actor-invalid',
    'finance-text-required','finance-debt-direction-invalid','finance-debt-owner-invalid',
    'finance-category-limit','finance-category-duplicate'
  ].includes(code)) return 400;
  return 500;
}
async function handler(req, res) {
  res.setHeader?.('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
  try {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const { actor } = authorizeRequest(req, body.initData);
    const operation = String(body.operation || 'list').trim();

    if (operation === 'list') {
      const state = await readFinanceState();
      return res.status(200).json({ ok: true, actor, canEdit: actor === 'Рустам', ...viewState(state, actor) });
    }
    if (operation === 'save') {
      const state = await saveFinanceMonth(actor, body.month, body.rent, body.utilities);
      return res.status(200).json({ ok: true, actor, canEdit: true, ...viewState(state, actor) });
    }
    if (operation === 'save-personal') {
      const state = await savePersonalMonth(actor, body.month, body.income, body.expenses);
      return res.status(200).json({ ok: true, actor, canEdit: actor === 'Рустам', ...viewState(state, actor) });
    }
    if (operation === 'save-income') {
      const state = await savePersonalIncome(actor, body.month, body.income);
      return res.status(200).json({ ok: true, actor, canEdit: actor === 'Рустам', ...viewState(state, actor) });
    }
    if (operation === 'save-profile') {
      const state = await saveFinanceProfile(actor, body);
      return res.status(200).json({ ok: true, actor, canEdit: actor === 'Рустам', ...viewState(state, actor) });
    }
    if (operation === 'save-expense-category') {
      const state = await saveExpenseCategory(actor, body);
      return res.status(200).json({ ok: true, actor, canEdit: actor === 'Рустам', ...viewState(state, actor) });
    }
    if (operation === 'save-expense-category-month') {
      const state = await saveExpenseCategoryMonth(actor, body.month, body.entries);
      return res.status(200).json({ ok: true, actor, canEdit: actor === 'Рустам', ...viewState(state, actor) });
    }
    if (operation === 'literacy') {
      const article = await getFinanceLiteracyArticle();
      return res.status(200).json({ ok: true, actor, article });
    }
    if (operation === 'insight') {
      const state = await readFinanceState();
      const view = viewState(state, actor);
      const month = String(body.month || '').trim();
      const row = view.personalMonths.find((item) => String(item.month || '') === month);
      if (!row) return res.status(200).json({ ok: true, actor, insight: { text: 'Укажи доход и расходы по категориям, чтобы получить разбор.' } });
      const insight = await getFinanceMonthlyInsight({ actor, month, row, profile: view.profile });
      return res.status(200).json({ ok: true, actor, insight });
    }
    if (operation === 'analyst') {
      const state = await readFinanceState();
      const view = viewState(state, actor);
      const month = String(body.month || '').trim();
      const row = view.personalMonths.find((item) => String(item.month || '') === month) || { month, income: 0, expenses: 0, balance: 0 };
      const categoryMonth = view.expenseCategoryMonths.find((item) => String(item.month || '') === month) || { month, entries: {} };
      const article = await getFinanceLiteracyArticle();
      const analysis = await getFinanceAnalyst({
        actor,
        month,
        row,
        profile: view.profile,
        categories: view.expenseCategories,
        categoryMonth,
        debts: view.debts,
        article,
      });
      return res.status(200).json({ ok: true, actor, analysis });
    }
    if (operation === 'save-debt') {
      const state = await saveDebt(actor, body);
      return res.status(200).json({ ok: true, actor, canEdit: actor === 'Рустам', ...viewState(state, actor) });
    }
    if (operation === 'toggle-debt') {
      const state = await toggleDebt(actor, body.id, body.paid);
      return res.status(200).json({ ok: true, actor, canEdit: actor === 'Рустам', ...viewState(state, actor) });
    }
    throw new Error('finance-operation-invalid');
  } catch (error) {
    const code = String(error?.message || error);
    const status = statusFor(code, error);
    if (status === 500) console.error('RUDI_FINANCES_ERROR', code, error?.stack || '');
    return res.status(status).json({ ok: false, error: code });
  }
}
module.exports = handler;
module.exports.handler = handler;
module.exports.statusFor = statusFor;
