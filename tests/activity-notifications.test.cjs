const test = require('node:test');
const assert = require('node:assert/strict');
const {
  boughtNotificationText,
  wishlistNotificationText,
  moodNotificationText,
  sendMoodNotificationToPartner,
  sendWishlistNotificationToPartner,
  taskCompletedNotificationText,
  sendTaskCompletedNotificationToPartner,
  dailyQuestionAnswerNotificationText,
  sendDailyQuestionAnswerNotification,
  checklistCompletedNotificationText,
  sendChecklistCompletedNotificationToPartner,
  sendCycleStartNotificationToRustam,
  luluWalkStatusLabel,
  luluWalkNotificationText,
  sendLuluWalkNotificationToPartner,
} = require('../api/partner-message.js');
const {
  DEFAULT_APP_URL,
  appUrlForTab,
  telegramSendMessage,
  escapeTelegramHtml,
} = require('../api/telegram-notifications.cjs');

test('RUDI user-facing Telegram links use the Render fallback by default and remain externally configurable', () => {
  assert.equal(DEFAULT_APP_URL, 'https://rudi-proxy.onrender.com');
  assert.equal(appUrlForTab('feed'), 'https://rudi-proxy.onrender.com/?tab=feed');
  assert.equal(
    appUrlForTab('wishlist', { env: { RUDI_APP_URL: 'https://example.test/rudi' }, item: 'wish-1' }),
    'https://example.test/rudi?tab=wishlist&item=wish-1'
  );
});

test('activity notification copy is rich, gender-aware and escapes user content', () => {
  assert.match(boughtNotificationText('Рустам'), /^🛒 <b>Рустам купил продукты<\/b>$/);
  assert.match(boughtNotificationText('Диана'), /Диана купила продукты/);

  const wish = wishlistNotificationText('Диана', '<script>Подарок & мечта</script>');
  assert.match(wish, /^🎁 <b>Диана добавила в вишлист<\/b>/);
  assert.doesNotMatch(wish, /<script>/);
  assert.match(wish, /&lt;script&gt;/);

  assert.match(moodNotificationText('Диана', 'Рустам', 'joy'), /😄 <b>Диана, Рустам сейчас радостен<\/b>/);
  assert.match(moodNotificationText('Диана', 'Рустам', 'neutral'), /😐 <b>Диана, Рустам сейчас без ярких эмоций<\/b>/);
  assert.match(moodNotificationText('Рустам', 'Диана', 'fatigue'), /😩 <b>Рустам, Диана сейчас устала<\/b>/);
  assert.doesNotMatch(moodNotificationText('Диана', 'Рустам', 'joy'), /Настроение обновлено в RUDI|\n/);
  assert.match(taskCompletedNotificationText('Рустам', 'Купить <уголь>'), /✅ <b>Рустам выполнил задачу<\/b>/);
  assert.match(taskCompletedNotificationText('Рустам', 'Купить <уголь>'), /&lt;уголь&gt;/);
  assert.match(checklistCompletedNotificationText('Диана', 'Купить мясо', 'Шашлыки'), /☑️ <b>Диана выполнила пункт<\/b>/);
});

test('telegram sender enables HTML formatting without Web App buttons', async () => {
  let payload;
  const result = await telegramSendMessage(123, '✅ <b>Готово</b>', {
    botToken: 'test-token',
    tab: 'wishlist',
    item: 'wish-123',
    buttonText: 'Открыть вишлист',
    fetchImpl: async (_url, init) => {
      payload = JSON.parse(init.body);
      return new Response(JSON.stringify({ ok: true, result: { message_id: 77 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  assert.equal(payload.parse_mode, 'HTML');
  assert.equal(payload.reply_markup, undefined);
  assert.equal(result.messageId, 77);
  assert.equal(escapeTelegramHtml('<&>'), '&lt;&amp;&gt;');
});


test('mood change notification goes only to the other partner', async () => {
  const calls=[];
  const sendPushNotificationImpl=async(actor,payload)=>{
    calls.push({actor,payload});
    return {sent:true,delivered:1};
  };

  const fromRustam=await sendMoodNotificationToPartner('Рустам','joy',{
    sendPushNotificationImpl,
    fetch:async()=>{throw new Error('no-ai')},
  });
  assert.equal(fromRustam.sent,true);
  assert.equal(fromRustam.recipient,'Диана');
  assert.equal(calls[0].actor,'Диана');
  assert.equal(calls[0].payload.url,'/?item=rustam');

  calls.length=0;
  const fromDiana=await sendMoodNotificationToPartner('Диана','love',{
    sendPushNotificationImpl,
    fetch:async()=>{throw new Error('no-ai')},
  });
  assert.equal(fromDiana.sent,true);
  assert.equal(fromDiana.recipient,'Рустам');
  assert.equal(calls[0].actor,'Рустам');
  assert.equal(calls[0].payload.url,'/?item=diana');
});



test('wishlist addition notification goes only to the other partner',async()=>{
  const calls=[];
  const sendPushNotificationImpl=async(actor,payload)=>{
    calls.push({actor,payload});
    return {sent:true,delivered:1};
  };

  const fromRustam=await sendWishlistNotificationToPartner('Рустам','Подарок',{sendPushNotificationImpl});
  assert.equal(fromRustam.sent,true);
  assert.equal(fromRustam.recipient,'Диана');
  assert.equal(calls[0].actor,'Диана');
  assert.equal(calls[0].payload.url,'/?tab=wishlist');

  calls.length=0;
  const fromDiana=await sendWishlistNotificationToPartner('Диана','Мечта',{sendPushNotificationImpl});
  assert.equal(fromDiana.sent,true);
  assert.equal(fromDiana.recipient,'Рустам');
  assert.equal(calls[0].actor,'Рустам');
});



test('Lulu walk notification is one line without time',()=>{
  const now=Date.parse('2026-09-23T07:45:00.000Z');
  const walkedAt='2026-09-23T06:42:00.000Z';
  assert.equal(luluWalkStatusLabel(walkedAt,now),'сегодня в 09:42');
  assert.equal(luluWalkNotificationText('Рустам'), '🐾 <b>Рустам погулял с Лулу</b>');
  assert.equal(luluWalkNotificationText('Диана'), '🐾 <b>Диана погуляла с Лулу</b>');
  assert.doesNotMatch(luluWalkNotificationText('Рустам'),/\n|Последняя прогулка|09:42/);
});


test('Lulu walk notification goes only to the other partner',async()=>{
  const calls=[];
  const sendPushNotificationImpl=async(actor,payload)=>{
    calls.push({actor,payload});
    return {sent:true,delivered:1};
  };
  const walkedAt='2026-09-23T06:42:00.000Z';

  const fromRustam=await sendLuluWalkNotificationToPartner('Рустам',walkedAt,{sendPushNotificationImpl});
  assert.equal(fromRustam.sent,true);
  assert.equal(fromRustam.recipient,'Диана');
  assert.equal(calls[0].actor,'Диана');
  assert.equal(calls[0].payload.url,'/?item=lulu');

  calls.length=0;
  const fromDiana=await sendLuluWalkNotificationToPartner('Диана',walkedAt,{sendPushNotificationImpl});
  assert.equal(fromDiana.sent,true);
  assert.equal(fromDiana.recipient,'Рустам');
  assert.equal(calls[0].actor,'Рустам');
});



test('daily question answer notification goes only to the other partner in both directions',async()=>{
  const calls=[];
  const sendPushNotificationImpl=async(actor,payload)=>{
    calls.push({actor,payload});
    return {sent:true,delivered:1};
  };

  const fromRustam=await sendDailyQuestionAnswerNotification('Рустам',{sendPushNotificationImpl});
  assert.equal(fromRustam.sent,true);
  assert.equal(fromRustam.recipient,'Диана');
  assert.equal(calls[0].actor,'Диана');
  assert.equal(calls[0].payload.url,'/?item=daily-question');
  assert.match(calls[0].payload.body,/Сам ответ откроется/);

  calls.length=0;
  const fromDiana=await sendDailyQuestionAnswerNotification('Диана',{sendPushNotificationImpl});
  assert.equal(fromDiana.sent,true);
  assert.equal(fromDiana.recipient,'Рустам');
  assert.equal(calls[0].actor,'Рустам');
  assert.match(dailyQuestionAnswerNotificationText('Диана'),/Сам ответ скрыт/);
});


test('completed shared task push goes only to the other partner in both directions',async()=>{
  const calls=[];
  const sendPushNotificationImpl=async(actor,payload)=>{
    calls.push({actor,payload});
    return {sent:true,delivered:1};
  };

  const fromRustam=await sendTaskCompletedNotificationToPartner('Рустам','Купить продукты',{sendPushNotificationImpl});
  assert.equal(fromRustam.sent,true);
  assert.equal(fromRustam.recipient,'Диана');
  assert.equal(calls.length,1);
  assert.equal(calls[0].actor,'Диана');
  assert.equal(calls[0].payload.title,'✅ Партнёр выполнил совместную задачу');
  assert.equal(calls[0].payload.url,'/?item=priority');
  assert.match(calls[0].payload.body,/Рустам выполнил/);

  calls.length=0;
  const fromDiana=await sendTaskCompletedNotificationToPartner('Диана','Убраться дома',{sendPushNotificationImpl});
  assert.equal(fromDiana.sent,true);
  assert.equal(fromDiana.recipient,'Рустам');
  assert.equal(calls[0].actor,'Рустам');
  assert.match(calls[0].payload.body,/Диана выполнила/);
});

test('completed checklist item uses partner-only app push',async()=>{
  const calls=[];
  const sendPushNotificationImpl=async(actor,payload)=>{
    calls.push({actor,payload});
    return {sent:true,delivered:1};
  };
  const result=await sendChecklistCompletedNotificationToPartner(
    'Диана','Купить мясо','Шашлыки',{sendPushNotificationImpl}
  );
  assert.equal(result.sent,true);
  assert.equal(result.recipient,'Рустам');
  assert.equal(calls.length,1);
  assert.equal(calls[0].actor,'Рустам');
  assert.equal(calls[0].payload.title,'☑️ Выполнен пункт внутри совместной задачи');
  assert.equal(calls[0].payload.url,'/?item=priority');
  assert.match(calls[0].payload.body,/Купить мясо/);
});

test('cycle start is an app push to Rustam only',async()=>{
  const calls=[];
  const sendPushNotificationImpl=async(actor,payload)=>{
    calls.push({actor,payload});
    return {sent:true,delivered:1};
  };
  const result=await sendCycleStartNotificationToRustam({sendPushNotificationImpl});
  assert.equal(result.sent,true);
  assert.equal(calls.length,1);
  assert.equal(calls[0].actor,'Рустам');
  assert.equal(calls[0].payload.title,'🩸 Диана отметила начало месячных');
  assert.equal(calls[0].payload.url,'/?tab=schedule&item=cycle');
});
