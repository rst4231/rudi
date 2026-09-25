const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');
const { readRecipients } = require('./partner-notification-store.cjs');
const { readPartnerMessage } = require('./partner-message-store.cjs');
const { readWishlist } = require('./wishlist-store.cjs');
const { readProductList } = require('./product-list-store.cjs');
const { readDailyMood } = require('./daily-mood-store.cjs');
const { readCycleState, cycleViewForDate } = require('./cycle-store.cjs');
const { getWorkWeek } = require('./work-calendar.cjs');
const { readToken } = require('./ticktick-store.cjs');
const {
  loadTickTickConfig,
  fetchProjectData,
  buildTickTickCalendar,
  calendarDateKey,
} = require('./ticktick-client.cjs');
const { readFeedSnapshot, moscowDateKey } = require('./feed-store.cjs');
const { telegramSendMessage, escapeTelegramHtml } = require('./telegram-notifications.cjs');
const { readSmartHomeSnapshot } = require('./smart-home-client.cjs');
const { loadCarTasks, serviceScheduleForMileage } = require('./car-client.cjs');
const { readCarState } = require('./car-store.cjs');

const NAMESPACE = 'rudi-morning-summary-v1';
const TTL_SECONDS = 60 * 60 * 24 * 3650;
const ACTORS = ['Рустам', 'Диана'];

function cacheOf(options = {}) {
  return options.summaryCache || createStrictRuntimeCache({
    namespace: NAMESPACE,
    confirmWrites: false,
    ...(options.summaryCacheOptions || {}),
  });
}

function markerKey(actor) {
  return 'last:' + String(actor || '');
}

function recoveryMarkerKey(value) {
  return 'recovery:' + String(value || '').trim();
}

async function wasRecoverySent(value, options = {}) {
  const key = recoveryMarkerKey(value);
  if (key === 'recovery:') return false;
  return Boolean(await cacheOf(options).get(key).catch(() => null));
}

async function markRecoverySent(value, options = {}) {
  const key = recoveryMarkerKey(value);
  if (key === 'recovery:') return false;
  await cacheOf(options).set(key, true, {
    ttl: TTL_SECONDS,
    tags: ['rudi-morning-summary'],
    name: 'morning-summary-' + key,
  });
  return true;
}

async function readSummaryMarker(actor, options = {}) {
  const value = await cacheOf(options).get(markerKey(actor)).catch(() => null);
  if (!value || typeof value !== 'object') return null;
  return {
    date: String(value.date || ''),
    sentAt: String(value.sentAt || ''),
  };
}

async function writeSummaryMarker(actor, date, sentAt, options = {}) {
  await cacheOf(options).set(markerKey(actor), {
    date: String(date || ''),
    sentAt: String(sentAt || ''),
  }, {
    ttl: TTL_SECONDS,
    tags: ['rudi-morning-summary'],
    name: 'morning-summary-' + actor,
  });
  return true;
}

function partnerFor(actor) {
  return actor === 'Рустам' ? 'Диана' : 'Рустам';
}

function partnerGenitive(actor) {
  return actor === 'Рустам' ? 'Дианы' : 'Рустама';
}

function assigneeFor(actor) {
  return actor === 'Рустам' ? 'RST' : 'Ди';
}

function filterTasksForActor(tasks, actor) {
  const expected = assigneeFor(actor);
  return (Array.isArray(tasks) ? tasks : []).filter((task) => {
    if (task?.completed) return false;
    if (!task?.assigned || task?.assignee === 'Не назначен') return true;
    return String(task?.assignee || '') === expected;
  });
}

function taskLine(task) {
  const title = escapeTelegramHtml(String(task?.title || 'Совместное дело').trim());
  const time = String(task?.startTime || '').trim();
  return '• ' + (time ? escapeTelegramHtml(time) + ' · ' : '') + title;
}

function moodLabel(value) {
  const mood = String(value || '');
  if (mood === 'low') return { emoji: '😔', text: 'не очень' };
  if (mood === 'ok') return { emoji: '😐', text: 'нормальное' };
  if (mood === 'great') return { emoji: '😄', text: 'отличное' };
  return null;
}

function lowerFirst(value) {
  const text = String(value || '').trim();
  return text ? text[0].toLowerCase() + text.slice(1) : '';
}

function cycleGuidanceForRustam(status, phase) {
  const value = String(status || '').trim();
  const byStatus = {
    'Спокойная':'Не торопи Диану с делами и решениями. Лучше спокойный темп, немного заботы и больше пространства для отдыха.',
    'Нежная':'Сегодня лучше быть особенно мягким и внимательным: меньше давления, больше заботы и приятных мелочей.',
    'Уютная':'Хорошо зайдут спокойные совместные планы, домашний комфорт и минимум лишней суеты.',
    'Вдумчивая':'Не торопи с разговорами и решениями. Дай больше личного пространства и спокойно будь рядом.',
    'Бодрая':'Можно смелее предлагать дела, прогулки и совместные планы — темп дня можно сделать активнее.',
    'Лёгкая':'Лучше предложить что-то приятное и ненапряжное: прогулку, небольшие дела или спонтанный план.',
    'Собранная':'Можно обсуждать планы и конкретные дела: сегодня лучше заходят ясность, порядок и понятные договорённости.',
    'Энергичная':'Подойдут активные совместные планы, прогулки, встречи и дела, которые давно откладывали.',
    'Активная':'Можно предлагать более динамичный день и совместные дела, но всё равно сверяйся с её реальным настроением.',
    'Воодушевлённая':'Поддержи её идеи и инициативу. Хороший день, чтобы вместе придумать или начать что-то приятное.',
    'Яркая':'Можно добавить больше общения, впечатлений и совместных планов — день хорошо подходит для активности.',
    'Сияющая':'Подойдут встречи, прогулки, приятные сюрпризы и всё, что добавляет положительных эмоций.',
    'Общительная':'Хорошо зайдут разговоры, встречи и совместные дела. Будь включённым и поддерживай контакт.',
    'Уверенная':'Можно спокойно обсуждать важные планы и решения, не перетягивая инициативу на себя.',
    'Уравновешенная':'Держи ровный темп: обычные дела, спокойное общение и без лишних эмоциональных перегибов.',
    'Чувствительная':'Говори мягче, не дави с решениями и не раздувай мелкие споры. Если ей хочется тишины или отдыха, дай это пространство.'
  };
  if (byStatus[value]) return byStatus[value];

  const phaseValue = String(phase || '');
  if (phaseValue === 'Месячные') return 'Сегодня лучше не торопить с делами, предложить помощь и оставить больше пространства для отдыха.';
  if (phaseValue === 'Фолликулярная фаза') return 'Можно смелее предлагать активные планы и совместные дела, если у Дианы есть на них настроение.';
  if (phaseValue === 'Фертильное окно') return 'Подойдут более активные совместные планы и общение, но ориентируйся прежде всего на её реальное настроение.';
  if (phaseValue === 'Лютеиновая фаза') return 'Лучше говорить мягче, не давить с решениями и не раздувать мелкие споры.';
  return '';
}

function countWord(count, one, few, many) {
  const n = Math.abs(Number(count) || 0) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return many;
  if (n1 > 1 && n1 < 5) return few;
  if (n1 === 1) return one;
  return many;
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function eventCount(value) {
  const text = stripHtml(value);
  const explicit = text.match(/Найдено[^\d]{0,40}(\d+)/iu);
  if (explicit) return Number(explicit[1]) || 0;
  const numbered = [...text.matchAll(/(?:^|\n)\s*\d+\.\s+/g)];
  return numbered.length;
}

function feedSectionUpdatedOnDate(section, date) {
  const updatedAt = String(section?.updatedAt || '').trim();
  const parsed = Date.parse(updatedAt);
  if (!Number.isFinite(parsed)) return false;
  return moscowDateKey(new Date(parsed)) === date;
}

function feedSummaryLines(feed, date) {
  if (!feed || !date) return [];
  const sections = feed.sections || {};
  const feedIsToday = String(feed.date || '') === String(date);
  const lines = [];

  const events = sections.events;
  const eventsAreToday = feedIsToday || feedSectionUpdatedOnDate(events, date);
  const eventParts = eventsAreToday && Array.isArray(events?.parts) ? events.parts : [];
  const concerts = String(eventParts[0] || '');
  if (concerts && !/не найден/iu.test(stripHtml(concerts))) {
    const count = eventCount(concerts);
    lines.push(count
      ? '• ' + count + ' ' + countWord(count, 'концерт', 'концерта', 'концертов')
      : '• концерты на сегодня');
  }

  const standup = String(eventParts[1] || '');
  if (standup && !/не найден/iu.test(stripHtml(standup))) {
    const count = eventCount(standup);
    lines.push(count
      ? '• ' + count + ' Stand Up'
      : '• Stand Up на сегодня');
  }

  const cinema = sections.cinema;
  const cinemaChangedToday = (feed.changedSections || []).includes('cinema')
    || feedSectionUpdatedOnDate(cinema, date);
  if (cinemaChangedToday && (cinema?.parts?.length || cinema?.items?.length)) {
    lines.push('• новые кинопремьеры');
  } else if (feedIsToday && (cinema?.parts?.length || cinema?.items?.length)) {
    lines.push('• кинопремьеры');
  }

  if (!lines.length && feedIsToday && Object.keys(sections).length) {
    lines.push('• материалы на сегодня уже в Ленте');
  }
  return lines;
}

function formatDate(now) {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: 'numeric',
    month: 'long',
  }).format(now);
}

function isNewAfter(value, since) {
  const time = Date.parse(String(value || ''));
  const threshold = Date.parse(String(since || ''));
  return Number.isFinite(time) && Number.isFinite(threshold) && time > threshold;
}

function wishlistLines(items, actor, since) {
  if (!since) return [];
  const partner = partnerFor(actor);
  return (Array.isArray(items) ? items : [])
    .filter((item) => item?.owner === partner && !item?.done && isNewAfter(item?.createdAt, since))
    .sort((a, b) => Date.parse(a.createdAt || 0) - Date.parse(b.createdAt || 0))
    .map((item) => String(item?.text || '').trim())
    .filter(Boolean);
}

function messageIsNewForActor(message, actor, since) {
  if (!message || !since) return false;
  return message.authorName === partnerFor(actor) && isNewAfter(message.updatedAt, since);
}

function workDayBlock(workDay) {
  if (!workDay) return '';
  if (!workDay.working) return '🛋 <b>Сегодня выходной</b>';
  const event = Array.isArray(workDay.events) ? workDay.events[0] : null;
  const range = event?.startTime && event?.endTime
    ? '\nСмена: ' + escapeTelegramHtml(event.startTime) + '–' + escapeTelegramHtml(event.endTime)
    : '';
  return '💼 <b>Сегодня рабочий день</b>' + range;
}

function dianaWorkDayBlock(workDay) {
  if (!workDay) return '';
  if (!workDay.working) return '🛋 <b>Диана сегодня не работает</b>';
  const event = Array.isArray(workDay.events) ? workDay.events[0] : null;
  const range = event?.startTime && event?.endTime
    ? '\nСмена: ' + escapeTelegramHtml(event.startTime) + '–' + escapeTelegramHtml(event.endTime)
    : '';
  return '💼 <b>Диана сегодня работает</b>' + range;
}

function smartHomeProperty(device, instance) {
  const item = (Array.isArray(device?.properties) ? device.properties : [])
    .find((row) => String(row?.parameters?.instance || '') === String(instance || ''));
  return item?.state?.value;
}

function homeClimateFromSnapshot(snapshot) {
  const device = (Array.isArray(snapshot?.devices) ? snapshot.devices : []).find((row) =>
    Number.isFinite(Number(smartHomeProperty(row, 'temperature')))
    || Number.isFinite(Number(smartHomeProperty(row, 'humidity')))
  );
  if (!device) return null;
  const temperature = Number(smartHomeProperty(device, 'temperature'));
  const humidity = Number(smartHomeProperty(device, 'humidity'));
  return {
    temperature: Number.isFinite(temperature) ? temperature : null,
    humidity: Number.isFinite(humidity) ? humidity : null,
  };
}

function weatherCodeLabel(code) {
  const labels = {
    0:'ясно',1:'в основном ясно',2:'облачно',3:'пасмурно',
    45:'туман',48:'туман',51:'морось',53:'морось',55:'морось',
    61:'дождь',63:'дождь',65:'сильный дождь',
    71:'снег',73:'снег',75:'сильный снег',
    80:'ливень',81:'ливень',82:'сильный ливень',95:'гроза',
  };
  return labels[Number(code)] || '';
}

function tyreAdviceForWeather(weather) {
  if (!weather) return '';
  const avg = Number(weather.avgMean);
  const min = Number(weather.minForecast);

  if (Number.isFinite(min) && min <= 0) {
    return 'В прогнозе есть заморозки — если стоят летние шины, пора планировать переход на зимние.';
  }
  if (Number.isFinite(avg) && avg <= 7) {
    return 'Средняя температура на неделе около +7°C или ниже — пора планировать зимние шины.';
  }
  if (Number.isFinite(avg) && avg >= 10 && Number.isFinite(min) && min > 5) {
    return 'Температура устойчиво выше +7°C — по погоде условия подходят для летних шин.';
  }
  return 'Температура пограничная — с переобувкой лучше ориентироваться на устойчивые значения выше или ниже +7°C.';
}

async function loadEnvironmentSnapshot(options = {}) {
  if (typeof options.loadEnvironmentImpl === 'function') {
    return options.loadEnvironmentImpl(options);
  }

  const homePromise = (options.readSmartHomeImpl || readSmartHomeSnapshot)(false)
    .then(homeClimateFromSnapshot)
    .catch((error) => {
      console.warn('RUDI_MORNING_SMART_HOME_WARN', String(error?.message || error));
      return null;
    });

  const weatherPromise = (async () => {
    try {
      const fetchImpl = options.weatherFetchImpl || globalThis.fetch;
      const url = 'https://api.open-meteo.com/v1/forecast?latitude=59.9386&longitude=30.3141&current=temperature_2m,weather_code&daily=temperature_2m_min,temperature_2m_max,precipitation_sum&forecast_days=7&timezone=Europe%2FMoscow';
      const response = await fetchImpl(url, { cache:'no-store' });
      if (!response.ok) throw new Error('weather-http-' + response.status);
      const data = await response.json();
      const mins = (data.daily?.temperature_2m_min || []).map(Number).filter(Number.isFinite);
      const maxs = (data.daily?.temperature_2m_max || []).map(Number).filter(Number.isFinite);
      const means = mins.map((min,index) => (min + Number(maxs[index])) / 2).filter(Number.isFinite);
      const precipitation = (data.daily?.precipitation_sum || []).map(Number).filter(Number.isFinite);
      const temperature = Number(data.current?.temperature_2m);
      return {
        temperature: Number.isFinite(temperature) ? temperature : null,
        code: Number(data.current?.weather_code),
        minForecast: mins.length ? Math.min(...mins) : null,
        maxForecast: maxs.length ? Math.max(...maxs) : null,
        avgMean: means.length ? means.reduce((a,b)=>a+b,0) / means.length : null,
        precipitationSum: precipitation.length ? precipitation.reduce((a,b)=>a+b,0) : 0,
      };
    } catch (error) {
      console.warn('RUDI_MORNING_WEATHER_WARN', String(error?.message || error));
      return null;
    }
  })();

  const [home,weather] = await Promise.all([homePromise,weatherPromise]);
  return { home, weather };
}

async function loadTodayCarTasks(options = {}) {
  try {
    const result = typeof options.loadCarTasksImpl === 'function'
      ? await options.loadCarTasksImpl(options)
      : await loadCarTasks({ now:options.now || new Date() });
    const tasks = Array.isArray(result) ? result : (Array.isArray(result?.tasks) ? result.tasks : []);
    return tasks.filter((task) => task?.timing === 'today');
  } catch (error) {
    console.warn('RUDI_MORNING_CAR_TASKS_WARN', String(error?.message || error));
    return [];
  }
}

async function loadMorningCarState(options = {}) {
  try {
    return typeof options.readCarStateImpl === 'function'
      ? await options.readCarStateImpl(options)
      : await readCarState(options);
  } catch (error) {
    console.warn('RUDI_MORNING_CAR_STATE_WARN', String(error?.message || error));
    return null;
  }
}

function formatCarKm(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number).toLocaleString('ru-RU') + ' км' : '';
}

function buildCarRecommendations(carState, weather) {
  const items = [];
  const mileage = Number(carState?.mileage);
  const nextService = serviceScheduleForMileage(mileage);
  const remaining = Number.isFinite(mileage) && Number.isFinite(Number(nextService?.mileage))
    ? Math.max(0, Number(nextService.mileage) - mileage)
    : null;

  if (remaining === 0 && carState?.mileage != null) {
    items.push({title:'ТО по пробегу',text:'Ты на регламентном рубеже. Проверь, пройдено ли это ТО, и при необходимости запишись.'});
  } else if (Number.isFinite(remaining) && remaining <= 1000) {
    items.push({title:'ТО скоро',text:'До следующего ТО осталось ' + formatCarKm(remaining) + '. Лучше уже выбрать дату сервиса.'});
  } else if (Number.isFinite(remaining) && remaining <= 2500) {
    items.push({title:'Планируй ТО',text:'До следующего ТО ' + formatCarKm(remaining) + '. Можно заранее подобрать удобное окно у сервиса.'});
  }

  if (weather) {
    if (Number(weather.minForecast) <= 3) {
      items.push({title:'Похолодание',text:'Ночью около +3°C или ниже. Проверь омывающую жидкость, состояние аккумулятора и давление в шинах.'});
    }
    if (Number(weather.precipitationSum) >= 5) {
      items.push({title:'Осадки',text:'На неделе ожидаются осадки. Проверь щётки, омыватель и учитывай увеличенный тормозной путь.'});
    }
    const spread = Number(weather.maxForecast) - Number(weather.minForecast);
    if (Number.isFinite(spread) && spread >= 10) {
      items.push({title:'Перепад температуры',text:'Температура заметно меняется. После похолодания проверь давление в шинах на холодных колёсах.'});
    }
  }

  if (!items.length) {
    items.push({title:'Всё спокойно',text:'По погоде и пробегу срочных действий нет. Следи за давлением, жидкостями и необычными звуками.'});
  }
  return items.slice(0,3);
}

function environmentBlock(data = {}) {
  const home = data.environment?.home || null;
  const weather = data.environment?.weather || null;
  const lines = [];

  if (home && (home.temperature != null || home.humidity != null)) {
    const parts = [];
    if (home.temperature != null) parts.push(Number(home.temperature).toFixed(1) + '°C');
    if (home.humidity != null) parts.push('влажность ' + Math.round(Number(home.humidity)) + '%');
    if (parts.length) lines.push('Дома: ' + parts.join(' · '));
  }

  if (weather?.temperature != null) {
    const condition = weatherCodeLabel(weather.code);
    lines.push('На улице: ' + Math.round(Number(weather.temperature)) + '°C' + (condition ? ' · ' + condition : ''));
  }

  return lines.length ? '🌡 <b>Дом и погода</b>\n' + lines.map(escapeTelegramHtml).join('\n') : '';
}

function rustamCarBlock(data = {}) {
  const lines = [];
  const tyre = tyreAdviceForWeather(data.environment?.weather);
  if (tyre) lines.push('Шины: ' + tyre);

  const recommendations = buildCarRecommendations(data.carState, data.environment?.weather);
  if (recommendations.length) {
    lines.push('Рекомендации:');
    for (const item of recommendations) {
      lines.push('• ' + item.title + ': ' + item.text);
    }
  }

  const tasks = Array.isArray(data.carTasksToday) ? data.carTasksToday : [];
  if (tasks.length) {
    lines.push('Задачи на сегодня:');
    for (const task of tasks.slice(0,4)) {
      lines.push('• ' + String(task?.title || 'Задача по машине').trim());
    }
  }

  return lines.length
    ? '🚗 <b>Машина</b>\n' + lines.map(escapeTelegramHtml).join('\n')
    : '';
}

function buildMorningSummary(actor, data = {}) {
  const partner = partnerFor(actor);
  const blocks = [
    '☀️ <b>' + actor + ', доброе утро</b>\n' + escapeTelegramHtml(String(data.dateLabel || '')),
  ];

  if (data.workDay) {
    blocks.push(actor === 'Диана'
      ? workDayBlock(data.workDay)
      : dianaWorkDayBlock(data.workDay));
  }

  const environment = environmentBlock(data);
  if (environment) blocks.push(environment);

  if (actor === 'Рустам') {
    const car = rustamCarBlock(data);
    if (car) blocks.push(car);
  }

  if (data.tasks === null) {
    blocks.push('📅 <b>Дела</b>\nНе удалось проверить TickTick.');
  } else {
    const tasks = filterTasksForActor(data.tasks, actor);
    if (tasks.length) {
      const visible = tasks.slice(0, 6);
      let body = '📅 <b>Твои дела на сегодня</b>\n' + visible.map(taskLine).join('\n');
      if (tasks.length > visible.length) body += '\n• ещё ' + (tasks.length - visible.length);
      blocks.push(body);
    } else {
      blocks.push('📅 <b>На сегодня дел нет</b>');
    }
  }

  const partnerMood = moodLabel(data.moods?.[partner]?.mood);
  if (partnerMood) {
    blocks.push(
      '❤️ <b>' + partner + '</b>\n'
      + 'Настроение: ' + partnerMood.emoji + ' ' + partnerMood.text
    );
  }

  if (data.cycle?.moodWord) {
    const title = actor === 'Диана' ? 'Твой статус по циклу' : 'Диана по циклу';
    blocks.push(
      '🌸 <b>' + title + '</b>\n'
      + '<b>' + escapeTelegramHtml(data.cycle.moodWord) + '</b>'
      + (data.cycle.phase ? ' · ' + escapeTelegramHtml(lowerFirst(data.cycle.phase)) : '')
    );
  }

  if (actor === 'Рустам' && data.cycle?.phase) {
    const guidance = cycleGuidanceForRustam(data.cycle.moodWord, data.cycle.phase);
    if (guidance) {
      blocks.push(
        '🤍 <b>Как лучше сегодня с Дианой</b>\n'
        + escapeTelegramHtml(guidance)
      );
    }
  }

  if (data.newMessage) {
    blocks.push('💌 <b>Новое послание от ' + partnerGenitive(actor) + '</b>');
  }

  const productCount = Number(data.productCount || 0);
  if (productCount > 0) {
    blocks.push(
      '🛒 <b>Продукты</b>\nВ списке ' + productCount + ' '
      + countWord(productCount, 'позиция', 'позиции', 'позиций')
    );
  }

  const wishes = Array.isArray(data.newWishlist) ? data.newWishlist : [];
  if (wishes.length) {
    const visible = wishes.slice(0, 3);
    const verb = partner === 'Диана' ? 'добавила' : 'добавил';
    let body = '🎁 <b>Вишлист</b>\n' + partner + ' ' + verb + ':\n'
      + visible.map((item) => '• ' + escapeTelegramHtml(item)).join('\n');
    if (wishes.length > visible.length) body += '\n• ещё ' + (wishes.length - visible.length);
    blocks.push(body);
  }

  if (Array.isArray(data.feedLines) && data.feedLines.length) {
    blocks.push('📰 <b>Сегодня в Ленте</b>\n' + data.feedLines.join('\n'));
  }

  blocks.push('Хорошего дня 🤍');
  return blocks.filter(Boolean).join('\n\n');
}

async function loadTodayTasks(options = {}) {
  if (typeof options.loadTasksImpl === 'function') return options.loadTasksImpl(options);
  try {
    const token = await readToken(options);
    if (!token?.accessToken) return null;
    const config = await loadTickTickConfig({
      env: options.env || process.env,
      fetchImpl: options.tickTickFetchImpl || globalThis.fetch,
    });
    if (!config.enabled) return null;
    const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
    const data = await fetchProjectData(token.accessToken, config.projectId, {
      fetchImpl: options.tickTickFetchImpl || globalThis.fetch,
    });
    const calendar = buildTickTickCalendar(data?.tasks || [], now, 'month');
    const today = calendarDateKey(now);
    return calendar.days.find((day) => day.date === today)?.events || [];
  } catch (error) {
    console.warn('RUDI_MORNING_TICKTICK_WARN', String(error?.message || error));
    return null;
  }
}

async function loadDianaWorkDay(options = {}) {
  if (typeof options.loadWorkDayImpl === 'function') return options.loadWorkDayImpl(options);
  try {
    const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
    const result = await getWorkWeek({
      now,
      fetchImpl: options.workCalendarFetchImpl || globalThis.fetch,
      ...(options.workCalendarCache ? { cache: options.workCalendarCache } : {}),
    });
    const date = moscowDateKey(now);
    return result?.days?.find((day) => day.date === date) || (result?.configured ? { date, working: false, events: [] } : null);
  } catch (error) {
    console.warn('RUDI_MORNING_WORK_CALENDAR_WARN', String(error?.message || error));
    return null;
  }
}

async function collectMorningData(options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const date = moscowDateKey(now);
  const [
    tasks,
    workDay,
    moods,
    cycleState,
    partnerMessage,
    wishlist,
    products,
    feed,
    environment,
    carTasksToday,
    carState,
  ] = await Promise.all([
    loadTodayTasks({ ...options, now }),
    loadDianaWorkDay({ ...options, now }),
    (options.readMoodImpl || readDailyMood)(date, options).catch(() => ({ date, moods: {} })),
    (options.readCycleImpl || readCycleState)(options).catch(() => null),
    (options.readPartnerMessageImpl || readPartnerMessage)(options).catch(() => null),
    (options.readWishlistImpl || readWishlist)(options).catch(() => ({ items: [] })),
    (options.readProductsImpl || readProductList)(options).catch(() => ({ items: [] })),
    (options.readFeedImpl || readFeedSnapshot)({ ...options, now }).catch(() => ({ sections: {} })),
    loadEnvironmentSnapshot({ ...options, now }).catch(() => ({ home:null, weather:null })),
    loadTodayCarTasks({ ...options, now }).catch(() => []),
    loadMorningCarState({ ...options, now }).catch(() => null),
  ]);

  return {
    now,
    date,
    dateLabel: formatDate(now),
    tasks,
    workDay,
    moods: moods?.moods || {},
    cycle: cycleViewForDate(cycleState, date),
    partnerMessage,
    wishlistItems: wishlist?.items || [],
    productCount: Array.isArray(products?.items) ? products.items.length : 0,
    feedLines: feedSummaryLines(feed, date),
    environment: environment || {home:null,weather:null},
    carTasksToday: Array.isArray(carTasksToday) ? carTasksToday : [],
    carState: carState && typeof carState === 'object' ? carState : null,
  };
}

async function sendDailyMorningSummaries(options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const date = moscowDateKey(now);
  const recoveryKey = String(options.recoveryKey || '').trim();
  if (recoveryKey && await wasRecoverySent(recoveryKey, options)) {
    return {
      sent: 0,
      failed: [],
      missingRecipients: [],
      skippedAlreadySent: [],
      skippedRecovery: true,
      forced: Boolean(options.force),
      recoveryKey,
      date,
    };
  }
  const recipients = options.recipients || await readRecipients(options);
  const common = await collectMorningData({ ...options, now });
  const sent = [];
  const failed = [];
  const missingRecipients = [];
  const skippedAlreadySent = [];

  for (const actor of ACTORS) {
    const chatId = Number(recipients?.[actor]);
    if (!Number.isInteger(chatId) || chatId <= 0) {
      missingRecipients.push(actor);
      continue;
    }

    const marker = await readSummaryMarker(actor, options);
    if (!options.force && marker?.date === date) {
      skippedAlreadySent.push(actor);
      continue;
    }

    const since = marker?.sentAt || '';
    const text = buildMorningSummary(actor, {
      ...common,
      newMessage: messageIsNewForActor(common.partnerMessage, actor, since),
      newWishlist: wishlistLines(common.wishlistItems, actor, since),
    });

    try {
      let result;
      try {
        result = await telegramSendMessage(chatId, text, {
          ...options,
          fetchImpl: options.telegramFetchImpl || options.fetchImpl || globalThis.fetch,
          tab: 'home',
          buttonText: 'Открыть RUDI',
        });
      } catch (error) {
        if (Number(error?.status || 0) !== 400) throw error;
        console.warn('RUDI_MORNING_SUMMARY_RICH_SEND_WARN', actor, String(error?.message || error));
        result = await telegramSendMessage(chatId, stripHtml(text), {
          ...options,
          fetchImpl: options.telegramFetchImpl || options.fetchImpl || globalThis.fetch,
          parseMode: false,
        });
      }
      await writeSummaryMarker(actor, date, now.toISOString(), options);
      sent.push({ actor, ...result });
    } catch (error) {
      failed.push({ actor, error: String(error?.message || error) });
    }
  }

  if (missingRecipients.length || failed.length) {
    const result = {
      sent: sent.length,
      failed,
      missingRecipients,
      skippedAlreadySent,
      forced: Boolean(options.force),
      recoveryKey: recoveryKey || null,
      date,
    };
    const error = new Error(
      missingRecipients.length
        ? 'morning-summary-recipients-missing:' + missingRecipients.join(',')
        : 'morning-summary-failed:' + failed.map((row) => row.actor).join(',')
    );
    error.result = result;
    throw error;
  }

  if (recoveryKey) await markRecoverySent(recoveryKey, options);

  return {
    sent: sent.length,
    failed,
    missingRecipients,
    skippedAlreadySent,
    skippedRecovery: false,
    forced: Boolean(options.force),
    recoveryKey: recoveryKey || null,
    date,
  };
}

module.exports = {
  NAMESPACE,
  ACTORS,
  partnerFor,
  partnerGenitive,
  assigneeFor,
  filterTasksForActor,
  moodLabel,
  cycleGuidanceForRustam,
  eventCount,
  feedSectionUpdatedOnDate,
  feedSummaryLines,
  wishlistLines,
  messageIsNewForActor,
  workDayBlock,
  dianaWorkDayBlock,
  homeClimateFromSnapshot,
  tyreAdviceForWeather,
  environmentBlock,
  buildCarRecommendations,
  rustamCarBlock,
  loadEnvironmentSnapshot,
  loadTodayCarTasks,
  loadMorningCarState,
  buildMorningSummary,
  loadTodayTasks,
  loadDianaWorkDay,
  collectMorningData,
  readSummaryMarker,
  writeSummaryMarker,
  wasRecoverySent,
  markRecoverySent,
  sendDailyMorningSummaries,
};
