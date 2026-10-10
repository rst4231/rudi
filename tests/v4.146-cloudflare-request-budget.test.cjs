const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('reading a batch of reactions reads the shared state only once', async()=>{
  const mod=require('../api/reactions-store.cjs');
  const targets=Array.from({length:12},(_,i)=>({type:'feed',key:'event:'+i}));
  const entries=Object.fromEntries(targets.map(target=>[
    target.type+':'+target.key,{...target,likedBy:['Рустам'],updatedAt:'2026-10-09T12:00:00Z'}
  ]));
  const reads=[];
  const cache={
    async get(key){reads.push(key);return key==='state'?{initialized:true,version:100,entries}:null},
    async set(){throw Error('no writes should occur')},
  };
  const results=await mod.readReactions(targets,{reactionsCache:cache});
  assert.equal(results.length,12);
  assert.equal(reads.filter(key=>key==='state').length,1);
  assert.equal(reads.length,1);
  assert.ok(results.every(value=>value.likedBy.includes('Рустам')));
});

test('restoring an unchanged reaction snapshot never rewrites existing state or legacy keys',async()=>{
  const mod=require('../api/reactions-store.cjs');
  const target={type:'feed',key:'event:existing'};
  const snapshot={initialized:true,version:100,entries:{
    'feed:event:existing':{...target,likedBy:['Диана'],updatedAt:'2026-10-09T12:00:00Z'}
  }};
  const values=new Map([['state',structuredClone(snapshot)]]);
  const writes=[];
  const cache={
    async get(key){return values.has(key)?structuredClone(values.get(key)):null},
    async set(key,value){writes.push(key);values.set(key,structuredClone(value))},
  };
  await mod.restoreReactionState(snapshot,{reactionsCache:cache});
  assert.deepEqual(writes,[]);
  assert.deepEqual((await mod.readReaction(target,{reactionsCache:cache})).likedBy,['Диана']);
});

test('recovery restores missing and disjoint reactions using only the shared state key',async()=>{
  const mod=require('../api/reactions-store.cjs');
  const older={type:'feed',key:'event:a'};
  const other={type:'photo-memory',key:'photo:b'};
  const snapshot={initialized:true,version:200,entries:{
    'feed:event:a':{...older,likedBy:['Рустам'],updatedAt:'2026-10-09T12:00:00Z'},
    'photo-memory:photo:b':{...other,likedBy:['Диана'],updatedAt:'2026-10-09T12:05:00Z'},
  }};
  const saved=new Map();
  const writes=[];
  const cache={
    async get(key){return saved.has(key)?structuredClone(saved.get(key)):null},
    async set(key,value){writes.push(key);saved.set(key,structuredClone(value))},
  };
  await mod.restoreReactionState(snapshot,{reactionsCache:cache});
  assert.deepEqual(writes,['state']);
  assert.deepEqual((await mod.readReactions([older,other],{reactionsCache:cache})).map(x=>x.count),[1,1]);
  await mod.restoreReactionState(snapshot,{reactionsCache:cache});
  assert.deepEqual(writes,['state']);
});


test('an incremental product backup includes the latest change without rereading unrelated state',async()=>{
  const now=Date.parse('2026-10-10T09:00:00Z');
  const fullSnapshotAt=new Date(now-1000).toISOString();
  const previous={
    version:2,createdAt:fullSnapshotAt,fullSnapshotAt,
    products:{initialized:true,version:100,items:[{id:'old',text:'Milk'}],history:[]},
    wishlist:{initialized:true,version:200,items:[{id:'saved',text:'Keep'}]},
    recipients:{'Рустам':101,'Диана':202},
  };
  const products={initialized:true,version:101,items:[],history:[]};
  const options={botToken:'123456:TEST_SECRET',now,previousSnapshot:previous,snapshotPatch:{products}};
  assert.equal(backup.canIncrementalStateBackup(options),true);
  const token=await backup.createStateBackup(options);
  const restored=backup.openSnapshot(token,{botToken:options.botToken});
  assert.deepEqual(restored.products,products,'an empty product list must remain empty');
  assert.deepEqual(restored.wishlist,previous.wishlist,'unrelated data must survive');
  assert.deepEqual(restored.recipients,previous.recipients);
  assert.equal(restored.fullSnapshotAt,fullSnapshotAt,'partial saves never extend the full refresh deadline');
  assert.equal(restored.createdAt,new Date(now).toISOString());
  assert.deepEqual(previous.products.items,[{id:'old',text:'Milk'}],'previous snapshot must not be mutated');
});

test('partial backups force a full refresh on stale or legacy snapshots',()=>{
  const now=Date.parse('2026-10-10T09:00:00Z');
  const updated={initialized:true,version:101,items:[]};
  const base={version:2,createdAt:new Date(now).toISOString(),
    fullSnapshotAt:new Date(now-61000).toISOString(),
    products:{initialized:true,version:100,items:[{id:'old'}]}};
  assert.equal(backup.canIncrementalStateBackup({now,previousSnapshot:base,snapshotPatch:{products:updated}}),false);
  assert.equal(backup.canIncrementalStateBackup({now,previousSnapshot:{...base,fullSnapshotAt:''},snapshotPatch:{products:updated}}),false);
  assert.equal(backup.canIncrementalStateBackup({now,previousSnapshot:{...base,fullSnapshotAt:new Date(now).toISOString()},snapshotPatch:{products:{...updated,version:99}}}),false);
  assert.equal(backup.canIncrementalStateBackup({now,previousSnapshot:{...base,fullSnapshotAt:new Date(now).toISOString()},snapshotPatch:{unknown:updated}}),false);
});

test('reaction API never unconditionally restores the encrypted snapshot on a list request',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','api','partner-message.js'),'utf8');
  const start=source.indexOf("if (action === 'reactions')");
  const stop=source.indexOf("if (action === 'mood')",start);
  const block=source.slice(start,stop);
  assert.ok(start>=0&&stop>start);
  assert.match(block,/JSON\.stringify\(live\.entries\)!==JSON\.stringify\(merged\.entries\)/);
  assert.doesNotMatch(block,/await restoreReactionState\(previousSnapshot\.reactions, options\)\.catch/);
  assert.match(block,/await readReactions\(body\.targets, reactionState\?/);
});

test('frequent product operations use an incremental backup patch',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','api','partner-message.js'),'utf8');
  const start=source.indexOf("if (action === 'products')");
  const stop=source.indexOf("if (action === ",start+3);
  const block=source.slice(start,stop);
  assert.ok(start>=0&&stop>start);
  const calls=block.match(/refreshBackupToken\(previousSnapshot,options,\{products:state\}\)/g)||[];
  assert.equal(calls.length,8);
});

test('shared TickTick completion refreshes only the changed backup slices when possible',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','api','partner-message.js'),'utf8');
  const start=source.indexOf("if (action === 'task-complete')");
  const stop=source.indexOf("if (action === ",start+3);
  const block=source.slice(start,stop);
  assert.ok(start>=0&&stop>start);
  assert.match(block,/const backupPatch=scoreState&&/);
  assert.match(block,/refreshBackupToken\(previousSnapshot, options, backupPatch\)/);
});
