'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {readDailyQuestion,answerDailyQuestion,resetMutationQueueForTests}=require('../api/daily-question-store.cjs');
const cache=()=>{const rows=new Map();return{get:async key=>rows.get(key),set:async(key,value)=>rows.set(key,structuredClone(value))}};
test('provider failure still creates one shared daily question and rotates without losing yesterday answers',async()=>{
 resetMutationQueueForTests();let calls=0;const common={dailyQuestionCache:cache(),dailyQuestionHistoryCache:cache(),generateQuestion:async()=>{calls++;throw Error('daily-question-ai-provider')}};
 const day1={...common,now:Date.parse('2026-11-05T05:00:00Z')},first=await readDailyQuestion('Рустам',day1);
 assert.ok(first.question.text.length>=12);assert.equal((await readDailyQuestion('Диана',day1)).question.id,first.question.id);assert.equal(calls,1);
 await answerDailyQuestion('Рустам','Ответ за вчера',day1);
 const next=await readDailyQuestion('Рустам',{...common,now:Date.parse('2026-11-06T05:00:00Z')});
 assert.notEqual(next.question.text,first.question.text);assert.equal(next.mineAnswered,false);assert.equal((await common.dailyQuestionCache.get('day:2026-11-05')).answers['Рустам'].text,'Ответ за вчера');
});
test('generation failure while online does not claim the device is offline',async()=>{
 const source=fs.readFileSync('public/app.js','utf8'),start=source.indexOf('      async function loadDailyQuestion('),end=source.indexOf('\n      function ',start+1);
 const elements={dailyQuestionStatus:{},dailyQuestionLoading:{},dailyQuestionContent:{}},cached={date:'2026-11-04',question:{id:'dq-old',text:'Сохранённый вопрос'}};
 const ctx={currentActor:'Рустам',document:{getElementById:id=>elements[id]},window:{rudiOfflineContent:{cached:async()=>cached,isOffline:()=>false}},renderDailyQuestionOffline:async()=>{},dailyQuestionRequest:async()=>{throw Error('daily-question-ai-provider')}};
 const load=vm.runInNewContext(source.slice(start,end)+';loadDailyQuestion',ctx);await load();assert.ok(!elements.dailyQuestionStatus.textContent.includes('Офлайн'));assert.match(elements.dailyQuestionStatus.textContent,/Не удалось обновить/);
});
test('a provider rejection is captured as a safe status/code and never stores its raw message',async()=>{
 const {generateDailyQuestion}=require('../api/daily-question-ai.cjs');
 await assert.rejects(generateDailyQuestion([],{apiKey:'test-secret',fetch:async()=>({ok:false,status:400,json:async()=>({error:{code:'json_validate_failed',message:'sensitive raw provider detail'}})})}),error=>error.message==='daily-question-ai-provider'&&error.providerStatus===400&&error.providerCode==='json_validate_failed'&&!JSON.stringify(error).includes('sensitive'));
});
test('reserve skips a previously used question and fails closed when its unique supply is exhausted',()=>{
 const {reserveDailyQuestion}=require('../api/daily-question-reserve.cjs'),{similarQuestion}=require('../api/daily-question-ai.cjs');const history=[];
 for(let i=0;i<50;i++){
  let next;try{next=reserveDailyQuestion(history,'2026-11-05')}catch(error){assert.equal(error.message,'daily-question-reserve-exhausted');assert.ok(history.length>=20);return}
  assert.ok(!history.some(row=>similarQuestion(row.question,next.question)));history.unshift(next);
 }
 assert.fail('reserve must not recycle an old question');
});
test('a question already generated today is preserved and does not call the generator again',async()=>{
 resetMutationQueueForTests();const store=cache(),history=cache(),now=Date.parse('2026-11-05T08:00:00Z');
 const original={date:'2026-11-05',question:{id:'dq-2026-11-05',text:'Какой новый маршрут тебе интересно пройти вместе?',provider:'groq'},answers:{'Диана':{text:'Набережная',answeredAt:new Date(now).toISOString()}}};await store.set('day:2026-11-05',original);
 const result=await readDailyQuestion('Диана',{now,dailyQuestionCache:store,dailyQuestionHistoryCache:history,generateQuestion:()=>{assert.fail('must keep today question')}});
 assert.equal(result.question.text,original.question.text);assert.equal(result.mineAnswered,true);assert.equal((await store.get('day:2026-11-05')).answers['Диана'].text,'Набережная');
});
test('generator retries two failed requests and accepts the third response',async()=>{
 const {generateDailyQuestion}=require('../api/daily-question-ai.cjs');let calls=0;
 const result=await generateDailyQuestion([],{apiKey:'test',fetch:async()=>{
  calls++;if(calls===1)return{ok:false,status:400,json:async()=>({error:{code:'json_validate_failed'}})};
  if(calls===2)throw TypeError('network');
  return{ok:true,status:200,json:async()=>({choices:[{message:{content:JSON.stringify({question:'Какое новое блюдо тебе интересно приготовить вместе?',theme:'кулинария'})}}]})};
 }});assert.equal(calls,3);assert.equal(result.provider,'groq');
});
test('reserve is used only after exactly three failed provider requests',async()=>{
 resetMutationQueueForTests();let calls=0;const result=await readDailyQuestion('Рустам',{now:Date.parse('2026-11-05T05:00:00Z'),dailyQuestionCache:cache(),dailyQuestionHistoryCache:cache(),apiKey:'test',fetch:async()=>{calls++;return{ok:false,status:503}}});
 assert.equal(calls,3);assert.equal(result.question.provider,'local');
});
