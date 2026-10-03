const test=require('node:test');
const assert=require('node:assert/strict');
const {createMigratingStateStore,createBlobJsonStore}=require('../api/vercel-persistent-json.cjs');

test('migrates full legacy state into blob once, then reads blob without legacy',async()=>{
  let blob=null,legacyReads=0;
  const blobStore={
    read:async()=>blob,
    write:async(_key,value)=>{blob=structuredClone(value);return value;}
  };
  const legacy={history:{'2026-09-30':['a']},items:[{id:'a'}]};
  const store=createMigratingStateStore({
    key:'habits/rustam',
    blobStore,
    legacyRead:async()=>{legacyReads++;return structuredClone(legacy);}
  });
  assert.deepEqual(await store.read(),legacy);
  assert.deepEqual(blob,legacy);
  assert.equal(legacyReads,1);
  assert.deepEqual(await store.read(),legacy);
  assert.equal(legacyReads,1);
});

test('writes only to blob after blob storage is active',async()=>{
  let blob={version:1},legacyWrites=0;
  const blobStore={
    read:async()=>blob,
    write:async(_key,value)=>{blob=structuredClone(value);return value;}
  };
  const store=createMigratingStateStore({
    key:'supplements/rustam',
    blobStore,
    legacyRead:async()=>null,
    legacyWrite:async()=>{legacyWrites++;}
  });
  await store.write({version:2,history:[1,2,3]});
  assert.deepEqual(blob,{version:2,history:[1,2,3]});
  assert.equal(legacyWrites,0);
});

test('blob json store preserves the complete JSON document without TTL',async()=>{
  const calls=[];
  const client={
    get:async()=>({
      statusCode:200,
      stream:new ReadableStream({start(controller){
        controller.enqueue(new TextEncoder().encode(JSON.stringify({ok:true,history:[1,2]})));
        controller.close();
      }})
    }),
    put:async(pathname,body,options)=>{calls.push({pathname,body,options});return{pathname};}
  };
  const cache={get:async()=>null,set:async()=>true};
  const store=createBlobJsonStore({
    prefix:'rudi-state-v1',
    client,
    cache,
    env:{BLOB_READ_WRITE_TOKEN:'test-token'}
  });
  assert.deepEqual(await store.read('habits/rustam'),{ok:true,history:[1,2]});
  await store.write('habits/rustam',{ok:true,history:[1,2,3]});
  assert.equal(calls[0].pathname,'rudi-state-v1/habits/rustam.json');
  assert.equal(calls[0].options.access,'private');
  assert.equal(calls[0].options.allowOverwrite,true);
  assert.equal(Object.prototype.hasOwnProperty.call(calls[0].options,'ttl'),false);
});
