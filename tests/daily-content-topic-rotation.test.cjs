const test = require('node:test');
const assert = require('node:assert/strict');

const catalog = require('../config/daily-content.json');
const sequence = require('../config/daily-content-sequence.json');
const settings = require('../config/rudi-settings.json');
const {
  FACTS_TOPIC_ID,
  chooseSequencedEntry,
  formatCatalogEntry,
  wrapDailyContentDedupe,
} = require('../api/daily-content-dedupe.cjs');
const { applySequenceState, validateCatalog } = require('../api/daily-content-config.cjs');

const EXPECTED_WEEKDAYS = {
  monday: 'Здоровье',
  tuesday: 'Наука',
  wednesday: 'Сон',
  thursday: 'Психология мужчин',
  friday: 'Питание',
  saturday: 'Движение',
  sunday: 'Психология женщин',
};

test('Полезные факты закреплены за днями недели на три недели без повторов', () => {
  assert.equal(settings.sources.dailyContentConfigUrl, 'https://raw.githubusercontent.com/rst4231/rudi/main/config/daily-content.json');
  assert.equal(sequence.enabled, true);
  assert.equal(sequence.startDate, '2026-09-09');
  assert.equal(sequence.luluStartId, 'lulu-booties-fit');
  assert.equal(sequence.factsExhaustionPolicy, 'suppress-until-replenished');
  assert.deepEqual(sequence.factsWeekdays, EXPECTED_WEEKDAYS);

  const scheduled = [];
  for (let offset = 0; offset < 21; offset += 1) {
    const date = new Date(Date.parse('2026-09-09T00:00:00.000Z') + offset * 86_400_000);
    const dateKey = date.toISOString().slice(0, 10);
    const selected = chooseSequencedEntry({ ...catalog, sequence }, 'facts', dateKey);
    assert.ok(selected.replacement, `${dateKey}: факт должен быть запланирован`);
    scheduled.push(selected.replacement.entry);
  }

  assert.deepEqual(
    scheduled.map((entry) => entry.category),
    [
      'Сон', 'Психология мужчин', 'Питание', 'Движение', 'Психология женщин', 'Здоровье', 'Наука',
      'Сон', 'Психология мужчин', 'Питание', 'Движение', 'Психология женщин', 'Здоровье', 'Наука',
      'Сон', 'Психология мужчин', 'Питание', 'Движение', 'Психология женщин', 'Здоровье', 'Наука',
    ],
  );
  assert.equal(new Set(scheduled.map((entry) => entry.id)).size, scheduled.length, 'ID фактов не должны повторяться');
  assert.equal(scheduled[10].id, 'facts-rotation-movement-more-benefits');

  for (const entry of scheduled) {
    assert.match(entry.sourceUrl, /^https?:\/\//);
    assert.ok(entry.body.length >= 80, `${entry.id}: факт слишком короткий`);
    assert.ok(entry.application?.length >= 35, `${entry.id}: нет практического применения`);
    assert.match(formatCatalogEntry(entry), /🧩 <b>Как использовать в жизни<\/b>/);
  }

  const psychology = scheduled.filter((entry) => entry.category.startsWith('Психология'));
  assert.equal(psychology.length, 6);
  for (const entry of psychology) {
    assert.match(entry.body, /(в среднем|не правило|не описыва)/i, `${entry.id}: нужна оговорка про среднюю тенденцию`);
  }
});

test('все факты, запланированные до новой ротации, исключены навсегда', () => {
  const retired = new Set([...catalog.publishedIds, ...sequence.retiredIds]);
  const expected = [
    'facts-sleep-7h',
    'facts-sleep-schedule',
    'facts-morning-light',
    'facts-sleep-activity',
    'facts-activity-minimum',
    'facts-strength-2days',
    'facts-some-activity',
    'facts-sedentary',
    'facts-walking-heart',
    'facts-walking-start-small',
    'facts-fruitveg-400',
    'facts-fiber-25',
    'facts-frozen-veg',
    'facts-juice-sugar',
    'facts-whole-grains',
    'facts-diet-diversity',
    'facts-minimally-processed',
    'facts-rotation-sleep-consistency',
  ];

  for (const id of expected) assert.ok(retired.has(id), `${id}: опубликованный факт не исключён`);
});

function emptyCache() {
  const values = new Map();
  return {
    async get(key) { return values.get(key); },
    async set(key, value) { values.set(key, value); },
  };
}

test('обёртка не публикует исключённый факт даже при пустом runtime-кэше', async () => {
  const liveCatalog = validateCatalog(applySequenceState(catalog, sequence));
  let calls = 0;
  const wrapped = wrapDailyContentDedupe(async () => {
    calls += 1;
    return new Response(JSON.stringify({ ok: true, result: { message_id: 900 } }));
  }, {
    cache: emptyCache(),
    catalog: liveCatalog,
    alwaysReplace: true,
    now: new Date('2026-09-08T21:30:00.000Z'),
  });

  const response = await wrapped('https://api.telegram.org/bot1:test/sendMessage', {
    method: 'POST',
    body: JSON.stringify({ chat_id: -1001, message_thread_id: FACTS_TOPIC_ID, text: 'runtime fact' }),
  });

  assert.equal(calls, 0);
  assert.equal((await response.json()).result.suppressed_duplicate, true);
});

test('после исключённого дня обёртка публикует следующий свежий факт', async () => {
  const liveCatalog = validateCatalog(applySequenceState(catalog, sequence));
  let sentBody = null;
  const wrapped = wrapDailyContentDedupe(async (_url, init) => {
    sentBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ ok: true, result: { message_id: 901 } }));
  }, {
    cache: emptyCache(),
    catalog: liveCatalog,
    alwaysReplace: true,
    now: new Date('2026-09-09T21:30:00.000Z'),
  });

  await wrapped('https://api.telegram.org/bot1:test/sendMessage', {
    method: 'POST',
    body: JSON.stringify({ chat_id: -1001, message_thread_id: FACTS_TOPIC_ID, text: 'runtime fact' }),
  });

  assert.match(sentBody.text, /Психология мужчин/);
  assert.match(sentBody.text, /Как использовать в жизни/);
});
