const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');
const { generateDailyQuestion } = require('./daily-question-ai.cjs');

const NAMESPACE='rudi-daily-question-v1';
const HISTORY_NAMESPACE='rudi-daily-question-history-v1';
const DAY_TTL_SECONDS=60*60*48;
const HISTORY_TTL_SECONDS=60*60*24*3650;
const HISTORY_KEY='question-history';
const MAX_HISTORY=1500;
const ACTORS=['Рустам','Диана'];
let mutationTail=Promise.resolve();

function cacheOf(options={}){
  return options.dailyQuestionCache||options.cache||createStrictRuntimeCache({
    namespace:NAMESPACE,
    ...(options.cacheOptions||{}),
  });
}
function historyCacheOf(options={}){
  return options.dailyQuestionHistoryCache||createStrictRuntimeCache({
    namespace:HISTORY_NAMESPACE,
    ...(options.cacheOptions||{}),
  });
}
function dateKey(value=Date.now()){
  const date=new Date(value);
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const map=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  return map.year+'-'+map.month+'-'+map.day;
}
function shiftDateKey(key,days){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(key||''))) return '';
  const date=new Date(String(key)+'T12:00:00Z');
  date.setUTCDate(date.getUTCDate()+Number(days||0));
  return date.toISOString().slice(0,10);
}
function rowKey(date){return 'day:'+date}
function cleanAnswer(value){
  const text=String(value||'').replace(/\r\n?/g,'\n').trim();
  if(!text) throw new Error('daily-question-answer-empty');
  if(text.length>1000) throw new Error('daily-question-answer-too-long');
  return text;
}
function normalizeAnswer(value){
  const text=String(value?.text||'').trim();
  return text?{text:text.slice(0,1000),answeredAt:String(value?.answeredAt||'')}:null;
}
function normalizeRow(value,date){
  const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const question=String(source?.question?.text||'').trim().slice(0,220);
  return {
    date:String(date||source.date||''),
    question:question?{
      id:String(source.question?.id||'').trim(),
      text:question,
      theme:String(source.question?.theme||'').trim().slice(0,60),
      createdAt:String(source.question?.createdAt||''),
      model:String(source.question?.model||''),
      provider:String(source.question?.provider||''),
    }:null,
    answers:{
      'Рустам':normalizeAnswer(source?.answers?.['Рустам']),
      'Диана':normalizeAnswer(source?.answers?.['Диана']),
    },
  };
}
function normalizeHistory(value){
  const rows=Array.isArray(value?.items)?value.items:Array.isArray(value)?value:[];
  const seen=new Set();
  return rows.map(row=>({
    date:String(row?.date||''),
    question:String(row?.question||'').replace(/\s+/g,' ').trim().slice(0,220),
    theme:String(row?.theme||'').trim().slice(0,60),
  })).filter(row=>{
    const key=row.question.toLocaleLowerCase('ru-RU').replace(/ё/g,'е');
    if(!key||seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0,MAX_HISTORY);
}
function questionView(row,actor){
  if(!ACTORS.includes(actor)) throw new Error('daily-question-actor-invalid');
  const normalized=normalizeRow(row,row?.date);
  const partner=actor==='Рустам'?'Диана':'Рустам';
  const mine=normalized.answers[actor];
  const partnerAnswer=normalized.answers[partner];
  const revealed=Boolean(mine&&partnerAnswer);
  return {
    date:normalized.date,
    question:normalized.question,
    actor,
    partner,
    mineAnswered:Boolean(mine),
    partnerAnswered:Boolean(partnerAnswer),
    revealed,
    answers:revealed?{
      'Рустам':normalized.answers['Рустам'],
      'Диана':normalized.answers['Диана'],
    }:null,
  };
}
function enqueue(task){
  const run=mutationTail.then(task,task);
  mutationTail=run.catch(()=>{});
  return run;
}
async function ensureDailyQuestion(options={}){
  return enqueue(async()=>{
    const now=Number(options.now||Date.now());
    const date=dateKey(now);
    const cache=cacheOf(options);
    const existing=normalizeRow(await cache.get(rowKey(date)).catch(()=>null),date);
    if(existing.question?.text) return existing;

    const historyCache=historyCacheOf(options);
    const history=normalizeHistory(await historyCache.get(HISTORY_KEY).catch(()=>null));
    const generated=await (options.generateQuestion||generateDailyQuestion)(history,{
      env:options.env||process.env,
      fetch:options.fetch||global.fetch,
      apiKey:options.apiKey,
      timeoutMs:options.timeoutMs,
    });

    const concurrent=normalizeRow(await cache.get(rowKey(date)).catch(()=>null),date);
    if(concurrent.question?.text) return concurrent;

    const createdAt=new Date(now).toISOString();
    const row=normalizeRow({
      date,
      question:{
        id:'dq-'+date,
        text:generated.question,
        theme:generated.theme,
        createdAt,
        model:generated.model,
        provider:generated.provider,
      },
      answers:{},
    },date);

    await cache.set(rowKey(date),row,{
      ttl:DAY_TTL_SECONDS,
      tags:['rudi-daily-question'],
      name:rowKey(date),
    });
    await historyCache.set(HISTORY_KEY,{
      items:normalizeHistory({items:[{date,question:row.question.text,theme:row.question.theme},...history]}),
      updatedAt:createdAt,
    },{
      ttl:HISTORY_TTL_SECONDS,
      tags:['rudi-daily-question-history'],
      name:HISTORY_KEY,
    });

    const yesterday=shiftDateKey(date,-1);
    if(yesterday) await cache.delete(rowKey(yesterday)).catch(()=>false);
    return row;
  });
}
async function readDailyQuestion(actor,options={}){
  const row=await ensureDailyQuestion(options);
  return questionView(row,actor);
}
async function answerDailyQuestion(actor,value,options={}){
  if(!ACTORS.includes(actor)) throw new Error('daily-question-actor-invalid');
  const answer=cleanAnswer(value);
  await ensureDailyQuestion(options);
  return enqueue(async()=>{
    const now=Number(options.now||Date.now());
    const date=dateKey(now);
    const cache=cacheOf(options);
    const row=normalizeRow(await cache.get(rowKey(date)).catch(()=>null),date);
    if(!row.question?.text) throw new Error('daily-question-missing');
    if(row.answers[actor]) throw new Error('daily-question-already-answered');
    row.answers[actor]={text:answer,answeredAt:new Date(now).toISOString()};
    await cache.set(rowKey(date),row,{
      ttl:DAY_TTL_SECONDS,
      tags:['rudi-daily-question'],
      name:rowKey(date),
    });
    return questionView(row,actor);
  });
}
function resetMutationQueueForTests(){mutationTail=Promise.resolve()}
module.exports={
  NAMESPACE,HISTORY_NAMESPACE,DAY_TTL_SECONDS,HISTORY_TTL_SECONDS,HISTORY_KEY,MAX_HISTORY,
  dateKey,shiftDateKey,normalizeRow,normalizeHistory,questionView,
  ensureDailyQuestion,readDailyQuestion,answerDailyQuestion,resetMutationQueueForTests,
};
