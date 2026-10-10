'use strict';
const {isCronRequestAuthorized}=require('./cron-auth.cjs');
const {createRudiStateClient}=require('./rudi-state-client.cjs');
const state=require('./personal-center-store.cjs');
const {generate}=require('./personal-center-ai.cjs');
function slotAt(now=Date.now()){const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Moscow',hour:'2-digit',hourCycle:'h23'}).format(new Date(now)));return hour===7?'morning':hour===21?'evening':'';}
async function run(options={}){
 const now=options.now||Date.now(),date=state.moscowDate(now),slot=slotAt(now);
 if(!slot)return {ok:true,skipped:'outside-schedule',date};
 const client=options.client||createRudiStateClient({env:options.env||process.env,fetchImpl:options.fetchImpl||globalThis.fetch});
 const results=[];
 for(const actor of state.ACTORS){
  const key=state.reportKey(actor,date,slot);
  const exists=await client.getRecord(state.NS,key);
  if(exists?.value){results.push({actor,status:'exists'});continue;}
  const lockKey='lock:'+key;
  const acquired=await client.setIfAbsent(state.NS,lockKey,{at:new Date(now).toISOString()},{ttl:600,tags:['personal-ai-lock']});
  if(!acquired){results.push({actor,status:'already-running'});continue;}
  try{
   const result=await (options.generate||generate)(actor,date,slot,{env:options.env||process.env,fetchImpl:options.fetchImpl||globalThis.fetch,client});
   const saved=await state.saveReport(actor,date,slot,result,{client,now});
   results.push({actor,status:saved.created?'created':'exists',model:result.model||''});
  }catch(e){console.error('RUDI_PERSONAL_CENTER_CRON_ERROR',actor,String(e?.message||e));await client.remove(state.NS,lockKey).catch(()=>{});results.push({actor,status:'failed'});}
 }
 return {ok:results.every(x=>x.status!=='failed'),date,slot,results};
}
async function handler(req,res){
 if(!isCronRequestAuthorized(req))return res.status(401).json({ok:false,error:'unauthorized'});
 if(req.method!=='GET'&&req.method!=='POST')return res.status(405).json({ok:false,error:'method-not-allowed'});
 try{const result=await run();res.setHeader('Cache-Control','no-store');return res.status(result.ok?200:503).json(result);}
 catch(error){console.error('RUDI_PERSONAL_CRON_FAILURE',String(error?.message||error));return res.status(503).json({ok:false,error:'generation-failed'});}
}
module.exports=handler;module.exports.run=run;module.exports.slotAt=slotAt;