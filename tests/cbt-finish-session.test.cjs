'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../public/cbt-core.js');
const startAt='2026-11-01T10:00:00Z',finishAt='2026-11-04T14:00:00Z';
function fixture(){let s=C.apply(null,{id:'start',type:'start',cycleId:'session',timeZone:'UTC'},startAt);return C.apply(s,{id:'edit',type:'edit',cycleId:'session',day:4,patch:{situation:'Факт',thought:'Моя мысль',emotions:['Злость'],emotionIntensity:0},base:{}},'2026-11-04T13:00:00Z')}
test('finish preserves answers and drafts, freezes actual progress, and is idempotent',()=>{
 const initial=fixture(),op={id:'finish',type:'finish-session',cycleId:'session'};
 const s=C.apply(initial,op,finishAt),r=s.runs[0];assert.equal(r.status,'completed');assert.equal(r.completionReason,'manual');assert.equal(r.completedAt,finishAt);assert.equal(r.id,'session');assert.deepEqual(r.days[4].answers,initial.runs[0].days[4].answers);assert.ok(r.days[4].savedAt);assert.equal(C.active(s),null);assert.equal(C.stats(r,undefined,finishAt).completed,3);
 const later=C.refresh(s,'2026-12-04T14:00:00Z');assert.equal(C.stats(later.runs[0],undefined,'2026-12-04T14:00:00Z').completed,3);assert.equal(Object.keys(later.runs[0].days).length,Object.keys(s.runs[0].days).length);assert.deepEqual(C.apply(s,op,finishAt),s);assert.equal(initial.runs[0].status,'active');
});
test('new cycle after finish keeps the old session; late offline changes before finish remain recoverable',()=>{
 let s=C.apply(fixture(),{id:'finish',type:'finish-session',cycleId:'session'},finishAt);
 s=C.apply(s,{id:'late',type:'edit',cycleId:'session',day:4,patch:{beliefBefore:70},base:{}},'2026-11-04T13:30:00Z');assert.equal(s.runs[0].status,'completed');assert.equal(s.runs[0].days[4].answers.beliefBefore,70);
 assert.throws(()=>C.apply(s,{id:'after',type:'edit',cycleId:'session',day:4,patch:{thought:'После завершения'},base:{thought:'Моя мысль'}},'2026-11-04T14:01:00Z'),/cbt-read-only/);
 s=C.apply(s,{id:'new',type:'start',cycleId:'new-session',expectedActive:null,timeZone:'UTC'},'2026-11-04T14:02:00Z');assert.equal(s.runs.length,2);assert.equal(C.active(s).id,'new-session');assert.equal(s.runs[0].days[4].answers.thought,'Моя мысль');
});
test('authenticated API accepts finish offline replay and keeps the other actor isolated',async()=>{
 const records=new Map([['Рустам',fixture()]]),handler=require('../api/cbt-handler.cjs').createHandler({authorizeRequest:req=>({actor:req.actor}),readAppState:async(a,k)=>k==='cbt-program-v1'?structuredClone(records.get(a)||C.empty()):null,writeAppState:async(a,k,v)=>records.set(a,structuredClone(v)),stateClient:{setIfAbsent:async()=>true,remove:async()=>{}}});
 async function request(actor,op){let result;await handler({method:'POST',actor,body:{operation:'mutate',op}},{setHeader(){},status(code){this.code=code;return this},json(data){result={status:this.code,data}}});return result}
 const op={id:'finish-api',type:'finish-session',cycleId:'session',at:finishAt};const result=await request('Рустам',op);assert.equal(result.status,200);assert.equal(result.data.state.runs[0].completionReason,'manual');assert.equal((await request('Рустам',op)).status,200);const other=await request('Диана',op);assert.equal(other.status,409);assert.equal(records.has('Диана'),false);
});
