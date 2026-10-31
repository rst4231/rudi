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
 assert.deepEqual(validateResult(makeResult()),{...makeResult(),version:2});
 assert.throws(()=>validateResult({pattern:'Недостаточно данных'}),/cbt-coach-invalid/);
 assert.deepEqual(safeAnswers({thought:'Пример',password:{key:'secret'},emotions:['Радость'],count:2}),{thought:'Пример',emotions:['Радость'],count:2});
});

test('ordinary positive events need no invented trap or action',()=>{
 const {validateResult}=require('../api/cbt-coach.cjs');
 const result=validateResult({pattern:'Поели то, что вам понравилось, и смогли расслабиться. Иногда этого объяснения вполне достаточно.',trap:'',reason:'',check:'',alternative:'',step:'',question:''});
 assert.equal(result.version,2);
 for(const key of ['trap','reason','check','alternative','step','question'])assert.equal(result[key],'');
});
test('previously cached robotic report is replaced and archived without losing answers',async()=>{
 const {state,answers}=fixture();let old=C.apply(state,{
  id:'old-coach',type:'coach',cycleId:'cycle',day:1,entryId:'initial',base:answers,coach:makeResult()
 },new Date().toISOString());
 const previousStep=C.entry(old.runs[0],1).coach.result.step;
 const h=harness(old);
 const first=await request(h.handler,{operation:'analyze',cycleId:'cycle',day:1,entryId:'initial'});
 assert.equal(first.status,200);assert.equal(first.payload.cached,undefined);
 assert.equal(first.payload.result.version,2);
 assert.equal(h.calls(),1);
 const record=C.entry(h.get().runs[0],1);
 assert.equal(record.coachHistory.length,1);
 assert.equal(record.coachHistory[0].result.step,previousStep);
 assert.deepEqual(record.answers,answers);
 const second=await request(h.handler,{operation:'analyze',cycleId:'cycle',day:1,entryId:'initial'});
 assert.equal(second.payload.cached,true);
 assert.equal(h.calls(),1);
});
test('sample window observation may omit distortion and keeps a practical choice',()=>{
 const {validateResult}=require('../api/cbt-coach.cjs');
 const result=validateResult({pattern:'Похоже, вас задело, что открыли окно, не спросив остальных.',trap:'',reason:'',check:'',alternative:'Вы промолчали, хотя были недовольны.',step:'Если повторится, можно спокойно сказать, что вам некомфортно.',question:'Получилось ли сказать об этом?'});
 assert.ok(result.pattern.includes('окно'));
 assert.equal(result.trap,'');
 assert.ok(result.step.includes('сказать'));
});
