'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {nextMove,normalizeRoom,createHandler}=require('../api/duel-game.cjs');
function begin(){const x=nextMove(null,'Диана','start',undefined,'2026-10-13T20:00:00Z');assert.equal(x.ok,true);return x.room}
test('online duel starts as one shared room and alternates turns',()=>{
 const room=begin();
 assert.equal(room.turn,'Рустам');
 assert.equal(room.board.length,9);
 let result=nextMove(room,'Диана','move',0);
 assert.deepEqual({ok:result.ok,error:result.error},{ok:false,error:'duel-not-your-turn'});
 result=nextMove(room,'Рустам','move',0);
 assert.equal(result.ok,true);assert.equal(result.room.board[0],'X');
 assert.equal(result.room.turn,'Диана');
 assert.equal(nextMove(result.room,'Рустам','move',1).error,'duel-not-your-turn');
 assert.equal(nextMove(result.room,'Диана','move',0).error,'duel-cell-invalid');
 assert.equal(nextMove(result.room,'Диана','move',4).room.board[4],'O');
});
test('winner, draw and alternating round starters are consistent',()=>{
 let r=begin();
 for(const [actor,i] of [['Рустам',0],['Диана',3],['Рустам',1],['Диана',4],['Рустам',2]]){
  const x=nextMove(r,actor,'move',i);assert.equal(x.ok,true);r=x.room;
 }
 assert.equal(r.status,'won');assert.equal(r.winner,'Рустам');assert.equal(r.turn,'');
 assert.equal(nextMove(r,'Диана','move',6).error,'duel-not-playing');
 const reset=nextMove(r,'Диана','start');
 assert.equal(reset.room.round,2);assert.equal(reset.room.turn,'Диана');assert.equal(reset.room.board.filter(Boolean).length,0);
 let d=normalizeRoom({board:['X','O','X','X','O','O','O','X',''],status:'playing',turn:'Рустам',version:10,round:3,lastStarter:'Рустам'});
 const drawn=nextMove(d,'Рустам','move',8);
 assert.equal(drawn.room.status,'draw');assert.equal(drawn.room.winner,'');
});
test('duel API authenticates actor and prevents concurrent stale state mutation',async()=>{
 const values=new Map();const cache={
  async get(k){return values.has(k)?structuredClone(values.get(k)):null},
  async set(k,v){values.set(k,structuredClone(v));return true},
  async setIfAbsent(k,v){if(values.has(k))return false;values.set(k,v);return true},
  async delete(k){values.delete(k)}
 };
 const auth=(req)=>({actor:req.actor});
 const handle=createHandler({cache,authorizeRequest:auth,now:()=>new Date().toISOString()});
 async function call(actor,operation,extra={},method='POST'){
  const req={actor,method,body:{operation,...extra},query:{}};
  const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},status(v){this.statusCode=v;return this},json(v){this.body=v;return this}};
  await handle(req,res);return res;
 }
 assert.equal((await call('Рустам','get')).body.room.status,'waiting');
 assert.equal((await call('Диана','start')).body.room.turn,'Рустам');
 assert.equal((await call('Диана','move',{index:0,version:1})).statusCode,409);
 assert.equal((await call('Рустам','move',{index:0,version:0})).body.error,'duel-outdated');
 const ok=await call('Рустам','move',{index:0,version:1});
 assert.equal(ok.statusCode,200);assert.equal(ok.body.room.version,2);
 assert.equal((await call('Рустам','move',{index:1,version:2})).statusCode,409);
 assert.equal((await call('Диана','move',{index:0,version:2})).statusCode,409);
 assert.equal((await call('Диана','move',{index:4,version:2})).statusCode,200);
 assert.equal((await call('Диана','start')).body.error,'duel-in-progress');
 assert.equal((await call('Рустам','get')).body.room.board[4],'O');
 assert.equal((await call('Рустам','get',{},'GET')).statusCode,405);
});
test('games entry avoids duplicate Quick Access shortcut, and finance navigation is viewport-fixed',()=>{
 const js=fs.readFileSync('public/rudi-games.js','utf8');
 const nav=fs.readFileSync('public/finance-nav-icons.js','utf8');
 const css=fs.readFileSync('public/finance-nav-icons.css','utf8');
 const api=fs.readFileSync('api/index.js','utf8');
 const rewrites=JSON.parse(fs.readFileSync('vercel.json','utf8')).rewrites;
 assert.match(js,/rudiGamesQuickButton'\)\?\.remove\(\)/);
 assert.match(js,/rudiGamesHomeButton'\)\?\.remove\(\)/);
 assert.match(js,/Крестики-нолики · онлайн/);
 assert.match(js,/if\(game==='duel'\)\{duelStart\(\);return\}/);
 assert.match(js,/data-duel-index/);
 assert.match(js,/void duelAction\('move'/);
 assert.match(nav,/document\.body\.appendChild\(nav\)/);
 assert.match(css,/position:fixed!important;bottom:0!important/);
 assert.match(css,/body:not\(\[data-app-tab="finances"\]\)/);
 assert.match(api,/route === 'duel-game'/);
 assert.ok(rewrites.some(r=>r.source==='/api/duel-game'&&r.destination.includes('route=duel-game')));
});
