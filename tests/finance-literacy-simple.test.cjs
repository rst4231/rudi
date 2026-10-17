'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {getSimpleLiteracyExplanation,literacyArticleId,moscowDateKey}=require('../api/finance-ai.cjs');
function setup(){
 const now='2026-10-17T12:00:00.000Z',article={date:moscowDateKey(now),title:'Зачем нужна копилка',body:'Резерв помогает подготовиться к неожиданным тратам. '.repeat(22)};
 const store=new Map([['articles',{articles:[article]}]]),calls=[];
 const options={now,env:{GROQ_API_KEY:'server-secret'},cache:{get:async key=>store.get(key),set:async(key,value)=>{store.set(key,value)}},fetch:async(url,request)=>{
  calls.push({url,request});return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({text:'Представь, что у тебя есть копилка. Ты откладываешь в неё часть карманных денег. Если любимая игрушка сломается, эти деньги помогут купить новую. Это пример резерва: деньги ждут неожиданной траты.'})}}]})};
 }};
 return {article,options,store,calls,context:{actor:'Рустам',articleId:literacyArticleId(article)}};
}
test('simple explanation uses canonical article, server key, actor cache and duplicate coalescing',async()=>{
 const h=setup(),original=JSON.stringify(h.article);
 const [a,b]=await Promise.all([getSimpleLiteracyExplanation(h.context,h.options),getSimpleLiteracyExplanation(h.context,h.options)]);
 assert.equal(h.calls.length,1);assert.deepEqual(a,b);assert.equal(a.articleId,h.context.articleId);assert.equal(a.explanation.provider,'groq');assert.equal(JSON.stringify(h.article),original);
 const payload=JSON.parse(h.calls[0].request.body);assert.equal(payload.messages[0].role,'system');assert.match(payload.messages[0].content,/8 лет/);assert.match(payload.messages[0].content,/не давай персональных/);
 assert.equal(JSON.parse(payload.messages[1].content).article,h.article.body);assert.equal(h.calls[0].request.headers.Authorization,'Bearer server-secret');
 await getSimpleLiteracyExplanation(h.context,h.options);assert.equal(h.calls.length,1);
 await getSimpleLiteracyExplanation({...h.context,actor:'Диана'},h.options);assert.equal(h.calls.length,2);
});
test('wrong actor and stale article do not call Groq or accept supplied replacement text',async()=>{
 const h=setup();
 await assert.rejects(getSimpleLiteracyExplanation({...h.context,actor:'visitor'},h.options),/rudi-access-denied/);
 await assert.rejects(getSimpleLiteracyExplanation({...h.context,articleId:'0'.repeat(64),body:'Подмена'},h.options),/finance-literacy-stale/);
 assert.equal(h.calls.length,0);
 h.store.set('articles',{articles:[{...h.article,degraded:true}]});
 await assert.rejects(getSimpleLiteracyExplanation(h.context,h.options),/explanation-unavailable/);
});
test('provider failures and truncated/oversized output leave explanation uncached and allow retry',async()=>{
 const h=setup(),key='literacy-simple-v1:'+h.context.actor+':'+h.context.articleId;
 for(const response of [
  {ok:false,status:429},
  {ok:true,json:async()=>({choices:[{finish_reason:'length',message:{content:JSON.stringify({text:'Слово '.repeat(70)})}}]})},
  {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({text:'я'.repeat(6001)})}}]})}
 ]){
  await assert.rejects(getSimpleLiteracyExplanation(h.context,{...h.options,fetch:async()=>response}),/explanation-unavailable/);assert.equal(h.store.has(key),false);
 }
 const result=await getSimpleLiteracyExplanation(h.context,h.options);assert.ok(result.explanation.text);
});
test('finance explanation operation follows authentication and returns bounded status errors',()=>{
 const source=fs.readFileSync('api/finances.js','utf8');
 assert.ok(source.indexOf('authorizeRequest(req, body.initData)')<source.indexOf("operation === 'literacy-explain'"));
 assert.match(source,/getSimpleLiteracyExplanation\(\{actor,articleId:body\.articleId\}\)/);
 const {statusFor}=require('../api/finances.js');assert.equal(statusFor('finance-literacy-stale',Error('finance-literacy-stale')),409);assert.equal(statusFor('finance-literacy-explanation-unavailable',Error('finance-literacy-explanation-unavailable')),503);
});
test('no more than four distinct explanation generations run concurrently',async()=>{
 const jobs=[],release=[];
 for(let i=0;i<4;i++){
  const h=setup();h.article.title+=' '+i;h.context.articleId=literacyArticleId(h.article);
  const fetch=h.options.fetch;
  h.options.fetch=(...args)=>new Promise(resolve=>release.push(async()=>resolve(await fetch(...args))));
  jobs.push(getSimpleLiteracyExplanation(h.context,h.options));
 }
 await new Promise(resolve=>setImmediate(resolve));assert.equal(release.length,4);
 const fifth=setup();fifth.article.title+=' extra';fifth.context.articleId=literacyArticleId(fifth.article);
 try{await assert.rejects(getSimpleLiteracyExplanation(fifth.context,fifth.options),/explanation-unavailable/);assert.equal(fifth.calls.length,0)}
 finally{await Promise.all(release.map(fn=>fn()));await Promise.all(jobs)}
});
