const { authorizeRequest, statusForError } = require('./rudi-request-auth.cjs');
const {
  readFinanceState, saveFinanceMonth, savePersonalMonth, savePersonalIncome, saveFinancePlan,
  saveWallet, deleteWallet, reorderWallets, saveWalletIncome, deleteWalletIncome, saveWalletTransfer, deleteWalletTransfer, saveExpenseCategory, updateExpenseCategory, addExpenseCategoryLabel, archiveExpenseCategory, reorderExpenseCategories, deleteExpenseCategory,
  savePersonalExpense, importPersonalExpenses, deletePersonalExpense,
  saveDebt, toggleDebt, viewState,
} = require('./finance-store.cjs');
const { getDailyLiteracyArticle, getMonthlyFinanceInsight, getFinancialAnalystReport } = require('./finance-ai.cjs');
const { readMarketTicker } = require('./market-ticker.cjs');

function statusFor(code, error) {
  const auth = statusForError(error);
  if (auth !== 500) return auth;
  if (code === 'finance-owner-only') return 403;
  if (['finance-debt-not-found','finance-category-not-found','finance-expense-not-found','finance-wallet-not-found','finance-transfer-not-found'].includes(code)) return 404;
  if ([
    'finance-month-invalid','finance-amount-invalid','finance-operation-invalid','finance-actor-invalid',
    'finance-text-required','finance-debt-direction-invalid','finance-debt-owner-invalid','finance-category-duplicate','finance-date-invalid',
    'finance-currency-invalid','finance-wallet-insufficient','finance-rate-invalid','finance-wallet-currency-mismatch','finance-label-invalid','finance-transfer-same-wallet','finance-credit-limit-invalid'
  ].includes(code)) return 400;
  return 500;
}
async function financeRubRates() {
  const ticker = await readMarketTicker();
  const byId = new Map((ticker.items || []).map((item) => [String(item.id || ''), Number(item.value)]));
  const usdRub = Number(byId.get('usd-rub'));
  const eurRub = Number(byId.get('eur-rub'));
  const btcUsd = Number(byId.get('btcusdt'));
  const ethUsd = Number(byId.get('ethusdt'));
  const usdtUsd = Number(byId.get('usdtusd')) || 1;
  return {
    RUB: 1,
    USD: usdRub,
    EUR: eurRub,
    USDT: usdRub && usdtUsd ? usdRub * usdtUsd : 0,
    BTC: usdRub && btcUsd ? usdRub * btcUsd : 0,
    ETH: usdRub && ethUsd ? usdRub * ethUsd : 0,
  };
}
function resolveExpenseConversion({ inputAmount, inputCurrency, sourceCurrency, targetCurrency, rates = {} } = {}) {
  const input = Number(inputAmount);
  if (!Number.isFinite(input) || input <= 0) throw new Error('finance-amount-invalid');
  const source = String(sourceCurrency || 'RUB').toUpperCase();
  const target = String(targetCurrency || 'RUB').toUpperCase();
  const chosen = String(inputCurrency || source).toUpperCase();
  if (![source, target].includes(chosen)) throw new Error('finance-wallet-currency-mismatch');
  const sourceRate = Number(rates[source]);
  const targetRate = Number(rates[target]);
  if (!sourceRate || !targetRate) throw new Error('finance-rate-invalid');
  const roundMoney = (value) => Math.round(Number(value) * 100) / 100;
  const roundAsset = (value) => Math.round(Number(value) * 100000000) / 100000000;
  let sourceAmount;
  let amount;
  let rubAmount;
  if (chosen === target && target !== source) {
    amount = roundMoney(input);
    rubAmount = roundMoney(amount * targetRate);
    sourceAmount = roundAsset(rubAmount / sourceRate);
  } else {
    sourceAmount = roundAsset(input);
    rubAmount = roundMoney(sourceAmount * sourceRate);
    amount = roundMoney(rubAmount / targetRate);
  }
  const exchangeRate = roundAsset(amount / sourceAmount);
  return { inputAmount: input, inputCurrency: chosen, sourceAmount, sourceCurrency: source, amount, targetCurrency: target, rubAmount, exchangeRate };
}

function categorySummary(view, month) {
  const expenses = (Array.isArray(view.personalExpenses) ? view.personalExpenses : []).filter((row) => row.month === month);
  return (Array.isArray(view.categories) ? view.categories : []).map((category) => ({
    ...category,
    spent: Math.round(expenses.filter((row) => row.categoryId === category.id).reduce((sum, row) => sum + Number(row.rubAmount || row.amount || 0), 0) * 100) / 100,
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
    if (operation === 'save-wallet') {
      const state = await saveWallet(actor, body);
      return res.status(200).json({ ok: true, actor, canEdit: actor === 'Рустам', ...viewState(state, actor) });
    }
    if (operation === 'delete-wallet') {
      const state = await deleteWallet(actor, body.id);
      return res.status(200).json({ ok: true, actor, canEdit: actor === 'Рустам', ...viewState(state, actor) });
    }
    if (operation === 'reorder-wallets') {
      const state = await reorderWallets(actor, body.ids);
      return res.status(200).json({ ok: true, actor, canEdit: actor === 'Рустам', ...viewState(state, actor) });
    }
    if (operation === 'save-wallet-income') {
      const current = await readFinanceState();
      const view = viewState(current, actor);
      const wallet = (view.wallets || []).find((row) => row.id === String(body.walletId || ''));
      if (!wallet) throw new Error('finance-wallet-not-found');
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('finance-amount-invalid');
      const currency = String(wallet.currency || 'RUB').toUpperCase();
      const rates = currency === 'RUB' ? { RUB: 1 } : await financeRubRates();
      const rubRate = Number(rates[currency]);
      if (!rubRate) throw new Error('finance-rate-invalid');
      const rubAmount = Math.round(amount * rubRate * 100) / 100;
      const state = await saveWalletIncome(actor, {
        walletId: wallet.id,
        amount,
        currency,
        rubAmount,
        exchangeRate: rubRate,
        occurredAt: body.occurredAt,
        month: body.month,
        note: body.note,
      });
      return res.status(200).json({
        ok: true,
        actor,
        canEdit: actor === 'Рустам',
        income: { walletId: wallet.id, amount, currency, rubAmount, exchangeRate: rubRate },
        ...viewState(state, actor),
      });
    }
    if (operation === 'delete-wallet-income') {
      const state = await deleteWalletIncome(actor, body.id);
      return res.status(200).json({ ok: true, actor, canEdit: actor === 'Рустам', ...viewState(state, actor) });
    }
    if (operation === 'save-wallet-transfer') {
      const current = await readFinanceState();
      const view = viewState(current, actor);
      const fromWallet = (view.wallets || []).find((row) => row.id === String(body.fromWalletId || ''));
      const toWallet = (view.wallets || []).find((row) => row.id === String(body.toWalletId || ''));
      if (!fromWallet || !toWallet) throw new Error('finance-wallet-not-found');
      if (fromWallet.id === toWallet.id) throw new Error('finance-transfer-same-wallet');
      const inputAmount = Number(body.amount ?? body.sourceAmount);
      if (!Number.isFinite(inputAmount) || inputAmount <= 0) throw new Error('finance-amount-invalid');
      const sourceCurrency = String(fromWallet.currency || 'RUB').toUpperCase();
      const targetCurrency = String(toWallet.currency || 'RUB').toUpperCase();
      const inputCurrency = String(body.inputCurrency || sourceCurrency).toUpperCase();
      if (![sourceCurrency, targetCurrency].includes(inputCurrency)) throw new Error('finance-wallet-currency-mismatch');
      const rates = await financeRubRates();
      const sourceRate = Number(rates[sourceCurrency]);
      const targetRate = Number(rates[targetCurrency]);
      if (!sourceRate || !targetRate) throw new Error('finance-rate-invalid');
      let sourceAmount;
      let targetAmount;
      let rubAmount;
      if (inputCurrency === targetCurrency && inputCurrency !== sourceCurrency) {
        targetAmount = Math.round(inputAmount * 100000000) / 100000000;
        rubAmount = Math.round(targetAmount * targetRate * 100) / 100;
        sourceAmount = Math.round((rubAmount / sourceRate) * 100000000) / 100000000;
      } else {
        sourceAmount = Math.round(inputAmount * 100000000) / 100000000;
        rubAmount = Math.round(sourceAmount * sourceRate * 100) / 100;
        targetAmount = Math.round((rubAmount / targetRate) * 100000000) / 100000000;
      }
      const state = await saveWalletTransfer(actor, {
        fromWalletId: fromWallet.id,
        toWalletId: toWallet.id,
        sourceAmount,
        sourceCurrency: fromWallet.currency,
        targetAmount,
        targetCurrency: toWallet.currency,
        sourceRate,
        targetRate,
        rubAmount,
        occurredAt: body.occurredAt,
        month: body.month,
        note: body.note,
      });
      return res.status(200).json({
        ok: true, actor, canEdit: actor === 'Рустам',
        transfer: { fromWalletId: fromWallet.id, toWalletId: toWallet.id, sourceAmount, targetAmount, rubAmount },
        ...viewState(state, actor),
      });
    }
    if (operation === 'delete-wallet-transfer') {
      const state = await deleteWalletTransfer(actor, body.id);
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
    if (operation === 'add-category-label') {
      const state = await addExpenseCategoryLabel(actor, body.id, body.label);
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
      const current = await readFinanceState();
      const view = viewState(current, actor);
      const category = (view.categories || []).find((row) => row.id === String(body.categoryId || ''));
      if (!category) throw new Error('finance-category-not-found');
      const wallet = body.walletId ? (view.wallets || []).find((row) => row.id === String(body.walletId || '')) : null;
      if (body.walletId && !wallet) throw new Error('finance-wallet-not-found');

      const sourceCurrency = String(wallet?.currency || category.currency || 'RUB').toUpperCase();
      const targetCurrency = String(category.currency || 'RUB').toUpperCase();
      const inputAmount = Number(body.amount ?? body.sourceAmount);
      const inputCurrency = String(body.inputCurrency || sourceCurrency).toUpperCase();
      const rubRates = sourceCurrency === 'RUB' && targetCurrency === 'RUB' ? { RUB: 1 } : await financeRubRates();
      const conversion = resolveExpenseConversion({ inputAmount, inputCurrency, sourceCurrency, targetCurrency, rates: rubRates });
      const { sourceAmount, amount, rubAmount, exchangeRate } = conversion;

      const state = await savePersonalExpense(actor, {
        ...body,
        amount,
        sourceAmount,
        sourceCurrency,
        targetCurrency,
        rubAmount,
        exchangeRate,
      });
      return res.status(200).json({ ok: true, actor, canEdit: actor === 'Рустам', conversion, ...viewState(state, actor) });
    }
    if (operation === 'import-expenses') {
      const imported = await importPersonalExpenses(actor, {
        rows: body.rows,
        currentCategories: body.currentCategories,
        currentWallets: body.currentWallets,
      });
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
module.exports.resolveExpenseConversion = resolveExpenseConversion;
