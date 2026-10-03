const test=require('node:test');
const assert=require('node:assert/strict');
const {polishText}=require('../api/messenger-correction-ai.cjs');

test('messenger correction capitalizes the first word',()=>{
  assert.equal(polishText('привет, как дела?'),'Привет, как дела?');
});

test('messenger correction removes spaces before punctuation and restores spacing after it',()=>{
  assert.equal(polishText('привет ,как дела ? всё хорошо !'),'Привет, как дела? всё хорошо!');
});

test('messenger correction keeps URLs intact',()=>{
  assert.equal(
    polishText('смотри https://example.com/a,b?x=1 и скажи , что думаешь'),
    'Смотри https://example.com/a,b?x=1 и скажи, что думаешь'
  );
});
