'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {classifyUpdate,linkUpdates}=require('../api/crypto-trade-events.cjs');
const {buildView,refreshSignals}=require('../api/crypto-signals.cjs');
const {simulateVirtual,normalizeConfig}=require('../api/crypto-virtual.cjs');
const now=Date.parse('2026-10-18T05:35:00Z');
const entry={id:15026,at:'2026-10-17T20:03:00Z',url:'https://t.me/ne_investor/15026',text:'$AVA беру в лонг, монета в хорошей фазе'};
const partial={id:15027,at:'2026-10-17T21:13:22Z',references:[15026],text:'Часть фиксирую, стоп в бу 🙂 7% чистого движения, ждем дальше'};
const closure={id:15031,at:'2026-10-18T04:58:00Z',url:'https://t.me/ne_investor/15031',text:'Доброе утро, друзья! Остатки позиции по $AVA закрыты в безубыток, получилась отличная сделка'};
const saved={status:'open',entry:0.3959,entryAt:'2026-10-17T20:15:00Z',marketPrice:0.3959,market:'linear',execution:'market-at-sync',fundingComplete:false};
function view(messages=[entry,partial,closure],results={[entry.id]:saved}){
 return buildView({messages,results,backfillComplete:true},now);
}
test('AVA reversed partial wording preserves the unknown fraction and BE update',()=>{
 assert.equal(classifyUpdate(partial)?.type,'partial-close');
 assert.equal(classifyUpdate(partial)?.closeFraction,null);
 const s={id:entry.id,at:entry.at,symbol:'AVA'};
 linkUpdates([s],[partial]);
 assert.deepEqual(s.events.map(e=>e.type),['partial-close','stop-to-breakeven']);
});
test('passive residual closure with ticker is a complete close, not a new entry',()=>{
 assert.equal(classifyUpdate(closure)?.type,'full-close');
 const v=view();assert.equal(v.signals.length,1);
 assert.equal(v.signals[0].status,'author-closed-size-unknown');
 assert.equal(v.signals[0].closedByAuthor,true);
 assert.equal(v.signals[0].openFraction,0);
 assert.equal(v.stats.open,0);
});
test('future updates and plans never close a position',()=>{
 for(const text of ['Остатки позиции по $AVA будут закрыты завтра','Позиция по $AVA не закрыта'])
  assert.equal(classifyUpdate({...closure,text}),null,text);
 const v=view([entry,{...closure,at:'2026-10-19T00:00:00Z'}]);
 assert.equal(v.signals[0].status,'open');
});
test('unpriced author closure keeps virtual history with no fabricated PNL or open position',()=>{
 const v=view(),p=simulateVirtual(v.signals,normalizeConfig({startedAt:'2026-10-17T00:00:00Z',allocationPct:5,leverage:3}),now);
 assert.equal(p.stats.total,1);assert.equal(p.stats.open,0);
 assert.equal(p.stats.closed,0);assert.equal(p.stats.authorClosedUnpriced,1);
 assert.equal(p.positions[0].entry,0.3959);
 assert.equal(p.positions[0].status,'author-closed-size-unknown');
 assert.equal(p.positions[0].pnlUsd,null);
 assert.equal(p.totalPnlUsd,null);assert.equal(p.equityUsd,null);
 assert.equal(p.cashUsd,null);assert.equal(p.dataComplete,false);
 assert.equal(p.calendar.length,0);
});
test('author close remains visible when every price request fails',async()=>{
 let state={messages:[entry,partial],results:{[entry.id]:saved},backfillComplete:true};
 const html=[entry,partial,closure].map(m=>'<div data-post="ne_investor/'+m.id+'"><time datetime="'+m.at+'"></time>'+(m.references||[]).map(id=>'<a href="https://t.me/ne_investor/'+id+'">Reply</a>').join('')+'<div class="tgme_widget_message_text">'+m.text+'</div></div>').join('');
 const v=await refreshSignals({client:{getRecord:async()=>({value:state}),setRecord:async row=>{state=row.value}},now,force:true,
  fetchImpl:async()=>({ok:true,text:async()=>html}),marketRequest:async()=>{throw Error('market-unavailable')}});
 const s=v.signals.find(x=>x.id===entry.id);
 assert.equal(s.status,'author-closed-size-unknown');assert.equal(s.entry,0.3959);
 assert.equal(s.events.at(-1).type,'full-close');
});
test('passive partial closure does not close the entire position',()=>{
 for(const text of ['Часть позиции по $AVA закрыта','Позиция $AVA частично закрыта'])
  assert.equal(classifyUpdate({...partial,text})?.type,'partial-close',text);
});
