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
async function read(walletId,options={}){
  const id=safeId(walletId),row=await client(options).getRecord(NS,id);
  const points=Array.isArray(row?.value?.points)?row.value.points:[];
  return points.filter(p=>/^\d{4}-\d\d-\d\d$/.test(p.date)&&
    Number.isFinite(p.usd)&&p.usd>=0&&p.usd<=1e12).sort((a,b)=>a.date.localeCompare(b.date));
}
async function capture(walletId,amount,{partial=false,at=Date.now(),...options}={}){
  const id=safeId(walletId),n=Number(amount);
  if(!Number.isFinite(n)||n<0||n>1e12)throw new Error('crypto-history-amount-invalid');
  const date=dateKey(at),points=await read(id,options);
  const next={date,usd:Math.round(n*1e8)/1e8,partial:Boolean(partial)};
  const index=points.findIndex(p=>p.date===date);
  if(index>=0)points[index]=next;else points.push(next);
  points.sort((a,b)=>a.date.localeCompare(b.date));
  await client(options).setRecord({namespace:NS,key:id,value:{points},tags:['rudi-crypto-history','Рустам'],expires_at:null,updated_at:new Date(at).toISOString()});
  return next;
}
async function range(walletId,days,options={}){
  const period=Number(days);
  if(![7,30,60,90,365].includes(period))throw new Error('crypto-history-period-invalid');
  const now=options.now||Date.now();
  const startDate=new Date(now);startDate.setUTCDate(startDate.getUTCDate()-(period-1));
  const since=dateKey(startDate.getTime());
  const all=await read(walletId,options);
  return {walletId:safeId(walletId),days:period,since,points:all.filter(p=>p.date>=since),
    availableSince:all[0]?.date||null,note:'Записываются только реальные балансы после подключения. Прошлая история не восстанавливается.'};
}
module.exports={NS,dateKey,capture,read,range};
