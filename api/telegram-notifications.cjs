const { resolveTelegramBotToken } = require('./products-bought.cjs');
const { readRecipients } = require('./partner-notification-store.cjs');

const DEFAULT_APP_URL = 'https://spb-daily-guide-bot.vercel.app';

function escapeTelegramHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function appUrlForTab(tab, options = {}) {
  const base = String(options.appUrl || options.env?.RUDI_APP_URL || process.env.RUDI_APP_URL || DEFAULT_APP_URL).trim();
  const url = new URL(base);
  if (tab) url.searchParams.set('tab', String(tab));
  return url.toString();
}

async function telegramSendMessage(chatId, text, options = {}) {
  const token = options.botToken || resolveTelegramBotToken(options.env || process.env);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const payload = {
    chat_id: chatId,
    text: String(text || '').trim(),
    parse_mode: options.parseMode === false ? undefined : 'HTML',
    disable_notification: Boolean(options.disableNotification),
  };
  if (options.buttonText && options.tab) {
    payload.reply_markup = {
      inline_keyboard: [[{
        text: String(options.buttonText),
        web_app: { url: appUrlForTab(options.tab, options) },
      }]],
    };
  }

  const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => null);
  if (!response?.ok || !data?.ok) {
    throw new Error(`telegram-sendMessage-http-${response?.status || 0}`);
  }
  return {
    chatId: Number(chatId),
    messageId: Number(data?.result?.message_id) || null,
  };
}

async function telegramDeleteMessage(chatId, messageId, options = {}) {
  const token = options.botToken || resolveTelegramBotToken(options.env || process.env);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const response = await fetchImpl(`https://api.telegram.org/bot${token}/deleteMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
  });
  if (response?.ok) return true;
  let detail = '';
  try { detail = await response.text(); } catch {}
  if (response?.status === 400 && /message to delete not found|MESSAGE_ID_INVALID|message can't be deleted/iu.test(detail)) {
    return false;
  }
  throw new Error(`telegram-deleteMessage-http-${response?.status || 0}`);
}

async function sendToAllRecipients(text, options = {}) {
  const recipients = options.recipients || await readRecipients(options);
  const sent = [];
  for (const actor of ['Рустам', 'Диана']) {
    const chatId = Number(recipients?.[actor]);
    if (!Number.isInteger(chatId) || chatId <= 0) continue;
    const message = typeof text === 'function' ? text(actor) : text;
    if (!String(message || '').trim()) continue;
    sent.push({
      actor,
      ...(await telegramSendMessage(chatId, message, options)),
    });
  }
  return sent;
}

module.exports = {
  DEFAULT_APP_URL,
  escapeTelegramHtml,
  appUrlForTab,
  telegramSendMessage,
  telegramDeleteMessage,
  sendToAllRecipients,
};
