'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {readDailyQuestionCached}=require('../api/daily-question-store.cjs');

test('home question reads only the existing date snapshot, without running AI',async()=>{
  const now=Date.UTC(2026,9,15,12);
  const keys=[];
  const cache={
    async get(key){
      keys.push(key);
      return {
        date:'2026-10-15',
        question:{id:'dq-2026-10-15',text:'Какое путешествие хотелось бы повторить?',theme:'travel'},
        answers:{'Рустам':null,'Диана':null}
      };
    }
  };
  const result=await readDailyQuestionCached('Рустам',{
    now,dailyQuestionCache:cache,
    generateQuestion:()=>{throw new Error('AI generation must not run on home bootstrap')}
  });
  assert.deepEqual(keys,['day:2026-10-15']);
  assert.equal(result.question.text,'Какое путешествие хотелось бы повторить?');
  assert.equal(result.actor,'Рустам');
});

test('missing question stays absent in home so the dedicated UI can fetch and generate it',async()=>{
  let reads=0;
  const result=await readDailyQuestionCached('Диана',{
    now:Date.UTC(2026,9,15,12),
    dailyQuestionCache:{async get(){reads++;return null}},
    generateQuestion:()=>{throw new Error('AI generation must not run on home bootstrap')}
  });
  assert.equal(result,null);
  assert.equal(reads,1);
});

test('home bootstrap never regenerates previews or daily questions inline',()=>{
  const api=fs.readFileSync('api/partner-message.js','utf8');
  const start=api.indexOf('async function buildHomeBootstrap(');
  const end=api.indexOf('function activityVerb(',start);
  assert.ok(start>0&&end>start);
  const block=api.slice(start,end);
  assert.match(block,/readDailyQuestionCached\(actor, questionOptions\)/);
  assert.match(block,/readFeedSnapshot\(options\)\.catch\(\(\) => null\)/);
  assert.doesNotMatch(block,/refreshFeedFromPreviewIfNeeded\(/);
  assert.doesNotMatch(block,/readDailyQuestion\(actor/);
  // The separate feed and question routes must retain their full live refresh behavior.
  assert.match(api,/const feed = await refreshFeedFromPreviewIfNeeded\(current, options\)/);
  assert.match(api,/const view = await readDailyQuestion\(actor, questionOptions\)/);
});
