const { authorizeRequest, statusForError } = require('./rudi-request-auth.cjs');
const {
  readFinanceState, saveFinanceMonth, savePersonalMonth, savePersonalIncome, saveFinancePlan,
  saveExpenseCategory, updateExpenseCategory, archiveExpenseCategory, reorderExpenseCategories, deleteExpenseCategory,
  savePersonalExpense, importPersonalExpenses, deletePersonalExpense,
  saveDebt, toggleDebt, viewState,
} = require('./finance-store.cjs');
const { getDailyLiteracyArticle, getMonthlyFinanceInsight, getFinancialAnalystReport } = require('./finance-ai.cjs');

function statusFor(code, error) {
  const auth = statusForError(error);
  if (auth !== 500) return auth;
  if (code === 'finance-owner-only') return 403;
  if (['finance-debt-not-found','finance-category-not-found','finance-expense-not-found'].includes(code)) return 404;
  if ([
    'finance-month-invalid','finance-amount-invalid','finance-operation-invalid','finance-actor-invalid',
    'finance-text-required','finance-debt-direction-invalid','finance-debt-owner-invalid','finance-category-duplicate','finance-date-invalid'
  ].includes(code)) return 400;
  return 500;
}
function categorySummary(view, month) {
  const expenses = (Array.isArray(view.personalExpenses) ? view.personalExpenses : []).filter((row) => row.month === month);
  return (Array.isArray(view.categories) ? view.categories : []).map((category) => ({
    ...category,
    spent: Math.round(expenses.filter((row) => row.categoryId === category.id).reduce((sum, row) => sum + Number(row.amount || 0), 0) * 100) / 100,
  }));
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
    if (operation === 'save-personal-income') {
      const state = await savePersonalIncome(actor, body.month, body.income);
      return res.status(200).json({ ok: true, actor, canEdit: actor === 'Рустам', ...viewState(state, actor) });
    }
    if (operation === 'save-plan') {
      const state = await saveFinancePlan(actor, body);
      return res.status(200).json({ ok: true, actor, canEdit: actor === 'Рустам', ...viewState(state, actor) });
    }
    if (operation === 'save-category') {
      const state = await saveExpenseCategory(actor, body);
      return res.status(200).json({ ok: true, actor, canEdit: actor === 'Рустам', ...viewState(state, actor) });
    }
    if (operation === 'update-category') {
      const state = await updateExpenseCategory(actor, body);
      return res.status(200).json({ ok: true, actor, canEdit: actor === 'Рустам', ...viewState(state, actor) });
    }
    if (operation === 'archive-category') {
      const state = await archiveExpenseCategory(actor, body.id);
      return res.status(200).json({ ok: true, actor, canEdit: actor === 'Рустам', ...viewState(state, actor) });
    }
    if (operation === 'reorder-categories') {
      const state = await reorderExpenseCategories(actor, body.ids);
      return res.status(200).json({ ok: true, actor, canEdit: actor === 'Рустам', ...viewState(state, actor) });
    }
    if (operation === 'delete-category') {
      const state = await deleteExpenseCategory(actor, body.id);
      return res.status(200).json({ ok: true, actor, canEdit: actor === 'Рустам', ...viewState(state, actor) });
    }
    if (operation === 'save-expense') {
      const state = await savePersonalExpense(actor, body);
      return res.status(200).json({ ok: true, actor, canEdit: actor === 'Рустам', ...viewState(state, actor) });
    }
    if (operation === 'import-expenses') {
      const imported = await importPersonalExpenses(actor, body.rows);
      return res.status(200).json({
        ok: true,
        actor,
        canEdit: actor === 'Рустам',
        importResult: imported.result,
        ...viewState(imported.state, actor),
      });
    }
    if (operation === 'delete-expense') {
      const state = await deletePersonalExpense(actor, body.id);
      return res.status(200).json({ ok: true, actor, canEdit: actor === 'Рустам', ...viewState(state, actor) });
    }
    if (operation === 'monthly-insight') {
      const month = String(body.month || '').trim();
      const state = await readFinanceState();
      const view = viewState(state, actor);
      const row = (view.personalMonths || []).find((item) => item.month === month) || { income: 0, expenses: 0, balance: 0 };
      const insight = await getMonthlyFinanceInsight({
        actor, month, version: view.version,
        income: row.income, expenses: row.expenses, balance: row.balance,
        reserve: view.plan?.reserve || 0,
        categories: categorySummary(view, month),
      });
      return res.status(200).json({ ok: true, insight });
    }
    if (operation === 'literacy') {
      const article = await getDailyLiteracyArticle();
      return res.status(200).json({ ok: true, article });
    }
    if (operation === 'analyst') {
      const month = String(body.month || '').trim();
      const state = await readFinanceState();
      const view = viewState(state, actor);
      const row = (view.personalMonths || []).find((item) => item.month === month) || { income: 0, expenses: 0, balance: 0 };
      const literacy = await getDailyLiteracyArticle().catch(() => null);
      const report = await getFinancialAnalystReport({
        actor, month, version: view.version,
        income: row.income, expenses: row.expenses, balance: row.balance,
        reserve: view.plan?.reserve || 0,
        goalTitle: view.plan?.goalTitle || '',
        goalCurrent: view.plan?.goalCurrent || 0,
        goalTarget: view.plan?.goalTarget || 0,
        categories: categorySummary(view, month),
        debts: view.debts || [],
        literacy,
      });
      return res.status(200).json({ ok: true, report });
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
module.exports.categorySummary = categorySummary;
