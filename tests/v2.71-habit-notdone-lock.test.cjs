const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const js=fs.readFileSync(path.join(__dirname,'..','public','profile-supplements.js'),'utf8');

test('v2.71 locks Done after Not done habit status',()=>{
  assert.match(js,/const doneLocked=isNotDone\|\|\(habitSelectedDate===habitState\.today&&!habitState\.canCompleteToday&&!isDone\)/);
  assert.match(js,/yes\.disabled=doneLocked/);
  assert.match(js,/После «Не выполнено» изменить на «Выполнено» нельзя/);
  assert.match(js,/showHabitUndo\(\{id,date:actionDate,previousStatus,nextStatus:next\}\)/);
});
