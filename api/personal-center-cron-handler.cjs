'use strict';
const {isCronRequestAuthorized}=require('./cron-auth.cjs');
const {isGitHubActionsRequestAuthorized}=require('./github-actions-oidc.cjs');
const {createRudiStateClient}=require('./rudi-state-client.cjs');
const state=require('./personal-center-store.cjs');
const {generate}=require('./personal-center-ai.cjs');
function slotAt(now=Date.now()){const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Moscow',hour:'2-digit',hourCycle:'h23'}).format(new Date(now)));return hour>=7&&hour<10?'morning':'';}
// Shared idempotent daily generation. Used by the 07:00 schedule and an authenticated manual button.
async function generateForActor(actor,date,options={}){
 if(!state.ACTORS.includes(actor))throw Error('rudi-access-denied');
 const now=options.now||Date.now(),slot='morning';
 const client=options.client||createRudiStateClient({env:options.env||process.env,fetchImpl:options.fetchImpl||globalThis.fetch});
 const key=state.reportKey(actor,date,slot);
 const stored=await client.getRecord(state.NS,key);
 if(stored?.value)return {actor,status:'exists',report:stored.value,model:stored.value.model||''};
 const lockKey='lock:'+key;
 const acquired=await client.setIfAbsent(state.NS,lockKey,{at:new Date(now).toISOString()},{ttl:600,tags:['personal-ai-lock']});
 if(!acquired){
  const completed=await client.getRecord(state.NS,key);
  return completed?.value?{actor,status:'exists',report:completed.value,model:completed.value.model||''}:{actor,status:'already-running',report:null};
 }
 try{
  const result=await (options.generate||generate)(actor,date,slot,{env:options.env||process.env,fetchImpl:options.fetchImpl||globalThis.fetch,client});
  const saved=await state.saveReport(actor,date,slot,result,{client,now});
  return {actor,status:saved.created?'created':'exists',report:saved.report,model:result.model||''};
 }catch(error){
  console.error('RUDI_PERSONAL_CENTER_CRON_ERROR',actor,String(error?.message||error));
  await client.remove(state.NS,lockKey).catch(()=>{});
  return {actor,status:'failed',report:null};
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