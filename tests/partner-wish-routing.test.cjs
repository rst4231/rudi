const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const app=fs.readFileSync('public/app.js','utf8');
const profile=fs.readFileSync('public/partner-profile.js','utf8');
const {normalizeState}=require('../api/activity-journal-store.cjs');
test('journal retains the exact wish target through normalization',()=>{
 const item={id:'event',type:'wishlist',actor:'Диана',text:'Желание',targetTab:'home',targetItem:'partner-wish:gift-2',createdAt:new Date().toISOString()};
 assert.equal(normalizeState({items:[item]}).items[0].targetItem,'partner-wish:gift-2');
});
test('old wishlist links become partner profile deep links',()=>{
 const source=app.slice(app.indexOf('      function routeFromLocation(){'),app.indexOf('      function routeFreshRequested(){'));
 const ctx={URL,URLSearchParams,window:{location:{search:'?tab=wishlist&item=gift-2',href:'https://example.test/?tab=wishlist&item=gift-2'}},APP_TABS:['home'],history:{replaceState(){}}};vm.createContext(ctx);vm.runInContext(source,ctx);
 assert.equal(ctx.routeFromLocation().tab,'home');assert.equal(ctx.routeFromLocation().item,'partner-wish:gift-2');
});
for(const actor of ['Диана','Рустам'])test('open exact partner wish and retain legacy text matching: '+actor,async()=>{
 const dom=new JSDOM('<body data-app-tab="home"><section id="tile"><div class="profile-person-head"><div class="identity"><div class="person"><span id="partnerHeaderName">'+actor+'</span></div></div></div><div class="profile-person-details"></div></section></body>',{url:'https://example.test/',runScripts:'outside-only'});
 const w=dom.window;w.scrollTo=()=>{};let scrolled='';w.HTMLElement.prototype.scrollIntoView=function(){scrolled=this.dataset.rudiItemId||'section'};
 w.fetch=async()=>({ok:false,json:async()=>({})});w.RudiPartnerProfile=undefined;
 w.eval(profile);w.RudiPartnerProfile.bind(w.document.getElementById('tile'),actor,{balance:()=>0,loadWishes:async()=>[{id:'gift-1',owner:actor,text:'Первое'},{id:'gift-2',owner:actor,text:'Второе'},{id:'wrong',owner:actor==='Диана'?'Рустам':'Диана',text:'Чужое'}]});
 try{
  assert.equal(await w.RudiPartnerProfile.openWish(actor,{id:'gift-2'}),true);assert.equal(scrolled,'gift-2');
  assert.equal(w.document.querySelectorAll('.partner-wish-row').length,2);
  await w.RudiPartnerProfile.openWish(actor,{text:'Первое'});assert.equal(scrolled,'gift-1');
  await w.RudiPartnerProfile.openWish(actor,{id:'deleted'});assert.equal(scrolled,'section');
  assert.equal(w.document.querySelectorAll('.partner-profile-page').length,1);
  w.RudiPartnerProfile.close(true);assert.equal(w.document.getElementById('tile').hidden,false);
 }finally{w.close()}
});
test('wishlist data still updates counts after standalone page removal',()=>{
 const source=app.slice(app.indexOf('      function renderWishlist(payload){'),app.indexOf('      function setupWishlist(){'));
 const ctx={homeDashboardState:{},renderHomeNew(){},document:{getElementById(){return null}}};vm.createContext(ctx);vm.runInContext(source,ctx);
 ctx.renderWishlist({items:[{done:false},{done:true}]});assert.equal(ctx.homeDashboardState.wishlistCount,1);
 assert.doesNotMatch(fs.readFileSync('public/index.html','utf8'),/Наш вишлист|data-app-tab-section="wishlist"/);
});
