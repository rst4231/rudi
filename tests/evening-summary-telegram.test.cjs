const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const { buildEveningSummary }=require('../api/habit-reminder.cjs');

const root=path.join(__dirname,'..');

test('evening summary starts with name and good evening',()=>{
  const text=buildEveningSummary('Рустам',{
    pending:2,
    taskCounts:{personal:1,shared:1,total:2},
    obligationRows:[{title:'Интернет',amount:850,paid:false}],
  });
  assert.equal(text.startsWith('Рустам, добрый вечер!\n\nЧто осталось на сегодня:'),true);
  assert.match(text,/• Привычки: 2/);
  assert.match(text,/• Личные дела: 1/);
  assert.match(text,/• Совместные дела: 1/);
  assert.match(text,/• Платежи: Интернет/);
  assert.doesNotMatch(text,/https?:\/\//);
  assert.doesNotMatch(text,/Открыть|кнопк/iu);
});

test('evening summary uses Telegram only, without push, buttons or links',()=>{
  const source=fs.readFileSync(path.join(root,'api','habit-reminder.cjs'),'utf8');
  assert.match(source,/telegramSendMessage/);
  assert.match(source,/parseMode:\s*false/);
  assert.doesNotMatch(source,/sendPushNotification/);
  assert.doesNotMatch(source,/readPendingPushNotifications/);
  assert.doesNotMatch(source,/reply_markup|buttonText|appUrlForTab/);
});

test('evening reminder cron remains scheduled for 21:00 Moscow',()=>{
  const config=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
  const row=(config.crons||[]).find(item=>item.path==='/api/habit-reminder-cron');
  assert.ok(row);
  assert.equal(row.schedule,'0 18 * * *');
});
