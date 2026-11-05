'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const tasks=require('../api/shared-native-tasks.cjs'),routes=require('../api/shared-native-routes.cjs'),score=require('../api/score-store.cjs');
function fixture(){
 const rows=new Map(),key=(ns,id)=>ns+'|'+id,client={getRecord:async(ns,id)=>rows.has(key(ns,id))?{key:id,value:structuredClone(rows.get(key(ns,id)))}:null,set:async(ns,id,value)=>{rows.set(key(ns,id),structuredClone(value));return true},setIfAbsent:async(ns,id,value)=>{if(rows.has(key(ns,id)))return false;rows.set(key(ns,id),structuredClone(value));return true},remove:async(ns,id)=>rows.delete(key(ns,id)),list:async ns=>[...rows].filter(([k])=>k.startsWith(ns+'|')).map(([k,value])=>({key:k.slice(ns.length+1),value:structuredClone(value)}))};
 let state=null;const scoreCache={get:async()=>structuredClone(state),set:async(_key,value)=>{state=structuredClone(value);return true}},options={client,scoreCache,now:Date.parse('2026-11-05T12:00:00Z')};rows.set(key(tasks.STATE_NS,'ready'),{complete:true});
 return{options,client,create:(value={})=>tasks.create({clientId:'test',title:'Дело',date:'2026-11-05',time:'09:00',responsible:'Рустам',...value},'Рустам',options)};
}
test('no-stars setting is stored on task, retained by ordinary edits and recurring completion snapshots',async()=>{
 const f=fixture();const {task}=await f.create({noStars:true,repeat:'daily'});assert.equal(task.noStars,true);
 await tasks.modify('update',{taskId:task.seriesId,title:'Изменено'},'Рустам',f.options);
 assert.equal((await tasks.occurrences('2026-11','Рустам',f.options))[0].noStars,true);
 const id=task.id;const done=await tasks.modify('complete',{taskId:id,noStars:false},'Рустам',f.options);assert.equal(done.noStars,true);
 await tasks.modify('update',{taskId:task.seriesId,noStars:false},'Рустам',f.options);
 const saved=(await tasks.occurrences('2026-11','Рустам',{...f.options,includeCompleted:true})).find(x=>x.id===id);assert.equal(saved.noStars,true);
 assert.equal((await f.client.getRecord(tasks.TASK_NS,task.seriesId)).value.noStars,false);
});
test('completion skips star awards only when persisted setting is true, keeping notifications and activity',async()=>{
 const src=fs.readFileSync('api/partner-message.js','utf8'),start=src.indexOf('onCompleted:async(result,who)=>{'),end=src.indexOf(',\n        onUndo:',start);assert.ok(start>=0&&end>start);
 for(const noStars of [true,false]){
  const f=fixture(),notifications=[],activity=[];const {task}=await f.create({noStars,responsible:''});
  const onCompleted=vm.runInNewContext('({'+src.slice(start,end)+'}).onCompleted',{options:f.options,sendTaskCompletedNotificationToPartner:async(...a)=>notifications.push(a),recordActivity:async(...a)=>activity.push(a),awardScore:score.awardScore,scheduleShopUnlockNotification(){},console});
  const complete=async()=>{const res={status(n){this.code=n;return this},json(body){this.body=body;return this}};await routes.handle({method:'POST',body:{taskId:task.id,noStars:!noStars}},res,'task-complete','Рустам',f.options,{onCompleted});assert.equal(res.code,200)};
  await complete();await complete();const state=await score.readScoreState(f.options);assert.equal(state.balances['Рустам'],noStars?0:10);assert.equal(state.balances['Диана'],noStars?0:10);assert.equal(notifications.length,1);assert.equal(activity.length,1);
 }
});
test('tasks created without the setting keep normal rewards',()=>{assert.notEqual(tasks.normalizeTask({title:'Дело',date:'2026-11-05'}).noStars,true)});
test('composer sends the checkbox value and resets it for the next new task',async()=>{
 const {JSDOM}=require('jsdom'),html=fs.readFileSync('public/index.html','utf8'),dom=new JSDOM(html),document=dom.window.document,calls=[];
 const src=fs.readFileSync('public/app.js','utf8'),a=src.indexOf('      function setupTickTickTaskComposer(){'),b=src.indexOf('\n      async function loadTickTickNext',a);
 const ctx={document,requestAnimationFrame:fn=>fn(),tg:null,openTickTickTaskForCreation:null,openTickTickTaskForEditing:null,financeNowDateTimeInputs:()=>({date:'2026-11-05',time:'12:00'}),syncRudiTemporalControl(){},sharedAgendaLatestPayload:{writable:true},requestTickTickTaskCreate:async data=>{calls.push(data);return{ok:true}},requestTickTickTaskUpdate:async(id,data)=>{calls.push({id,...data});return{ok:true}},refreshAfterTickTickTaskChange:async()=>{}};
 try{vm.createContext(ctx);vm.runInContext(src.slice(a,b)+';setupTickTickTaskComposer();',ctx);
  ctx.openTickTickTaskForCreation({date:'2026-11-05',time:'12:00'});const check=document.getElementById('ticktickTaskNoStarsInput');assert.ok(check);assert.equal(check.checked,false);check.checked=true;document.getElementById('ticktickTaskTitleInput').value='Тест';
  document.getElementById('ticktickTaskForm').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));await new Promise(r=>setTimeout(r,0));assert.equal(calls[0].noStars,true);
  ctx.openTickTickTaskForCreation({});assert.equal(check.checked,false);ctx.openTickTickTaskForEditing({id:'own',title:'Тест',noStars:true,date:'2026-11-05'});assert.equal(check.checked,true);
 }finally{dom.window.close()}
});
test('legacy shared metadata preserves no-stars on ordinary updates and accepts clearing it',async()=>{
 const {setSharedTaskMeta,getSharedTaskMeta}=require('../api/shared-task-meta-store.cjs');let value=null;const options={sharedTaskMetaCache:{get:async()=>value,set:async(_key,v)=>{value=structuredClone(v)}}};
 await setSharedTaskMeta('one',{responsible:'Рустам',noStars:true},options);await setSharedTaskMeta('one',{responsible:'Рустам'},options);assert.equal((await getSharedTaskMeta('one',options)).noStars,true);
 await setSharedTaskMeta('one',{responsible:'Рустам',noStars:false},options);assert.notEqual((await getSharedTaskMeta('one',options)).noStars,true);
});
