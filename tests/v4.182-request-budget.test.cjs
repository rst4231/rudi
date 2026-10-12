'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {createD1StateClient,withD1ReadCoalescing}=require('../api/d1-state-client.cjs');
const history=require('../api/crypto-balance-history.cjs');
const partner=require('../api/partner-message.js');
const reply=(status,value)=>({ok:status>=200&&status<300,status,async text(){return JSON.stringify(value)}});
const opts=fetchImpl=>({baseUrl:'https://worker.example',secret:'test-secret',fetchImpl});

test('scoped concurrent D1 reads deduplicate across clients but not after completion',async()=>{
 let requests=0;
 const fetchImpl=async()=>{requests++;await new Promise(r=>setTimeout(r,5));return reply(200,{ok:true,value:{items:[1]}})};
 const a=createD1StateClient(opts(fetchImpl)),b=createD1StateClient(opts(fetchImpl));
 await withD1ReadCoalescing(async()=>{
  const [x,y]=await Promise.all([a.getRecord('ns','one'),b.getRecord('ns','one')]);
  assert.equal(requests,1);x.value.items.push(2);assert.deepEqual(y.value.items,[1]);
  await a.getRecord('ns','one');assert.equal(requests,2);
 })();
 await Promise.all([
  withD1ReadCoalescing(()=>a.getRecord('ns','one'))(),
  withD1ReadCoalescing(()=>a.getRecord('ns','one'))(),
 ]);
 assert.equal(requests,4,'different request scopes cannot share flights');
});

test('a write invalidates a pending read inside the same request',async()=>{
 let n=1,reads=0,release;
 const fetchImpl=async(url,init)=>{
  if(url.endsWith('/get')){
    const value=n;reads++;
    if(reads===1)await new Promise(r=>{release=r});
    return reply(200,{ok:true,value:{n:value}});
  }
  if(url.endsWith('/set')){n=JSON.parse(init.body).value.n;return reply(200,{ok:true,updatedAt:'now'})}
  throw Error('unexpected');
 };
 const c=createD1StateClient(opts(fetchImpl));
 await withD1ReadCoalescing(async()=>{
  const old=c.getRecord('ns','key');await c.set('ns','key',{n:2});
  const latest=await c.getRecord('ns','key');release();
  assert.equal((await old).value.n,1);assert.equal(latest.value.n,2);assert.equal(reads,2);
 })();
});

test('coalescing never combines different keys and clears rejected flights',async()=>{
 const calls=new Map();
 const fetchImpl=async(_url,init)=>{
  const key=JSON.parse(init.body).key;calls.set(key,(calls.get(key)||0)+1);
  if(key==='error')throw Error('unavailable');
  return reply(200,{ok:true,value:{key}});
 };
 const c=createD1StateClient(opts(fetchImpl));
 await withD1ReadCoalescing(async()=>{
  const result=await Promise.all(['a','b','a'].map(key=>c.getRecord('ns',key)));
  assert.deepEqual(result.map(x=>x.value.key),['a','b','a']);
  assert.equal(calls.get('a'),1);assert.equal(calls.get('b'),1);
  const errors=await Promise.allSettled([c.getRecord('ns','error'),c.getRecord('ns','error')]);
  assert.equal(errors[0].status,'rejected');assert.equal(errors[1].status,'rejected');
  assert.equal(calls.get('error'),1);
  await assert.rejects(()=>c.getRecord('ns','error'),/unavailable/);assert.equal(calls.get('error'),2);
 })();
});

test('recipient comparison skips existing IDs but permits repairs and reassignment',()=>{
 const same={'Рустам':123,'Диана':456};
 assert.equal(partner.recipientsNeedUpdate(same,{...same}),false);
 assert.equal(partner.recipientsNeedUpdate(same,{'Рустам':123,'Диана':789}),true);
 assert.equal(partner.recipientsNeedUpdate(null,same),true);
 assert.equal(partner.recipientsNeedUpdate({'Рустам':123},same),true);
 const source=fs.readFileSync(path.join(__dirname,'../api/partner-message.js'),'utf8');
 for(const [start,end] of [["if (action === 'app-bootstrap')","if (action === 'state-backup-recovery')"],["if (action === 'state-backup')","if (action === 'score')"]]){
  const block=source.slice(source.indexOf(start),source.indexOf(end));
  assert.match(block,/if \(recipientsChanged && (?:correctedRecipients|recipients)\?\.\['Рустам'\]/);
  assert.match(block,/else if \(recipientsChanged && user\?\.id\)/);
 }
});

test('crypto history saves changed prices and new five-minute slots, not identical samples',async()=>{
 let writes=0,reads=0;const rows=new Map();
 const client={
  async getRecord(ns,key){reads++;const row=rows.get(ns+':'+key);return row?{value:structuredClone(row)}:null},
  async setRecord(row){writes++;rows.set(row.namespace+':'+row.key,structuredClone(row.value))}
 };
 const t=Date.parse('2026-10-12T09:00:00Z');
 const save=(n,offset,partial=false)=>history.capture('wallet',n,{client,partial,at:t+offset});
 await save(500,0);await save(500,60000);await save(500,120000);assert.equal(writes,1);
 await save(500,180000,true);await save(500,200000,true);assert.equal(writes,2);
 await save(501,220000,true);assert.equal(writes,3);
 await save(501,300000,true);await save(501,360000,true);assert.equal(writes,4);
 const state=rows.get(history.NS+':wallet');
 assert.equal(state.intraday.length,2);assert.equal(state.points.length,1);
 assert.equal(state.points[0].usd,501);assert.equal(reads,8);
});

test('crypto history retains next-day observations even for unchanged balances',async()=>{
 let writes=0;const rows=new Map();
 const client={
  async getRecord(ns,key){const v=rows.get(ns+':'+key);return v?{value:structuredClone(v)}:null},
  async setRecord(row){writes++;rows.set(row.namespace+':'+row.key,structuredClone(row.value))}
 };
 await history.capture('w2',100,{client,at:Date.parse('2026-10-12T20:59:00Z')});
 await history.capture('w2',100,{client,at:Date.parse('2026-10-12T21:01:00Z')});
 assert.equal(writes,2);assert.equal(rows.get(history.NS+':w2').points.length,2);
});
