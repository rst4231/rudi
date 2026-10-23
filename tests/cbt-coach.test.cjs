'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../public/cbt-core.js'),D=require('../public/cbt-content.js');
const makeResult=()=>({pattern:'Появилась мысль',trap:'Возможное обобщение',reason:'Один неудачный случай',check:'Какие факты?',alternative:'Были и другие результаты',step:'Записать один факт завтра',question:'Удалось выполнить шаг?'});
function fixture(){
 const yesterday=new Date(Date.now()-86400000*2).toISOString();
 let s=C.apply(null,{id:'start',type:'start',cycleId:'cycle',timeZone:'UTC'},yesterday);
 const answers=Object.fromEntries(D.days[0].fields.map(f=>[f.key,f.type==='range'?5:f.type==='emotions'?['Тревога']:'Ответ']));
 s=C.apply(s,{id:'edit',type:'edit',cycleId:'cycle',day:1,patch:answers,base:{}},yesterday);
 s=C.apply(s,{id:'save',type:'complete',cycleId:'cycle',day:1},yesterday);
 return {state:s,answers};
}
function harness(initial){
 let state=initial,modelCalls=0;
 const handler=require('../api/cbt-handler.cjs').createHandler({
  authorizeRequest:()=>({actor:'Рустам'}),
  readAppState:async(_actor,key)=>key==='cbt-program-v1'?structuredClone(state):null,
  writeAppState:async(_actor,key,v)=>{if(key==='cbt-program-v1')state=structuredClone(v)},
  stateClient:{setIfAbsent:async()=>true,remove:async()=>{}},
  generateCoach:async()=>{modelCalls++;return makeResult()}
 });
 return {handler,get:()=>state,calls:()=>modelCalls};
}
async function request(handler,body){
 let status=200,payload;
 await handler({method:'POST',body},{setHeader(){},status(v){status=v;return this},json(v){payload=v;return this}});
 return {status,payload};
}
test('AI analysis is stored under the authorized account entry, cached on repeat and survives state read',async()=>{
 const {state}=fixture(),h=harness(state),payload={operation:'analyze',cycleId:'cycle',day:1,entryId:'initial'};
 let res=await request(h.handler,payload);
 assert.equal(res.status,200);assert.equal(h.calls(),1);assert.equal(res.payload.result.step,makeResult().step);
 assert.equal(C.entry(h.get().runs[0],1).coach.result.step,makeResult().step);
 res=await request(h.handler,payload);assert.equal(res.status,200);assert.equal(res.payload.cached,true);assert.equal(h.calls(),1);
 res=await request(h.handler,{operation:'state'});assert.ok(res.payload.state.runs[0].days[1].coach);
});
test('the client cannot inject an arbitrary model analysis through sync mutation',async()=>{
 const {state,answers}=fixture(),h=harness(state);
 const res=await request(h.handler,{operation:'mutate',ops:[{id:'fake',type:'coach',cycleId:'cycle',day:1,coach:makeResult(),base:answers}]});
 assert.equal(res.status,400);assert.equal(C.entry(h.get().runs[0],1).coach,undefined);
});
test('AI response is rejected if saved answers changed while the model was running',async()=>{
 const {state}=fixture();let current=state,modelCalls=0;
 const handler=require('../api/cbt-handler.cjs').createHandler({
  authorizeRequest:()=>({actor:'Рустам'}),readAppState:async(_a,k)=>k==='cbt-program-v1'?structuredClone(current):null,
  writeAppState:async(_a,k,v)=>{current=structuredClone(v)},stateClient:{setIfAbsent:async()=>true,remove:async()=>{}},
  generateCoach:async()=>{modelCalls++;const existing=C.entry(current.runs[0],1);current=C.apply(current,{id:'edit-later',type:'edit',cycleId:'cycle',day:1,patch:{thought:'Теперь другая мысль'},base:{thought:existing.answers.thought}},new Date().toISOString());return makeResult()}
 });
 const res=await request(handler,{operation:'analyze',cycleId:'cycle',day:1});
 assert.equal(res.status,409);assert.equal(res.payload.error,'cbt-conflict-coach');assert.equal(modelCalls,1);
 assert.equal(C.entry(current.runs[0],1).coach,undefined);
});
test('model JSON validates all seven fields and rejects untrusted malformed output',()=>{
 const {validateResult,safeAnswers}=require('../api/cbt-coach.cjs');
 assert.deepEqual(validateResult(makeResult()),makeResult());
 assert.throws(()=>validateResult({pattern:'Недостаточно данных'}),/cbt-coach-invalid/);
 assert.deepEqual(safeAnswers({thought:'Пример',password:{key:'secret'},emotions:['Радость'],count:2}),{thought:'Пример',emotions:['Радость'],count:2});
});
