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

test('personal summary shows Diana schedule to Rustam, own workday to Diana, and cycle status to both', () => {
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
    environment:{
      home:{temperature:23.2,humidity:56},
      weather:{temperature:16,code:2,minForecast:8,maxForecast:17,avgMean:12},
    },
    carTasksToday:[
      {id:'car-1',title:'Проверить давление в шинах',timing:'today'},
    ],
  };

  const rustam = buildMorningSummary('Рустам', common);
  assert.match(rustam, /Задача Рустама/);
  assert.match(rustam, /Совместная задача/);
  assert.doesNotMatch(rustam, /Задача Дианы/);
  assert.doesNotMatch(rustam, /Сегодня рабочий день/);
  assert.match(rustam, /Диана сегодня работает/);
  assert.match(rustam, /09:00–21:00/);
  assert.match(rustam, /Диана по циклу/);
  assert.match(rustam, /Чувствительная/);
  assert.match(rustam, /лютеиновая фаза/);
  assert.match(rustam, /Как лучше сегодня с Дианой/);
  assert.match(rustam, /говорить мягче/);
  assert.match(rustam, /Дом и погода/);
  assert.match(rustam, /Дома: 23\.2°C · влажность 56%/);
  assert.match(rustam, /На улице: 16°C · облачно/);
  assert.match(rustam, /Машина/);
  assert.match(rustam, /Шины:/);
  assert.match(rustam, /Проверить давление в шинах/);

  const diana = buildMorningSummary('Диана', common);
  assert.match(diana, /Задача Дианы/);
  assert.match(diana, /Совместная задача/);
  assert.doesNotMatch(diana, /Задача Рустама/);
  assert.match(diana, /Сегодня рабочий день/);
  assert.match(diana, /09:00–21:00/);
  assert.match(diana, /Твой статус по циклу/);
  assert.match(diana, /Чувствительная/);
  assert.doesNotMatch(diana, /Как лучше сегодня с Дианой/);
  assert.match(diana, /Дом и погода/);
  assert.match(diana, /Дома: 23\.2°C · влажность 56%/);
  assert.match(diana, /На улице: 16°C · облачно/);
  assert.doesNotMatch(diana, /Шины:/);
  assert.doesNotMatch(diana, /Проверить давление в шинах/);
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
    loadEnvironmentImpl:async()=>({
      home:{temperature:22.8,humidity:54},
      weather:{temperature:11,code:3,minForecast:4,maxForecast:12,avgMean:7},
    }),
    loadCarTasksImpl:async()=>({tasks:[
      {id:'today-car',title:'🚗 Чек-ап машины',timing:'today'},
      {id:'future-car',title:'Обновить Яндекс Карты',timing:'upcoming'},
    ]}),
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
  assert.deepEqual(second.skippedAlreadySent,['Рустам','Диана']);
  assert.equal(calls.length,2);

  const rustam=calls.find(row=>row.chat_id===1);
  const diana=calls.find(row=>row.chat_id===2);

  assert.match(rustam.text,/Рустам, доброе утро/);
  assert.match(rustam.text,/Диана сегодня не работает/);
  assert.match(rustam.text,/Задача Рустама/);
  assert.doesNotMatch(rustam.text,/Задача Дианы/);
  assert.match(rustam.text,/Новое послание от Дианы/);
  assert.match(rustam.text,/Подарок Дианы/);
  assert.doesNotMatch(rustam.text,/Подарок Рустама/);
  assert.match(rustam.text,/Вдумчивая/);
  assert.match(rustam.text,/Как лучше сегодня с Дианой/);
  assert.match(rustam.text,/не торопи с разговорами и решениями/i);
  assert.match(rustam.text,/2 Stand Up/);
  assert.match(rustam.text,/Дома: 22\.8°C · влажность 54%/);
  assert.match(rustam.text,/На улице: 11°C · пасмурно/);
  assert.match(rustam.text,/Шины:/);
  assert.match(rustam.text,/Чек-ап машины/);
  assert.doesNotMatch(rustam.text,/Обновить Яндекс Карты/);
  assert.doesNotMatch(rustam.text,/я обновил Ленту/);

  assert.match(diana.text,/Диана, доброе утро/);
  assert.match(diana.text,/Задача Дианы/);
  assert.doesNotMatch(diana.text,/Задача Рустама/);
  assert.match(diana.text,/Сегодня выходной/);
  assert.doesNotMatch(diana.text,/Новое послание от Дианы/);
  assert.match(diana.text,/Подарок Рустама/);
  assert.match(diana.text,/Вдумчивая/);
  assert.match(diana.text,/Дома: 22\.8°C · влажность 54%/);
  assert.match(diana.text,/На улице: 11°C · пасмурно/);
  assert.doesNotMatch(diana.text,/Шины:/);
  assert.doesNotMatch(diana.text,/Чек-ап машины/);
  assert.doesNotMatch(diana.text,/Как лучше сегодня с Дианой/);

  assert.match(rustam.reply_markup.inline_keyboard[0][0].web_app.url,/[?&]tab=home/);
  assert.match(diana.reply_markup.inline_keyboard[0][0].web_app.url,/[?&]tab=home/);
});

test('forced morning summary recovery resends even after today marker', async () => {
  const summaryCache=memoryCache();
  const now=new Date('2026-09-23T05:00:00Z');
  await writeSummaryMarker('Рустам','2026-09-23','2026-09-23T03:00:00.000Z',{summaryCache});
  await writeSummaryMarker('Диана','2026-09-23','2026-09-23T03:00:00.000Z',{summaryCache});
  const calls=[];
  const telegramFetchImpl=async(_url,init)=>{
    const payload=JSON.parse(init.body);
    calls.push(payload);
    return new Response(JSON.stringify({ok:true,result:{message_id:200+calls.length}}),{
      status:200,headers:{'content-type':'application/json'}
    });
  };
  const result=await sendDailyMorningSummaries({
    now,
    force:true,
    summaryCache,
    recipients:{'Рустам':1,'Диана':2},
    botToken:'test-token',
    telegramFetchImpl,
    loadTasksImpl:async()=>[],
    loadWorkDayImpl:async()=>null,
    readMoodImpl:async()=>({date:'2026-09-23',moods:{}}),
    readCycleImpl:async()=>null,
    readPartnerMessageImpl:async()=>null,
    readWishlistImpl:async()=>({items:[]}),
    readProductsImpl:async()=>({items:[]}),
    readFeedImpl:async()=>({sections:{}}),
    loadEnvironmentImpl:async()=>({home:null,weather:null}),
    loadCarTasksImpl:async()=>({tasks:[]}),
  });
  assert.equal(result.sent,2);
  assert.equal(result.forced,true);
  assert.equal(calls.length,2);
});

test('Vercel cron sends the morning summary at 06:00 Moscow', () => {
  const config=JSON.parse(fs.readFileSync(path.join(__dirname,'..','vercel.json'),'utf8'));
  const row=config.crons.find(item=>item.path==='/api/feed-notify-cron');
  assert.equal(row.schedule,'0 3 * * *');

  const cronSource=fs.readFileSync(path.join(__dirname,'..','api','feed-notify-cron.js'),'utf8');
  assert.match(cronSource,/sendDailyMorningSummaries/);
  assert.doesNotMatch(cronSource,/sendDailyFeedNotifications/);
});


test('today-only car task filter excludes future car tasks from Rustam summary', async () => {
  const { loadTodayCarTasks } = require('../api/morning-summary.cjs');
  const tasks = await loadTodayCarTasks({
    loadCarTasksImpl: async () => ({tasks:[
      {id:'1',title:'Сегодня',timing:'today'},
      {id:'2',title:'Завтра',timing:'upcoming'},
      {id:'3',title:'Просрочено',timing:'overdue'},
    ]}),
  });
  assert.deepEqual(tasks.map(row=>row.id),['1']);
});


test('morning summary reports missing recipients as failure instead of false success', async () => {
  const summaryCache=memoryCache();
  const calls=[];
  const options={
    now:new Date('2026-09-23T03:00:00Z'),
    summaryCache,
    recipients:{'Рустам':1,'Диана':null},
    botToken:'test-token',
    telegramFetchImpl:async(_url,init)=>{
      const payload=JSON.parse(init.body);
      calls.push(payload);
      return new Response(JSON.stringify({ok:true,result:{message_id:700+calls.length}}),{
        status:200,headers:{'content-type':'application/json'}
      });
    },
    loadTasksImpl:async()=>[],
    loadWorkDayImpl:async()=>null,
    readMoodImpl:async()=>({date:'2026-09-23',moods:{}}),
    readCycleImpl:async()=>null,
    readPartnerMessageImpl:async()=>null,
    readWishlistImpl:async()=>({items:[]}),
    readProductsImpl:async()=>({items:[]}),
    readFeedImpl:async()=>({sections:{}}),
    loadEnvironmentImpl:async()=>({home:null,weather:null}),
    loadCarTasksImpl:async()=>[],
  };

  await assert.rejects(
    () => sendDailyMorningSummaries(options),
    /morning-summary-recipients-missing:Диана/
  );
  assert.equal(calls.length,1);
});


test('morning summary retries Telegram 400 as plain text without Web App button', async () => {
  const summaryCache=memoryCache();
  const calls=[];
  const telegramFetchImpl=async(_url,init)=>{
    const payload=JSON.parse(init.body);
    calls.push(payload);
    if(calls.length===1){
      return new Response(JSON.stringify({ok:false,description:'Bad Request: cannot parse entities'}),{
        status:400,headers:{'content-type':'application/json'}
      });
    }
    return new Response(JSON.stringify({ok:true,result:{message_id:801}}),{
      status:200,headers:{'content-type':'application/json'}
    });
  };
  const result=await sendDailyMorningSummaries({
    now:new Date('2026-09-23T03:00:00Z'),
    summaryCache,
    recipients:{'Рустам':1,'Диана':null},
    botToken:'test-token',
    telegramFetchImpl,
    loadTasksImpl:async()=>[],
    loadWorkDayImpl:async()=>null,
    readMoodImpl:async()=>({date:'2026-09-23',moods:{}}),
    readCycleImpl:async()=>null,
    readPartnerMessageImpl:async()=>null,
    readWishlistImpl:async()=>({items:[]}),
    readProductsImpl:async()=>({items:[]}),
    readFeedImpl:async()=>({sections:{}}),
    loadEnvironmentImpl:async()=>({home:null,weather:null}),
    loadCarTasksImpl:async()=>[],
  }).catch((error)=>error.result);
  assert.equal(result.sent,1);
  assert.equal(calls.length,2);
  assert.equal(calls[0].parse_mode,'HTML');
  assert.ok(calls[0].reply_markup);
  assert.equal(calls[1].parse_mode,undefined);
  assert.equal(calls[1].reply_markup,undefined);
  assert.doesNotMatch(calls[1].text,/<b>|<\/b>/);
});


test('morning summary cache tolerates Vercel eventual consistency', () => {
  const source=fs.readFileSync(path.join(__dirname,'..','api','morning-summary.cjs'),'utf8');
  assert.match(source,/namespace:\s*NAMESPACE,[\s\S]*?confirmWrites:\s*false/);
});
