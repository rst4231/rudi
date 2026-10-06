const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const {createRudiStateClient}=require('../api/rudi-state-client.cjs');
const posterProxy=require('../api/poster-proxy.js');
const {handleTelegramTopicRequest,COUPLE_TOPIC_ID}=require('../api/topic-maintenance.cjs');

test('stable runtime uses D1 directly without probing legacy Postgres',async()=>{
  let d1Reads=0;
  let legacyReads=0;
  const d1Client={
    async getRecord(namespace,key){d1Reads+=1;return{namespace,key,value:{ok:true}}},
    async setRecord(){return{ok:true}},
    async set(){return true},
    async setIfAbsent(){return true},
    async remove(){return true},
    async list(){return[]},
    async expireTag(){return 0},
    async health(){return{ok:true}},
  };
  const vercelClient={
    async getRecord(){legacyReads+=1;throw new Error('legacy-postgres-should-not-be-called')},
  };
  const client=createRudiStateClient({env:{},d1Client,vercelClient});
  assert.equal(await client.mode(),'d1');
  assert.deepEqual((await client.getRecord('ns','key')).value,{ok:true});
  assert.equal(d1Reads,1);
  assert.equal(legacyReads,0);
});

test('car page uses an in-app confirmation modal above Telegram chrome',()=>{
  const js=fs.readFileSync('public/car.js','utf8');
  const css=fs.readFileSync('public/car.css','utf8');
  assert.match(js,/function ensureCarConfirmModal\(\)/);
  assert.match(js,/document\.body\.appendChild\(modal\)/);
  assert.doesNotMatch(js.slice(js.indexOf('function confirmRemoveError'),js.indexOf('function renderErrors')),/showConfirm/);
  assert.match(css,/\.car-confirm-modal\{[\s\S]*?position:fixed;[\s\S]*?z-index:12050/);
  assert.match(css,/var\(--tg-content-safe-area-inset-bottom/);
});

test('habit tracker shows a two-sentence yesterday quote with theme-aware text',()=>{
  const html=fs.readFileSync('public/index.html','utf8');
  const js=fs.readFileSync('public/profile-supplements.js','utf8');
  const css=fs.readFileSync('public/profile-supplements.css','utf8');
  assert.match(html,/id="habitYesterdayQuote"/);
  assert.match(js,/function renderHabitYesterdayQuote\(\)/);
  assert.match(js,/Вчера выполнено/);
  assert.match(js,/не выполнено/);
  assert.match(css,/html\[data-theme="light"\] \.personal-habits-yesterday-quote\{[\s\S]*?color:#111418!important/);
  assert.match(css,/html\[data-theme="dark"\] \.personal-habits-yesterday-quote\{[\s\S]*?color:#fff!important/);
});

test('car page removes the wash decision card and keeps a conditional guide action under the header',()=>{
  const html=fs.readFileSync('public/index.html','utf8');
  const js=fs.readFileSync('public/car.js','utf8');
  assert.doesNotMatch(html,/id="carRecommendationsTitle"/);
  assert.match(html,/id="carWashGuideOpen"/);
  assert.match(js,/button\.hidden=!Boolean\(advice\?\.canWash\)/);
  assert.match(js,/renderCarWashGuideAction\(state\.weather\)/);
});


test('recipes keep cooking actions, servings and iPhone-safe time choices',()=>{
  const html=fs.readFileSync('public/index.html','utf8');
  const app=fs.readFileSync('public/app.js','utf8');
  const css=fs.readFileSync('public/app.css','utf8');
  const pwa=fs.readFileSync('public/pwa-extras.js','utf8');
  const pwaCss=fs.readFileSync('public/pwa-extras.css','utf8');
  const store=fs.readFileSync('api/saved-items-store.cjs','utf8');

  const detail=app.slice(app.indexOf('function renderRecipeDetails'),app.indexOf('function recipeErrorText'));
  assert.doesNotMatch(detail,/В покупки/);
  assert.match(detail,/recipe-cook-start/);
  assert.match(app,/window\.RUDI_RECIPE_COOKING=\{/);
  assert.match(pwa,/saved-recipe-servings/);
  assert.match(pwa,/saved-recipe-cook-start/);
  assert.match(store,/servings: Math\.max\(1, Math\.min\(12/);
  assert.match(css,/body\[data-app-tab="products"\] \.recipe-time-row\{[\s\S]*?grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
  assert.match(pwaCss,/\.saved-recipe-actions/);
  assert.match(html,/data-kitchen-view="products"[^>]*>Продукты<\/button>/);
  assert.match(html,/id="productsListCard"[\s\S]*?<strong>Корзина<\/strong>/);
});

test('release build precaches the current stable asset URLs',()=>{
  const build=fs.readFileSync('build.cjs','utf8');
  assert.match(build,/const versionedAssets = WEB_ASSETS\.map/);
  assert.match(build,/syncServiceWorkerPrecache\(versionedAssets\)/);
});


function jsonResponseRecorder(){
  const out={statusCode:0,payload:null,headers:{}};
  return {
    out,
    setHeader(name,value){out.headers[String(name).toLowerCase()]=value;},
    status(code){out.statusCode=code;return this;},
    json(payload){out.payload=payload;return out;},
    send(payload){out.payload=payload;return out;},
  };
}

test('poster proxy retries once and returns gateway statuses for upstream failures',async()=>{
  const originalFetch=global.fetch;
  try{
    let calls=0;
    global.fetch=async()=>{calls+=1;return{ok:false,status:503,headers:new Headers(),text:async()=>''}};
    const res502=jsonResponseRecorder();
    await posterProxy({method:'GET',query:{url:'https://cdn.mirage.ru/poster.jpg'}},res502);
    assert.equal(calls,2);
    assert.equal(res502.out.statusCode,502);

    calls=0;
    global.fetch=async()=>{calls+=1;const error=new Error('aborted');error.name='AbortError';throw error};
    const res504=jsonResponseRecorder();
    await posterProxy({method:'GET',query:{url:'https://cdn.mirage.ru/poster.jpg'}},res504);
    assert.equal(calls,2);
    assert.equal(res504.out.statusCode,504);
  }finally{
    global.fetch=originalFetch;
  }
});

test('retired Telegram chat is cached after chat not found and not retried',async()=>{
  const map=new Map();
  const cache={
    async get(key){return map.get(key)},
    async set(key,value){map.set(key,value);return true},
    async delete(key){map.delete(key);return true},
  };
  let calls=0;
  const fetchImpl=async()=>{
    calls+=1;
    return new Response(JSON.stringify({ok:false,description:'Bad Request: chat not found'}),{
      status:400,headers:{'content-type':'application/json'}
    });
  };
  const request={method:'POST',body:JSON.stringify({chat_id:-100987,message_thread_id:COUPLE_TOPIC_ID,text:'retired'})};
  const url='https://api.telegram.org/bot1:testtoken/sendMessage';
  assert.equal((await handleTelegramTopicRequest(url,request,{cache,fetchImpl})).status,200);
  assert.equal((await handleTelegramTopicRequest(url,request,{cache,fetchImpl})).status,200);
  assert.equal(calls,1);
});
