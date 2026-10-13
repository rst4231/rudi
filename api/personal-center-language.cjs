'use strict';
// Keeps personal AI reports Russian without changing evidence, actor, or report IDs.
const {createRudiStateClient}=require('./rudi-state-client.cjs');
const state=require('./personal-center-store.cjs');
const TEXT_FIELDS=['headline','overview','mainChange','mainObservation','mainAction','forecast','financeText','habitsText','taskText','trendText','connectionsText'];
const AREA_FIELDS=['observation','nextStep'];
const DETAIL_FIELDS=['evidence','analysis','nextStep','verify','caveat'];

function narrativeText(narrative){
 const v=narrative&&typeof narrative==='object'?narrative:{};
 return [...TEXT_FIELDS.map(k=>v[k]),...(Array.isArray(v.focus)?v.focus:[]),
   ...(Array.isArray(v.lifeAreas)?v.lifeAreas.flatMap(item=>AREA_FIELDS.map(k=>item?.[k])):[]),
   ...(Array.isArray(v.deepAnalysis)?v.deepAnalysis.flatMap(item=>DETAIL_FIELDS.map(k=>item?.[k])):[])
 ].filter(x=>typeof x==='string'&&x.trim());
}
function containsEnglishReport(narrative){
 return narrativeText(narrative).some(value=>{
  const latin=(value.match(/[a-z]/gi)||[]).length;
  const cyrillic=(value.match(/[а-яё]/gi)||[]).length;
  // Ignore acronyms, technical names and short English references in Russian prose.
  const words=(value.match(/\b[a-z]{3,}\b/gi)||[]).length;
  return latin>=18&&words>=3&&latin>cyrillic*1.6;
 });
}
function mergeTranslation(original,translated){
 if(!translated||typeof translated!=='object'||Array.isArray(translated))throw Error('invalid-russian-translation');
 const result={...original};
 for(const key of TEXT_FIELDS)if(typeof original[key]==='string'){
  if(typeof translated[key]!=='string')throw Error('invalid-russian-translation');
  result[key]=translated[key].slice(0,2000);
 }
 if(Array.isArray(original.focus)){
  if(!Array.isArray(translated.focus)||translated.focus.length!==original.focus.length)throw Error('invalid-russian-translation');
  result.focus=original.focus.map((old,i)=>{
   if(typeof translated.focus[i]!=='string')throw Error('invalid-russian-translation');
   return translated.focus[i].slice(0,600);
  });
 }
 for(const [group,fields] of [['lifeAreas',AREA_FIELDS],['deepAnalysis',DETAIL_FIELDS]]){
  const rows=Array.isArray(original[group])?original[group]:[];
  if(rows.length){
   const got=translated[group];
   if(!Array.isArray(got)||got.length!==rows.length)throw Error('invalid-russian-translation');
   result[group]=rows.map((row,i)=>{
    if(!got[i]||got[i].domain!==row.domain)throw Error('invalid-russian-translation');
    const item={...row};
    for(const field of fields){
     if(typeof row[field]==='string'){
      if(typeof got[i][field]!=='string')throw Error('invalid-russian-translation');
      item[field]=got[i][field].slice(0,2500);
     }
    }
    return item;
   });
  }
 }
 if(containsEnglishReport(result))throw Error('english-translation-output');
 return result;
}
async function translateNarrative(narrative,options={}){
 if(!containsEnglishReport(narrative))return narrative;
 const env=options.env||process.env;
 const apiKey=String(env.GROQ_API_KEY||'').trim();
 if(!apiKey)throw Error('translation-provider-unavailable');
 const fetchImpl=options.fetchImpl||globalThis.fetch;
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),22000);
 try{
  const response=await fetchImpl('https://api.groq.com/openai/v1/chat/completions',{
   method:'POST',cache:'no-store',signal:controller.signal,
   headers:{'content-type':'application/json',authorization:'Bearer '+apiKey},
   body:JSON.stringify({
    model:'openai/gpt-oss-20b',temperature:0,reasoning_effort:'low',include_reasoning:false,
    response_format:{type:'json_object'},max_completion_tokens:6000,stream:false,
    messages:[
     {role:'system',content:'Ты переводчик JSON на русский язык. Переводи ТОЛЬКО значения текстовых полей на естественный грамотный русский, включая вложенные массивы и все текстовые описания. Сохрани структуру JSON, названия ключей, поля domain и confidence без изменений. Не придумывай факты, не сокращай, не добавляй рекомендации. Сохрани все числа, проценты, даты и имена без изменений. Верни строго один JSON-объект; английских фраз в итоговых текстах быть не должно.'},
     {role:'user',content:JSON.stringify(narrative)}
    ]
   })
  });
  if(!response.ok)throw Error('translation-provider-'+response.status);
  const data=await response.json();
  const raw=data?.choices?.[0]?.message?.content;
  if(typeof raw!=='string')throw Error('invalid-russian-translation');
  let parsed;try{parsed=JSON.parse(raw);}catch{throw Error('invalid-russian-translation');}
  return mergeTranslation(narrative,parsed);
 }finally{clearTimeout(timer);}
}
function pendingRussianReport(report){
 const empty='';return {...report,translationPending:true,narrative:{
  headline:'Личный обзор',overview:'Перевод ранее созданной сводки временно недоступен. Попробуй открыть её позже.',
  mainChange:empty,mainObservation:empty,mainAction:empty,forecast:empty,
  focus:[],financeText:empty,habitsText:empty,taskText:empty,trendText:empty,
  connectionsText:empty,lifeAreas:[],deepAnalysis:[],confidence:'insufficient'
 }};
}
async function ensureRussianReport(actor,report,options={}){
 if(!report?.id||report.model==='deterministic'||!containsEnglishReport(report.narrative))return report;
 if(!state.ACTORS.includes(actor)||!String(report.id).startsWith('report:'+actor+':'))throw Error('rudi-access-denied');
 const client=options.client||createRudiStateClient(options);
 const retryKey='russian-retry:'+report.id,lockKey='russian-lock:'+report.id;
 if(await client.getRecord(state.NS,retryKey))return pendingRussianReport(report);
 const acquired=await client.setIfAbsent(state.NS,lockKey,{at:new Date().toISOString()},{ttl:90,tags:['personal-ai-language-lock']});
 if(!acquired)return pendingRussianReport(report);
 try{
  const current=(await client.getRecord(state.NS,report.id))?.value||report;
  if(!containsEnglishReport(current.narrative))return current;
  const translated=await translateNarrative(current.narrative,options);
  // Preserve the existing model, ID, date, slot, observations and creation date.
  const updated={...current,narrative:translated,language:'ru',updatedAt:new Date().toISOString()};
  const stored=(await client.getRecord(state.NS,report.id))?.value||current;
  if(!containsEnglishReport(stored.narrative))return stored;
  if(stored.updatedAt!==current.updatedAt) return pendingRussianReport(stored);
  await client.set(state.NS,report.id,updated,{tags:['personal-ai',actor]});
  const latest=(await client.getRecord(state.NS,'latest:'+actor))?.value;
  if(latest?.id===report.id)await client.set(state.NS,'latest:'+actor,updated,{tags:['personal-ai',actor]});
  await client.remove(state.NS,retryKey).catch(()=>{});
  return updated;
 }catch(error){
  console.warn('RUDI_PERSONAL_RUSSIAN_REPAIR_FAILED',actor,String(error?.message||error));
  await client.set(state.NS,retryKey,{at:new Date().toISOString()},{ttl:120,tags:['personal-ai-language-retry']}).catch(()=>{});
  return pendingRussianReport(report);
 }finally{
  await client.remove(state.NS,lockKey).catch(()=>{});
 }
}
module.exports={narrativeText,containsEnglishReport,mergeTranslation,translateNarrative,ensureRussianReport,pendingRussianReport};
