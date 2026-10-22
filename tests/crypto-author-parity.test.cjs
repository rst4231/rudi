'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseSignal}=require('../api/crypto-signals.cjs');
const {classifyUpdate,linkUpdates}=require('../api/crypto-trade-events.cjs');
const stamp='2026-10-21T11:30:00Z';
const post=(id,text,minutes=0,references=[])=>({id,text,at:new Date(Date.parse(stamp)+minutes*60000).toISOString(),url:'https://t.me/ne_investor/'+id,references});
test('original virtual scanner phrase semantics stay unchanged for the real scanner',()=>{
 const cases=[
  ['$BTC я бы зашёл в лонг',true,false],
  ['$BTC можно открывать лонг',true,false],
  ['$BTC можно брать в лонг',true,true],
  ['$BTC беру в лонг',true,false],
  ['$M беру в шорт',true,false],
  ['$BTC планирую открыть лонг',false,null],
  ['$XNY смотрю в шорт, беру лесенкой',true,false],
  ['$BTC если пробьём уровень, беру в лонг',true,true],
  ['$BTC открыл шорт по 102',true,false],
  ['BTC беру в лонг',false,null]
 ];
 for(const [phrase,recognized,conditional] of cases){
  const parsed=parseSignal(post(100,phrase));
  assert.equal(Boolean(parsed),recognized,phrase);
  if(recognized)assert.equal(parsed.conditional,conditional,phrase);
 }
});
test('the author\'s precise stop and take adjustments retain their quoted levels',()=>{
 assert.deepEqual([classifyUpdate(post(101,'$BTC перенёс стоп на 94500',1)).type,
  classifyUpdate(post(102,'$BTC тейк на 99500',2)).type],
  ['stop-level-update','take-level-update']);
 assert.equal(classifyUpdate(post(101,'$BTC перенёс стоп на 94500',1)).levelPrice,94500);
 assert.equal(classifyUpdate(post(102,'$BTC тейк на 99500',2)).levelPrice,99500);
 assert.equal(classifyUpdate(post(103,'$BTC закрыл полностью по 99000',3)).exitPrice,99000);
});
test('unique unlabelled author full-close links only to the single active RUDI trade',()=>{
 const message=post(110,'Закрыл полностью',5);
 const mk=(id,t=0)=>parseSignal(post(id,'$BTC беру в лонг',t));
 const one=linkUpdates([mk(100)],[post(100,'$BTC беру в лонг'),message],{activeSignalIds:['100']});
 assert.equal(one[0].events.filter(e=>e.type==='full-close').length,1);
 const zero=linkUpdates([mk(100)],[post(100,'$BTC беру в лонг'),message],{activeSignalIds:[]});
 assert.equal(zero[0].events.filter(e=>e.type==='full-close').length,0);
 const multiple=linkUpdates([mk(100),mk(101,1)],
  [post(100,'$BTC беру в лонг'),post(101,'$BTC беру в лонг',1),message],
  {activeSignalIds:['100']});
 assert.equal(multiple.reduce((a,s)=>a+s.events.filter(e=>e.type==='full-close').length,0),0);
});

test('one-letter M signal from October 22 is parsed and linked to a later author exit',()=>{
 const m=post(15085,'$M беру в шорт, монета на хороших объемах, но они активно снижаются. Берём аккуратно, сеткой',3);
 const signal=parseSignal(m);
 assert.equal(signal.symbol,'M');
 assert.equal(signal.direction,'short');
 assert.equal(signal.market,'linear');
 assert.equal(signal.conditional,false);
 assert.equal(signal.authorEntry,null);
 const exits=linkUpdates([signal],[m,post(15086,'$M закрыл полностью',4)],{activeSignalIds:['15085']});
 assert.equal(exits[0].events.filter(e=>e.type==='full-close').length,1);
});
