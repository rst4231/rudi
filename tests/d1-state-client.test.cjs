const test=require('node:test');
const assert=require('node:assert/strict');
const {createD1StateClient,expiresAtFromOptions}=require('../api/d1-state-client.cjs');

function response(status,payload){
  return{
    ok:status>=200&&status<300,
    status,
    async text(){return payload===undefined?'':JSON.stringify(payload);}
  };
}

test('D1 client uses server-side bearer auth and preserves record fields',async()=>{
  const calls=[];
  const fetchImpl=async(url,options={})=>{
    calls.push({url,options});
    if(url.endsWith('/set')) return response(200,{ok:true,updatedAt:'2026-10-03T12:00:00.000Z'});
    if(url.endsWith('/get')) return response(200,{
      ok:true,
      value:{hello:'world'},
      tags:['one','two'],
      expiresAt:'2026-10-04T12:00:00.000Z',
      updatedAt:'2026-10-03T12:00:00.000Z'
    });
    throw new Error('unexpected-url');
  };
  const client=createD1StateClient({
    baseUrl:'https://worker.example',
    secret:'test-secret',
    fetchImpl
  });

  await client.setRecord({
    namespace:'rudi-test-v1',
    key:'alpha',
    value:{hello:'world'},
    tags:['one','two'],
    expires_at:'2026-10-04T12:00:00.000Z',
    updated_at:'2026-10-03T12:00:00.000Z'
  });
  const row=await client.getRecord('rudi-test-v1','alpha');

  assert.equal(calls.length,2);
  assert.equal(calls[0].options.headers.authorization,'Bearer test-secret');
  assert.equal(calls[1].options.headers.authorization,'Bearer test-secret');
  assert.deepEqual(row.value,{hello:'world'});
  assert.deepEqual(row.tags,['one','two']);
  assert.equal(row.expires_at,'2026-10-04T12:00:00.000Z');
});

test('D1 TTL conversion keeps the same cache expiry semantics',()=>{
  assert.equal(
    expiresAtFromOptions({ttl:60},Date.parse('2026-10-03T12:00:00.000Z')),
    '2026-10-03T12:01:00.000Z'
  );
  assert.equal(expiresAtFromOptions({},0),null);
});


test('D1 client retries transient reads once but does not retry writes',async()=>{
  let getCalls=0;
  const client=createD1StateClient({
    baseUrl:'https://worker.example',
    secret:'test-secret',
    fetchImpl:async(url)=>{
      if(url.endsWith('/get')){
        getCalls+=1;
        if(getCalls===1) throw new TypeError('network failed');
        return response(200,{ok:true,value:{ok:true},tags:[],expiresAt:null,updatedAt:'2026-10-06T06:00:00.000Z'});
      }
      throw new Error('unexpected-url');
    }
  });
  assert.deepEqual((await client.getRecord('rudi-test-v1','retry')).value,{ok:true});
  assert.equal(getCalls,2);

  let setCalls=0;
  const writeClient=createD1StateClient({
    baseUrl:'https://worker.example',
    secret:'test-secret',
    fetchImpl:async(url)=>{
      if(url.endsWith('/set')){setCalls+=1;throw new TypeError('network failed')}
      throw new Error('unexpected-url');
    }
  });
  await assert.rejects(()=>writeClient.set('rudi-test-v1','write',{x:1}),/network failed/);
  assert.equal(setCalls,1);
});
