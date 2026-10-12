'use strict';
const {createStrictRuntimeCache}=require('./strict-runtime-cache.cjs');
const NAMESPACE='rudi-meditation-quote-v1';
// The AI selects a verified passage, it never invents the words of a historical person.
// Russian text is a translation/adaptation of source passages with book references.
const LIBRARY=[
 {text:'Людей тревожат не сами вещи, а представления, которые они о них имеют.',author:'Эпиктет',source:'Энхиридион, §5'},
 {text:'Нигде человек не найдёт такого тихого и спокойного убежища, как в собственной душе.',author:'Марк Аврелий',source:'Наедине с собой, IV.3'},
 {text:'Пока мы откладываем жизнь, она проходит.',author:'Сенека',source:'Нравственные письма к Луцилию, I.1'},
 {text:'Если тебя огорчает что-нибудь внешнее, то мучает тебя не сама вещь, а твоё суждение о ней.',author:'Марк Аврелий',source:'Наедине с собой, VIII.47'},
 {text:'Не требуй, чтобы происходящее происходило по твоему желанию. Желай, чтобы оно происходило так, как происходит.',author:'Эпиктет',source:'Энхиридион, §8'}
];
function moscowDay(now=new Date()){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now)).map(x=>[x.type,x.value]));
 return p.year+'-'+p.month+'-'+p.day;
}
function cache(options={}){return options.quoteCache||createStrictRuntimeCache({namespace:NAMESPACE,...options})}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let inflight=new Map();
async function chooseWithGroq(day,options={}){
 const key=String((options.env||process.env).GROQ_API_KEY||'').trim();
 if(!key)return null;
 const prompt='Выбери ОДИН номер (0,1,2,3,4) известной цитаты для сегодняшней медитации. Только номер. Дата: '+day+'. Выбери с учётом разнообразия тем. Не создавай новых цитат и не поясняй.';
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4500);
 try{
  const response=await (options.fetchImpl||globalThis.fetch)('https://api.groq.com/openai/v1/chat/completions',{
   method:'POST',signal:controller.signal,headers:{Authorization:'Bearer '+key,'content-type':'application/json'},
   body:JSON.stringify({model:'openai/gpt-oss-20b',temperature:0.7,max_completion_tokens:24,
     messages:[{role:'system',content:'Return one digit 0, 1, 2, 3, or 4. No other text.'},{role:'user',content:prompt}]})
  });
  if(!response.ok)return null;
  const json=await response.json();
  const raw=String(json?.choices?.[0]?.message?.content||'').trim();
  const n=/^[0-4]$/.test(raw)?Number(raw):null;
  return n;
 }catch{return null}finally{clearTimeout(timer)}
}
async function dailyQuote(options={}){
 const day=moscowDay(options.now||new Date());const store=cache(options);
 const existing=await store.get(day);
 if(existing?.day===day&&typeof existing.index==='number'&&LIBRARY[existing.index])return {day,...LIBRARY[existing.index]};
 if(inflight.has(day))return inflight.get(day);
 const job=(async()=>{
  const picked=await chooseWithGroq(day,options);
  const fallback=Number(day.replaceAll('-',''))%LIBRARY.length;
  const index=Number.isInteger(picked)?picked:fallback;
  // One durable record per Moscow date, across both partners.
  await store.set(day,{day,index},{ttl:370*24*3600,tags:['rudi-meditation-quote'],name:day});
  return {day,...LIBRARY[index]};
 })().finally(()=>inflight.delete(day));
 inflight.set(day,job);return job;
}
module.exports={LIBRARY,moscowDay,chooseWithGroq,dailyQuote};
