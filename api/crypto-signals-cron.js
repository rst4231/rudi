'use strict';
const {isGitHubActionsRequestAuthorized}=require('./github-actions-oidc.cjs');
const {refreshSignals}=require('./crypto-signals.cjs');
module.exports=async function cryptoSignalsCron(req,res){
  res.setHeader?.('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'method-not-allowed'});
  const authorized=await isGitHubActionsRequestAuthorized(req,{
    audience:'rudi-crypto-signals',
    workflowRef:'rst4231/rudi/.github/workflows/crypto-signals.yml@refs/heads/main'
  });
  if(!authorized)return res.status(401).json({ok:false,error:'not-authorized'});
  try{
    const data=await refreshSignals();
    return res.status(200).json({ok:true,updatedAt:data.updatedAt,total:data.stats.total,
      verified:data.stats.verified,backfillComplete:data.backfillComplete,
      sourceError:data.sourceError,priceError:data.priceError});
  }catch(error){
    console.warn('RUDI_CRYPTO_SIGNALS_CRON_FAILED',String(error?.message||error));
    return res.status(503).json({ok:false,error:'source-unavailable'});
  }
};