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
 await store.mutate('Рустам','profile',{height:181,vision:{left:'-1.5',right:'+0.75'},chronicConditions:'Астма\\nМигрень'},{client:c});
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
 assert.match(app,/Динамика негативных эмоций/);
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
 assert.match(app,/Динамика негативных эмоций/);
 assert.match(app,/pcDianaCycleSlot/);
 assert.match(app,/const emotions=data.emotions/);
});

test('scheduled AI report runs only at 07:00 Moscow, no evening or legacy replay',()=>{
 const yaml=fs.readFileSync(path.join(__dirname,'..','.github/workflows/personal-ai-center.yml'),'utf8');
 const handler=fs.readFileSync(path.join(__dirname,'..','api/personal-center-cron-handler.cjs'),'utf8');
 assert.match(yaml,/cron: '0 4 \\* \\* \\*'/);
 assert.doesNotMatch(yaml,/cron: '0 4,18/);
 assert.doesNotMatch(handler,/backfillOnly|releaseBackfill/);
 assert.equal(cron.slotAt(Date.parse('2026-10-10T04:00:00Z')),'morning');
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
