const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const moodAi=require('../api/mood-notification-ai.cjs');
const forDi=require('../api/for-di-feed-store.cjs');

function memoryCache(initial=null){
  let value=initial;
  return {
    async get(){return value},
    async set(_key,next){value=structuredClone(next);return true},
    async delete(){value=null;return true},
    read(){return value},
  };
}

test('mood AI generates exactly one short sentence',async()=>{
  const result=await moodAi.generateMoodMessage(
    {actor:'Рустам',recipient:'Диана',mood:'joy'},
    {
      apiKey:'test',
      fetch:async()=>({
        ok:true,status:200,
        async json(){return {choices:[{message:{content:'Похоже, у Рустама сегодня радостное настроение 😄'}}]}}
      }),
    }
  );
  assert.equal(result,'Похоже, у Рустама сегодня радостное настроение 😄');
  assert.doesNotMatch(result,/\n/);
  assert.equal(result.split(/(?<=[.!?])\s+/).filter(Boolean).length,1);
  assert.match(moodAi.promptForMood('Рустам','Диана','joy'),/ровно одно короткое естественное предложение/);
});

test('labor items older than seven days are pruned without touching other For Di items',async()=>{
  forDi.resetMutationQueueForTests();
  const now=Date.parse('2026-09-26T12:00:00Z');
  const cache=memoryCache({
    initialized:true,
    version:1,
    items:[
      {id:'old-labor',dateKey:'2026-09-18',text:'Старый трудовой материал',source:'labor',createdAt:'2026-09-18T11:59:59Z',likes:[]},
      {id:'week-labor',dateKey:'2026-09-19',text:'Трудовой материал ровно семь дней',source:'labor',createdAt:'2026-09-19T12:00:00Z',likes:[]},
      {id:'other-old',dateKey:'2026-09-01',text:'Другой материал',source:'other',createdAt:'2026-09-01T12:00:00Z',likes:[]},
    ],
  });
  const result=await forDi.pruneExpiredLaborItems({forDiFeedCache:cache,now});
  assert.equal(result.removed,1);
  assert.deepEqual(result.state.items.map(row=>row.id),['week-labor','other-old']);
});

test('daily question answer records activity and awaits Telegram instead of background waitUntil',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','api','partner-message.js'),'utf8');
  const start=source.indexOf("if (action === 'daily-question')");
  const end=source.indexOf("if (action === 'partner-message-like')",start);
  const block=source.slice(start,end);
  assert.match(block,/await appendActivity\(activityRow,options\)/);
  assert.match(block,/for\(let attempt=0;attempt<2&&!journalRecorded;attempt\+=1\)/);
  assert.match(block,/const notification=await sendDailyQuestionAnswerNotification\(actor,options\)/);
  assert.doesNotMatch(block,/waitUntil\(notificationTask\)/);
});

test('mood notification uses Groq with safe fallback',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','api','partner-message.js'),'utf8');
  const start=source.indexOf('async function sendMoodNotificationToPartner');
  const end=source.indexOf('const TELEGRAM_PROFILE_CACHE_TTL_MS',start);
  const block=source.slice(start,end);
  assert.match(block,/await generateMoodMessage/);
  assert.match(block,/RUDI_MOOD_AI_FALLBACK/);
  assert.match(block,/text = fallback/);
});
