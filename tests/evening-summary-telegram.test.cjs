const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const { buildEveningSummary,pendingHabitNames,pendingTaskDetails }=require('../api/habit-reminder.cjs');

const root=path.join(__dirname,'..');

test('evening summary starts with name and lists exact remaining items',()=>{
  const text=buildEveningSummary('Рустам',{
    pendingHabits:['🚶 10 000 шагов','Без сладкого'],
    taskDetails:{personal:['Оплатить парковку'],shared:['Купить продукты'],total:2},
    obligationRows:[{title:'Интернет',amount:850,paid:false}],
  });
  assert.equal(text.startsWith('Рустам, добрый вечер!\n\nЧто осталось на сегодня:'),true);
  assert.match(text,/Привычки:\n• 🚶 10 000 шагов\n• Без сладкого/);
  assert.match(text,/Личные дела:\n• Оплатить парковку/);
  assert.match(text,/Совместные дела:\n• Купить продукты/);
  assert.match(text,/Платежи: Интернет/);
  assert.doesNotMatch(text,/Привычки: 2|Личные дела: 1|Совместные дела: 1/);
  assert.doesNotMatch(text,/https?:\/\//);
  assert.doesNotMatch(text,/Открыть|кнопк/iu);
});

test('pending item helpers expose names instead of counts only',()=>{
  const habits=pendingHabitNames({
    habits:[
      {id:'h1',emoji:'🚶',name:'10 000 шагов'},
      {id:'h2',emoji:'',name:'Без сладкого'},
      {id:'h3',emoji:'💧',name:'Вода'},
    ],
    statuses:{h1:'pending',h2:'pending',h3:'done'},
  });
  assert.deepEqual(habits,['🚶 10 000 шагов','Без сладкого']);

  const tasks=pendingTaskDetails([
    {title:'Оплатить парковку',assigned:true,assignee:'RST',completed:false},
    {title:'Купить продукты',assigned:false,assignee:'Не назначен',completed:false},
  ],'Рустам');
  assert.deepEqual(tasks.personal,['Оплатить парковку']);
  assert.deepEqual(tasks.shared,['Купить продукты']);
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
