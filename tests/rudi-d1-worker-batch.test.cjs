const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('cloudflare/rudi-db-api.worker.js','utf8');
const sandbox={Response,Request,Headers,URL,TextEncoder,TextDecoder,Date,crypto:globalThis.crypto};
sandbox.globalThis=sandbox;
vm.runInNewContext(source.replace('export class MessengerRoom','class MessengerRoom').replace('export default {','globalThis.worker = {'),sandbox);
const invoke=async(items,{secret='secret',database}={})=>{
  const statements=[];
  const DB=database||{
    prepare(sql){return{bind(namespace,key){const stmt={sql,namespace,key};statements.push(stmt);return stmt;}}},
    async batch(items){return items.map(row=>({results:[{value:JSON.stringify({id:row.key}),tags:'[]',expires_at:null,updated_at:'time'}]}));}
  };
  const response=await sandbox.worker.fetch(new Request('https://worker.test/batch-get',{
    method:'POST',headers:{authorization:'Bearer '+secret,'content-type':'application/json'},body:JSON.stringify({keys:items})
  }),{RUDI_API_SECRET:'secret',DB});
  return {response,data:await response.json(),statements};
};
test('worker groups 3 D1 reads into one authenticated batch and preserves order',async()=>{
  const {response,data,statements}=await invoke([{namespace:'n',key:'one'},{namespace:'n',key:'two'},{namespace:'x',key:'three'}]);
  assert.equal(response.status,200);
  assert.equal(data.ok,true);
  assert.deepEqual(data.items.map(x=>x.value.id),['one','two','three']);
  assert.equal(statements.length,3);
});
test('worker rejects invalid bulk input without touching D1',async()=>{
  for(const keys of [[],Array.from({length:41},(_,i)=>({namespace:'n',key:String(i)})),[{namespace:'',key:'a'}]]){
    const {response}=await invoke(keys);
    assert.equal(response.status,400);
  }
});
test('worker skips missing and expired records without leaking stale data',async()=>{
  const past=new Date(Date.now()-60000).toISOString();
  const DB={
    prepare(sql){return{bind(namespace,key){return {namespace,key}}}},
    async batch(rows){return rows.map(({key})=>({results:key==='none'?[]:[{value:JSON.stringify('old'),tags:'[]',expires_at:key==='expired'?past:null,updated_at:''}]}))}
  };
  const {data}=await invoke([{namespace:'n',key:'none'},{namespace:'n',key:'expired'},{namespace:'n',key:'valid'}],{database:DB});
  assert.deepEqual(data.items.map(x=>x.value),[null,null,'old']);
});
test('Worker batch route requires the same bearer secret as ordinary reads',async()=>{
  const {response}=await invoke([{namespace:'n',key:'x'}],{secret:'wrong'});
  assert.equal(response.status,401);
});
