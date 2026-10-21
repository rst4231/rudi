'use strict';
const {isCronRequestAuthorized}=require('./cron-auth.cjs');
function createHandler({authorized=req=>isCronRequestAuthorized(req)||isCronRequestAuthorized(req,process.env.RUDI_CRYPTO_CRON_SECRET),run=options=>require('./crypto-live.cjs').run(options)}={}){
 return async function(req,res){
  res.setHeader('Cache-Control','no-store');
  if(!authorized(req))return res.status(401).json({ok:false,error:'not-authorized'});
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'method-not-allowed'});
  try{return res.status(200).json(await run({scheduled:true}));}
  catch(_){return res.status(503).json({ok:false,error:'live-service-unavailable'});}
 };
}
module.exports=createHandler();module.exports.createHandler=createHandler;
