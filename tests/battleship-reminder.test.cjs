const test=require('node:test'),assert=require('node:assert/strict');
const {createHandler}=require('../api/battleship-game.cjs');
const fleet=()=>[0,1,2,3,20,21,22,40,41,42,6,7,26,27,46,47,60,63,66,69];
function fixture(sent=true){
 const rows=new Map(),pushes=[];let time=Date.parse('2026-10-25T10:00:00Z');
 const cache={get:async k=>structuredClone(rows.get(k)||null),set:async(k,v)=>rows.set(k,structuredClone(v)),
  delete:async k=>rows.delete(k),setIfAbsent:async(k,v)=>{if(rows.has(k))return false;rows.set(k,v);return true}};
 const handler=createHandler({cache,authorizeRequest:req=>({actor:req.actor}),now:()=>new Date(time).toISOString(),
  makeShips:()=>[0,1,2,14,15,28,29],waitUntilImpl:()=>{},
  sendPushImpl:async(actor,payload)=>{pushes.push({actor,payload});return {sent}}});
 async function call(actor,operation,extra={}){
  const res={code:200,setHeader(){},status(v){this.code=v;return this},json(v){this.body=v;return this}};
  await handler({method:'POST',actor,body:{operation,...extra}},res);return res;
 }
 async function begin(round=1){await call('Рустам','start');for(const actor of ['Рустам','Диана'])await call(actor,'ready',{round,ships:fleet()})}
 return {call,begin,pushes,advance:ms=>time+=ms};
}
test('reminder targets only current opponent and persists its five-minute limit across reload and rounds',async()=>{
 const f=fixture();await f.begin();f.pushes.length=0;
 let result=await f.call('Диана','remind',{version:3,recipient:'Диана'});
 assert.equal(result.code,200);assert.equal(result.body.reminded,true);
 assert.equal(f.pushes[0].actor,'Рустам');assert.match(f.pushes[0].payload.body,/Диана/);
 assert.equal(f.pushes[0].payload.url,'/?tab=home&game=battleship');
 const nextAt=result.body.room.reminderNextAt;
 assert.equal((await f.call('Диана','get',{includePresence:false})).body.room.reminderNextAt,nextAt);
 result=await f.call('Диана','remind',{version:3});
 assert.equal(result.code,429);assert.equal(result.body.error,'battle-reminder-cooldown');
 assert.equal(f.pushes.length,1);
 await f.call('Рустам','end',{version:3});await f.begin(2);
 await f.call('Диана','move',{version:7,index:9});
 assert.equal((await f.call('Диана','remind',{version:8})).code,429);
 f.advance(300000);
 assert.equal((await f.call('Диана','remind',{version:8})).code,200);
 assert.equal(f.pushes.filter(p=>p.payload.title==='⚓ Твой ход').length,2);
});
test('own turn, finished room, stale version, outsiders and concurrent duplicates cannot send reminders',async()=>{
 const f=fixture();
 assert.equal((await f.call('Диана','remind',{version:0})).code,409);
 await f.begin();f.pushes.length=0;
 assert.equal((await f.call('Рустам','remind',{version:3})).code,409);
 assert.equal((await f.call('Диана','remind',{version:0})).code,409);
 assert.equal((await f.call('Чужой','remind',{version:3})).code,403);
 const results=await Promise.all([f.call('Диана','remind',{version:3}),f.call('Диана','remind',{version:3})]);
 assert.equal(results.filter(r=>r.code===200).length,1);assert.equal(f.pushes.length,1);
});
test('unconfigured pushes never claim successful delivery',async()=>{
 const f=fixture(false);await f.begin();
 const result=await f.call('Диана','remind',{version:3});
 assert.equal(result.code,200);assert.equal(result.body.reminded,false);
});
