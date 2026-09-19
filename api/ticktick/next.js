const { readToken, clearToken } = require('../ticktick-store.cjs');
const {
  credentialsConfigured,
  loadTickTickConfig,
  fetchProjectData,
  chooseNextTask,
  resolveAssigneeName,
} = require('../ticktick-client.cjs');

module.exports = async function handler(req, res) {
  res.setHeader?.('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');

  if (req.method !== 'GET' && req.method) {
    res.setHeader?.('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'method-not-allowed' });
  }

  if (!credentialsConfigured(process.env)) {
    return res.status(503).json({
      ok: false,
      connected: false,
      configured: false,
      error: 'ticktick-not-configured',
    });
  }

  const config = await loadTickTickConfig();
  if (!config.enabled) return res.status(200).json({ ok: true, enabled: false, connected: true, task: null });

  const token = await readToken();
  if (!token?.accessToken) {
    return res.status(401).json({
      ok: false,
      connected: false,
      configured: true,
      connectUrl: '/api/ticktick/connect',
      error: 'ticktick-not-connected',
    });
  }

  try {
    const data = await fetchProjectData(token.accessToken, config.projectId);
    const task = chooseNextTask(data?.tasks || []);
    if (!task) {
      return res.status(200).json({
        ok: true,
        connected: true,
        enabled: true,
        project: data?.project?.name || 'Общий',
        task: null,
      });
    }

    return res.status(200).json({
      ok: true,
      connected: true,
      enabled: true,
      project: data?.project?.name || 'Общий',
      task: {
        id: task.id,
        title: String(task.title || '').trim(),
        startDate: task.startDate || task.dueDate || null,
        dueDate: task.dueDate || null,
        isAllDay: Boolean(task.isAllDay),
        assignee: resolveAssigneeName(task.assigneeUsername),
        assigned: Boolean(String(task.assigneeUsername || '').trim()),
      },
    });
  } catch (error) {
    if (String(error?.message || '') === 'ticktick-token-invalid') {
      await clearToken();
      return res.status(401).json({
        ok: false,
        connected: false,
        configured: true,
        connectUrl: '/api/ticktick/connect',
        error: 'ticktick-reconnect-required',
      });
    }
    console.error('RUDI_TICKTICK_NEXT_ERROR', String(error?.message || error));
    return res.status(502).json({ ok: false, connected: true, error: 'ticktick-unavailable' });
  }
};
