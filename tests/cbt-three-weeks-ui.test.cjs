'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom'),C=require('../public/cbt-core.js');
function fixture(n=15){
 const now=new Date(),start=new Date(now.getTime()-(n-1)*86400000).toISOString();
 let state=C.apply(null,{id:'existing-start',type:'start',cycleId:'preserve-this-cycle',timeZone:'UTC'},start);
 state.runs[0].contentVersion=1;
 const before={action:'Старый выбранный шаг',prediction:'Старое ожидание',actionDone:true,actual:'Старый результат',thought:'Старая мысль',moodBefore:0,moodAfter:7,conclusion:'Старый вывод'};
 state.runs[0].days[n]={coach:{source:structuredClone(before),result:{version:2,pattern:'Старый анализ',step:'Старый эксперимент'},createdAt:now.toISOString()},answers:before,format:'quick',startedAt:now.toISOString(),savedAt:now.toISOString(),entries:[{id:'draft-two',answers:{thought:'Другой черновик'},startedAt:now.toISOString()}],versions:[{at:now.toISOString(),answers:{thought:'Ранняя версия'}}],coachHistory:[{result:{pattern:'Исторический разбор'}}]};
 const queued={id:'old-offline-edit',type:'edit',cycleId:'preserve-this-cycle',day:n,patch:{actual:'Офлайн результат'},base:{actual:before.actual},at:now.toISOString()};
 const stored={server:state,queue:[queued],backups:[{id:'backup',state:structuredClone(state)}],copy:{version:1,days:[{day:n,title:'СТАРАЯ ТЕМА',prompt:'Старые поведенческие задания'}]},conflict:null};
 const dom=new JSDOM('<!doctype html><html><body data-rudi-actor="Рустам" class="auth-ok"></body></html>',{url:'https://rudi.test/',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;Object.defineProperty(w.navigator,'onLine',{value:false,configurable:true});w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.fetch=async()=>{throw Error('Network must stay offline in this fixture')};
 w.localStorage.setItem('rudi:cbt:v1:Рустам',JSON.stringify(stored));
 for(const f of ['cbt-content.js','cbt-core.js','cbt.js']){
  let source=fs.readFileSync('public/'+f,'utf8');
  if(f==='cbt.js')source=source.replace('window.RudiCbt={open,close,progress,reminder};','window.RudiCbt={open,close,progress,reminder,testAnswerHtml:answerHtml,testWeekly:weekly};');
  w.eval(source);
 }
 w.RudiCbt.open();
 return{dom,w,stored,n,state,get:()=>JSON.parse(w.localStorage.getItem('rudi:cbt:v1:Рустам')),click:selector=>{const el=w.document.querySelector(selector);assert.ok(el,selector);el.click()}};
}
test('opening existing third week uses oral method and retains old answers, pending edits and cycle day',()=>{
 const f=fixture();try{
 f.click('[data-day="15"]');f.click('[data-entry="initial"]');
 const doc=f.w.document,form=doc.querySelector('#cbtExercise');assert.ok(form);assert.match(doc.querySelector('.cbt-prompt').textContent,/устно/);assert.notEqual(doc.querySelector('#cbtDayTitle').textContent,'СТАРАЯ ТЕМА');assert.ok(doc.querySelector('#cbtCoachCard [data-do="coach"]'));assert.match(doc.querySelector('#cbtCoachCard').textContent,/Старый анализ/);assert.equal(doc.querySelector('.cbt-coach-followup'),null);
 assert.ok(form.querySelector('[data-field="verbalReview"]'));assert.equal(form.querySelector('[data-field="actual"]').value,'Офлайн результат');assert.match(form.querySelector('#cbtOptionalFields summary').textContent,/Ранее сохранённые/);
 assert.equal(form.querySelector('[data-field="beliefBefore"]').max,'100');assert.equal(form.querySelector('[data-field="emotionIntensity"]').max,'10');
 assert.equal(form.querySelectorAll('[data-field="emotions"]').length,0);assert.equal(form.querySelectorAll('[data-wrap="emotions"]').length,1);
 const text=form.querySelector('[data-field="alternative"]');text.value='Объяснение после устного разбора';text.dispatchEvent(new f.w.Event('input',{bubbles:true}));
 const local=f.get();assert.equal(local.server.runs[0].id,f.state.runs[0].id);assert.equal(local.server.runs[0].startedAt,f.state.runs[0].startedAt);assert.deepEqual(local.server.runs[0].calendar,f.state.runs[0].calendar);assert.deepEqual(local.server.runs[0].days,f.state.runs[0].days);assert.deepEqual(local.backups,f.stored.backups);assert.ok(local.queue.some(op=>op.id==='old-offline-edit'||op.supersedes?.includes('old-offline-edit')));assert.ok(local.queue.some(op=>op.patch?.alternative==='Объяснение после устного разбора'));assert.ok(!local.queue.some(op=>op.type==='start'));
 let projected=local.server;for(const op of local.queue)projected=C.apply(projected,op,op.at,true);assert.equal(C.nextDay(projected.runs[0]),15);assert.equal(projected.runs[0].days[15].answers.actual,'Офлайн результат');assert.equal(projected.runs[0].days[15].answers.action,'Старый выбранный шаг');assert.equal(projected.runs[0].days[15].answers.moodBefore,0);assert.equal(projected.runs[0].days[15].entries[0].answers.thought,'Другой черновик');
 const html=f.w.RudiCbt.testAnswerHtml({day:15,entry:projected.runs[0].days[15]});for(const value of ['Старый выбранный шаг','Офлайн результат','Старое ожидание','Старый вывод'])assert.ok(html.includes(value));assert.ok(f.w.RudiCbt.testWeekly(projected.runs[0],3).includes('Старый выбранный шаг'));
 }finally{f.dom.window.close()}
});
test('first-week quick entries show all three blocks with both scales and no duplicate controls',()=>{
 const f=fixture(1);try{f.click('[data-day="1"]');f.click('[data-entry="initial"]');const fields=[...f.w.document.querySelectorAll('#cbtExercise > .cbt-step')].map(el=>el.querySelector('[data-wrap]').dataset.wrap);assert.deepEqual(fields,['situation','emotions','emotionIntensity','thought','beliefBefore']);const names=[...f.w.document.querySelectorAll('#cbtExercise [id]')].map(el=>el.id);assert.equal(names.length,new Set(names).size)}finally{f.dom.window.close()}
});
