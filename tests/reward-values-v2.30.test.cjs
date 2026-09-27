const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const api=fs.readFileSync(path.join(root,'api','partner-message.js'),'utf8');
const html=fs.readFileSync(path.join(root,'public','index.html'),'utf8');

test('daily question reward is 0.1 star',()=>{
  assert.match(api,/awardScoreSafe\(actor,1,\{\s*label:'Вопрос дня'/);
  assert.doesNotMatch(api,/awardScoreSafe\(actor,3,\{\s*label:'Вопрос дня'/);
  assert.match(html,/\+0,1 ⭐ за ответ · один раз в день/);
});

test('partner message reward is 0.1 star',()=>{
  assert.match(api,/awardScoreSafe\(actor,1,\{\s*label:'Послание'/);
  assert.doesNotMatch(api,/awardScoreSafe\(actor,3,\{\s*label:'Послание'/);
});
