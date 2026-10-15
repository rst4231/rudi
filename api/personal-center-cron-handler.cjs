'use strict';
const {isCronRequestAuthorized}=require('./cron-auth.cjs');
const {isGitHubActionsRequestAuthorized}=require('./github-actions-oidc.cjs');
const {createRudiStateClient}=require('./rudi-state-client.cjs');
const state=require('./personal-center-store.cjs');
const {generate}=require('./personal-center-ai.cjs');
function slotAt(now=Date.now()){const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Moscow',hour:'2-digit',hourCycle:'h23'}).format(new Date(now)));return hour>=6&&hour<10?'morning':'';}
// Scheduled and manual requests are idempotent for both authenticated actors.
const RETRY_LIMIT=3,RETRY_WAIT_MS=90*1000;
async function generateForActor(actor,date,options={}){
 if(!state.ACTORS.includes(actor))throw Error('rudi-access-denied');
 const manual=options.manual===true;
 const now=options.now||Date.now(),slot='morning';
 const client=options.client||createRudiStateClient({env:options.env||process.env,fetchImpl:options.fetchImpl||globalThis.fetch});
 const key=state.reportKey(actor,date,slot),lockKey='lock:'+key,retryKey='retry:'+key;
 const initial=(await client.getRecord(state.NS,key))?.value||null;
 if(initial&&initial.model!=='deterministic')
  return {actor,status:'exists',report:initial,model:initial.model||''};
 const acquired=await client.setIfAbsent(state.NS,lockKey,{at:new Date(now).toISOString()},{ttl:600,tags:['personal-ai-lock']});
 if(!acquired){
  const latest=(await client.getRecord(state.NS,key))?.value||null;
  return {actor,status:'already-running',report:latest};
 }
 try{
  // Re-check inside the lock: manual and scheduled requests can arrive simultaneously.
  const existing=(await client.getRecord(state.NS,key))?.value||null;
  if(existing&&existing.model!=='deterministic')
   return {actor,status:'exists',report:existing,model:existing.model||''};
  const retry=Boolean(existing&&options.retryFallback&&!manual);
  if(retry){
   const prior=(await client.getRecord(state.NS,retryKey))?.value||{};
   const attempts=Math.max(0,Number(prior.attempts)||0),notBefore=Math.max(0,Number(prior.notBefore)||0);
   if(attempts>=RETRY_LIMIT)
    return {actor,status:'retry-limit',report:existing};
   if(now<notBefore)
    return {actor,status:'retry-cooldown',retryAfterSeconds:Math.ceil((notBefore-now)/1000),report:existing};
   // Persist the attempt BEFORE using any provider tokens.
   await client.set(state.NS,retryKey,{attempts:attempts+1,notBefore:now+RETRY_WAIT_MS,updatedAt:new Date(now).toISOString()},{tags:['personal-ai-retry',actor]});
  }
  const result=await (options.generate||generate)(actor,date,slot,{env:options.env||process.env,fetchImpl:options.fetchImpl||globalThis.fetch,client});
  if(retry){
   if(result.model==='deterministic')
    return {actor,status:'unavailable',report:existing,retryAfterSeconds:Math.ceil(RETRY_WAIT_MS/1000),failureReason:result.failureReason||''};
   const upgraded=await state.upgradeFallbackReport(actor,date,slot,result,{client,now});
   return {actor,status:upgraded.upgraded?'upgraded':'exists',report:upgraded.report,model:result.model||''};
  }
  // Manual generation is available to Diana and Rustam only while the
  // authentic AI report is absent. A deterministic placeholder is retryable.
  if(manual){
   if(result.model==='deterministic') return {
    actor,status:'unavailable',report:existing||null,failureReason:result.failureReason||'provider-unavailable',retryAfterSeconds:result.failureReason==='rate-limited'?90:0
   };
   if(existing){
    const upgraded=await state.upgradeFallbackReport(actor,date,slot,result,{client,now});
    return {actor,status:upgraded.upgraded?'upgraded':'exists',report:upgraded.report,model:result.model||''};
   }
  }
  const saved=await state.saveReport(actor,date,slot,result,{client,now});
  return {actor,status:saved.created?'created':'exists',report:saved.report,model:result.model||''};
 }catch(error){
  console.error('RUDI_PERSONAL_CENTER_CRON_ERROR',actor,String(error?.message||error));
  return {actor,status:'failed',report:initial};
 }finally{
  await client.remove(state.NS,lockKey).catch(()=>{});
 }
}
async function run(options={}){
 const now=options.now||Date.now(),date=state.moscowDate(now),slot=slotAt(now);
 if(!slot)return {ok:true,skipped:'outside-morning-window',date};
 const client=options.client||createRudiStateClient({env:options.env||process.env,fetchImpl:options.fetchImpl||globalThis.fetch});
 const results=[];
 for(const actor of state.ACTORS){
  const row=await generateForActor(actor,date,{...options,now,client});
  results.push({actor:row.actor,status:row.status,...(row.model?{model:row.model}:{})});
 }
 return {ok:results.every(x=>x.status!=='failed'),date,slot,results};
}
async function handler(req,res){
 const authorized=isCronRequestAuthorized(req)||await isGitHubActionsRequestAuthorized(req,{audience:'rudi-personal-ai-center',workflowRef:'rst4231/rudi/.github/workflows/personal-ai-center.yml@refs/heads/main'});
 if(!authorized)return res.status(401).json({ok:false,error:'unauthorized'});
 if(req.method!=='GET'&&req.method!=='POST')return res.status(405).json({ok:false,error:'method-not-allowed'});
 try{const result=await run();res.setHeader('Cache-Control','no-store');return res.status(result.ok?200:503).json(result);}
 catch(error){console.error('RUDI_PERSONAL_CRON_FAILURE',String(error?.message||error));return res.status(503).json({ok:false,error:'generation-failed'});}
}
module.exports=handler;module.exports.run=run;module.exports.slotAt=slotAt;module.exports.generateForActor=generateForActor;