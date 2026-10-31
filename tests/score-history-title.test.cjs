const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync(require.resolve('../public/app.js'),'utf8');
const start=app.indexOf('      function scoreHistoryTitle(');
const end=app.indexOf('      function renderScoreModal(',start);
const context=vm.createContext({normalizeGiftGrammar:x=>x,normalizeLegacyMoodText:x=>x});
vm.runInContext(app.slice(start,end),context);
test('meditation history shows duration instead of a legacy session ID',()=>{
 const id='5efa8a98-26bd-40d5-ad6a-dcc1aad972e3';
 assert.equal(context.scoreHistoryTitle({label:'Медитация · 5 мин',detail:'Сеанс '+id}),'Медитация · 5 мин');
 assert.equal(context.scoreHistoryTitle({label:'Медитация · 12 мин',detail:'Сеанс '+id}),'Медитация · 12 мин');
 assert.ok(app.includes('title.textContent=scoreHistoryTitle(item)'));
});
test('other history descriptions and fallback labels remain readable',()=>{
 assert.equal(context.scoreHistoryTitle({label:'Задача',detail:'Оплатить квартиру'}),'Оплатить квартиру');
 assert.equal(context.scoreHistoryTitle({label:'Медитация · 10 мин'}),'Медитация · 10 мин');
 assert.equal(context.scoreHistoryTitle({}),'Звезды');
});
