const crypto = require('node:crypto');
function unavailable(value) {
  return value?.online===false || value?.reachable===false ||
    [value?.state,value?.status].some(x=>typeof x==='string'&&x.toLowerCase()==='offline') ||
    Boolean(value?.error_code||value?.errorCode);
}
function reading(device,instance) {
  if(unavailable(device))return null;
  const prop=(device?.properties||[]).find(p=>p?.parameters?.instance===instance);
  if(!prop||unavailable(prop)||unavailable(prop.state))return null;
  const raw=prop.state?.value;
  if(raw===null||raw===undefined||typeof raw==='boolean'||String(raw).trim()==='')return null;
  const n=Number(raw);
  if(!Number.isFinite(n))return null;
  return instance==='humidity'?(n>=0&&n<=100?n:null):(n>=-30&&n<=60?n:null);
}
function climateOnly(snapshot) {
  const devices=Array.isArray(snapshot?.devices)?snapshot.devices:[];
  const device=devices.find(d=>(d?.properties||[]).some(p=>p?.parameters?.instance==='temperature')) ||
    devices.find(d=>(d?.properties||[]).some(p=>p?.parameters?.instance==='humidity'));
  const room=(snapshot?.rooms||[]).find(r=>r?.id===device?.room)?.name;
  return {temperature:reading(device,'temperature'),humidity:reading(device,'humidity'),room:String(room||'').slice(0,80)};
}
async function handleLumaClimate(req,res,options={}) {
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'method-not-allowed'})}
  const env=options.env||process.env;
  const expected=String(env.RUDI_LUMA_CLIMATE_TOKEN_SHA256||'');
  if(!/^[a-f0-9]{64}$/i.test(expected))return res.status(503).json({ok:false,error:'climate-not-configured'});
  const header=String(req.headers?.authorization||'');
  const match=/^Bearer ([A-Za-z0-9_-]{32,128})$/.exec(header);
  const actual=crypto.createHash('sha256').update(match?.[1]||'').digest();
  if(!match||!crypto.timingSafeEqual(actual,Buffer.from(expected,'hex')))return res.status(401).json({ok:false,error:'unauthorized'});
  try{
    const readSnapshot=options.readSnapshot||require('./smart-home-client.cjs').readSmartHomeSnapshot;
    const snapshot=await readSnapshot(false,{env,fetchImpl:options.fetchImpl||globalThis.fetch,observeCamera:false});
    return res.status(200).json({ok:true,...climateOnly(snapshot),fetchedAt:(options.now||Date.now)()});
  }catch(_){return res.status(503).json({ok:false,error:'climate-unavailable'})}
}
module.exports={climateOnly,handleLumaClimate};
