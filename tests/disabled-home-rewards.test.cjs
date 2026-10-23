const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const read=name=>fs.readFileSync(require.resolve('../'+name),'utf8');
const app=read('public/app.js');
test('rules omit rewards for messages and the first expense',()=>{
 const rules=app.slice(app.indexOf("dialog.id='scoreRulesDialog'"),app.indexOf('function closeScoreRulesDialog'));
 assert.ok(rules.includes('Медитация'));
 assert.doesNotMatch(rules,/Написал послание|Записал первый расход/);
});
for(const actor of ['Рустам','Диана']){
 test('sending a message saves it and records activity without awarding stars: '+actor,async()=>{
  const api=read('api/partner-message.js');
  const end=api.indexOf('    const notificationTask = sendPartnerMessageNotification');
  const start=api.lastIndexOf('    const body = req.body',end);
  const activities=[];
  const context=vm.createContext({
   req:{body:{text:'Люблю тебя'}},options:{now:1},
   authorizeRequest:()=>({actor,authorName:actor}),backupSnapshotFromToken:()=>null,
   normalizeMessageText:x=>x,crypto:{randomUUID:()=> 'test-message-id'},
   writePartnerMessage:async x=>x,recordActivity:async x=>activities.push(x),
   activityVerb:(_actor,male,female)=>actor==='Диана'?female:male,
   moscowDateKey:()=> '2026-10-23',
   awardScoreSafe:()=>assert.fail('Message must not award stars'),
  });
  const message=await vm.runInContext('(async()=>{'+api.slice(start,end)+'return message})()',context);
  assert.equal(message.text,'Люблю тебя');assert.equal(message.authorName,actor);
  assert.equal(activities.length,1);assert.equal(activities[0].type,'partner-message');
 });
 for(const id of ['', 'existing-expense'])test('saving an expense does not award stars: '+actor+' '+(id?'edited':'new'),async()=>{
  const api=read('api/finances.js');
  const start=api.indexOf("    if (operation === 'save-expense')");
  const end=api.indexOf("    if (operation === 'import-expenses')",start);
  let saved=0,response;
  const context=vm.createContext({
   actor,operation:'save-expense',body:{id,categoryId:'food',amount:300},
   readFinanceState:async()=>({}),viewState:()=>({categories:[{id:'food',currency:'RUB'}],wallets:[]}),
   resolveExpenseConversion:()=>({sourceAmount:300,amount:300,rubAmount:300,exchangeRate:1}),
   savePersonalExpense:async(who,data)=>{saved++;assert.equal(who,actor);assert.equal(data.amount,300);return {personalExpenses:[{actor,id:id||'new-id'}]};},
   awardFirstDailyExpense:()=>assert.fail('Expense must not award stars'),
   res:{status(code){assert.equal(code,200);return this},json(data){response=data;return data}},
  });
  await vm.runInContext('(async()=>{'+api.slice(start,end)+'})()',context);
  assert.equal(saved,1);assert.equal(response.ok,true);assert.equal(response.score,undefined);
 });
}
