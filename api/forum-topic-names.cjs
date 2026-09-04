const { loadForumTopicsConfig } = require('./forum-topics-config.cjs');

async function editForumTopic(fetchImpl, token, chatId, messageThreadId, name) {
  const response = await fetchImpl(`https://api.telegram.org/bot${token}/editForumTopic`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_thread_id: messageThreadId, name }),
  });
  if (response?.ok) return true;
  let detail = '';
  try { detail = await response.clone().text(); } catch {}
  if (/topic[_ ]not[_ ]modified|TOPIC_NOT_MODIFIED/i.test(detail)) return true;
  throw new Error(`Telegram editForumTopic failed: HTTP ${response?.status || 0}${detail ? ` ${detail}` : ''}`);
}

async function syncConfiguredForumTopicNames(options = {}) {
  const token = String(options.token || '').trim();
  const chatId = options.chatId;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (!token) throw new Error('Telegram bot token is required');
  if (chatId === undefined || chatId === null || chatId === '') throw new Error('Telegram forum chat id is required');
  if (typeof fetchImpl !== 'function') throw new Error('fetch is required');

  const config = options.config || await loadForumTopicsConfig({ fetchImpl: options.configFetchImpl || fetchImpl });
  const rows = [
    [config.clients, config.names?.clients],
    [config.labor, config.names?.labor],
  ].filter(([, name]) => typeof name === 'string' && name.trim());

  for (const [topicId, name] of rows) {
    await editForumTopic(fetchImpl, token, chatId, topicId, name.trim());
  }
  return { updated: rows.map(([topicId, name]) => ({ topicId, name: name.trim() })) };
}

module.exports = { editForumTopic, syncConfiguredForumTopicNames };
