const {test}=require('node:test'),assert=require('node:assert/strict');
const tasks=require('../api/shared-native-tasks.cjs'),score=require('../api/score-store.cjs');
const policy=require('../api/task-overdue-stars.cjs');
async function fixture(task={}){
 const rows=new Map(),k=(n,id)=>n+'|'+id;
 const client={async getRecord(n,id){return rows.has(k(n,id))?{key:id,value:structuredClone(rows.get(k(n,id)))}:null},async set(n,id,v){rows.set(k(n,id),structuredClone(v));return true},async setIfAbsent(n,id,v){if(rows.has(k(n,id)))return false;await this.set(n,id,v);return true},async remove(n,id){rows.delete(k(n,id))},async list(n){return [...rows].filter(([id])=>id.startsWith(n+'|')).map(([id,value])=>({key:id.slice(n.length+1),value:structuredClone(value)}))}};
 let value=null;const scoreCache={async get(){return structuredClone(value)},async set(_k,v){value=structuredClone(v);return true}};
 const options={client,scoreCache,now:Date.parse('2026-11-03T21:01:00Z')};
 await client.set(tasks.STATE_NS,'ready',{complete:true});
 const t=tasks.normalizeTask({title:'Дело',date:'2026-11-03',time:'20:00',responsible:'Рустам',...task});
 await client.set(tasks.TASK_NS,t.id,t);
 return {options,client,t,balance:async()=> (await score.readScoreState(options)).balances};
}
test('one overdue rewarded task costs one star, once, even on concurrent checks',async()=>{const f=await fixture();await Promise.all([policy.finalize(f.options),policy.finalize(f.options)]);await policy.finalize(f.options);assert.equal((await f.balance())['Рустам'],-10);assert.equal((await f.balance())['Диана'],0)});
test('a task without an assignee penalizes both reward recipients',async()=>{const f=await fixture({responsible:''});await policy.finalize(f.options);assert.deepEqual(await f.balance(),{'Рустам':-10,'Диана':-10})});
test('deadline means Moscow midnight, not task time',async()=>{const f=await fixture();await policy.finalize({...f.options,now:Date.parse('2026-11-03T20:59:59Z')});assert.equal((await f.balance())['Рустам'],0)});
test('completion before midnight is exempt, including delayed checking',async()=>{const f=await fixture();await f.client.set(tasks.DONE_NS+'2026-11',f.t.id,{at:'2026-11-03T20:59:00Z',reopened:false});await policy.finalize(f.options);assert.equal((await f.balance())['Рустам'],0)});
test('completion after midnight still incurs the missed deadline',async()=>{const f=await fixture();await f.client.set(tasks.DONE_NS+'2026-11',f.t.id,{at:'2026-11-03T21:00:30Z',reopened:false});await policy.finalize(f.options);assert.equal((await f.balance())['Рустам'],-10)});
test('moving before midnight exempts the original date',async()=>{const f=await fixture();await tasks.modify('move',{taskId:f.t.id,date:'2026-11-04'},'Рустам',{...f.options,now:Date.parse('2026-11-03T20:00:00Z')});await policy.finalize(f.options);assert.equal((await f.balance())['Рустам'],0)});
test('moving after midnight cannot erase a missed deadline before cron runs',async()=>{const f=await fixture();await tasks.modify('move',{taskId:f.t.id,date:'2026-11-04'},'Рустам',f.options);await policy.finalize(f.options);assert.equal((await f.balance())['Рустам'],-10)});
test('moving after a penalty does not refund or repeat it',async()=>{const f=await fixture();await policy.finalize(f.options);await tasks.modify('move',{taskId:f.t.id,date:'2026-11-05'},'Рустам',f.options);await policy.finalize(f.options);assert.equal((await f.balance())['Рустам'],-10)});
test('old pre-policy dates are not charged retroactively',async()=>{const f=await fixture({date:'2026-11-02'});await policy.finalize(f.options);assert.equal((await f.balance())['Рустам'],0)});
test('recurring tasks are charged per missed occurrence, not per cron run',async()=>{const f=await fixture({repeat:'daily'});await policy.finalize({...f.options,now:Date.parse('2026-11-05T21:01:00Z')});assert.equal((await f.balance())['Рустам'],-30)});
test('timely completed recurring occurrences are exempt independently',async()=>{const f=await fixture({repeat:'daily'});await f.client.set(tasks.DONE_NS+'2026-11',f.t.id+'__2026-11-03',{at:'2026-11-03T19:00:00Z',reopened:false});await policy.finalize({...f.options,now:Date.parse('2026-11-04T21:01:00Z')});assert.equal((await f.balance())['Рустам'],-10)});
test('date changes through the editor also preserve already missed deadlines',async()=>{const f=await fixture();await tasks.modify('update',{taskId:f.t.id,date:'2026-11-04'},'Рустам',f.options);await policy.finalize(f.options);assert.equal((await f.balance())['Рустам'],-10)});
test('retry after the ledger write fails cannot deduct a second star',async()=>{const f=await fixture(),set=f.client.set.bind(f.client);let fail=true;f.client.set=async(n,k,v)=>{if(k.startsWith('charged:')&&fail){fail=false;throw Error('temporary-storage-failure')}return set(n,k,v)};await assert.rejects(policy.finalize(f.options),/storage/);await policy.finalize(f.options);assert.equal((await f.balance())['Рустам'],-10)});
for(const authorized of [false,true])test('scheduled endpoint '+(authorized?'charges missed tasks':'rejects unauthenticated checks without charging'),async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),f=await fixture(),moduleFixture={exports:{}};
 const deps={'./cron-auth.cjs':{isCronRequestAuthorized:()=>authorized},'./github-actions-oidc.cjs':{isGitHubActionsRequestAuthorized:async()=>false},'./lulu-toilet-alert.cjs':require('../api/lulu-toilet-alert.cjs'),'./web-push.cjs':{sendPushNotification:async()=>{throw Error('unexpected-push')}},'./fasting-store.cjs':{readFastingState:async()=>({active:null})},'./task-overdue-stars.cjs':{finalize:()=>policy.finalize(f.options)}};
 vm.runInNewContext(fs.readFileSync('api/lulu-toilet-cron.js','utf8'),{module:moduleFixture,require:id=>{assert.ok(deps[id],id);return deps[id]},Date,console:{log(){},error(){}}});
 let status;await moduleFixture.exports({method:'GET'},{status(n){status=n;return this},json(){return this}});
 assert.equal(status,authorized?200:401);assert.equal((await f.balance())['Рустам'],authorized?-10:0);
});
test('legacy completion with unknown timestamp is not punished without evidence of lateness',async()=>{const f=await fixture();await f.client.set(tasks.DONE_NS+'2026-11',f.t.id,{reopened:false});await policy.finalize(f.options);assert.equal((await f.balance())['Рустам'],0)});
