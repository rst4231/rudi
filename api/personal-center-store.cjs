'use strict';
const crypto=require('node:crypto');
const {createRudiStateClient}=require('./rudi-state-client.cjs');
const NS='rudi-personal-ai-v1', ACTORS=['Рустам','Диана'];
const DEFAULTS={'Рустам':{height:181,birthDate:''},'Диана':{height:null,birthDate:''}};
const gates=new Map();
function actorOf(a){if(!ACTORS.includes(a))throw Error('rudi-access-denied');return a;}
function client(o={}){return o.client||createRudiStateClient(o);}
function clean(v,n=500){return String(v??'').trim().slice(0,n);}
function moscowDate(now=Date.now()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));}
function base(a){return {profile:{...DEFAULTS[actorOf(a)]},checkins:{},symptoms:[],weights:[],version:0};}
function validDate(v){return /^\d{4}-\d{2}-\d{2}$/.test(String(v||''))?String(v):'';}
function validIso(v){const n=Date.parse(String(v||''));return Number.isFinite(n)?new Date(n).toISOString():'';}
function score(v){const n=Number(v);return Number.isInteger(n)&&n>=1&&n<=10?n:null;}
function diopters(value){if(value==null||String(value).trim()==='')return null;const v=Number(value);return Number.isFinite(v)&&v>=-20&&v<=20?Math.round(v*4)/4:null;}
function conditions(values){return (Array.isArray(values)?values:String(values||'').split(/[\n,;]+/)).map(v=>clean(v,120)).filter(Boolean).slice(0,25);}

function normalize(raw,a){const p=raw&&typeof raw==='object'?raw:{},def=base(a),h=Number(p.profile?.height);return {
 profile:{height:h>=100&&h<=230?Math.round(h):def.profile.height,birthDate:validDate(p.profile?.birthDate)||def.profile.birthDate,vision:{left:diopters(p.profile?.vision?.left),right:diopters(p.profile?.vision?.right)},chronicConditions:conditions(p.profile?.chronicConditions)},
 checkins:Object.fromEntries(Object.entries(p.checkins||{}).filter(([d,v])=>validDate(d)&&v&&typeof v==='object').map(([d,v])=>[d,{mood:score(v.mood),energy:score(v.energy),stress:score(v.stress),comment:clean(v.comment,500),updatedAt:validIso(v.updatedAt)}])),
 symptoms:(Array.isArray(p.symptoms)?p.symptoms:[]).filter(x=>x&&x.id&&x.description).map(x=>({id:clean(x.id,65),description:clean(x.description,600),intensity:score(x.intensity)||1,startedAt:validIso(x.startedAt),duration:clean(x.duration,120),comment:clean(x.comment,500),state:['active','better','same','worse','resolved'].includes(x.state)?x.state:'active',updatedAt:validIso(x.updatedAt)})).filter(x=>x.startedAt),
 weights:(Array.isArray(p.weights)?p.weights:[]).filter(x=>x&&x.id&&Number(x.kg)>=25&&Number(x.kg)<=400).map(x=>({id:clean(x.id,65),kg:Math.round(Number(x.kg)*10)/10,at:validIso(x.at)})).filter(x=>x.at).sort((a,b)=>a.at.localeCompare(b.at)),
 version:Math.max(0,Number(p.version)||0)};
}
function key(a){return 'data:'+actorOf(a);}
async function read(a,o={}){return normalize((await client(o).getRecord(NS,key(a)))?.value,a);}
async function write(a,v,o={}){const result=normalize({...v,version:Number(v.version||0)+1},a);await client(o).set(NS,key(a),result,{tags:['personal-ai',a]});return result;}
function serial(a,fn){const before=gates.get(a)||Promise.resolve();const next=before.then(fn,fn);gates.set(a,next.catch(()=>{}));return next;}
function change(s,op,p={},now=Date.now()){const t=new Date(now).toISOString(),today=moscowDate(now);
 if(op==='checkin'){const stress=score(p.stress);if(stress===null)throw Error('invalid-rating');const prior=s.checkins[today]||{};return {...s,checkins:{...s.checkins,[today]:{...prior,stress,comment:clean(p.comment,500),updatedAt:t}}};}
 if(op==='weight'){const kg=Math.round(Number(p.kg)*10)/10;if(!Number.isFinite(kg)||kg<25||kg>400)throw Error('invalid-weight');return {...s,weights:[...s.weights,{id:crypto.randomUUID(),kg,at:t}]};}
 if(op==='profile'){const h=Number(p.height);if(!Number.isInteger(h)||h<100||h>230)throw Error('invalid-height');const birthDate=p.birthDate?validDate(p.birthDate):s.profile.birthDate;if(p.birthDate&&!birthDate)throw Error('invalid-birthdate');if(p.vision!=null&&typeof p.vision!=='object')throw Error('invalid-vision');const eye=(key)=>{const value=p.vision?.[key];if(value!=null&&String(value).trim()!==''&&diopters(value)===null)throw Error('invalid-vision');return diopters(value);};return {...s,profile:{height:h,birthDate,vision:p.vision?{left:eye('left'),right:eye('right')}:s.profile.vision,chronicConditions:p.chronicConditions===undefined?s.profile.chronicConditions:conditions(p.chronicConditions)}};}
 if(op==='symptom'){const description=clean(p.description,600),intensity=score(p.intensity);if(description.length<2||intensity===null)throw Error('invalid-symptom');const startedAt=p.startedAt?validIso(p.startedAt):t;if(!startedAt)throw Error('invalid-start-date');return {...s,symptoms:[...s.symptoms,{id:crypto.randomUUID(),description,intensity,startedAt,duration:clean(p.duration,120),comment:clean(p.comment,500),state:'active',updatedAt:t}]};}
 if(op==='symptom-status'){if(!['active','better','same','worse','resolved'].includes(p.state))throw Error('invalid-status');if(!s.symptoms.some(x=>x.id===p.id))throw Error('missing-symptom');return {...s,symptoms:s.symptoms.map(x=>x.id===p.id?{...x,state:p.state,updatedAt:t}:x)};}
 if(op==='delete-entry'){if(p.type==='checkin'&&validDate(p.id)){const x={...s.checkins};delete x[p.id];return {...s,checkins:x};}if(p.type==='weight')return {...s,weights:s.weights.filter(x=>x.id!==p.id)};if(p.type==='symptom')return {...s,symptoms:s.symptoms.filter(x=>x.id!==p.id)};throw Error('invalid-entry');}
 if(op==='clear-category'){if(p.type==='checkins')return {...s,checkins:{}};if(p.type==='weights')return {...s,weights:[]};if(p.type==='symptoms')return {...s,symptoms:[]};throw Error('invalid-category');}
 throw Error('invalid-operation');
}
async function mutate(a,op,p,o={}){return serial(a,async()=>write(a,change(await read(a,o),op,p,o.now||Date.now()),o));}
function reportKey(a,d,slot){if(!validDate(d)||!['morning','evening'].includes(slot))throw Error('invalid-slot');return 'report:'+actorOf(a)+':'+d+':'+slot;}
function latestKey(a){return 'latest:'+actorOf(a);}
function seenKey(a){return 'seen:'+actorOf(a);}
async function latest(a,o={}){return (await client(o).getRecord(NS,latestKey(a)))?.value||null;}
async function unread(a,o={}){const c=client(o),[r,seen]=await Promise.all([c.getRecord(NS,latestKey(a)),c.getRecord(NS,seenKey(a))]);const value=r?.value;return {unread:Boolean(value?.id&&seen?.value?.id!==value.id),id:value?.id||'',date:value?.date||'',slot:value?.slot||''};}
async function seen(a,o={}){const c=client(o),r=await latest(a,o);if(!r?.id)return null;await c.set(NS,seenKey(a),{id:r.id,at:new Date().toISOString()},{tags:['personal-ai',a]});return r.id;}
async function saveReport(a,date,slot,result,o={}){const c=client(o),id=reportKey(a,date,slot),r={...result,id,date,slot,createdAt:new Date(o.now||Date.now()).toISOString()};const inserted=await c.setIfAbsent(NS,id,r,{tags:['personal-ai',a]});if(!inserted)return {created:false,report:(await c.getRecord(NS,id))?.value||null};await c.set(NS,latestKey(a),r,{tags:['personal-ai',a]});return {created:true,report:r};}
async function history(a,o={}){const rows=await client(o).list(NS),prefix='report:'+actorOf(a)+':';return rows.filter(x=>String(x.key||'').startsWith(prefix)).map(x=>x.value).filter(Boolean).sort((a,b)=>String(b.date).localeCompare(String(a.date))||(b.slot==='evening'?1:-1));}
async function erase(a,type,o={}){return serial(a,async()=>{if(type!=='reports'&&type!=='all')throw Error('invalid-delete');const c=client(o),prefix='report:'+actorOf(a)+':';for(const r of await c.list(NS))if(String(r.key||'').startsWith(prefix))await c.remove(NS,r.key);await Promise.all([c.remove(NS,latestKey(a)),c.remove(NS,seenKey(a))]);if(type==='all')await c.remove(NS,key(a));});}
module.exports={NS,DEFAULTS,ACTORS,moscowDate,normalize,change,read,mutate,latest,unread,seen,saveReport,history,erase,reportKey};