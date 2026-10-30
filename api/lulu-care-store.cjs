'use strict';
const {createStrictRuntimeCache}=require('./strict-runtime-cache.cjs');
const {randomUUID}=require('node:crypto');
const NS='rudi-lulu-care-v1',TTL=60*60*24*3650;
const KINDS=new Set(['weight','goals','nutrition','prevention','prescription','intake']);
let tail=Promise.resolve();
const validId=value=>typeof value==='string'&&/^[a-z0-9_-]{1,96}$/i.test(value);
function dateKey(now){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now)).map(p=>[p.type,p.value]));return p.year+'-'+p.month+'-'+p.day}
const fail=()=>{throw Error('lulu-care-invalid')};
function text(value,max,required=false){if(value!==undefined&&typeof value!=='string')fail();const v=String(value||'').trim();if(v.length>max||required&&!v)fail();return v}
function day(value,optional=false){if(!value&&optional)return '';const v=text(value,10,true);if(!/^\d{4}-\d{2}-\d{2}$/.test(v))fail();const d=new Date(v+'T12:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==v||v<'2020-01-01'||v>'2100-12-31')fail();return v}
function amount(value,min,max,optional=false){if(optional&&(value===''||value===undefined||value===null))return null;const n=Number(String(value).replace(',','.'));if(!Number.isFinite(n)||n<min||n>max)fail();return Math.round(n*100)/100}
function normalize(kind,raw,now){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))fail();
 const today=dateKey(now);
 if(kind==='weight'){const date=day(raw.date);if(date>today)fail();return {date,kg:amount(raw.kg,0.1,100),note:text(raw.note,500)}}
 if(kind==='goals')return {targetKg:amount(raw.targetKg,0.1,100,true)};
 if(kind==='nutrition')return {food:text(raw.food,160),grams:amount(raw.grams,1,5000,true),treats:text(raw.treats,300),date:day(raw.date,true),note:text(raw.note,1000)};
 if(kind==='prevention'){
  if(!['vaccine','parasite'].includes(raw.type))fail();const date=day(raw.date),nextDate=day(raw.nextDate,true);if(date>today||nextDate&&nextDate<date)fail();
  return {type:raw.type,product:text(raw.product,160,true),date,nextDate,note:text(raw.note,1000)};
 }
 if(kind==='prescription'){
  const start=day(raw.start),end=day(raw.end,true);if(end&&end<start)fail();
  return {name:text(raw.name,160,true),dose:text(raw.dose,300),schedule:text(raw.schedule,300),start,end,doctor:text(raw.doctor,160),note:text(raw.note,1000),completed:raw.completed===true};
 }
 if(kind==='intake'){
  if(!validId(raw.prescriptionId))fail();const at=new Date(raw.at);if(!Number.isFinite(at.getTime())||at.getTime()>now+300000||at.getTime()<Date.parse('2020-01-01T00:00:00Z'))fail();
  return {prescriptionId:raw.prescriptionId,at:at.toISOString()};
 }
 fail();
}
const cache=o=>o.careCache||createStrictRuntimeCache({namespace:NS,...(o.cacheOptions||{})});
async function readLuluCare(o={}){
 const rows=await cache(o).list();
 const all=(rows||[]).map(row=>row.value).filter(row=>row&&KINDS.has(row.kind)&&validId(row.id));
 return {records:all.filter(row=>!row.deleted),revisions:Object.fromEntries(all.map(row=>[row.kind+':'+row.id,row.updatedAt]))};
}
async function saveLuluCare(actor,input={},o={}){
 if(!['Диана','Рустам'].includes(actor))throw Error('lulu-actor-invalid');
 if(!input||typeof input!=='object'||Array.isArray(input))fail();
 const {kind,id}=input;if(!KINDS.has(kind)||!validId(id)||['nutrition','goals'].includes(kind)&&id!=='current')fail();
 if(input.deleted!==undefined&&typeof input.deleted!=='boolean')fail();
 if(typeof input.expectedUpdatedAt!=='string')fail();
 const now=new Date(o.now||Date.now()).getTime(),deleted=input.deleted===true,data=deleted?null:normalize(kind,input.data,now);
 const run=tail.then(async()=>{
  const c=cache(o),key=kind+':'+id,lockKey='lock:'+key,owner=randomUUID();
  let locked=false;
  for(let attempt=0;attempt<8;attempt++){
   locked=await c.setIfAbsent(lockKey,{owner},{ttl:120,name:lockKey});
   if(locked)break;
   await new Promise(resolve=>setTimeout(resolve,40*(attempt+1)));
  }
  if(!locked)throw Error('lulu-care-busy');
  try{
  const current=await c.get(key);
  if(current&&current.deleted===deleted&&JSON.stringify(current.data)===JSON.stringify(data))return current;
  if(String(current?.updatedAt||'')!==input.expectedUpdatedAt)throw Error('lulu-care-conflict');
  if(!deleted&&kind==='intake'){
   const rx=await c.get('prescription:'+data.prescriptionId);
   if(!rx||rx.deleted)throw Error('lulu-care-prescription-missing');
   if(dateKey(data.at)<rx.data.start||rx.data.end&&dateKey(data.at)>rx.data.end)throw Error('lulu-care-prescription-inactive');
  }
  const updatedAt=new Date(Math.max(now,Date.parse(current?.updatedAt||'1970-01-01')+1)).toISOString();
  const record={kind,id,data,deleted,actor,updatedAt};await c.set(key,record,{ttl:TTL,tags:['rudi-lulu-care'],name:key});return record;
  }finally{if((await c.get(lockKey))?.owner===owner)await c.delete(lockKey)}
 });tail=run.catch(()=>{});return run;
}
module.exports={readLuluCare,saveLuluCare,normalizeCareRecord:normalize};
