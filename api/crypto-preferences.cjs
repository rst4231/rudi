'use strict';
const NS='rudi-crypto-sync-preferences-v1',KEY='rustam';
const client=o=>o.client||require('./rudi-state-client.cjs').createRudiStateClient(o);
function status(value={},now=Date.now()){
 const weekday=new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Moscow',weekday:'short'}).format(new Date(now));
 const weekend=weekday==='Sat'||weekday==='Sun',enabled=value.enabled!==false;
 return {enabled,weekdaysOnly:true,timeZone:'Europe/Moscow',automaticAllowed:enabled&&!weekend,reason:!enabled?'paused':weekend?'weekend':'weekday'};
}
async function read(o={}){const row=await client(o).getRecord(NS,KEY);return status(row?.value,o.now??Date.now())}
async function update(actor,input,o={}){
 if(actor!=='Рустам')throw Error('crypto-owner-only');
 if(typeof input.enabled!=='boolean')throw Error('crypto-input-invalid');
 const value={enabled:input.enabled};
 await client(o).setRecord({namespace:NS,key:KEY,value,tags:['rudi-crypto-sync'],expires_at:null,updated_at:new Date().toISOString()});
 return status(value,o.now??Date.now());
}
module.exports={NS,KEY,status,read,update};
