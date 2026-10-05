const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('v3.88 removes RUDI messenger and realtime surfaces',()=>{
  for(const file of [
    'public/messenger.js',
    'public/messenger.css',
    'api/messenger-store.cjs',
    'api/messenger-correction-ai.cjs',
    'api/cycle-messenger-advice-store.cjs',
    'api/realtime.js',
    'api/realtime-auth.cjs',
  ]) assert.equal(fs.existsSync(path.join(root,file)),false,file+' must be removed');

  const index=read('public/index.html');
  const app=read('public/app.js');
  const api=read('api/partner-message.js');
  const sw=read('public/sw.js');
  const vercel=JSON.parse(read('vercel.json'));

  assert.doesNotMatch(index,/messenger/i);
  assert.doesNotMatch(app,/RUDI_MESSENGER|messengerNotificationsEnabled|messengerUnreadCount/i);
  assert.doesNotMatch(api,/messenger-(?:send|list|edit|delete|reaction|typing|presence|read|rekey)|publishMessengerRealtime|queueMessengerRealtime|tab=messenger/i);
  assert.doesNotMatch(sw,/tab=messenger|rudi-messenger|RUDI_QUERY_MESSENGER/i);
  assert.equal(vercel.functions?.['api/realtime.js'],undefined);
});

test('v3.88 remaps navigation and photoshoot quick access',()=>{
  const index=read('public/index.html');
  const app=read('public/app.js');
  assert.match(index,/data-app-tab="schedule"[\s\S]*?<span>Календарь<\/span>/);
  assert.match(index,/id="quickPhotoSessionButton"[\s\S]*?Создать фотосессию/);
  assert.doesNotMatch(index,/quickCalendarButton/);
  assert.match(app,/quickPhotoSessionButton/);
  assert.match(app,/shared-album-create/);
});

test('v3.88 sends star and reward system events to Telegram',()=>{
  const api=read('api/partner-message.js');
  assert.match(api,/async function sendStarGiftNotification/);
  assert.match(api,/async function sendRewardRedeemedNotification/);
  assert.match(api,/async function sendRewardCompletedNotification/);
  assert.match(api,/⭐ <b>/);
  assert.match(api,/🎁 <b>/);
  assert.match(api,/✅ <b>Награда выполнена<\/b>/);
  const star=api.slice(api.indexOf('async function sendStarGiftNotification'),api.indexOf('async function sendCycleStartNotificationToRustam'));
  assert.match(star,/sendToAllRecipients/);
});

test('v3.87 push habits tasks and recipes stay intact in v3.88',()=>{
  const sw=read('public/sw.js');
  const webPush=read('api/web-push.cjs');
  const vercel=JSON.parse(read('vercel.json'));
  const app=read('public/app.js');
  const api=read('api/partner-message.js');
  const index=read('public/index.html');
  const css=read('public/app.css');

  assert.match(sw,/event\.data\?\.json/);
  assert.match(sw,/deliverDirectPushNotification/);
  assert.match(webPush,/sendPushPayload/);
  assert.match(webPush,/JSON\.stringify\(\{ rudiPush: 1, notification \}\)/);
  assert.ok(vercel.crons.some(row=>row.path==='/api/habit-reminder-cron'&&row.schedule==='0 18 * * *'));

  assert.doesNotMatch(api,/body\.emoji/);
  assert.match(app,/Ответственные Рустам и Диана/);
  assert.match(api,/responsible==='Рустам'\?'RST':'Ди'/);
  assert.match(css,/grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
  assert.match(css,/input\[type="date"\],\.ticktick-task-field input\[type="time"\][\s\S]*?min-width:0;max-width:100%;overflow:hidden/);

  for(const label of ['🔥 Духовка','🍳 Плита','🥘 Мультиварка','🌅 Завтрак','🍽️ Обед','🥪 Перекус','🌙 Ужин','⏱️ 5 мин','⏱️ 45 мин']) assert.match(index,new RegExp(label));
  assert.match(app,/⏱️ Таймер/);
  assert.match(app,/🥣 Каша/);
  assert.match(app,/🥞 Сырники\/блины/);
});
