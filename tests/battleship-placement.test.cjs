'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const battle=require('../api/battleship-game.cjs');
const {summarize}=require('../api/game-status.cjs');
const fleet=()=>[0,1,2,3,20,21,22,40,41,42,6,7,26,27,46,47,60,63,66,69];
function fixture(){
 const rows=new Map();
 const cache={get:async k=>structuredClone(rows.get(k)||null),set:async(k,v)=>rows.set(k,structuredClone(v)),
 delete:async k=>rows.delete(k),setIfAbsent:async(k,v)=>{if(rows.has(k))return false;rows.set(k,v);return true}};
 const handler=battle.createHandler({cache,authorizeRequest:req=>({actor:req.actor}),sendPushImpl:async()=>({sent:false}),waitUntilImpl:()=>{}});
 async function call(actor,operation,extra={}){const res={code:200,setHeader(){},status(v){this.code=v;return this},json(v){this.body=v;return this}};await handler({method:'POST',actor,body:{operation,...extra}},res);return res}
 return {call,rows};
}
test('new round waits for two private manually placed fleets before enabling shots',async()=>{
 const f=fixture();const start=await f.call('Рустам','start');
 assert.equal(start.body.room.status,'placing');assert.equal(start.body.room.size,10);
 assert.equal(start.body.room.turn,'');assert.deepEqual(start.body.room.ownShips,[]);
 assert.deepEqual(start.body.room.ready,{'Рустам':false,'Диана':false});
 assert.deepEqual(summarize(start.body.room),{active:true,turn:null,version:1});
 assert.equal((await f.call('Диана','start')).code,409);
 assert.equal((await f.call('Рустам','move',{version:1,index:99})).code,409);
 assert.equal((await f.call('Рустам','remind',{version:1})).code,409);
 const first=await f.call('Рустам','ready',{round:1,version:1,ships:fleet()});
 assert.equal(first.code,200);assert.equal(first.body.room.status,'placing');assert.deepEqual(first.body.room.ownShips,fleet());
 const hidden=await f.call('Диана','get');assert.equal(hidden.body.room.opponentShips,undefined);assert.deepEqual(hidden.body.room.ownShips,[]);
 assert.deepEqual(hidden.body.room.sunkShips,[]);
 assert.equal((await f.call('Рустам','ready',{round:1,ships:fleet()})).code,409);
 const second=await f.call('Диана','ready',{round:1,version:1,ships:fleet()});
 assert.equal(second.code,200,'independent readiness must accept unchanged round despite first player advancing version');
 assert.equal(second.body.room.status,'playing');assert.equal(second.body.room.turn,'Рустам');assert.equal(second.body.room.version,3);
 assert.equal((await f.call('Рустам','move',{version:3,index:99})).code,200);
 assert.equal((await f.call('Диана','move',{version:4,index:100})).code,400);
});
test('fleet validation rejects malformed, overlapping, bent, touching and wrong-count fleets',async()=>{
 const f=fixture();await f.call('Рустам','start');
 const invalid=[null,{},fleet().slice(1),[...fleet(),99],fleet().map((x,i)=>i===0?'0':x),fleet().map((x,i)=>i===0?100:x),fleet().map((x,i)=>i===0?-1:x),fleet().map((x,i)=>i===0?0.5:x),fleet().map((x,i)=>i===1?0:x),fleet().map((x,i)=>i===3?12:x),fleet().map((x,i)=>i===19?58:x),fleet().map((x,i)=>i===3?4:x)];
 for(const ships of invalid){const r=await f.call('Рустам','ready',{round:1,ships});assert.equal(r.code,409,JSON.stringify(ships));assert.equal(r.body.error,'battle-fleet-invalid')}
 assert.equal((await f.call('Рустам','ready',{round:0,ships:fleet()})).code,409);
 assert.equal((await f.call('Рустам','ready',{ships:fleet()})).code,409);
 assert.deepEqual((await f.call('Рустам','get')).body.room.ready,{'Рустам':false,'Диана':false});
});
test('end cancels placement and next round alternates starter; stale submissions cannot leak fleets',async()=>{
 const f=fixture();await f.call('Диана','start');
 await f.call('Рустам','ready',{round:1,ships:fleet()});
 const end=await f.call('Диана','end',{version:2});assert.equal(end.code,200);assert.equal(end.body.room.status,'ended');
 const next=await f.call('Диана','start');assert.equal(next.body.room.round,2);
 assert.deepEqual(next.body.room.ownShips,[]);assert.deepEqual(next.body.room.ready,{'Рустам':false,'Диана':false});
 assert.equal((await f.call('Рустам','ready',{round:1,ships:fleet()})).code,409);
 await f.call('Рустам','ready',{round:2,ships:fleet()});
 const playing=await f.call('Диана','ready',{round:2,ships:fleet()});assert.equal(playing.body.room.turn,'Диана');
});
test('legacy active 7x7 rounds retain bounds, groups, ships and turns',async()=>{
 const raw={status:'playing',round:4,version:8,turn:'Рустам',lastStarter:'Рустам',ships:{'Рустам':[0,1,2,14,15,28,29],'Диана':[0,1,2,14,15,28,29]},shots:{'Рустам':[],'Диана':[]}};
 const normalized=battle.normalize(raw);assert.equal(normalized.size,7);assert.equal(normalized.ships['Рустам'].length,7);
 assert.equal(battle.publicRoom(raw,'Рустам').size,7);
 assert.equal(battle.nextMove(raw,'Рустам','move',49).ok,false);
 let room=raw;for(const i of [0,1,2])room=battle.nextMove(room,'Рустам','move',i).room;
 assert.deepEqual(battle.publicRoom(room,'Рустам').sunkShips,[[0,1,2]]);
});
test('new random fleets meet exact classic counts and separation on 10x10',()=>{
 for(let i=0;i<100;i++){
  const ships=battle.ships();assert.equal(ships.length,20);assert.equal(new Set(ships).size,20);
  assert.ok(ships.every(x=>Number.isInteger(x)&&x>=0&&x<100));
  const groups=battle.vesselGroups(ships,10);assert.deepEqual(groups.map(x=>x.length).sort((a,b)=>b-a),[4,3,3,2,2,2,1,1,1,1]);
  for(let a=0;a<groups.length;a++)for(let b=a+1;b<groups.length;b++)for(const x of groups[a])for(const y of groups[b])assert.ok(Math.abs(Math.floor(x/10)-Math.floor(y/10))>1||Math.abs(x%10-y%10)>1);
 }
});
test('simultaneous fleet submissions keep both players after retrying the shared lock',async()=>{
 const f=fixture();await f.call('Рустам','start');
 const actors=['Рустам','Диана'];
 const results=await Promise.all(actors.map(actor=>f.call(actor,'ready',{round:1,version:1,ships:fleet()})));
 assert.equal(results.filter(r=>r.code===200).length,1);
 for(let i=0;i<results.length;i++)if(results[i].code!==200){
  assert.equal(results[i].body.error,'battle-busy');
  assert.equal((await f.call(actors[i],'ready',{round:1,version:1,ships:fleet()})).code,200);
 }
 const room=f.rows.get(battle.ROOM);
 assert.equal(room.status,'playing');assert.equal(room.version,3);
 assert.deepEqual(room.ready,{'Рустам':true,'Диана':true});
 assert.deepEqual(room.ships['Рустам'],fleet());assert.deepEqual(room.ships['Диана'],fleet());
});
test('legacy API rejects cells beyond its actual size and transitions to new placement on next round',async()=>{
 const f=fixture();
 f.rows.set(battle.ROOM,{status:'playing',round:2,version:3,turn:'Рустам',lastStarter:'Рустам',ships:{'Рустам':[0,1,2,14,15,28,29],'Диана':[0,1,2,14,15,28,29]},shots:{'Рустам':[],'Диана':[]}});
 assert.equal((await f.call('Рустам','move',{version:3,index:49})).code,400);
 assert.equal((await f.call('Рустам','move',{version:3,index:48})).code,200);
 assert.equal((await f.call('Рустам','end',{version:4})).code,200);
 const next=await f.call('Рустам','start');assert.equal(next.body.room.size,10);assert.equal(next.body.room.status,'placing');
});
test('new board sinking hides partial ships and winning reveals remaining fleet',()=>{
 let room=battle.nextMove(null,'Рустам','start').room;
 for(const actor of ['Рустам','Диана'])room=battle.nextMove(room,actor,'ready',fleet()).room;
 for(const i of [0,1,2])room=battle.nextMove(room,'Рустам','move',i).room;
 assert.deepEqual(battle.publicRoom(room,'Рустам').sunkShips,[]);
 room=battle.nextMove(room,'Рустам','move',3).room;
 assert.deepEqual(battle.publicRoom(room,'Рустам').sunkShips,[[0,1,2,3]]);
 for(const i of fleet().filter(i=>i>3))room=battle.nextMove(room,'Рустам','move',i).room;
 assert.equal(room.status,'won');assert.equal(room.winner,'Рустам');assert.equal(room.turn,'');
 assert.deepEqual(battle.publicRoom(room,'Рустам').opponentShips,fleet());
});
