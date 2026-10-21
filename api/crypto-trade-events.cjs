'use strict';
// Telegram posts are evidence, not actual exchange execution reports.
// Never infer how much was added/closed when the author omitted quantities.
function classifyUpdate(message){
  const text=String(message?.text||'');
  let type=null;
  const passiveClose=/(?:остат(?:ок|ки)|позици\p{L}*|сделк\p{L}*)[^.!?\n]{0,70}\sзакрыт(?:а|о|ы)?(?=$|[^\p{L}])/iu.test(text)&&
    !/(?:не\s+закрыт|буд(?:ет|ут)\s+закрыт|долж\p{L}*\s+быть\s+закрыт)/iu.test(text);
  const passivePartial=passiveClose&&/(?:часть|частично)[^.!?\n]{0,70}\sзакрыт/iu.test(text);
  const residualClose=passiveClose&&/остат(?:ок|ки)[^.!?\n]{0,70}\sзакрыт/iu.test(text);
  if(passiveClose&&(!passivePartial||residualClose))type='full-close';
  else if(passivePartial||/(?:закрыл|закрываю|фиксирую|зафиксировал|снял)\s*(?:часть|частично|\d+(?:[.,]\d+)?\s*%)/iu.test(text)||/(?:частичн\p{L}*\s+(?:закрыл|закрываю|фиксирую|фиксац\p{L}*)|часть\s+(?:позиции\s+)?(?:закрыл|закрываю|фиксирую|зафиксировал)|(?:закрыл|закрываю)\s+часть\s+позиции)/iu.test(text))type='partial-close';
  else if(/(?:стоп\s*(?:в|на)\s*(?:бу|б\/у|безубыт)|(?:перен[её]с|переношу|переставил)\s+стоп\s+(?:в|на)\s+(?:бу|б\/у|безубыт))/iu.test(text))type='stop-to-breakeven';
  else if(/(?:закрыл[ао]?\s+полностью|полностью\s+закрыл[ао]?|(?:закрыл[ао]?|закрываю|закрыли|закрыта|закрыто|закрываю)\s+(?:(?:всю|весь|свою|мою|эту)\s+)?(?:позици\p{L}*|позу|сделк\p{L}*|(?:шорт|лонг)\p{L}*)|(?:вышел|выхожу)\s+(?:из\s+)?(?:позици\p{L}*|сделк\p{L}*|(?:шорт|лонг)\p{L}*)|(?:позици\p{L}*|поза|сделка|шорт|лонг)\s+закрыт[ао]?)/iu.test(text))type='full-close';
  else if(/(?:сработал\s+(?:тейк|tp)|(?:достигли|взял|отработал)\s+(?:тейк|tp|цель))/iu.test(text))type='author-claimed-tp';
  else if(/(?:выбил\s+стоп|сработал\s+(?:стоп|sl)|закрыл[ао]?\s+по\s+стоп)/iu.test(text))type='author-claimed-sl';
  else if(/(?:^|[^\\p{L}])(?:перен[её]с|переношу|двигаю|передвинул|установил|поставил|изменил|новый|подтянул)[^.!?\\n]{0,45}\\b(?:стоп|stop|sl)\\b|(?:^|[^\\p{L}])(?:стоп|stop|sl)\\s*(?:на|по|=|:)\\s*\\d/iu.test(text))type='stop-level-update';
  else if(/(?:^|[^\\p{L}])(?:перен[её]с|переношу|изменил|новый|поставил)[^.!?\\n]{0,45}(?:тейк|take|tp)\\b|(?:^|[^\\p{L}])(?:тейк|take|tp)\\s*(?:на|по|=|:)\\s*\\d/iu.test(text))type='take-level-update';
  else if(/(?:докид\p{L}*|докин\p{L}*|добав\p{L}*\s+(?:марж|обеспеч)|добир\p{L}*|усредня\p{L}*|увелич\p{L}*\s+(?:позици|объ[её]м|объем))/iu.test(text))
    type=/(?:марж|залог|обеспеч|collateral)/iu.test(text)?'collateral-addition':
      /(?:позици|объ[её]м|объем)/iu.test(text)?'position-addition':'unspecified-addition';
  if(!type)return null;
  // A claimed "7% price move" or ROI is not the fraction of the position sold.
  const pctToken=text.match(/(?:закрыл|закрываю|фиксирую|зафиксировал|снял|часть|частично)\s*(?:часть|частично)?\s*(?:(?:позиции|объ[её]ма)\s*)?(\d{1,3}(?:[.,]\d+)?)\s*%(?!\s*(?:чист\p{L}*|движ\p{L}*|прибыл\p{L}*|roi))/iu)
    ||text.match(/(\d{1,3}(?:[.,]\d+)?)\s*%\s*(?:позиции|объ[её]ма|закрыл|фиксирую|зафиксировал)/iu);
  const fraction=pctToken?Number(pctToken[1].replace(',','.'))/100:null;
  const closeFraction=type==='partial-close'&&Number.isFinite(fraction)&&fraction>0&&fraction<1?fraction:null;
  const priceValue=(pattern)=>{const m=text.match(pattern);if(!m)return null;const n=Number(m[1].replace(/\\s/g,'').replace(',','.'));return Number.isFinite(n)&&n>0&&n<1e8?n:null;};
  const exitPrice=['full-close','author-claimed-tp','author-claimed-sl'].includes(type)?
    priceValue(/(?:закрыл[ао]?|закрываю|вышел|выхожу|фиксирую|зафиксировал)[^.!?\\n]{0,40}\\bпо\\s*(?:\\$|≈|~)?\\s*([\\d][\\d\\s.,]*)/iu):null;
  const levelPrice=type==='stop-level-update'?
    priceValue(/(?:стоп|stop|sl)\\s*(?:-?лосс)?\\s*(?:на|по|=|:|в)?\\s*(?:\\$|≈|~)?\\s*([\\d][\\d\\s.,]*)/iu):
    type==='take-level-update'?priceValue(/(?:тейк|take|tp)\\s*(?:-?профит)?\\s*(?:на|по|=|:|в)?\\s*(?:\\$|≈|~)?\\s*([\\d][\\d\\s.,]*)/iu):null;
  if(['stop-level-update','take-level-update'].includes(type)&&levelPrice===null)return null;
  return {id:message.id,at:message.at,url:message.url,type,closeFraction,exitPrice,levelPrice,
    measured:closeFraction!==null,source:'author-message',
    excerpt:text.slice(0,230)};
}
function linkUpdates(signals,messages,options={}){
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
    // Unlabelled author closes may be linked only when there is exactly one
    // RUDI-owned live entry AND exactly one recent author trade candidate.
    // Never guess between two positions or two recent ideas.
    if(!candidates.length&&!((m.references||[]).length)&&u.type==='full-close'&&
       !/\\$[A-Z0-9]{2,14}\\b/i.test(m.text||'')){
      const active=Array.isArray(options.activeSignalIds)?options.activeSignalIds.map(String):[];
      const recent=signals.filter(s=>Date.parse(s.at)<Date.parse(m.at)&&
        Date.parse(m.at)-Date.parse(s.at)<=8*3600000);
      if(active.length===1&&recent.length===1&&
         String(recent[0].id)===active[0])candidates=recent;
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
