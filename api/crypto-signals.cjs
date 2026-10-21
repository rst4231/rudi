'use strict';
const {createRudiStateClient}=require('./rudi-state-client.cjs');
const {linkUpdates,classifyUpdate}=require('./crypto-trade-events.cjs');
const {tradeOutcome,screenLiquidationRisk}=require('./crypto-signal-outcome.cjs');
const {createMarketRequest}=require('./crypto-market-client.cjs');
const {createResilientAuthorMarketRequest}=require('./crypto-author-reference.cjs');
const NS='rudi-crypto-signal-monitor-v1', KEY='ne_investor', PERIOD_MS=30*86400000, INTERVAL_MS=15*60000;
const cleanText=s=>String(s||'').slice(0,1800);
function entities(text){
  return String(text||'').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>{
    const v=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):parseInt(n,10);
    return v>0&&v<=0x10ffff?String.fromCodePoint(v):'';})
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/gi,(_,n)=>({
      amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ', '#39':"'"})[n]||'');
}
function plain(html){
  return entities(String(html||'').replace(/<br\s*\/?\s*>/gi,'\n')
    .replace(/<\/(?:p|div|blockquote)>/gi,'\n')
    .replace(/<[^>]*>/g,' ').replace(/[ \t]+/g,' ').replace(/\n\s*/g,'\n')).trim();
}
function parsePreview(html){
  const text=String(html||'');
  const openings=[...text.matchAll(/<div\b(?=[^>]*\bdata-post="ne_investor\/(\d+)")[^>]*>/gi)];
  const messages=[];
  for(let i=0;i<openings.length;i++){
    const chunk=text.slice(openings[i].index,openings[i+1]?.index||text.length);
    const id=Number(openings[i][1]);
    const date=chunk.match(/<time\b[^>]*\bdatetime="([^"]+)"/i)?.[1]||'';
    // A Telegram reply can embed the quoted source as another message_text.
    // Only the final message_text block represents the author's new content.
    const texts=[...chunk.matchAll(/<div\b[^>]*class="[^"]*tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)];
    const content=texts.length?texts[texts.length-1][1]:'';
    const links=[...chunk.matchAll(/href="https?:\/\/t\.me\/ne_investor\/(\d+)"/gi)].map(m=>Number(m[1]));
    if(!id||!date||!Number.isFinite(Date.parse(date)))continue;
    messages.push({id,at:new Date(date).toISOString(),text:cleanText(plain(content)),
      references:[...new Set(links.filter(n=>n!==id))].slice(0,10),
      url:'https://t.me/ne_investor/'+id});
  }
  return messages;
}
const num=v=>{
  const s=String(v||'').replace(/\s/g,'').replace(',','.');
  const x=Number(s);
  return Number.isFinite(x)&&x>0&&x<1e8?x:null;
};
function level(text,regex){
  const found=String(text||'').match(regex);
  return found?num(found[1]):null;
}
// Margin type is a reported fact only when the author explicitly names it.
// Adding collateral is possible under both isolated and cross margin.
function parseMarginMode(text){
  const content=String(text||'');
  const cross=/(?:^|[^\p{L}])(?:cross|кросс(?:ов\p{L}*)?|перекр[её]стн\p{L}*)(?=$|[^\p{L}])/iu.test(content);
  const isolated=/(?:^|[^\p{L}])(?:isolated|изолированн\p{L}*|изолят\p{L}*)(?=$|[^\p{L}])/iu.test(content);
  return cross===isolated?null:cross?'cross':'isolated';
}
function parseTradeAdjustment(row){
  const text=String(row?.text||'');
  if(!/(?:докид\p{L}*|докин\p{L}*|добав\p{L}*\s+(?:марж|обеспеч)|добир\p{L}*|усредня\p{L}*|увелич\p{L}*\s+(?:позици|объем|объ[её]м))/iu.test(text))return null;
  const kind=/(?:марж|залог|обеспеч|collateral)/iu.test(text)?'margin-change':
    /(?:позици|объ[её]м)/iu.test(text)?'position-increase':'unspecified-addition';
  return {id:row.id,at:row.at,url:row.url,kind,marginMode:parseMarginMode(text),
    excerpt:text.slice(0,220)};
}
function attachTradeUpdates(signals,messages){
  const byId=new Map(signals.map(signal=>[signal.id,signal]));
  for(const row of [...messages].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at))){
    const update=parseTradeAdjustment(row);
    if(!update)continue;
    const direct=[...new Set((row.references||[]).map(id=>byId.get(id)).filter(Boolean))]
      .filter(s=>Date.parse(s.at)<Date.parse(row.at));
    let candidates=direct;
    if(!candidates.length){
      const windowStart=Date.parse(row.at)-7*86400000;
      candidates=signals.filter(s=>Date.parse(s.at)<Date.parse(row.at)&&
        Date.parse(s.at)>=windowStart&&
        new RegExp('(^|[^A-Za-z0-9])\\$?'+s.symbol+'(?=$|[^A-Za-z0-9])','i').test(row.text||''));
    }
    // No link if several entries plausibly match the same update.
    if(candidates.length!==1)continue;
    const trade=candidates[0];
    if(!Array.isArray(trade.adjustments))trade.adjustments=[];
    if(trade.adjustments.some(item=>item.id===update.id))continue;
    trade.adjustments.push(update);
    if(!trade.marginModeReported&&update.marginMode){
      trade.marginModeReported=update.marginMode;
      trade.marginSource='linked-update';
    }
  }
  for(const signal of signals){
    signal.adjustmentCount=(signal.adjustments||[]).length;
    signal.adjustments=(signal.adjustments||[]).slice(-8);
  }
  return signals;
}

function collectEntrySignals(messages){
  const list=Array.isArray(messages)?messages:[],byId=new Map(list.map(row=>[row.id,row]));
  const clean=text=>String(text||'').replace(/\s+/g,' ').trim().toLowerCase();
  return list.filter(row=>{
    const own=clean(row.text);
    if(own.length<42)return true;
    // Telegram reply cards often include the original signal as copied text.
    // Do not regard an identical quoted excerpt as another independently placed trade.
    return !(row.references||[]).some(id=>{
      const original=byId.get(id);
      if(!original||Number(original.id)>=Number(row.id))return false;
      const quoted=clean(original.text);
      return quoted.length>=42&&own.startsWith(quoted.slice(0,Math.min(70,quoted.length)));
    });
  }).map(parseSignal).filter(Boolean);
}
function marketFromText(text,direction){
  const source=String(text||'');
  const spot=/(?:^|[^\p{L}])(?:спот(?:ов\p{L}*)?|spot)(?=$|[^\p{L}])/iu.test(source);
  const derivative=/(?:^|[^\p{L}])(?:фьючерс\p{L}*|перпетуал\p{L}*|perp(?:etual)?s?|futures?|usdt[- ]?m|isolated|cross|изолированн\p{L}*|кросс\p{L}*)(?=$|[^\p{L}])/iu.test(source);
  if(spot&&derivative)return {market:'unconfirmed',marketSource:'conflicting-markets'};
  if(spot&&direction==='short')return {market:'unconfirmed',marketSource:'spot-short-unverified'};
  if(spot)return {market:'spot',marketSource:'explicit'};
  if(derivative)return {market:'linear',marketSource:'explicit'};
  if(direction==='short')return {market:'linear',marketSource:'short-derivative'};
  if(direction==='long')return {market:'linear',marketSource:'long-derivative-inferred'};
  return {market:'unconfirmed',marketSource:'not-specified'};
}
function parseSignal(row){
  if(!row?.text)return null;
  const text=String(row.text),lower=text.toLowerCase();
  // Telegram close/partial-close updates often quote the original entry.
  // The quoted "$TICKER беру в шорт" must never become a second entry.
  const actionUpdate=classifyUpdate(row);
  if(actionUpdate&&['partial-close','full-close','author-claimed-tp','author-claimed-sl'].includes(actionUpdate.type))return null;
  // Position top-ups are follow-ups, not fresh virtual entries.
  if(parseTradeAdjustment(row)&&
    !/(?:^|[^а-яёa-z])(?:открыл|открываю|заш[её]л|вхожу|беру|взял|взяла)(?=$|[^а-яёa-z])/i.test(text))return null;
  if(/(?:^|[^а-яёa-z])(отзыв|розыгрыш|реферал|учебник|подписка|вакансия)(?=$|[^а-яёa-z])/i.test(text)&&
     !/(?:беру|взял|взяла|заш[её]л|вхожу|открыл|открываю)\s.{0,40}(?:шорт|лонг)/i.test(text))return null;
  const ticker=text.match(/\$([a-z0-9]{2,14})\b/i)?.[1]?.toUpperCase();
  if(!ticker||!/(?:^|[^а-яёa-z])(шорт|short|лонг|long)(?=$|[^а-яёa-z])/i.test(text))return null;
  const direction=/(?:^|[^а-яёa-z])(шорт|short)(?=$|[^а-яёa-z])/i.test(text)?'short':'long';
  // Do not execute speculative opinions: they are not the author's entry.
 if(/(?:^|[^\p{L}])(?:я\s+бы\s+(?:заш[её]л|вош[её]л|взял|открыл|купил)|мог\s+бы\s+(?:войти|открыть|зайти))(?=$|[^\p{L}])/iu.test(lower))return null;
 const actionable=/(?:^|[^а-яёa-z])(?:беру|взял|взяла|заш[её]л|вхожу|открыл|открываю|набираю|набираюсь|докупаю|лонгую|шорчу)(?=$|[^а-яёa-z])|можно\s+(?:брать|открывать)/i.test(lower);
  if(!actionable)return null;
  const conditional=/(?:^|[^а-яёa-z])(?:если|после|планирую|хочу|собираюсь|возможно|предполагаю)(?=$|[^а-яёa-z])|при\s+условии|можно\s+(?:брать|открывать)/i.test(lower);
  // Do not infer entry from a mentioned market level or from "now".
  const entry=level(text,/(?:вход(?:а|е|ить)?|открыл\s+по|заш[её]л\s+по|entry)\s*(?:по|от|в|=|:|\$|≈|~|\s)*([\d][\d\s.,]*)/i);
  const take=level(text,/(?:\btp\d*\b|тейк(?:[- ]?профит)?\w*|цель\w*|take\s*profit)\s*(?:по|на|=|:|в|\$|≈|~|\s)*([\d][\d\s.,]*)/i);
  const stop=level(text,/(?:\bsl\b|стоп(?:[- ]?лосс)?\w*|stop\s*loss)\s*(?:по|на|=|:|в|\$|≈|~|\s)*([\d][\d\s.,]*)/i);
  const leverage=level(text,/(?:плечо|leverage)\s*(?:x|х|:|=|\s)*([\d]+(?:[.,]\d+)?)/i);
  const complete=Boolean(entry&&(take||stop));
  const {market,marketSource}=marketFromText(text,direction);
  return {id:row.id,at:row.at,url:row.url,symbol:ticker,exchange:'bybit',market,marketSource,
    direction,entry,authorEntry:entry,take,stop,leverage,marginModeReported:parseMarginMode(text),marginSource:parseMarginMode(text)?'signal':'unspecified',conditional,qualified:complete&&!conditional&&market!=='unconfirmed',paperEligible:!conditional&&market!=='unconfirmed',
    status:conditional?'conditional':complete?'awaiting-market':'insufficient-levels',
    excerpt:text.slice(0,400),authorClaim:null};
}
function evaluateCandles(signal,candles,now=Date.now()){
  if(!signal?.qualified||!signal.entry)return {status:signal?.status||'insufficient-levels'};
  const side=signal.direction==='long'?1:-1;
  const candlesAsc=(Array.isArray(candles)?candles:[]).slice().sort((a,b)=>a.at-b.at);
  let entered=false,entryAt=null,ended=false,outcome=null,exitPrice=null,exitAt=null;
  for(const c of candlesAsc){
    if(!Number.isFinite(c.at)||c.at<=Date.parse(signal.at)||c.at>now)continue;
    if(!entered){
      if(c.low<=signal.entry&&c.high>=signal.entry){entered=true;entryAt=c.at;}
      else continue;
      // Candles do not tell us whether a take/stop happened before or after fill.
      const touchTake=signal.take!==null&&(side===1?c.high>=signal.take:c.low<=signal.take);
      const touchStop=signal.stop!==null&&(side===1?c.low<=signal.stop:c.high>=signal.stop);
      if(touchTake||touchStop){outcome='ambiguous';ended=true;exitAt=c.at;break;}
      continue;
    }
    const tp=signal.take!==null&&(side===1?c.high>=signal.take:c.low<=signal.take);
    const sl=signal.stop!==null&&(side===1?c.low<=signal.stop:c.high>=signal.stop);
    if(tp&&sl){outcome='ambiguous';ended=true;exitAt=c.at;break;}
    if(tp||sl){outcome=tp?'won':'lost';exitPrice=tp?signal.take:signal.stop;exitAt=c.at;ended=true;break;}
  }
  if(!entered)return {status:'not-entered'};
  const last=candlesAsc[candlesAsc.length-1];
  if(!ended)return {status:'open',entryAt:new Date(entryAt).toISOString(),
    marketPrice:Number.isFinite(last?.close)?last.close:null,lastPriceAt:last?new Date(last.at).toISOString():null};
  if(outcome==='ambiguous')return {status:'ambiguous',entryAt:new Date(entryAt).toISOString(),
    exitAt:exitAt?new Date(exitAt).toISOString():null};
  const percent=Math.round(side*(exitPrice-signal.entry)/signal.entry*10000)/100;
  return {status:outcome,entryAt:new Date(entryAt).toISOString(),
    exitAt:new Date(exitAt).toISOString(),exitPrice,priceChangePct:percent,leveragedPct:signal.leverage?Math.round(percent*signal.leverage*100)/100:null,
    calculation:'gross-unleveraged-excludes-fees-funding-slippage'};
}
async function candlesForSignal(signal,options={}){
  const marketRequest=options.marketRequest||createMarketRequest({fetchImpl:options.fetchImpl});
  if(!['linear','spot'].includes(signal?.market))throw Error('bybit-market-unconfirmed');
  const symbol=signal.symbol+'USDT';
  const start=Math.floor((Date.parse(signal.at)+3600000)/3600000)*3600000;
  const end=Date.now();
  const path='/v5/market/'+(options.mark?'mark-price-kline':'kline')+'?'+new URLSearchParams({
    category:signal.market,symbol,interval:'60',start:String(start),end:String(end),limit:'1000'});
  const payload=await marketRequest(path);
  if(Number(payload.retCode)!==0||!Array.isArray(payload.result?.list))throw Error('market-data-unavailable');
  return payload.result.list.map(r=>({at:Number(r[0]),open:Number(r[1]),high:Number(r[2]),low:Number(r[3]),close:Number(r[4])})).filter(r=>
    Number.isFinite(r.at)&&Number.isFinite(r.open)&&Number.isFinite(r.high)&&Number.isFinite(r.low)&&r.high>=r.low);
}
async function fundingForSignal(signal,options={}){
  if(signal?.market!=='linear')return {rates:[],complete:true};
  const marketRequest=options.marketRequest||createMarketRequest({fetchImpl:options.fetchImpl});
  const start=Date.parse(signal.at),end=Number(options.now||Date.now());
  const path='/v5/market/funding/history?'+new URLSearchParams({
    category:'linear',symbol:signal.symbol+'USDT',startTime:String(start),endTime:String(end),limit:'200'});
  const json=await marketRequest(path),list=json?.result?.list;
  if(Number(json?.retCode)!==0||!Array.isArray(list))throw Error('bybit-funding-unavailable');
  const rates=list.map(x=>({at:new Date(Number(x.fundingRateTimestamp)).toISOString(),
    rate:Number(x.fundingRate)})).filter(x=>Number.isFinite(Date.parse(x.at))&&Number.isFinite(x.rate)
      &&Math.abs(x.rate)<0.1).sort((a,b)=>a.at.localeCompare(b.at));
  return {rates,complete:list.length<200};
}

async function fetchChannelPage(before,options={}){
  const fetcher=options.fetchImpl||fetch;
  const url='https://t.me/s/ne_investor'+(before?'?before='+encodeURIComponent(before):'');
  const response=await fetcher(url,{
    headers:{accept:'text/html','user-agent':'Mozilla/5.0 (compatible; RUDI-trade-monitor/1.0)'},
    cache:'no-store',signal:AbortSignal.timeout(9500)});
  if(!response.ok)throw Error('telegram-http-'+response.status);
  const body=await response.text();
  const items=parsePreview(body);
  if(!items.length)throw Error('telegram-page-empty');
  return items;
}
function modeledTrade(signal,candles,messages=[],now=Date.now()){
  if(!signal?.paperEligible||signal.qualified)return null;
  const available=(Array.isArray(candles)?candles:[]).filter(c=>c.at>Date.parse(signal.at)&&
    c.at<=now&&Number.isFinite(c.open)&&c.open>0).sort((a,b)=>a.at-b.at);
  const first=available[0],last=available[available.length-1];
  if(!first)return {status:'waiting-entry',execution:'next-hour-model'};
  const closure=(Array.isArray(messages)?messages:[]).find(m=>
    m.id>signal.id&&Date.parse(m.at)>Date.parse(signal.at)&&
    Array.isArray(m.references)&&m.references.includes(signal.id)&&
    classifyUpdate(m)?.type==='full-close');
  const exit=closure&&available.find(c=>c.at>Date.parse(closure.at));
  const entry=first.open,price=exit?exit.open:last.close;
  const side=signal.direction==='short'?-1:1;
  const pct=Math.round(side*(price-entry)/entry*10000)/100;
  if(exit)return {status:pct>0?'won':pct<0?'lost':'breakeven',execution:'next-hour-model',
    entry,entryAt:new Date(first.at).toISOString(),exitAt:new Date(exit.at).toISOString(),
    exitPrice:price,priceChangePct:pct,authorExitUrl:closure.url};
  return {status:'open',execution:'next-hour-model',entry,
    entryAt:new Date(first.at).toISOString(),marketPrice:price,
    lastPriceAt:new Date(last.at).toISOString()};
}
// Capture the current quote ONCE when an unpriced direct entry is first synced.
async function marketPriceForSignal(signal,marketRequest){
  if(!['linear','spot'].includes(signal?.market))throw Error('market-unconfirmed');
  const symbol=signal.symbol+'USDT';
  const path='/v5/market/tickers?'+new URLSearchParams({category:signal.market,symbol});
  const payload=await marketRequest(path);
  const ticker=payload?.result?.list?.find(x=>x?.symbol===symbol);
  const price=Number(ticker?.lastPrice);
  if(Number(payload?.retCode)!==0||!(price>0&&Number.isFinite(price)))throw Error('market-live-price-unavailable');
  return price;
}
let refreshFlight=null;
async function refreshSignals(options={}){
  if(refreshFlight)return refreshFlight;
  refreshFlight=(async()=>{
    const now=options.now??Date.now(),client=options.client||createRudiStateClient(options);
    const row=await client.getRecord(NS,KEY).catch(()=>null);
    const previous=row?.value&&typeof row.value==='object'?row.value:{};
    if(!options.force&&previous.updatedAt&&now-Date.parse(previous.updatedAt)<INTERVAL_MS)
      return buildView(previous,now);
    const cutoff=now-PERIOD_MS;
    const marketRequest=createResilientAuthorMarketRequest({fetchImpl:options.fetchImpl,primary:options.marketRequest,fallback:options.referenceRequest});
    let posts=new Map((Array.isArray(previous.messages)?previous.messages:[])
      .filter(m=>Date.parse(m.at)>=cutoff).map(m=>[m.id,m]));
    let cursor=Number(previous.cursor||0)||null,complete=Boolean(previous.backfillComplete);
    let sourceError=null,priceError=null;
    try{
      const latest=await fetchChannelPage(null,options);
      latest.forEach(m=>{if(Date.parse(m.at)>=cutoff)posts.set(m.id,m)});
      if(!cursor&&!complete)cursor=Math.min(...latest.map(m=>m.id));
      if(cursor&&!complete){
        // A failed old-page fetch must not discard successfully collected new posts.
        for(let i=0;i<Math.min(4,Math.max(1,Number(options.maxBackfillPages||4)));i++){
          let batch;
          try{batch=await fetchChannelPage(cursor,options);}
          catch(e){sourceError='older-page-unavailable';break;}
          const old=Math.min(...batch.map(m=>m.id));
          if(old>=cursor){complete=true;break;}
          batch.forEach(m=>{if(Date.parse(m.at)>=cutoff)posts.set(m.id,m)});
          cursor=old;
          if(batch.some(m=>Date.parse(m.at)<cutoff)){complete=true;break;}
        }
      }
      const signals=linkUpdates(collectEntrySignals([...posts.values()]),
        [...posts.values()]).sort((a,b)=>b.at.localeCompare(a.at));
      const oldResults=previous.results&&typeof previous.results==='object'?previous.results:{};
      const results={};
      // Prioritize never-checked and least-recently-checked positions so a busy
      // channel cannot starve older open trades indefinitely.
      const queue=signals.slice().sort((a,b)=>{
        const ta=Date.parse(oldResults[a.id]?.checkedAt||'1970-01-01T00:00:00Z');
        const tb=Date.parse(oldResults[b.id]?.checkedAt||'1970-01-01T00:00:00Z');
        return ta-tb||Date.parse(b.at)-Date.parse(a.at);
      });
      let attempts=0;
      for(const s of queue){
        if(!s.qualified&&!s.paperEligible)continue;
        const prev=oldResults[s.id];
        // Existing results for a different market must never be re-used,
        // even when its outcome was already marked as closed.
        if(prev?.market&&prev.market!==s.market)delete oldResults[s.id];
        const acceptedPrev=prev?.market&&prev.market===s.market?prev:null;
        if(acceptedPrev&&['won','lost','breakeven','ambiguous'].includes(acceptedPrev.status)){
          results[s.id]=acceptedPrev;continue;
        }
        if(attempts>=Math.min(5,Math.max(1,Number(options.maxChecks||5)))){if(acceptedPrev)results[s.id]=acceptedPrev;continue;}
        attempts++;
        try{
          const signalAge=now-Date.parse(s.at);
          const authorExit=(s.events||[]).some(e=>Date.parse(e.at)<=now&&
            ['partial-close','full-close'].includes(e.type));
          if(!s.entry&&!acceptedPrev?.entry&&signalAge>=0&&!authorExit){
            const livePrice=await marketPriceForSignal(s,marketRequest);
            const openedAt=new Date(now).toISOString();
            results[s.id]={status:'open',entry:livePrice,entryAt:openedAt,marketPrice:livePrice,
              lastPriceAt:openedAt,execution:'market-at-sync',market:s.market,checkedAt:openedAt,
              marketDataSource:marketRequest.lastSource||'bybit'};
            continue;
          }
          const candles=await candlesForSignal(s,{...options,marketRequest});
          const dataSource=marketRequest.lastSource||'bybit';
          let outcome=tradeOutcome(s,candles,{now,openedPosition:acceptedPrev?.execution==='market-at-sync'?acceptedPrev:null});
          if(s.market==='linear'&&['open','won','lost','breakeven'].includes(outcome.status)){
            const [mark,funding]=await Promise.allSettled([
              candlesForSignal(s,{...options,marketRequest,mark:true}),
              fundingForSignal(s,{...options,marketRequest,now})
            ]);
            if(mark.status==='fulfilled'){
              const relevant=mark.value.filter(c=>c.at>Date.parse(outcome.entryAt)&&
                (!outcome.exitAt||c.at<=Date.parse(outcome.exitAt)));
              outcome={...outcome,markExtremes:relevant.length?{
                high:Math.max(...relevant.map(c=>c.high)),
                low:Math.min(...relevant.map(c=>c.low))}:null};
              outcome=screenLiquidationRisk(outcome,s,mark.value,Number(options.virtualLeverage||2));
            }else outcome={...outcome,liquidationScreen:'unavailable',markExtremes:null};
            if(funding.status==='fulfilled'){
              outcome.fundingRates=funding.value.rates;
              outcome.fundingComplete=funding.value.complete;
            }else outcome.fundingComplete=false;
          }else if(s.market==='spot')outcome.fundingComplete=true;
          results[s.id]={...outcome,market:s.market,checkedAt:new Date(now).toISOString(),marketDataSource:dataSource};
        }
        catch(e){priceError=String(e?.message||e);results[s.id]={...(acceptedPrev||{status:'market-unavailable'}),market:s.market,checkedAt:new Date(now).toISOString()};}
      }
      const state={messages:[...posts.values()].sort((a,b)=>b.id-a.id).slice(0,1000),
        results,backfillComplete:complete,cursor,updatedAt:new Date(now).toISOString(),
        sourceError,priceError};
      await client.setRecord({namespace:NS,key:KEY,value:state,tags:['rudi-crypto-signals'],
        updated_at:state.updatedAt,expires_at:null});
      return buildView(state,now);
    }catch(e){
      sourceError=String(e?.message||e).slice(0,180);
      // Persist failures so the existing report does not quietly pretend that
      // the monitor is active, but preserve the last successful timestamp.
      const failed={...previous,sourceError,lastAttemptAt:new Date(now).toISOString()};
      console.warn('RUDI_AUTHOR_SIGNAL_SOURCE_WARN',sourceError);
      try{await client.setRecord({namespace:NS,key:KEY,value:failed,
        tags:['rudi-crypto-signals'],updated_at:failed.lastAttemptAt,expires_at:null});}
      catch(error){console.warn('RUDI_AUTHOR_SIGNAL_PERSIST_WARN',String(error?.message||error));}
      return buildView(failed,now);
    }
  })();
  try{return await refreshFlight}finally{refreshFlight=null;}
}
function buildView(state,now=Date.now(),options={}){
  const cutoff=now-PERIOD_MS;
  const messages=(Array.isArray(state.messages)?state.messages:[]).filter(m=>Date.parse(m.at)>=cutoff);
  const signals=collectEntrySignals(messages).map(signal=>{
    const row=state.results?.[signal.id];
    return {...signal,...(row||{}),url:signal.url,id:signal.id,at:signal.at};
  });
  const published=messages.filter(m=>Date.parse(m.at)<=now);
  attachTradeUpdates(signals,published);
  linkUpdates(signals,published,{activeSignalIds:options.activeSignalIds||[]});
  for(const signal of signals){
    const reported=(signal.events||[]).findLast(event=>event.type==='full-close');
    if(reported){
      // The author explicitly closed the position, while an executable exit
      // quote may still be unavailable. Never invent a PnL or execution price.
      const unknownPartial=signal.events.some(e=>e.type==='partial-close'&&e.closeFraction===null);
      if(unknownPartial)signal.status='author-closed-size-unknown';
      else if(!['won','lost','breakeven','author-closed-size-unknown'].includes(signal.status))
        signal.status='author-closed-awaiting-price';
      signal.closedByAuthor=true;
      signal.openFraction=0;
      signal.reportedCloseAt=reported.at;
      signal.reportedCloseUrl=reported.url;
    }
  }
  signals.sort((a,b)=>b.at.localeCompare(a.at));
  // OKX reference prices are NEVER counted as Bybit-verified results.
   const verified=signals.filter(s=>(s.status==='won'||s.status==='lost')&&s.execution!=='next-hour-model'&&s.marketDataSource!=='okx-reference');
  const won=verified.filter(s=>s.status==='won');
  const knownChange=verified.filter(s=>Number.isFinite(s.priceChangePct));
  const avgChange=knownChange.length?Math.round(knownChange.reduce((s,r)=>s+r.priceChangePct,0)*100/knownChange.length)/100:null;
  const ids=messages.map(m=>Number(m.id)).filter(Number.isFinite).sort((a,b)=>a-b);
  const gapsEstimate=ids.reduce((n,id,i)=>i&&id>ids[i-1]+1?n+id-ids[i-1]-1:n,0);
  return {channel:'@ne_investor',days:30,updatedAt:state.updatedAt||null,
    messagesCount:messages.length,oldestMessageAt:messages.length?messages[messages.length-1]?.at:null,
    gapsEstimate,scanComplete:Boolean(state.backfillComplete),
    backfillComplete:Boolean(state.backfillComplete),sourceError:state.sourceError||null,
    priceError:state.priceError||null,
    referencePricesCount:signals.filter(s=>s.marketDataSource==='okx-reference').length,
    stats:{total:signals.length,verified:verified.length,won:won.length,lost:verified.length-won.length,
      open:signals.filter(s=>s.status==='open').length,
      unverified:signals.length-verified.length,
      winrate:verified.length?Math.round(won.length/verified.length*10000)/100:null,
      avgChangePct:avgChange},
    signals:signals.slice(0,160)};
}
async function readSignals(options={}){
  const client=options.client||createRudiStateClient(options);
  const row=await client.getRecord(NS,KEY);
  const state=row?.value&&typeof row.value==='object'?row.value:{};
  return buildView(state,options.now??Date.now());
}
// Trading feed: one Telegram page per active minute, NO candles/40-coin scan.
// Read-only merge with archived source results avoids extra D1 writes and replays.
async function readLiveSignals(options={}){
 const now=options.now??Date.now(),client=options.client||createRudiStateClient(options);
 const row=await client.getRecord(NS,KEY);
 const prior=row?.value&&typeof row.value==='object'?row.value:{};
 try{
  const latest=await fetchChannelPage(null,options);
  const cutoff=now-PERIOD_MS;
  const byId=new Map([...((Array.isArray(prior.messages)?prior.messages:[])
    .filter(m=>Date.parse(m.at)>=cutoff)),...latest]
    .filter(m=>m&&Number.isInteger(Number(m.id))&&Date.parse(m.at)>=cutoff)
    .map(m=>[String(m.id),m]));
  const messages=[...byId.values()].sort((a,b)=>Number(b.id)-Number(a.id)).slice(0,1000);
  return buildView({...prior,messages,sourceError:null,updatedAt:new Date(now).toISOString()},now,options);
 }catch(e){
  return {...buildView(prior,now,options),sourceError:'live-author-feed-unavailable'};
 }
}
module.exports={NS,parsePreview,parseSignal,collectEntrySignals,evaluateCandles,compareSignal:parseSignal,
  buildView,readSignals,readLiveSignals,refreshSignals,candlesForSignal,marketPriceForSignal,modeledTrade,parseMarginMode,parseTradeAdjustment,attachTradeUpdates,marketFromText,tradeOutcome,screenLiquidationRisk,fundingForSignal};
