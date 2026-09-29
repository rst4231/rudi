const test = require('node:test');
const assert = require('node:assert/strict');

const {
  smartSaveMessageText,
  smartSaveMediaDescription,
} = require('../api/smart-saves-telegram.cjs');
const {
  DEFAULT_APP_URL,
  normalizeAppBase,
  appUrlForTab,
} = require('../api/telegram-notifications.cjs');

test('forwarded PDF without caption becomes a smart save payload', () => {
  assert.equal(
    smartSaveMessageText({ document: { file_name: 'Сборник рецептов .pdf' } }),
    'Сборник рецептов .pdf'
  );
  assert.equal(
    smartSaveMediaDescription({
      document: {
        file_name: 'Сборник рецептов .pdf',
        mime_type: 'application/pdf',
        file_size: 17.1 * 1024 * 1024,
      },
    }),
    'PDF · 17.1 МБ'
  );
});

test('caption wins over media fallback and textless media is still recognized', () => {
  assert.equal(
    smartSaveMessageText({ caption: 'Мой рецепт', document: { file_name: 'recipe.pdf' } }),
    'Мой рецепт'
  );
  assert.equal(smartSaveMessageText({ photo: [{}] }), 'Фото');
  assert.equal(smartSaveMessageText({ voice: { file_size: 1000 } }), 'Голосовое сообщение');
});

test('old Render app URL is forced to the production Vercel app URL', () => {
  assert.equal(DEFAULT_APP_URL, 'https://spb-daily-guide-bot.vercel.app/');
  assert.equal(
    normalizeAppBase('https://rudi-proxy.onrender.com'),
    'https://spb-daily-guide-bot.vercel.app/'
  );
  assert.equal(
    appUrlForTab('home', { env: { RUDI_APP_URL: 'https://rudi-proxy.onrender.com' } }),
    'https://spb-daily-guide-bot.vercel.app/?tab=home'
  );
});
