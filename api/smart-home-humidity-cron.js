const { isCronRequestAuthorized } = require('./cron-auth.cjs');
const { isGitHubActionsRequestAuthorized } = require('./github-actions-oidc.cjs');
const { readSmartHomeSnapshot } = require('./smart-home-client.cjs');
const { evaluateHumidityAlert } = require('./smart-home-humidity-alert.cjs');

async function handler(req,res){
  const authorized = isCronRequestAuthorized(req) || await isGitHubActionsRequestAuthorized(req, {
    audience: 'rudi-smart-home-humidity',
    workflowRef: 'rst4231/rudi/.github/workflows/smart-home-humidity-alert.yml@refs/heads/main',
  });
  if(!authorized){
    console.warn('RUDI_HUMIDITY_CRON_UNAUTHORIZED');
    return res.status(401).json({ok:false,error:'unauthorized-cron'});
  }
  try{
    const snapshot=await readSmartHomeSnapshot(true,{
      env:process.env,
      fetchImpl:globalThis.fetch,
      observeCamera:false,
    });
    const result=await evaluateHumidityAlert(snapshot,{
      env:process.env,
      fetchImpl:globalThis.fetch,
    });
    console.log('RUDI_HUMIDITY_CRON_RESULT',JSON.stringify({
      humidity:result.humidity,sent:result.sent,skipped:result.skipped
    }));
    return res.status(200).json({ok:true,...result});
  }catch(error){
    console.error('RUDI_HUMIDITY_CRON_ERROR',String(error?.message||error));
    return res.status(500).json({ok:false,error:'humidity-check-failed'});
  }
}
module.exports=handler;
