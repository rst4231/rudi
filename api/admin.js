const { buildAdminDashboard, handleAdminAction } = require('./admin-api.cjs');

function resultStatus(result) {
  if (result?.ok) return 200;
  if (result?.error === 'already-published') return 409;
  if (result?.error === 'not-failed') return 409;
  if (result?.error === 'alert-not-found') return 404;
  return 400;
}

async function runAdmin(req, res, options = {}) {
  if (req.method === 'GET' || !req.method) {
    const buildDashboard = options.buildDashboard || buildAdminDashboard;
    const dashboard = await buildDashboard(options);
    return res.status(200).json(dashboard);
  }

  if (req.method === 'POST') {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const action = String(body.action || '').trim();
    const handleAction = options.handleAction || handleAdminAction;
    const result = await handleAction(action, body, options);
    return res.status(resultStatus(result)).json(result);
  }

  res.status(405);
  if (typeof res.setHeader === 'function') res.setHeader('Allow', 'GET, POST');
  return res.json({ ok: false, error: 'method-not-allowed' });
}

module.exports = (req, res) => runAdmin(req, res);
module.exports.runAdmin = runAdmin;
module.exports.resultStatus = resultStatus;
