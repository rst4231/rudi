'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {awardScore,scoreView,resetMutationQueueForTests}=require('../api/score-store.cjs');
const source=(file)=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
function memoryCache(){let value=null;return {get:async()=>value,set:async(_key,next)=>{value=next;return true}}}

test('partner wish completion earns 100 stars exactly once without using daily allowance',async()=>{
  resetMutationQueueForTests();
  const cache=memoryCache(),now=Date.parse('2026-10-12T17:00:00Z');
  const meta={label:'Желание партнёра',dedupeKey:'score:wishlist-partner:Рустам:wish-123',ignoreDailyLimit:true};
  const awarded=await awardScore('Рустам',1000,meta,{scoreCache:cache,now});
  assert.equal(awarded.awardedUnits,1000);
  assert.equal(scoreView(awarded.state,{now}).balances['Рустам'],100);
  assert.equal(scoreView(awarded.state,{now}).today.earned['Рустам'],0);
  const duplicate=await awardScore('Рустам',1000,meta,{scoreCache:cache,now:now+1000});
  assert.equal(duplicate.awardedUnits,0);
  assert.equal(duplicate.duplicate,true);
  const ordinary=await awardScore('Рустам',20,{label:'Задача',dedupeKey:'score:task:after-wishlist'},{scoreCache:cache,now:now+2000});
  assert.equal(ordinary.awardedUnits,20);
  assert.equal(scoreView(ordinary.state,{now:now+2000}).today.earned['Рустам'],2);
  assert.equal(scoreView(ordinary.state,{now:now+2000}).balances['Рустам'],102);
});

test('wishlist reward credited to completing partner, outside daily limit',()=>{
  const api=source('api/partner-message.js');
  assert.match(api,/if\(!item\.done&&result\.item\?\.done\) await awardScoreSafe\(owner,1000,\{label:'Желание партнёра'/);
  assert.match(api,/dedupeKey:'score:wishlist-partner:'\+owner\+':'\+String\(item\.id\|\|''\),ignoreDailyLimit:true/);
});

test('stars guide describes 100 stars for fulfilling a partners wish',()=>{
  const app=source('public/app.js');
  assert.match(app,/Исполнил желание партнёра из вишлиста<\/span><strong>\+100 ⭐<\/strong>/);
  assert.match(app,/бонус \+100 ⭐ начисляется сверх лимита/);
  assert.doesNotMatch(app,/Партнёр исполнил твоё желание<\/span><strong>\+5 ⭐<\/strong>/);
});

test('partner last expense contains emoji but no unnecessary heading',()=>{
  const app=source('public/app.js');
  assert.match(app,/node\.textContent='💸 '\+financeMoney\(amount,row\.currency\|\|'RUB'\)/);
  assert.doesNotMatch(app,/node\.textContent='Последний расход: '/);
});

test('each opened task gets fresh native date/time fields with its own displayed values',()=>{
  const editor=source('public/personal-task-editor.js');
  const start=editor.indexOf('function replaceTemporalInputs(){');
  const end=editor.indexOf('function open(task,ctx={}){',start);
  assert.ok(start>=0&&end>start);
  assert.match(editor,/reset\(\);replaceTemporalInputs\(\);active=/);
  const elements={};
  function makeNode(){
    return {id:'',value:'',type:'text',listeners:{},
      addEventListener(name,cb){this.listeners[name]=cb},
      replaceWith(next){elements[this.id]=next}};
  }
  for(const type of ['date','time']){
    const node=makeNode();node.id='rudiPersonalTask'+type[0].toUpperCase()+type.slice(1);node.type=type;elements[node.id]=node;
  }
  const firstDate=elements.rudiPersonalTaskDate,firstTime=elements.rudiPersonalTaskTime;
  let changeEvents=0;
  const rebuild=vm.runInNewContext(editor.slice(start,end)+';replaceTemporalInputs',{
    document:{createElement:()=>makeNode()},
    f:(type)=>elements['rudiPersonalTask'+type[0].toUpperCase()+type.slice(1)],
    syncTime:()=>{changeEvents++}
  });
  rebuild();
  elements.rudiPersonalTaskDate.value='2026-10-12';elements.rudiPersonalTaskTime.value='09:15';
  const secondDate=elements.rudiPersonalTaskDate,secondTime=elements.rudiPersonalTaskTime;
  assert.notEqual(firstDate,secondDate);assert.notEqual(firstTime,secondTime);
  rebuild();
  elements.rudiPersonalTaskDate.value='2026-10-15';elements.rudiPersonalTaskTime.value='18:40';
  assert.notEqual(secondDate,elements.rudiPersonalTaskDate);
  assert.notEqual(secondTime,elements.rudiPersonalTaskTime);
  assert.equal(elements.rudiPersonalTaskDate.value,'2026-10-15');
  assert.equal(elements.rudiPersonalTaskTime.value,'18:40');
  elements.rudiPersonalTaskDate.listeners.change();
  assert.equal(changeEvents,1);
});
