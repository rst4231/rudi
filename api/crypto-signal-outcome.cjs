'use strict';
const {classifyUpdate}=require('./crypto-trade-events.cjs');
const priceReturn=(side,entry,exit)=>Math.round((side==='short'?-1:1)*(exit-entry)/entry*10000)/100;
function tradeOutcome(signal,candles,options={}){
  const now=Number(options.now||Date.now());
  const bars=(Array.isArray(candles)?candles:[]).filter(c=>Number.isFinite(c.at)&&
    c.at<=now&&Number.isFinite(c.high)&&Number.isFinite(c.low)&&c.high>=c.low&&
    Number.isFinite(c.open)&&c.open>0&&Number.isFinite(c.close)&&c.close>0)
    .sort((a,b)=>a.at-b.at);
  const updates=(Array.isArray(signal.events)?signal.events:[])
    .filter(e=>Number.isFinite(Date.parse(e.at))&&['partial-close','full-close','stop-to-breakeven',
      'collateral-addition','position-addition','unspecified-addition'].includes(e.type))
    .sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
  if(!signal.paperEligible&&!signal.qualified)return {status:signal.status||'unverified'};
  const saved=options.openedPosition;
  const liveEntry=Number(saved?.entry),liveEntryAt=Date.parse(saved?.entryAt||'');
  const hasLiveEntry=saved?.execution==='market-at-sync'&&liveEntry>0&&Number.isFinite(liveEntryAt);
  let entry=hasLiveEntry?liveEntry:null,entryAt=hasLiveEntry?liveEntryAt:null,stop=signal.stop??null,remaining=1,exitAt=null,exitPrice=null,
    closedPct=0,unknownSize=false,riskUnknown=false,complete=false;
  const legs=[],timeline=[],seen=new Set();
  if(hasLiveEntry)timeline.push({type:'entry',at:new Date(entryAt).toISOString(),price:entry,source:'market-at-sync'});
  for(const bar of bars){
    if(bar.at<=Math.max(Date.parse(signal.at),hasLiveEntry?liveEntryAt:0))continue;
    if(!entry){
      if(signal.entry!==null&&signal.entry!==undefined){
        if(bar.low>signal.entry||bar.high<signal.entry)continue;
        entry=signal.entry;
      }else entry=bar.open;
      entryAt=bar.at;timeline.push({type:'entry',at:new Date(bar.at).toISOString(),price:entry});
      // If entry bar crosses TP / SL, intrabar ordering is unknowable.
      const tp=signal.take!=null&&(signal.direction==='short'?bar.low<=signal.take:bar.high>=signal.take);
      const sl=stop!=null&&(signal.direction==='short'?bar.high>=stop:bar.low<=stop);
      if(tp||sl)return {status:'ambiguous',entry,entryAt:new Date(entryAt).toISOString(),
        reason:'entry-bar-order',execution:signal.entry?'explicit-level':'next-hour-model'};
      continue;
    }
    // Changes published during an hourly candle take effect at the NEXT hourly bar;
    // same-hour high/low cannot be ordered relative to a Telegram publication.
    for(const e of updates){
      if(seen.has(e.id)||Date.parse(e.at)>=bar.at||Date.parse(e.at)<entryAt)continue;
      seen.add(e.id);
      if(e.type==='stop-to-breakeven'){
        stop=entry;timeline.push({...e,type:'stop-to-breakeven',effectiveAt:new Date(bar.at).toISOString(),stop});
      }else if(e.type==='partial-close'){
        if(!(e.closeFraction>0&&e.closeFraction<1)||e.closeFraction>remaining){
          unknownSize=true;timeline.push({...e,applied:false,reason:'unknown-partial-size'});continue;
        }
        const fraction=e.closeFraction;remaining=Math.round((remaining-fraction)*1e10)/1e10;
        const profitPct=priceReturn(signal.direction,entry,bar.open);
        closedPct+=fraction*profitPct;
        legs.push({fraction,price:bar.open,at:new Date(bar.at).toISOString(),profitPct,type:e.type,url:e.url});
        timeline.push({...e,applied:true,effectiveAt:new Date(bar.at).toISOString(),price:bar.open});
      }else if(e.type==='full-close'){
        const profitPct=priceReturn(signal.direction,entry,bar.open);
        closedPct+=remaining*profitPct;
        legs.push({fraction:remaining,price:bar.open,at:new Date(bar.at).toISOString(),profitPct,type:e.type,url:e.url});
        remaining=0;complete=true;exitAt=bar.at;exitPrice=bar.open;
        timeline.push({...e,applied:true,effectiveAt:new Date(bar.at).toISOString(),price:bar.open});
        break;
      }else{riskUnknown=true;timeline.push({...e,applied:false,reason:'amount-and-execution-unknown'});}
    }
    if(complete)break;
    const tp=signal.take!=null&&(signal.direction==='short'?bar.low<=signal.take:bar.high>=signal.take);
    const sl=stop!=null&&(signal.direction==='short'?bar.high>=stop:bar.low<=stop);
    if(tp&&sl)return {status:'ambiguous',entry,entryAt:new Date(entryAt).toISOString(),
      reason:'same-bar-tp-sl',legs,timeline,closedFraction:1-remaining};
    if(tp||sl){
      const price=tp?signal.take:stop;
      const profitPct=priceReturn(signal.direction,entry,price);
      closedPct+=remaining*profitPct;
      legs.push({fraction:remaining,price,at:new Date(bar.at).toISOString(),
        profitPct,type:tp?'take-profit':stop===entry?'breakeven-stop':'stop-loss'});
      remaining=0;complete=true;exitAt=bar.at;exitPrice=price;break;
    }
  }
  if(!entry)return {status:'not-entered'};
  const last=bars[bars.length-1];
  const netClosed=complete?Math.round(closedPct*100)/100:null;
  if(unknownSize)return {status:complete?'author-closed-size-unknown':'size-unknown',
    entry,entryAt:new Date(entryAt).toISOString(),
    ...(complete?{exitAt:new Date(exitAt).toISOString(),exitPrice,closedByAuthor:true,openFraction:0}:{}),
    legs,timeline,reason:'missing-closed-percentage',
    priceChangePct:null};
  const common={entry,entryAt:new Date(entryAt).toISOString(),execution:hasLiveEntry?
    'market-at-sync':signal.entry?'explicit-level':'next-hour-model',legs,timeline,closedFraction:Math.round((1-remaining)*10000)/10000,
    openFraction:remaining,realizedPricePct:Math.round(closedPct*100)/100,
    unquantifiedAdditions:riskUnknown,marketPrice:Number.isFinite(last?.close)?last.close:null};
  if(complete)return {...common,status:netClosed>0?'won':netClosed<0?'lost':'breakeven',
    exitAt:new Date(exitAt).toISOString(),exitPrice,priceChangePct:netClosed};
  return {...common,status:'open'};
}
// Mark-price candle checks are an RISK SCREEN ONLY, never exact liquidation reports.
// Exact liquidation depends on margin, risk tier, funding, position adds, fees.
function screenLiquidationRisk(result,signal,markBars,virtualLeverage=2){
  if(!result||!['open','won','lost','breakeven'].includes(result.status)||signal.market!=='linear')
    return result;
  if(!Array.isArray(markBars)||!markBars.length)return {...result,liquidationScreen:'unavailable'};
  const entry=Number(result.entry),leverage=Number(virtualLeverage);
  if(!(entry>0)||!(leverage>=1))return {...result,liquidationScreen:'unavailable'};
  const threshold=signal.direction==='short'?entry*(1+1/leverage):entry*(1-1/leverage);
  const touched=markBars.some(c=>c.at>Date.parse(result.entryAt)&&
    (!result.exitAt||c.at<=Date.parse(result.exitAt))&&
    (signal.direction==='short'?c.high>=threshold:c.low<=threshold));
  return touched?{...result,status:'liquidation-risk-unverified',
    liquidationScreen:'risk-crossed-conservative-bankruptcy-boundary',
    liquidationThresholdApprox:threshold,priceChangePct:null,
    warning:'Mark price crossed an extreme insolvency boundary; settlement unverified'}:
    {...result,liquidationScreen:'screened-bankruptcy-only',liquidationThresholdApprox:threshold};
}
module.exports={tradeOutcome,screenLiquidationRisk,priceReturn};
