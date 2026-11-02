const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
test('partner page hides expense and largest purchase while preserving the live expense node for restoration',()=>{
 const dom=new JSDOM('<div id="page"><div class="partner-profile-layout"><div class="profile-person-head"></div><div class="profile-person-details"><div class="home-partner-last-expense meditation-partner-summary">Секретный расход</div><div class="profile-supplement-intakes"></div></div><div class="partner-birthday"></div><div class="partner-profile-wishes"></div></div></div>');
 const document=dom.window.document,source=fs.readFileSync('public/partner-profile.js','utf8'),ctx=vm.createContext({document,MutationObserver:dom.window.MutationObserver});
 vm.runInContext(source.slice(source.indexOf(' function composePage('),source.indexOf(' function renderFinances(')),ctx);
 const page=document.querySelector('#page'),details=page.querySelector('.profile-person-details'),expense=details.querySelector('.home-partner-last-expense');
 const result=ctx.composePage(page,null,null,details),card=page.querySelector('.partner-finances');
 assert.equal(card.querySelector('.partner-finance-last,.partner-finance-largest'),null);assert.ok(expense.closest('[hidden]'));assert.equal(dom.window.getComputedStyle(expense.parentElement).display,'none');
 for(const {node,marker} of result.parts)marker.replaceWith(node);for(const group of result.groups)group.remove();result.heroObserver.disconnect();
 assert.equal(details.querySelector('.home-partner-last-expense'),expense);assert.equal(expense.closest('[hidden]'),null);dom.window.close();
});
