'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs');
const {readLiveSignals}=require('../api/crypto-signals.cjs');
const at='2026-10-21T10:05:00Z',now=Date.parse('2026-10-21T10:07:00Z');
const post=(id,body,ref='',postedAt=at)=>'<div data-post="ne_investor/'+id+'"><time datetime="'+postedAt+'"></time>'+
 (ref?'<a href="https://t.me/ne_investor/'+ref+'">reply</a>':'')+
 '<div class="tgme_widget_message_text">'+body+'</div></div>';
test('live copy polls one author channel page without crawling 40 crypto markets or writing D1',async()=>{
 let reads=0,writes=0,gets=0;
 const client={getRecord:async()=>{reads++;return {value:{messages:[],results:{}}};},setRecord:async()=>{writes++;}};
 const result=await readLiveSignals({client,now,fetchImpl:async(url,options)=>{
  gets++;assert.equal(url,'https://t.me/s/ne_investor');assert.equal(options.cache,'no-store');
  return {ok:true,text:async()=>post(101,'$BTC беру в лонг')};
 }});
 assert.equal(gets,1);assert.equal(reads,1);assert.equal(writes,0);
 assert.equal(result.sourceError,null);
 assert.equal(result.signals[0].symbol,'BTC');assert.equal(result.signals[0].authorEntry,null);
 assert.equal(result.signals[0].market,'linear');
});
test("live author's linked close is detectable immediately without waiting for 15-minute scans",async()=>{
 const client={getRecord:async()=>({value:{messages:[],results:{}}})};
 const result=await readLiveSignals({client,now,fetchImpl:async()=>({
  ok:true,text:async()=>post(101,'$BTC беру в лонг')+post(102,'Закрыл всю позицию',101,'2026-10-21T10:06:00Z')
 })});
 assert.equal(result.signals.length,1);
 assert.ok(result.signals[0].events?.some(e=>e.type==='full-close'));
});
test('channel unavailable fails closed for new entries',async()=>{
 const result=await readLiveSignals({now,client:{getRecord:async()=>({value:{messages:[],results:{}}})},
  fetchImpl:async()=>{throw Error('telegram-outage');}});
 assert.equal(result.sourceError,'live-author-feed-unavailable');
});
test('crypto portfolio forces dark while the rest of the app retains selectable theme',()=>{
 const css=fs.readFileSync('public/crypto-wallets.css','utf8');
 const html=fs.readFileSync('public/index.html','utf8');
 assert.match(css,/body\[data-app-tab="finances"\]\[data-finance-tone="crypto"\]/);
 assert.match(css,/#financePage\[data-finance-tone="crypto"\]/);
 assert.match(css,/color-scheme:dark/);
 assert.match(html,/id="financeCryptoPanel"/);
});
