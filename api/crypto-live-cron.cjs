'use strict';
const {isCronRequestAuthorized}=require('./cron-auth.cjs');
function createHandler({authorized=req=>isCronRequestAuthorized(req)||isCronRequestAuthorized(req,process.env.RUDI_CRYPTO_CRON_SECRET),run=options=>require('./crypto-live.cjs').run(options)}={}){
 return async function(req,res){
  res.setHeader('Cache-Control','no-store');
  if(!authorized(req))return res.status(401).json({ok:false,error:'not-authorized'});
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'method-not-allowed'});
  try{
   const result=await run({scheduled:true});
   // A degraded exchange or author feed is a failed scheduled execution.
   // Expose it through the HTTP status so Worker and monitoring can react.
   return res.status(result?.ok===true?200:503).json(result);
  }
  catch(error){
   // Log only stable internal error codes: never leak exchange keys or response bodies.
   const code=String(error?.message||'');
   const safe=/^(?:live|rudi-d1)-[a-z0-9-]{1,80}$/.test(code)?code:'internal-error';
   console.warn('RUDI_CRYPTO_LIVE_CRON_FAIL',safe);
   return res.status(503).json({ok:false,error:'live-service-unavailable'});
  }
 };
}
module.exports=createHandler();module.exports.createHandler=createHandler;
