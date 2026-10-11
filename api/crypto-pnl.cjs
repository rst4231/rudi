'use strict';
const {createRudiStateClient}=require('./rudi-state-client.cjs');
const {NS,dateKey}=require('./crypto-balance-history.cjs');

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
// Valuation since the first saved full balance on day 1 of the Moscow
// calendar month. Daily snapshots contain no clock time and cannot reconstruct
// a midnight mark or adjust for transfers: always report an estimate only.
function compareMonth(points,intraday,now=Date.now()){
  const firstDay=dateKey(now).slice(0,7)+'-01';
  const baseline=(Array.isArray(points)?points:[]).find(p=>
    p?.date===firstDay&&p.partial!==true&&Number.isFinite(p.usd)&&p.usd>0);
  if(!baseline)return {available:false,reason:'month-baseline-missing'};
  const last=(Array.isArray(intraday)?intraday:[]).filter(p=>
    p&&!p.partial&&typeof p.at==='string'&&Number.isFinite(Date.parse(p.at))&&
    Number.isFinite(p.usd)&&p.usd>=0&&Date.parse(p.at)<=now)
    .sort((a,b)=>a.at.localeCompare(b.at)).at(-1);
  if(!last||now-Date.parse(last.at)>20*60000)
    return {available:false,reason:'last-sync-stale'};
  // A single day-1 aggregate is not enough to establish two observations.
  if(dateKey(now)===firstDay)return {available:false,reason:'first-day-insufficient-history'};
  const delta=rounded(last.usd-baseline.usd),pct=rounded(delta/baseline.usd*100);
  return {available:true,deltaUsd:delta,percent:pct,from:firstDay,to:last.at,
    kind:'unadjusted-valuation-change',verifiedPnl:false,
    note:'Изменение стоимости с первого сохранённого дневного снимка месяца. Момент снимка не равен полуночи. Пополнения, выводы и переводы не вычтены.'};
}
async function calculatePnl24h(connections,options={}){
  const client=options.client||createRudiStateClient(options);
  const now=Number(options.now??Date.now());
  const links=Array.isArray(connections)?connections:[];
  const ids=['__portfolio__',...links.map(c=>String(c.walletId||'')).filter(Boolean)];
  const values=await Promise.all(ids.map(async id=>{
    try {
      const row=await client.getRecord(NS,id);
      const intraday=row?.value?.intraday;
      return {day:{id,...compare24h(intraday,now)},
        month:{id,...compareMonth(row?.value?.points,intraday,now)}};
    }catch(_){
      const empty={id,available:false,reason:'history-unavailable'};
      return {day:empty,month:empty};
    }
  }));
  const anyIncomplete=links.some(c=>c.incomplete||c.lastError||!Number.isFinite(c.balanceUsd));
  const checked=(item,link)=>link&&(link.incomplete||link.lastError||!Number.isFinite(link.balanceUsd))
    ?{id:item.id,available:false,reason:'incomplete-balance'}:item;
  const blocked={id:'__portfolio__',available:false,reason:'incomplete-balance'};
  return {periodHours:24,updatedAt:new Date(now).toISOString(),
    total:anyIncomplete?blocked:values[0].day,
    items:values.slice(1).map((v,i)=>checked(v.day,links[i])),
    month:{
      period:'month-to-date',
      total:anyIncomplete?blocked:values[0].month,
      items:values.slice(1).map((v,i)=>checked(v.month,links[i])),
    },
    method:'unadjusted-valuation-change',
    note:'Оценка изменения баланса, не проверенный торговый PNL. Пополнения, выводы и переводы не вычтены.'};
}
module.exports={compare24h,compareMonth,calculatePnl24h};
