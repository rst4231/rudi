'use strict';
const {authorizeRequest,statusForError}=require('./rudi-request-auth.cjs');
const {createStrictRuntimeCache}=require('./strict-runtime-cache.cjs');
const {DEFAULT_MODEL}=require('./daily-question-ai.cjs');
const birthdayConfig=require('../rudi-config.json').birthdays;
const NAMESPACE='rudi-birthday-greetings-v1';
function moscowToday(now=Date.now()){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now)).map(x=>[x.type,x.value]));
 return {key:p.year+'-'+p.month+'-'+p.day,month:Number(p.month),day:Number(p.day)};
}
function birthdayForActor(actor,date,birthdays=birthdayConfig){
 return (Array.isArray(birthdays)?birthdays:[]).find(x=>x.name===actor&&Number(x.month)===date.month&&Number(x.day)===date.day)||null;
}
function fallback(actor){
 return actor==='Рустам'
  ?'Рустам, с днём рождения! Пусть твои идеи становятся реальностью, рядом будут Диана и Лулу, а в каждом дне находится время для радости, тепла и маленьких побед. Желаю тебе вдохновения, любви и по-настоящему счастливого года!'
  :'Диана, с днём рождения! Пусть этот год подарит много нежности, удивительных открытий и счастливых минут с Рустамом и Лулу. Пусть рядом всегда будут любовь, поддержка и поводы улыбаться, а твои мечты обязательно сбываются!';
}
async function generateBirthdayGreeting(actor,options={}){
 const key=String(options.apiKey||options.env?.GROQ_API_KEY||process.env.GROQ_API_KEY||'').trim();
 if(!key)return {greeting:fallback(actor),aiGenerated:false};
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),9000);
 try{
  const details=actor==='Рустам'
    ?'Рустам создаёт приложение РуДи, любит новые идеи и проекты. Его близкие: Диана и французский бульдог Лулу.'
    :'Диана живёт вместе с Рустамом, они заботятся о французском бульдоге Лулу. Поздравление от приложения для неё лично.';
  const response=await (options.fetch||globalThis.fetch)('https://api.groq.com/openai/v1/chat/completions',{
   method:'POST',signal:controller.signal,
   headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},
   body:JSON.stringify({model:DEFAULT_MODEL,temperature:.88,max_completion_tokens:230,
    messages:[{role:'system',content:'Напиши тёплое, искреннее, небанальное персональное поздравление с днём рождения на русском языке. Обратись на ты, 3–5 коротких предложений, без Markdown, заголовков, пафоса и упоминаний искусственного интеллекта. Не придумывай событий и персональных фактов.'},
     {role:'user',content:'Сегодня день рождения '+actor+'. '+details+' Сделай душевное поздравление лично для '+actor+'.'}]})
  });
  if(!response.ok)throw Error('ai-unavailable');
  const data=await response.json();
  const text=String(data?.choices?.[0]?.message?.content||'').replace(/<[^>]*>/g,'').trim().slice(0,850);
  if(text.length<35)throw Error('ai-empty');
  return {greeting:text,aiGenerated:true};
 }catch(_){return {greeting:fallback(actor),aiGenerated:false}}
 finally{clearTimeout(timer)}
}
async function handleBirthdayGreeting(req,res,options={}){
 if(req.method!=='POST')return res.status(405).json({ok:false,error:'method-not-allowed'});
 let actor='';
 try{actor=authorizeRequest(req,req.body?.initData||'',options).actor}
 catch(e){return res.status(statusForError(e)).json({ok:false,error:'unauthorized'})}
 const date=moscowToday(options.now||Date.now());
 if(!birthdayForActor(actor,date,options.birthdays||birthdayConfig))
  return res.status(403).json({ok:false,error:'not-birthday'});
 const cache=options.cache||createStrictRuntimeCache({namespace:NAMESPACE});
 const key='greeting:'+actor+':'+date.key;
 try{
  const stored=await cache.get(key);
  if(stored?.greeting)return res.status(200).json({ok:true,...stored,cached:true});
  const generated=await generateBirthdayGreeting(actor,options);
  await cache.set(key,generated,{ttl:370*24*60*60,name:key,tags:['rudi-birthday-greetings']});
  return res.status(200).json({ok:true,...generated,cached:false});
 }catch(_){return res.status(200).json({ok:true,greeting:fallback(actor),aiGenerated:false})}
}
module.exports={moscowToday,birthdayForActor,fallback,generateBirthdayGreeting,handleBirthdayGreeting};
