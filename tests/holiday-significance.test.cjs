const test = require('node:test');
const assert = require('node:assert/strict');
const {
  rankHolidayEntries,
  rewriteHolidayTelegramRequest,
} = require('../api/holiday-significance.cjs');

const entries = [
  'День рождения смайлика',
  'День России',
  'Международный день демократии',
  'День свободных денег',
  'Рождество Христово',
  'День работников санитарно-эпидемиологической службы России',
  'Всемирный день борьбы с лимфомами',
];

test('holiday ranking returns no more than five most significant entries', () => {
  const selected = rankHolidayEntries(entries, 5);
  assert.equal(selected.length, 5);
  assert.ok(selected.includes('День России'));
  assert.ok(selected.includes('Рождество Христово'));
  assert.ok(selected.includes('Международный день демократии'));
  assert.ok(selected.includes('Всемирный день борьбы с лимфомами'));
  assert.ok(!selected.includes('День рождения смайлика'));
  assert.ok(!selected.includes('День свободных денег'));
});

test('holiday telegram request keeps header and sends only configured maximum', () => {
  const text = ['🎉 Праздники сегодня', '', ...entries.map((entry) => `• ${entry}`)].join('\n');
  const init = {
    method: 'POST',
    body: JSON.stringify({
      chat_id: -100123,
      message_thread_id: 44,
      text,
      parse_mode: 'HTML',
    }),
  };
  const rewritten = rewriteHolidayTelegramRequest(
    'https://api.telegram.org/bot1:abc/sendMessage',
    init,
    { sections: { holidays: { enabled: true, topicId: 44, maxItems: 5 } } },
  );
  const payload = JSON.parse(rewritten.body);
  const holidayLines = payload.text.split('\n').filter((line) => line.startsWith('• '));
  assert.match(payload.text, /^🎉 Праздники сегодня/);
  assert.equal(holidayLines.length, 5);
  assert.ok(holidayLines.some((line) => line.includes('День России')));
  assert.ok(!holidayLines.some((line) => line.includes('День рождения смайлика')));
});

test('non-holiday topics are left untouched', () => {
  const init = { body: JSON.stringify({ message_thread_id: 72, text: '• Раз\n• Два\n• Три\n• Четыре\n• Пять\n• Шесть' }) };
  assert.equal(rewriteHolidayTelegramRequest('https://api.telegram.org/bot1:abc/sendMessage', init, { sections: { holidays: { topicId: 44, maxItems: 5 } } }), init);
});
