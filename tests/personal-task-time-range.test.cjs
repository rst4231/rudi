'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const {editable,createPersonalTask,editPersonalTask}=require('../api/personal-task-editor.cjs');
const base={actor:'Рустам',token:{accessToken:'private'},sharedProjectId:'shared',projectId:'own',targetProjectId:'own',taskId:'task',operation:'save',title:'Работа',date:'2026-11-05',time:'12:00',endTime:'13:30'};
function deps(){const calls=[];return{calls,tokenHasWriteScope:()=>true,listTickTickProjects:async()=>[{id:'own',name:'Личный'}],fetchTask:async()=>({id:'task',projectId:'own',title:'Работа',status:0,startDate:'2026-11-05T12:00:00+0300',dueDate:'2026-11-05T13:30:00+0300'}),createTickTickTask:async(_token,value)=>{calls.push(value);return{id:'new'}},updateTickTickTask:async(_token,_p,_id,value)=>calls.push(value)}}
test('personal create and update persist separate start and end timestamps',async()=>{
 const d=deps();await createPersonalTask(base,d);await editPersonalTask(base,d);
 for(const value of d.calls){assert.equal(value.startDate,'2026-11-05T12:00:00+0300');assert.equal(value.dueDate,'2026-11-05T13:30:00+0300');assert.equal(value.isAllDay,false)}
});
test('personal time ranges reject reversed, equal, malformed or missing starts and can be explicitly cleared',()=>{
 for(const bad of [{endTime:'11:59'},{endTime:'12:00'},{endTime:'25:00'},{time:'',endTime:'13:00'}])assert.throws(()=>editable({...base,...bad},{}),/ticktick-personal-time/);
 const point=editable({...base,endTime:''},{});assert.equal(point.dueDate,point.startDate);
 const allDay=editable({...base,time:'',endTime:''},{});assert.equal(allDay.isAllDay,true);assert.equal(allDay.dueDate,allDay.startDate);
});
test('legacy date-only updates preserve existing duration when the end field is omitted',()=>{
 const result=editable({title:'Работа',date:'2026-11-06',time:'14:00'},{startDate:'2026-11-05T12:00:00+0300',dueDate:'2026-11-05T13:30:00+0300'});
 assert.equal(Date.parse(result.dueDate)-Date.parse(result.startDate),90*60000);
});
async function fixture(){
 const dom=new JSDOM('<body></body>',{runScripts:'outside-only',url:'https://rudi.test/'}),w=dom.window,calls=[];
 w.requestAnimationFrame=fn=>fn();w.confirm=()=>true;w.fetch=async(url,options)=>({ok:true,json:async()=>url.includes('personal-task-projects')?{ok:true,lists:[{id:'own',name:'Личный'}]}:{ok:true}});
 w.rudiCalendarOffline={enqueue:async(actor,kind,body)=>{calls.push({actor,kind,body});return{ok:true,queued:true}},isOffline:()=>true};
 w.eval(fs.readFileSync('public/personal-task-editor.js','utf8'));
 const open=(task={})=>w.RUDIPersonalTaskEditor.open({id:'task',personal:true,title:'Работа',date:'2026-11-05',startTime:'12:00',endTime:'13:30',projectId:'own',...task},{actor:'Рустам'});
 open();await new Promise(r=>setTimeout(r,0));return{dom,w,calls,open};
}
test('personal editor loads, saves and resets its optional end time between task cards',async()=>{
 const f=await fixture();try{
  const doc=f.w.document,end=doc.getElementById('rudiPersonalTaskEndTime');assert.ok(end);assert.equal(end.value,'13:30');
  end.value='14:15';doc.getElementById('rudiPersonalTaskForm').dispatchEvent(new f.w.Event('submit',{cancelable:true}));await new Promise(r=>setTimeout(r,0));
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].body.endTime,'14:15');assert.equal(f.calls[0].body.time,'12:00');
  f.open({id:'second',startTime:'09:00',endTime:''});await new Promise(r=>setTimeout(r,0));assert.equal(doc.getElementById('rudiPersonalTaskEndTime').value,'');assert.notEqual(doc.getElementById('rudiPersonalTaskEndTime'),end);
 }finally{f.dom.window.close()}
});
test('personal editor blocks invalid end times before queueing a save',async()=>{
 const f=await fixture();try{const doc=f.w.document;doc.getElementById('rudiPersonalTaskEndTime').value='11:00';doc.getElementById('rudiPersonalTaskForm').dispatchEvent(new f.w.Event('submit',{cancelable:true}));await new Promise(r=>setTimeout(r,0));assert.equal(f.calls.length,0);assert.match(doc.getElementById('rudiPersonalTaskStatus').textContent,/позже начала/)}finally{f.dom.window.close()}
});
