const test = require('node:test');
const assert = require('node:assert/strict');
const {
  boughtNotificationText,
  wishlistNotificationText,
  moodNotificationText,
  sendMoodNotificationToPartner,
  sendWishlistNotificationToPartner,
  taskCompletedNotificationText,
  checklistCompletedNotificationText,
} = require('../api/partner-message.js');
const {
  telegramSendMessage,
  escapeTelegramHtml,
} = require('../api/telegram-notifications.cjs');

test('activity notification copy is rich, gender-aware and escapes user content', () => {
  assert.match(boughtNotificationText('Рустам'), /^🛒 <b>Рустам купил продукты<\/b>$/);
  assert.match(boughtNotificationText('Диана'), /Диана купила продукты/);

  const wish = wishlistNotificationText('Диана', '<script>Подарок & мечта</script>');
  assert.match(wish, /^🎁 <b>Диана добавила в вишлист<\/b>/);
  assert.doesNotMatch(wish, /<script>/);
  assert.match(wish, /&lt;script&gt;/);

  assert.match(moodNotificationText('Диана', 'Рустам', 'great'), /😄 <b>Диана, у Рустама сейчас отличное настроение<\/b>/);
  assert.match(taskCompletedNotificationText('Рустам', 'Купить <уголь>'), /✅ <b>Рустам выполнил задачу<\/b>/);
  assert.match(taskCompletedNotificationText('Рустам', 'Купить <уголь>'), /&lt;уголь&gt;/);
  assert.match(checklistCompletedNotificationText('Диана', 'Купить мясо', 'Шашлыки'), /☑️ <b>Диана выполнила пункт<\/b>/);
});

test('telegram sender enables HTML formatting and target app tab', async () => {
  let payload;
  const result = await telegramSendMessage(123, '✅ <b>Готово</b>', {
    botToken: 'test-token',
    tab: 'schedule',
    buttonText: 'Открыть календарь',
    fetchImpl: async (_url, init) => {
      payload = JSON.parse(init.body);
      return new Response(JSON.stringify({ ok: true, result: { message_id: 77 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  assert.equal(payload.parse_mode, 'HTML');
  assert.equal(payload.reply_markup.inline_keyboard[0][0].text, 'Открыть календарь');
  assert.match(payload.reply_markup.inline_keyboard[0][0].web_app.url, /[?&]tab=schedule/);
  assert.equal(result.messageId, 77);
  assert.equal(escapeTelegramHtml('<&>'), '&lt;&amp;&gt;');
});


test('mood change notification goes only to the other partner', async () => {
  const calls = [];
  const fetchImpl = async (_url, init) => {
    calls.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ ok: true, result: { message_id: 91 + calls.length } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const fromRustam = await sendMoodNotificationToPartner('Рустам', 'great', {
    recipients: { 'Рустам': 111, 'Диана': 222 },
    botToken: 'test-token',
    fetchImpl,
  });
  assert.equal(fromRustam.sent, true);
  assert.equal(fromRustam.recipient, 'Диана');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].chat_id, 222);

  calls.length = 0;
  const fromDiana = await sendMoodNotificationToPartner('Диана', 'ok', {
    recipients: { 'Рустам': 111, 'Диана': 222 },
    botToken: 'test-token',
    fetchImpl,
  });
  assert.equal(fromDiana.sent, true);
  assert.equal(fromDiana.recipient, 'Рустам');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].chat_id, 111);
});


test('wishlist addition notification goes only to the other partner',async()=>{
  const calls=[];
  const fetchImpl=async(_url,init)=>{
    calls.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ok:true,result:{message_id:200+calls.length}}),{
      status:200,headers:{'content-type':'application/json'}
    });
  };

  const fromRustam=await sendWishlistNotificationToPartner('Рустам','Подарок',{
    recipients:{'Рустам':111,'Диана':222},botToken:'test-token',fetchImpl
  });
  assert.equal(fromRustam.sent,true);
  assert.equal(fromRustam.recipient,'Диана');
  assert.equal(calls.length,1);
  assert.equal(calls[0].chat_id,222);

  calls.length=0;
  const fromDiana=await sendWishlistNotificationToPartner('Диана','Мечта',{
    recipients:{'Рустам':111,'Диана':222},botToken:'test-token',fetchImpl
  });
  assert.equal(fromDiana.sent,true);
  assert.equal(fromDiana.recipient,'Рустам');
  assert.equal(calls.length,1);
  assert.equal(calls[0].chat_id,111);
});
