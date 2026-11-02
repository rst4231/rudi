'use strict';
const {readLuluCare}=require('./lulu-care-store.cjs');
function localParts(at){return Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date(at)).map(x=>[x.type,x.value]))}
function pendingLuluIntakes(records,date,period){
 const rows=Array.isArray(records)?records:[];
 return rows.filter(r=>r.kind==='prescription'&&!r.deleted&&!r.data?.completed&&r.data?.start<=date&&(!r.data.end||r.data.end>=date)).filter(r=>{
  const schedule=String(r.data.schedule||'').toLowerCase();
  const words=period==='morning'?/утр/:/вечер/;
  const hours=[...schedule.matchAll(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/g)].map(m=>Number(m[1]));
  if(!words.test(schedule)&&!hours.some(h=>period==='morning'?h<12:h>=17))return false;
  return !rows.some(i=>{if(i.kind!=='intake'||i.deleted||i.data?.prescriptionId!==r.id||!Number.isFinite(Date.parse(i.data?.at||'')))return false;const p=localParts(i.data.at);return `${p.year}-${p.month}-${p.day}`===date&&(period==='morning'?Number(p.hour)<12:Number(p.hour)>=17)});
 }).map(r=>({name:r.data.name,dose:r.data.dose||'',schedule:r.data.schedule||''}));
}
async function loadLuluIntakes(date,period,options={}){const care=await (options.readLuluCareImpl||readLuluCare)(options);return pendingLuluIntakes(care?.records,date,period)}
module.exports={pendingLuluIntakes,loadLuluIntakes};
