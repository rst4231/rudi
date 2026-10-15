'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createHandler,readPresence,validSession}=require('../api/battleship-game.cjs');
function fixture(){
 const records=new Map();let reads=0,writes=0;
 let time=Date.parse('2026-10-14T14:00:00.000Z');
 const cache={
  async get(key){reads++;return records.has(key)?structuredClone(records.get(key)):null},
  async set(key,value){writes++;records.set(key,structuredClone(value));return true},
  async delete(key){records.delete(key);return true},
  async setIfAbsent(key,value){if(records.has(key))return false;records.set(key,value);return true}
 };
 const handler=createHandler({cache,authorizeRequest:req=>({actor:req.actor}),now:()=>new Date(time).toISOString(),
  waitUntilImpl:()=>{},makeShips:()=>[0,1,2,14,15,28,29]});
 async function call(actor,operation='get',extra={},method='POST'){
  const req={method,actor,body:{operation,...extra}},res={
   code:200,setHeader(){},status(n){this.code=n;return this},json(v){this.data=v;return this}};
  await handler(req,res);return res;
 }
 return {call,cache,advance:ms=>{time+=ms},metrics:()=>({reads,writes}),now:()=>new Date(time).toISOString()};
}
test('both participants get independent in-game presence with no dedicated poll endpoint',async()=>{
 const f=fixture();
 assert.equal(validSession('bad'),'');
 assert.equal(validSession('session_RustamA'),'session_RustamA');
 let a=await f.call('Рустам','get',{sessionId:'session_RustamA',active:true});
 assert.equal(a.code,200);
 assert.deepEqual(a.data.presence,{'Рустам':true,'Диана':false});
 let b=await f.call('Диана','get',{sessionId:'session_DianaBC',active:true});
 assert.equal(b.code,200);
 assert.deepEqual(b.data.presence,{'Рустам':true,'Диана':true});
 const writes=f.metrics().writes;
 await f.call('Рустам','get');
 assert.equal(f.metrics().writes,writes,'ordinary room reads must not write a heartbeat');
});
test('leaving removes own session, not a newer parallel session; presence expires',async()=>{
 const f=fixture();
 await f.call('Рустам','get',{sessionId:'session_RustamA',active:true});
 await f.call('Рустам','get',{sessionId:'session_NewerXX',active:true});
 await f.call('Рустам','leave',{sessionId:'session_RustamA'});
 assert.equal((await f.call('Диана')).data.presence['Рустам'],true);
 await f.call('Рустам','leave',{sessionId:'session_NewerXX'});
 assert.equal((await f.call('Диана')).data.presence['Рустам'],false);
 await f.call('Диана','get',{sessionId:'session_DianaBC',active:true});
 f.advance(85001);
 assert.equal((await f.call('Рустам')).data.presence['Диана'],false);
 assert.deepEqual(await readPresence(f.cache,f.now()),{'Рустам':false,'Диана':false});
});
test('battle room keeps ships secret while reporting player presence',async()=>{
 const f=fixture();
 const start=await f.call('Диана','start');assert.equal(start.code,200);
 const get=await f.call('Рустам','get',{sessionId:'session_RustamA',active:true});
 assert.equal(get.data.room.opponentShips,undefined);
 assert.equal(get.data.room.ownShips.length,7);
 assert.equal(get.data.presence['Рустам'],true);
 assert.equal(get.data.presence['Диана'],false);
});
test('client shows other participant actual name and reuses duel online/offline chips',()=>{
 const js=fs.readFileSync('public/rudi-games-extra.js','utf8');
 assert.match(js,/const opponentName=\(\)=>actor\(\)==='Рустам'\?'Диана':'Рустам'/);
 assert.doesNotMatch(js,/Поле соперника/);
 assert.match(js,/Поле '\+safe\(battleGenitive\(other\)\)/);
 assert.match(js,/presenceHtml.*rudi-duel-presence/);
 assert.match(js,/battlePresence\[name\]\?'В игре':'Не в игре'/);
 assert.match(js,/45000/);
 assert.match(js,/function leaveBattle\(\)/);
 assert.match(js,/Игра ещё не началась/);
 assert.match(js,/scheduleBattle\(\)/);
});
test('one versioned HTML script and same interval, no extra presence poll',()=>{
 const html=fs.readFileSync('public/index.html','utf8'),js=fs.readFileSync('public/rudi-games-extra.js','utf8');
 assert.match(html,/rudi-games-extra\.js\?v=4\.\d+/);
 assert.match(html,/rudi-games\.js\?v=4\.\d+/);
 assert.match(js,/battleTimer=setTimeout\(\(\)=>\{battleTimer=null;void pollBattle\(\)\},5000\)/);
 assert.match(fs.readFileSync('VERSION','utf8').trim(),/^v4\.\d+$/);
 assert.equal(JSON.parse(fs.readFileSync('rudi-version.json','utf8')).current,fs.readFileSync('VERSION','utf8').trim());
});
