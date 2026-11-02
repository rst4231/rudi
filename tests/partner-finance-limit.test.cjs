const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const {partnerFinanceSummary}=require('../api/partner-finances.cjs');
function fixture(){
 const dom=new JSDOM('<section class="partner-finances"><h2>Финансы</h2></section>');
 const source=fs.readFileSync('public/partner-profile.js','utf8');
 const ctx=vm.createContext({document:dom.window.document,Intl,Date});
 vm.runInContext(source.slice(source.indexOf('function renderFinances('),source.indexOf('function birthdayInfo(')),ctx);
 return {doc:dom.window.document,render:(data,actor)=>ctx.renderFinances(dom.window.document,data,actor)};
}
for(const actor of ['Рустам','Диана'])test('partner finance shows only the exhausted-limit message for '+actor,()=>{
 const f=fixture();
 f.render({partner:actor,budget:{plannedLimit:1000,actualSpent:1000,spentPercent:100}},actor);
 const status=f.doc.querySelector('.partner-finance-limit');
 assert.ok(status);assert.equal(status.hidden,false);assert.match(status.textContent,/Лимит исчерпан/);assert.match(status.textContent,/100%/);
 assert.doesNotMatch(status.textContent,/₽|1000/);
 f.render({partner:actor,budget:{plannedLimit:1000,actualSpent:1200,spentPercent:120}},actor);
 assert.equal(status.hidden,false);
 f.render({partner:actor,budget:{plannedLimit:1000,actualSpent:999,spentPercent:99.9}},actor);
 assert.equal(status.hidden,false);assert.match(status.textContent,/Лимит не исчерпан/);assert.match(status.textContent,/99%/);assert.ok(status.querySelector('.partner-finance-track'));
 f.render({partner:actor,budget:{plannedLimit:0,actualSpent:1200,spentPercent:100}},actor);
 assert.equal(status.hidden,true);
 f.render(null,actor);assert.equal(status.hidden,true);
});
test('planned limits apply at the Moscow month boundary before partner exhaustion is rendered',()=>{
 const f=fixture(),state={categories:{'Диана':[{id:'food',monthlyLimit:1000,monthlyLimits:{'2026-11':2000}}]},personalExpenses:[{actor:'Диана',categoryId:'food',month:'2026-10',rubAmount:1000,occurredAt:'2026-10-30T12:00:00Z'},{actor:'Диана',categoryId:'food',month:'2026-11',rubAmount:1500,occurredAt:'2026-11-01T00:00:00Z'}]};
 f.render(partnerFinanceSummary(state,'Рустам',new Date('2026-10-31T20:59:59Z')),'Диана');
 assert.equal(f.doc.querySelector('.partner-finance-limit')?.hidden,false);
 f.render(partnerFinanceSummary(state,'Рустам',new Date('2026-10-31T21:00:00Z')),'Диана');
 assert.equal(f.doc.querySelector('.partner-finance-limit').hidden,false);assert.match(f.doc.querySelector('.partner-finance-limit').textContent,/75%/);
});
test('partner finance shows the limit without expense or purchase details',()=>{
 const f=fixture();
 f.render({partner:'Диана',budget:{plannedLimit:1000,actualSpent:250},expense:{amount:100,currency:'RUB',category:'Транспорт',note:'Секретный комментарий',occurredAt:'2026-11-02T12:00:00Z'}},'Диана');
 assert.doesNotMatch(f.doc.body.textContent,/Транспорт|комментарий|₽|1000|250/);assert.match(f.doc.querySelector('.partner-finance-limit').textContent,/25%/);
});
