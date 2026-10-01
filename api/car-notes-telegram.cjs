const { waitUntil } = require('@vercel/functions');
const { allowedActor } = require('./rudi-access.cjs');
const { addCarNote } = require('./car-store.cjs');
const { appendActivity } = require('./activity-journal-store.cjs');

function messageOf(req) {
  return req?.body?.message || null;
}

function parseCarNoteCommand(message) {
  const raw = String(message?.text || message?.caption || '').trim();
  if (!raw) return { matched:false, text:'' };
  const match = raw.match(/^сохрани\s+в\s+авто\s+заметки(?=$|\s|[:.,!;?\-–—])(?:\s*[:.,;\-–—]?\s*)([\s\S]*)$/iu);
  if (!match) return { matched:false, text:'' };
  return { matched:true, text:String(match[1] || '').trim() };
}

function canHandleCarNoteTelegram(req) {
  const message = messageOf(req);
  if (!message || message.from?.is_bot === true || message.chat?.type !== 'private') return false;
  if (!allowedActor(message.from)) return false;
  return parseCarNoteCommand(message).matched;
}

async function send(token, chatId, text, fetchImpl) {
  if (!token || !chatId) return null;
  return fetchImpl('https://api.telegram.org/bot' + token + '/sendMessage', {
    method:'POST',
    headers:{ 'content-type':'application/json' },
    body:JSON.stringify({
      chat_id:chatId,
      text:String(text || '').slice(0,3500),
      disable_web_page_preview:true,
    }),
  }).catch(() => null);
}

async function processCarNoteTelegram(req, options = {}) {
  const message = messageOf(req);
  const actor = allowedActor(message?.from);
  const parsed = parseCarNoteCommand(message);
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  if (!parsed.matched) return null;

  if (actor !== 'Рустам') {
    await send(options.token, message?.chat?.id, 'Авто-заметки доступны только Рустаму.', fetchImpl);
    return { saved:false, skipped:'actor-not-allowed' };
  }

  if (!parsed.text) {
    await send(options.token, message?.chat?.id, 'Что сохранить в авто-заметки? Напиши текст после команды.', fetchImpl);
    return { saved:false, skipped:'empty-note' };
  }

  const result = await addCarNote(parsed.text, options);
  await appendActivity({
    type:'car-note',
    actor,
    text:actor + ' добавил заметку по машине',
    icon:'🚗',
    targetTab:'car',
  }, options).catch(() => null);

  await send(
    options.token,
    message.chat.id,
    'Сохранено в Машина → Заметки\n' + parsed.text.slice(0,500),
    fetchImpl
  );

  return { saved:true, note:result.note, state:result.state };
}

function scheduleCarNoteTelegram(req, options = {}) {
  if (!canHandleCarNoteTelegram(req)) return false;
  const task = processCarNoteTelegram(req, options).catch(async (error) => {
    console.error('RUDI_CAR_NOTE_TELEGRAM_ERROR', String(error?.message || error));
    const message = messageOf(req);
    await send(
      options.token,
      message?.chat?.id,
      String(error?.message || '') === 'car-note-invalid'
        ? 'Не удалось сохранить заметку. Проверь текст и попробуй ещё раз.'
        : 'Не удалось сохранить авто-заметку. Попробуй отправить ещё раз.',
      options.fetchImpl || globalThis.fetch
    );
  });
  try { waitUntil(task); } catch { task.catch(() => {}); }
  return true;
}

module.exports = {
  messageOf,
  parseCarNoteCommand,
  canHandleCarNoteTelegram,
  processCarNoteTelegram,
  scheduleCarNoteTelegram,
};
