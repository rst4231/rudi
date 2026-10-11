'use strict';
const {createRudiStateClient}=require('./rudi-state-client.cjs');
const {NS}=require('./crypto-balance-history.cjs');

const HOUR=3600000;
const rounded=n=>Math.round(n*100)/100;

// This is a portfolio valuation change, not verified trading PNL. External
// deposits, withdrawals, yield transfers and fees cannot be inferred from
// equity snapshots, so the API labels every non-empty result as an estimate.
function compare24h(points,now=Date.now()){
  const valid=(Array.isArray(points)?points:[]).filter(p=>
    p&&!p.partial&&typeof p.at==='string'&&Number.isFinite(Date.parse(p.at))&&
    Number.isFinite(p.usd)&&p.usd>=0&&Date.parse(p.at)<=now
  ).sort((a,b)=>a.at.localeCompare(b.at));
  const target=now-24*HOUR;
  const base=valid.reduce((best,p)=>!best||Math.abs(Date.parse(p.at)-target)<
    Math.abs(Date.parse(best.at)-target)?p:best,null);
  const last=valid[valid.length-1];
  if(!base||!last)return {available:false,reason:'no-history'};
  if(Math.abs(Date.parse(base.at)-target)>20*60000)return {available:false,reason:'baseline-missing'};
  if(now-Date.parse(last.at)>20*60000)return {available:false,reason:'last-sync-stale'};
  if(last.at===base.at||last.usd===null||base.usd<=0)return {available:false,reason:'insufficient-history'};
  const delta=rounded(last.usd-base.usd),pct=rounded(delta/base.usd*100);
  return {available:true,deltaUsd:delta,percent:pct,from:base.at,to:last.at,
    kind:'unadjusted-valuation-change',verifiedPnl:false,
    note:'Оценка изменения стоимости за 24 ч. Пополнения, выводы и внутренние переводы не вычтены.'};
}
async function calculatePnl24h(connections,options={}){
  const client=options.client||createRudiStateClient(options);
  const now=Number(options.now??Date.now());
  const links=Array.isArray(connections)?connections:[];
  const ids=['__portfolio__',...links.map(c=>String(c.walletId||'')).filter(Boolean)];
  const values=await Promise.all(ids.map(async id=>{
    try {
      const row=await client.getRecord(NS,id);
      const points=row?.value?.intraday;
      return {id,...compare24h(points,now)};
    }catch(_){return {id,available:false,reason:'history-unavailable'};}
  }));
  const items=values.slice(1).map((v,i)=>{
    const link=links[i];
    return link&&(link.incomplete||link.lastError)?
      {id:v.id,available:false,reason:'incomplete-balance'}:v;
  }).filter(Boolean);
  const anyIncomplete=links.some(c=>c.incomplete||c.lastError||!Number.isFinite(c.balanceUsd));
  return {periodHours:24,updatedAt:new Date(now).toISOString(),
    total:anyIncomplete?{id:'__portfolio__',available:false,reason:'incomplete-balance'}:values[0],
    items,method:'unadjusted-valuation-change'};
}
module.exports={compare24h,calculatePnl24h};
