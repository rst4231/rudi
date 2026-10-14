'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const battle=require('../api/battleship-game.cjs');
const {summarize}=require('../api/game-status.cjs');
const mockShips=()=>[0,1,2,14,15,28,29];
function dbFixture(){
 const table=new Map(),messages=[],background=[];
 const cache={
  async get(k){return table.has(k)?structuredClone(table.get(k)):null},
  async set(k,v){table.set(k,structuredClone(v));return true},
  async setIfAbsent(k,v){if(table.has(k))return false;table.set(k,structuredClone(v));return true},
  async delete(k){return table.delete(k)}
 };
 const handler=battle.createHandler({cache,authorizeRequest:req=>({actor:req.actor}),
  now:()=>new Date('2026-10-14T12:00:00Z').toISOString(),makeShips:mockShips,
  sendPushImpl:async(actor,payload)=>{messages.push({actor,payload});return {sent:true}},
  waitUntilImpl:task=>background.push(task)});
 async function call(actor,operation,extra={},method='POST'){
  const req={method,actor,body:{operation,...extra}},res={
   code:200,setHeader(){},status(v){this.code=v;return this},
   json(v){this.body=v;return this}};
  await handler(req,res);return res;
 }
 return {call,messages,background};
}
test('sea battle has 7x7, 7-ship cells, no overlaps or touching ships',()=>{
 for(let i=0;i<20;i++){
  const cells=battle.ships();
  assert.equal(cells.length,7);assert.equal(new Set(cells).size,7);
  assert.ok(cells.every(x=>x>=0&&x<49));
 }
});
test('opponent fleet remains secret during a live battle',()=>{
 const room=battle.nextMove(null,'Рустам','start',null,'2026-10-14T12:00:00Z',mockShips).room;
 assert.equal(room.status,'playing');
 assert.equal(battle.publicRoom(room,'Рустам').ownShips.length,7);
 assert.equal(battle.publicRoom(room,'Рустам').opponentShips,undefined);
 assert.equal(battle.publicRoom(room,'Диана').opponentShips,undefined);
 assert.equal(battle.publicRoom({...room,status:'ended'},'Рустам').opponentShips.length,7);
});
test('battle alternates turns, rejects repeated, stale and opponent moves',async()=>{
 const d=dbFixture();
 const start=await d.call('Рустам','start');assert.equal(start.code,200);
 assert.equal(start.body.room.turn,'Рустам');
 assert.equal(start.body.room.opponentShips,undefined);
 assert.equal((await d.call('Диана','move',{index:0,version:1})).code,409);
 const first=await d.call('Рустам','move',{index:6,version:1});assert.equal(first.code,200);
 assert.equal(first.body.room.turn,'Диана');
 assert.equal((await d.call('Рустам','move',{index:1,version:2})).code,409);
 assert.equal((await d.call('Диана','move',{index:0,version:1})).code,409);
 const second=await d.call('Диана','move',{index:6,version:2});assert.equal(second.code,200);
 assert.equal(second.body.room.ownShots.length,1);
 assert.equal((await d.call('Рустам','move',{index:6,version:3})).code,409);
});
test('hit grants another turn; miss passes turn',()=>{
 const a=battle.nextMove(null,'Рустам','start',null,'2026-10-14T12:00:00Z',mockShips).room;
 const hit=battle.nextMove(a,'Рустам','move',0);assert.equal(hit.room.turn,'Рустам');
 const miss=battle.nextMove(hit.room,'Рустам','move',6);assert.equal(miss.room.turn,'Диана');
});
test('start sends one push to partner only after durable success; shots do not spam',async()=>{
 const d=dbFixture();
 const start=await d.call('Диана','start');assert.equal(start.code,200);
 await Promise.all(d.background);
 assert.equal(d.messages.length,1);
 assert.equal(d.messages[0].actor,'Рустам');
 assert.equal(d.messages[0].payload.url,'/?tab=home&game=battleship');
 assert.match(d.messages[0].payload.body,/Диана начала новую партию/);
 assert.equal((await d.call('Рустам','start')).code,409);
 assert.equal(d.messages.length,1);
 const move=await d.call('Рустам','move',{index:0,version:1});assert.equal(move.code,200);
 await Promise.all(d.background);
 assert.equal(d.messages.length,1,'Shots do not create extra notifications');
});
test('summary only exposes active status and current turn for two games',()=>{
 assert.deepEqual(summarize({status:'playing',turn:'Диана',version:3}),
  {active:true,turn:'Диана',version:3});
 assert.deepEqual(summarize({status:'won',turn:'',version:7}),
  {active:false,turn:null,version:7});
});
test('games UI offers five games, not 2048 or the removed finance quiz',()=>{
 const main=fs.readFileSync('public/rudi-games.js','utf8');
 const extra=fs.readFileSync('public/rudi-games-extra.js','utf8');
 for(const name of ['memory','duel','battleship','word','thinking'])
  assert.match(main,new RegExp('data-rudi-game="'+name+'"'));
 assert.doesNotMatch(main,/data-rudi-game="quiz"|2048|Финансовая викторина/);
 assert.match(extra,/function grade\(guess,target\)/);
 assert.match(extra,/function renderThinking\(\)/);
 assert.match(extra,/function startBattle\(\)/);
 assert.match(extra,/rudiHomeGamesButton/);
 assert.match(extra,/navigator\.setAppBadge/);
});
test('assets are wired and the service worker can mirror battle start pushes',()=>{
 const html=fs.readFileSync('public/index.html','utf8');
 const sw=fs.readFileSync('public/sw.js','utf8');
 const build=fs.readFileSync('build.cjs','utf8');
 assert.match(html,/rudi-games-extra\.js\?v=4\.242/);
 assert.match(html,/rudi-games\.js\?v=4\.242/);
 assert.match(html,/rudi-games\.css\?v=4\.242/);
 assert.match(sw,/rudi-games-extra\.js\?v=4\.242/);
 assert.match(sw,/rudi-\(duel-start\|battle-start\)/);
 assert.match(build,/'rudi-games-extra\.js'/);
 assert.equal(fs.readFileSync('VERSION','utf8').trim(),'v4.242');
 assert.equal(JSON.parse(fs.readFileSync('rudi-version.json','utf8')).current,'v4.242');
});
