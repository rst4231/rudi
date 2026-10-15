'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const source=name=>fs.readFileSync(path.join(root,name),'utf8');
test('Lulu history is controlled by accessible name and paw stays independent',()=>{
 const app=source('public/app.js');
 assert.match(app,/<button id="luluWalkHistoryToggle" class="lulu-name lulu-name-button"/);
 assert.match(app,/aria-controls="luluWalkHistory" aria-expanded="false"/);
 assert.doesNotMatch(app,/class="lulu-walk-history-toggle"/);
 assert.match(app,/getElementById\('luluWalkButton'\)\?\.addEventListener\('click',markLuluWalk\)/);
 assert.match(app,/getElementById\('luluWalkHistoryToggle'\)\?\.addEventListener\('click',toggleLuluWalkHistory\)/);
 assert.match(app,/cancelLuluWalkEntry\(row,cancel\)/);
});
test('unanswered day question is always expanded and spacing remains mobile friendly',()=>{
 const app=source('public/app.js'),css=source('public/app.css');
 assert.match(app,/key==='daily-question'&&collapsed&&section\.dataset\.dailyQuestionAnswerState!=='answered'/);
 assert.match(app,/resetCollapsedOnInit:true/);
 assert.match(app,/const shouldCollapse=mineAnswered&&\(previous==='unanswered'\|\|questionChanged\)/);
 assert.match(css,/#dailyQuestionTile \.daily-question-body/);
 assert.match(css,/#dailyQuestionTile \.daily-question-text/);
});
test('five bottom navigation tabs recover on returning from other screens',()=>{
 const app=source('public/app.js');
 assert.match(app,/function restorePrimaryTabBar\(\)/);
 assert.match(app,/window\.addEventListener\('pageshow',\(\)=>requestAnimationFrame\(restorePrimaryTabBar\)\)/);
 assert.match(app,/bar\.classList\.toggle\('is-hidden',!show\)/);
 assert.match(app,/restorePrimaryTabBar\(\);/);
});
test('word game supports six attempts, safe-area and short phone heights',()=>{
 const js=source('public/rudi-games-extra.js'),css=source('public/rudi-games.css');
 assert.match(js,/Array\.from\(\{length:6\}/);
 assert.match(css,/height:100dvh/);
 assert.match(css,/-webkit-overflow-scrolling:touch/);
 assert.match(css,/@media\(max-height:610px\)/);
 assert.match(css,/rudi-word-form input/);
});
test('personal AI rejects empty response, preserves previous successful report',async()=>{
 const {generate}=require('../api/personal-center-ai.cjs');
 const payload={data:{profile:{slot:'morning'},connections:{findings:[]}},missing:[]};
 const opts={gatherImpl:async()=>payload,env:{GROQ_API_KEY:'test'},fetchImpl:async()=>({
   status:200,ok:true,headers:{get:()=>null},
   json:async()=>({choices:[{message:{content:JSON.stringify({overview:'',mainAction:''})}}]})
 })};
 const bad=await generate('Рустам','2026-10-15','morning',opts);
 assert.equal(bad.model,'deterministic');
 assert.equal(bad.failureReason,'invalid-narrative');
 const good=await generate('Рустам','2026-10-15','morning',{...opts,fetchImpl:async()=>({
   status:200,ok:true,headers:{get:()=>null},
   json:async()=>({choices:[{message:{content:JSON.stringify({overview:'Сегодня важны реальные планы.',mainAction:'Отметить одну выполненную задачу.'})}}]})
 })});
 assert.equal(good.model,'openai/gpt-oss-20b');
 assert.match(good.narrative.overview,/Сегодня важны/);
 const {saveReport,latest}=require('../api/personal-center-store.cjs');
 const db=new Map(),client={
   getRecord:async(ns,key)=>({value:db.get(key)||null}),
   setIfAbsent:async(ns,key,v)=>{if(db.has(key))return false;db.set(key,v);return true},
   set:async(ns,key,v)=>{db.set(key,v)}
 };
 await saveReport('Рустам','2026-10-14','morning',good,{client,now:Date.parse('2026-10-14T06:00:00Z')});
 await saveReport('Рустам','2026-10-15','morning',bad,{client,now:Date.parse('2026-10-15T06:00:00Z')});
 assert.equal((await latest('Рустам',{client})).model,'openai/gpt-oss-20b');
});
