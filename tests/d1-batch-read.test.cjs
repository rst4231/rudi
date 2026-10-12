const test=require('node:test');
const assert=require('node:assert/strict');
const {createD1StateClient,withD1ReadCoalescing}=require('../api/d1-state-client.cjs');

const response=(status,data)=>({ok:status>=200&&status<300,status,async text(){return JSON.stringify(data)}});
const createClient=(fetchImpl,extra={})=>createD1StateClient({baseUrl:'https://worker.example',secret:'secret',fetchImpl,...extra});

test('concurrent reads from distinct stores are grouped into one Cloudflare call',async()=>{
  const calls=[];
  const fetchImpl=async(url,init)=>{
    const body=JSON.parse(init.body);
    calls.push({url,body});
    if(url.endsWith('/batch-get'))return response(200,{ok:true,items:body.keys.map((key,i)=>({ok:true,value:{id:key.key,index:i},updatedAt:'2026-10-12',tags:['test']}))});
    throw Error('unexpected '+url);
  };
  const execute=withD1ReadCoalescing(async()=>{
    const a=createClient(fetchImpl);
    const b=createClient(fetchImpl);
    return Promise.all([a.getRecord('n','a'),b.getRecord('n','b'),a.getRecord('n','a')]);
  });
  const data=await execute();
  assert.equal(calls.length,1);
  assert.deepEqual(calls[0].body.keys,[{namespace:'n',key:'a'},{namespace:'n',key:'b'}]);
  assert.deepEqual(data.map(x=>x.value.id),['a','b','a']);
  assert.notStrictEqual(data[0],data[2]);
});

test('every HTTP invocation reads fresh data and never retains settled results',async()=>{
  let version=0;
  const fetchImpl=async(url,init)=>{
    assert.ok(url.endsWith('/batch-get'));
    const body=JSON.parse(init.body);
    return response(200,{ok:true,items:body.keys.map(()=>({ok:true,value:{version:++version}}))});
  };
  const client=createClient(fetchImpl);
  const execute=withD1ReadCoalescing(async()=>[await client.getRecord('n','a'),await client.getRecord('n','a')]);
  assert.deepEqual((await execute()).map(x=>x.value.version),[1,2]);
  assert.deepEqual((await execute()).map(x=>x.value.version),[3,4]);
});

test('legacy Cloudflare Worker 404 falls back to individual reads',async()=>{
  const calls=[];
  const fetchImpl=async(url,init)=>{
    calls.push(url);
    if(url.endsWith('/batch-get'))return response(404,{ok:false,error:'not-found'});
    return response(200,{ok:true,value:{key:JSON.parse(init.body).key},tags:[]});
  };
  const execute=withD1ReadCoalescing(async()=>{
    const client=createClient(fetchImpl);
    return Promise.all([client.getRecord('n','one'),client.getRecord('n','two')]);
  });
  const data=await execute();
  assert.equal(calls.filter(x=>x.endsWith('/batch-get')).length,1);
  assert.equal(calls.filter(x=>x.endsWith('/get')).length,2);
  assert.deepEqual(data.map(x=>x.value.key),['one','two']);
});

test('batching can be disabled without changing reads or writes',async()=>{
  const calls=[];
  const client=createClient(async(url,init)=>{
    calls.push(url);
    return response(200,{ok:true,value:{key:JSON.parse(init.body).key},tags:[]});
  },{env:{RUDI_D1_BATCH_READS:'0'}});
  await withD1ReadCoalescing(async()=>Promise.all([client.getRecord('n','a'),client.getRecord('n','b')]))();
  assert.equal(calls.length,2);
  assert.ok(calls.every(x=>x.endsWith('/get')));
});

test('writes stay unbatched and later reads see the new value',async()=>{
  let value='before';
  const calls=[];
  const fetchImpl=async(url,init)=>{
    calls.push(url);
    if(url.endsWith('/set')){value=JSON.parse(init.body).value;return response(200,{ok:true,updatedAt:'now'});}
    if(url.endsWith('/batch-get'))return response(200,{ok:true,items:[{ok:true,value}]});
    throw Error('unexpected '+url);
  };
  const client=createClient(fetchImpl);
  await withD1ReadCoalescing(async()=>{
    assert.equal((await client.getRecord('n','x')).value,'before');
    await client.set('n','x','after');
    assert.equal((await client.getRecord('n','x')).value,'after');
  })();
  assert.deepEqual(calls.map(x=>new URL(x).pathname),['/batch-get','/set','/batch-get']);
});
