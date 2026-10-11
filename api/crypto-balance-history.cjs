'use strict';
const {createRudiStateClient}=require('./rudi-state-client.cjs');
const NS='rudi-crypto-balance-history-v1';
function client(options={}){return options.client||createRudiStateClient(options)}
function dateKey(now=Date.now()){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now));
  const m=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  return m.year+'-'+m.month+'-'+m.day;
}
function safeId(walletId){
  const id=String(walletId||'').trim();
  if(!/^[\w-]{1,100}$/.test(id))throw new Error('crypto-history-wallet-invalid');
  return id;
}
async function readStored(walletId,options={}){
  const id=safeId(walletId),record=await client(options).getRecord(NS,id);
  return {points:Array.isArray(record?.value?.points)?record.value.points:[],
    intraday:Array.isArray(record?.value?.intraday)?record.value.intraday:[]};
}
function validTimed(point){
  return point&&typeof point.at==='string'&&!Number.isNaN(Date.parse(point.at))&&
    Number.isFinite(point.usd)&&point.usd>=0&&point.usd<=1e12;
}
async function read(walletId,options={}){
  const {points}=await readStored(walletId,options);
  return points.filter(p=>/^\d{4}-\d\d-\d\d$/.test(p.date)&&
    Number.isFinite(p.usd)&&p.usd>=0&&p.usd<=1e12).sort((a,b)=>a.date.localeCompare(b.date));
}
async function capture(walletId,amount,{partial=false,at=Date.now(),...options}={}){
  const id=safeId(walletId),n=Number(amount);
  if(!Number.isFinite(n)||n<0||n>1e12)throw new Error('crypto-history-amount-invalid');
  const now=new Date(at);
  if(Number.isNaN(now.getTime()))throw new Error('crypto-history-time-invalid');
  const date=dateKey(at),stored=await readStored(id,options);
  const points=stored.points.filter(p=>/^\d{4}-\d\d-\d\d$/.test(p.date)&&Number.isFinite(p.usd));
  const next={date,usd:Math.round(n*1e8)/1e8,partial:Boolean(partial)};
  const index=points.findIndex(p=>p.date===date);
  if(index>=0)points[index]=next;else points.push(next);
  points.sort((a,b)=>a.date.localeCompare(b.date));
  // Keep recent real observations, no extra provider requests; a five-minute
  // slot stores only its latest successful sync, to control database writes.
  const timestamp=now.toISOString(),bucket=Math.floor(now.getTime()/300000);
  let intraday=stored.intraday.filter(validTimed).filter(p=>{
    const ms=Date.parse(p.at);
    return ms>=now.getTime()-36*3600000&&ms<=now.getTime();
  }).filter(p=>Math.floor(Date.parse(p.at)/300000)!==bucket);
  intraday.push({at:timestamp,usd:next.usd,partial:next.partial});
  intraday.sort((a,b)=>a.at.localeCompare(b.at));
  intraday=intraday.slice(-420);
  await client(options).setRecord({namespace:NS,key:id,value:{points,intraday},
    tags:['rudi-crypto-history','Рустам'],expires_at:null,updated_at:timestamp});
  return next;
}
async function range(walletId,days,options={}){
  const period=Number(days),hours=Number(options.hours||0);
  if(hours){
    if(![5,12,24].includes(hours))throw new Error('crypto-history-period-invalid');
    const now=options.now??Date.now();
    const since=new Date(now-hours*3600000).toISOString(),until=new Date(now).toISOString();
    const stored=await readStored(walletId,options);
    const timed=stored.intraday.filter(validTimed).sort((a,b)=>a.at.localeCompare(b.at));
    return {walletId:safeId(walletId),hours,since,points:timed.filter(p=>p.at>=since&&p.at<=until),
      availableSince:timed[0]?.at||null,
      note:'Снимки с точным временем сохраняются при реальной синхронизации. Прошлая почасовая история не восстанавливается.'};
  }
  if(![7,30,60,90,365].includes(period))throw new Error('crypto-history-period-invalid');
  const now=options.now||Date.now();
  const startDate=new Date(now);startDate.setUTCDate(startDate.getUTCDate()-(period-1));
  const since=dateKey(startDate.getTime());
  const all=await read(walletId,options);
  return {walletId:safeId(walletId),days:period,since,points:all.filter(p=>p.date>=since),
    availableSince:all[0]?.date||null,note:'Записываются только реальные балансы после подключения. Прошлая история не восстанавливается.'};
}
module.exports={NS,dateKey,capture,read,range};
