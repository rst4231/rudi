'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const store=require('../api/personal-center-store.cjs');
const cron=require('../api/personal-center-cron-handler.cjs');
const ai=require('../api/personal-center-ai.cjs');
const emotions=require('../api/personal-center-emotions.cjs');
const connections=require('../api/personal-center-connections.cjs');
const cycle=require('../api/cycle-store.cjs');
const fs=require('node:fs'),path=require('node:path');
const map=new Map();
function client(){return {
 getRecord:async(ns,k)=>map.has(ns+':'+k)?{value:map.get(ns+':'+k)}:null,
 set:async(ns,k,value)=>{map.set(ns+':'+k,value);return true},
 setIfAbsent:async(ns,k,value)=>{if(map.has(ns+':'+k))return false;map.set(ns+':'+k,value);return true},
 list:async(ns)=>[...map].filter(([k])=>k.startsWith(ns+':')).map(([k,value])=>({key:k.slice(ns.length+1),value})),
 remove:async(ns,k)=>{map.delete(ns+':'+k);return true},
};}
test('independent user records and mandatory ratings',async()=>{
 map.clear();const c=client();const now=Date.parse('2026-10-10T04:00:00Z');
 await store.mutate('Рустам','checkin',{stress:3},{client:c,now});
 assert.equal((await store.read('Рустам',{client:c})).checkins['2026-10-10'].stress,3);
 assert.deepEqual((await store.read('Диана',{client:c})).checkins,{});
 await assert.rejects(()=>store.mutate('Диана','checkin',{stress:12},{client:c,now}),/invalid-rating/);
});
test('once-per-slot reports and green halo state',async()=>{
 map.clear();const c=client(),now=Date.parse('2026-10-10T04:00:00Z');
 const first=await store.saveReport('Диана','2026-10-10','morning',{narrative:{overview:'ok'}},{client:c,now});
 assert.equal(first.created,true);
 assert.equal((await store.saveReport('Диана','2026-10-10','morning',{},{client:c,now})).created,false);
 assert.equal((await store.unread('Диана',{client:c})).unread,true);
 await store.seen('Диана',{client:c});
 assert.equal((await store.unread('Диана',{client:c})).unread,false);
});
test('per-account erase does not delete existing finance or partner entries',async()=>{
 map.clear();const c=client();await store.mutate('Рустам','weight',{kg:86.2},{client:c});
 await store.mutate('Диана','weight',{kg:62},{client:c});
 await store.erase('Рустам','all',{client:c});
 assert.equal((await store.read('Рустам',{client:c})).weights.length,0);
 assert.equal((await store.read('Диана',{client:c})).weights.length,1);
});
test('Moscow scheduled slots use UTC+3',()=>{
 assert.equal(cron.slotAt(Date.parse('2026-10-10T04:00:00Z')),'morning');
 assert.equal(cron.slotAt(Date.parse('2026-10-10T18:00:00Z')),'');
 assert.equal(cron.slotAt(Date.parse('2026-10-10T21:00:00Z')),'');
 assert.equal(cron.slotAt(Date.parse('2026-10-10T12:00:00Z')),'');
});
test('scheduler does not regenerate existing reports',async()=>{
 map.clear();const c=client(),now=Date.parse('2026-10-10T04:00:00Z');
 let generated=0;
 const generate=async actor=>{generated++;return {narrative:{overview:actor},model:'test'}};
 const first=await cron.run({client:c,now,generate});
 assert.equal(first.ok,true);assert.equal(generated,2);
 const second=await cron.run({client:c,now,generate});
 assert.equal(second.ok,true);assert.equal(generated,2);
});

test('vision, chronic conditions and stress persist independently in D1',async()=>{
 map.clear();const c=client();
 await store.mutate('Рустам','profile',{height:181,vision:{left:'-1.5',right:'+0.75'},chronicConditions:'Астма\nМигрень'},{client:c});
 const r=await store.read('Рустам',{client:c}),d=await store.read('Диана',{client:c});
 assert.equal(r.profile.vision.left,-1.5);
 assert.equal(r.profile.vision.right,.75);
 assert.equal(r.profile.chronicConditions.length,2);
 assert.deepEqual(d.profile.chronicConditions,[]);
 assert.equal(d.profile.vision.left,null);
 await assert.rejects(()=>store.mutate('Рустам','profile',{height:181,vision:{left:'22',right:'0'}},{client:c}),/invalid-vision/);
});
test('weight change counts only when measurements and time range support it',()=>{
 const profile={height:181,birthDate:'',vision:{left:-1.5,right:.75},chronicConditions:['Астма']};
 const data={profile,checkins:{},symptoms:[],weights:[
 {kg:100,at:'2026-09-20T00:00:00Z'}, {kg:99,at:'2026-09-30T00:00:00Z'}, {kg:97.8,at:'2026-10-10T00:00:00Z'}]};
 const result=ai.summaries(data,'Рустам','2026-10-10','evening');
 assert.equal(result.body.weightChange.significant,true);
 assert.equal(result.body.weightChange.percent,-2.2);
 assert.equal(result.body.chronicConditions[0],'Астма');
 assert.equal(result.body.vision.left,-1.5);
 assert.equal(result.health.symptomsTotal,0);
 assert.equal(ai.summaries({...data,weights:data.weights.slice(1)},'Рустам','2026-10-10','evening').body.weightChange.significant,false);
});
test('cycle comparison is bounded to observed Diana data, not a diagnosis',()=>{
 const state=cycle.normalizeCycleState({historyStarts:['2026-09-10','2026-10-10'],cycleLengthDays:30,periodLengthDays:5,ovulationDay:16});
 const observation=ai.cycleDigest(state,'2026-10-10',[{date:'2026-10-10',mood:'joy'}],[]);
 assert.equal(observation.historyCount,2);
 assert.ok(observation.comparisons.length>=1);
 assert.equal(observation.comparisons[0].eligibleForPattern,false);
 assert.match(observation.note,/не доказывают/);
});
test('cycle history stays in D1 with no expiration and much larger lifetime horizon',()=>{
 assert.equal(cycle.TTL_SECONDS,0);
 assert.ok(cycle.MAX_HISTORY>=1000);
});
test('morning summary for each actor is idempotent without backfill',async()=>{
 map.clear();const c=client(),now=Date.parse('2026-10-11T04:00:00Z');
 let n=0;const generate=async actor=>{n++;return {narrative:{overview:actor},model:'test'};};
 const first=await cron.run({client:c,now,generate});
 assert.equal(first.ok,true);
 assert.equal(n,2);
 assert.equal(first.results.filter(x=>x.status==='created').length,2);
 await cron.run({client:c,now,generate});
 assert.equal(n,2);
 const evening=await cron.run({client:c,now:Date.parse('2026-10-11T18:00:00Z'),generate});
 assert.equal(evening.skipped,'outside-morning-window');
 assert.equal(n,2);
});
test('AI center never calls LLM on open or pull refresh; source data is not reentered',()=>{
 const app=fs.readFileSync(path.join(__dirname,'..','public','personal-center.js'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'..','public','personal-center.css'),'utf8');
 assert.match(app,/installCenterPullRefresh/);
 assert.match(app,/Отпустите для обновления/);
 assert.match(app,/knownVersion/);
 assert.doesNotMatch(app,/openai\\.com|groq\\.com/);
 assert.doesNotMatch(app,/ЭМОЦИОНАЛЬНАЯ ДИНАМИКА|pcEmotionValue|pcEmotionCaption/);
 assert.doesNotMatch(app,/pcCheckinForm|name="stress"/);
 assert.match(app,/Динамика позитивных эмоций/);
 assert.match(app,/pcGraph/);
 assert.doesNotMatch(app,/name="mood"|name="energy"/);
 assert.match(app,/data-open="weight"/);
 assert.match(app,/pcDianaCycleSlot/);
 assert.match(app,/name="eyeLeft"/);
 assert.match(app,/name="chronicConditions"/);
 assert.match(app,/pcSummaryGrid/);
 assert.match(css,/pc-visual-height/);
});

test('emotion signal uses existing mood entries, not fabricated stress ratings',()=>{
 const history=[
   {date:'2026-10-09',mood:'joy',updatedAt:'2026-10-09T12:00:00Z',samples:[{mood:'joy'},{mood:'anger'},{mood:'sadness'}]},
   {date:'2026-10-10',mood:'neutral',updatedAt:'2026-10-10T12:00:00Z',samples:[{mood:'neutral'},{mood:'love'}]},
 ];
 const signal=emotions.computeEmotionSignals(history);
 assert.equal(signal.daysRecorded,2);
 assert.equal(signal.daily[0].negativePercent,67);
 assert.equal(signal.daily[1].negativePercent,0);
 assert.equal(signal.recentNegativePercent,40);
 assert.match(signal.note,/не медицинское измерение/);
 const changed=emotions.computeEmotionSignals([{...history[0],updatedAt:'2026-10-09T18:00:00Z'},history[1]]);
 assert.notEqual(signal.version,changed.version);
});
test('AI emotional tension uses mood journal and does not use a manual stress score',()=>{
 const p={profile:{height:181,birthDate:'',vision:{left:null,right:null},chronicConditions:[]},checkins:{'2026-10-10':{stress:10}},symptoms:[],weights:[]};
 const report=ai.summaries(p,'Рустам','2026-10-10','evening',[{date:'2026-10-10',mood:'joy',samples:[{mood:'joy'}]}]);
 assert.equal(report.wellbeing.kind,'negative-emotion-share');
 assert.equal(report.wellbeing.recentNegativePercent,0);
 assert.equal(report.wellbeing.latest.negativePercent,0);
 assert.ok(!('latestStress' in report.wellbeing));
});

test('AI center hides the entire emotion summary card but keeps derived mood history',()=>{
 const app=fs.readFileSync(path.join(__dirname,'..','public','personal-center.js'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'..','public','personal-center.css'),'utf8');
 assert.doesNotMatch(app,/ЭМОЦИОНАЛЬНАЯ ДИНАМИКА|pcEmotionValue|pcEmotionCaption|rudi-center__stress-card/);
 assert.doesNotMatch(css,/rudi-center__stress-card|rudi-center__stress-control/);
 assert.match(app,/data-open="symptoms"/);
 assert.match(app,/data-open="weight"/);
 assert.match(app,/Динамика позитивных эмоций/);
 assert.match(app,/pcDianaCycleSlot/);
 assert.match(app,/const emotions=data.emotions/);
});

test('personal AI uses the same 06:00 Moscow cron as Telegram and has no duplicate GitHub schedule',()=>{
 const yaml=fs.readFileSync(path.join(__dirname,'..','.github/workflows/personal-ai-center.yml'),'utf8');
 const handler=fs.readFileSync(path.join(__dirname,'..','api/personal-center-cron-handler.cjs'),'utf8');
 const feed=fs.readFileSync(path.join(__dirname,'..','api','feed-notify-cron.js'),'utf8');
 assert.doesNotMatch(yaml,/^\s*- cron:/m);
 assert.match(feed,/runPersonalAi/);
 assert.doesNotMatch(handler,/backfillOnly|releaseBackfill/);
 assert.equal(cron.slotAt(Date.parse('2026-10-10T03:00:00Z')),'morning');
 assert.equal(cron.slotAt(Date.parse('2026-10-10T18:00:00Z')),'');
});
test('paired evidence identifies supported habit-mood and expense comparisons, not missing values',()=>{
 const completions={},failures={},moodHistory=[],personalExpenses=[],id='habit-ABCDEFGH';
 for(let n=1;n<=12;n++){
  const date='2026-09-'+String(n*2).padStart(2,'0');
  const done=n<=6;
  (done?completions:failures)[date]=[id];
  moodHistory.push({date,mood:done?'joy':'sadness',samples:[{mood:done?'joy':'sadness'}]});
  personalExpenses.push({actor:'Рустам',categoryId:'food',rubAmount:done?950:300,occurredAt:date+'T11:00:00+03:00'});
 }
 const input={actor:'Рустам',date:'2026-10-10',moodHistory,finances:{categories:{'Рустам':[{id:'food',name:'Продукты'}]},personalExpenses},
 habits:{habits:[{id,name:'Зарядка',createdAt:'2026-08-01T00:00:00Z'}],completions,failures}};
 const result=connections.analyzeConnections(input);
 assert.equal(result.coverage.moodDays,12);
 assert.ok(result.findings.some(f=>f.kind==='habit-mood'));
 assert.ok(result.findings.some(f=>f.kind==='habit-expenses'));
 assert.ok(result.findings.filter(x=>x.kind==='habit-mood'||x.kind==='habit-expenses').every(x=>x.daysA>=6&&x.daysB>=6));
 assert.match(result.disclaimer,/не доказательство причины/);
 assert.equal(connections.analyzeConnections({...input,moodHistory:moodHistory.slice(0,5),finances:{...input.finances,personalExpenses:[]}}).findings.length,0);
 const diana=connections.analyzeConnections({...input,actor:'Диана',habits:{habits:[],completions:{},failures:{}}});
 assert.equal(diana.coverage.expenseDays,0);
 assert.equal(diana.findings.length,0);
});
test('Diana work calendar comparisons require genuine recorded dates and no stale calendar',()=>{
 const days=[],expenses=[];
 for(let day=1;day<=24;day++){
  const date='2026-09-'+String(day).padStart(2,'0'),work=day%2===0;
  days.push({date,events:work?[{title:'Работа'}]:[]});
  expenses.push({actor:'Диана',categoryId:'food',rubAmount:work?900:300,occurredAt:date+'T11:00:00+03:00'});
 }
 const input={actor:'Диана',date:'2026-10-10',finances:{categories:{'Диана':[{id:'food',name:'Еда'}]},personalExpenses:expenses},workCalendar:{configured:true,days}};
 assert.equal(connections.analyzeConnections(input).coverage.calendarDays,24);
 assert.ok(connections.analyzeConnections(input).findings.some(x=>x.kind==='calendar-expenses'));
 assert.equal(connections.analyzeConnections({...input,actor:'Рустам'}).coverage.calendarDays,0);
 assert.equal(connections.analyzeConnections({...input,workCalendar:{configured:true,stale:true,days}}).findings.length,0);
});
test('finance digest separates expenses from wallet incomes and does not invent income',()=>{
 const expenses=[{actor:'Рустам',month:'2026-10',rubAmount:55807,occurredAt:'2026-10-10T11:00:00+03:00'}];
 const without=ai.financeDigest({personalExpenses:expenses,walletIncomes:[]},'Рустам','2026-10-10');
 assert.equal(without.expenseMonths[0].expenseRub,55807);
 assert.equal(without.incomeEntries,0);
 assert.deepEqual(without.incomeMonths,[]);
 const withIncome=ai.financeDigest({personalExpenses:expenses,walletIncomes:[{actor:'Рустам',month:'2026-10',rubAmount:3000}]},'Рустам','2026-10-10');
 assert.equal(withIncome.incomeMonths[0].incomeRub,3000);
 const fallback=ai.makeFallback({data:{profile:{slot:'morning'},connections:{findings:[]},finances:without,habits:null}});
 assert.match(fallback.financeText,/расходов/);
 assert.doesNotMatch(fallback.financeText,/доходов/);
});
test('Diana cycle stays directly below dynamics chart, independently of calendar router',()=>{
 const app=fs.readFileSync(path.join(__dirname,'..','public','personal-center.js'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'..','public','personal-center.css'),'utf8');
 const chart=app.indexOf('id="pcGraph"'),slot=app.indexOf('id="pcDianaCycleSlot"');
 assert.ok(chart>0&&slot>chart&&slot-chart<2500);
 assert.match(app,/id="pcCyclePhase"/);
 assert.match(app,/id="pcCycleRecord"/);
 assert.match(app,/recordPersonalCycle/);
 assert.match(app,/who==='Диана'&&open/);
 assert.doesNotMatch(app,/pcCycleOriginalAnchor|slot\.append\(card\)/);
 assert.match(css,/#dianaCycleCard\[data-app-tab-section="schedule"\]/);
});

test('manual button creates only the authorized actor morning report at any hour, then reuses it',async()=>{
 map.clear();const c=client(),now=Date.parse('2026-10-11T13:40:00Z'),date='2026-10-11';
 let generated=0;
 const generate=async(actor,day,slot)=>{generated++;assert.equal(slot,'morning');assert.equal(day,date);return {narrative:{overview:'Сводка '+actor},model:'test'};};
 const first=await cron.generateForActor('Диана',date,{client:c,now,generate});
 assert.equal(first.status,'created');
 assert.equal(first.report.date,date);
 assert.equal(first.report.slot,'morning');
 assert.equal(generated,1);
 const repeat=await cron.generateForActor('Диана',date,{client:c,now,generate});
 assert.equal(repeat.status,'exists');
 assert.equal(generated,1);
 assert.equal((await store.latest('Рустам',{client:c})),null);
 assert.match((await store.latest('Диана',{client:c})).narrative.overview,/Диана/);
 const rustam=await cron.generateForActor('Рустам',date,{client:c,now,generate});
 assert.equal(rustam.status,'created');
 assert.equal(generated,2);
 await assert.rejects(()=>cron.generateForActor('Незнакомец',date,{client:c,now,generate}),/rudi-access-denied/);
});
test('manual and scheduled AI requests use the same distributed per-actor lock',async()=>{
 map.clear();const c=client(),date='2026-10-11',now=Date.parse('2026-10-11T04:00:00Z');
 let entered,finish,generated=0;
 const started=new Promise(resolve=>{entered=resolve});
 const generate=async()=>{generated++;entered();return new Promise(resolve=>{finish=resolve})};
 const first=cron.generateForActor('Диана',date,{client:c,now,generate});
 await started;
 const duplicate=await cron.generateForActor('Диана',date,{client:c,now,generate});
 assert.equal(duplicate.status,'already-running');
 assert.equal(generated,1);
 finish({narrative:{overview:'готово'},model:'test'});
 assert.equal((await first).status,'created');
 assert.equal((await cron.generateForActor('Диана',date,{client:c,now,generate})).status,'exists');
 assert.equal(generated,1);
});
test('manual report is user authenticated, fixed to Moscow today and never generated on page open',()=>{
 const handler=fs.readFileSync(path.join(__dirname,'..','api/personal-center-handler.cjs'),'utf8');
 const cronCode=fs.readFileSync(path.join(__dirname,'..','api/personal-center-cron-handler.cjs'),'utf8');
 const ui=fs.readFileSync(path.join(__dirname,'..','public','personal-center.js'),'utf8');
 assert.match(handler,/authorizeRequest\(req,body\.initData\)/);
 assert.match(handler,/operation==='generate-report'/);
 assert.match(handler,/generateForActor\(actor,state\.moscowDate\(now\),\{now,manual:true\}\)/);
 assert.match(cronCode,/setIfAbsent\(state\.NS,lockKey/);
 assert.match(ui,/id="pcGenerateReport"/);
 assert.match(ui,/call\('generate-report'\)/);
 assert.match(ui,/report\?\.date===dayKey\(\)/);
 assert.match(ui,/button\.disabled=manualLoading\|\|Boolean\(current\)/);
 assert.match(ui,/button\.hidden=!\['Рустам','Диана'\]\.includes\(who\)/);
 assert.doesNotMatch(handler,/manual-report-disabled/);
 const onOpen=ui.slice(ui.indexOf('async function show(){'),ui.indexOf('function hide(){'));
 assert.doesNotMatch(onOpen,/generate-report|requestDailyReport/);
});

test('existing fallback is upgraded in-place without an extra history row',async()=>{
 map.clear();const c=client(),now=Date.parse('2026-10-11T05:00:00Z'),date='2026-10-11';
 await store.saveReport('Рустам',date,'morning',{model:'deterministic',narrative:{overview:'Заглушка'}},{client:c,now});
 const before=await store.latest('Рустам',{client:c});
 const result=await cron.generateForActor('Рустам',date,{client:c,now:now+2000,retryFallback:true,
  generate:async()=>({model:'openai/gpt-oss-20b',narrative:{overview:'Реальные выводы'}})});
 assert.equal(result.status,'upgraded');
 assert.equal(result.report.id,before.id);
 assert.equal(result.report.createdAt,before.createdAt);
 assert.equal((await store.latest('Рустам',{client:c})).narrative.overview,'Реальные выводы');
 assert.equal((await store.history('Рустам',{client:c})).length,1);
 assert.equal((await store.latest('Диана',{client:c})),null);
 const again=await cron.generateForActor('Рустам',date,{client:c,now:now+6000,retryFallback:true,
  generate:()=>{throw Error('must not generate a full report twice')}});
 assert.equal(again.status,'exists');
});
test('fallback retried at most three times with cooldown and no change to saved report on failure',async()=>{
 map.clear();const c=client(),date='2026-10-11',now=Date.parse('2026-10-11T05:00:00Z');
 await store.saveReport('Диана',date,'morning',{model:'deterministic',narrative:{overview:'Сохранено'}},{client:c,now});
 let generated=0;
 const gen=async()=>{generated++;return {model:'deterministic',failureReason:'invalid-json',narrative:{overview:'Не заменять'}}};
 for(let i=0;i<3;i++){
  const later=now+1000+i*92000;
  const r=await cron.generateForActor('Диана',date,{client:c,now:later,retryFallback:true,generate:gen});
  assert.equal(r.status,'unavailable');assert.equal(generated,i+1);
  assert.equal(r.report.narrative.overview,'Сохранено');
  const tooSoon=await cron.generateForActor('Диана',date,{client:c,now:later+1000,retryFallback:true,generate:gen});
  assert.equal(tooSoon.status,i===2?'retry-limit':'retry-cooldown');
  assert.equal(generated,i+1);
 }
 const last=await cron.generateForActor('Диана',date,{client:c,now:now+400000,retryFallback:true,generate:gen});
 assert.equal(last.status,'retry-limit');
 assert.equal(generated,3);
});
test('strict JSON output, all-domain factual coach and compact 7-day dashboard are wired',()=>{
 const aiCode=fs.readFileSync(path.join(__dirname,'..','api','personal-center-ai.cjs'),'utf8');
 const app=fs.readFileSync(path.join(__dirname,'..','public','personal-center.js'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'..','public','personal-center.css'),'utf8');
 assert.match(aiCode,/response_format:\{type:'json_schema'/);
 assert.match(aiCode,/strict:true/);
 assert.match(aiCode,/Ты RUDI — личный тренер, коуч и аналитик/);
 assert.match(aiCode,/Не объявляй запланированные задачи выполненными/);
 assert.match(app,/id="pcRhythmGraph"/);
 assert.match(app,/data-rhythm="habits"/);
 assert.match(app,/data-rhythm="expenses"/);
 assert.match(app,/data-rhythm="mood"/);
 assert.match(app,/dates\.map\(d=>series\.has\(d\)\?series\.get\(d\):null\)/);
 assert.match(app,/report\.model!=='deterministic'/);
 assert.match(app,/id="pcGenerateReport"/);
 assert.match(css,/\.rudi-center__rhythm-tabs/);
 assert.doesNotMatch(app,/Данные сохранены\. AI-анализ временно недоступен/);
});

test('positive mood charts and detailed AI insights are shown before evidence',()=>{
 const app=fs.readFileSync(path.join(__dirname,'..','public','personal-center.js'),'utf8');
 const generator=fs.readFileSync(path.join(__dirname,'..','api','personal-center-ai.cjs'),'utf8');
 assert.match(app,/function positiveShare\(entry\)/);
 assert.match(app,/entry\?\.positive/);
 assert.ok(app.includes("mood:'Позитивные отметки'"));
 assert.ok(app.includes('Доля позитивных отметок из дневника настроения.'));
 assert.ok(app.includes('Динамика позитивных эмоций'));
 assert.ok(app.includes("positiveShare(x)"));
 assert.ok(app.includes("v.positive+' из '+v.total+' позитивных"));
 assert.ok(app.includes("report?.date===dayKey()&&report?.slot==='morning'"));
 assert.ok(app.includes('rudi-center__deep-list'));
 assert.ok(app.includes('КАК ПРОВЕРИТЬ РЕЗУЛЬТАТ'));
 assert.ok(app.includes('ЧТО ЭТО ЗНАЧИТ'));
 assert.ok(!app.slice(app.indexOf("} else if(name==='report')"),app.indexOf('const evidence=[]')).includes("section('Главный вывод',n.overview"));
 assert.ok(app.includes('Эта сводка создана в прежнем формате'));
 assert.ok(app.includes('<details class="rudi-center__report-evidence">'));
 assert.ok(app.indexOf('rudi-center__deep-list')<app.indexOf('const evidence=[]'));
 assert.ok(generator.includes('Составь содержательный персональный разбор, а не каталог показателей'));
 assert.doesNotMatch(app,/Динамика негативных эмоций|Негативные отметки|Доля негативных отметок/);
});

test('personal center swipe-back and responsive report design remain wired',()=>{
 const app=fs.readFileSync(path.join(__dirname,'..','public','personal-center.js'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'..','public','personal-center.css'),'utf8');
 assert.match(app,/installCenterSwipeBack\(\);/);
 assert.match(app,/root\.addEventListener\('touchstart'/);
 assert.match(app,/root\.addEventListener\('touchend'/);
 assert.match(app,/if\(dx<75\|\|dy>Math\.max\(40,dx\*\.55\)/);
 assert.match(app,/if\(swipe\.sheet&&activeSheet===swipe\.sheet\)closeSheet\(\)/);
 assert.match(app,/else if\(!activeSheet\)hide\(\)/);
 assert.match(css,/rudi-center__report-cover/);
 assert.match(css,/rudi-center__report-section--priority/);
 assert.match(css,/rudi-center__report-section--action/);
 assert.match(css,/rudi-center__report-evidence/);
 assert.match(css,/@media\(max-width:799px\)/);
});

test('a ready daily report cannot be regenerated and the history remains one row',async()=>{
 map.clear();const c=client(),date='2026-10-11',now=Date.parse('2026-10-11T10:00:00Z');
 let count=0;
 const generate=async()=>({model:'test',narrative:{overview:'Готово '+(++count)}});
 const first=await cron.generateForActor('Рустам',date,{client:c,now,manual:true,generate});
 assert.equal(first.status,'created');assert.equal(count,1);
 for(let i=0;i<3;i++){
  const second=await cron.generateForActor('Рустам',date,{client:c,now:now+1000*(i+1),manual:true,generate});
  assert.equal(second.status,'exists');assert.equal(second.report.narrative.overview,'Готово 1');
 }
 assert.equal(count,1);
 assert.equal((await store.history('Рустам',{client:c})).length,1);
});
test('a ready report stays unchanged even when manual generation is attempted after provider failure',async()=>{
 map.clear();const c=client(),date='2026-10-11',now=Date.parse('2026-10-11T11:00:00Z');
 await store.saveReport('Рустам',date,'morning',{model:'test',narrative:{overview:'Сохранённый результат'}},{client:c,now});
 const forbidden=await cron.generateForActor('Рустам',date,{client:c,now:now+2000,manual:true,generate:async()=>{throw Error('must not generate')}}); 
 assert.equal(forbidden.status,'exists');
 assert.equal((await store.latest('Рустам',{client:c})).narrative.overview,'Сохранённый результат');
});
test('Diana and Rustam share the 06:00 Moscow schedule, and either may manually fill a missing day',async()=>{
 map.clear();const c=client(),date='2026-10-11',now=Date.parse('2026-10-11T03:00:00Z');
 let count=0;const gen=async()=>{count++;return {model:'test',narrative:{overview:'Утренний анализ'}}};
 const scheduled=await cron.run({client:c,now,generate:gen});
 assert.equal(scheduled.ok,true);assert.equal(count,2);
 const stored=await store.latest('Диана',{client:c});
 assert.equal(stored.date,date);assert.equal(stored.slot,'morning');
 const repeated=await cron.run({client:c,now,generate:gen});
 assert.equal(repeated.results.find(x=>x.actor==='Диана').status,'exists');
 assert.equal((await cron.generateForActor('Диана',date,{client:c,now,manual:true,generate:gen})).status,'exists');
 assert.equal(count,2);
 const app=fs.readFileSync(path.join(__dirname,'..','public','personal-center.js'),'utf8');
 assert.match(app,/button.hidden=!\['Рустам','Диана'\]\.includes\(who\)/);
 assert.match(app,/if\(!\['Рустам','Диана'\]\.includes\(who\)/);
});
test('AI personal review prioritizes genuine life domains instead of financial data volume',()=>{
 const source=fs.readFileSync(path.join(__dirname,'..','api','personal-center-ai.cjs'),'utf8');
 const front=fs.readFileSync(path.join(__dirname,'..','public','personal-center.js'),'utf8');
 const styles=fs.readFileSync(path.join(__dirname,'..','public','personal-center.css'),'utf8');
 assert.match(source,/availableReviewDomains\(payload\.data\)/);
 assert.match(source,/Это личный обзор ВСЕЙ жизни, а НЕ отчёт о расходах/);
 assert.match(source,/Деньги — только один из разделов/);
 assert.match(source,/lifeAreas:\{type:'array',items:/);
 assert.match(source,/availableDomains,data:\{tasks:payload\.data\.tasks/);
 assert.match(front,/Глубокий анализ/);
 assert.match(front,/rudi-center__deep-list/);
 assert.match(styles,/grid-template-columns:1fr/);
});
test('review domain coverage and output validation never invent absent records',()=>{
 const rich={tasks:[{title:'План'}],habits:{items:[{name:'Зарядка'}]},moodHistory:{entries:3},
   profile:{body:{weightCount:2},health:{symptomsTotal:1}},supplements:{items:[]},
   finances:{expenseEntries:140,incomeEntries:0}};
 assert.deepEqual(ai.availableReviewDomains(rich),['mood','habits','tasks','health','finances']);
 const payload={data:{...rich,connections:{findings:[]}}};
 const response=ai.sanitize({lifeAreas:[
   {domain:'tasks',observation:'Есть запланированное дело',nextStep:'Уточни приоритет'},
   {domain:'habits',observation:'В списке есть зарядка',nextStep:''},
   {domain:'finances',observation:'Доходы выросли',nextStep:''},
   {domain:'mood',observation:'Есть 3 записи настроения',nextStep:'Продолжай записи'},
   {domain:'cycle',observation:'Есть прогноз цикла',nextStep:''},
   {domain:'mood',observation:'Дубликат',nextStep:''}
 ]},payload);
 assert.deepEqual(response.lifeAreas.map(x=>x.domain),['tasks','habits','mood']);
 assert.equal(response.lifeAreas[0].nextStep,'Уточни приоритет');
 assert.deepEqual(ai.availableReviewDomains({}),[]);
 const none=ai.sanitize({lifeAreas:[{domain:'finances',observation:'Куплено 3 товара'}]},
  {data:{profile:{slot:'morning'},connections:{findings:[]}}});
 assert.deepEqual(none.lifeAreas,[]);
});

test('mood spending finds balanced recorded-day, amount and category patterns without causality',()=>{
 const moods=[],expenses=[];
 for(let n=1;n<=24;n++){
  const day='2026-09-'+String(n).padStart(2,'0');
  const good=n%2===0;
  moods.push({date:day,mood:good?'joy':'sadness',samples:[{mood:good?'joy':'sadness'}]});
  if(good||n%4===1){
   expenses.push({actor:'Рустам',occurredAt:day+'T11:00:00+03:00',rubAmount:good?1600:300,categoryId:good?'coffee':'food'});
  }
  expenses.push({actor:'Диана',occurredAt:day+'T11:00:00+03:00',rubAmount:99999,categoryId:'food'});
 }
 const finances={categories:{'Рустам':[{id:'coffee',name:'Кафе'},{id:'food',name:'Продукты'}]},personalExpenses:expenses};
 const rich=connections.analyzeConnections({actor:'Рустам',date:'2026-10-10',moodHistory:moods,finances});
 assert.equal(rich.coverage.moodDays,24);
 assert.equal(rich.coverage.expenseDays,18);
 const coverage=rich.findings.find(x=>x.kind==='mood-spending-coverage');
 const amount=rich.findings.find(x=>x.kind==='mood-spending-amount');
 const category=rich.findings.find(x=>x.kind==='mood-spending-category');
 assert.ok(coverage);assert.ok(amount);assert.ok(category);
 assert.equal(coverage.percentA,100);
 assert.equal(coverage.percentB,50);
 assert.equal(amount.medianA,1600);
 assert.equal(amount.medianB,300);
 assert.match(coverage.text,/Отсутствие записи не доказывает отсутствие трат/);
 assert.match(amount.interpretation,/не доказывает влияние настроения/);
 assert.match(category.text,/Кафе/);
 assert.doesNotMatch(JSON.stringify(rich.findings),/99999/);
 const none=connections.analyzeConnections({actor:'Диана',date:'2026-10-10',moodHistory:moods,finances});
 assert.equal(none.findings.filter(x=>x.kind.startsWith('mood-spending')).length,0);
});
test('mood spending rejects sparse or mixed emotion comparisons',()=>{
 const spending=new Map([['2026-09-01',{sum:900,categories:{Кафе:900}}]]);
 assert.deepEqual(connections.moodSpendingFindings([{date:'2026-09-01',mood:'joy'}],spending,'2026-10-10'),[]);
 const mixed=connections.moodPolarityByDay([{date:'2026-09-01',samples:[{mood:'joy'},{mood:'sadness'}]}],'2026-10-10');
 assert.equal(mixed.has('2026-09-01'),false);
 const ui=fs.readFileSync(path.join(__dirname,'..','public','personal-center.js'),'utf8');
 assert.match(ui,/Настроение и траты/);
 assert.match(ui,/kind\|\|''\)\.startsWith\('mood-spending'\)/);
});

test('deep analysis is generated separately and only for observed life domains',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','api','personal-center-ai.cjs'),'utf8');
 const front=fs.readFileSync(path.join(__dirname,'..','public','personal-center.js'),'utf8');
 const style=fs.readFileSync(path.join(__dirname,'..','public','personal-center.css'),'utf8');
 assert.ok(src.includes("deepAnalysis:{type:'array',items:"));
 assert.ok(src.includes("'lifeAreas','deepAnalysis','confidence'"));
 assert.ok(src.includes('max_completion_tokens:4000'));
 assert.ok(src.includes('ДВА РАЗНЫХ УРОВНЯ АНАЛИЗА'));
 assert.ok(front.includes('Что стоит за выводами'));
 assert.ok(front.includes('КАК ПРОВЕРИТЬ РЕЗУЛЬТАТ'));
 assert.ok(style.includes('.rudi-center__deep-card'));
 const payload={data:{profile:{slot:'morning'},moodHistory:{entries:3},habits:{items:[{name:'Прогулки'}]},
   finances:{expenseEntries:9,incomeEntries:0},connections:{findings:[]}}};
 const narrative=ai.sanitize({overview:'Краткое резюме',
  deepAnalysis:[
    {domain:'mood',evidence:'Три даты в дневнике',analysis:'Есть три наблюдения, для тренда нужны другие даты.',nextStep:'Продолжить журнал.',verify:'Через неделю сверить записи.',caveat:'Мало записей.'},
    {domain:'mood',evidence:'Повтор',analysis:'Дублированное наблюдение.',nextStep:'',verify:'',caveat:''},
    {domain:'finances',evidence:'Доходы выросли',analysis:'Доход значительно вырос.',nextStep:'',verify:'',caveat:''},
    {domain:'health',evidence:'Нет записей здоровья',analysis:'Тренд неизвестен.',nextStep:'',verify:'',caveat:''},
    {domain:'habits',evidence:'Привычка в списке',analysis:'Краткое резюме',nextStep:'',verify:'',caveat:''},
    {domain:'habits',evidence:'Есть привычка прогулок',analysis:'Привычка внесена в список, но завершения не подтверждены.',nextStep:'Отмечать фактическое выполнение.',verify:'Проверить через 7 дней.',caveat:'Нет истории выполнения.'}
  ]},payload);
 assert.deepEqual(narrative.deepAnalysis.map(x=>x.domain),['mood','habits']);
 assert.equal(narrative.deepAnalysis[1].verify,'Проверить через 7 дней.');
 assert.deepEqual(ai.sanitize({deepAnalysis:[]},payload).deepAnalysis,[]);
});


test('Diana can manually generate a missing report and neither actor can replace a ready report',async()=>{
 map.clear();const c=client(),now=Date.parse('2026-10-12T03:00:00Z');
 let count=0;const generate=async actor=>{count++;return {model:'test',narrative:{overview:actor}};};
 const first=await cron.generateForActor('Диана','2026-10-12',{client:c,now,manual:true,generate});
 assert.equal(first.status,'created');assert.equal(count,1);
 const second=await cron.generateForActor('Диана','2026-10-12',{client:c,now,manual:true,generate});
 assert.equal(second.status,'exists');assert.equal(count,1);
 await store.seen('Диана',{client:c});
 assert.equal((await store.unread('Диана',{client:c})).unread,false);
});

test('deterministic placeholder never creates a green halo and remains manually retryable',async()=>{
 map.clear();const c=client(),now=Date.parse('2026-10-12T03:00:00Z');
 await store.saveReport('Диана','2026-10-12','morning',{model:'deterministic',narrative:{overview:'fallback'}},{client:c,now});
 assert.equal((await store.unread('Диана',{client:c})).unread,false);
 const row=await cron.generateForActor('Диана','2026-10-12',{client:c,now,manual:true,generate:async()=>({model:'test',narrative:{overview:'ready'}})});
 assert.equal(row.status,'upgraded');assert.equal((await store.unread('Диана',{client:c})).unread,true);
});


test('personal AI halo refreshes after account switch and clears even for unchanged overview',()=>{
 const app=fs.readFileSync(path.join(__dirname,'..','public','personal-center.js'),'utf8');
 assert.match(app,/attributeFilter:\['data-rudi-actor'\]/);
 assert.match(app,/if\(res\.unchanged\)\{overviewAt=Date\.now\(\);markHalo\(false\)/);
 assert.match(app,/visibilitychange.*checkStatus\(true\)/);
});

test('new morning AI reports trigger a visible halo and polling while the PWA remains open',()=>{
 const app=fs.readFileSync(path.join(__dirname,'..','public','personal-center.js'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'..','public','personal-center.css'),'utf8');
 const shell=fs.readFileSync(path.join(__dirname,'..','public','app.css'),'utf8');
 assert.match(app,/HALO_CHECK_INTERVAL_MS=90\*1000/);
 assert.match(app,/window\.setInterval\(\(\)=>\{if\(!open&&\!document\.hidden\)void checkStatus\(\);\},HALO_CHECK_INTERVAL_MS\)/);
 assert.match(app,/window\.addEventListener\('online',\(\)=>void checkStatus\(true\)\)/);
 assert.match(app,/call\('status'\)/);
 assert.match(app,/markHalo\(res\.unread\)/);
 assert.match(css,/#avatar\.pc-unread\{/);
 assert.match(css,/outline:3px solid #17ca7b!important/);
 assert.match(css,/filter:drop-shadow/);
 assert.match(shell,/\.profile \.avatar\{/);
 assert.match(app,/call\('read-report'\)/);
});
