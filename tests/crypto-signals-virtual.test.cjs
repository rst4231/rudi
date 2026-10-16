'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {parseSignal,evaluateCandles,modeledTrade,parsePreview,parseMarginMode,parseTradeAdjustment,buildView}=require('../api/crypto-signals.cjs');
const {normalizeConfig,simulateVirtual}=require('../api/crypto-virtual.cjs');
const {compare24h}=require('../api/crypto-pnl.cjs');
const now=Date.parse('2026-10-11T12:00:00.000Z');
const created=new Date(now-86400000).toISOString();
const base={id:101,at:'2026-10-11T10:30:00.000Z',url:'https://t.me/ne_investor/101'};
test('Russian explicit and conditional signals are classified conservatively',()=>{
  const s=parseSignal({...base,text:'$ETH беру в лонг, фьючерсы вход 2420, тейк 2520, стоп 2330'});
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
test('Author margin requires an explicit mention; topping up alone proves neither mode',()=>{
  assert.equal(parseMarginMode('Работаю кросс маржа'), 'cross');
  assert.equal(parseMarginMode('Позиция isolated 3x'), 'isolated');
  assert.equal(parseMarginMode('Открыл с изолированной маржой'), 'isolated');
  assert.equal(parseMarginMode('ДОКИДЫВАЮ в позицию ещё'), null);
  assert.equal(parseTradeAdjustment({...base,id:150,text:'Докидываю по $LUMIA немного обеспечения'}).kind,'margin-change');
  assert.equal(parseSignal({...base,id:151,text:'$LUMIA докидываю в шорт'}),null);
});
test('Updates link only to an unambiguous trade and never create a second trade',()=>{
  const start={...base,id:101,at:'2026-10-11T08:00:00.000Z',
    text:'$LUMIA беру в шорт, изолированная маржа'};
  const topup={...base,id:102,at:'2026-10-11T09:00:00.000Z',
    references:[101],text:'Докидываю обеспечение, так как цена пошла против меня'};
  const state={messages:[start,topup],updatedAt:'2026-10-11T09:01:00.000Z',results:{}};
  const view=buildView(state,Date.parse('2026-10-11T12:00:00.000Z'));
  assert.equal(view.stats.total,1);
  assert.equal(view.signals[0].adjustmentCount,1);
  assert.equal(view.signals[0].marginModeReported,'isolated');
});
test('Explicit cross on a linked update is attributed without inferring it from a top-up',()=>{
  const start={...base,id:110,at:'2026-10-11T08:00:00.000Z',
    text:'$ETH беру в лонг'};
  const update={...base,id:111,at:'2026-10-11T09:00:00.000Z',
    references:[110],text:'Докидываю обеспечение, позиция в cross'};
  const view=buildView({messages:[start,update]},Date.parse('2026-10-11T12:00:00.000Z'));
  assert.equal(view.signals[0].marginModeReported,'cross');
  assert.equal(view.signals[0].marginSource,'linked-update');
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
    exitAt:'2026-10-11T11:30:00.000Z',exitPrice:110,market:'linear',symbol:'ETH',direction:'long',status:'won',priceChangePct:10},
    {...base,id:102,qualified:true,entry:100,entryAt:'2026-10-11T11:35:00.000Z',
    symbol:'BTC',market:'linear',direction:'short',marketPrice:90,status:'open'}];
  const report=simulateVirtual(trades,config,now);
  assert.equal(report.stats.wins,1);
  assert.equal(report.stats.open,1);
  assert.equal(report.stats.open,1);
  assert.ok(report.equityUsd>10390&&report.equityUsd<10405);
  assert.ok(report.realizedPnlUsd>190&&report.realizedPnlUsd<200);
  assert.ok(report.stats.maxConcurrent>=1);
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
test('Telegram quote parser extracts authored partial close instead of the quoted entry',()=>{
  const html='<div class="tgme_widget_message" data-post="ne_investor/15009">'+
    '<time datetime="2026-10-16T07:54:55+00:00"></time>'+
    '<a class="tgme_widget_message_reply" href="https://t.me/ne_investor/15008">'+
    '<div class="tgme_widget_message_text">$BAT беру в шорт лесенкой</div></a>'+
    '<div class="tgme_widget_message_text js-message_text">Доброе утро. Забрали 8% движения, часть позиции закрыл, стоп в бу</div></div>';
  const rows=parsePreview(html);
  assert.equal(rows.length,1);
  assert.equal(rows[0].id,15009);
  assert.deepEqual(rows[0].references,[15008]);
  assert.match(rows[0].text,/часть позиции закрыл/);
  assert.doesNotMatch(rows[0].text,/беру в шорт/);
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
