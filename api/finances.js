const { authorizeRequest, statusForError } = require('./rudi-request-auth.cjs');
const { readFinanceState, saveFinanceMonth, savePersonalMonth, saveDebt, toggleDebt, viewState } = require('./finance-store.cjs');

function statusFor(code, error) {
  const auth = statusForError(error);
  if (auth !== 500) return auth;
  if (code === 'finance-owner-only') return 403;
  if (['finance-debt-not-found'].includes(code)) return 404;
  if ([
    'finance-month-invalid','finance-amount-invalid','finance-operation-invalid','finance-actor-invalid',
    'finance-text-required','finance-debt-direction-invalid','finance-debt-owner-invalid'
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
