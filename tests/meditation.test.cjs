'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {read,start,finish,stats,publicSummary}=require('../api/meditation-store.cjs');
const {dailyQuote,LIBRARY}=require('../api/meditation-quote.cjs');
function mockCache(){
 const data=new Map();
 return {data,async get(key){return data.get(key)||null},async set(key,value){data.set(key,value);return true}};
}
test('5/10/20/30/60 minute goal options accepted',async()=>{
 for(const duration of [5,10,20,30,60]){
  const s=mockCache();
  const now=Date.parse('2026-10-12T12:00:00Z');
  const result=await start('Рустам',duration,{meditationCache:s,now});
  assert.equal(result.active.goalMinutes,duration);
 }
});
test('short session stores actual 12 of 20 minutes and separates users',async()=>{
 const cache=mockCache(),t=Date.parse('2026-10-12T10:00:00Z');
 const begun=await start('Рустам',20,{meditationCache:cache,now:t});
 const result=await finish('Рустам',begun.active.id,false,{meditationCache:cache,now:t+12*60000});
 assert.equal(result.session.durationSeconds,12*60);
 assert.equal(result.session.durationMinutes,12);
 assert.equal(result.session.completed,false);
 assert.equal(stats(result.state,new Date(t+12*60000)).todayMinutes,12);
 assert.deepEqual((await read('Диана',{meditationCache:cache})).history,[]);
});
test('timed completion stops at goal even when app was asleep longer',async()=>{
 const cache=mockCache(),t=Date.parse('2026-10-12T10:00:00Z');
 const begun=await start('Диана',5,{meditationCache:cache,now:t});
 const result=await finish('Диана',begun.active.id,true,{meditationCache:cache,now:t+11*60000});
 assert.equal(result.session.durationSeconds,5*60);
 assert.equal(result.session.completed,true);
});
test('duplicate finish is idempotent and cannot alter existing session',async()=>{
 const cache=mockCache(),t=Date.parse('2026-10-12T10:00:00Z');
 const begun=await start('Рустам',10,{meditationCache:cache,now:t});
 const first=await finish('Рустам',begun.active.id,false,{meditationCache:cache,now:t+5*60000});
 const again=await finish('Рустам',begun.active.id,false,{meditationCache:cache,now:t+8*60000});
 assert.equal(again.alreadyFinished,true);
 assert.equal(first.session.durationSeconds,again.session.durationSeconds);
 assert.equal(again.state.history.length,1);
});
test('two-day streak tracks Moscow dates',()=>{
 const state={history:[
 {id:'a',startedAt:'2026-10-12T09:00:00Z',endedAt:'2026-10-12T09:10:00Z',goalMinutes:10,durationSeconds:600},
 {id:'b',startedAt:'2026-10-11T09:00:00Z',endedAt:'2026-10-11T09:07:00Z',goalMinutes:10,durationSeconds:420}
 ]};
 assert.equal(stats(state,new Date('2026-10-12T13:00:00Z')).streak,2);
 assert.equal(publicSummary(state,new Date('2026-10-12T13:00:00Z')).todayMinutes,10);
});
test('shared daily quote cache is stable across two actors',async()=>{
 const quoteCache=mockCache(),options={quoteCache,now:'2026-10-12T09:00:00Z',env:{}};
 const first=await dailyQuote(options),second=await dailyQuote(options);
 assert.deepEqual(first,second);assert.ok(LIBRARY.some(x=>x.author===first.author&&x.text===first.text));
 assert.equal(quoteCache.data.size,1);
});
test('UI exposes meditation timer and calendar edits without edit quick-action row',()=>{
 const fs=require('node:fs');
 const html=fs.readFileSync('public/index.html','utf8'),js=fs.readFileSync('public/meditation.js','utf8');
 const editor=fs.readFileSync('public/personal-task-editor.js','utf8');
 const app=fs.readFileSync('public/app.js','utf8');
 assert.ok(html.includes('meditation.js?v=4.193'));
 assert.ok(html.includes('meditation.css?v=4.193'));
 assert.ok(js.includes('id="meditationOrbit"'));
 assert.ok(js.includes('id="meditationHistoryCard"'));
 assert.ok(js.includes("duration=(a?a.goalMinutes:goal)*60"));
 assert.ok(!editor.includes("role=\"group\" aria-label=\"Быстро изменить дату\""));
 assert.ok(editor.includes('function create(ctx='));
 assert.ok(editor.includes('holdTimer=setTimeout'));
 assert.ok(!html.includes('id="calendarModeSwitch"'));
 assert.ok(app.includes("window.RUDIPersonalTaskEditor?.create({"));
 const css=fs.readFileSync('public/meditation.css','utf8');
 assert.ok(app.includes("const budgetState=spentPercent>=100?'full':spentPercent>=50?'mid':'low'"));
 assert.ok(app.includes("control.style.setProperty('--finance-home-budget-progress',Math.min(100,spentPercent)+'%')"));
 assert.ok(css.includes('#financeProfileButton.has-budget::after'));
 for(const state of ['low','mid','full']){
   assert.ok(css.includes('.finance-balance-progress.is-budget-'+state));
 }
});
