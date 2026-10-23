'use strict';
const {authorizeRequest,statusForError}=require('./rudi-request-auth.cjs');
const {readAppState,writeAppState}=require('./rudi-auth-db.cjs');
const {createRudiStateClient}=require('./rudi-state-client.cjs');
const core=require('../public/cbt-core.js');
const content=require('../public/cbt-content.js');
const coach=require('./cbt-coach.cjs');
const crypto=require('node:crypto');
const KEY='cbt-program-v1';
function createHandler(deps={}){
 const authorize=deps.authorizeRequest||authorizeRequest,read=deps.readAppState||readAppState,write=deps.writeAppState||writeAppState;
 const client=deps.stateClient||createRudiStateClient();
 const generateCoach=deps.generateCoach||coach.analyze;
 async function withLock(actor,work){const k=actor+':cbt';if(!await client.setIfAbsent('cbt-write-lock-v1',k,{locked:true},{ttl:120}))throw Error('cbt-busy');try{return await work()}finally{await client.remove('cbt-write-lock-v1',k)}}
 return async function(req,res){
  res.setHeader('Cache-Control','private, no-store');res.setHeader('Vary','Cookie');
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'method-not-allowed'});
  try{
   const body=req.body&&typeof req.body==='object'&&!Array.isArray(req.body)?req.body:{};
   const {actor}=authorize(req,body.initData);
   if(body.expectedActor&&body.expectedActor!==actor)return res.status(409).json({ok:false,error:'cbt-actor-changed'});
   if(!['Рустам','Диана'].includes(actor))return res.status(403).json({ok:false,error:'rudi-access-denied'});
   if(body.operation==='partner-status'){
    const partner=actor==='Рустам'?'Диана':'Рустам';
    const state=core.refresh(await read(partner,KEY)||core.empty());
    return res.status(200).json({ok:true,actor,partner,active:!!core.active(state)});
   }
   if(!body.operation||body.operation==='state'){
    // Optional copy overrides use existing storage and a bundled offline fallback.
    const [stored,copy]=await Promise.all([read(actor,KEY),read(actor,'cbt-content-copy-v1').catch(()=>null)]);
    const state=core.refresh(stored||core.empty());
    return res.status(200).json({ok:true,actor,state,copy:copy?.version===content.version?copy:null});
   }
   if(body.operation==='analyze'){
    const cycleId=String(body.cycleId||''),day=Number(body.day),entryId=String(body.entryId||'initial');
    if(!/^[a-zA-Z0-9_-]{1,90}$/.test(cycleId)||!Number.isInteger(day)||day<1||day>21||!/^[a-zA-Z0-9_-]{1,90}$/.test(entryId))return res.status(400).json({ok:false,error:'cbt-invalid-coach'});
    const state=core.refresh(await read(actor,KEY)||core.empty()),run=state.runs.find(r=>r.id===cycleId),record=core.entry(run,day,entryId);
    if(!record||!record.savedAt||!core.hasAnswers(record.answers))return res.status(409).json({ok:false,error:'cbt-coach-needs-save'});
    if(record.coach?.result?.version===coach.COACH_VERSION&&core.same(record.coach.source,record.answers))return res.status(200).json({ok:true,result:record.coach.result,state,actor,cached:true});
    const source=JSON.parse(JSON.stringify(record.answers));
    const recent=Object.entries(run.days||{}).filter(([n])=>Number(n)<day).sort((a,b)=>Number(a[0])-Number(b[0]))
     .flatMap(([,row])=>core.entries(row).filter(e=>e.coach?.result?.step?.trim()&&core.same(e.coach.source,e.answers)).map(e=>({step:e.coach.result.step,outcome:e.coachCheck?.outcome||''}))).slice(-3);
    const result=coach.validateResult(await generateCoach({day,answers:source,recent}));
    return await withLock(actor,async()=>{
     const latest=await read(actor,KEY)||core.empty(),r=latest.runs.find(x=>x.id===cycleId),e=core.entry(r,day,entryId);
     if(!e||!e.savedAt||!core.same(e.answers,source))return res.status(409).json({ok:false,error:'cbt-conflict-coach'});
     if(e.coach?.result?.version===coach.COACH_VERSION&&core.same(e.coach.source,source))return res.status(200).json({ok:true,result:e.coach.result,state:latest,actor,cached:true});
     const next=core.apply(latest,{id:crypto.randomUUID(),type:'coach',cycleId,day,entryId,base:source,coach:result},new Date().toISOString());
     await write(actor,KEY,next);
     return res.status(200).json({ok:true,result,state:next,actor});
    });
   }
   if(body.operation!=='mutate')return res.status(400).json({ok:false,error:'cbt-invalid-operation'});
   const ops=body.ops===undefined?[body.op]:body.ops;
   if(!Array.isArray(ops)||!ops.length||ops.length>50)throw Error('cbt-invalid-operations');
   for(const op of ops){if(op?.type==='coach')return res.status(400).json({ok:false,error:'cbt-invalid-operation'});core.validate(op)}
   // Same atomic lease pattern as existing home-note writes. Only this actor's CBT state is locked.
   const lockKey=actor+':cbt';
   if(!await client.setIfAbsent('cbt-write-lock-v1',lockKey,{locked:true},{ttl:120}))return res.status(503).json({ok:false,error:'cbt-busy'});
   try{
    const state=await read(actor,KEY)||core.empty();
    let next=state;const acked=[];
    for(const op of ops){
     try{
      const at=Date.parse(op.at||'');
      const safeAt=Number.isFinite(at)&&at>=Date.UTC(2020,0,1)&&at<=Date.now()+300000?new Date(at).toISOString():new Date().toISOString();
      next=core.apply(next,op,safeAt);acked.push(op.id);
     }catch(e){
      if(e.message.startsWith('cbt-conflict')||['cbt-read-only','cbt-run-missing','cbt-entry-missing','cbt-incomplete'].includes(e.message)){
       if(acked.length)await write(actor,KEY,next);
       return res.status(409).json({ok:false,error:e.message,fields:e.fields,opId:op.id,state:next,acked,actor});
      }
      throw e;
     }
    }
    next=core.refresh(next);await write(actor,KEY,next);
    return res.status(200).json({ok:true,actor,state:next,acked});
   }finally{await client.remove('cbt-write-lock-v1',lockKey)}
  }catch(e){
   const code=String(e?.message||'server-error');
   const status=code==='cbt-incomplete'||code.startsWith('cbt-invalid')?400:['cbt-busy','cbt-coach-unavailable','cbt-coach-invalid'].includes(code)?503:statusForError(e);
   if(status>=500)console.error('RUDI_CBT_ERROR',status); // Never log private answers.
   return res.status(status).json({ok:false,error:status>=500?'cbt-unavailable':code,fields:e.fields||[]});
  }
 };
}
module.exports=createHandler();module.exports.createHandler=createHandler;
