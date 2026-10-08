const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync('public/profile-supplements.js','utf8');
const start=source.indexOf('function renderHabitYesterdayQuote(){');
const end=source.indexOf('function applyHabitView(',start);
assert.ok(start>=0&&end>start,'renderHabitYesterdayQuote must exist');
const block=source.slice(start,end);
const render=new Function('habitYesterdayQuote','habitState','habitDateKey','habitParseDateKey','habitHistory','actor',block+';renderHabitYesterdayQuote();');
function quote({done,total,actor='Рустам',missing=false}={}){
  const node={hidden:true,textContent:''};
  const habits=Array.from({length:total},(_,i)=>({id:'habit-'+i}));
  const statuses=Object.fromEntries(habits.slice(0,done).map(h=>[h.id,'done']));
  const history=missing?{}:{'2026-10-07':{habits,statuses}};
  render(node,{today:'2026-10-08'},date=>date.toISOString().slice(0,10),value=>new Date(value+'T12:00:00Z'),history,actor);
  assert.equal(node.hidden,false);
  return node.textContent;
}
test('full habit completion is praised',()=>{
  assert.match(quote({done:3,total:3}),/^Вчера выполнил 3 из 3 привычек\. Отличная работа!/);
});
test('partial completion gets a positive reinforcement',()=>{
  assert.match(quote({done:2,total:3,actor:'Диана'}),/^Вчера выполнила 2 из 3 привычек\. Хорошая работа!/);
});
test('zero completion is encouraged without insincere praise',()=>{
  assert.match(quote({done:0,total:3}),/Сегодня новый день\. Начни с малого/);
});
test('empty history and no habits display appropriate encouraging fallback',()=>{
  assert.match(quote({missing:true,total:3}),/Вчера данных по привычкам пока нет/);
  assert.match(quote({done:0,total:0}),/Сегодня можно начать с одной небольшой привычки/);
});
