const CACHE_TTL_SECONDS = 60 * 60 * 24 * 3650;
const LABOR_TOPIC_NAME = 'Трудовой кодекс';
const LABOR_SOURCE_URL = 'https://www.consultant.ru/document/cons_doc_LAW_34683/';
const LABOR_ROTATION_START = '2026-08-20';
const RECENT_ARTICLE_LIMIT = 30;

const LABOR_ARTICLES = [
  ['contract','Трудовой договор: что проверить до подписи','В договоре должны быть зафиксированы ключевые условия работы: трудовая функция, место работы, условия оплаты и другие обязательные сведения. Не соглашайтесь на устные обещания по зарплате или графику, если они важны для вас.','ст. 57 ТК РФ'],
  ['probation','Испытательный срок: когда он законен','Условие об испытании действует только тогда, когда оно включено в трудовой договор. Для отдельных категорий работников испытание запрещено, а общий срок ограничен законом.','ст. 70 ТК РФ'],
  ['probation-dismissal','Увольнение на испытательном сроке','Неудовлетворительный результат испытания нельзя оформить одной фразой. Работодатель должен письменно предупредить сотрудника и указать причины, по которым испытание не пройдено.','ст. 71 ТК РФ'],
  ['salary-date','Когда должна приходить зарплата','Заработная плата выплачивается не реже чем каждые полмесяца. Конкретные даты должны быть закреплены в правилах, коллективном или трудовом договоре.','ст. 136 ТК РФ'],
  ['salary-delay','Что делать при задержке зарплаты','При задержке выплаты работнику положена денежная компенсация. При длительной задержке закон в определённых случаях позволяет приостановить работу после письменного уведомления работодателя.','ст. 236, 142 ТК РФ'],
  ['overtime','Сверхурочная работа: не просто задержаться вечером','Сверхурочной считается работа по инициативе работодателя сверх установленной продолжительности рабочего времени. Для неё есть ограничения и повышенная оплата либо компенсация временем отдыха.','ст. 99, 152 ТК РФ'],
  ['weekend-work','Работа в выходной день','Привлечение к работе в выходные и праздники допускается не всегда и обычно требует оформления. Такая работа компенсируется повышенной оплатой или другим днём отдыха по правилам ТК РФ.','ст. 113, 153 ТК РФ'],
  ['annual-leave','Ежегодный оплачиваемый отпуск','Базовая продолжительность ежегодного оплачиваемого отпуска составляет 28 календарных дней. Для некоторых работников предусмотрен более длинный основной или дополнительный отпуск.','ст. 115 ТК РФ'],
  ['leave-schedule','График отпусков: зачем он нужен','График отпусков обязателен и для работодателя, и для работника. О времени начала отпуска сотрудника должны известить заранее в установленный законом срок.','ст. 123 ТК РФ'],
  ['leave-pay','Когда должны выплатить отпускные','Оплата отпуска должна быть произведена заранее в срок, установленный Трудовым кодексом. Если деньги приходят позже, это может повлечь обязанность работодателя выплатить компенсацию за задержку.','ст. 136, 236 ТК РФ'],
  ['unused-leave','Компенсация за неиспользованный отпуск','При увольнении работнику выплачивается денежная компенсация за все неиспользованные отпуска. Обычной заменой всего ежегодного отпуска деньгами во время работы закон не является.','ст. 126, 127 ТК РФ'],
  ['resignation','Увольнение по собственному желанию','Работник вправе расторгнуть трудовой договор, письменно предупредив работодателя. В отдельных ситуациях закон позволяет прекратить работу в дату, указанную сотрудником, без ожидания общего срока предупреждения.','ст. 80 ТК РФ'],
  ['dismissal-order','Что должны выдать при увольнении','В день прекращения трудового договора работодатель должен оформить увольнение, произвести расчёт и выдать предусмотренные законом документы и сведения о трудовой деятельности.','ст. 84.1, 140 ТК РФ'],
  ['redundancy','Сокращение штата: базовые гарантии','Сокращение требует соблюдения процедуры: предупреждения, оценки доступных вакансий и предусмотренных законом выплат. Формальное переименование должности само по себе не заменяет законную процедуру.','ст. 178, 180 ТК РФ'],
  ['severance','Когда положено выходное пособие','Выходное пособие выплачивается не при любом увольнении. Основание и размер зависят от причины прекращения договора и гарантий, установленных ТК РФ или договором.','ст. 178 ТК РФ'],
  ['discipline','Дисциплинарное взыскание: замечание, выговор, увольнение','До применения дисциплинарного взыскания работодатель должен соблюдать процедуру и запросить письменное объяснение. За один проступок применяется одно дисциплинарное взыскание.','ст. 192, 193 ТК РФ'],
  ['fine','Можно ли штрафовать сотрудника','Трудовой кодекс не предусматривает денежный штраф как дисциплинарное взыскание. Но премия может зависеть от условий локального положения, если система премирования оформлена законно.','ст. 192, 135 ТК РФ'],
  ['material-liability','Материальная ответственность работника','Сотрудник отвечает за прямой действительный ущерб в пределах и случаях, установленных законом. Упущенную выгоду с работника по общему правилу взыскать нельзя.','ст. 238 ТК РФ'],
  ['full-liability','Полная материальная ответственность','Полная материальная ответственность возникает только в предусмотренных законом случаях. Один лишь пункт в обычном трудовом договоре не делает любого сотрудника полностью материально ответственным.','ст. 242, 243 ТК РФ'],
  ['working-time','Нормальная продолжительность рабочего времени','Нормальная продолжительность рабочего времени не может превышать установленный законом недельный предел. Для некоторых категорий работников действует сокращённое рабочее время.','ст. 91, 92 ТК РФ'],
  ['part-time','Неполное рабочее время','Неполный рабочий день или неделя могут устанавливаться соглашением сторон, а в ряде случаев работодатель обязан удовлетворить просьбу работника. Оплата обычно идёт пропорционально отработанному времени или объёму работ.','ст. 93 ТК РФ'],
  ['night-work','Работа ночью','Ночным считается специальный период времени, установленный ТК РФ. Продолжительность и доплата за ночную работу регулируются законом и локальными актами работодателя.','ст. 96, 154 ТК РФ'],
  ['break','Перерыв на обед','В течение рабочего дня сотруднику предоставляется перерыв для отдыха и питания. Обычно он не включается в рабочее время, а его конкретная продолжительность устанавливается правилами работодателя.','ст. 108 ТК РФ'],
  ['remote','Дистанционная работа','Удалённая работа должна быть оформлена трудовым договором или дополнительным соглашением. В нём важно закрепить порядок взаимодействия, режим работы, оборудование и компенсации расходов.','гл. 49.1 ТК РФ'],
  ['personal-data','Персональные данные работника','Работодатель обязан обрабатывать данные сотрудника только для законных целей и соблюдать правила их хранения, передачи и защиты. Доступ к данным не должен быть бесконтрольным.','гл. 14 ТК РФ'],
  ['sick-leave','Больничный и трудовые отношения','Временная нетрудоспособность подтверждается установленным порядком. Сам факт болезни не является прогулом, если отсутствие оформлено надлежащим образом.','ст. 183 ТК РФ'],
  ['vacation-sick','Если заболел во время отпуска','Ежегодный оплачиваемый отпуск в предусмотренных законом случаях продлевается или переносится, в том числе при временной нетрудоспособности самого работника.','ст. 124 ТК РФ'],
  ['business-trip','Командировка: что компенсируют','При направлении в служебную командировку за работником сохраняются место работы и средний заработок, а связанные с поездкой расходы возмещаются по установленным правилам.','ст. 167, 168 ТК РФ'],
  ['training','Обучение за счёт работодателя','Если работодатель оплачивает обучение, условия возможной отработки и возмещения затрат должны быть оформлены корректно. Требовать любые суммы автоматически нельзя: учитываются условия договора и фактически неотработанное время.','ст. 196, 199, 249 ТК РФ'],
  ['combination','Совмещение и дополнительная работа','Дополнительная работа по другой или той же профессии в течение рабочего дня требует письменного согласия и доплаты. Её объём, срок и размер доплаты определяются соглашением сторон.','ст. 60.2, 151 ТК РФ'],
  ['second-job','Работа по совместительству','Совместительство оформляется отдельным трудовым договором и выполняется в свободное от основной работы время. Для него действуют специальные ограничения по продолжительности работы.','гл. 44 ТК РФ'],
  ['transfer','Перевод на другую работу','Постоянный перевод на другую работу обычно требует письменного согласия сотрудника. Временные переводы без согласия возможны только в ограниченных законом ситуациях.','ст. 72.1, 72.2 ТК РФ'],
  ['conditions-change','Изменение условий трудового договора','Работодатель не может произвольно менять существенные условия договора. Для организационных или технологических изменений предусмотрена отдельная процедура и предварительное уведомление.','ст. 74 ТК РФ'],
  ['downtime','Простой на работе','Простой — временная приостановка работы по причинам экономического, технического или организационного характера. Порядок оплаты зависит от причины простоя и того, по чьей вине он возник.','ст. 72.2, 157 ТК РФ'],
  ['workplace-safety','Охрана труда: базовое право работника','Работник имеет право на безопасные условия труда и информацию о рисках. Работодатель обязан организовать систему охраны труда, обучение и необходимые меры защиты.','разд. X ТК РФ'],
  ['medical-exam','Обязательные медосмотры','Для некоторых работ предварительные и периодические медицинские осмотры обязательны. В установленных законом случаях они проводятся за счёт работодателя.','ст. 220 ТК РФ'],
  ['pregnancy','Гарантии беременным работницам','Для беременных работников предусмотрены специальные гарантии при трудоустройстве, переводе, режиме работы и увольнении. Обычные правила здесь часто имеют исключения.','ст. 64, 254, 261 ТК РФ'],
  ['parents','Гарантии родителям маленьких детей','Для родителей и других лиц с семейными обязанностями ТК РФ предусматривает отдельные гарантии по режиму работы, отпускам и ограничениям на привлечение к отдельным видам работ.','гл. 41 ТК РФ'],
  ['minor','Работа несовершеннолетних','Для работников до 18 лет действуют сокращённое рабочее время, ограничения по видам работ и дополнительные гарантии при отпуске и увольнении.','гл. 42 ТК РФ'],
  ['discrimination','Дискриминация в сфере труда','Ограничения при найме и работе должны быть связаны с деловыми качествами сотрудника или прямо допускаться законом. Необоснованная дискриминация в сфере труда запрещена.','ст. 3, 64 ТК РФ'],
];

function getRuntimeCache() {
  const { getCache } = require('@vercel/functions');
  return getCache({ namespace: 'rudi-labor-code-v1' });
}

function dateKeyInMoscow(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function dayNumberFromDateKey(key) {
  const [year, month, day] = String(key).split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

async function telegramCall(token, method, payload, fetchImpl) {
  const response = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  if (!response.ok) {
    let detail = '';
    try { detail = await response.text(); } catch {}
    const error = new Error(`Telegram ${method} failed: HTTP ${response.status}${detail ? ` ${detail}` : ''}`);
    error.detail = detail;
    throw error;
  }
  return response.json();
}

async function ensureLaborTopic({ token, chatId, cache, fetchImpl }) {
  const cached = Number(await cache.get('labor:topic-id'));
  if (Number.isInteger(cached) && cached > 0) return cached;
  const result = await telegramCall(token, 'createForumTopic', { chat_id: chatId, name: LABOR_TOPIC_NAME }, fetchImpl);
  const topicId = Number(result?.result?.message_thread_id);
  if (!Number.isInteger(topicId) || topicId <= 0) throw new Error('Telegram createForumTopic did not return message_thread_id');
  await cache.set('labor:topic-id', topicId, { ttl: CACHE_TTL_SECONDS, tags: ['rudi-labor-topic'] });
  return topicId;
}

function allArticleVariants() {
  return LABOR_ARTICLES.map(([baseId, title, body, reference]) => ({
    id: `${baseId}:worker`,
    baseId,
    angleId: 'worker',
    text: `⚖️ <b>Трудовой кодекс</b>\n\n<b>${title}</b>\n\n${body}\n\n📘 ${reference}\n<a href="${LABOR_SOURCE_URL}">Актуальная редакция ТК РФ →</a>`,
  }));
}

function selectArticleForDate(value = new Date(), options = {}) {
  const variants = allArticleVariants();
  if (!variants.length) return null;
  const excluded = new Set(Array.isArray(options.excludeIds) ? options.excludeIds.filter(Boolean) : []);
  const today = dayNumberFromDateKey(dateKeyInMoscow(value));
  const start = dayNumberFromDateKey(LABOR_ROTATION_START);
  const primaryIndex = ((today - start) % variants.length + variants.length) % variants.length;
  for (let step = 0; step < variants.length; step += 1) {
    const candidate = variants[(primaryIndex + step) % variants.length];
    if (!excluded.has(candidate.id)) return candidate;
  }
  return null;
}

async function readArticleHistory(cache) {
  const [usedStored, recentStored] = await Promise.all([
    cache.get('labor:used-article-ids'),
    cache.get('labor:recent-article-ids'),
  ]);
  const used = new Set(Array.isArray(usedStored) ? usedStored.filter(Boolean) : []);
  const recent = Array.isArray(recentStored) ? recentStored.filter(Boolean) : [];
  return { used, recent };
}

async function recordArticlePublication(cache, articleId, todayKey, messageId, topicId, history) {
  history.used.add(articleId);
  const recent = [...history.recent.filter((id) => id !== articleId), articleId].slice(-RECENT_ARTICLE_LIMIT);
  await Promise.all([
    cache.set('labor:used-article-ids', [...history.used], { ttl: CACHE_TTL_SECONDS, tags: ['rudi-labor-history'] }),
    cache.set('labor:recent-article-ids', recent, { ttl: CACHE_TTL_SECONDS, tags: ['rudi-labor-history'] }),
    cache.set(`labor:published:${todayKey}`, articleId, { ttl: CACHE_TTL_SECONDS, tags: ['rudi-labor-history'] }),
    cache.set(`labor:message:${todayKey}`, { articleId, messageId, topicId }, { ttl: CACHE_TTL_SECONDS, tags: ['rudi-labor-history'] }),
  ]);
}

async function publishLaborArticle(options = {}) {
  const token = String(options.token || '').trim();
  const chatId = options.chatId;
  if (!token) throw new Error('Telegram bot token is required for labor articles');
  if (chatId === undefined || chatId === null || chatId === '') throw new Error('Telegram forum chat id is required for labor articles');
  const cache = options.cache || getRuntimeCache();
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const now = options.now || new Date();
  const todayKey = dateKeyInMoscow(now);
  const publishedKey = `labor:published:${todayKey}`;
  const already = await cache.get(publishedKey);
  const alreadyId = typeof already === 'string' ? already : already?.articleId;
  if (already && options.force !== true) return { skipped: true, articleId: alreadyId || already };

  const history = await readArticleHistory(cache);
  const explicitExcludes = Array.isArray(options.excludeIds) ? options.excludeIds.filter(Boolean) : [];
  const exclusions = new Set([...history.used, ...history.recent, ...explicitExcludes]);
  if (options.force === true && alreadyId) exclusions.add(alreadyId);
  let next = selectArticleForDate(now, { excludeIds: [...exclusions] });
  if (!next) {
    next = selectArticleForDate(now, { excludeIds: [...new Set([...history.recent, ...explicitExcludes, alreadyId].filter(Boolean))] });
  }
  if (!next) return { skipped: true, reason: 'article-pool-exhausted' };

  let topicId = await ensureLaborTopic({ token, chatId, cache, fetchImpl });
  let sent;
  try {
    sent = await telegramCall(token, 'sendMessage', {
      chat_id: chatId, message_thread_id: topicId, text: next.text,
      parse_mode: 'HTML', disable_web_page_preview: true,
    }, fetchImpl);
  } catch (error) {
    if (!/TOPIC_ID_INVALID|message thread not found|topic.*not found/i.test(String(error.detail || error.message))) throw error;
    await cache.delete('labor:topic-id');
    topicId = await ensureLaborTopic({ token, chatId, cache, fetchImpl });
    sent = await telegramCall(token, 'sendMessage', {
      chat_id: chatId, message_thread_id: topicId, text: next.text,
      parse_mode: 'HTML', disable_web_page_preview: true,
    }, fetchImpl);
  }

  const messageId = Number(sent?.result?.message_id);
  await recordArticlePublication(cache, next.id, todayKey, Number.isInteger(messageId) ? messageId : null, topicId, history);
  return { articleId: next.id, topicId, messageId: Number.isInteger(messageId) ? messageId : null };
}

async function replaceLaborArticle(options = {}) {
  return publishLaborArticle({ ...options, force: true });
}

module.exports = {
  LABOR_ARTICLES,
  LABOR_TOPIC_NAME,
  allArticleVariants,
  selectArticleForDate,
  publishLaborArticle,
  replaceLaborArticle,
  ensureLaborTopic,
  dateKeyInMoscow,
};