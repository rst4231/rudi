const test=require('node:test'),assert=require('node:assert/strict');
const {createHandler}=require('../api/battleship-game.cjs');
test('successful mutations release the shared lock before the HTTP response permits the next click',async()=>{
 const rows=new Map();let lockAtResponse;
 const cache={get:async k=>structuredClone(rows.get(k)||null),set:async(k,v)=>rows.set(k,structuredClone(v)),
 setIfAbsent:async(k,v)=>{if(rows.has(k))return false;rows.set(k,v);return true},delete:async k=>rows.delete(k)};
 const handler=createHandler({cache,authorizeRequest:()=>({actor:'Рустам'}),sendPushImpl:async()=>({sent:false}),waitUntilImpl:()=>{}});
 const res={setHeader(){},status(){return this},json(){lockAtResponse=rows.has('pair-lock');return this}};
 await handler({method:'POST',body:{operation:'start'}},res);
 assert.equal(lockAtResponse,false);
});
