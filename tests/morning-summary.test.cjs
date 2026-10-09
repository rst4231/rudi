const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  filterTasksForActor,
  feedSummaryLines,
  formatDate,
  buildCarRecommendations,
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

test('morning summary uses Moscow weekday even across UTC midnight', () => {
  assert.equal(formatDate(new Date('2026-10-09T04:27:00Z')), 'пятница, 9 октября');
  assert.equal(formatDate(new Date('2026-10-08T22:30:00Z')), 'пятница, 9 октября');
  assert.equal(formatDate(new Date('2026-10-09T21:30:00Z')), 'суббота, 10 октября');
});

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
    holidays:['Всемирный день улыбки'],
    feedLines:['• 2 Stand Up'],
    environment:{
      home:{temperature:23.2,humidity:56},
      weather:{temperature:16,code:2,minForecast:8,maxForecast:17,avgMean:12},
    },
    carTasksToday:[
      {id:'car-1',title:'Проверить давление в шинах',timing:'today'},
    ],
    carState:{mileage:44000,updatedAt:'2026-09-22T04:00:00.000Z'},
  };

  const rustam = buildMorningSummary('Рустам', common);
  assert.match(rustam, /Задача Рустама/);
  for(const text of [rustam,buildMorningSummary('Диана',common)]) {
    for(const block of [/Продукты/,/Сегодня в Ленте/,/Дом и погода/])assert.doesNotMatch(text,block);
  }
  assert.match(rustam, /Совместная задача/);
  assert.doesNotMatch(rustam, /Задача Дианы/);
  assert.doesNotMatch(rustam, /Сегодня рабочий день/);
  assert.match(rustam, /<b>Диана сегодня<\/b>/);
  assert.match(rustam, /09:00–21:00/);
  assert.match(rustam, /🌸 Цикл:/);
  assert.match(rustam, /Чувствительная/);
  assert.match(rustam, /лютеиновая фаза/);
  assert.match(rustam, /🤍 Совет:/);
  assert.match(rustam, /говори мягче/i);
  assert.match(rustam, /Праздники сегодня/);
  assert.match(rustam, /Всемирный день улыбки/);
  assert.doesNotMatch(rustam, /Дом и погода/);
  assert.doesNotMatch(rustam, /Дома: 23\.2°C · влажность 56%/);
  assert.doesNotMatch(rustam, /На улице: 16°C · облачно/);
  assert.match(rustam, /Машина/);
  assert.match(rustam,/Диана сегодня<\/b>\n💼 Работает: 09:00–21:00\n🌸 Цикл: <b>Чувствительная<\/b> · лютеиновая фаза\n🤍 Совет:/);
  assert.equal((rustam.match(/<b>Диана сегодня<\/b>/g)||[]).length,1);
  assert.match(rustam, /Шины: Можно на летних/);
  assert.match(rustam, /Мойка: сегодня/);
  assert.match(rustam, /Рекомендации:/);
  assert.match(rustam, /ТО через/);
  assert.match(rustam, /Проверить давление в шинах/);

  const diana = buildMorningSummary('Диана', common);
  assert.match(diana, /Задача Дианы/);
  assert.match(diana, /Совместная задача/);
  assert.doesNotMatch(diana, /Задача Рустама/);
  assert.match(diana, /Сегодня рабочий день/);
  assert.match(diana, /09:00–21:00/);
  assert.match(diana, /Твой статус по циклу/);
  assert.match(diana, /Чувствительная/);
  assert.doesNotMatch(diana, /🤍 Совет:/);
  assert.doesNotMatch(diana, /Дом и погода/);
  assert.doesNotMatch(diana, /Дома: 23\.2°C · влажность 56%/);
  assert.doesNotMatch(diana, /На улице: 16°C · облачно/);
  assert.doesNotMatch(diana, /Шины:/);
  assert.doesNotMatch(diana, /Проверить давление в шинах/);
});

test('Rustam morning Diana overview gracefully handles partial data and escapes values',()=>{
 const workOnly=buildMorningSummary('Рустам',{workDay:{working:true,events:[]},tasks:[]});
 assert.match(workOnly,/<b>Диана сегодня<\/b>\n💼 Работает/);
 assert.doesNotMatch(workOnly,/Цикл:|Совет:/);
 const cycleOnly=buildMorningSummary('Рустам',{cycle:{moodWord:'Тест <b>',phase:''},tasks:[]});
 assert.match(cycleOnly,/<b>Диана сегодня<\/b>\n🌸 Цикл: <b>Тест &lt;b&gt;<\/b>/);
 assert.doesNotMatch(cycleOnly,/Работает|Совет:/);
 const missing=buildMorningSummary('Рустам',{tasks:[]});
 assert.doesNotMatch(missing,/<b>Диана сегодня<\/b>/);
 const partner=buildMorningSummary('Диана',{workDay:{working:false},cycle:{moodWord:'Активная',phase:'Фертильное окно'},tasks:[]});
 assert.match(partner,/Сегодня выходной/);
 assert.match(partner,/Твой статус по циклу/);
 assert.doesNotMatch(partner,/<b>Диана сегодня<\/b>/);
});

test('feed summary keeps active Feed sections without retired facts', () => {
  const date='2026-09-24';
  const lines=feedSummaryLines({
    date,
    changedSections:[],
    sections:{
      cinema:{items:[{title:'Премьера'}],updatedAt:'2026-09-17T00:10:00+03:00'},
    },
  },date);
  assert.doesNotMatch(lines.join('\n'),/полезный факт/i);
  assert.match(lines.join('\n'),/кинопремьеры/);
});

test('car recommendations in morning summary match recommendation block rules', () => {
  const items=buildCarRecommendations(
    {mileage:44000},
    {minForecast:2,maxForecast:15,precipitationSum:8,avgMean:7}
  );
  assert.deepEqual(items.map(row=>row.title),['ТО скоро','Похолодание','Осадки']);
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
    loadTodayHolidaysImpl:async()=>['День осенней прогулки'],
    loadEnvironmentImpl:async()=>({
      home:{temperature:22.8,humidity:54},
      weather:{temperature:11,code:3,minForecast:4,maxForecast:12,avgMean:7,precipitationSum:0},
    }),
    readCarStateImpl:async()=>({mileage:44000,updatedAt:'2026-09-21T02:00:00.000Z'}),
    loadCarTasksImpl:async()=>({tasks:[
      {id:'today-car',title:'🚗 Чек-ап машины',timing:'today'},
      {id:'future-car',title:'Обновить Яндекс Карты',timing:'upcoming'},
    ]}),
    readFeedImpl:async()=>({
      date:'2026-09-21',
      changedSections:['events'],
      sections:{
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
  assert.match(rustam.text,/понедельник, 21 сентября/);
  assert.match(rustam.text,/💼 Сегодня выходной/);
  assert.match(rustam.text,/Задача Рустама/);
  assert.doesNotMatch(rustam.text,/Задача Дианы/);
  assert.doesNotMatch(rustam.text,/Новое послание/);
  assert.doesNotMatch(rustam.text,/Подарок Дианы|Подарок Рустама|Вишлист/);
  assert.match(rustam.text,/Вдумчивая/);
  assert.match(rustam.text,/🤍 Совет:/);
  assert.match(rustam.text,/не торопи с разговорами и решениями/i);
  assert.doesNotMatch(rustam.text,/2 Stand Up/);
  assert.doesNotMatch(rustam.text,/Дома: 22\.8°C · влажность 54%/);
  assert.doesNotMatch(rustam.text,/На улице: 11°C · пасмурно/);
  assert.match(rustam.text,/Шины: Лучше на зимних/);
  assert.match(rustam.text,/Мойка: сегодня/);
  assert.match(rustam.text,/Рекомендации:/);
  assert.match(rustam.text,/ТО через/);
  assert.match(rustam.text,/Чек-ап машины/);
  assert.match(rustam.text,/Праздники сегодня/);
  assert.match(rustam.text,/День осенней прогулки/);
  assert.doesNotMatch(rustam.text,/Обновить Яндекс Карты/);
  assert.doesNotMatch(rustam.text,/я обновил Ленту/);

  assert.match(diana.text,/Диана, доброе утро/);
  assert.match(diana.text,/понедельник, 21 сентября/);
  assert.match(diana.text,/Задача Дианы/);
  assert.doesNotMatch(diana.text,/Задача Рустама/);
  assert.match(diana.text,/Сегодня выходной/);
  assert.doesNotMatch(diana.text,/Новое послание/);
  assert.doesNotMatch(diana.text,/Подарок Дианы|Подарок Рустама|Вишлист/);
  assert.match(diana.text,/Праздники сегодня/);
  assert.match(diana.text,/День осенней прогулки/);
  assert.match(diana.text,/Вдумчивая/);
  assert.doesNotMatch(diana.text,/Дома: 22\.8°C · влажность 54%/);
  assert.doesNotMatch(diana.text,/На улице: 11°C · пасмурно/);
  assert.doesNotMatch(diana.text,/Шины:/);
  assert.doesNotMatch(diana.text,/Чек-ап машины/);
  assert.doesNotMatch(diana.text,/🤍 Совет:/);

  assert.equal(rustam.reply_markup,undefined);
  assert.equal(diana.reply_markup,undefined);
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
    loadTodayHolidaysImpl:async()=>[],
    readFeedImpl:async()=>({sections:{}}),
    loadEnvironmentImpl:async()=>({home:null,weather:null}),
    readCarStateImpl:async()=>null,
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
    loadTodayHolidaysImpl:async()=>[],
    readFeedImpl:async()=>({sections:{}}),
    loadEnvironmentImpl:async()=>({home:null,weather:null}),
    readCarStateImpl:async()=>null,
    loadCarTasksImpl:async()=>[],
  };

  await assert.rejects(
    () => sendDailyMorningSummaries(options),
    /morning-summary-recipients-missing:Диана/
  );
  assert.equal(calls.length,1);
});


test('morning summary retries Telegram 400 as plain text and never adds a Web App button', async () => {
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
    loadTodayHolidaysImpl:async()=>[],
    readFeedImpl:async()=>({sections:{}}),
    loadEnvironmentImpl:async()=>({home:null,weather:null}),
    loadCarTasksImpl:async()=>[],
  }).catch((error)=>error.result);
  assert.equal(result.sent,1);
  assert.equal(calls.length,2);
  assert.equal(calls[0].parse_mode,'HTML');
  assert.equal(calls[0].reply_markup,undefined);
  assert.equal(calls[1].parse_mode,undefined);
  assert.equal(calls[1].reply_markup,undefined);
  assert.doesNotMatch(calls[1].text,/<b>|<\/b>/);
});


test('morning summary cache tolerates Vercel eventual consistency', () => {
  const source=fs.readFileSync(path.join(__dirname,'..','api','morning-summary.cjs'),'utf8');
  assert.match(source,/namespace:\s*NAMESPACE,[\s\S]*?confirmWrites:\s*false/);
});
