const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const {createRudiStateClient}=require('../api/rudi-state-client.cjs');

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
