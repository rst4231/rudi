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
  const start=Date.parse(config.startedAt),rows=(Array.isArray(signals)?signals:[])
    .filter(s=>Date.parse(s.at)>=start&&Date.parse(s.at)<=now)
    .filter(s=>(s.qualified||s.paperEligible)&&['linear','spot'].includes(s.market)&&s.entry&&s.entryAt&&Number.isFinite(Date.parse(s.entryAt)))
    .filter(s=>s.market!=='spot'||s.direction==='long')
    .filter(s=>['won','lost','breakeven','open'].includes(s.status))
    .map(s=>({...s,openedMs:Date.parse(s.entryAt),
      closedMs:s.exitAt&&Number.isFinite(Date.parse(s.exitAt))?Date.parse(s.exitAt):null}))
    .sort((a,b)=>a.openedMs-b.openedMs||a.id-b.id);
  let cash=config.initialUsd;
  const active=new Map(),closed=[],all=[];
  const events=[];
  for(const row of rows){
    events.push({time:row.openedMs,kind:'entry',row});
    if(['won','lost','breakeven'].includes(row.status)&&row.closedMs!==null&&row.closedMs>=row.openedMs)
      events.push({time:row.closedMs,kind:'exit',row});
  }
  events.sort((a,b)=>a.time-b.time||(a.kind==='exit'?-1:1));
  for(const event of events){
    const row=event.row;
    if(event.kind==='entry'){
      const amount=money(cash*config.allocationPct/100);
      if(amount<=0)continue;
      cash=money(cash-amount);
      const leverage=row.market==='spot'?1:config.leverage;
      const position={id:row.id,symbol:row.symbol,direction:row.direction,market:row.market,url:row.url,
        entry:row.entry,entryAt:row.entryAt,
        investedUsd:amount,leverage,execution:row.execution||'explicit-level',
        authorMarginMode:row.marginModeReported||null,virtualMarginMode:row.market==='spot'?'cash':'isolated',
        adjustmentCount:Number(row.adjustmentCount||0),
        status:'open',pnlUsd:0};
      active.set(row.id,position);all.push(position);
    }else{
      const position=active.get(row.id);
      if(!position)continue;
      const rate=Number(row.priceChangePct);
      if(!Number.isFinite(rate))continue;
      const pnl=Math.max(-position.investedUsd,money(position.investedUsd*position.leverage*rate/100));
      position.pnlUsd=pnl;
      position.returnPct=money(rate*position.leverage);
      position.status=row.status;
      position.exitAt=row.exitAt;
      cash=money(cash+position.investedUsd+pnl);
      active.delete(row.id);closed.push(position);
    }
  }
  let floating=0,marked=0;
  for(const p of active.values()){
    const row=rows.find(s=>s.id===p.id);
    const current=Number(row?.marketPrice);
    if(!Number.isFinite(current)||current<=0){
      p.status='unpriced';p.pnlUsd=null;continue;
    }
    const factor=p.direction==='short'?-1:1;
    p.pnlUsd=Math.max(-p.investedUsd,money(p.investedUsd*p.leverage*factor*(current-p.entry)/p.entry));
    p.returnPct=money(p.pnlUsd/p.investedUsd*100);
    p.marketPrice=current;floating+=p.pnlUsd;marked++;
  }
  const open=[...active.values()];
  const invested=open.reduce((sum,p)=>sum+p.investedUsd,0);
  const realized=closed.reduce((sum,p)=>sum+p.pnlUsd,0);
  const completeMarks=marked===open.length;
  const equity=completeMarks?money(cash+invested+floating):null;
  const wins=closed.filter(p=>p.pnlUsd>0).length,losses=closed.filter(p=>p.pnlUsd<0).length;
  const breakeven=closed.length-wins-losses,decided=wins+losses;
  return {channel:'@ne_investor',config,
    cashUsd:money(cash),investedUsd:money(invested),
    equityUsd:equity,realizedPnlUsd:money(realized),unrealizedPnlUsd:completeMarks?money(floating):null,
    totalPnlUsd:equity===null?null:money(equity-config.initialUsd),
    totalPnlPct:equity===null?null:money((equity/config.initialUsd-1)*100),
    stats:{total:all.length,closed:closed.length,open:open.length,
      wins,losses,breakeven,
      winratePct:decided?money(wins/decided*100):null,
      lossratePct:decided?money(losses/decided*100):null},
    positions:all.slice().sort((a,b)=>Date.parse(b.entryAt)-Date.parse(a.entryAt)).slice(0,150),
    note:'Спот Bybit моделируется без плеча. Фьючерсы Bybit — с изолированным залогом и плечом симуляции. Неподтверждённые рынки не исполняются. Реальный размер позиции автора, пополнения, ликвидации, комиссии, funding и проскальзывание не подтверждены; результат оценочный.',
    dataComplete:completeMarks};
}
module.exports={NS,normalizeConfig,settings,updateSettings,simulateVirtual};
