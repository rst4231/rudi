const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { getDailyLiteracyArticle, getMonthlyFinanceInsight, getFinancialAnalystReport } = require('../api/finance-ai.cjs');
const { handleTelegramTopicRequest } = require('../api/topic-maintenance.cjs');

function memoryCache() {
  const store = new Map();
  return {
    async get(key) { return store.get(key) || null; },
    async set(key,value) { store.set(key,value); return true; },
  };
}

test('AI outage returns explicit fallback without caching it',async()=>{
  const failedProvider={env:{GROQ_API_KEY:'test'},fetch:async()=>new Response('unavailable',{status:503}),financeAiCache:memoryCache()};
  const insight=await getMonthlyFinanceInsight({actor:'Тест',month:'2026-10',income:1000,expenses:200,version:1},failedProvider);
  assert.equal(insight.degraded,true);
  const literacy=await getDailyLiteracyArticle({...failedProvider,financeAiCache:memoryCache()});
  assert.equal(literacy.provider,'fallback');
  const analyst=await getFinancialAnalystReport({actor:'Тест',month:'2026-10',income:1000,expenses:200,version:1},{...failedProvider,financeAiCache:memoryCache()});
  assert.equal(analyst.degraded,true);
  assert.deepEqual(analyst.risks,[]);
});

test('retired group writes are suppressed but private Telegram messages pass',async()=>{
  let calls=0;
  const fetchImpl=async()=>{calls++;return new Response(JSON.stringify({ok:true,result:{message_id:4}}),{status:200})};
  const url='https://api.telegram.org/bottest/sendMessage';
  const blocked=await handleTelegramTopicRequest(url,{method:'POST',body:JSON.stringify({chat_id:'-1004476323368',text:'old'})},{fetchImpl});
  assert.equal((await blocked.json()).result.retired_group,true);
  assert.equal(calls,0);
  const direct=await handleTelegramTopicRequest(url,{method:'POST',body:JSON.stringify({chat_id:'123',text:'new'})},{fetchImpl});
  assert.equal(direct.ok,true);
  assert.equal(calls,1);
});

test('health endpoint cannot mutate old Telegram forum topics',()=>{
  const source=fs.readFileSync('api/control-plane-health.cjs','utf8');
  assert.doesNotMatch(source,/deleteLegacyLaborTopicOnce|syncConfiguredForumTopicNames/);
});

test('versioned assets are cached but HTML and update machinery remain fresh',()=>{
  const config=JSON.parse(fs.readFileSync('vercel.json','utf8'));
  const cacheValue=(source)=>{
    const row=config.headers.find(item=>item.source===source);
    assert.ok(row,'missing cache rule for '+source);
    return row.headers.find(header=>header.key.toLowerCase()==='cache-control')?.value||'';
  };
  for(const source of ['/app.js','/app.css','/pwa-extras.js','/pwa-extras.css','/personal-center.js','/personal-center.css']){
    assert.match(cacheValue(source),/public.*immutable/);
  }
  for(const source of ['/','/index.html','/sw.js','/version.json']){
    assert.match(cacheValue(source),/no-store/);
  }
  const html=fs.readFileSync('public/index.html','utf8');
  for(const asset of ['app.js','app.css','pwa-extras.js','personal-center.js']){
    const versioned=new RegExp('/'+asset.replace(/\./g,'\\.')+'\\?v=\\d+\\.\\d+');
    assert.match(html,versioned,'release-versioned URL missing for '+asset);
  }
  const pwa=fs.readFileSync('public/pwa-extras.js','utf8');
  assert.match(pwa,/checkForUpdate\(true\);/);
  assert.match(pwa,/window\.setInterval/);
});
