const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');

const {generateDailyQuestion,similarQuestion}=require('../api/daily-question-ai.cjs');
const {
  dateKey,readDailyQuestion,answerDailyQuestion,resetMutationQueueForTests,
}=require('../api/daily-question-store.cjs');

function memoryCache(){
  const map=new Map();
  return {
    map,
    async get(key){return map.has(key)?map.get(key):null},
    async set(key,value){map.set(key,value);return true},
    async delete(key){map.delete(key);return true},
  };
}
function groqResponse(question,theme='лёгкий'){
  return {
    ok:true,status:200,
    async json(){return {choices:[{message:{content:JSON.stringify({question,theme})}}]}}
  };
}

test('Groq daily question retries semantic/exact repeats',async()=>{
  let calls=0;
  const history=[{question:'Куда вы больше всего хотите съездить вдвоём в следующем году?'}];
  const result=await generateDailyQuestion(history,{
    apiKey:'x',
    fetch:async()=>{
      calls++;
      return calls===1
        ?groqResponse('Куда вы больше всего хотите съездить вдвоём в следующем году?','путешествия')
        :groqResponse('Какое новое блюдо вы бы с удовольствием попробовали вместе на этой неделе?','еда');
    },
  });
  assert.equal(calls,2);
  assert.equal(result.question,'Какое новое блюдо вы бы с удовольствием попробовали вместе на этой неделе?');
  assert.equal(similarQuestion(result.question,history[0].question),false);
});

test('answers stay hidden until both answer and reset with next daily question',async()=>{
  resetMutationQueueForTests();
  const cache=memoryCache();
  let generated=0;
  const generator=async()=>({
    question:++generated===1?'Какое новое место вы хотели бы открыть вместе?':'Какой уютный вечер вы бы устроили друг другу?',
    theme:'планы',model:'test',provider:'test',
  });
  const day1=Date.parse('2026-09-26T12:00:00Z');
  const day2=Date.parse('2026-09-27T12:00:00Z');
  const common={dailyQuestionCache:cache,generateQuestion:generator};

  const initial=await readDailyQuestion('Рустам',{...common,now:day1});
  assert.equal(initial.mineAnswered,false);
  assert.equal(initial.partnerAnswered,false);
  assert.equal(initial.answers,null);

  const rustam=await answerDailyQuestion('Рустам','Поехать в Выборг.',{...common,now:day1});
  assert.equal(rustam.mineAnswered,true);
  assert.equal(rustam.partnerAnswered,false);
  assert.equal(rustam.answers,null);

  const dianaBefore=await readDailyQuestion('Диана',{...common,now:day1});
  assert.equal(dianaBefore.mineAnswered,false);
  assert.equal(dianaBefore.partnerAnswered,true);
  assert.equal(dianaBefore.answers,null);

  const together=await answerDailyQuestion('Диана','Съездить в Кронштадт.',{...common,now:day1});
  assert.equal(together.revealed,true);
  assert.equal(together.answers['Рустам'].text,'Поехать в Выборг.');
  assert.equal(together.answers['Диана'].text,'Съездить в Кронштадт.');

  const next=await readDailyQuestion('Рустам',{...common,now:day2});
  assert.notEqual(next.question.text,initial.question.text);
  assert.equal(next.mineAnswered,false);
  assert.equal(next.partnerAnswered,false);
  assert.equal(next.answers,null);
  assert.equal(await cache.get('day:'+dateKey(day1)),null,'previous day answers are deleted when next question is generated');
});

test('daily answers stay runtime-only while question history is durable',()=>{
  const strict=fs.readFileSync(path.join(root,'api','strict-runtime-cache.cjs'),'utf8');
  assert.doesNotMatch(strict,/['"]rudi-daily-question-v1['"]/);
  assert.match(strict,/['"]rudi-daily-question-history-v1['"]/);
});

test('answer reward is 0.5 stars with one dedupe key per actor and date',()=>{
  const api=fs.readFileSync(path.join(root,'api','partner-message.js'),'utf8');
  assert.match(api,/awardScoreSafe\(actor,5,/);
  assert.match(api,/score:daily-question:'\+actor\+':'\+view\.date/);
});

test('daily question card is directly after message by default and supports collapse plus drag persistence',()=>{
  const html=fs.readFileSync(path.join(root,'public','index.html'),'utf8');
  const app=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
  const partner=html.indexOf('data-home-tile="partner"');
  const question=html.indexOf('data-home-tile="daily-question"');
  const quick=html.indexOf('data-home-tile="quick-access"');
  assert.ok(partner>=0&&question>partner&&quick>question);
  assert.match(app,/['"]partner['"],['"]daily-question['"]/);
  assert.match(app,/selector:'#dailyQuestionTile',key:'daily-question'/);
  assert.match(app,/function setupDailyQuestionDrag\(\)/);
  assert.match(app,/saveHomeOrder\(\)/);
});


test('daily answer sends partner a Telegram notice without exposing the answer',()=>{
  const api=fs.readFileSync(path.join(root,'api','partner-message.js'),'utf8');
  assert.match(api,/sendDailyQuestionAnswerNotification\(actor,options\)/);
  const start=api.indexOf('function dailyQuestionAnswerNotificationText');
  const end=api.indexOf('async function sendDailyQuestionAnswerNotification',start);
  const helper=api.slice(start,end);
  assert.match(helper,/Сам ответ скрыт/);
  assert.doesNotMatch(helper,/body\.answer|answers\[|\.text/);
});
