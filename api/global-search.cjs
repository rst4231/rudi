const { readWishlist } = require('./wishlist-store.cjs');
const { readProductList } = require('./product-list-store.cjs');
const { readSavedItems } = require('./saved-items-store.cjs');
const { readPartnerMessage } = require('./partner-message-store.cjs');
const { readFeedSnapshot } = require('./feed-store.cjs');
const { readActivityJournal } = require('./activity-journal-store.cjs');
const { getWorkWeek } = require('./work-calendar.cjs');

const MAX_RESULTS = 40;

function normalize(value) {
  return String(value || '')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();
}

function clean(value, max = 1200) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function scoreText(queryTerms, title, text) {
  const titleNorm = normalize(title);
  const textNorm = normalize(text);
  const haystack = (titleNorm + ' ' + textNorm).trim();
  if (!queryTerms.every((term) => haystack.includes(term))) return 0;

  let score = 10;
  for (const term of queryTerms) {
    if (titleNorm === term) score += 50;
    else if (titleNorm.startsWith(term)) score += 30;
    else if (titleNorm.includes(term)) score += 20;
    else if (textNorm.includes(term)) score += 8;
  }
  return score;
}

function result(row = {}) {
  return {
    kind: clean(row.kind, 80),
    title: clean(row.title, 240),
    text: clean(row.text, 1200),
    tab: clean(row.tab, 30) || 'home',
    item: clean(row.item, 160),
    score: Number(row.score || 0),
  };
}

function addResult(rows, queryTerms, row) {
  const score = scoreText(queryTerms, row.title, row.text);
  if (!score) return;
  rows.push(result({ ...row, score }));
}

function savedRecipeText(payload = {}) {
  return [
    payload.summary,
    ...(Array.isArray(payload.missing) ? payload.missing : []),
    ...(Array.isArray(payload.ingredients) ? payload.ingredients.flatMap((row) => [row?.name, row?.amount]) : []),
    ...(Array.isArray(payload.steps) ? payload.steps : []),
    ...(Array.isArray(payload.tips) ? payload.tips : []),
  ].filter(Boolean).join(' ');
}

function calendarText(day = {}) {
  return (Array.isArray(day.events) ? day.events : [])
    .map((event) => [event?.title, event?.startTime, event?.endTime].filter(Boolean).join(' '))
    .join(' ');
}

async function searchGlobalData(query, options = {}) {
  const normalizedQuery = normalize(query);
  const terms = normalizedQuery.split(' ').filter(Boolean).slice(0, 8);
  if (!normalizedQuery || normalizedQuery.length < 2 || !terms.length) return [];

  const backup = options.backupSnapshot && typeof options.backupSnapshot === 'object'
    ? options.backupSnapshot
    : {};

  const [wishlistRow, productsRow, savesRow, messageRow, feedRow, activityRow, calendarRow, nextCalendarRow] = await Promise.allSettled([
    readWishlist(options),
    readProductList(options),
    readSavedItems(options),
    readPartnerMessage(options),
    readFeedSnapshot(options),
    readActivityJournal(options),
    getWorkWeek({ ...options, view: 'month', calendarUrl: options.calendarUrl || backup.calendarUrl || '' }),
    getWorkWeek({ ...options, view: 'next-month', calendarUrl: options.calendarUrl || backup.calendarUrl || '' }),
  ]);

  const wishlistLive = wishlistRow.status === 'fulfilled' ? wishlistRow.value : null;
  const productsLive = productsRow.status === 'fulfilled' ? productsRow.value : null;
  const savesLive = savesRow.status === 'fulfilled' ? savesRow.value : null;

  const wishlist = wishlistLive?.initialized ? wishlistLive : (backup.wishlist || wishlistLive || {});
  const products = productsLive?.initialized ? productsLive : (backup.products || productsLive || {});
  const saves = savesLive?.initialized ? savesLive : (backup.savedItems || savesLive || {});

  const rows = [];

  for (const item of Array.isArray(wishlist?.items) ? wishlist.items : []) {
    addResult(rows, terms, {
      kind: 'Вишлист',
      title: item.text,
      text: [item.owner, item.url, item.done ? 'выполнено' : 'активно'].filter(Boolean).join(' · '),
      tab: 'wishlist',
      item: item.id,
    });
  }

  for (const item of Array.isArray(products?.items) ? products.items : []) {
    addResult(rows, terms, {
      kind: 'Кухня',
      title: item.text,
      text: [item.category, item.weeklyAmount, item.addedBy].filter(Boolean).join(' · '),
      tab: 'products',
      item: item.id,
    });
  }

  for (const item of Array.isArray(products?.history) ? products.history : []) {
    addResult(rows, terms, {
      kind: 'Кухня · история',
      title: item.text,
      text: [item.category, item.boughtBy, item.boughtAt].filter(Boolean).join(' · '),
      tab: 'products',
      item: '',
    });
  }

  for (const item of Array.isArray(saves?.items) ? saves.items : []) {
    const payload = item.payload || {};
    if (item.type === 'date') {
      addResult(rows, terms, {
        kind: 'Сохранения · Свидания',
        title: payload.title || 'Свидание',
        text: [payload.description, payload.duration, payload.period, item.savedBy].filter(Boolean).join(' · '),
        tab: 'saves',
        item: item.id,
      });
    } else if (item.type === 'recipe') {
      addResult(rows, terms, {
        kind: 'Сохранения · Рецепты',
        title: payload.title || 'Рецепт',
        text: savedRecipeText(payload),
        tab: 'saves',
        item: item.id,
      });
    }
  }

  const message = messageRow.status === 'fulfilled' ? messageRow.value : (backup.partnerMessage || null);
  if (message) {
    addResult(rows, terms, {
      kind: 'Послание',
      title: message.authorName ? 'Послание от ' + message.authorName : 'Послание',
      text: message.text,
      tab: 'home',
      item: '',
    });
  }

  const feed = feedRow.status === 'fulfilled' ? feedRow.value : {};
  for (const [name, section] of Object.entries(feed?.sections || {})) {
    const kind = name === 'facts' ? 'Лента · Факты'
      : name === 'events' ? 'Лента · События'
      : name === 'cinema' ? 'Лента · Кино'
      : 'Лента';

    (Array.isArray(section?.parts) ? section.parts : []).forEach((part, index) => {
      const text = clean(part, 4000);
      addResult(rows, terms, {
        kind,
        title: text.split(/[.!?\n]/)[0].slice(0, 180) || kind,
        text,
        tab: 'feed',
        item: name + ':' + index,
      });
    });

    (Array.isArray(section?.items) ? section.items : []).forEach((item) => {
      addResult(rows, terms, {
        kind,
        title: item.title || kind,
        text: [item.releaseDate, ...(item.sources || [])].filter(Boolean).join(' · '),
        tab: 'feed',
        item: '',
      });
    });
  }

  const activity = activityRow.status === 'fulfilled' ? activityRow.value : {};
  for (const item of Array.isArray(activity?.items) ? activity.items : []) {
    addResult(rows, terms, {
      kind: 'Активность',
      title: item.text,
      text: [item.actor, item.createdAt].filter(Boolean).join(' · '),
      tab: item.targetTab || 'home',
      item: '',
    });
  }

  for (const calendar of [calendarRow, nextCalendarRow]) {
    if (calendar.status !== 'fulfilled') continue;
    for (const day of Array.isArray(calendar.value?.days) ? calendar.value.days : []) {
      const eventsText = calendarText(day);
      if (!eventsText) continue;
      addResult(rows, terms, {
        kind: 'Календарь',
        title: day.date,
        text: eventsText,
        tab: 'schedule',
        item: day.date,
      });
    }
  }

  const deduped = [];
  const seen = new Set();
  for (const row of rows.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'ru'))) {
    const key = [row.kind, row.tab, row.item, row.title, row.text].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
    if (deduped.length >= MAX_RESULTS) break;
  }

  return deduped.map(({ score, ...row }) => row);
}

module.exports = {
  MAX_RESULTS,
  normalize,
  scoreText,
  searchGlobalData,
};
