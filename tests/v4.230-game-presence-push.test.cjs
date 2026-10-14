'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {nextMove,normalizeRoom,validSession,createHandler,readPresence}=require('../api/duel-game.cjs');
const game=()=>fs.readFileSync('public/rudi-games.js','utf8');
const css=()=>fs.readFileSync('public/rudi-games.css','utf8');
const layout=()=>fs.readFileSync('public/home-reference-layout.js','utf8');
const homeCss=()=>fs.readFileSync('public/home-reference-layout.css','utf8');
function fixture(){
 const values=new Map(),sent=[];
 const clone=x=>JSON.parse(JSON.stringify(x));
 const cache={
  async get(k){return values.has(k)?clone(values.get(k)):null},
  async set(k,v){values.set(k,clone(v));return true},
  async setIfAbsent(k,v){if(values.has(k))return false;values.set(k,clone(v));return true},
  async delete(k){return values.delete(k)}
 };
 let timestamp=Date.parse('2026-10-14T09:00:00Z');
 const handler=createHandler({cache,authorizeRequest:req=>({actor:req.actor}),
  now:()=>new Date(timestamp).toISOString(),
  sendPushImpl:async(actor,payload)=>{sent.push({actor,payload});return {sent:true}},
  waitUntilImpl:()=>{}});
 async function call(actor,operation,extra={},method='POST'){
  const req={method,actor,body:{operation,...extra}};
  const res={code:200,setHeader(){},status(v){this.code=v;return this},json(v){this.body=v;return this}};
  await handler(req,res);return res;
 }
 return {call,sent,cache,advance:ms=>timestamp+=ms};
}
test('finished game exposes who ended it and rejects late moves',()=>{
 const started=nextMove(null,'Рустам','start',undefined,'2026-10-14T09:00:00Z');
 const ended=nextMove(started.room,'Диана','end',undefined,'2026-10-14T09:03:00Z');
 assert.equal(ended.ok,true);
 assert.equal(ended.room.status,'ended');
 assert.equal(ended.room.endedBy,'Диана');
 assert.equal(ended.room.turn,'');
 assert.equal(nextMove(ended.room,'Рустам','move',0).ok,false);
 assert.equal(nextMove(ended.room,'Рустам','end').ok,false);
 assert.equal(nextMove(ended.room,'Рустам','start').room.round,2);
 assert.equal(normalizeRoom(ended.room).endedBy,'Диана');
});
test('only successful new rounds push to the other actor, once',async()=>{
 const t=fixture();const first=await t.call('Диана','start');
 assert.equal(first.code,200);
 await Promise.resolve();
 assert.equal(t.sent.length,1);
 assert.equal(t.sent[0].actor,'Рустам');
 assert.equal(t.sent[0].payload.url,'/?tab=home&game=duel');
 assert.match(t.sent[0].payload.body,/Диана начала/);
 assert.equal((await t.call('Рустам','start')).code,409);
 assert.equal(t.sent.length,1);
 assert.equal((await t.call('Диана','end',{version:0})).code,409);
 assert.equal((await t.call('Диана','end',{version:1})).code,200);
 assert.equal(t.sent.length,1);
 assert.equal((await t.call('Рустам','end',{version:2})).code,409);
 assert.equal((await t.call('Рустам','start')).code,200);
 await Promise.resolve();
 assert.equal(t.sent.length,2);
 assert.equal(t.sent[1].actor,'Диана');
});
test('both online statuses, session-matched leave, expiry',async()=>{
 const t=fixture(),a='session_12345',b='session_67890';
 assert.equal(validSession('invalid'), '');
 await t.call('Рустам','get',{sessionId:a,active:true});
 const joined=await t.call('Диана','get',{sessionId:b,active:true});
 assert.deepEqual(joined.body.presence,{'Рустам':true,'Диана':true});
 await t.call('Рустам','leave',{sessionId:'session_wrong'});
 assert.equal((await t.call('Диана','get')).body.presence['Рустам'],true);
 await t.call('Рустам','leave',{sessionId:a});
 assert.equal((await t.call('Диана','get')).body.presence['Рустам'],false);
 t.advance(48000);
 assert.equal((await t.call('Рустам','get')).body.presence['Диана'],false);
 assert.deepEqual(await readPresence(t.cache,'2026-10-15T00:00:00Z'),{'Рустам':false,'Диана':false});
});
test('game page removes market simulator and unnecessary hero paragraph',()=>{
 const source=game();
 assert.doesNotMatch(source,/data-rudi-game="market"/);
 assert.doesNotMatch(source,/function marketStart\(/);
 assert.doesNotMatch(source,/Без регистрации, без рекламы/);
 assert.match(source,/АРКАДНАЯ ЗОНА/);
 assert.match(source,/data-duel-action="end"/);
 assert.match(source,/rudi-duel-presence/);
 assert.match(source,/game'\)!=='duel'/);
 assert.match(css(),/rudi-duel-player\.is-online/);
 assert.match(css(),/rudi-duel-finish/);
});
test('home full-width energy chart and moving phase caption',()=>{
 const c=homeCss(),s=layout(),html=fs.readFileSync('public/index.html','utf8');
 assert.match(s,/grid-template-columns':'minmax\(0,1fr\)'/);
 assert.match(s,/watchEnergyPointCaption\(dianaEnergy\)/);
 assert.match(c,/profile-energy-label\{\s*display:none!important/);
 assert.match(c,/profile-energy-plot \.rudi-energy-point-caption/);
 assert.match(c,/#homeDianaTile \.profile-energy-strip \.profile-energy-plot\{[\s\S]{0,150}width:100%!important/);
 assert.match(html,/home-reference-layout\.js\?v=4\.231/);
 assert.match(html,/home-reference-layout\.css\?v=4\.231/);
 assert.match(html,/rudi-games\.js\?v=4\.230/);
 assert.match(html,/rudi-games\.css\?v=4\.230/);
});
