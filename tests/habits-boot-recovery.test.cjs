'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {readHabits,viewHabits}=require('../api/habit-tracker-store.cjs');
test('habit read does not write missing daily bonus and still displays first three',async()=>{
  let reads=0,writes=0;
  const names=['Читать','Гулять','Спорт','Музыка'];
  const habits=names.map((name,i)=>({id:'habit-abc1234'+i,name,purpose:'Личный план',createdAt:'2026-10-01T10:00:00Z'}));
  const stateStore={read:async()=>{reads++;return {initialized:true,actor:'Рустам',habits,completions:{},failures:{},bonusIdsByDate:{}}},write:async()=>{writes++;throw Error('list-must-not-write')}};
  const now=Date.parse('2026-10-15T07:00:00Z'),state=await readHabits('Рустам',{stateStore,now});
  const result=viewHabits(state,{date:'2026-10-15',now});
  assert.equal(result.total,4);
  assert.deepEqual(result.bonusIds,habits.slice(0,3).map(x=>x.id));
  assert.equal(reads,1);assert.equal(writes,0);
});
test('list endpoint avoids daily write and still preserves mutation paths',()=>{
  const src=fs.readFileSync('api/habits.js','utf8');
  assert.match(src,/if\(operation==='list'\)\{\s*state=await readHabits\(actor,\{now\}\)/);
  assert.match(src,/state=await ensureHabitDay\(actor,today,\{now\}\)/);
  assert.match(src,/reconcileHabitScore\(actor,habit/);
});
test('iPhone loader is isolated, has true deadlines and does not share actor cache',()=>{
  const src=fs.readFileSync('public/profile-supplements.js','utf8');
  assert.match(src,/Promise\.race\(\[task\(ctrl\?\.signal\),deadline\]\)/);
  assert.match(src,/const habitsJob=Promise\.resolve\(\)\.then\(\(\)=>habitRequest/);
  assert.match(src,/const supplementsJob=Promise\.resolve\(\)\.then\(\(\)=>request/);
  assert.doesNotMatch(src,/const \[supplementsResult,habitsResult\]=await Promise\.allSettled/);
  assert.match(src,/function showHabitLoadFailure\(/);
  assert.match(src,/Повторить загрузку/);
  assert.match(src,/formatToParts\(date\)/);
  assert.match(src,/String\(actor\|\|''\)\+'\|'/);
});
