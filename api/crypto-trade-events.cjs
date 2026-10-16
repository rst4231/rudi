'use strict';
// Telegram posts are evidence, not actual exchange execution reports.
// Never infer how much was added/closed when the author omitted quantities.
function classifyUpdate(message){
  const text=String(message?.text||'');
  let type=null;
  if(/(?:закрыл|закрываю|фиксирую|зафиксировал|снял)\s*(?:часть|частично|\d+(?:[.,]\d+)?\s*%)/iu.test(text)||/(?:частичн\p{L}*\s+(?:закрыл|закрываю|фиксац\p{L}*)|часть\s+(?:позиции\s+)?(?:закрыл|закрываю|зафиксировал)|(?:закрыл|закрываю)\s+часть\s+позиции)/iu.test(text))type='partial-close';
  else if(/(?:стоп\s*(?:в|на)\s*(?:бу|б\/у|безубыт)|(?:перен[её]с|переношу|переставил)\s+стоп\s+(?:в|на)\s+(?:бу|б\/у|безубыт))/iu.test(text))type='stop-to-breakeven';
  else if(/(?:закрыл[ао]?\s+полностью|полностью\s+закрыл[ао]?|(?:закрыл[ао]?|закрываю|закрыли|закрыта|закрыто|закрываю)\s+(?:(?:всю|весь|свою|мою|эту)\s+)?(?:позици\p{L}*|позу|сделк\p{L}*|(?:шорт|лонг)\p{L}*)|(?:вышел|выхожу)\s+(?:из\s+)?(?:позици\p{L}*|сделк\p{L}*|(?:шорт|лонг)\p{L}*)|(?:позици\p{L}*|поза|сделка|шорт|лонг)\s+закрыт[ао]?)/iu.test(text))type='full-close';
  else if(/(?:сработал\s+(?:тейк|tp)|(?:достигли|взял|отработал)\s+(?:тейк|tp|цель))/iu.test(text))type='author-claimed-tp';
  else if(/(?:выбил\s+стоп|сработал\s+(?:стоп|sl)|закрыл[ао]?\s+по\s+стоп)/iu.test(text))type='author-claimed-sl';
  else if(/(?:докид\p{L}*|докин\p{L}*|добав\p{L}*\s+(?:марж|обеспеч)|добир\p{L}*|усредня\p{L}*|увелич\p{L}*\s+(?:позици|объ[её]м|объем))/iu.test(text))
    type=/(?:марж|залог|обеспеч|collateral)/iu.test(text)?'collateral-addition':
      /(?:позици|объ[её]м|объем)/iu.test(text)?'position-addition':'unspecified-addition';
  if(!type)return null;
  const pctToken=text.match(/(?:закрыл|закрываю|фиксирую|снял|часть|частично)\D{0,30}(\d{1,3}(?:[.,]\d+)?)\s*%/iu)
    ||text.match(/(\d{1,3}(?:[.,]\d+)?)\s*%\s*(?:позиции|объ[её]ма|закрыл|фиксирую|зафиксировал)/iu);
  const fraction=pctToken?Number(pctToken[1].replace(',','.'))/100:null;
  const closeFraction=type==='partial-close'&&Number.isFinite(fraction)&&fraction>0&&fraction<1?fraction:null;
  return {id:message.id,at:message.at,url:message.url,type,closeFraction,
    measured:closeFraction!==null,source:'author-message',
    excerpt:text.slice(0,230)};
}
function linkUpdates(signals,messages){
  const byId=new Map(signals.map(s=>[s.id,s]));
  const sorted=[...(Array.isArray(messages)?messages:[])].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
  for(const m of sorted){
    const u=classifyUpdate(m);if(!u)continue;
    const direct=[...new Set((m.references||[]).map(id=>byId.get(id)).filter(Boolean))]
      .filter(s=>Date.parse(s.at)<Date.parse(m.at));
    let candidates=direct;
    if(!candidates.length){
      const ticker=String(m.text||'').match(/\$([A-Z0-9]{2,14})\b/i)?.[1]?.toUpperCase();
      if(ticker)candidates=signals.filter(s=>s.symbol===ticker&&Date.parse(s.at)<Date.parse(m.at)
        &&Date.parse(m.at)-Date.parse(s.at)<7*86400000);
    }
    // A reply can cite a prior update, which in turn cites the original signal.
    if(!candidates.length&&(m.references||[]).length){
      const referenced=sorted.filter(row=>(m.references||[]).includes(row.id));
      const ancestors=new Set(referenced.flatMap(row=>row.references||[]));
      candidates=signals.filter(sig=>ancestors.has(sig.id)&&Date.parse(sig.at)<Date.parse(m.at));
    }
    if(candidates.length!==1)continue;
    if(u.type==='full-close'&&candidates[0].events?.some(e=>e.type==='full-close'&&Date.parse(e.at)<Date.parse(u.at)))continue;
    const s=candidates[0];
    if(!Array.isArray(s.events))s.events=[];
    if(!s.events.some(e=>e.id===u.id))s.events.push(u);
    if(u.type==='partial-close'&&/(?:стоп\s*(?:в|на)\s*(?:бу|б\/у|безубыт)|(?:перев[её]л|перен[её]с)\s+стоп\s+(?:в|на)\s*(?:бу|б\/у|безубыт))/iu.test(m.text||'')){
      const be={...u,id:String(u.id)+':be',type:'stop-to-breakeven',closeFraction:null,measured:false};
      if(!s.events.some(e=>e.id===be.id))s.events.push(be);
    }
  }
  for(const s of signals){s.events=(s.events||[]).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
    s.eventCount=s.events.length;
    s.partialCloses=s.events.filter(e=>e.type==='partial-close').length;
    s.breakEvenUpdates=s.events.filter(e=>e.type==='stop-to-breakeven').length;
    s.unquantifiedUpdates=s.events.filter(e=>!e.measured&&(e.type==='partial-close'||e.type==='collateral-addition'||e.type==='position-addition'||e.type==='unspecified-addition')).length;
  }
  return signals;
}
module.exports={classifyUpdate,linkUpdates};
