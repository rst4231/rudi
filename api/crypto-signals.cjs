'use strict';
const {createRudiStateClient}=require('./rudi-state-client.cjs');
const NS='rudi-crypto-signal-monitor-v1', KEY='ne_investor', PERIOD_MS=30*86400000, INTERVAL_MS=300000;
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
    const content=chunk.match(/<div\b[^>]*class="[^"]*tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1]||'';
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
function parseSignal(row){
  if(!row?.text)return null;
  const text=String(row.text),lower=text.toLowerCase();
  if(/\b(отзыв|розыгрыш|реферал|учебник|подписка|вакансия)\b/i.test(text)&&
     !/(?:беру|зашел|вхожу|открыл|открываю)\s.{0,40}(?:шорт|лонг)/i.test(text))return null;
  const ticker=text.match(/\$([a-z0-9]{2,14})\b/i)?.[1]?.toUpperCase();
  if(!ticker||!/\b(шорт|short|лонг|long)\b/i.test(text))return null;
  const direction=/\b(шорт|short)\b/i.test(text)?'short':'long';
  const actionable=/(?:\b(?:беру|заш[её]л|вхожу|открыл|открываю|набираю|набираюсь|докупаю|лонгую|шорчу)\b|можно\s+(?:брать|открывать))/i.test(lower);
  if(!actionable)return null;
  const conditional=/\b(?:если|после|при\s+условии|можно\s+брать|планирую)\b/i.test(lower);
  // Do not infer entry from a mentioned market level or from "now".
  const entry=level(text,/(?:вход(?:а|е|ить)?|открыл\s+по|заш[её]л\s+по|entry)\s*(?:по|от|в|=|:|\$|≈|~|\s)*([\d][\d\s.,]*)/i);
  const take=level(text,/(?:\btp\d*\b|тейк(?:[- ]?профит)?\w*|цель\w*|take\s*profit)\s*(?:по|на|=|:|в|\$|≈|~|\s)*([\d][\d\s.,]*)/i);
  const stop=level(text,/(?:\bsl\b|стоп(?:[- ]?лосс)?\w*|stop\s*loss)\s*(?:по|на|=|:|в|\$|≈|~|\s)*([\d][\d\s.,]*)/i);
  const leverage=level(text,/(?:плечо|leverage)\s*(?:x|х|:|=|\s)*([\d]+(?:[.,]\d+)?)/i);
  const complete=Boolean(entry&&(take||stop));
  return {id:row.id,at:row.at,url:row.url,symbol:ticker,market:'unconfirmed',
    direction,entry,take,stop,leverage,conditional,qualified:complete&&!conditional,
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
  const fetcher=options.fetchImpl||fetch;
  const symbol=signal.symbol+'USDT';
  const start=Math.floor((Date.parse(signal.at)+3600000)/3600000)*3600000;
  const end=Date.now();
  const url='https://api.bybit.com/v5/market/kline?'+new URLSearchParams({
    category:'linear',symbol,interval:'60',start:String(start),end:String(end),limit:'1000'});
  const response=await fetcher(url,{signal:AbortSignal.timeout(9000),cache:'no-store'});
  if(!response.ok)throw Error('market-http-'+response.status);
  const payload=await response.json();
  if(Number(payload.retCode)!==0||!Array.isArray(payload.result?.list))throw Error('market-data-unavailable');
  return payload.result.list.map(r=>({at:Number(r[0]),high:Number(r[2]),low:Number(r[3]),close:Number(r[4])})).filter(r=>
    Number.isFinite(r.at)&&Number.isFinite(r.high)&&Number.isFinite(r.low)&&r.high>=r.low);
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
    let posts=new Map((Array.isArray(previous.messages)?previous.messages:[])
      .filter(m=>Date.parse(m.at)>=cutoff).map(m=>[m.id,m]));
    let cursor=Number(previous.cursor||0)||null,complete=Boolean(previous.backfillComplete);
    let sourceError=null,priceError=null;
    try{
      const latest=await fetchChannelPage(null,options);
      latest.forEach(m=>{if(Date.parse(m.at)>=cutoff)posts.set(m.id,m)});
      if(!cursor&&!complete)cursor=Math.min(...latest.map(m=>m.id));
      if(cursor&&!complete){
        for(let i=0;i<4;i++){
          const batch=await fetchChannelPage(cursor,options);
          const old=Math.min(...batch.map(m=>m.id));
          if(old>=cursor){complete=true;break;}
          batch.forEach(m=>{if(Date.parse(m.at)>=cutoff)posts.set(m.id,m)});
          cursor=old;
          if(batch.some(m=>Date.parse(m.at)<cutoff)){complete=true;break;}
        }
      }
      const signals=[...posts.values()].map(parseSignal).filter(Boolean).sort((a,b)=>b.at.localeCompare(a.at));
      const oldResults=previous.results&&typeof previous.results==='object'?previous.results:{};
      const results={};
      let attempts=0;
      for(const s of signals){
        if(!s.qualified)continue;
        const prev=oldResults[s.id];
        if(prev?.status==='won'||prev?.status==='lost'||prev?.status==='ambiguous'){
          results[s.id]=prev;continue;
        }
        if(attempts>=5){if(prev)results[s.id]=prev;continue;}
        attempts++;
        try{results[s.id]=evaluateCandles(s,await candlesForSignal(s,options),now)}
        catch(e){priceError=String(e?.message||e);results[s.id]=prev||{status:'market-unavailable'};}
      }
      const state={messages:[...posts.values()].sort((a,b)=>b.id-a.id).slice(0,1000),
        results,backfillComplete:complete,cursor,updatedAt:new Date(now).toISOString(),
        sourceError:null,priceError};
      await client.setRecord({namespace:NS,key:KEY,value:state,tags:['rudi-crypto-signals'],
        updated_at:state.updatedAt,expires_at:null});
      return buildView(state,now);
    }catch(e){
      sourceError=String(e?.message||e);
      return buildView({...previous,sourceError},now);
    }
  })();
  try{return await refreshFlight}finally{refreshFlight=null;}
}
function buildView(state,now=Date.now()){
  const cutoff=now-PERIOD_MS;
  const messages=(Array.isArray(state.messages)?state.messages:[]).filter(m=>Date.parse(m.at)>=cutoff);
  const signals=messages.map(parseSignal).filter(Boolean).map(signal=>{
    const row=state.results?.[signal.id];
    return {...signal,...(row||{}),url:signal.url,id:signal.id,at:signal.at};
  }).sort((a,b)=>b.at.localeCompare(a.at));
  const verified=signals.filter(s=>s.status==='won'||s.status==='lost');
  const won=verified.filter(s=>s.status==='won');
  const knownChange=verified.filter(s=>Number.isFinite(s.priceChangePct));
  const avgChange=knownChange.length?Math.round(knownChange.reduce((s,r)=>s+r.priceChangePct,0)*100/knownChange.length)/100:null;
  return {channel:'@ne_investor',days:30,updatedAt:state.updatedAt||null,
    backfillComplete:Boolean(state.backfillComplete),sourceError:state.sourceError||null,
    priceError:state.priceError||null,
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
module.exports={NS,parsePreview,parseSignal,evaluateCandles,compareSignal:parseSignal,
  buildView,readSignals,refreshSignals,candlesForSignal};
