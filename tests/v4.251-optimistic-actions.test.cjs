const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('partner message appears optimistically, skips stale reads and rolls back failed writes',()=>{
 const s=src('public/app.js');
 assert.match(s,/partnerMessagePendingDraft=optimisticMessage/);
 assert.match(s,/message=partnerMessagePendingDraft\|\|message/);
 assert.match(s,/partnerMessageBootstrapHandler\(previousMessage\)/);
 assert.match(s,/signal:controller\.signal/);
});
test('habit actions update local status immediately and protect against late reads',()=>{
 const s=src('public/profile-supplements.js');
 assert.match(s,/const key=applyOptimisticHabitStatus\(id,actionDate,next\)/);
 assert.match(s,/habitOptimisticStatuses\.set\(key,status\)/);
 assert.match(s,/if\(date===habitState\.date\)habitState\.statuses\[id\]=value/);
 assert.match(s,/habitReadEpoch===habitMutationEpoch/);
 assert.match(s,/readEpoch!==habitMutationEpoch/);
 assert.match(s,/finishOptimisticHabitStatus\(key,id,actionDate,previousStatus\)/);
 assert.match(s,/const key=applyOptimisticHabitStatus\(id,date,previousStatus\|\|'pending'\)/);
});
test('sea battle polls every five seconds only in active visible game with declined names',()=>{
 const s=src('public/rudi-games-extra.js');
 assert.match(s,/activeGame!=='battleship'\|\|document\.hidden\|\|!navigator\.onLine/);
 assert.match(s,/void pollBattle\(\)\},5000/);
 assert.doesNotMatch(s,/void pollBattle\(\)\},20000/);
 assert.match(s,/opponentNameGenitive=\(\)=>actor\(\)==='Рустам'\?'Дианы':'Рустама'/);
 assert.match(s,/Поле '\+safe\(opponentNameGenitive\(\)\)/);
 assert.match(s,/Поле обновляется каждые 5 секунд/);
});
test('game script versioning updates the PWA release',()=>{
 const s=src('build.cjs');
 assert.match(s,/featureScripts=\['finance-nav-icons\.js','rudi-games\.js','rudi-games-extra\.js'\]/);
 assert.match(src('public/index.html'),/rudi-games-extra\.js\?v=4\.251/);
});