'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {read,start,finish,stats,publicSummary,normalize,recordReward}=require('../api/meditation-store.cjs');
const {awardScore,scoreView}=require('../api/score-store.cjs');
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
 assert.ok(html.includes('meditation.js?v=4.194'));
 assert.ok(html.includes('meditation.css?v=4.194'));
 assert.ok(js.includes('id="meditationOrbit"'));
 assert.ok(js.includes('id="meditationHistoryCard"'));
 assert.ok(js.includes("duration=(a?a.goalMinutes:goal)*60"));
 assert.ok(!editor.includes("role=\"group\" aria-label=\"Быстро изменить дату\""));
 assert.ok(editor.includes('function create(ctx='));
 assert.ok(editor.includes('holdTimer=setTimeout'));
 assert.ok(html.includes('id="calendarModeSwitch"'));
  assert.ok(app.includes("modeSwitch.dataset.calendarMode=nextMode"));
  assert.ok(app.includes("calendarWeekAgenda(day.date,tasks,events,holidays,obligations"));
  assert.ok(app.includes("calendar-week-now-line"));
 assert.ok(app.includes("window.RUDIPersonalTaskEditor?.create({"));
 const css=fs.readFileSync('public/meditation.css','utf8');
 assert.ok(app.includes("const budgetState=spentPercent>=100?'full':spentPercent>=50?'mid':'low'"));
 assert.ok(app.includes("control.style.setProperty('--finance-home-budget-progress',Math.min(100,spentPercent)+'%')"));
 assert.ok(css.includes('#financeProfileButton.has-budget::after'));
 for(const state of ['low','mid','full']){
   assert.ok(css.includes('.finance-balance-progress.is-budget-'+state));
 }
});

test('meditation endpoint is routed through existing index function within Hobby limit',()=>{
 const fs=require('node:fs');
 const path=require('node:path');
 const root=path.resolve(__dirname,'..');
 const config=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
 const api=fs.readFileSync(path.join(root,'api/index.js'),'utf8');
 const deployables=fs.readdirSync(path.join(root,'api')).filter(x=>x.endsWith('.js'));
 assert.ok(deployables.length<=12,'exceeded function quota: '+deployables.length);
 assert.ok(!deployables.includes('meditation.js'));
 assert.ok(fs.existsSync(path.join(root,'api/meditation.cjs')));
 assert.ok(api.includes("require('./meditation.cjs')"));
 assert.ok(api.includes("req.query?.route === 'meditation'"));
 assert.deepEqual(config.rewrites.find(r=>r.source==='/api/meditation'),{
   source:'/api/meditation',destination:'/api/index?route=meditation'
 });
});

test('sessions shorter than 60 seconds never appear in history',async()=>{
 const cache=mockCache(),now=Date.parse('2026-10-12T10:00:00Z');
 const started=await start('Рустам',5,{meditationCache:cache,now});
 const ended=await finish('Рустам',started.active.id,false,{meditationCache:cache,now:now+59000});
 assert.equal(ended.session,null);assert.equal(stats(ended.state).sessions,0);
 assert.equal(normalize({history:[{id:'legacy',startedAt:new Date(now).toISOString(),endedAt:new Date(now+59000).toISOString(),goalMinutes:5,durationSeconds:59}]}).history.length,0);
});
test('meditation stars use score ledger daily idempotency separately by actor',async()=>{
 const scoreCache=mockCache(),meditationCache=mockCache(),now=Date.parse('2026-10-12T10:00:00Z');
 for(const actor of ['Рустам','Диана']){
  const key='score:meditation:'+actor+':2026-10-12';
  const first=await awardScore(actor,1,{dedupeKey:key,label:'Медитация'},{scoreCache,now});
  assert.equal(first.awardedUnits,1);
  const second=await awardScore(actor,5,{dedupeKey:key,label:'Медитация'},{scoreCache,now:now+1800000});
  assert.equal(second.awardedUnits,0);assert.equal(second.duplicate,true);
  const started=await start(actor,5,{meditationCache,now});
  const finished=await finish(actor,started.active.id,false,{meditationCache,now:now+300000});
  const rewarded=await recordReward(actor,finished.session.id,.1,{meditationCache});
  assert.equal(rewarded.history[0].rewardPoints,.1);
 }
 const view=scoreView(await scoreCache.get('score-state'),{now});
 assert.equal(view.balances['Рустам'],.1);assert.equal(view.balances['Диана'],.1);
});
test('meditation UI has wake lock, collapsed benefits and mood guidance',()=>{
 const fs=require('node:fs');
 const js=fs.readFileSync('public/meditation.js','utf8');
 assert.match(js,/navigator\.wakeLock\.request\('screen'\)/);
 assert.match(js,/id="meditationBenefitsCard"/);
 assert.match(js,/const SAD_MOODS=new Set\(\['sadness','anger','fatigue','boredom'\]\)/);
 assert.match(js,/text\('meditationQuoteAuthor',quote.author\)/);
 assert.doesNotMatch(js,/Только этот момент\. Без спешки/);
 assert.match(fs.readFileSync('public/calendar-day-recap.js','utf8'),/section\('Медитация'/);
 assert.match(fs.readFileSync('public/app.js','utf8'),/Только одна награда в день на человека/);
 assert.match(fs.readFileSync('api/personal-center-ai.cjs','utf8'),/meditation:payload\.data\.meditation/);
});
