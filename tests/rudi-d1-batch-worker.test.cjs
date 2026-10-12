const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');

async function worker(){
  return (await import(pathToFileURL(path.resolve('cloudflare/rudi-db-api/batched-worker.js')))).default;
}
function mockEnv(seed=new Map()){
  const calls={selects:0,deletes:0,batches:0};
  const db={
    prepare(sql){
      return {bind(...args){
        return {
          async all(){
            assert.match(sql,/SELECT/);
            calls.selects++;
            const [ns,key]=args;
            const row=seed.get(ns+'|'+key);
            return {success:true,results:row?[{namespace:ns,key,...row}]:[]};
          },
          async run(){
            assert.match(sql,/DELETE/);
            calls.deletes++;
            const [ns,key]=args;
            seed.delete(ns+'|'+key);
            return {success:true};
          }
        };
      }};
    },
    async batch(statements){
      calls.batches++;
      return Promise.all(statements.map(stmt=>stmt.all?stmt.all():stmt.run()));
    }
  };
  return {env:{RUDI_API_SECRET:'test-secret',DB:db},seed,calls};
}
function request(path,body,auth='test-secret'){
  return new Request('https://worker.example'+path,{
    method:'POST',
    headers:{authorization:'Bearer '+auth,'content-type':'application/json'},
    body:JSON.stringify(body)
  });
}

test('Cloudflare batched read returns each value, including a missing key',async()=>{
  const app=await worker();
  const {env,calls}=mockEnv(new Map([
    ['profile|a',{value:'{"hello":"A"}',tags:'["one"]',expires_at:null,updated_at:'2026-10-12'}],
    ['profile|b',{value:'{"hello":"B"}',tags:'[]',expires_at:null,updated_at:'2026-10-12'}]
  ]));
  const res=await app.fetch(request('/batch-get',{keys:[
    {namespace:'profile',key:'a'},{namespace:'profile',key:'missing'},{namespace:'profile',key:'b'}
  ]}),env);
  assert.equal(res.status,200);
  const body=await res.json();
  assert.deepEqual(body.items.map(x=>x.value),[{hello:'A'},null,{hello:'B'}]);
  assert.equal(calls.batches,1);
  assert.equal(calls.selects,3);
});
test('Cloudflare batch hides expired entries and removes only expired versions',async()=>{
  const app=await worker();
  const {env,seed,calls}=mockEnv(new Map([['n|old',{
    value:'1',tags:'[]',expires_at:'2020-01-01T00:00:00Z',updated_at:''
  }]]));
  const res=await app.fetch(request('/batch-get',{keys:[{namespace:'n',key:'old'}]}),env);
  assert.equal(res.status,200);
  assert.equal((await res.json()).items[0].value,null);
  assert.equal(seed.has('n|old'),false);
  assert.equal(calls.deletes,1);
});
test('Cloudflare batch rejects unauthorized and oversized input',async()=>{
  const app=await worker(),{env,calls}=mockEnv();
  assert.equal((await app.fetch(request('/batch-get',{keys:[{namespace:'n',key:'a'}]},'wrong'),env)).status,401);
  for(const keys of [[],Array.from({length:41},(_,i)=>({namespace:'n',key:String(i)})),[{namespace:'',key:'a'}]]){
    assert.equal((await app.fetch(request('/batch-get',{keys}),env)).status,400);
  }
  assert.equal(calls.batches,0);
});
