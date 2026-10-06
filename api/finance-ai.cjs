const { createHash } = require('node:crypto');
const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const MODEL = 'openai/gpt-oss-20b';
const NAMESPACE = 'rudi-finance-ai-v1';
const ARTICLE_TTL = 60 * 60 * 24 * 180;
const INSIGHT_TTL = 60 * 60 * 24 * 365;

const BOOKS = [
  'Морган Хаузел — Психология денег',
  'Джордж Клейсон — Самый богатый человек в Вавилоне',
  'Томас Стэнли и Уильям Данко — Ваш сосед — миллионер',
  'Вики Робин и Джо Домингес — Кошелёк или жизнь',
  'Джон Богл — Руководство разумного инвестора',
  'Бертон Малкил — Случайная прогулка по Уолл-стрит',
  'Бенджамин Грэм — Разумный инвестор',
  'Рамит Сети — Я научу вас быть богатыми',
  'Карл Ричардс — Разрыв в поведении',
  'Джей Эл Коллинз — Простой путь к богатству',
];

function cacheOf(options = {}) {
  return options.financeAiCache || options.cache || createStrictRuntimeCache({
    namespace: NAMESPACE,
    ...(options.cacheOptions || {}),
  });
}
function clean(value, max = 8000) {
  return String(value || '').replace(/\r\n?/g, '\n').trim().slice(0, max);
}
function normalized(value) {
  return clean(value, 900).normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
}
function tokenSet(value) {
  const stop = new Set(['который','которая','которые','этого','этот','эта','как','для','при','или','что','это','если','можно','нужно','деньги','финансы']);
  return new Set(normalized(value).split(' ').filter((word) => word.length > 3 && !stop.has(word)));
}
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const item of a) if (b.has(item)) overlap += 1;
  return overlap / new Set([...a, ...b]).size;
}
function tooSimilar(article, history = []) {
  const current = tokenSet(String(article?.title || '') + ' ' + String(article?.summary || ''));
  return history.some((item) => {
    const old = tokenSet(String(item?.title || '') + ' ' + String(item?.summary || ''));
    return jaccard(current, old) >= 0.4 || (normalized(article?.topicKey) && normalized(article?.topicKey) === normalized(item?.topicKey));
  });
}
function moscowDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return map.year + '-' + map.month + '-' + map.day;
}
function booksForDate(date, attempt = 0) {
  const hash = createHash('sha256').update(String(date) + ':' + attempt).digest();
  const first = hash[0] % BOOKS.length;
  const second = (first + 1 + (hash[1] % (BOOKS.length - 1))) % BOOKS.length;
  const third = (second + 1 + (hash[2] % (BOOKS.length - 1))) % BOOKS.length;
  return [BOOKS[first], BOOKS[second], BOOKS[third]].filter((value, index, all) => all.indexOf(value) === index).slice(0, 3);
}
function responseText(payload) {
  return clean(payload?.choices?.[0]?.message?.content, 12000);
}
function parseJson(text) {
  const raw = String(text || '').trim().replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  if (!raw) throw new Error('finance-ai-empty');
  return JSON.parse(raw);
}
async function groqJson(prompt, schema, options = {}) {
  const env = options.env || process.env;
  const apiKey = clean(options.apiKey || env.GROQ_API_KEY, 500);
  if (!apiKey) throw new Error('groq-api-key-missing');
  const fetchImpl = options.fetch || global.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('finance-ai-fetch-unavailable');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(5000, Number(options.timeoutMs) || 14000));
  try {
    const response = await fetchImpl('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        reasoning_effort: 'low',
        include_reasoning: false,
        temperature: 0.9,
        max_completion_tokens: 1800,
        stream: false,
        response_format: { type: 'json_schema', json_schema: { name: 'rudi_finance', strict: true, schema } },
      }),
    });
    if (!response.ok) throw new Error('finance-ai-provider');
    return parseJson(responseText(await response.json()));
  } finally {
    clearTimeout(timer);
  }
}

const FALLBACKS = [
  ['pay-yourself-first','Почему сначала стоит платить себе','Накопления лучше работают, когда становятся обязательным платежом, а не остатком в конце месяца.','Одна из самых устойчивых идей личных финансов проста: накопления не должны зависеть от того, что случайно останется к концу месяца. Если сбережения стоят последними в очереди, почти всегда находится причина потратить деньги раньше.\n\nПрактичнее заранее определить долю дохода, которая автоматически уходит в резерв или на финансовую цель. Такой подход снижает количество ежедневных решений и превращает накопление из редкого усилия в систему.\n\nРазмер доли не обязан быть большим с первого месяца. Важнее регулярность и постепенный рост вместе с доходом. Так финансовая устойчивость создаётся не одним сильным месяцем, а повторяемым поведением.',['Джордж Клейсон — Самый богатый человек в Вавилоне','Рамит Сети — Я научу вас быть богатыми']],
  ['behavior-over-iq','Почему поведение важнее финансового IQ','Знание формул не помогает, если решения регулярно принимаются под влиянием страха, азарта или сравнения с другими.','Финансовые результаты редко определяются только уровнем знаний. Можно понимать проценты, инфляцию и рынки, но всё равно принимать плохие решения, если деньги вызывают сильные эмоции.\n\nПоэтому полезнее строить систему, которая защищает от собственных импульсов: держать резерв, не концентрировать весь капитал в одной ставке, заранее определять допустимый риск и не менять план из-за каждого движения рынка.\n\nХорошая финансовая стратегия должна быть не только математически разумной, но и психологически выполнимой. План, которого человек способен придерживаться годами, обычно ценнее более красивого плана, который ломается при первом стрессе.',['Морган Хаузел — Психология денег','Карл Ричардс — Разрыв в поведении']],
  ['lifestyle-inflation','Как рост дохода незаметно съедает прогресс','Если расходы растут вслед за каждым повышением дохода, финансовая свобода может не приближаться вообще.','Увеличение дохода само по себе не гарантирует роста капитала. Часто вместе с доходом растёт и привычный уровень расходов: жильё, техника, рестораны, поездки и регулярные подписки.\n\nПроблема не в самих тратах, а в том, что разница между доходом и расходами остаётся прежней. Именно эта разница создаёт резерв, инвестиционный капитал и свободу выбора.\n\nПолезное правило: после роста дохода повышать качество жизни медленнее, чем растёт сам доход. Тогда часть улучшения остаётся в настоящем, а часть превращается в будущую свободу.',['Томас Стэнли и Уильям Данко — Ваш сосед — миллионер','Вики Робин и Джо Домингес — Кошелёк или жизнь']],
  ['emergency-fund','Зачем подушка, если деньги могли бы работать','Резерв нужен не ради доходности, а чтобы плохой месяц не заставил принимать дорогие решения.','Свободные деньги часто хочется немедленно отправить туда, где они потенциально принесут доход. Но финансовая подушка решает другую задачу: она защищает план от непредвиденных расходов и временного падения дохода.\n\nБез резерва любая поломка, болезнь или пауза в работе может вынудить продавать активы в неудачный момент или брать дорогой долг. Поэтому часть капитала имеет смысл оценивать не по проценту доходности, а по объёму свободы, которую она создаёт.\n\nХорошая подушка уменьшает зависимость от срочных решений. Это делает всю финансовую систему устойчивее.',['Морган Хаузел — Психология денег','Вики Робин и Джо Домингес — Кошелёк или жизнь']],
  ['fees-compounding','Почему маленькие комиссии имеют большое значение','Небольшая ежегодная комиссия кажется мелочью, но на длинном горизонте она постоянно отнимает часть сложного процента.','В инвестициях издержки редко выглядят драматично в отдельный месяц. Проблема проявляется на длинном горизонте: комиссия списывается снова и снова, а потерянные деньги уже не участвуют в дальнейшем росте капитала.\n\nПоэтому сравнивать стратегии полезно не только по ожидаемой доходности, но и по тому, сколько они стоят в обслуживании. Чем чаще сделки, выше комиссии и сложнее структура, тем больше барьер, который стратегия должна преодолеть.\n\nНизкие издержки не гарантируют результат, но оставляют инвестору большую долю того, что заработал рынок.',['Джон Богл — Руководство разумного инвестора','Бертон Малкил — Случайная прогулка по Уолл-стрит']],
  ['debt-interest','Почему дорогой долг тормозит накопления','Высокий процент по долгу создаёт отрицательный сложный процент, который работает против владельца капитала.','Сложный процент обычно обсуждают как двигатель роста капитала, но у долга есть зеркальная версия того же эффекта. Чем выше ставка и дольше срок, тем больше будущего денежного потока заранее принадлежит кредитору.\n\nПоэтому дорогой долг конкурирует с накоплениями за каждый свободный рубль. Иногда финансово разумнее сначала снизить гарантированную стоимость долга, чем искать неопределённую доходность на рынке.\n\nПолезно отдельно видеть все обязательства, их ставки и сроки. Уже одна прозрачность часто меняет приоритеты расходов.',['Рамит Сети — Я научу вас быть богатыми','Джордж Клейсон — Самый богатый человек в Вавилоне']],
  ['margin-of-safety','Финансовый запас важнее точного прогноза','Система становится устойчивее, когда в ней есть место для ошибок, а не когда прогноз кажется идеальным.','Люди часто строят финансовые планы так, будто доходы, расходы и рынки будут вести себя примерно по сценарию. Но реальные проблемы возникают именно тогда, когда несколько неприятных событий совпадают.\n\nЗапас прочности означает, что бюджет выдержит перерасход, инвестиционный план переживёт просадку, а обязательства не требуют идеального месяца каждый раз. Это может выглядеть менее эффективно на бумаге, зато значительно повышает шансы пройти длинную дистанцию.\n\nФинансовая устойчивость часто покупается небольшой избыточностью: резервом, меньшим долгом и умеренными ожиданиями.',['Бенджамин Грэм — Разумный инвестор','Морган Хаузел — Психология денег']],
  ['automate-money','Почему автоматизация денег сильнее мотивации','Чем меньше полезных финансовых действий зависят от силы воли, тем стабильнее результат.','Мотивация меняется каждый день. Автоматические правила работают независимо от настроения: перевод части дохода в резерв, регулярное пополнение цели, своевременная оплата обязательных платежей.\n\nАвтоматизация снижает число моментов, когда приходится выбирать между текущим желанием и будущей целью. Это особенно важно для решений, эффект которых заметен только через месяцы или годы.\n\nХорошая финансовая система старается сделать правильное действие самым простым действием.',['Рамит Сети — Я научу вас быть богатыми','Вики Робин и Джо Домингес — Кошелёк или жизнь']],
  ['net-worth','Почему капитал важнее зарплаты','Высокий доход помогает, но финансовую свободу определяет то, какая часть дохода превращается в активы и остаётся с вами.','Доход показывает скорость поступления денег, но почти ничего не говорит о накопленном результате. Два человека с одинаковой зарплатой могут иметь совершенно разный уровень устойчивости, если один регулярно сохраняет часть дохода, а второй тратит всё.\n\nПолезно периодически смотреть на чистый капитал: активы минус обязательства. Этот показатель помогает увидеть, превращается ли работа в долгосрочную финансовую опору.\n\nГлавная цель не обязательно в максимальной зарплате. Важнее постепенно увеличивать долю ресурсов, которые продолжают работать на вас в будущем.',['Томас Стэнли и Уильям Данко — Ваш сосед — миллионер','Морган Хаузел — Психология денег']],
  ['simplicity','Почему простая финансовая система часто выигрывает','Сложность создаёт больше точек отказа, комиссий и поводов постоянно менять решение.','Сложные финансовые схемы выглядят умнее, но требуют больше контроля и чаще провоцируют ошибки. Чем больше счетов, инструментов и правил, тем сложнее понять, где на самом деле находится риск и сколько всё это стоит.\n\nПростая система легче автоматизируется, проверяется и выдерживает стресс. Она не обязана быть примитивной: важно, чтобы каждое её звено имело понятную функцию.\n\nЕсли стратегию трудно объяснить самому себе несколькими предложениями, это повод проверить, действительно ли вся сложность нужна.',['Джон Богл — Руководство разумного инвестора','Джей Эл Коллинз — Простой путь к богатству']],
  ['time-horizon','Почему горизонт важнее сегодняшнего шума','Краткосрочные движения цен становятся менее значимыми, когда решение строится вокруг многолетней цели.','Новости и котировки создают ощущение, что инвестору постоянно нужно что-то делать. Но чем длиннее финансовая цель, тем опаснее оценивать каждое решение по результату нескольких дней.\n\nДлинный горизонт позволяет сложному проценту работать и снижает значение отдельных неудачных периодов. Он не отменяет риск, но меняет критерий качества решения: важнее устойчивость стратегии, чем угадывание следующего движения.\n\nПолезно связывать инвестиционные решения с конкретным сроком и целью, а не с текущим настроением рынка.',['Бертон Малкил — Случайная прогулка по Уолл-стрит','Джон Богл — Руководство разумного инвестора']],
  ['enough','Почему полезно знать, что для тебя достаточно','Без понятия «достаточно» рост дохода легко превращается в бесконечную гонку потребления и риска.','Финансовые цели становятся опасно размытыми, если единственная цель звучит как «больше». Тогда любое повышение дохода быстро становится новой нормой, а желание ускорить рост капитала может толкать к лишнему риску.\n\nПонятие «достаточно» не означает отказ от амбиций. Оно задаёт границы: какой уровень расходов комфортен, какой резерв нужен, какой риск допустим и что уже не стоит ставить на кон ради дополнительной прибыли.\n\nТакие границы помогают использовать деньги как инструмент свободы, а не как бесконечный счёт соревнования.',['Морган Хаузел — Психология денег','Вики Робин и Джо Домингес — Кошелёк или жизнь']],
];

function fallbackArticle(date, history = []) {
  const used = new Set(history.map((item) => String(item?.topicKey || '')));
  const start = createHash('sha256').update(String(date)).digest()[0] % FALLBACKS.length;
  let picked = FALLBACKS[start];
  for (let offset = 0; offset < FALLBACKS.length; offset += 1) {
    const candidate = FALLBACKS[(start + offset) % FALLBACKS.length];
    if (!used.has(candidate[0])) { picked = candidate; break; }
  }
  return { date, topicKey:picked[0], title:picked[1], summary:picked[2], article:picked[3], books:picked[4], provider:'fallback', model:'' };
}

async function getFinanceLiteracyArticle(options = {}) {
  const now = options.now || new Date();
  const date = moscowDateKey(now);
  const cache = cacheOf(options);
  const key = 'article:' + date;
  const existing = await cache.get(key);
  if (existing?.title && existing?.article) return existing;
  const historyRaw = await cache.get('article-history');
  const history = Array.isArray(historyRaw) ? historyRaw.slice(-120) : [];
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const books = booksForDate(date, attempt);
    const used = history.slice(-70).map((item) => clean((item?.date || '') + ' — ' + (item?.title || '') + ' — ' + (item?.summary || '') + ' [' + (item?.topicKey || '') + ']', 520)).join(' | ');
    const prompt = [
      'Напиши одну оригинальную статью дня о финансовой грамотности для приложения RUDI.',
      'Язык: русский. Объём: примерно 320–520 слов. Тон: умный, понятный, практичный, без инфоцыганства.',
      'Сегодня используй как интеллектуальную основу общие идеи из этих известных книг: ' + books.join('; ') + '.',
      'Не цитируй книги дословно, не пересказывай длинные фрагменты, не имитируй стиль автора и не выдавай текст за цитату.',
      'Синтезируй идеи своими словами. Выбери одну конкретную тему: бюджет, накопления, денежный поток, поведение, риск, резерв, долг, расходы, долгосрочное инвестирование, диверсификация, комиссии или финансовые цели.',
      'Не давай конкретных рекомендаций купить или продать актив, не обещай доходность.',
      'Верни короткий topicKey латиницей, заголовок, краткое summary в 1 предложении и полный article из 3–6 абзацев.',
      history.length ? 'КРИТИЧНО: не повторяй тему, главный тезис или структуру прошлых статей. Уже были: ' + used : '',
      attempt ? 'Предыдущая попытка оказалась слишком похожей на историю. Выбери другую проблему и другой главный тезис.' : '',
    ].filter(Boolean).join('\n');
    try {
      const data = await groqJson(prompt, {
        type: 'object',
        properties: {
          topicKey: { type: 'string' },
          title: { type: 'string' },
          summary: { type: 'string' },
          article: { type: 'string' },
        },
        required: ['topicKey','title','summary','article'],
        additionalProperties: false,
      }, options);
      const candidate = {
        date,
        topicKey: clean(data?.topicKey, 80),
        title: clean(data?.title, 180),
        summary: clean(data?.summary, 320),
        article: clean(data?.article, 7000),
        books,
        provider: 'groq',
        model: MODEL,
      };
      if (candidate.title.length < 8 || candidate.article.length < 500) throw new Error('finance-literacy-too-short');
      if (tooSimilar(candidate, history)) throw new Error('finance-literacy-repeat');
      await cache.set(key, candidate, { ttl: ARTICLE_TTL, tags: ['rudi-finance-literacy'], name: key });
      const nextHistory = history.concat({ date, topicKey:candidate.topicKey, title:candidate.title, summary:candidate.summary, books }).slice(-160);
      await cache.set('article-history', nextHistory, { ttl: ARTICLE_TTL * 4, tags: ['rudi-finance-literacy'], name: 'article-history' });
      return candidate;
    } catch (_) {}
  }
  const fallback = fallbackArticle(date, history);
  await cache.set(key, fallback, { ttl: ARTICLE_TTL, tags: ['rudi-finance-literacy'], name: key });
  const nextHistory = history.concat({ date, topicKey:fallback.topicKey, title:fallback.title, summary:fallback.summary, books:fallback.books }).slice(-160);
  await cache.set('article-history', nextHistory, { ttl: ARTICLE_TTL * 4, tags: ['rudi-finance-literacy'], name: 'article-history' });
  return fallback;
}

function fallbackInsight({ row = {} } = {}) {
  const income = Math.max(0, Number(row.income) || 0);
  const expenses = Math.max(0, Number(row.expenses) || 0);
  const saved = income - expenses;
  const rate = income > 0 ? saved / income * 100 : 0;
  if (!income && !expenses) return 'Добавь доходы и расходы за месяц, чтобы увидеть финансовый разбор.';
  if (saved < 0) return 'Расходы выше доходов. В этом месяце полезнее всего найти источник перерасхода и вернуть бюджет к положительному денежному потоку.';
  if (rate >= 20) return 'Месяц выглядит устойчиво: заметная часть дохода осталась свободной. Следующий шаг — регулярно направлять этот остаток в резерв и выбранную финансовую цель.';
  if (saved > 0) return 'Баланс положительный, но запас между доходами и расходами пока небольшой. Даже умеренное снижение постоянных трат заметно усилит темп накопления.';
  return 'Доходы и расходы почти совпали. Небольшой системный резерв в каждом месяце даст бюджету больше устойчивости.';
}
async function getFinanceMonthlyInsight(input = {}, options = {}) {
  const actor = clean(input.actor, 40);
  const month = clean(input.month, 20);
  const row = input.row && typeof input.row === 'object' ? input.row : {};
  const profile = input.profile && typeof input.profile === 'object' ? input.profile : {};
  const snapshot = {
    actor, month,
    income: Number(row.income || 0),
    expenses: Number(row.expenses || 0),
    balance: Number(row.balance || 0),
    reserve: Number(profile.reserve || 0),
    goalTitle: clean(profile.goalTitle, 80),
    goalTarget: Number(profile.goalTarget || 0),
    goalCurrent: Number(profile.goalCurrent || 0),
  };
  const cache = cacheOf(options);
  const digest = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex').slice(0, 24);
  const key = 'insight:' + actor + ':' + month + ':' + digest;
  const existing = await cache.get(key);
  if (existing?.text) return existing;
  const savingsRate = snapshot.income > 0 ? snapshot.balance / snapshot.income * 100 : 0;
  const cushionMonths = snapshot.reserve > 0 && snapshot.expenses > 0 ? snapshot.reserve / snapshot.expenses : 0;
  const goalPct = snapshot.goalTarget > 0 ? snapshot.goalCurrent / snapshot.goalTarget * 100 : 0;
  const prompt = [
    'Дай короткий образовательный финансовый разбор месяца внутри приложения RUDI.',
    'Пиши по-русски, спокойно и конкретно. Это не инвестиционная рекомендация.',
    'Используй принципы личных финансов: положительный денежный поток, норма сбережений, резерв, разумные постоянные расходы и движение к цели.',
    'Не предлагай конкретные активы, кредиты, банки или сделки.',
    'Ответ 2–3 предложения, без заголовка, markdown и списков.',
    'Данные: доход ' + snapshot.income + ' ₽; расходы ' + snapshot.expenses + ' ₽; баланс ' + snapshot.balance + ' ₽; норма сбережений ' + savingsRate.toFixed(1) + '%; резерв ' + snapshot.reserve + ' ₽; запас ' + cushionMonths.toFixed(1) + ' мес.; цель ' + (snapshot.goalTitle || 'не задана') + '; прогресс ' + goalPct.toFixed(1) + '%.',
  ].join('\n');
  let text = '';
  let provider = 'groq';
  try {
    const data = await groqJson(prompt, {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
      additionalProperties: false,
    }, options);
    text = clean(data?.text, 520);
    if (text.length < 24) throw new Error('finance-ai-insight-short');
  } catch (_) {
    provider = 'fallback';
    text = fallbackInsight({ row, profile });
  }
  const result = { month, text, provider, model: provider === 'groq' ? MODEL : '' };
  await cache.set(key, result, { ttl: INSIGHT_TTL, tags: ['rudi-finance-insight'], name: key });
  return result;
}


function categorySnapshot(categories = [], categoryMonth = {}) {
  const entries = categoryMonth?.entries && typeof categoryMonth.entries === 'object' ? categoryMonth.entries : {};
  return (Array.isArray(categories) ? categories : []).map((category) => {
    const entry = entries[category?.id] && typeof entries[category.id] === 'object' ? entries[category.id] : {};
    return {
      name: clean(category?.name, 50),
      amount: Math.max(0, Number(entry.amount) || 0),
      limit: Math.max(0, Number(entry.limit) || 0),
      note: clean(entry.note, 180),
    };
  }).filter((row) => row.name);
}
function debtSnapshot(debts = []) {
  return (Array.isArray(debts) ? debts : []).filter((row) => !row?.paid).map((row) => ({
    direction: row?.direction === 'owed' ? 'Мне должны' : 'Я должен',
    counterparty: clean(row?.counterparty, 80),
    amount: Math.max(0, Number(row?.amount) || 0),
    note: clean(row?.note, 140),
  }));
}
function fallbackAnalyst(input = {}) {
  const row = input.row || {};
  const income = Math.max(0, Number(row.income) || 0);
  const expenses = Math.max(0, Number(row.expenses) || 0);
  const balance = income - expenses;
  const categories = categorySnapshot(input.categories, input.categoryMonth);
  const over = categories.filter((item) => item.limit > 0 && item.amount > item.limit).sort((a,b)=>(b.amount-b.limit)-(a.amount-a.limit));
  const debts = debtSnapshot(input.debts);
  const priorities = [];
  const actions = [];
  const watch = [];
  if (balance < 0) priorities.push('Вернуть месячный денежный поток в плюс: расходы сейчас выше дохода на ' + Math.round(Math.abs(balance)) + ' ₽.');
  else if (income > 0) priorities.push('Сохранить положительный остаток: за месяц свободно примерно ' + Math.round(balance) + ' ₽.');
  if (over.length) priorities.push('Проверить превышение лимитов: ' + over.slice(0,3).map((item)=>item.name).join(', ') + '.');
  if (debts.some((item)=>item.direction==='Я должен')) priorities.push('Держать активные обязательства под контролем, чтобы они не вытесняли резерв и цели.');
  actions.push('Сравнить фактические расходы с лимитами и скорректировать 1–2 категории с самым большим отклонением.');
  if (Number(input.profile?.reserve || 0) <= 0) actions.push('Сформировать отдельный резерв, который не зависит от инвестиционных решений.');
  if (Number(input.profile?.goalTarget || 0) > 0) actions.push('Направлять часть положительного остатка на цель «' + clean(input.profile.goalTitle || 'Финансовая цель',80) + '».');
  if (!actions.length) actions.push('Сохранять текущую дисциплину и проверять бюджет раз в неделю, а не только в конце месяца.');
  watch.push('Не увеличивать постоянные расходы только потому, что вырос доход.');
  watch.push('Не использовать сегодняшнюю статью как сигнал для конкретной сделки: её задача — улучшать финансовые принципы.');
  return {
    title:'Персональный финансовый разбор',
    overview: balance >= 0 ? 'Финансовая картина месяца в целом положительная, но важны структура расходов, лимиты и устойчивость резерва.' : 'Месяц требует внимания к денежному потоку: приоритет — сократить разрыв между доходом и расходами без резких решений.',
    priorities:priorities.slice(0,4),
    actions:actions.slice(0,5),
    watch:watch.slice(0,4),
    articleConnection: input.article?.title ? 'Идея статьи «' + clean(input.article.title,140) + '» полезна здесь как принцип, а не как готовый рецепт: применяй её к своим цифрам и ограничениям.' : '',
    provider:'fallback',
    model:'',
  };
}
async function getFinanceAnalyst(input = {}, options = {}) {
  const actor = clean(input.actor, 40);
  const month = clean(input.month, 20);
  const row = input.row && typeof input.row === 'object' ? input.row : {};
  const profile = input.profile && typeof input.profile === 'object' ? input.profile : {};
  const categories = categorySnapshot(input.categories, input.categoryMonth);
  const debts = debtSnapshot(input.debts);
  const article = input.article && typeof input.article === 'object' ? input.article : {};
  const snapshot = {
    actor, month,
    income:Number(row.income || 0),
    expenses:Number(row.expenses || 0),
    balance:Number(row.balance || 0),
    reserve:Number(profile.reserve || 0),
    goalTitle:clean(profile.goalTitle,80),
    goalTarget:Number(profile.goalTarget || 0),
    goalCurrent:Number(profile.goalCurrent || 0),
    categories,
    debts,
    articleDate:clean(article.date,20),
    articleTitle:clean(article.title,180),
    articleSummary:clean(article.summary,320),
  };
  const cache = cacheOf(options);
  const digest = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex').slice(0,28);
  const key = 'analyst:' + actor + ':' + month + ':' + digest;
  const existing = await cache.get(key);
  if (existing?.overview) return existing;

  const categoryLines = categories.length
    ? categories.map((item)=>item.name+': '+item.amount+' ₽ из лимита '+(item.limit>0?item.limit+' ₽':'не задан')+(item.note?' · заметка: '+item.note:'')).join('\n')
    : 'Категорий нет';
  const debtLines = debts.length
    ? debts.map((item)=>item.direction+' '+item.counterparty+': '+item.amount+' ₽'+(item.note?' · '+item.note:'')).join('\n')
    : 'Активных долгов нет';
  const prompt = [
    'Ты — финансовый аналитик внутри приложения RUDI. Дай персональный образовательный разбор по фактическим цифрам пользователя.',
    'Используй сегодняшнюю статью по финансовой грамотности как один из принципов анализа, но не копируй её и не подменяй ею анализ цифр.',
    'Не давай конкретных рекомендаций купить или продать актив, не обещай доходность, не советуй брать новый долг.',
    'Приоритет: денежный поток, структура расходов, превышение лимитов, резерв, финансовая цель, долговая нагрузка и устойчивость поведения.',
    'Рекомендации должны быть конкретными и основанными только на переданных данных. Если данных мало — прямо укажи это.',
    'Месяц: '+month+'. Доход: '+snapshot.income+' ₽. Расходы: '+snapshot.expenses+' ₽. Баланс: '+snapshot.balance+' ₽.',
    'Резерв: '+snapshot.reserve+' ₽. Цель: '+(snapshot.goalTitle||'не задана')+'; нужно '+snapshot.goalTarget+' ₽; накоплено '+snapshot.goalCurrent+' ₽.',
    'Категории:\n'+categoryLines,
    'Долги:\n'+debtLines,
    'Статья дня: '+(snapshot.articleTitle||'нет')+'. Смысл: '+(snapshot.articleSummary||'нет данных')+'.',
    'Верни: title; overview из 2–3 предложений; priorities 2–4 пункта; actions 3–5 конкретных действий; watch 1–4 риска/наблюдения; articleConnection 1–2 предложения о том, как принцип статьи связан с этими цифрами.',
  ].join('\n');

  try {
    const parsed = await groqJson(prompt, {
      type:'object',
      properties:{
        title:{type:'string'},
        overview:{type:'string'},
        priorities:{type:'array',items:{type:'string'},minItems:1,maxItems:5},
        actions:{type:'array',items:{type:'string'},minItems:1,maxItems:6},
        watch:{type:'array',items:{type:'string'},minItems:1,maxItems:5},
        articleConnection:{type:'string'},
      },
      required:['title','overview','priorities','actions','watch','articleConnection'],
      additionalProperties:false,
    }, options);
    const result = {
      title:clean(parsed?.title,160)||'Персональный финансовый разбор',
      overview:clean(parsed?.overview,1000),
      priorities:(Array.isArray(parsed?.priorities)?parsed.priorities:[]).map((v)=>clean(v,360)).filter(Boolean).slice(0,5),
      actions:(Array.isArray(parsed?.actions)?parsed.actions:[]).map((v)=>clean(v,360)).filter(Boolean).slice(0,6),
      watch:(Array.isArray(parsed?.watch)?parsed.watch:[]).map((v)=>clean(v,360)).filter(Boolean).slice(0,5),
      articleConnection:clean(parsed?.articleConnection,700),
      provider:'groq',
      model:MODEL,
    };
    if (!result.overview || !result.actions.length) throw new Error('finance-analyst-empty');
    await cache.set(key,result,{ttl:INSIGHT_TTL,tags:['rudi-finance-analyst'],name:key});
    return result;
  } catch (_) {
    const result=fallbackAnalyst(input);
    await cache.set(key,result,{ttl:INSIGHT_TTL,tags:['rudi-finance-analyst'],name:key});
    return result;
  }
}

module.exports = {
  MODEL, BOOKS, normalized, tokenSet, jaccard, tooSimilar, moscowDateKey,
  getFinanceLiteracyArticle, fallbackArticle, getFinanceMonthlyInsight, fallbackInsight,
  getFinanceAnalyst, fallbackAnalyst, categorySnapshot, debtSnapshot,
};
