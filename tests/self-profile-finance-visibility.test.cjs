'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
for(const actor of ['Рустам','Диана'])test('own profile finance visibility and request scope: '+actor,async()=>{
 const tile=actor==='Рустам'?'homeRustamTile':'homeDianaTile';
 const dom=new JSDOM('<body data-rudi-actor="'+actor+'"><section id="'+tile+'"><div class="profile-person-head"><div class="identity"><span id="avatar" class="avatar">Фото</span><div class="person"><span id="displayName" class="name">'+actor+'</span></div></div></div><div class="profile-supplement-intakes">Список БАДов</div></section><section id="financeSection">Основные финансы</section></body>',{url:'https://rudi.test/',runScripts:'outside-only',pretendToBeVisual:true});
 const {window:w}=dom;let financeCalls=0;
 w.fetch=async(url,options)=>{
  const body=JSON.parse(options?.body||'{}');if(body.operation==='self-finance-summary')financeCalls++;
  return {ok:true,status:200,json:async()=>({ok:true,actor,unchanged:true,expense:null,largestPurchase:null})};
 };
 try{
  w.eval(fs.readFileSync('public/personal-center.js','utf8'));await tick();
  w.document.querySelector('#avatar').click();await tick();await tick();
  assert.equal(w.document.querySelector('#personalAICenter').hidden,false);
  assert.equal(w.document.querySelectorAll('#pcSelfProfile .pc-self-finances').length,actor==='Рустам'?0:1);
  assert.equal(financeCalls,actor==='Рустам'?0:1);
  assert.ok(w.document.querySelector('#pcSelfProfile .partner-today'));
  assert.equal(w.document.querySelector('#financeSection').textContent,'Основные финансы');
 }finally{w.close()}
});
