const crypto = require('node:crypto');
const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const NAMESPACE = 'rudi-product-list-v1';
const STATE_KEY = 'products';
const TTL_SECONDS = 60 * 60 * 24 * 3650;
const MAX_ACTIVE = 200;
const MAX_HISTORY = 500;
const MAX_TEXT = 180;

let mutationQueue = Promise.resolve();

function cacheOf(options = {}) {
  return options.productCache || options.cache || createStrictRuntimeCache({ namespace: NAMESPACE });
}

function normalizeText(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) throw new Error('product-text-empty');
  if (text.length > MAX_TEXT) throw new Error('product-text-too-long');
  return text;
}

function keyOf(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('ru-RU');
}

function categorizeProduct(value) {
  const text = keyOf(value);

  const rules = [
    ['Мясо и рыба', /(мяс|говя|свин|кур|индей|фарш|котлет|колбас|сосиск|ветчин|бекон|рыб|лосос|семг|сёмг|форел|тунец|кревет|морепродукт|минтай|кальмар|треск|скумбри|хек|сельд|сардин|дорад|сибас|палтус|камбал|миди|осьминог|гребеш|гребёш)/u],
    ['Овощи и зелень', /(картоф|томат|помид|огур(?:ец|ц\p{L}*|чик\p{L}*)|капуст|морков|лук|чеснок|перец|баклаж|кабач|тыкв|св[её]кл|редис|салат|укроп|петруш|кинз|зелень|броккол|цветн)/u],
    ['Фрукты и ягоды', /(яблок|банан|апельс|мандарин|лимон(?!ад)|лайм|груш|виноград|персик|нектар|абрикос|слив(?:а|ы|у|е|ой|ою|ам|ами|ах)(?!\p{L})|арбуз|дын|киви|манго|ананас|ягод|клубник|малин|голубик|черник|вишн|черешн)/u],
    ['Молочное и яйца', /(молок|кефир|йогур|творог|сыр|сметан|сливк|масло слив|ряжен|яйц)/u],
    ['Хлеб и выпечка', /(хлеб|батон(?!чик)|булк|лаваш|лепеш|лепёш|багет|выпеч|круассан|пирог)/u],
    ['Бакалея', /(макарон|паст[аы](?!\s+зуб)|рис|греч|круп|мук|сахар|соль|специ|приправ|масло раст|оливков|соус|кетчуп|майонез|консерв|фасол|горох|чечев|овсян|хлопь)/u],
    ['Сладкое и снеки', /(шоколад|конфет|печень|вафл|мармелад|зефир|торт|чипс|сухар|орех|батончик|морожен(?:ое|ого|ому|ым|ом|ые|ых|ыми)?(?!\p{L}))/u],
    ['Напитки', /(вод[аы]\b|сок|газиров|кола|чай|кофе|морс|компот|энергет|лимонад)/u],
    ['Заморозка', /(заморож|пельмен|вареник|наггет|заморозк)/u],
    ['Для дома', /(бумаг|салфет|пакет|губк|моющ|порошок|капсул|средство для|перчатк|фольг|пл[её]нк|мусор)/u],
    ['Гигиена', /(шампун|гель|мыло|паст[аы] зуб|щетк|щёт|дезодорант|крем|ватн|бритв|проклад|тампон)/u],
    ['Для Лулу', /(лулу|корм|лакомств|пеленк|наполнитель|миска|ошейник|поводок)/u],
  ];
  for (const [category, pattern] of rules) if (pattern.test(text)) return category;
  return 'Другое';
}

function estimateWeeklyAmount(value, category = categorizeProduct(value)) {
  const text = keyOf(value);
  const specific = [
    [/(яйц)/u, '20 шт.'],
    [/(молок)/u, '4 л'],
    [/(кефир|ряжен)/u, '2 л'],
    [/(йогур)/u, '8 шт.'],
    [/(творог)/u, '1 кг'],
    [/(сыр)/u, '500 г'],
    [/(сметан)/u, '400–500 г'],
    [/(сливочн.*масл|масло слив)/u, '400 г'],
    [/(кур|индей)/u, '1,5–2 кг'],
    [/(говя|свин)/u, '1–1,5 кг'],
    [/(фарш|котлет)/u, '1–1,2 кг'],
    [/(рыб|лосос|семг|сёмг|форел|тунец|минтай|треск|скумбри|хек|сельд|сардин|дорад|сибас|палтус|камбал)/u, '1–1,2 кг'],
    [/(кревет|морепродукт|кальмар|миди|осьминог|гребеш|гребёш)/u, '800 г–1 кг'],
    [/(колбас|сосиск|ветчин|бекон)/u, '500–700 г'],
    [/(картоф)/u, '3 кг'],
    [/(томат|помид)/u, '1,5 кг'],
    [/(огур)/u, '1,2 кг'],
    [/(морков)/u, '1 кг'],
    [/(лук)/u, '1 кг'],
    [/(чеснок)/u, '2 головки'],
    [/(капуст)/u, '1 кочан'],
    [/(перец)/u, '6–8 шт.'],
    [/(кабач|баклаж)/u, '1 кг'],
    [/(броккол|цветн)/u, '800 г–1 кг'],
    [/(салат|укроп|петруш|кинз|зелень)/u, '2–3 пучка'],
    [/(яблок)/u, '2 кг'],
    [/(банан)/u, '1,5 кг'],
    [/(апельс|мандарин)/u, '1,5 кг'],
    [/(груш)/u, '1,5 кг'],
    [/(виноград)/u, '1 кг'],
    [/(ягод|клубник|малин|голубик|черник|вишн|черешн)/u, '700–800 г'],
    [/(лимон|лайм)/u, '4–5 шт.'],
    [/(киви|персик|нектар|абрикос|слив)/u, '1 кг'],
    [/(арбуз|дын)/u, '1 шт.'],
    [/(хлеб|батон|багет)/u, '3 шт.'],
    [/(лаваш|лепеш|лепёш)/u, '2 упаковки'],
    [/(булк|круассан)/u, '6–8 шт.'],
    [/(макарон|паст[аы])/u, '1 кг'],
    [/(рис)/u, '1 кг'],
    [/(греч)/u, '1 кг'],
    [/(овсян|хлопь)/u, '800 г–1 кг'],
    [/(фасол|чечев|горох)/u, '700–800 г'],
    [/(мук)/u, '1 кг'],
    [/(сахар)/u, '1 кг'],
    [/(соль)/u, '1 упаковка'],
    [/(масло раст|оливков)/u, '1 л'],
    [/(кетчуп|майонез|соус)/u, '1 упаковка'],
    [/(специ|приправ)/u, '1 упаковка'],
    [/(вод[аы]\b)/u, '20–28 л'],
    [/(сок|морс|компот|лимонад|газиров|кола)/u, '3–4 л'],
    [/(кофе)/u, '400–500 г'],
    [/(чай)/u, '1 упаковка'],
    [/(шоколад)/u, '2–3 плитки'],
    [/(конфет)/u, '500 г'],
    [/(печень|вафл|мармелад|зефир)/u, '500–700 г'],
    [/(орех)/u, '400–500 г'],
    [/(чипс|сухар)/u, '2 упаковки'],
    [/(морожен(?:ое|ого|ому|ым|ом|ые|ых|ыми)?(?!\p{L}))/u, '4 шт.'],
    [/(пельмен|вареник|наггет)/u, '1,5 кг'],
    [/(корм)/u, 'недельный запас по норме Лулу'],
    [/(лакомств|пеленк|наполнитель)/u, '1 упаковка'],
    [/(бумаг.*туалет|салфет|пакет|губк|перчатк|фольг|пл[её]нк|моющ|порошок|капсул|средство для)/u, '1 упаковка'],
    [/(шампун|гель|мыло|паст[аы] зуб|дезодорант|крем)/u, '1 упаковка'],
  ];
  for (const [pattern, amount] of specific) if (pattern.test(text)) return amount;

  const fallback = {
    'Мясо и рыба': '1–1,5 кг',
    'Овощи и зелень': '1–1,5 кг',
    'Фрукты и ягоды': '1,5 кг',
    'Молочное и яйца': '1–2 упаковки',
    'Хлеб и выпечка': '2–3 упаковки',
    'Бакалея': '1 упаковка',
    'Сладкое и снеки': '1–2 упаковки',
    'Напитки': '3–4 л',
    'Заморозка': '1–1,5 кг',
    'Для дома': '1 упаковка',
    'Гигиена': '1 упаковка',
    'Для Лулу': '1 недельный запас',
    'Другое': '1 упаковка',
  };
  return fallback[category] || fallback.Другое;
}

function normalizeState(value) {
  const items = Array.isArray(value?.items) ? value.items : [];
  const history = Array.isArray(value?.history) ? value.history : [];
  return {
    initialized: Boolean(value?.initialized),
    version: Number(value?.version || 0),
    items: items.map((item) => ({
      id: String(item?.id || ''),
      text: String(item?.text || '').trim().slice(0, MAX_TEXT),
      addedBy: String(item?.addedBy || ''),
      category: categorizeProduct(item?.text),
      weeklyAmount: estimateWeeklyAmount(item?.text, categorizeProduct(item?.text)),
      checked: Boolean(item?.checked),
      createdAt: String(item?.createdAt || ''),
    })).filter((item) => item.id && item.text).slice(0, MAX_ACTIVE),
    history: history.map((item) => ({
      id: String(item?.id || ''),
      text: String(item?.text || '').trim().slice(0, MAX_TEXT),
      addedBy: String(item?.addedBy || ''),
      boughtBy: String(item?.boughtBy || ''),
      category: categorizeProduct(item?.text),
      weeklyAmount: estimateWeeklyAmount(item?.text, categorizeProduct(item?.text)),
      boughtAt: String(item?.boughtAt || ''),
    })).filter((item) => item.id && item.text && item.boughtAt).slice(0, MAX_HISTORY),
  };
}

async function readRaw(options = {}) {
  return normalizeState(await cacheOf(options).get(STATE_KEY));
}

async function writeState(state, options = {}) {
  const next = normalizeState({
    ...state,
    initialized: true,
    version: Date.now(),
  });
  await cacheOf(options).set(STATE_KEY, next, {
    ttl: TTL_SECONDS,
    tags: ['rudi-products'],
  });
  return next;
}

function enqueue(task) {
  const run = mutationQueue.then(task, task);
  mutationQueue = run.then(() => undefined, () => undefined);
  return run;
}

async function initializeFromLegacy(options = {}) {
  const current = await readRaw(options);
  if (current.initialized) return current;

  let legacy = [];
  try {
    const productsState = require('./products-state.cjs');
    legacy = await productsState.readProductsHistory();
  } catch (error) {
    console.warn('RUDI_PRODUCTS_MIGRATION_WARN', String(error?.message || error));
  }

  const now = new Date(options.now || Date.now()).toISOString();
  const seen = new Set();
  const items = [];
  for (const value of Array.isArray(legacy) ? legacy : []) {
    let text = '';
    try { text = normalizeText(value); } catch { continue; }
    const key = keyOf(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    items.push({
      id: crypto.randomUUID(),
      text,
      addedBy: 'RUDI',
      category: categorizeProduct(text),
      weeklyAmount: estimateWeeklyAmount(text),
      checked: false,
      createdAt: now,
    });
    if (items.length >= MAX_ACTIVE) break;
  }
  // Do not turn a cache miss with no legacy data into a fresh, initialized empty list.
  // A fresh empty version can incorrectly outrank a valid encrypted backup during recovery.
  if (!items.length) return current;
  return writeState({ ...current, items }, options);
}

async function readProductListRaw(options = {}) {
  return readRaw(options);
}

async function restoreProductListSnapshot(snapshot, options = {}) {
  const normalized = normalizeState(snapshot);
  if (!normalized.initialized) return readRaw(options);
  return writeState(normalized, options);
}

async function readProductList(options = {}) {
  return initializeFromLegacy(options);
}

async function addProducts(values, addedBy = '', options = {}) {
  return enqueue(async () => {
    const state = await readProductList(options);
    const existing = new Set(state.items.map((item) => keyOf(item.text)));
    const now = new Date(options.now || Date.now()).toISOString();
    for (const value of Array.isArray(values) ? values : [values]) {
      const text = normalizeText(value);
      const key = keyOf(text);
      if (!key || existing.has(key)) continue;
      state.items.unshift({
        id: crypto.randomUUID(),
        text,
        addedBy: String(addedBy || ''),
        category: categorizeProduct(text),
        weeklyAmount: estimateWeeklyAmount(text),
        checked: false,
        createdAt: now,
      });
      existing.add(key);
      if (state.items.length >= MAX_ACTIVE) break;
    }
    return writeState(state, options);
  });
}

async function removeProduct(id, options = {}) {
  return enqueue(async () => {
    const state = await readProductList(options);
    const before = state.items.length;
    state.items = state.items.filter((item) => item.id !== String(id || ''));
    if (state.items.length === before) throw new Error('product-item-not-found');
    return writeState(state, options);
  });
}

async function removeProductByText(value, options = {}) {
  return enqueue(async () => {
    const state = await readProductList(options);
    const target = keyOf(value);
    if (!target) return { deleted: false, text: '', state };

    let index = state.items.findIndex((item) => keyOf(item.text) === target);
    if (index < 0) index = state.items.findIndex((item) => keyOf(item.text).includes(target) || target.includes(keyOf(item.text)));
    if (index < 0) return { deleted: false, text: String(value || '').trim(), state };

    const [item] = state.items.splice(index, 1);
    return { deleted: true, text: item.text, state: await writeState(state, options) };
  });
}

async function toggleProductChecked(id, options = {}) {
  return enqueue(async () => {
    const state = await readProductList(options);
    const item = state.items.find((row) => row.id === String(id || ''));
    if (!item) throw new Error('product-item-not-found');
    item.checked = !Boolean(item.checked);
    return writeState(state, options);
  });
}

async function markCheckedProductsBought(boughtBy = '', options = {}) {
  return enqueue(async () => {
    const state = await readProductList(options);
    const checked = state.items.filter((item) => Boolean(item.checked));
    if (!checked.length) return writeState(state, options);

    const checkedIds = new Set(checked.map((item) => item.id));
    const boughtAt = new Date(options.now || Date.now()).toISOString();
    const historyRows = checked.map((item) => ({
      id: crypto.randomUUID(),
      text: item.text,
      addedBy: String(item.addedBy || ''),
      boughtBy: String(boughtBy || ''),
      category: categorizeProduct(item.text),
      weeklyAmount: estimateWeeklyAmount(item.text),
      boughtAt,
    }));

    state.items = state.items.filter((item) => !checkedIds.has(item.id));
    state.history = [...historyRows, ...state.history].slice(0, MAX_HISTORY);
    return writeState(state, options);
  });
}

async function markProductBought(id, boughtBy = '', options = {}) {
  return enqueue(async () => {
    const state = await readProductList(options);
    const index = state.items.findIndex((item) => item.id === String(id || ''));
    if (index < 0) throw new Error('product-item-not-found');
    const [item] = state.items.splice(index, 1);
    state.history.unshift({
      id: crypto.randomUUID(),
      text: item.text,
      addedBy: String(item.addedBy || ''),
      boughtBy: String(boughtBy || ''),
      category: categorizeProduct(item.text),
      weeklyAmount: estimateWeeklyAmount(item.text),
      boughtAt: new Date(options.now || Date.now()).toISOString(),
    });
    state.history = state.history.slice(0, MAX_HISTORY);
    return writeState(state, options);
  });
}

async function clearProducts(options = {}) {
  return enqueue(async () => {
    const state = await readProductList(options);
    state.items = [];
    return writeState(state, options);
  });
}

async function restoreProducts(values, options = {}) {
  return enqueue(async () => {
    const state = await readProductList(options);
    const source = Array.isArray(values) ? values : [values];
    const existingIds = new Set(state.items.map((item) => String(item.id || '')));
    const existingText = new Set(state.items.map((item) => keyOf(item.text)));
    const restored = [];

    for (const raw of source) {
      const item = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
      let text = '';
      try { text = normalizeText(item.text); } catch { continue; }
      const textKey = keyOf(text);
      if (!textKey || existingText.has(textKey)) continue;
      const id = String(item.id || '').trim() || crypto.randomUUID();
      if (existingIds.has(id)) continue;
      restored.push({
        id,
        text,
        addedBy: String(item.addedBy || ''),
        category: categorizeProduct(text),
        weeklyAmount: estimateWeeklyAmount(text),
        checked: Boolean(item.checked),
        createdAt: String(item.createdAt || new Date(options.now || Date.now()).toISOString()),
      });
      existingIds.add(id);
      existingText.add(textKey);
      if (restored.length + state.items.length >= MAX_ACTIVE) break;
    }

    if (!restored.length) return state;
    state.items = [...restored, ...state.items].slice(0, MAX_ACTIVE);
    return writeState(state, options);
  });
}

function resetMutationQueueForTests() {
  mutationQueue = Promise.resolve();
}

module.exports = {
  NAMESPACE, MAX_ACTIVE, MAX_HISTORY, MAX_TEXT,
  readProductList, readProductListRaw, restoreProductListSnapshot, addProducts, removeProduct, removeProductByText,
  toggleProductChecked, markCheckedProductsBought, markProductBought, clearProducts, restoreProducts, normalizeText, keyOf, categorizeProduct, estimateWeeklyAmount,
  normalizeProductListState: normalizeState,
  resetMutationQueueForTests,
};
