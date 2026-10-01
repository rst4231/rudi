const { waitUntil } = require('@vercel/functions');
const { allowedActor } = require('./rudi-access.cjs');
const { addCarNote } = require('./car-store.cjs');
const { appendActivity } = require('./activity-journal-store.cjs');

function messageOf(req) {
  return req?.body?.message || null;
}

const CAR_NOTE_COMMAND_PATTERNS = [
  /^сохрани\s+в\s+авто\s+заметк(?:у|и)(?=$|\s|[:.,!;?…\-–—])/iu,
  /^сохрани\s+в\s+заметк(?:у|и)\s+авто(?=$|\s|[:.,!;?…\-–—])/iu,
  /^сохрани\s+в\s+заметк(?:у|и)\s+машины(?=$|\s|[:.,!;?…\-–—])/iu,
  /^добавь\s+в\s+авто\s+заметк(?:у|и)(?=$|\s|[:.,!;?…\-–—])/iu,
  /^добавь\s+в\s+заметк(?:у|и)\s+машины(?=$|\s|[:.,!;?…\-–—])/iu,
  /^добавь\s+заметк(?:у|и)\s+по\s+машине(?=$|\s|[:.,!;?…\-–—])/iu,
  /^запиши\s+в\s+авто\s+заметк(?:у|и)(?=$|\s|[:.,!;?…\-–—])/iu,
  /^запиши\s+в\s+заметк(?:у|и)\s+машины(?=$|\s|[:.,!;?…\-–—])/iu,
  /^закинь\s+в\s+заметк(?:у|и)\s+машины(?=$|\s|[:.,!;?…\-–—])/iu,
  /^кинь\s+в\s+авто\s+заметк(?:у|и)(?=$|\s|[:.,!;?…\-–—])/iu,
  /^сохрани\s+это\s+по\s+машине(?=$|\s|[:.,!;?…\-–—])/iu,
  /^запомни\s+по\s+машине(?=$|\s|[:.,!;?…\-–—])/iu,
  /^запиши\s+по\s+машине(?=$|\s|[:.,!;?…\-–—])/iu,
  /^сохрани\s+по\s+машине(?=$|\s|[:.,!;?…\-–—])/iu,
  /^для\s+машины\s+сохрани(?=$|\s|[:.,!;?…\-–—])/iu,
  /^по\s+машине\s+сохрани(?=$|\s|[:.,!;?…\-–—])/iu,
  /^сохрани\s+для\s+машины(?=$|\s|[:.,!;?…\-–—])/iu,
  /^добавь\s+для\s+машины(?=$|\s|[:.,!;?…\-–—])/iu,
  /^заметка\s+по\s+машине(?=$|\s|[:.,!;?…\-–—])/iu,
  /^заметка\s+в\s+авто(?=$|\s|[:.,!;?…\-–—])/iu,
  /^авто\s+заметка(?=$|\s|[:.,!;?…\-–—])/iu,
  /^в\s+заметк(?:у|и)\s+авто(?=$|\s|[:.,!;?…\-–—])/iu,
  /^в\s+заметк(?:у|и)\s+машины(?=$|\s|[:.,!;?…\-–—])/iu,
  /^добавь\s+в\s+авто(?=$|\s|[:.,!;?…\-–—])/iu,
];

function parseCarNoteCommand(message) {
  const raw = String(message?.text || message?.caption || '').trim();
  if (!raw) return { matched:false, text:'' };
  for (const pattern of CAR_NOTE_COMMAND_PATTERNS) {
    const match = raw.match(pattern);
    if (!match) continue;
    const text = raw.slice(match[0].length).replace(/^\s*[:.,;!?…\-–—]?\s*/u, '').trim();
    return { matched:true, text };
  }
  return { matched:false, text:'' };
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
  CAR_NOTE_COMMAND_PATTERNS,
  parseCarNoteCommand,
  canHandleCarNoteTelegram,
  processCarNoteTelegram,
  scheduleCarNoteTelegram,
};
