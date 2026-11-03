const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
function render(now,dates){
 const dom=new JSDOM('<body><div class="personal-supplements-list">'+dates.map((date,i)=>'<article class="supplement-card" data-id="s'+i+'"></article>').join('')+'</div></body>',{url:'https://rudi.test'});
 const items=dates.map((date,i)=>({id:'s'+i,name:'Course '+i,status:'active',course:{startDate:date},schedule:{time:i?'09:00':'08:00'}}));
 class FixedDate extends Date{constructor(...args){super(...(args.length?args:[now]))}}
 const ctx=vm.createContext({document:dom.window.document,window:{RudiSupplementApp:{getItems:()=>items,getActor:()=> 'Рустам'}},localStorage:dom.window.localStorage,CSS:{escape:x=>x},Date:FixedDate,Intl});
 const src=fs.readFileSync('public/supplement-advanced.js','utf8');vm.runInContext(src.slice(0,src.indexOf('async function updateCardStatus'))+'applyGrouping();})();',ctx);
 return dom;
}
test('upcoming courses are ordered by start date and only tomorrow is highlighted',()=>{
 const dom=render('2026-11-03T12:00:00Z',['2026-11-11','2026-11-18','2026-11-04']);
 assert.deepEqual([...dom.window.document.querySelectorAll('.supplement-card')].map(x=>x.dataset.id),['s2','s0','s1']);
 assert.deepEqual([...dom.window.document.querySelectorAll('.is-starting-tomorrow')].map(x=>x.dataset.id),['s2']);dom.window.close();
});
test('tomorrow follows Moscow midnight and crosses the year boundary',()=>{
 const dom=render('2026-12-30T22:00:00Z',['2027-01-02','2027-01-01']);
 assert.equal(dom.window.document.querySelector('.is-starting-tomorrow').dataset.id,'s1');dom.window.close();
});
