'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {parseSignal,evaluateCandles,modeledTrade,parsePreview}=require('../api/crypto-signals.cjs');
const {normalizeConfig,simulateVirtual}=require('../api/crypto-virtual.cjs');
const {compare24h}=require('../api/crypto-pnl.cjs');
const now=Date.parse('2026-10-11T12:00:00.000Z');
const created=new Date(now-86400000).toISOString();
const base={id:101,at:'2026-10-11T10:30:00.000Z',url:'https://t.me/ne_investor/101'};
test('Russian explicit and conditional signals are classified conservatively',()=>{
  const s=parseSignal({...base,text:'$ETH беру в лонг, вход 2420, тейк 2520, стоп 2330'});
  assert.equal(s.qualified,true);
  assert.equal(s.entry,2420);
  assert.equal(s.take,2520);
  assert.equal(s.stop,2330);
  const idea=parseSignal({...base,text:'$AAVE после закрепа можно брать аккуратный шорт'});
  assert.equal(idea.paperEligible,false);
  const reported=parseSignal({...base,text:'$LUMIA беру в шорт, набираюсь сеткой'});
  assert.equal(reported.paperEligible,true);
  assert.equal(reported.qualified,false);
});
test('Candle containing entry and exit is ambiguous, not an assumed win',()=>{
  const s={...base,qualified:true,direction:'long',entry:100,take:110,stop:90};
  const result=evaluateCandles(s,[{at:now-3600000,high:115,low:95,close:111}],now);
  assert.equal(result.status,'ambiguous');
});
test('Explicit levels opened in one candle, exited in later candle',()=>{
  const s={...base,qualified:true,direction:'long',entry:100,take:110,stop:90};
  const result=evaluateCandles(s,[{at:now-3600000,high:103,low:99,close:100},
    {at:now,high:112,low:101,close:111}],now);
  assert.equal(result.status,'won');
  assert.equal(result.priceChangePct,10);
  assert.ok(result.exitAt);
});
test('Author trade without entry uses next-hour synthetic entry',()=>{
  const s=parseSignal({...base,text:'$LUMIA беру в шорт'});
  const result=modeledTrade(s,[{at:now-3600000,open:100,high:103,low:95,close:98},
    {at:now,open:98,high:101,low:90,close:93}],[],now);
  assert.equal(result.entry,100);
  assert.equal(result.status,'open');
  assert.equal(result.marketPrice,93);
  assert.equal(result.execution,'next-hour-model');
});
test('Virtual investment excludes signals before sim start and protects capital',()=>{
  const config=normalizeConfig({startedAt:created});
  const trades=[{...base,qualified:true,entry:100,entryAt:'2026-10-11T11:00:00.000Z',
    exitAt:'2026-10-11T11:30:00.000Z',symbol:'ETH',direction:'long',status:'won',priceChangePct:10},
    {...base,id:102,qualified:true,entry:100,entryAt:'2026-10-11T11:35:00.000Z',
    symbol:'BTC',direction:'short',marketPrice:90,status:'open'}];
  const report=simulateVirtual(trades,config,now);
  assert.equal(report.stats.wins,1);
  assert.equal(report.stats.open,1);
  assert.equal(report.equityUsd,10404);
  assert.equal(report.realizedPnlUsd,200);
});
test('Paper trading accepts only 2x or 3x with 2x by default',()=>{
  const defaults=normalizeConfig({startedAt:created});
  assert.equal(defaults.leverage,2);
  assert.equal(normalizeConfig({leverage:3}).leverage,3);
  assert.throws(()=>normalizeConfig({leverage:1}),/virtual-settings-invalid/);
  assert.throws(()=>normalizeConfig({leverage:5}),/virtual-settings-invalid/);
});
test('24h source changes are explicitly not verified PNL',()=>{
  const result=compare24h([
    {at:created,usd:1000,partial:false},
    {at:new Date(now).toISOString(),usd:1100,partial:false},
  ],now);
  assert.equal(result.available,true);
  assert.equal(result.deltaUsd,100);
  assert.equal(result.verifiedPnl,false);
});
test('Telegram preview parser preserves post id and original message link',()=>{
  const html='<div class="tgme_widget_message" data-post="ne_investor/325">'+
    '<time datetime="2026-10-11T11:00:00+00:00"></time>'+
    '<div class="tgme_widget_message_text js-message_text" dir="auto">$LUMIA беру в шорт</div></div>';
  const rows=parsePreview(html);
  assert.equal(rows.length,1);
  assert.equal(rows[0].id,325);
  assert.equal(rows[0].url,'https://t.me/ne_investor/325');
  assert.match(rows[0].text,/LUMIA/);
});
