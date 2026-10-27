 'use strict';
import crypto from 'node:crypto';
const NS='rudi-car-pair-rate-v1',TTL=15*60;
function createCarPairingGate({client,now=Date.now}){
 const read=async key=>(await client.getRecord(NS,key))?.value??null;
 async function budget(key,limit){
  const bucket=Math.floor(Number(now())/(TTL*1000));
  const keys=Array.from({length:limit},(_,slot)=>'attempt:'+key+':'+bucket+':'+slot);
  const occupied=client.getRecords?(await client.getRecords(NS,keys)).map(row=>row?.value??null):await Promise.all(keys.map(read));
  for(let slot=0;slot<limit;slot++)if(!occupied[slot]&&await client.setIfAbsent(NS,keys[slot],{used:true},{ttl:TTL*2}))return;
  throw Error('car-device-rate-limited');
 }
 async function pairAttempt(deviceId){
  if(typeof deviceId!=='string'||!/^[A-Za-z0-9_-]{20,128}$/.test(deviceId))throw Error('car-device-code-invalid');
  await budget('device:'+crypto.createHash('sha256').update(deviceId).digest('hex'),5);
  await budget('global',30);
 }
 return {pairAttempt};
}
export {createCarPairingGate};
