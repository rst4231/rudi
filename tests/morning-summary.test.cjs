const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  filterTasksForActor,
  buildMorningSummary,
  sendDailyMorningSummaries,
  writeSummaryMarker,
} = require('../api/morning-summary.cjs');

function memoryCache() {
  const data = new Map();
  return {
    async get(key) { return data.has(key) ? structuredClone(data.get(key)) : null; },
    async set(key, value) { data.set(key, structuredClone(value)); return true; },
    async delete(key) { data.delete(key); return true; },
  };
}

const tasks = [
  { id:'r', title:'Задача Рустама', assigned:true, assignee:'RST', completed:false },
  { id:'d', title:'Задача Дианы', assigned:true, assignee:'Ди', completed:false },
  { id:'u', title:'Совместная задача', assigned:false, assignee:'Не назначен', completed:false },
  { id:'x', title:'Чужая задача', assigned:true, assignee:'Назначен', completed:false },
  { id:'c', title:'Готовая задача', assigned:true, assignee:'RST', completed:true },
];

test('morning summary task filter uses RST for Rustam, Ди for Diana, and includes unassigned for both', () => {
  assert.deepEqual(filterTasksForActor(tasks, 'Рустам').map(row=>row.id), ['r','u']);
  assert.deepEqual(filterTasksForActor(tasks, 'Диана').map(row=>row.id), ['d','u']);
});

test('personal summary shows Diana workday only to Diana and cycle status to both', () => {
  const common = {
    dateLabel:'22 сентября',
    tasks,
    workDay:{working:true,events:[{startTime:'09:00',endTime:'21:00'}]},
    moods:{
      'Рустам':{mood:'great'},
      'Диана':{mood:'ok'},
    },
    cycle:{moodWord:'Чувствительная',phase:'Лютеиновая фаза'},
    productCount:7,
    feedLines:['• новый полезный факт','• 2 Stand Up'],
  };

  const rustam = buildMorningSummary('Рустам', common);
  assert.match(rustam, /Задача Рустама/);
  assert.match(rustam, /Совместная задача/);
  assert.doesNotMatch(rustam, /Задача Дианы/);
  assert.doesNotMatch(rustam, /Сегодня рабочий день/);
  assert.match(rustam, /Диана по циклу/);
  assert.match(rustam, /Чувствительная/);
  assert.match(rustam, /лютеиновая фаза/);
  assert.match(rustam, /Как лучше сегодня с Дианой/);
  assert.match(rustam, /говорить мягче/);

  const diana = buildMorningSummary('Диана', common);
  assert.match(diana, /Задача Дианы/);
  assert.match(diana, /Совместная задача/);
  assert.doesNotMatch(diana, /Задача Рустама/);
  assert.match(diana, /Сегодня рабочий день/);
  assert.match(diana, /09:00–21:00/);
  assert.match(diana, /Твой статус по циклу/);
  assert.match(diana, /Чувствительная/);
  assert.doesNotMatch(diana, /Как лучше сегодня с Дианой/);
});

test('daily summary replaces feed notice, personalizes new partner activity, and sends once per day', async () => {
  const summaryCache=memoryCache();
  const now=new Date('2026-09-21T06:00:00Z');
  await writeSummaryMarker('Рустам','2026-09-20','2026-09-20T06:00:00.000Z',{summaryCache});
  await writeSummaryMarker('Диана','2026-09-20','2026-09-20T06:00:00.000Z',{summaryCache});

  const calls=[];
  const telegramFetchImpl=async(_url,init)=>{
    const payload=JSON.parse(init.body);
    calls.push(payload);
    return new Response(JSON.stringify({ok:true,result:{message_id:100+calls.length}}),{
      status:200,headers:{'content-type':'application/json'}
    });
  };

  const options={
    now,
    summaryCache,
    recipients:{'Рустам':1,'Диана':2},
    botToken:'test-token',
    telegramFetchImpl,
    loadTasksImpl:async()=>tasks,
    loadWorkDayImpl:async()=>({date:'2026-09-21',working:false,events:[]}),
    readMoodImpl:async()=>({date:'2026-09-21',moods:{
      'Рустам':{mood:'great',updatedAt:'2026-09-21T05:30:00Z'},
      'Диана':{mood:'ok',updatedAt:'2026-09-21T05:31:00Z'},
    }}),
    readCycleImpl:async()=>({
      historyStarts:['2026-08-25'],
      nextPeriodStart:'2026-09-24',
      cycleLengthDays:30,
      periodLengthDays:5,
      ovulationDay:16,
      fertileWindowStartDay:12,
      fertileWindowEndDay:18,
    }),
    readPartnerMessageImpl:async()=>({
      text:'Привет',
      authorName:'Диана',
      updatedAt:'2026-09-20T12:00:00Z',
    }),
    readWishlistImpl:async()=>({items:[
      {id:'1',text:'Подарок Дианы',owner:'Диана',done:false,createdAt:'2026-09-20T12:30:00Z'},
      {id:'2',text:'Подарок Рустама',owner:'Рустам',done:false,createdAt:'2026-09-20T13:00:00Z'},
    ]}),
    readProductsImpl:async()=>({items:[{id:'1'},{id:'2'}]}),
    readFeedImpl:async()=>({
      date:'2026-09-21',
      changedSections:['facts','events'],
      sections:{
        facts:{parts:['fact']},
        events:{parts:[
          'На эту дату концертов не найдено.',
          'Найдено событий/сеансов: <b>2</b>\n1. A\n2. B',
        ]},
      },
    }),
  };

  const first=await sendDailyMorningSummaries(options);
  const second=await sendDailyMorningSummaries(options);

  assert.equal(first.sent,2);
  assert.equal(second.sent,0);
  assert.equal(calls.length,2);

  const rustam=calls.find(row=>row.chat_id===1);
  const diana=calls.find(row=>row.chat_id===2);

  assert.match(rustam.text,/Рустам, доброе утро/);
  assert.match(rustam.text,/Задача Рустама/);
  assert.doesNotMatch(rustam.text,/Задача Дианы/);
  assert.match(rustam.text,/Новое послание от Дианы/);
  assert.match(rustam.text,/Подарок Дианы/);
  assert.doesNotMatch(rustam.text,/Подарок Рустама/);
  assert.match(rustam.text,/Чувствительная/);
  assert.match(rustam.text,/Как лучше сегодня с Дианой/);
  assert.match(rustam.text,/говорить мягче/);
  assert.match(rustam.text,/2 Stand Up/);
  assert.doesNotMatch(rustam.text,/я обновил Ленту/);

  assert.match(diana.text,/Диана, доброе утро/);
  assert.match(diana.text,/Задача Дианы/);
  assert.doesNotMatch(diana.text,/Задача Рустама/);
  assert.match(diana.text,/Сегодня выходной/);
  assert.doesNotMatch(diana.text,/Новое послание от Дианы/);
  assert.match(diana.text,/Подарок Рустама/);
  assert.match(diana.text,/Чувствительная/);
  assert.doesNotMatch(diana.text,/Как лучше сегодня с Дианой/);

  assert.match(rustam.reply_markup.inline_keyboard[0][0].web_app.url,/[?&]tab=home/);
  assert.match(diana.reply_markup.inline_keyboard[0][0].web_app.url,/[?&]tab=home/);
});

test('Vercel cron sends the morning summary at 07:10 Moscow', () => {
  const config=JSON.parse(fs.readFileSync(path.join(__dirname,'..','vercel.json'),'utf8'));
  const row=config.crons.find(item=>item.path==='/api/feed-notify-cron');
  assert.equal(row.schedule,'10 4 * * *');

  const cronSource=fs.readFileSync(path.join(__dirname,'..','api','feed-notify-cron.js'),'utf8');
  assert.match(cronSource,/sendDailyMorningSummaries/);
  assert.doesNotMatch(cronSource,/sendDailyFeedNotifications/);
});
