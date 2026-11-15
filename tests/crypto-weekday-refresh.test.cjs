const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function walletModule({allowed=false}={}){
 let writes=0,preferenceReads=0,providerReads=0,balanceWrites=0,historyWrites=0;
 const client={getRecord:async()=>({value:{connections:{a:{provider:'trust',address:'public-address',chain:'ethereum',balanceUsd:11}}}}),setRecord:async()=>{writes++}};
 const module={exports:{}};
 const deps={'./crypto-preferences.cjs':{read:async()=>{preferenceReads++;return {automaticAllowed:allowed}}},'./rudi-state-client.cjs':{createRudiStateClient:()=>client},'./finance-store.cjs':{readFinanceState:async()=>({wallets:{Рустам:[{id:'a',currency:'USD'}]}}),syncLinkedWalletBalance:async()=>{balanceWrites++}},'./crypto-trust-chains.cjs':{snapshot:async()=>{providerReads++;return {balanceUsd:12}}},'./crypto-balance-history.cjs':{capture:async()=>{historyWrites++}}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../api/crypto-wallets.cjs'),'utf8'),{module,exports:module.exports,require:id=>id==='node:crypto'?require(id):deps[id]||{},process,Buffer,Date,Intl,console,AbortSignal});
 return {api:module.exports,counts:()=>({writes,preferenceReads,providerReads,balanceWrites,historyWrites})};
}
test('automatic weekend refresh leaves balances and histories untouched',async()=>{const m=walletModule();const rows=await m.api.refresh('Рустам');assert.equal(rows[0].balanceUsd,11);assert.deepEqual(m.counts(),{writes:0,preferenceReads:1,providerReads:0,balanceWrites:0,historyWrites:0})});
test('explicit manual refresh bypasses weekday pause and updates provider balance',async()=>{const m=walletModule();const rows=await m.api.refresh('Рустам',{force:true});assert.equal(rows[0].balanceUsd,12);assert.deepEqual(m.counts(),{writes:1,preferenceReads:0,providerReads:1,balanceWrites:1,historyWrites:2})});
test('weekday reactivation resumes provider synchronization and snapshots',async()=>{const m=walletModule({allowed:true});const rows=await m.api.refresh('Рустам');assert.equal(rows[0].balanceUsd,12);assert.deepEqual(m.counts(),{writes:1,preferenceReads:1,providerReads:1,balanceWrites:1,historyWrites:2})});
test('another actor cannot read or refresh the owner crypto wallets',async()=>{const m=walletModule();await assert.rejects(m.api.refresh('Диана'),/crypto-owner-only/);assert.equal(m.counts().preferenceReads,0)});
