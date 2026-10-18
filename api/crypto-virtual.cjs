'use strict';
const {createRudiStateClient}=require('./rudi-state-client.cjs');
const NS='rudi-crypto-virtual-settings-v1', KEY='ne_investor';
const DEFAULT_INITIAL_USD=10000, DEFAULT_ALLOC_PCT=10, DEFAULT_LEVERAGE=2;
const money=n=>Math.round((Number(n)||0)*100)/100;
function normalizeConfig(input={},now=Date.now()){
  const initial=Number(input.initialUsd??DEFAULT_INITIAL_USD);
  const allocation=Number(input.allocationPct??DEFAULT_ALLOC_PCT);
  const leverage=Number(input.leverage??DEFAULT_LEVERAGE);
  if(!Number.isFinite(initial)||initial<100||initial>10000000||
    !Number.isFinite(allocation)||allocation<=0||allocation>100||
    !Number.isFinite(leverage)||![2,3].includes(leverage))throw Error('virtual-settings-invalid');
  const date=Date.parse(input.startedAt||'');
  return {initialUsd:money(initial),allocationPct:allocation,leverage,
    startedAt:Number.isFinite(date)?new Date(date).toISOString():new Date(now).toISOString()};
}
async function settings(options={}){
  const client=options.client||createRudiStateClient(options);
  const existing=await client.getRecord(NS,KEY);
  if(existing?.value?.startedAt){
    const raw=existing.value;
    // A previously saved unsupported setting must not break the portfolio page.
    const safeLeverage=[2,3].includes(Number(raw.leverage))?Number(raw.leverage):DEFAULT_LEVERAGE;
    return normalizeConfig({...raw,leverage:safeLeverage},options.now??Date.now());
  }
  const config=normalizeConfig({},options.now??Date.now());
  await client.setIfAbsent(NS,KEY,config,{tags:['rudi-crypto-virtual']});
  const saved=await client.getRecord(NS,KEY);
  return normalizeConfig(saved?.value||config,options.now??Date.now());
}
async function updateSettings(changes,options={}){
  const client=options.client||createRudiStateClient(options);
  const previous=await settings({...options,client});
  // Changing allocation/leverage affects only simulations; historical events
  // are recalculated, never represented as actual exchange executions.
  // Keep initial cash and start date immutable, avoiding fake retrospective resets.
  const next=normalizeConfig({...previous,allocationPct:changes?.allocationPct??previous.allocationPct,
    leverage:changes?.leverage??previous.leverage},options.now??Date.now());
  await client.setRecord({namespace:NS,key:KEY,value:next,tags:['rudi-crypto-virtual'],
    updated_at:new Date().toISOString(),expires_at:null});
  return next;
}

function simulateVirtual(signals,config,now=Date.now()){
  const start=Date.parse(config.startedAt),round=money;
  const feeRates={spot:0.001,linear:0.00055};
  const slippageRate=0.0005; // Model assumption, NOT a Bybit execution receipt.
  const source=(Array.isArray(signals)?signals:[]);
  const unresolvedClose=s=>['author-closed-awaiting-price','author-closed-size-unknown'].includes(s.status);
  const liquidationRisk=s=>s.market==='linear'&&s.entry>0&&s.markExtremes&&
    (s.direction==='short'?s.markExtremes.high>=s.entry*(1+1/config.leverage):
      s.markExtremes.low<=s.entry*(1-1/config.leverage));
  const rows=source.filter(s=>
    Date.parse(s.at)>=start&&Date.parse(s.at)<=now&&Number.isFinite(Date.parse(s.entryAt))&&
    Date.parse(s.entryAt)>=start&&s.entry>0&&['linear','spot'].includes(s.market)&&
    (s.market!=='spot'||s.direction==='long')&&
    (s.qualified||s.paperEligible)&&(['open','won','lost','breakeven'].includes(s.status)||unresolvedClose(s))&&
    !liquidationRisk(s));
  const excluded=source.filter(s=>['size-unknown','ambiguous',
    'liquidation-risk-unverified'].includes(s.status)||liquidationRisk(s));
  const events=[];
  for(const s of rows){
    const openedMs=Date.parse(s.entryAt),rate=feeRates[s.market];
    events.push({kind:'entry',at:openedMs,row:s});
    if(unresolvedClose(s)){
      const closedAt=Date.parse(s.reportedCloseAt||s.exitAt);
      if(Number.isFinite(closedAt)&&closedAt>=openedMs&&closedAt<=now){
        // Preserve provable cashflows before position size becomes unknown.
        // Later stops/legs cannot tell us what fraction remained after that.
        const unknownAt=(s.events||[]).filter(e=>e.type==='partial-close'&&e.closeFraction==null)
          .map(e=>Date.parse(e.at)).filter(Number.isFinite);
        const safeUntil=unknownAt.length?Math.min(closedAt,...unknownAt):
          s.status==='author-closed-size-unknown'?openedMs:closedAt;
        for(const leg of Array.isArray(s.legs)?s.legs:[]){
          const at=Date.parse(leg.at);
          if(Number(leg.fraction)>0&&Number(leg.price)>0&&at>=openedMs&&at<safeUntil)
            events.push({kind:'exit',at,row:s,leg});
        }
        if(s.market==='linear')for(const point of Array.isArray(s.fundingRates)?s.fundingRates:[]){
          const at=Date.parse(point.at),rate=Number(point.rate);
          if(Number.isFinite(rate)&&at>openedMs&&at<safeUntil)
            events.push({kind:'funding',at,row:s,rate});
        }
        events.push({kind:'author-close',at:closedAt,row:s});
      }
      continue;
    }
    let legs=(Array.isArray(s.legs)?s.legs:[]).filter(l=>
      Number(l.fraction)>0&&Number(l.price)>0&&Number.isFinite(Date.parse(l.at)));
    if(!legs.length&&['won','lost','breakeven'].includes(s.status)&&Number.isFinite(Date.parse(s.exitAt))&&s.exitPrice>0)
      legs=[{fraction:1,price:s.exitPrice,at:s.exitAt,type:'legacy-exit'}];
    for(const leg of legs)events.push({kind:'exit',at:Date.parse(leg.at),row:s,leg});
    if(s.market==='linear'&&Array.isArray(s.fundingRates)){
      for(const point of s.fundingRates){
        const at=Date.parse(point.at),rate=Number(point.rate);
        if(Number.isFinite(at)&&Number.isFinite(rate)&&at>openedMs&&at<=now)
          events.push({kind:'funding',at,row:s,rate});
      }
    }
  }
  events.sort((a,b)=>a.at-b.at||({funding:0,exit:1,entry:2,'author-close':3}[a.kind]-{funding:0,exit:1,entry:2,'author-close':3}[b.kind])||(Number(a.row.id)-Number(b.row.id)));
  let cash=round(config.initialUsd), maxConcurrent=0;
  const positions=new Map(),closed=[],unpricedClosed=[],all=[],curve=[{at:config.startedAt,usd:round(config.initialUsd)}];
  const calcEquity=()=>round(cash+[...positions.values()].reduce((s,p)=>s+p.investedUsd*p.remaining,0));
  for(const event of events){
    const row=event.row,existing=positions.get(row.id);
    if(event.kind==='entry'){
      if(existing)continue;
      const leverage=row.market==='spot'?1:config.leverage;
      const feeRate=feeRates[row.market];
      const target=round(cash*config.allocationPct/100);
      const invested=round(Math.min(target,cash/(1+leverage*(feeRate+slippageRate))));
      if(invested<=0)continue;
      const entryFee=round(invested*leverage*(feeRate+slippageRate));
      cash=round(cash-invested-entryFee);
      const p={id:row.id,symbol:row.symbol,market:row.market,direction:row.direction,
        entry:row.entry,entryAt:row.entryAt,url:row.url,execution:row.execution||'explicit-level',
        investedUsd:invested,remaining:1,leverage,
        authorMarginMode:row.marginModeReported||null,
        virtualMarginMode:row.market==='spot'?'cash':'isolated',
        adjustmentCount:Number(row.adjustmentCount||0),events:row.events||[],
        feeUsd:entryFee,estimatedSlippageAndFeeUsd:entryFee,realizedGrossUsd:0,
        fundingPnlUsd:0,realizedPnlUsd:-entryFee,pnlUsd:-entryFee,status:'open',
        fundingComplete:row.market==='spot'||row.fundingComplete===true,
        warnings:row.unquantifiedAdditions?['Unquantified additions were not executed']:[]};
      positions.set(row.id,p);all.push(p);maxConcurrent=Math.max(maxConcurrent,positions.size);
    }else if(!existing)continue;
    else if(event.kind==='author-close'){
      existing.status=row.status;existing.closedByAuthor=true;
      existing.exitAt=new Date(event.at).toISOString();existing.reportedCloseUrl=row.reportedCloseUrl;
      existing.reservedUsd=round(existing.investedUsd*existing.remaining);
      existing.pnlUsd=null;existing.remaining=0;
      positions.delete(row.id);unpricedClosed.push(existing);
      // Keep its collateral reserved. Without the missing exits we cannot
      // release invented proceeds into subsequent virtual trades.
    }else if(event.kind==='funding'){
      // Actual Bybit historical settlement rates, when fetched and complete.
      const sign=existing.direction==='long'?-1:1;
      const cashflow=round(sign*existing.investedUsd*existing.leverage*existing.remaining*event.rate);
      cash=round(cash+cashflow);existing.fundingPnlUsd=round(existing.fundingPnlUsd+cashflow);
      existing.realizedPnlUsd=round(existing.realizedPnlUsd+cashflow);
      existing.pnlUsd=round(existing.pnlUsd+cashflow);
    }else{
      const fraction=Math.min(existing.remaining,Number(event.leg.fraction));
      if(!(fraction>0))continue;
      const sign=existing.direction==='short'?-1:1,ratio=event.leg.price/row.entry;
      const gross=round(existing.investedUsd*existing.leverage*fraction*sign*(ratio-1));
      const closingFee=round(existing.investedUsd*existing.leverage*fraction*
        (feeRates[row.market]*ratio+slippageRate));
      // Isolated-margin equity cannot lose more than the collateral allocated.
      const net=Math.max(-existing.investedUsd*fraction,round(gross-closingFee));
      const released=round(existing.investedUsd*fraction+net);
      existing.realizedGrossUsd=round(existing.realizedGrossUsd+gross);
      existing.feeUsd=round(existing.feeUsd+closingFee);
      existing.estimatedSlippageAndFeeUsd=round(existing.estimatedSlippageAndFeeUsd+closingFee);
      existing.realizedPnlUsd=round(existing.realizedPnlUsd+net);
      existing.pnlUsd=round(existing.pnlUsd+net);
      existing.remaining=Math.max(0,Math.round((existing.remaining-fraction)*1e10)/1e10);
      existing.exitAt=event.leg.at;
      existing.exitPrice=event.leg.price;
      cash=round(cash+released);
      if(existing.remaining<=1e-8){
        existing.remaining=0;
        existing.status=existing.pnlUsd>0?'won':existing.pnlUsd<0?'lost':'breakeven';
        positions.delete(row.id);closed.push(existing);
      }
    }
    if(!unpricedClosed.length)curve.push({at:new Date(event.at).toISOString(),usd:calcEquity()});
  }
  let floating=0,known=0;
  for(const p of positions.values()){
    const s=rows.find(row=>row.id===p.id),price=Number(s?.marketPrice);
    if(!(price>0)){p.status='unpriced';p.pnlUsd=null;continue;}
    const sign=p.direction==='short'?-1:1;
    const openGross=round(p.investedUsd*p.remaining*p.leverage*sign*(price/p.entry-1));
    const afterCosts=Math.max(-p.investedUsd*p.remaining,openGross);
    p.marketPrice=price;p.unrealizedPnlUsd=round(afterCosts);
    p.pnlUsd=round(p.realizedPnlUsd+afterCosts);
    p.returnPct=round(p.pnlUsd/p.investedUsd*100);
    floating+=afterCosts;known++;
  }
  const active=[...positions.values()],completeMarks=known===active.length&&unpricedClosed.length===0;
  const invested=active.reduce((s,p)=>s+p.investedUsd*p.remaining,0);
  const equity=completeMarks?round(cash+invested+floating):null;
  const totalPnl=equity===null?null:round(equity-config.initialUsd);
  // Carry unresolved collateral at cost, explicitly separate from spendable
  // cash and exact equity. An unknown exit must not hide known ledger values.
  const reservedUsd=round(unpricedClosed.reduce((n,p)=>n+p.reservedUsd,0));
  const accountedEquityUsd=known===active.length?round(cash+invested+floating+reservedUsd):null;
  const knownPnlUsd=round(all.reduce((n,p)=>n+p.realizedPnlUsd,0)+floating);
  const wins=closed.filter(p=>p.pnlUsd>0),losses=closed.filter(p=>p.pnlUsd<0);
  const breakeven=closed.length-wins.length-losses.length,decided=wins.length+losses.length;
  const grossWin=wins.reduce((v,p)=>v+p.pnlUsd,0),grossLoss=losses.reduce((v,p)=>v-Math.abs(p.pnlUsd),0);
  let peak=config.initialUsd,maxDrawdownPct=0;
  for(const point of curve){peak=Math.max(peak,point.usd);
    if(peak>0)maxDrawdownPct=Math.max(maxDrawdownPct,round((peak-point.usd)/peak*100));}
  const stats={total:all.length,closed:closed.length,closedTotal:closed.length+unpricedClosed.length,open:active.length,
    excluded:excluded.length,maxConcurrent,authorClosedUnpriced:unpricedClosed.length,
    wins:wins.length,losses:losses.length,breakeven,
    winratePct:decided?round(wins.length/decided*100):null,
    lossratePct:decided?round(losses.length/decided*100):null,
    avgWinUsd:wins.length?round(grossWin/wins.length):null,
    avgLossUsd:losses.length?round(grossLoss/losses.length):null,
    profitFactor:losses.length?round(grossWin/Math.abs(grossLoss)):null,
    maxDrawdownPct,fundingMissing:all.filter(p=>!p.fundingComplete).length};
  const calendar={};
  for(const p of closed){const date=String(p.exitAt||'').slice(0,10);
    if(!date)continue;const day=calendar[date]||{date,count:0,pnlUsd:0};
    day.count++;day.pnlUsd=round(day.pnlUsd+p.pnlUsd);calendar[date]=day;}
  const reported={tpClaims:0,slClaims:0,withLinkedUpdates:0};
  for(const s of Array.isArray(signals)?signals:[]){
    const e=s.events||[];if(e.length)reported.withLinkedUpdates++;
    if(e.some(x=>x.type==='author-claimed-tp'))reported.tpClaims++;
    if(e.some(x=>x.type==='author-claimed-sl'))reported.slClaims++;
  }
  return {channel:'@ne_investor',config,exchange:'Bybit',
    availableCashUsd:round(cash),reservedUsd,accountedEquityUsd,knownPnlUsd,
    cashUsd:unpricedClosed.length?null:round(cash),investedUsd:round(invested),equityUsd:equity,
    realizedPnlUsd:unpricedClosed.length?null:round(all.reduce((n,p)=>n+p.realizedPnlUsd,0)),
    unrealizedPnlUsd:completeMarks?round(floating):null,
    totalPnlUsd:totalPnl,totalPnlPct:totalPnl===null?null:round(totalPnl/config.initialUsd*100),
    stats,reported,equityCurve:curve.slice(-600),
    calendar:Object.values(calendar).sort((a,b)=>b.date.localeCompare(a.date)),
    positions:all.slice().sort((a,b)=>Date.parse(b.entryAt)-Date.parse(a.entryAt)).slice(0,160),
    note:'Смоделированные исполнения по свечам Bybit, без фактических ордеров. Учтены оценочные taker-комиссии (Spot 0,1%, USDT perpetual 0,055%) и проскальзывание 5 bps. Funding учитывается только при наличии подтверждённой истории; неточности, ликвидации и операции без объёма исключены. Изолированная маржа ограничивает потери залогом.',
    costAssumptions:{spotFeePct:0.1,linearFeePct:0.055,slippageBps:5},
    dataComplete:completeMarks,netIncludesFunding:stats.fundingMissing===0};
}
module.exports={NS,normalizeConfig,settings,updateSettings,simulateVirtual};
