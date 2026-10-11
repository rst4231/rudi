'use strict';
/* Independent, forward-only PAPER trading. Never sends private Bybit requests or orders. */
const {createRudiStateClient}=require('./rudi-state-client.cjs');
const NS='rudi-crypto-algorithms-v1',KEY='virtual-short-portfolios';
const INITIAL=10000,INTERVAL=300000,FEE=0.00055,SLIPPAGE=0.0005,LEV=2;
const STRATEGIES=[
  {id:'pump',name:'Затухание пампа',description:'Рост за час, всплеск объёма и ослабление покупателей.'},
  {id:'rejection',name:'Ложный пробой',description:'Пробой часового максимума с возвратом под сопротивление.'},
  {id:'rsi',name:'RSI разворот',description:'Перекупленность и подтверждённый краткосрочный разворот.'}
];
const round=x=>Math.round(Number(x)*100)/100;
const quote=x=>Number(Number(x).toPrecision(10));
const date=t=>new Date(t).toISOString();
const num=x=>Number(x)||0;
function initial(now=Date.now()){
  const portfolios={};
  for(const a of STRATEGIES)portfolios[a.id]={
    id:a.id,startedAt:date(now),cash:INITIAL,positions:[],trades:[],equityCurve:[{at:date(now),usd:INITIAL}],
    seen:{},lastEquity:INITIAL,peakEquity:INITIAL,maxDrawdownPct:0};
  return {version:1,createdAt:date(now),updatedAt:null,lastScanAt:null,error:null,marketCount:0,portfolios};
}
function adapt(input,now=Date.now()){
  const base=initial(now),state=input&&typeof input==='object'?input:base;
  for(const a of STRATEGIES){
    const p=state.portfolios?.[a.id];
    if(!p||!Number.isFinite(Number(p.cash)))state.portfolios={...(state.portfolios||{}),[a.id]:base.portfolios[a.id]};
  }
  return state;
}
function rsi(bars,period=14){
  if(bars.length<period+2)return null;
  let gains=0,losses=0;
  for(let i=bars.length-period;i<bars.length;i++){
    const d=bars[i].close-bars[i-1].close;
    gains+=Math.max(0,d);losses+=Math.max(0,-d);
  }
  if(gains+losses===0)return 50;
  return round(100*gains/(gains+losses));
}
function signalsFor(symbol,bars,marketPrice){
  if(bars.length<38)return [];
  const n=bars.length,now=bars[n-1],before=bars[n-2],range=Math.max(now.high-now.low,1e-12);
  const previous=bars.slice(-21,-1),avgVol=previous.reduce((s,b)=>s+b.volume,0)/previous.length;
  const volume=avgVol>0?now.volume/avgVol:0;
  const gain60=(now.close/bars[n-13].close-1)*100;
  const gain15=(now.close/bars[n-4].close-1)*100;
  const wick=(now.high-Math.max(now.open,now.close))/range;
  const resistance=Math.max(...bars.slice(-13,-1).map(b=>b.high));
  const oscillator=rsi(bars);
  if(!Number.isFinite(marketPrice)||marketPrice<=0||now.close<=0)return [];
  const common={symbol,at:now.at,close:now.close,price:marketPrice,
    indicators:{change60:round(gain60),change15:round(gain15),relativeVolume:round(volume),wickPct:round(wick*100),rsi:oscillator}};
  const out=[];
  if(gain60>=5&&volume>=1.5&&wick>=.28&&now.close<now.open)
    out.push({...common,strategy:'pump',score:Math.min(99,Math.round(60+gain60*.7+volume*2+wick*20))});
  if(gain60>=1.5&&volume>=1.3&&now.high>resistance*1.008&&
      now.close<=resistance*1.002&&wick>=.3&&(oscillator||0)>=55)
    out.push({...common,strategy:'rejection',score:Math.min(99,Math.round(62+volume*2+wick*25))});
  if((oscillator||0)>=72&&gain60>=3.5&&gain15<=0&&now.close<now.open&&wick>=.1)
    out.push({...common,strategy:'rsi',score:Math.min(99,Math.round(60+(oscillator-70)*1.2+wick*18))});
  return out;
}
function parseBars(data,now=Date.now()){
  const values=data?.result?.list;
  if(!Array.isArray(values))return [];
  return values.map(row=>({at:num(row[0]),open:num(row[1]),high:num(row[2]),
    low:num(row[3]),close:num(row[4]),volume:num(row[5])}))
    .filter(x=>x.at>0&&x.at+INTERVAL<=now-1000&&x.open>0&&x.high>=x.low&&x.close>0)
    .sort((a,b)=>a.at-b.at);
}
async function bybit(path,fetchImpl=globalThis.fetch){
  const ctrl=typeof AbortController==='function'?new AbortController():null;
  const timer=ctrl?setTimeout(()=>ctrl.abort(),9500):null;
  try{
    const r=await fetchImpl('https://api.bybit.com'+path,{...(ctrl?{signal:ctrl.signal}:{}),
      headers:{Accept:'application/json'}});
    if(!r.ok)throw Error('bybit-http-'+r.status);
    const json=await r.json();
    if(json.retCode!==0)throw Error('bybit-'+json.retCode);
    return json;
  }finally{if(timer)clearTimeout(timer);}
}
function marketUniverse(response){
  const eligible=(response?.result?.list||[])
    .filter(v=>/^([A-Z0-9]+)USDT$/.test(String(v.symbol||''))&&
      num(v.turnover24h)>=8000000&&num(v.lastPrice)>0&&!String(v.symbol).includes('1000'))
    .sort((a,b)=>num(b.turnover24h)-num(a.turnover24h));
  // Liquid majors + high-turnover positive movers, not only BTC/ETH.
  const liquid=eligible.slice(0,22);
  const movers=eligible.filter(v=>num(v.price24hPcnt)>0.04)
    .sort((a,b)=>num(b.price24hPcnt)-num(a.price24hPcnt)).slice(0,18);
  return [...new Map([...liquid,...movers].map(v=>[v.symbol,v])).values()]
    .slice(0,40).map(v=>({symbol:v.symbol,price:num(v.lastPrice)}));
}
function mark(portfolio,prices){
  let equity=portfolio.cash;
  for(const p of portfolio.positions){
    const price=num(prices[p.symbol])||p.lastPrice||p.entry;
    p.lastPrice=price;
    const estimatedExit=price*(1+SLIPPAGE),gross=p.notional*(p.entry-estimatedExit)/p.entry;
    p.unrealizedPnl=round(gross-p.notional*(estimatedExit/p.entry)*FEE);
    equity+=p.margin+p.unrealizedPnl;
  }
  return round(equity);
}
function settle(portfolio,p,price,at,reason){
  const exit=price*(1+SLIPPAGE);
  const gross=p.notional*(p.entry-exit)/p.entry;
  const exitFee=p.notional*(exit/p.entry)*FEE;
  const pnl=round(gross-p.entryFee-exitFee);
  portfolio.cash=round(portfolio.cash+p.margin+gross-exitFee);
  const trade={...p,exitPrice:quote(exit),exitAt:date(at),exitReason:reason,
    pnlUsd:pnl,pnlPct:round(pnl/p.margin*100),feeUsd:round(p.entryFee+exitFee),status:'closed'};
  delete trade.unrealizedPnl;
  portfolio.positions=portfolio.positions.filter(x=>x.id!==p.id);
  portfolio.trades.unshift(trade);
  portfolio.trades=portfolio.trades.slice(0,300);
}
function updatePositions(portfolio,barsBySymbol,prices,now){
  for(const p of [...portfolio.positions]){
    const bars=barsBySymbol[p.symbol]||[];
    const relevant=bars.filter(b=>b.at+INTERVAL> Date.parse(p.entryAt)&&b.at>num(p.lastBarAt||0));
    let closed=false;
    for(const candle of relevant){
      p.lastBarAt=candle.at;
      const hitStop=candle.high>=p.stop,hitTake=candle.low<=p.take;
      if(hitStop||hitTake){
        // Conservative intrabar order when TP and SL coexist: stop wins.
        settle(portfolio,p,hitStop?p.stop:p.take,candle.at+INTERVAL,hitStop?'SL':'TP');
        closed=true;break;
      }
    }
    if(closed)continue;
    const ticker=num(prices[p.symbol]);
    if(ticker>=p.stop){settle(portfolio,p,ticker,now,'SL · котировка');continue;}
    if(ticker<=p.take&&ticker>0){settle(portfolio,p,ticker,now,'TP · котировка');continue;}
    if(now-Date.parse(p.entryAt)>=8*3600000&&ticker>0)
      settle(portfolio,p,ticker,now,'Выход по времени');
  }
}
function openPosition(portfolio,signal,now,prices){
  if(portfolio.positions.length>=2||portfolio.positions.some(p=>p.symbol===signal.symbol))return false;
  const lastForSymbol=portfolio.seen[signal.symbol]||0;
  if(now-lastForSymbol<12*3600000)return false;
  const equity=mark(portfolio,prices),price=signal.price;
  if(price<=0||equity<100)return false;
  const notional=round(Math.min(equity*.2,equity*.01/.035));
  const margin=round(notional/LEV),fill=price*(1-SLIPPAGE);
  const fee=round(notional*FEE);
  if(portfolio.cash<margin+fee||notional<10)return false;
  const id=signal.strategy+':'+signal.symbol+':'+signal.at;
  portfolio.cash=round(portfolio.cash-margin-fee);
  portfolio.positions.push({id,symbol:signal.symbol,strategy:signal.strategy,score:signal.score,
    indicators:signal.indicators,entry:quote(fill),entryAt:date(now),signalAt:date(signal.at),
    margin,notional,leverage:LEV,entryFee:fee,lastPrice:price,
    stop:quote(fill*1.035),take:quote(fill*.94),lastBarAt:0,status:'open'});
  portfolio.seen[signal.symbol]=now;
  return true;
}
function advance(portfolio,barsBySymbol,prices,ideas,now){
  updatePositions(portfolio,barsBySymbol,prices,now);
  for(const idea of ideas){
    if(idea.strategy===portfolio.id)openPosition(portfolio,idea,now,prices);
  }
  const equity=mark(portfolio,prices);
  portfolio.lastEquity=equity;
  portfolio.peakEquity=Math.max(num(portfolio.peakEquity)||INITIAL,equity);
  portfolio.maxDrawdownPct=Math.max(num(portfolio.maxDrawdownPct),
    round((portfolio.peakEquity-equity)/portfolio.peakEquity*100));
  if(portfolio.equityCurve.at(-1)?.at!==date(now))
    portfolio.equityCurve.push({at:date(now),usd:equity});
  portfolio.equityCurve=portfolio.equityCurve.slice(-400);
  const minAllowed=now-48*3600000;
  portfolio.seen=Object.fromEntries(Object.entries(portfolio.seen)
    .filter(([,at])=>num(at)>minAllowed));
}
function summarize(p){
  const trades=p.trades||[],wins=trades.filter(x=>x.pnlUsd>0),losses=trades.filter(x=>x.pnlUsd<0);
  const winUsd=wins.reduce((s,x)=>s+x.pnlUsd,0),lossUsd=losses.reduce((s,x)=>s-x.pnlUsd,0);
  return {id:p.id,startedAt:p.startedAt,cashUsd:round(p.cash),
    equityUsd:round(p.lastEquity||INITIAL),pnlUsd:round((p.lastEquity||INITIAL)-INITIAL),
    pnlPct:round(((p.lastEquity||INITIAL)/INITIAL-1)*100),
    open:p.positions.length,closed:trades.length,winratePct:trades.length?
      round(wins.length/trades.length*100):null,
    profitFactor:lossUsd?round(winUsd/lossUsd):null,
    maxDrawdownPct:round(p.maxDrawdownPct),
    positions:p.positions.slice(0,10).map(x=>({...x})),
    trades:trades.slice(0,100).map(x=>({...x})),
    equityCurve:p.equityCurve.slice(-120)};
}
function report(state){
  const s=adapt(state);
  return {algorithms:STRATEGIES,initialUsd:INITIAL,exchange:'Bybit USDT Perpetual',
    updatedAt:s.updatedAt,lastScanAt:s.lastScanAt,createdAt:s.createdAt,
    marketCount:s.marketCount||0,error:s.error||null,
    assumptions:{leverage:LEV,feeRate:FEE,slippageRate:SLIPPAGE,
      riskPct:1,maxPositions:2,stopPct:3.5,takePct:6,maxHoldHours:8,
      note:'Только paper trading: вход по котировке после закрытого 5м бара; SL при двусмысленной свече исполняется первым. Нет реальных ордеров. Funding и реальные ликвидации не учтены.'},
    portfolios:Object.fromEntries(STRATEGIES.map(x=>[x.id,summarize(s.portfolios[x.id])] ))};
}
async function readReport(options={}){
  const client=options.client||createRudiStateClient(options);
  const row=await client.getRecord(NS,KEY);
  return report(row?.value||initial(options.now??Date.now()));
}
let flight=null;
async function scan(options={}){
  if(flight)return flight;
  flight=(async()=>{
    const client=options.client||createRudiStateClient(options),now=options.now??Date.now();
    const existing=await client.getRecord(NS,KEY);
    const state=adapt(existing?.value||initial(now),now);
    if(state.lastScanAt&&now-Date.parse(state.lastScanAt)<240000)return report(state);
    let markets=[],failed=0;
    try{
      const tickerResponse=await bybit('/v5/market/tickers?category=linear',options.fetchImpl);
      markets=marketUniverse(tickerResponse);
      if(!markets.length)throw Error('bybit-empty-universe');
      // Open symbols must remain monitored even after leaving the top movers.
      const rawTickers=new Map((tickerResponse?.result?.list||[]).map(t=>[t.symbol,t]));
      for(const p of Object.values(state.portfolios)){
        for(const position of p.positions){
          if(markets.some(m=>m.symbol===position.symbol))continue;
          const ticker=rawTickers.get(position.symbol);
          if(ticker&&num(ticker.lastPrice)>0)
            markets.push({symbol:position.symbol,price:num(ticker.lastPrice)});
        }
      }
      const prices=Object.fromEntries(markets.map(m=>[m.symbol,m.price]));
      for(const p of Object.values(state.portfolios))for(const position of p.positions)
        if(!prices[position.symbol])prices[position.symbol]=position.lastPrice;
      const barsBySymbol={},ideas=[];
      // Stagger Bybit requests in bounded groups; continue despite an individual symbol outage.
      for(let offset=0;offset<markets.length;offset+=6){
        const batch=await Promise.allSettled(markets.slice(offset,offset+6).map(async m=>{
          const data=await bybit('/v5/market/kline?category=linear&symbol='+
            encodeURIComponent(m.symbol)+'&interval=5&limit=120',options.fetchImpl);
          return {m,bars:parseBars(data,now)};
        }));
        for(const item of batch){
          if(item.status!=='fulfilled'){failed++;continue;}
          const {m,bars}=item.value;barsBySymbol[m.symbol]=bars;
          const found=signalsFor(m.symbol,bars,m.price);
          ideas.push(...found);
        }
      }
      // Never fill/close on unknown OHLC. Existing open trades are updated only
      // when their symbol has fresh exchange evidence, not a fabricated price.
      const hasPrice=Object.fromEntries(Object.keys(barsBySymbol)
        .map(s=>[s,prices[s]]));
      for(const p of Object.values(state.portfolios)){
        const validPositions=p.positions.filter(x=>Boolean(barsBySymbol[x.symbol]));
        const stalePositions=p.positions.filter(x=>!barsBySymbol[x.symbol]);
        p.positions=validPositions;
        advance(p,barsBySymbol,hasPrice,ideas.filter(x=>x.strategy===p.id).sort((a,b)=>b.score-a.score),now);
        p.positions.push(...stalePositions);
        p.lastEquity=mark(p,prices);
      }
      state.error=failed?'Недоступны свечи по '+failed+' из '+markets.length+' монет':null;
      state.marketCount=markets.length;state.updatedAt=date(now);state.lastScanAt=date(now);
    }catch(e){state.error=String(e?.message||e).slice(0,180);state.lastScanAt=date(now);}
    await client.setRecord({namespace:NS,key:KEY,value:state,tags:['rudi-crypto-algorithms'],updated_at:date(now),expires_at:null});
    return report(state);
  })();
  try{return await flight;}finally{flight=null;}
}
module.exports={NS,INITIAL,STRATEGIES,initial,adapt,rsi,signalsFor,parseBars,
  marketUniverse,openPosition,updatePositions,advance,report,readReport,scan};