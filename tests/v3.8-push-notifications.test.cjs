const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');

const {
  derivePrivateScalar,
  publicApplicationServerKey,
  vapidAuthorization,
  normalizeSubscription,
  stripTelegramHtml,
}=require('../api/web-push.cjs');

test('web push uses a deterministic P-256 VAPID key derived from the RUDI secret',()=>{
  const left=derivePrivateScalar('test-secret');
  const right=derivePrivateScalar('test-secret');
  assert.equal(left.length,32);
  assert.deepEqual(left,right);
  const publicKey=publicApplicationServerKey({botToken:'test-secret'});
  assert.ok(publicKey.length>80);
});

test('VAPID authorization is scoped to the push endpoint origin',()=>{
  const auth=vapidAuthorization('https://push.example.test/send/abc',{
    botToken:'test-secret',
    now:Date.parse('2026-10-01T08:00:00Z'),
  });
  assert.match(auth.value,/^vapid t=[^,]+, k=[A-Za-z0-9_-]+$/);
  assert.equal(auth.publicKey,publicApplicationServerKey({botToken:'test-secret'}));
});

test('push subscriptions store only the endpoint needed for empty wake pushes',()=>{
  const row=normalizeSubscription({
    endpoint:'https://push.example.test/send/abc',
    expirationTime:null,
    keys:{p256dh:'unused',auth:'unused'},
  });
  assert.equal(row.endpoint,'https://push.example.test/send/abc');
  assert.equal(Object.prototype.hasOwnProperty.call(row,'keys'),false);
});

test('push notification copy strips Telegram HTML safely',()=>{
  assert.equal(stripTelegramHtml('🙂 <b>Диана, всё хорошо</b>'),'🙂 Диана, всё хорошо');
});

test('service worker receives pushes and deep-links notification clicks',()=>{
  const sw=fs.readFileSync(path.join(root,'public','sw.js'),'utf8');
  assert.match(sw,/addEventListener\('push'/);
  assert.match(sw,/rudiAction=push-pending/);
  assert.match(sw,/addEventListener\('notificationclick'/);
  assert.match(sw,/client\.navigate\(target\)/);
});

test('app registers device push subscription and keeps home deep links',()=>{
  const app=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
  assert.match(app,/pushManager\.subscribe/);
  assert.match(app,/rudiAction='\+encodeURIComponent\(action\)/);
  assert.match(app,/\['home','wishlist','products','dates','for-di','schedule','score','smart-saves'\]/);
  assert.match(app,/partner:'\[data-home-tile="partner"\]'/);
  assert.match(app,/'daily-question':'#dailyQuestionTile'/);
  assert.match(app,/'smart-home':'#smartHomeTile'/);
  assert.match(app,/Отправлять партнёру push-уведомление/);
  assert.match(app,/Получать push-уведомления партнёра/);
});

test('all requested personal alerts use app push routes',()=>{
  const api=fs.readFileSync(path.join(root,'api','partner-message.js'),'utf8');
  const lulu=fs.readFileSync(path.join(root,'api','lulu-toilet-alert.cjs'),'utf8');
  const fasting=fs.readFileSync(path.join(root,'api','lulu-toilet-cron.js'),'utf8');
  const humidity=fs.readFileSync(path.join(root,'api','smart-home-humidity-alert.cjs'),'utf8');

  assert.match(api,/title: '💌 Новое послание'[\s\S]*?url: '\/\?item=partner&fresh=1'/);
  assert.match(api,/title: '🙂 Настроение партнёра'[\s\S]*?url: '\/\?item=' \+ item/);
  assert.match(api,/title: '🐾 Прогулка с Лулу'[\s\S]*?url: '\/\?item=lulu'/);
  assert.match(api,/title: '🎁 Новое в вишлисте'[\s\S]*?url: '\/\?tab=wishlist'/);
  assert.match(api,/title:'💬 Ответ на вопрос дня'[\s\S]*?url:'\/\?item=daily-question'/);
  assert.match(api,/title:'Новое сообщение от '\+actor[\s\S]*?url:'\/\?tab=messenger&fresh=1'/);
  assert.match(api,/title:'⭐ Подарок звёзд'[\s\S]*?url:'\/\?tab=score&item='/);
  assert.match(lulu,/title: '🐾 Лулу хочет в туалет'[\s\S]*?url: '\/\?item=lulu'/);
  assert.match(fasting,/title: '⏱ Цель голодания достигнута'[\s\S]*?url: '\/\?tab=fasting'/);
  assert.match(humidity,/title:'💧 Низкая влажность дома'[\s\S]*?url:'\/\?item=smart-home'/);
});
